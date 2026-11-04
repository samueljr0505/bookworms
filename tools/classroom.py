"""Class races: a whole class plays Bookworms at once, each child on their own board, racing to
build the most correct sentences before the time runs out.

The teacher opens teacher.html and makes a class: a topic, Real or Silly, and a time limit. That
gives a four-letter code. Students open join.html on their own computers, type the code and
their first name, and wait. When the teacher presses Start every game counts down together;
each sentence a student finishes is sent here, and a correct one moves them up the board. When
the time is up every game stops, and the teacher has the final board - and every sentence the
class wrote, ready to print.

It also keeps what the teacher's class report is made from (js/report.js): for each sentence,
its shape (the kind of each word) and when it came; and every few seconds, from each game, the
words the worm refused and why, the words it ate, its crashes, and which quarter-minutes the
student was steering in. A sentence a student has already written this race is kept, marked as a
repeat, but scores nothing - so writing the same one over and over is no way up the board.

This file only keeps the score. It never sees a browser: tools/serve.py hands it the JSON that
came in and sends back whatever it returns, and tools/test_classroom.py drives it with a
pretend clock. Classes live in memory, so they last as long as the server is running.

Who can do what:
  - the teacher's key (handed out once, when the class is made) starts and ends the race,
    starts another one, removes players, and sees what each student wrote and did;
  - a student's seat (handed out once, when they join) reports that student's sentences and moves.
The board everybody sees shows names and scores - never keys or seats, and never how anyone
else played.
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

# what the class report is made from (see moves and js/report.js)
SLOT_MS = 15000            # steering is noted per quarter-minute: was a key pressed in it?
MAX_REFUSALS = 400         # refused words kept per player per race; any more are only counted
REFUSALS_PER_BATCH = 20    # the game sends no more than 12 at a time; this leaves room
MAX_SHAPE = 40             # words in one sentence
MAX_NEEDED = 8             # kinds of word that would have fitted
WORD_LENGTH = 24
REFUSAL_KINDS = ("order", "capital", "repeat", "clash", "sense", "deadend", "empty", "unfinished", "mark")
END_MARKS = (".", "!", "?")

TOPIC_ID = re.compile(r"^[a-z0-9-]{1,40}$")
FAMILY = re.compile(r"^[a-z][a-zA-Z-]{0,19}$")     # "noun", "preposition", "end" - see js/checker.js


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


def is_count(n, most):
    return is_whole(n) and 0 <= n <= most


def is_families(items, most):
    return isinstance(items, list) and len(items) <= most and \
        all(isinstance(f, str) and FAMILY.match(f) for f in items)


def same_sentence(a, b):
    """The same sentence, whatever the spacing or capitals. js/game.js's sameSentence must agree."""
    return " ".join(a.split()).casefold() == " ".join(b.split()).casefold()


def race_fields():
    """Everything about a player that starts again from nothing with each race."""
    return {"correct": 0, "wrong": 0, "checked": 0, "sentences": [], "reachedAt": None,
            "moves": 0, "refusals": [], "refusedMore": 0, "crashes": 0, "steers": 0,
            "slots": set(), "ate": {}, "activeAt": None}


def clean_moves(body, minutes):
    """The parts of a moves report, tidied - or None if it is not one the game would send."""
    refusals = body.get("refusals", [])
    if not isinstance(refusals, list) or len(refusals) > REFUSALS_PER_BATCH:
        return None
    kept = []
    for r in refusals:
        if not isinstance(r, dict) or r.get("kind") not in REFUSAL_KINDS or \
                not is_families([r.get("tried")], 1) or not is_families(r.get("needed", []), MAX_NEEDED):
            return None
        kept.append({"kind": r["kind"], "tried": r["tried"], "needed": r.get("needed", []),
                     "word": clean_text(r.get("word"))[:WORD_LENGTH],
                     "after": clean_text(r.get("after"))[:WORD_LENGTH]})
    ate = body.get("ate", {})
    if not isinstance(ate, dict) or len(ate) > 20 or \
            not all(is_families([f], 1) and is_count(n, 1000) for f, n in ate.items()):
        return None
    slots = body.get("slots", [])
    last_slot = minutes * 60000 // SLOT_MS
    if not isinstance(slots, list) or len(slots) > 200 or \
            not all(is_count(i, last_slot) for i in slots):
        return None
    more, crashes, steers = body.get("more", 0), body.get("crashes", 0), body.get("steers", 0)
    if not (is_count(more, 10000) and is_count(crashes, 1000) and is_count(steers, 100000)):
        return None
    return {"refusals": kept, "ate": ate, "slots": slots, "more": more, "crashes": crashes,
            "steers": steers}


