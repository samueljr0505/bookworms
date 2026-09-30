#!/usr/bin/env python3
"""The local web server for Bookworms.

This is the same thing as `python3 -m http.server`, with one difference that
matters a lot while you are building: it tells the browser never to keep a
copy of anything. Plain http.server sends no caching instructions at all, so
browsers make their own guess - and they often hold on to an old copy of a
.js or .css file. You edit a file, reload, and see no change, which is
maddening and easy to mistake for a bug in your code.

Usage:  python3 tools/serve.py [port]
Normally you do not run this directly - ./serve.sh does it for you.
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # quieter: skip the favicon noise, keep everything else
        if "favicon.ico" in (args[0] if args else ""):
            return
        super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    # serve the project folder, whichever directory this was started from
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    server = ThreadingHTTPServer(("", port), NoCacheHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBookworms server stopped.")


if __name__ == "__main__":
    main()
