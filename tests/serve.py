#!/usr/bin/env python3
"""Threaded static server for the smoke tests.

http.server's default is single-threaded, and the service worker adds a second
wave of requests on top of the page's own. With one thread those queue behind
each other, a fetch times out, and a test fails for a reason that has nothing to
do with the app.
"""

import sys
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs


class Handler(SimpleHTTPRequestHandler):
    # Without an explicit charset the browser guesses, and guesses Latin-1 - every
    # Hebrew string on the page then renders as mojibake.
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.webmanifest': 'application/manifest+json; charset=utf-8',
    }

    def do_GET(self):
        # ?slow=N holds the response for N seconds. A site with no signal is the easy
        # case; the one worth testing is a signal that is connected and going nowhere,
        # and only a real slow response exercises the service worker's deadline.
        query = parse_qs(urlparse(self.path).query)
        delay = query.get('slow', [None])[0]
        if delay:
            time.sleep(min(float(delay), 30))
        super().do_GET()

    def end_headers(self):
        # Never let the browser cache during a test run; the service worker is the
        # only caching layer under test.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8802
    root = sys.argv[2] if len(sys.argv) > 2 else '.'
    server = ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=root))
    print(f'serving {root} on http://127.0.0.1:{port}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