class Classroom:
    def __init__(self, topics=None, clock=None):
        self.topics = set(topics) if topics else None   # the topic ids the game has
        self.clock = clock or (lambda: int(time.time() * 1000))
        self.classes = {}
        self.lock = threading.Lock()

    # ---------- what the server calls ----------

    def handle_get(self, code, params):
        """GET /api/class/<code>?teacher=<key>&me=<seat>, and &detail=1 for the class report"""
        with self.lock:
            return self.view(code, params.get("teacher"), params.get("me"), params.get("detail") == "1")

    def handle_post(self, code, action, body):
        """POST /api/class to make a class, or /api/class/<code>/<action>."""
        if not isinstance(body, dict):
            return 400, {"error": "send a JSON object"}
        with self.lock:
            if code is None:
                return self.create(body)
            act = {"join": self.join, "start": self.start, "end": self.end, "again": self.again,
                   "remove": self.remove, "sentence": self.record, "moves": self.moves}.get(action)
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
            p.update(race_fields())
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
        room["players"][seat] = dict(race_fields(), seat=seat, name=name, order=room["joins"],
                                     joinedAt=self.clock())
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
        # the shape is only for the class report: one that is not right is left out, and the
        # sentence still counts
        shape, mark = body.get("shape"), body.get("mark")
        shape = shape if is_families(shape, MAX_SHAPE) else []
        mark = mark if mark in END_MARKS else ""
        late = self.not_now(room, body, "sentence")
        if late:
            return late
        if n <= player["checked"]:
            return 200, {"correct": player["correct"]}      # already counted
        now = self.clock()
        player["checked"] = n
        player["activeAt"] = now
        ok = verdict == "correct"
        text = clean_text(body.get("text"))
        repeat = ok and bool(text) and any(s["ok"] and same_sentence(s["text"], text)
                                           for s in player["sentences"])
        if ok and not repeat:                                # a repeat is kept, but scores nothing
            player["correct"] += 1
            player["reachedAt"] = now
        elif not ok:
            player["wrong"] += 1
        if len(player["sentences"]) < MAX_SENTENCES:
            player["sentences"].append({"text": text, "ok": ok, "repeat": repeat,
                                        "at": now - room["startsAt"], "shape": shape, "mark": mark})
        return 200, {"correct": player["correct"], "repeat": repeat}

    def moves(self, room, body):
        """What a student did between sentences, sent by the game every few seconds: the words
        the worm refused and why, how many of each kind of word it ate, its crashes, how many
        times the student steered and in which quarter-minutes of the race. `n` numbers the
        reports, so one sent twice is only counted once."""
        player = room["players"].get(body.get("seat"))
        if player is None:
            return 404, {"error": "You are not in this class.", "gone": "seat"}
        n = body.get("n")
        batch = clean_moves(body, room["minutes"])
        if not is_whole(n) or n < 1 or batch is None:
            return 400, {"error": "send a number and what happened"}
        late = self.not_now(room, body, "report")
        if late:
            return late
        if n <= player["moves"]:
            return 200, {}                                   # already counted
        player["moves"] = n
        at = self.clock() - room["startsAt"]
        kept = batch["refusals"][:max(0, MAX_REFUSALS - len(player["refusals"]))]
        player["refusals"].extend(dict(r, at=at) for r in kept)
        player["refusedMore"] += batch["more"] + len(batch["refusals"]) - len(kept)
        for family, count in batch["ate"].items():
            player["ate"][family] = player["ate"].get(family, 0) + count
        player["slots"].update(batch["slots"])
        player["crashes"] += batch["crashes"]
        player["steers"] += batch["steers"]
        if batch["steers"]:
            player["activeAt"] = self.clock()
        return 200, {}

    def not_now(self, room, body, what):
        """Why a student's report cannot count right now, or None if it can."""
        if body.get("round") != room["round"]:
            return 409, {"error": "That %s was from an earlier race." % what}
        now = self.clock()
        if room["startsAt"] is None or now < room["startsAt"]:
            return 409, {"error": "The race has not started yet."}
        if now > room["endsAt"] + GRACE_MS:
            return 409, {"error": "The time is up."}
        return None

    # ---------- what everybody sees ----------

    def view(self, code, teacher=None, me=None, detail=False):
        room = self.classes.get(str(code).upper())
        if room is None:
            return 404, {"error": "There is no class with that code.", "gone": "class"}
        room["touched"] = self.clock()
        is_teacher = teacher is not None
        if is_teacher and not self.is_teacher(room, {"teacher": teacher}):
            return self.not_teacher()
        return 200, self.describe(room, teacher=is_teacher, me=me, detail=is_teacher and detail)

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

    def quiet_ms(self, room, p):
        """How long since this student last steered or finished a sentence, while the race is on."""
        if room["startsAt"] is None:
            return 0
        now = min(self.clock(), room["endsAt"])
        last = max(room["startsAt"], p["joinedAt"], p["activeAt"] or 0)
        return max(0, now - last)

    def describe(self, room, teacher=False, me=None, detail=False):
        """The class as one person sees it. The teacher sees each student's sentences too, and
        with `detail` everything the class report needs - only asked for once the race is over,
        as it is too much to send every couple of seconds.

        Everything handed back is a copy: the server turns it into JSON after the lock is let go,
        while other students may still be adding to the originals."""
        board = []
        mine = None
        for rank, p in self.ranked(room):
            row = {"name": p["name"], "correct": p["correct"], "rank": rank}
            if teacher:
                row.update(seat=p["seat"], wrong=p["wrong"], quietMs=self.quiet_ms(room, p))
                if detail:
                    row.update(sentences=list(p["sentences"]), refusals=list(p["refusals"]),
                               refusedMore=p["refusedMore"], ate=dict(p["ate"]), crashes=p["crashes"],
                               steers=p["steers"], slots=sorted(p["slots"]),
                               since=max(0, p["joinedAt"] - (room["startsAt"] or p["joinedAt"])))
                else:
                    row["sentences"] = [{"text": s["text"], "ok": s["ok"], "repeat": s["repeat"]}
                                        for s in p["sentences"]]
            if me is not None and p["seat"] == me:
                row["you"] = True
                mine = {"name": p["name"], "rank": rank, "correct": p["correct"],
                        "checked": p["checked"], "moves": p["moves"],
                        "sentences": [s["text"] for s in p["sentences"] if s["ok"] and not s["repeat"]]}
            board.append(row)
        out = {"code": room["code"], "topic": room["topic"], "mode": room["mode"],
               "minutes": room["minutes"], "round": room["round"], "state": self.state(room),
               "startsAt": room["startsAt"], "endsAt": room["endsAt"], "now": self.clock(),
               "board": board}
        if detail:
            started = room["startsAt"]
            out.update(slotMs=SLOT_MS,
                       playedMs=0 if started is None else max(0, min(self.clock(), room["endsAt"]) - started))
        if me is not None:
            out["me"] = mine          # None: this seat is not in the class (any more)
        return out

    def new_code(self):
        while True:
            code = "".join(secrets.choice(LETTERS) for _ in range(CODE_LENGTH))
            if code not in self.classes:
                return code
