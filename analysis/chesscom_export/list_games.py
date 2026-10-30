#!/usr/bin/env python3
"""Collect Magnus Carlsen master-game URLs from Chess.com."""
import argparse
import datetime
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from common import Browser, browser_args, login_if_requested


def starting_url(browser, url, page):
    if page == 1:
        return url
    # Use Chess.com's own pagination URL so player/year filters are retained.
    browser.get(url)
    browser.wait('return document.querySelector(\'table a[href*="/games/view/"]\') !== null')
    next_url = browser.js('return document.querySelector(\'a[aria-label="Next Page"]\')?.href||null')
    if not next_url:
        raise RuntimeError(f'Cannot start at page {page}: this listing has no next page')
    parts = urlsplit(next_url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query['page'] = str(page)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    browser_args(parser)
    parser.add_argument('--limit', type=int, default=100)
    parser.add_argument('--start-page', type=int, default=1, help='Listing page to start collecting from (default: 1)')
    parser.add_argument('--year', type=int, help='Filter by year and verify each PGN Date')
    parser.add_argument('--from-date', type=datetime.date.fromisoformat)
    parser.add_argument('--to-date', type=datetime.date.fromisoformat)
    parser.add_argument('--url', default='https://www.chess.com/games/magnus-carlsen')
    parser.add_argument('--out', type=Path, default=Path('exports/games.txt'))
    parser.add_argument('--delay', type=float, default=1)
    parser.add_argument('--restart', action='store_true', help='Discard the saved listing checkpoint and start over')
    args = parser.parse_args()
    if login_if_requested(args):
        return
    if args.year is not None:
        if not 1000 <= args.year <= 9998:
            parser.error('--year must be a four-digit year')
        target = args.url if '/games/search' in args.url else (
            'https://www.chess.com/games/search?opening=&openingId=&p1=Magnus+Carlsen'
            '&p2=&mr=&lsty=1&lstMoves=1&moves=&fen=&sort=')
        parts = urlsplit(target)
        query = dict(parse_qsl(parts.query, keep_blank_values=True))
        query['year'] = str(args.year)
        args.url = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
        start, end = datetime.date(args.year, 1, 1), datetime.date(args.year, 12, 31)
        args.from_date = max(args.from_date or start, start)
        args.to_date = min(args.to_date or end, end)
    if args.limit < 1 or args.start_page < 1 or args.delay < 0:
        parser.error('Limit and start page must be positive; delay must be nonnegative')
    if args.from_date and args.to_date and args.from_date > args.to_date:
        parser.error('Reversed date range')
    args.out.parent.mkdir(parents=True, exist_ok=True)
    checkpoint = args.out.with_name(args.out.name + '.state.json')
    selection = {'url': args.url, 'from_date': str(args.from_date), 'to_date': str(args.to_date),
                 'start_page': args.start_page, 'limit': args.limit}
    state = {'selection': selection, 'page_url': None, 'found': [], 'seen': [], 'completed_pages': []}
    if checkpoint.exists() and not args.restart:
        state = json.loads(checkpoint.read_text())
        if state.get('selection') != selection:
            parser.error('The saved checkpoint uses different filters. Use --restart or another --out path.')
        print(f'Resuming: {len(state["seen"])} games checked, {len(state["found"])} selected.', flush=True)
    found = state['found']
    seen = set(state['seen'])
    completed = set(state['completed_pages'])
    browser = None
    finished = False

    def save_progress():
        state['seen'] = sorted(seen)
        state['completed_pages'] = sorted(completed)
        temporary = checkpoint.with_name(checkpoint.name + '.tmp')
        temporary.write_text(json.dumps(state, ensure_ascii=False))
        temporary.replace(checkpoint)
        temporary = args.out.with_name(args.out.name + '.tmp')
        temporary.write_text(''.join(url + '\n' for url in found))
        temporary.replace(args.out)

    try:
        save_progress()
        if len(found) < args.limit and not (state['page_url'] is None and completed):
            browser = Browser(args)
            if state['page_url'] is None:
                state['page_url'] = starting_url(browser, args.url, args.start_page)
                save_progress()
        url = state['page_url']
        while url and len(found) < args.limit:
            if url in completed:
                raise RuntimeError('Pagination loop detected')
            browser.get(url)
            browser.wait('return document.querySelector(\'table a[href*="/games/view/"]\') !== null')
            page = browser.js('''return {
                links:Array.from(document.querySelectorAll('table a[href*="/games/view/"]')).map(a=>a.href),
                next:document.querySelector('a[aria-label="Next Page"]')?.href||null
            }''')
            ids = dict.fromkeys(re.search(r'/games/view/(\d+)', link).group(1) for link in page['links'])
            for gid in ids:
                if gid in seen:
                    continue
                include = True
                if args.from_date or args.to_date:
                    config = browser.game(gid)
                    match = re.search(r'\[Date "(\d{4}\.\d{2}\.\d{2})"\]', config['pgn'])
                    try:
                        date = datetime.date.fromisoformat(match[1].replace('.', '-')) if match else None
                    except ValueError:
                        date = None
                    if date is None:
                        include = False
                        print(f'Skipping game {gid}: missing or invalid exact PGN date; '
                              'cannot verify date filters.', flush=True)
                    else:
                        include = not ((args.from_date and date < args.from_date) or
                                       (args.to_date and date > args.to_date))
                if include:
                    found.append(f'https://www.chess.com/games/view/{gid}')
                # A failed or interrupted page load must retry this game on resume.
                seen.add(gid)
                save_progress()
                if len(found) >= args.limit:
                    break
            page_number = dict(parse_qsl(urlsplit(url).query)).get('page', str(args.start_page))
            print(f'Page {page_number}: selected {len(found)} games ({len(seen)} checked)', flush=True)
            completed.add(url)
            state['page_url'] = url = page['next']
            save_progress()
            time.sleep(args.delay)
        finished = True
        print(f'Saved {len(found)} game URLs to {args.out.resolve()}')
    finally:
        save_progress()
        if finished:
            checkpoint.unlink(missing_ok=True)
        else:
            print('Progress saved. Run the same command to resume, or add --restart to start over.', flush=True)
        if browser is not None:
            browser.close()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('Stopped by user.', file=sys.stderr)
        raise SystemExit(130)
    except RuntimeError as exc:
        print(f'Stopped: {exc}', file=sys.stderr)
        raise SystemExit(1)
