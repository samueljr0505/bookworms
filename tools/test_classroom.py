#!/usr/bin/env python3
"""Checks for class races on the server side (tools/classroom.py). Run with:

    python3 tools/test_classroom.py

The clock is a pretend one that only moves when a test says so, so a five-minute race takes no
time at all. The last test starts the real server and plays a short race over HTTP.
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import classroom  # noqa: E402
import serve  # noqa: E402

# Plays cloudflared for the tests: says a link, as the real one does, and opens nothing.
FAKE_CLOUDFLARED = """#!/usr/bin/env python3
import sys, time
sys.stderr.write("INF Requesting new quick Tunnel on trycloudflare.com...\\n")
sys.stderr.write("INF talking to https://api.trycloudflare.com/tunnel\\n")
sys.stderr.write("INF |  https://happy-test-words.trycloudflare.com  |\\n")
sys.stderr.flush()
time.sleep(60)
"""


class Clock:
    def __init__(self):
        self.ms = 1_000_000

    def __call__(self):
        return self.ms

    def wait(self, ms):
        self.ms += ms


class ClassroomTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.room = classroom.Classroom(["animals", "food"], clock=self.clock)
        code, made = self.post(None, None, {"topic": "animals", "mode": "real", "minutes": 3})
        self.assertEqual(code, 200)
        self.code, self.key = made["code"], made["teacher"]

    def post(self, code, action, body):
        return self.room.handle_post(code, action, body)

    def teacher(self, action, **body):
        return self.post(self.code, action, dict(body, teacher=self.key))

    def join(self, name, **body):
        code, reply = self.post(self.code, "join", dict(body, name=name))
        self.assertEqual(code, 200, reply)
        return reply["seat"]

    def say(self, seat, n, verdict="correct", text="The dog ran.", rnd=1):
        return self.post(self.code, "sentence",
                         {"seat": seat, "n": n, "verdict": verdict, "text": text, "round": rnd})

    def board(self, **params):
        code, view = self.room.handle_get(self.code, params)
        self.assertEqual(code, 200, view)
        return view

    def start(self):
        code, view = self.teacher("start")
        self.assertEqual(code, 200, view)
        self.clock.wait(classroom.LEAD_MS)

    def test_codes_cannot_spell_words(self):
        self.assertEqual(len(self.code), classroom.CODE_LENGTH)
        self.assertTrue(all(ch in classroom.LETTERS for ch in self.code))
        self.assertFalse(set("AEIOUY") & set(classroom.LETTERS))

    def test_settings_are_checked(self):
        for body in [{"topic": "space", "mode": "real", "minutes": 3},
                     {"topic": "animals", "mode": "odd", "minutes": 3},
                     {"topic": "animals", "mode": "real", "minutes": 0},
                     {"topic": "animals", "mode": "real", "minutes": 31},
                     {"topic": "animals", "mode": "real", "minutes": True},
                     {"topic": "animals", "mode": "real", "minutes": "5"}]:
            self.assertEqual(self.post(None, None, body)[0], 400, body)

    def test_names_are_tidied_and_unique(self):
        self.assertEqual(classroom.clean_name("  Sam   <b>Lee</b> "), "Sam b Lee b")
        self.assertEqual(classroom.clean_name("José-María O'Neil"), "José-María O'Nei")
        self.assertEqual(classroom.clean_name("😀"), "")
        self.join("Sam")
        code, reply = self.post(self.code, "join", {"name": "sam"})
        self.assertEqual(code, 409)
        self.assertIn("already called Sam.", reply["error"])
        self.assertIn('"Sam B"', reply["error"])
        self.assertEqual(self.post(self.code, "join", {"name": "  "})[0], 400)
        self.assertEqual(self.post("ZZZZ", "join", {"name": "Ana"})[0], 404)

    def test_coming_back_keeps_your_seat_but_only_under_your_name(self):
        seat = self.join("Sam")
        self.assertEqual(self.join("Sam", seat=seat), seat)        # reloaded the page
        self.assertNotEqual(self.join("Ana", seat=seat), seat)     # next child at that computer

    def test_the_board_shows_names_never_seats_or_keys(self):
        seat = self.join("Sam")
        view = self.board()
        text = json.dumps(view)
        self.assertNotIn(seat, text)
        self.assertNotIn(self.key, text)
        self.assertEqual(view["board"], [{"name": "Sam", "correct": 0, "rank": 1}])
        self.assertNotIn("me", view)
        mine = self.board(me=seat)
        self.assertTrue(mine["board"][0]["you"])
        self.assertEqual(mine["me"]["name"], "Sam")
        self.assertIsNone(self.board(me="not-a-seat")["me"])

    def test_only_the_teacher_runs_the_race(self):
        self.join("Sam")
        for action in ("start", "end", "again", "remove"):
            self.assertEqual(self.post(self.code, action, {"teacher": "guess"})[0], 403, action)
            self.assertEqual(self.post(self.code, action, {})[0], 403, action)
        self.assertEqual(self.room.handle_get(self.code, {"teacher": "guess"})[0], 403)
        view = self.board(teacher=self.key)
        self.assertIn("seat", view["board"][0])

    def test_nobody_scores_before_the_start_or_after_the_bell(self):
        sam = self.join("Sam")
        self.assertEqual(self.say(sam, 1)[0], 409)                  # lobby
        self.assertEqual(self.teacher("start")[1]["state"], "running")
        self.assertEqual(self.say(sam, 1)[0], 409)                  # still counting down
        self.clock.wait(classroom.LEAD_MS)
        self.assertEqual(self.say(sam, 1)[0], 200)
        self.clock.wait(3 * 60000)
        self.assertEqual(self.board()["state"], "over")
        self.assertEqual(self.say(sam, 2)[0], 200)                  # checked as the bell went
        self.clock.wait(classroom.GRACE_MS + 1)
        self.assertEqual(self.say(sam, 3)[0], 409)                  # too late
        self.assertEqual(self.board()["board"][0]["correct"], 2)

    def test_a_sentence_sent_twice_counts_once(self):
        sam = self.join("Sam")
        self.start()
        self.say(sam, 1)
        self.say(sam, 1)
        self.say(sam, 2, "wrong", "The dog ate the moon.")
        self.say(sam, 2, "wrong", "The dog ate the moon.")
        view = self.board(teacher=self.key)
        row = view["board"][0]
        self.assertEqual((row["correct"], row["wrong"], len(row["sentences"])), (1, 1, 2))
        self.assertEqual(row["sentences"][1], {"text": "The dog ate the moon.", "ok": False})
        self.assertEqual(self.board(me=sam)["me"]["checked"], 2)

    def test_most_correct_first_and_ties_go_to_whoever_got_there_first(self):
        ana, ben, cal, dee = (self.join(n) for n in ("Ana", "Ben", "Cal", "Dee"))
        self.start()
        self.say(ben, 1)
        self.clock.wait(1000)
        self.say(cal, 1)
        self.clock.wait(1000)
        self.say(ana, 1)
        self.say(ana, 2, "wrong")                 # a wrong one never costs a place
        self.clock.wait(1000)
        self.say(cal, 2)
        board = self.board()["board"]
        self.assertEqual([(r["name"], r["correct"], r["rank"]) for r in board],
                         [("Cal", 2, 1), ("Ben", 1, 2), ("Ana", 1, 2), ("Dee", 0, 4)])

    def test_ending_early_and_racing_again(self):
        sam = self.join("Sam")
        self.start()
        self.say(sam, 1)
        self.assertEqual(self.teacher("again")[0], 409)            # not while it is running
        self.assertEqual(self.teacher("end")[1]["state"], "over")
        self.assertEqual(self.teacher("end")[0], 409)
        code, view = self.teacher("again", topic="food", minutes=5)
        self.assertEqual(code, 200)
        self.assertEqual((view["state"], view["round"], view["topic"], view["mode"], view["minutes"]),
                         ("lobby", 2, "food", "real", 5))
        self.assertEqual(view["board"][0]["correct"], 0)
        self.assertEqual(self.board(me=sam)["me"]["checked"], 0)
        self.start()
        self.assertEqual(self.say(sam, 2, rnd=1)[0], 409)          # a stale page from race 1
        self.assertEqual(self.say(sam, 1, rnd=2)[0], 200)

    def test_cannot_start_an_empty_class(self):
        self.assertEqual(self.teacher("start")[0], 409)

    def test_the_teacher_can_remove_a_player(self):
        sam = self.join("Sam")
        self.teacher("remove", seat=sam)
        self.assertEqual(self.board()["board"], [])
        self.assertIsNone(self.board(me=sam)["me"])
        self.join("Ana")
        self.start()
        code, reply = self.say(sam, 1)
        self.assertEqual((code, reply.get("gone")), (404, "seat"))

    def test_sentences_are_kept_short(self):
        sam = self.join("Sam")
        self.start()
        self.say(sam, 1, text="word " * 200)
        text = self.board(teacher=self.key)["board"][0]["sentences"][0]["text"]
        self.assertLessEqual(len(text), classroom.TEXT_LENGTH)

    def test_quiet_classes_are_forgotten(self):
        self.clock.wait(classroom.IDLE_MS + 1)
        self.post(None, None, {"topic": "food", "mode": "silly", "minutes": 2})
        self.assertEqual(self.room.handle_get(self.code, {})[0], 404)

    def test_odd_requests_are_refused_politely(self):
        self.assertEqual(self.post(self.code, "fly", {})[0], 404)
        self.assertEqual(self.post(self.code, "join", ["Sam"])[0], 400)
        sam = self.join("Sam")
        self.start()
        for body in [{"seat": sam, "n": 1, "verdict": "maybe", "round": 1},
                     {"seat": sam, "n": 0, "verdict": "correct", "round": 1},
                     {"seat": sam, "n": "1", "verdict": "correct", "round": 1}]:
            self.assertEqual(self.post(self.code, "sentence", body)[0], 400, body)


class LinkTests(unittest.TestCase):
    def test_the_link_is_read_from_what_cloudflared_says(self):
        self.assertEqual(serve.tunnel_url("INF |  https://red-fox-blue-sky.trycloudflare.com  |"),
                         "https://red-fox-blue-sky.trycloudflare.com")
        self.assertIsNone(serve.tunnel_url('ERR failed to request: Post "https://api.trycloudflare.com/tunnel"'))
        self.assertIsNone(serve.tunnel_url("INF Starting tunnel"))

    def test_no_cloudflared_means_no_link(self):
        link = serve.PublicLink(8000, "no-such-program-anywhere")
        link.open()
        self.assertEqual(link.status()["state"], "unavailable")


class ServerTests(unittest.TestCase):
    """The real server, started the way serve.sh starts it - with a stand-in for cloudflared."""

    def setUp(self):
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            self.port = s.getsockname()[1]
        self.dir = tempfile.mkdtemp()
        fake = os.path.join(self.dir, "cloudflared")
        with open(fake, "w") as f:
            f.write(FAKE_CLOUDFLARED)
        os.chmod(fake, 0o755)
        env = {k: v for k, v in os.environ.items() if not k.startswith("ANTHROPIC_")}
        env["BOOKWORMS_CLOUDFLARED"] = fake
        self.proc = subprocess.Popen([sys.executable, os.path.join(HERE, "serve.py"), str(self.port)],
                                     env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                urllib.request.urlopen("http://127.0.0.1:%d/api/link" % self.port)
                return
            except OSError:
                time.sleep(0.1)

    def tearDown(self):
        self.proc.terminate()
        self.proc.wait()
        shutil.rmtree(self.dir)

    def link(self, body=None, headers=None):
        req = urllib.request.Request("http://127.0.0.1:%d/api/link" % self.port,
                                     data=None if body is None else json.dumps(body).encode(),
                                     headers=dict({"Content-Type": "application/json"}, **(headers or {})))
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as err:
            return err.code, json.load(err)

    def test_only_this_computer_can_reach_the_server(self):
        # everyone else comes in through the link - not over the network
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            try:
                s.connect(("10.254.254.254", 1))       # sends nothing: just picks a network card
                ip = s.getsockname()[0]
            except OSError:
                self.skipTest("this computer is not on a network")
        if ip.startswith("127."):
            self.skipTest("this computer is not on a network")
        with self.assertRaises(OSError):
            socket.create_connection((ip, self.port), timeout=2).close()

    def test_the_link_on_its_own_opens_the_join_page(self):
        class Stay(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args):
                return None
        opener = urllib.request.build_opener(Stay)
        req = urllib.request.Request("http://127.0.0.1:%d/" % self.port, headers={"Cf-Ray": "abc123"})
        with self.assertRaises(urllib.error.HTTPError) as caught:
            opener.open(req)
        self.assertEqual((caught.exception.code, caught.exception.headers["Location"]), (302, "join.html"))
        with urllib.request.urlopen("http://127.0.0.1:%d/" % self.port) as r:   # the teacher: home
            self.assertIn("Bookworms", r.read().decode())

    def test_only_this_computer_can_open_the_link(self):
        status, info = self.link()
        self.assertEqual((status, info["state"], info["canControl"]), (200, "off", True))
        # anyone using the link arrives through cloudflared, which runs here - Cloudflare's
        # headers give them away
        for header in ("Cf-Connecting-Ip", "Cf-Ray", "X-Forwarded-For"):
            status, info = self.link(headers={header: "203.0.113.9"})
            self.assertFalse(info["canControl"], header)
            self.assertEqual(self.link({"open": True}, {header: "203.0.113.9"})[0], 403, header)
        self.assertEqual(self.link()[1]["state"], "off")

    def test_making_and_closing_the_link(self):
        self.assertEqual(self.link({"open": "yes"})[0], 400)
        status, info = self.link({"open": True})
        self.assertEqual(status, 200)
        self.assertIn(info["state"], ("starting", "on"))
        for _ in range(50):
            info = self.link()[1]
            if info["state"] == "on":
                break
            time.sleep(0.1)
        self.assertEqual((info["state"], info["url"]), ("on", "https://happy-test-words.trycloudflare.com"))
        status, info = self.link({"open": False})
        self.assertEqual((status, info["state"], info["url"]), (200, "off", None))

    def test_only_what_the_game_loads_is_handed_out(self):
        def status(path, method="GET"):
            req = urllib.request.Request("http://127.0.0.1:%d/%s" % (self.port, path), method=method)
            try:
                with urllib.request.urlopen(req) as r:
                    return r.status
            except urllib.error.HTTPError as err:
                return err.code
        for path in ["", "index.html", "game.html", "teacher.html", "join.html", "js/race.js",
                     "css/style.css", "data/topics.json", "data/topics/animals.json"]:
            self.assertEqual(status(path), 200, path)
        for path in [".git/config", ".git/HEAD", ".gitignore", ".claude/launch.json",
                     "tools/serve.py", "tools/classroom.py", "Docs/Requirements.md", "README.md",
                     "serve.sh", "requirements.txt", "js/", "data/topics/",
                     "css/../.git/config", "js/%2e%2e/.git/config", "%2egit/config",
                     "js/../tools/judge.py", "no-such-page.html"]:
            self.assertEqual(status(path), 404, path)
        self.assertEqual(status(".git/config", "HEAD"), 404)

    def test_a_race_over_http(self):
        """A teacher makes a class, a student joins and scores, and nobody else can start it."""
        port = self.port
        base = "http://127.0.0.1:%d/api/class" % port

        def call(path, body=None, kind="application/json"):
            data = None if body is None else json.dumps(body).encode()
            req = urllib.request.Request(base + path, data=data, headers={"Content-Type": kind})
            try:
                with urllib.request.urlopen(req) as r:
                    return r.status, json.load(r)
            except urllib.error.HTTPError as err:
                return err.code, json.load(err)

        self.assertEqual(call("", {"topic": "space", "mode": "real", "minutes": 2})[0], 400)
        status, made = call("", {"topic": "animals", "mode": "real", "minutes": 2})
        self.assertEqual(status, 200)
        code = made["code"]
        self.assertEqual(call("/%s/join" % code, {"name": "Sam"}, "text/plain")[0], 415)
        status, joined = call("/%s/join" % code, {"name": "Sam"})
        self.assertEqual(status, 200)
        self.assertEqual(call("/%s/start" % code, {})[0], 403)
        status, view = call("/%s/start" % code, {"teacher": made["teacher"]})
        self.assertEqual((status, view["state"]), (200, "running"))
        status, view = call("/%s?me=%s" % (code.lower(), joined["seat"]))
        self.assertEqual((status, view["me"]["name"]), (200, "Sam"))
        self.assertEqual(call("/%s/extra/bits" % code, {})[0], 404)
        for raw, status in ((b"", 413), (b"null", 400), (b"{oops", 400)):
            req = urllib.request.Request(base + "/%s/join" % code, data=raw, method="POST",
                                         headers={"Content-Type": "application/json"})
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(req)
            self.assertEqual(caught.exception.code, status, raw)   # answered, never dropped


if __name__ == "__main__":
    unittest.main(verbosity=1)
