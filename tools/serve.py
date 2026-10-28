#!/usr/bin/env python3
"""The local web server for Bookworms.

This is the same thing as `python3 -m http.server`, with two differences.

It tells the browser never to keep a copy of anything. Plain http.server sends no
caching instructions at all, so browsers make their own guess - and they often hold on
to an old copy of a .js or .css file. You edit a file, reload, and see no change, which
is maddening and easy to mistake for a bug in your code.

It answers the game at /api/judge, where the sentence judge (tools/judge.py) gives a
second opinion on finished sentences. The judge needs an API key, which has to stay
here on the server - it must never be sent to a browser. Without a key the game still
works and checks sentences with its own rules.

And it keeps the score for class races at /api/class (tools/classroom.py): the teacher's
page and every student's game talk to it, so the whole class has to reach this one server.
It listens on every network card, not just this computer, so students' computers on the
same network can join - the address to give them is printed when it starts. That means
anyone on the network can reach it, so it only hands out what a browser needs to play: the
pages, css/, js/ and data/. The rest of the folder - the .git history, tools/, Docs/ -
stays on this computer.

Usage:  python3 tools/serve.py [port]       (or set PORT; the default is 8000)
Normally you do not run this directly - ./serve.sh does it for you.
"""
import json
import os
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

from classroom import Classroom

try:
    from judge import Judge
except Exception as err:          # a broken judge must never stop the game being served
    print("  judge: could not load tools/judge.py (%s)" % err, file=sys.stderr)
    Judge = None

JUDGE = None
CLASSROOM = Classroom()
PUBLIC_DIRS = ("css", "js", "data")    # with the .html pages at the top: everything the game loads
ADDRESSES = []       # how other computers on the network reach this server


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
        # every game in a class race asks for the board every couple of seconds - thirty
        # children would bury everything else, and the address carries their seats
        if " /api/class" in line:
            return
        super().log_message(fmt, *args)

    def send_head(self):
        """Serve a file (for GET and HEAD) - but only one the game itself loads. Anyone on the
        network can reach this server, and the folder it runs in also holds the git history
        and the tools. The check is on the file that would really be sent, after the address
        has been decoded and any ../ worked out, so no spelling of a path gets round it."""
        rel = os.path.relpath(self.translate_path(self.path), self.directory)
        parts = rel.split(os.sep)
        public = rel == "." or (                    # "/" - the home page
            not any(p.startswith(".") for p in parts) and
            not os.path.isdir(os.path.join(self.directory, rel)) and
            ((len(parts) == 1 and rel.endswith(".html")) or parts[0] in PUBLIC_DIRS))
        if not public:
            self.send_error(404, "File not found")
            return None
        return super().send_head()

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path == "/api/judge":
            status = JUDGE.status() if JUDGE else {"available": False, "model": None,
                                                    "why": "tools/judge.py did not load"}
            return self.send_json(200, status)
        if path == "/api/class":
            return self.send_json(200, {"addresses": ADDRESSES})
        if path.startswith("/api/class/"):
            params = {k: v[0] for k, v in parse_qs(query).items()}
            return self.send_json(*CLASSROOM.handle_get(path[len("/api/class/"):], params))
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/judge":
            if JUDGE is None:
                return self.send_json(503, {"error": "no judge"})
            ok, body = self.read_json()
            if not ok:
                return
            try:
                code, reply = JUDGE.handle(body)
            except Exception as err:       # the game falls back on its rules; say what broke
                print("  judge: unexpected error: %r" % err, file=sys.stderr)
                code, reply = 500, {"error": "the judge broke"}
            return self.send_json(code, reply)
        if path == "/api/class" or path.startswith("/api/class/"):
            # /api/class makes a class; /api/class/<code>/<action> does something in one
            rest = path[len("/api/class"):].strip("/")
            parts = rest.split("/") if rest else [None, None]
            if len(parts) != 2:
                return self.send_json(404, {"error": "nothing here"})
            ok, body = self.read_json()
            if not ok:
                return
            try:
                code, reply = CLASSROOM.handle_post(parts[0], parts[1], body)
            except Exception as err:       # say what broke rather than drop the connection
                print("  classroom: unexpected error: %r" % err, file=sys.stderr)
                code, reply = 500, {"error": "the class race broke"}
            return self.send_json(code, reply)
        return self.send_json(404, {"error": "nothing here"})

    def read_json(self):
        """(True, the JSON a page sent) - or (False, None) once an error has been sent back.
        A page on another site cannot send JSON here without the browser asking first,
        and nothing here says yes - so only Bookworms' own pages can use the API."""
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            self.send_json(415, {"error": "send JSON"})
            return False, None
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if not 0 < length <= 4096:
            self.send_json(413, {"error": "too big"})
            return False, None
        try:
            return True, json.loads(self.rfile.read(length))
        except ValueError:
            self.send_json(400, {"error": "that was not JSON"})
            return False, None

    def send_json(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def network_address():
    """This computer's address on the local network, or None. Nothing is sent: connecting a
    UDP socket only asks the computer which network card it would use to get there."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.254.254.254", 1))
            ip = s.getsockname()[0]
    except OSError:
        return None
    return None if ip.startswith("127.") or ip == "0.0.0.0" else ip


def topic_ids():
    """The topics a class race can be set to - the same ones the home page offers."""
    try:
        with open(os.path.join("data", "topics.json"), encoding="utf-8") as f:
            return [t["id"] for t in json.load(f)["topics"]]
    except (OSError, ValueError, KeyError, TypeError) as err:
        print("  classroom: could not read data/topics.json (%s)" % err, file=sys.stderr)
        return None


def main():
    global JUDGE, CLASSROOM
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "8000"))
    # serve the project folder, whichever directory this was started from
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    CLASSROOM = Classroom(topic_ids())
    ip = network_address()
    if ip:
        ADDRESSES.append("http://%s:%d" % (ip, port))
        print("  Class race? Students join at  http://%s:%d/join.html" % (ip, port), flush=True)
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
