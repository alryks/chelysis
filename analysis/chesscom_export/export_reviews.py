#!/usr/bin/env python3
"""Export PGNs, move classifications, and complete decoded Chess.com reviews as JSONL."""
import argparse
import asyncio
import datetime
import io
import json
import re
import sys
import time
from pathlib import Path

import chess
import chess.pgn
import websockets

from common import Browser, browser_args, login_if_requested, decode, message


def game_ids(text):
    try:
        items = json.loads(text)
        if isinstance(items, list):
            text = '\n'.join(str(x.get('id') or x.get('url')) if isinstance(x, dict) else str(x) for x in items)
    except json.JSONDecodeError:
        pass
    ids = []
    for token in re.split(r'[\s,]+', text.strip()):
        if not token:
            continue
        match = re.fullmatch(r'\d+', token) or re.search(r'(?:/games/view/|/game/master/)(\d+)(?:[/?#]|$)', token)
        if not match:
            raise ValueError(f'Expected a master-game ID or URL: {token[:100]}')
        gid = match[1] if match.lastindex else match[0]
        if gid not in ids:
            ids.append(gid)
    return ids


def parse_pgn(text):
    game = chess.pgn.read_game(io.StringIO(text))
    if game is None or game.errors:
        raise ValueError('Invalid PGN')
    if game.board().fen() != chess.Board().fen():
        raise ValueError('Only standard starting positions are supported')
    return game


def request_for(config, strength):
    game = parse_pgn(config['pgn'])
    req = message('chesscom.ceac.v2.GameReviewRequest')
    req.engine = 12  # ENGINE_TORCH_HUMAN, as selected by the website.
    req.new_game_req.new_game.settings.SetInParent()
    req.game_evaluation_options.SetInParent()
    req.request_metadata.client = 1  # CLIENT_WEB
    req.request_metadata.product = 2  # PRODUCT_GAME_REVIEW
    req.request_metadata.received_time.FromDatetime(datetime.datetime.now(datetime.timezone.utc))
    req.request_options.heartbeat_interval_seconds = 5
    req.request_options.use_progress_updates = True
    req.set_coach.text_id = 'Generic_coach'
    req.set_coach.locale = 'en-US'
    settings = req.run_search_req.game_review_search_settings
    enum = settings.DESCRIPTOR.fields_by_name['strength'].enum_type
    settings.strength = enum.values_by_name['STRENGTH_' + strength.upper()].number
    target = req.new_game_req.new_game.game
    for node in game.mainline():
        entry = target.moves.add()
        setattr(entry.move, 'from', node.move.from_square + 1)
        entry.move.to = node.move.to_square + 1
        if node.move.promotion:
            entry.move.promotion_piece_type = {chess.KNIGHT: 1, chess.BISHOP: 2, chess.ROOK: 3, chess.QUEEN: 4}[node.move.promotion]
        if node.clock() is not None:
            entry.metadata.time_remaining_ms = round(node.clock() * 1000)
    for color, prefix in [(1, 'White'), (2, 'Black')]:
        player = target.metadata.players.add()
        player.color = color
        player.name = game.headers.get(prefix, '?')
        elo = game.headers.get(prefix + 'Elo', '')
        if elo.isdigit():
            player.ratings.add().rating = int(elo)
    control = game.headers.get('TimeControl', '')
    if re.fullmatch(r'\d+(?:\+\d+)?', control):
        parts = control.split('+')
        target.metadata.time_control.base.base_ms = int(parts[0]) * 1000
        if len(parts) > 1:
            target.metadata.time_control.base.increment_ms = int(parts[1]) * 1000
    meta = target.metadata.chesscom_metadata
    meta.legacy_game_id = int(config['gameId'])
    meta.game_id = config.get('gameUuid') or ''
    enum = meta.DESCRIPTOR.fields_by_name['game_source'].enum_type
    meta.game_source = enum.values_by_name['CHESSCOM_GAME_SOURCE_MASTER'].number
    return req


