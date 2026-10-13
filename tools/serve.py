#!/usr/bin/env python3
"""The local web server for Bookworms.

This is the same thing as `python3 -m http.server`, with two differences.

It tells the browser never to keep a copy of anything. Plain http.server sends no
caching instructions at all, so browsers make their own guess - and they often hold on
to an old copy of a .js or .css file. You edit a file, reload, and see no change, which
is maddening and easy to mistake for a bug in your code.

And it answers the game at /api/judge, where the sentence judge (tools/judge.py) gives a
second opinion on finished sentences. The judge needs an API key, which has to stay
here on the server - it must never be sent to a browser. Without a key the game still
works and checks sentences with its own rules.

Usage:  python3 tools/serve.py [port]       (or set PORT; the default is 8000)
Normally you do not run this directly - ./serve.sh does it for you.
"""
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

try:
    from judge import Judge
except Exception as err:          # a broken judge must never stop the game being served
    print("  judge: could not load tools/judge.py (%s)" % err, file=sys.stderr)
    Judge = None

JUDGE = None


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Quieter: skip the favicon noise, keep everything else.
        # args are not always strings - log_error passes the status code as an
        # int - so coerce before searching, or this raises and kills the
        # connection thread mid-response.
        line = " ".join(str(a) for a in args)
        if "favicon.ico" in line:
            return
        super().log_message(fmt, *args)

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/api/judge":
            status = JUDGE.status() if JUDGE else {"available": False, "model": None,
                                                    "why": "tools/judge.py did not load"}
            return self.send_json(200, status)
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/judge":
            return self.send_json(404, {"error": "nothing here"})
        if JUDGE is None:
            return self.send_json(503, {"error": "no judge"})
        # A page on another site cannot send JSON here without the browser asking first,
        # and nothing here says yes - so only the game itself can ask the judge.
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            return self.send_json(415, {"error": "send JSON"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if not 0 < length <= 4096:
            return self.send_json(413, {"error": "too big"})
        try:
            body = json.loads(self.rfile.read(length))
        except ValueError:
            return self.send_json(400, {"error": "that was not JSON"})
        try:
            code, reply = JUDGE.handle(body)
        except Exception as err:       # the game falls back on its rules; say what broke
            print("  judge: unexpected error: %r" % err, file=sys.stderr)
            code, reply = 500, {"error": "the judge broke"}
        return self.send_json(code, reply)

    def send_json(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    global JUDGE
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "8000"))
    # serve the project folder, whichever directory this was started from
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if Judge is not None:
        JUDGE = Judge()          # checks the API key in the background and says how it went
        if JUDGE.client is None:
            print("  judge: off - %s." % JUDGE.why, file=sys.stderr)
            print("  judge: the game will check sentences with its own rules.", file=sys.stderr)
    server = ThreadingHTTPServer(("", port), NoCacheHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBookworms server stopped.")


if __name__ == "__main__":
    main()
