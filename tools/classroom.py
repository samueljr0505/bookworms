"""Class races: a whole class plays Bookworms at once, each child on their own board, racing to
build the most correct sentences before the time runs out.

The teacher opens teacher.html and makes a class: a topic, Real or Silly, and a time limit. That
gives a four-letter code. Students open join.html on their own computers, type the code and
their first name, and wait. When the teacher presses Start every game counts down together;
each sentence a student finishes is sent here, and a correct one moves them up the board. When
the time is up every game stops, and the teacher has the final board - and every sentence the
class wrote, ready to print.

This file only keeps the score. It never sees a browser: tools/serve.py hands it the JSON that
came in and sends back whatever it returns, and tools/test_classroom.py drives it with a
pretend clock. Classes live in memory, so they last as long as the server is running.

Who can do what:
  - the teacher's key (handed out once, when the class is made) starts and ends the race,
    starts another one, and removes players;
  - a student's seat (handed out once, when they join) reports that student's sentences.
The board everybody sees shows names and scores - never keys or seats.
"""
import hmac
import re
import secrets
import threading
import time
import unicodedata

LETTERS = "BCDFGHJKLMNPQRSTVWXZ"   # no vowels, so a class code can never spell a word
CODE_LENGTH = 4
MODES = ("real", "silly")
MIN_MINUTES, MAX_MINUTES = 1, 30

LEAD_MS = 5000             # when the teacher presses Start, everyone gets this long to get ready
GRACE_MS = 15000           # a sentence ended just before the bell may still be being checked
NAME_LENGTH = 16
TEXT_LENGTH = 200
MAX_CLASSES = 100
MAX_PLAYERS = 60
MAX_SENTENCES = 300        # kept per player per race; any more still count, they are just not kept
IDLE_MS = 12 * 3600 * 1000  # a class nobody has looked at for this long is forgotten

TOPIC_ID = re.compile(r"^[a-z0-9-]{1,40}$")


def clean_name(raw):
    """A first name as it goes on the board: letters, digits, spaces, - ' and . only, no runs
    of spaces, and short enough to fit."""
    if not isinstance(raw, str):
        return ""
    raw = unicodedata.normalize("NFC", raw)
    kept = "".join(ch if ch.isalnum() or ch in "-'." else " " for ch in raw)
    return " ".join(kept.split())[:NAME_LENGTH].strip()


def clean_text(raw):
    if not isinstance(raw, str):
        return ""
    return " ".join(raw.split())[:TEXT_LENGTH]


def is_whole(n):
    return isinstance(n, int) and not isinstance(n, bool)