def move_mapping(pgn, response):
    """Check every server move against the PGN before associating its classification."""
    game = parse_pgn(pgn)
    nodes = list(game.mainline())
    played = response['success']['game_review']['review']['played_moves'] if response else None
    if played is not None and len(nodes) != len(played):
        raise ValueError(f'PGN/review ply mismatch: {len(nodes)} vs {len(played)}')
    board = game.board()
    rows = []
    for index, node in enumerate(nodes):
        side = 'white' if board.turn else 'black'
        label = None
        if played is not None:
            entry = played[index]
            actual = entry['played_move']['move']
            squares = [chess.parse_square(actual[k].removeprefix('SQUARE_').lower()) for k in ('from', 'to')]
            if squares != [node.move.from_square, node.move.to_square]:
                raise ValueError(f'Response move does not match PGN at ply {index + 1}')
            promotion = actual.get('promotion_piece_type')
            expected = chess.piece_name(node.move.promotion).upper() if node.move.promotion else None
            if (expected and not str(promotion).endswith(expected)) or (not expected and promotion):
                raise ValueError(f'Promotion mismatch at ply {index + 1}')
            if entry.get('moved_color') != 'COLOR_' + side.upper():
                raise ValueError(f'Side mismatch at ply {index + 1}')
            label = entry['played_move'].get('move_classification')
            if not label:
                raise ValueError(f'Missing classification at ply {index + 1}')
            label = label.removeprefix('MOVE_CLASSIFICATION_')
        rows.append({'ply': index + 1, 'side': side, 'san': board.san(node.move),
                     'uci': node.move.uci(), 'classification': label})
        board.push(node.move)
    return rows


class ReviewFailure(RuntimeError):
    def __init__(self, response):
        self.response = response
        super().__init__('Server review failure: ' + json.dumps(response['failure']))


async def retrieve(req, cookie, timeout):
    # Binary is used only on the wire. No response bytes or base64 are saved.
    async with websockets.connect('wss://analysis.chess.com/v2/game-review',
            origin='https://www.chess.com', additional_headers={'Cookie': cookie},
            max_size=64 * 1024 * 1024, open_timeout=20, close_timeout=5) as ws:
        await ws.send(req.SerializeToString())
        async with asyncio.timeout(timeout):
            async for raw in ws:
                if isinstance(raw, str):
                    raise RuntimeError('Unexpected text response from review service')
                decoded, data = decode(raw)
                kind = decoded.WhichOneof('result')
                if kind == 'failure':
                    raise ReviewFailure(data)
                if kind == 'success':
                    return data
    raise RuntimeError('Review connection closed without a result')


def read_records(path):
    records = {}
    if path.exists():
        for number, line in enumerate(path.read_text().splitlines(), 1):
            if line.strip():
                try:
                    record = json.loads(line)
                    records[record['game_id']] = record
                except (ValueError, KeyError) as exc:
                    raise ValueError(f'Invalid JSONL record at line {number}') from exc
    return records


