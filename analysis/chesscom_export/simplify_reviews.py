#!/usr/bin/env python3
"""Convert reviews.jsonl to a JSON array of games and per-color phase reports.

Defaults are exports/reviews.jsonl and exports/reviews.json beside this script.
Games without a successful review are excluded.
"""

import argparse
import json
from pathlib import Path
import tempfile


def simplify(record):
    highlights = ((record.get('response') or {}).get('success', {})
                  .get('game_review', {}).get('highlights', {}))
    players = {}
    for color in ('white', 'black'):
        report = highlights.get('report_card', {}).get(color, {})
        players[color] = {
            'accuracy': highlights.get('accuracy', {}).get(color),
            'effective_rating': report.get('effective_rating'),
            'phases': [
                {
                    'phase': phase['phase'].removeprefix('GAME_PHASE_').lower(),
                    'accuracy': phase.get('accuracy'),
                    'classification': phase.get('accuracy_glyph', '')
                        .removeprefix('MOVE_CLASSIFICATION_') or None,
                }
                for phase in report.get('reports_by_phase', [])
            ],
        }
    return {
        'game_id': record['game_id'],
        'pgn': record['pgn'],
        'players': players,
        'moves': [{key: value for key, value in move.items() if key != 'ply'}
                  for move in record['moves']],
    }


def convert(source, destination):
    """Stream input records and replace the output only after a complete conversion."""
    if source.resolve() == destination.resolve():
        raise ValueError('Input and output paths must differ')
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    count = 0
    try:
        with source.open(encoding='utf-8') as incoming, tempfile.NamedTemporaryFile(
            mode='w', encoding='utf-8', dir=destination.parent,
            prefix=destination.name + '.', suffix='.tmp', delete=False,
        ) as outgoing:
            temporary = Path(outgoing.name)
            outgoing.write('[\n')
            for number, line in enumerate(incoming, 1):
                if not line.strip():
                    continue
                try:
                    record = json.loads(line)
                    if record.get('status') != 'success':
                        continue
                    game = simplify(record)
                except (ValueError, KeyError, TypeError, AttributeError) as exc:
                    raise ValueError(f'{source}: invalid record at line {number}: {exc}') from exc
                if count:
                    outgoing.write(',\n')
                outgoing.write(json.dumps(game, ensure_ascii=False, indent=2))
                count += 1
            outgoing.write('\n]\n')
        temporary.replace(destination)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return count


def main():
    exports = Path(__file__).resolve().parent / 'exports'
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', nargs='?', type=Path, default=exports / 'reviews.jsonl')
    parser.add_argument('--out', type=Path, default=exports / 'reviews.json')
    args = parser.parse_args()
    try:
        count = convert(args.input, args.out)
    except (OSError, ValueError) as exc:
        parser.exit(1, f'{exc}\n')
    print(f'Wrote {count} games to {args.out}')


if __name__ == '__main__':
    main()