class Classroom:
    def __init__(self, topics=None, clock=None):
        self.topics = set(topics) if topics else None   # the topic ids the game has
        self.clock = clock or (lambda: int(time.time() * 1000))
        self.classes = {}
        self.lock = threading.Lock()

    # ---------- what the server calls ----------

    def handle_get(self, code, params):
        """GET /api/class/<code>?teacher=<key>&me=<seat>"""
        with self.lock:
            return self.view(code, params.get("teacher"), params.get("me"))

    def handle_post(self, code, action, body):
        """POST /api/class to make a class, or /api/class/<code>/<action>."""
        if not isinstance(body, dict):
            return 400, {"error": "send a JSON object"}
        with self.lock:
            if code is None:
                return self.create(body)
            act = {"join": self.join, "start": self.start, "end": self.end, "again": self.again,
                   "remove": self.remove, "sentence": self.record}.get(action)
            if act is None:
                return 404, {"error": "nothing here"}
            room = self.classes.get(str(code).upper())
            if room is None:
                return 404, {"error": "There is no class with that code.", "gone": "class"}
            room["touched"] = self.clock()
            return act(room, body)

    # ---------- the teacher ----------

    def create(self, body):
        settings, problem = self.settings(body, {})
        if problem:
            return 400, {"error": problem}
        now = self.clock()
        for code in [c for c, r in self.classes.items() if now - r["touched"] > IDLE_MS]:
            del self.classes[code]
        if len(self.classes) >= MAX_CLASSES:
            return 503, {"error": "There are too many classes open right now. Try again later."}
        code = self.new_code()
        key = secrets.token_urlsafe(16)
        self.classes[code] = dict(settings, code=code, teacher=key, round=1, startsAt=None,
                                  endsAt=None, touched=now, players={}, joins=0)
        return 200, {"code": code, "teacher": key}

    def start(self, room, body):
        if not self.is_teacher(room, body):
            return self.not_teacher()
        if room["startsAt"] is not None:
            return 409, {"error": "This race has already started."}
        if not room["players"]:
            return 409, {"error": "Wait until at least one student has joined."}
        room["startsAt"] = self.clock() + LEAD_MS
        room["endsAt"] = room["startsAt"] + room["minutes"] * 60000
        return 200, self.describe(room, teacher=True)

    def end(self, room, body):
        """Stop the race early. Sentences already being checked still get the grace time."""
        if not self.is_teacher(room, body):
            return self.not_teacher()
        if self.state(room) != "running":
            return 409, {"error": "The race is not running."}
        now = self.clock()
        room["endsAt"] = now
        room["startsAt"] = min(room["startsAt"], now)
        return 200, self.describe(room, teacher=True)

    def again(self, room, body):
        """A fresh race for the same class: everybody back to nought, back to waiting for Start.
        The teacher can change the topic, the mode or the time on the way."""
        if not self.is_teacher(room, body):
            return self.not_teacher()
        if self.state(room) == "running":
            return 409, {"error": "End this race first."}
        settings, problem = self.settings(body, room)
        if problem:
            return 400, {"error": problem}
        room.update(settings, round=room["round"] + 1, startsAt=None, endsAt=None)
        for p in room["players"].values():
            p.update(correct=0, wrong=0, checked=0, sentences=[], reachedAt=None)
        return 200, self.describe(room, teacher=True)

    def remove(self, room, body):
        if not self.is_teacher(room, body):
            return self.not_teacher()
        room["players"].pop(body.get("seat"), None)
        return 200, self.describe(room, teacher=True)

    def settings(self, body, current):
        topic = body.get("topic", current.get("topic"))
        mode = body.get("mode", current.get("mode", "real"))
        minutes = body.get("minutes", current.get("minutes"))
        if not isinstance(topic, str) or not TOPIC_ID.match(topic) or \
                (self.topics is not None and topic not in self.topics):
            return None, "Pick a topic."
        if mode not in MODES:
            return None, "Pick Real or Silly."
        if not is_whole(minutes) or not MIN_MINUTES <= minutes <= MAX_MINUTES:
            return None, "The race can last %d to %d minutes." % (MIN_MINUTES, MAX_MINUTES)
        return {"topic": topic, "mode": mode, "minutes": minutes}, None

    def is_teacher(self, room, body):
        key = body.get("teacher")
        return isinstance(key, str) and hmac.compare_digest(key, room["teacher"])

    @staticmethod
    def not_teacher():
        return 403, {"error": "Only the teacher who made this class can do that."}

    # ---------- the students ----------

    def join(self, room, body):
        name = clean_name(body.get("name"))
        if not name:
            return 400, {"error": "Type your first name."}
        same = [p for p in room["players"].values() if p["name"].casefold() == name.casefold()]
        # coming back to a seat you already have (a reload, or the join page again) - but only
        # with the same name, so the next child at a shared computer never lands in it
        if same and body.get("seat") == same[0]["seat"]:
            return 200, {"code": room["code"], "seat": same[0]["seat"], "name": same[0]["name"]}
        if same:
            return 409, {"error": "Someone in this class is already called %s. Add the first "
                                  "letter of your last name, like \"%s B\"."
                                  % (same[0]["name"], name[:1].upper() + name[1:])}
        if len(room["players"]) >= MAX_PLAYERS:
            return 409, {"error": "This class is full."}
        seat = secrets.token_urlsafe(12)
        room["joins"] += 1
        room["players"][seat] = {"seat": seat, "name": name, "order": room["joins"], "correct": 0,
                                 "wrong": 0, "checked": 0, "sentences": [], "reachedAt": None}
        return 200, {"code": room["code"], "seat": seat, "name": name}

    def record(self, room, body):
        """A sentence a student finished and the game checked. `n` counts the sentences this
        student has sent this race, so a report sent twice (the network dropped the answer) is
        only counted once."""
        player = room["players"].get(body.get("seat"))
        if player is None:
            return 404, {"error": "You are not in this class.", "gone": "seat"}
        verdict, n = body.get("verdict"), body.get("n")
        if verdict not in ("correct", "wrong") or not is_whole(n) or n < 1:
            return 400, {"error": "send a verdict and a number"}
        if body.get("round") != room["round"]:
            return 409, {"error": "That sentence was from an earlier race."}
        now = self.clock()
        if room["startsAt"] is None or now < room["startsAt"]:
            return 409, {"error": "The race has not started yet."}
        if now > room["endsAt"] + GRACE_MS:
            return 409, {"error": "The time is up."}
        if n <= player["checked"]:
            return 200, {"correct": player["correct"]}      # already counted
        player["checked"] = n
        ok = verdict == "correct"
        if ok:
            player["correct"] += 1
            player["reachedAt"] = now
        else:
            player["wrong"] += 1
        if len(player["sentences"]) < MAX_SENTENCES:
            player["sentences"].append({"text": clean_text(body.get("text")), "ok": ok})
        return 200, {"correct": player["correct"]}

    # ---------- what everybody sees ----------

    def view(self, code, teacher=None, me=None):
        room = self.classes.get(str(code).upper())
        if room is None:
            return 404, {"error": "There is no class with that code.", "gone": "class"}
        room["touched"] = self.clock()
        is_teacher = teacher is not None
        if is_teacher and not self.is_teacher(room, {"teacher": teacher}):
            return self.not_teacher()
        return 200, self.describe(room, teacher=is_teacher, me=me)

    def state(self, room):
        if room["startsAt"] is None:
            return "lobby"
        return "running" if self.clock() < room["endsAt"] else "over"

    def ranked(self, room):
        """Most correct sentences first; a tie goes to whoever got there first. Equal scores
        share a place, so two children on 5 are both 2nd and the next one is 4th."""
        players = sorted(room["players"].values(),
                         key=lambda p: (-p["correct"], p["reachedAt"] or 0, p["order"]))
        rank, last = 0, None
        for i, p in enumerate(players):
            if p["correct"] != last:
                rank, last = i + 1, p["correct"]
            yield rank, p

    def describe(self, room, teacher=False, me=None):
        board = []
        mine = None
        for rank, p in self.ranked(room):
            row = {"name": p["name"], "correct": p["correct"], "rank": rank}
            if teacher:
                row.update(seat=p["seat"], wrong=p["wrong"], sentences=p["sentences"])
            if me is not None and p["seat"] == me:
                row["you"] = True
                mine = {"name": p["name"], "rank": rank, "correct": p["correct"],
                        "checked": p["checked"],
                        "sentences": [s["text"] for s in p["sentences"] if s["ok"]]}
            board.append(row)
        out = {"code": room["code"], "topic": room["topic"], "mode": room["mode"],
               "minutes": room["minutes"], "round": room["round"], "state": self.state(room),
               "startsAt": room["startsAt"], "endsAt": room["endsAt"], "now": self.clock(),
               "board": board}
        if me is not None:
            out["me"] = mine          # None: this seat is not in the class (any more)
        return out

    def new_code(self):
        while True:
            code = "".join(secrets.choice(LETTERS) for _ in range(CODE_LENGTH))
            if code not in self.classes:
                return code