def write_records(path, records):
    """Replace atomically so an interrupted run cannot leave half a JSON record."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    with temporary.open('w', encoding='utf-8') as stream:
        for record in records.values():
            stream.write(json.dumps(record, ensure_ascii=False, separators=(',', ':')) + '\n')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    browser_args(parser)
    parser.add_argument('games', nargs='*', help='Master-game IDs or URLs')
    parser.add_argument('--input', type=Path, help='URL/ID list; use - for stdin')
    parser.add_argument('--out', type=Path, default=Path('exports/reviews.jsonl'))
    parser.add_argument('--strength', choices=['auto', 'fast', 'standard', 'deep', 'maximum'], default='auto',
                        help='auto tries strengths from fastest to slowest (default)')
    parser.add_argument('--retry-skipped', action='store_true',
                        help='Retry games previously skipped because requested strengths were denied')
    parser.add_argument('--timeout', type=int, default=240)
    parser.add_argument('--delay', type=float, default=2)
    parser.add_argument('--retries', type=int, default=2)
    args = parser.parse_args()
    if login_if_requested(args):
        return
    if args.delay < 0 or args.timeout <= 0 or args.retries < 0:
        parser.error('Delay/retries must be nonnegative and timeout must be positive')
    text = '\n'.join(args.games)
    if args.input:
        text += '\n' + (sys.stdin.read() if str(args.input) == '-' else args.input.read_text())
    if not text.strip():
        parser.error('Provide IDs, URLs, or --input FILE')
    ids = game_ids(text)
    records = read_records(args.out)
    browser = None
    failures = 0
    try:
        for index, gid in enumerate(ids, 1):
            previous = records.get(gid, {})
            if previous.get('status') == 'success' and (args.strength == 'auto' or previous.get('strength') == args.strength):
                print(f'[{index}/{len(ids)}] {gid}: already exported', flush=True)
                continue
            if previous.get('status') == 'skipped' and not args.retry_skipped:
                print(f'[{index}/{len(ids)}] {gid}: previously skipped; no review requested', flush=True)
                continue
            record = {'game_id': gid, 'url': f'https://www.chess.com/games/view/{gid}',
                      'requested_strength': args.strength, 'strength': None, 'attempts': [], 'status': 'error', 'pgn': None, 'response': None, 'moves': []}
            try:
                if browser is None:
                    browser = Browser(args)
                config = browser.game(gid)
                if str(config['gameId']) != gid:
                    raise ValueError('Browser loaded a different game')
                record['pgn'] = config['pgn']
                record['moves'] = move_mapping(config['pgn'], None)
                cookie = browser.cookie_header()
                if not cookie:
                    raise RuntimeError('No Chess.com session available; run python list_games.py --login first')
                strengths = ['fast', 'standard', 'deep', 'maximum'] if args.strength == 'auto' else [args.strength]
                for strength in strengths:
                    req = request_for(config, strength)
                    trial = {'strength': strength}
                    record['attempts'].append(trial)
                    try:
                        for attempt in range(args.retries + 1):
                            try:
                                record['response'] = asyncio.run(retrieve(req, cookie, args.timeout))
                                break
                            except Exception as exc:
                                if any(word in str(exc).lower() for word in ('auth', 'upgrade', 'quota', 'limit')) or attempt == args.retries:
                                    raise
                                time.sleep(min(30, 2 ** (attempt + 1)))
                    except Exception as exc:
                        trial['error'] = str(exc)
                        if isinstance(exc, ReviewFailure):
                            trial['response'] = exc.response
                        reason = str(exc).lower()
                        if 'authorization failed' in reason and not any(word in reason for word in ('authentication failed', 'quota', 'upgrade', 'limit')):
                            trial['status'] = 'unavailable'
                            print(f'[{index}/{len(ids)}] {gid}: {strength} unavailable', flush=True)
                            continue
                        trial['status'] = 'error'
                        raise
                    record['strength'] = strength
                    record['moves'] = move_mapping(record['pgn'], record['response'])
                    trial['status'] = 'success'
                    record['status'] = 'success'
                    print(f'[{index}/{len(ids)}] {gid}: {len(record["moves"])} classified plies ({strength})', flush=True)
                    break
                else:
                    record['status'] = 'skipped'
                    record['error'] = 'No requested strength available: authorization denied'
                    print(f'[{index}/{len(ids)}] {gid}: skipped; no requested strength available', flush=True)
            except Exception as exc:
                failures += 1
                record['error'] = str(exc)
                if isinstance(exc, ReviewFailure):
                    record['response'] = exc.response
                print(f'[{index}/{len(ids)}] {gid}: FAILED: {exc}', file=sys.stderr, flush=True)
            record['exported_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            # Preserve an earlier successful result if a different-strength request fails.
            if previous.get('status') != 'success' or record['status'] == 'success':
                records[gid] = record
                write_records(args.out, records)
            reason = record.get('error', '').lower()
            # A game-specific authorization denial must not hide other cached reviews.
            if any(word in reason for word in ('authentication failed', 'quota', 'upgrade', 'limit')):
                break
            time.sleep(args.delay)
    finally:
        if browser is not None:
            browser.close()
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
