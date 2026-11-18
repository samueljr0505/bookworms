"""Word parties: a class game in rounds, where the students' own words become the board.

A round goes like this (the teacher's page, party-teacher.html, moves it along):

  1. writing   The teacher puts up a prompt ("Who came to lunch today?"). Each student fills in a
               sentence frame on their own computer (party.html):
                   The [Adjective] [Noun] [Verb] the [Noun] [Adverb].
               The second Noun and the Adverb are optional. Every word is typed into a box that
               says what kind of word goes there, so each word arrives already labelled.
  2. (review)  While they write, the teacher approves each answer or sends it back, and can
               strike out a single word. A student whose answer was sent back can change it and
               send it again.
  3. building  The approved words are chopped up into the class word bank. The teacher puts up a
               new prompt and every student plays the snake game (game.html?party=CODE) on a
               board of the class's words, building sentences that answer it. The grammar is
               the topic's Silly mode, so the worm still only eats a word that fits.
  4. voting    Each student's best sentence goes up without names. Everyone votes for their
               favourite on their own computer - but not for their own.
  5. results   The votes are counted, the names come out, and every vote is a point.
               Then a new round (new words), or another build with the same words.

Like tools/classroom.py this file only keeps the state. tools/serve.py hands it JSON and sends
back whatever it returns, and tools/test_party.py drives it with a pretend clock.

Who can do what:
  - the teacher's key (handed out once, when the party is made) moves the game along, reviews
    answers, removes players, and sees who wrote what;
  - a student's seat (handed out once, when they join) sends that student's words, sentences
    and vote.
Students never see who wrote which words, and only see who wrote which sentence once the
votes are in. Every word a student sees on the class screen was approved by the teacher, or
is one of the topic's own words: a sentence with any other word in it is turned down.
"""
import hmac
import json
import os
import random
import re
import secrets
import threading
import time

from classroom import clean_name, clean_text, is_whole, same_sentence

LETTERS = "BCDFGHJKLMNPQRSTVWXZ"   # no vowels, so a code can never spell a word
CODE_LENGTH = 4
PHASES = ("lobby", "writing", "building", "voting", "results")
MIN_MINUTES, MAX_MINUTES = 1, 10
LEAD_MS = 5000
GRACE_MS = 15000
PROMPT_LENGTH = 120
MAX_PARTIES = 100
MAX_PLAYERS = 60
MAX_SENTENCES = 100
IDLE_MS = 12 * 3600 * 1000

# The sentence frame. Each box says which list in the word bank its word goes to; the Verb goes
# to "take" (it does something to the second Noun) or "move" (it is on its own), depending on
# whether the second Noun was filled in. js/party.js has the same frame for the page.
FIELDS = ("adjective", "noun", "verb", "object", "adverb")
REQUIRED = ("adjective", "noun", "verb")
BANK_LISTS = ("adjective", "noun", "move", "take", "adverb")
WORD = re.compile(r"^[a-z][a-z'-]{0,15}$")
WORDS_IN = re.compile(r"[A-Za-z][A-Za-z'-]*")


def clean_word(raw):
    """A word as a student typed it, lower case and trimmed - or "" if it is not one word."""
    if not isinstance(raw, str):
        return ""
    word = raw.strip().lower()
    return word if WORD.match(word) else ""


def clean_prompt(raw):
    return " ".join(raw.split())[:PROMPT_LENGTH] if isinstance(raw, str) else ""


def topic_vocab(topic_file):
    """Every word a topic's Silly mode can put on the board, lower case. The party board tops up
    a thin word bank from these, and uses its little words (the, into, him) as they are."""
    with open(topic_file, encoding="utf-8") as f:
        pack = json.load(f)
    lists = (pack.get("silly") or pack)["words"]
    return {w.lower() for words in lists.values() for w in words} | {"an"}


def load_vocab(root="."):
    """topic id -> its words, for every topic in data/topics.json."""
    with open(os.path.join(root, "data", "topics.json"), encoding="utf-8") as f:
        index = json.load(f)
    return {t["id"]: topic_vocab(os.path.join(root, "data", t["file"])) for t in index["topics"]}


def round_fields():
    """Everything about a player that starts again with each new set of words."""
    return {"card": None}


def build_fields():
    """Everything about a player that starts again with each build."""
    return {"sentences": [], "checked": 0, "picked": None, "vote": None}


class WordParty:
    def __init__(self, vocab=None, clock=None, taken=None):
        """vocab: topic id -> set of words (see load_vocab). taken: a code -> bool test for codes
        something else (a class race) is already using, so a join page can tell them apart."""
        self.vocab = vocab or {}
        self.clock = clock or (lambda: int(time.time() * 1000))
        self.taken = taken or (lambda code: False)
        self.parties = {}
        self.lock = threading.Lock()

    # ---------- what the server calls ----------

    def handle_get(self, code, params):
        """GET /api/party/<code>?teacher=<key>&me=<seat>"""
        with self.lock:
            return self.view(code, params.get("teacher"), params.get("me"))

    def handle_post(self, code, action, body):
        """POST /api/party to make one, or /api/party/<code>/<action>."""
        if not isinstance(body, dict):
            return 400, {"error": "send a JSON object"}
        with self.lock:
            if code is None:
                return self.create(body)
            teacher = {"write": self.write, "review": self.review, "build": self.build,
                       "end": self.end, "vote": self.open_voting, "reveal": self.reveal,
                       "remove": self.remove}
            student = {"join": self.join, "submit": self.submit, "sentence": self.record,
                       "pick": self.pick, "ballot": self.ballot}
            room = self.parties.get(str(code).upper())
            if action not in teacher and action not in student:
                return 404, {"error": "nothing here"}
            if room is None:
                return 404, {"error": "There is no class with that code.", "gone": "class"}
            room["touched"] = self.clock()
            if action in teacher:
                if not self.is_teacher(room, body):
                    return 403, {"error": "Only the teacher who made this class can do that."}
                return teacher[action](room, body)
            if action == "join":
                return self.join(room, body)
            player = room["players"].get(body.get("seat"))
            if player is None:
                return 404, {"error": "You are not in this class.", "gone": "seat"}
            return student[action](room, player, body)

    # ---------- the teacher ----------

    def create(self, body):
        topic = body.get("topic")
        if not isinstance(topic, str) or (self.vocab and topic not in self.vocab):
            return 400, {"error": "Pick a topic."}
        now = self.clock()
        for code in [c for c, r in self.parties.items() if now - r["touched"] > IDLE_MS]:
            del self.parties[code]
        if len(self.parties) >= MAX_PARTIES:
            return 503, {"error": "There are too many classes open right now. Try again later."}
        code = self.new_code()
        key = secrets.token_urlsafe(16)
        self.parties[code] = {
            "code": code, "teacher": key, "topic": topic, "phase": "lobby",
            "step": 1,              # goes up at every change of phase, so every page notices
            "round": 0,             # each new set of words
            "build": 0,             # each build (a round can have more than one)
            "prompt": "", "minutes": 3, "startsAt": None, "endsAt": None,
            "bank": {k: [] for k in BANK_LISTS}, "entries": [],
            "touched": now, "players": {}, "joins": 0}
        return 200, {"code": code, "teacher": key}

    def next_phase(self, room, phase):
        room["phase"] = phase
        room["step"] += 1

    def write(self, room, body):
        """A new round: a prompt to write words for. The word bank starts again from nothing."""
        if room["phase"] not in ("lobby", "results"):
            return 409, {"error": "Finish this round first."}
        prompt = clean_prompt(body.get("prompt"))
        if not prompt:
            return 400, {"error": "Type a prompt for the class."}
        if not room["players"]:
            return 409, {"error": "Wait until at least one student has joined."}
        room.update(prompt=prompt, round=room["round"] + 1, startsAt=None, endsAt=None,
                    bank={k: [] for k in BANK_LISTS}, entries=[])
        for p in room["players"].values():
            p.update(round_fields(), **build_fields())
        self.next_phase(room, "writing")
        return 200, self.describe(room, teacher=True)

    def review(self, room, body):
        """Approve a student's words, or send them back. `struck` names the boxes whose words
        should be left out of the bank even though the rest is fine."""
        if room["phase"] != "writing":
            return 409, {"error": "The class is not writing right now."}
        player = room["players"].get(body.get("seat"))
        if player is None or player["card"] is None:
            return 404, {"error": "That answer is not there any more."}
        ok, struck = body.get("ok"), body.get("struck", [])
        if not isinstance(ok, bool) or not isinstance(struck, list) or \
                not all(f in FIELDS for f in struck):
            return 400, {"error": "send ok and the boxes to strike"}
        card = player["card"]
        card["status"] = "approved" if ok else "rejected"
        card["struck"] = [f for f in FIELDS if f in struck and card["words"].get(f)] if ok else []
        return 200, self.describe(room, teacher=True)

    def build(self, room, body):
        """Chop the approved words into the bank (from writing), or build again with the same
        bank (from results), with a new prompt and a time limit."""
        if room["phase"] not in ("writing", "results"):
            return 409, {"error": "There are no words to build with yet."}
        prompt = clean_prompt(body.get("prompt"))
        minutes = body.get("minutes", room["minutes"])
        if not prompt:
            return 400, {"error": "Type a prompt for the class."}
        if not is_whole(minutes) or not MIN_MINUTES <= minutes <= MAX_MINUTES:
            return 400, {"error": "Building can last %d to %d minutes." % (MIN_MINUTES, MAX_MINUTES)}
        if room["phase"] == "writing":
            if not any(p["card"] and p["card"]["status"] == "approved" for p in room["players"].values()):
                return 409, {"error": "Approve at least one answer first."}
            room["bank"] = self.chop(room)
        now = self.clock()
        room.update(prompt=prompt, minutes=minutes, build=room["build"] + 1,
                    startsAt=now + LEAD_MS, endsAt=now + LEAD_MS + minutes * 60000, entries=[])
        for p in room["players"].values():
            p.update(build_fields())
        self.next_phase(room, "building")
        return 200, self.describe(room, teacher=True)

    @staticmethod
    def chop(room):
        """Every approved word, in the bank list its box belongs to, each word once. A word goes
        in the first list it turns up in: the game needs every word in one list only."""
        bank = {k: [] for k in BANK_LISTS}
        seen = set()
        players = sorted(room["players"].values(), key=lambda p: p["order"])
        for p in players:
            card = p["card"]
            if not card or card["status"] != "approved":
                continue
            words = card["words"]
            lists = {"adjective": "adjective", "noun": "noun", "object": "noun", "adverb": "adverb",
                     "verb": "take" if words.get("object") and "object" not in card["struck"] else "move"}
            for field in FIELDS:
                word = words.get(field)
                if word and field not in card["struck"] and word not in seen:
                    seen.add(word)
                    bank[lists[field]].append(word)
        return bank

    def end(self, room, body):
        """Stop the building early."""
        if room["phase"] != "building" or self.clock() >= room["endsAt"]:
            return 409, {"error": "Nobody is building right now."}
        now = self.clock()
        room["endsAt"] = now
        room["startsAt"] = min(room["startsAt"], now)
        return 200, self.describe(room, teacher=True)

    def open_voting(self, room, body):
        """Put each student's best sentence up for the vote: the one they picked, or else their
        last. Building stops, if it was still going. The order is shuffled, so the first one
        up is not always the same child."""
        if room["phase"] != "building":
            return 409, {"error": "There is nothing to vote on yet."}
        entries = []
        for p in room["players"].values():
            mine = [s for s in p["sentences"] if not s["repeat"]]
            if not mine:
                continue
            chosen = next((s for s in mine if s["n"] == p["picked"]), mine[-1])
            entries.append({"seat": p["seat"], "text": chosen["text"]})
        if not entries:
            return 409, {"error": "Nobody has finished a sentence yet."}
        random.shuffle(entries)
        for i, e in enumerate(entries):
            e["id"] = chr(ord("A") + i) if i < 26 else str(i + 1)
        now = self.clock()
        room["endsAt"] = min(room["endsAt"], now)
        room["startsAt"] = min(room["startsAt"], now)
        room["entries"] = entries
        self.next_phase(room, "voting")
        return 200, self.describe(room, teacher=True)

    def reveal(self, room, body):
        """Count the votes. Every vote is a point for the sentence's writer."""
        if room["phase"] != "voting":
            return 409, {"error": "The class is not voting right now."}
        for e in room["entries"]:
            e["votes"] = sum(1 for p in room["players"].values() if p["vote"] == e["id"])
            writer = room["players"].get(e["seat"])
            if writer:
                writer["score"] += e["votes"]
        self.next_phase(room, "results")
        return 200, self.describe(room, teacher=True)

    def remove(self, room, body):
        room["players"].pop(body.get("seat"), None)
        return 200, self.describe(room, teacher=True)

    def is_teacher(self, room, body):
        key = body.get("teacher")
        return isinstance(key, str) and hmac.compare_digest(key, room["teacher"])

    # ---------- the students ----------

    def join(self, room, body):
        name = clean_name(body.get("name"))
        if not name:
            return 400, {"error": "Type your first name."}
        same = [p for p in room["players"].values() if p["name"].casefold() == name.casefold()]
        if same and body.get("seat") == same[0]["seat"]:
            return 200, {"code": room["code"], "seat": same[0]["seat"], "name": same[0]["name"], "party": True}
        if same:
            return 409, {"error": "Someone in this class is already called %s. Add the first "
                                  "letter of your last name, like \"%s B\"."
                                  % (same[0]["name"], name[:1].upper() + name[1:])}
        if len(room["players"]) >= MAX_PLAYERS:
            return 409, {"error": "This class is full."}
        seat = secrets.token_urlsafe(12)
        room["joins"] += 1
        room["players"][seat] = dict(round_fields(), **build_fields(), seat=seat, name=name,
                                     order=room["joins"], score=0)
        return 200, {"code": room["code"], "seat": seat, "name": name, "party": True}

    def submit(self, room, player, body):
        """A student's words for the frame. They can change them until the teacher approves."""
        if room["phase"] != "writing":
            return 409, {"error": "It is not time to write words right now."}
        if player["card"] and player["card"]["status"] == "approved":
            return 409, {"error": "Your teacher already said yes to your words."}
        sent = body.get("words")
        if not isinstance(sent, dict):
            return 400, {"error": "send your words"}
        words = {}
        for field in FIELDS:
            raw = sent.get(field)
            if raw in (None, ""):
                continue
            word = clean_word(raw)
            if not word:
                return 400, {"error": "Use one word in each box, with letters only.", "field": field}
            words[field] = word
        missing = [f for f in REQUIRED if f not in words]
        if missing:
            return 400, {"error": "Fill in every box that is not marked optional.", "field": missing[0]}
        player["card"] = {"words": words, "status": "waiting", "struck": []}
        return 200, self.describe(room, me=player["seat"])

    def record(self, room, player, body):
        """A sentence the game finished while building. `n` numbers them, so one sent twice is
        only kept once. Every word in it must be on the class's board."""
        n, text = body.get("n"), clean_text(body.get("text"))
        if not is_whole(n) or n < 1 or not text:
            return 400, {"error": "send a number and a sentence"}
        if body.get("build") != room["build"] or room["phase"] != "building":
            return 409, {"error": "That sentence was from an earlier round."}
        now = self.clock()
        if now < room["startsAt"]:
            return 409, {"error": "Building has not started yet."}
        if now > room["endsAt"] + GRACE_MS:
            return 409, {"error": "The time is up."}
        if n <= player["checked"]:
            return 200, {"ok": True}
        allowed = self.vocab.get(room["topic"], set()) | {w for ws in room["bank"].values() for w in ws}
        if self.vocab and any(w.lower() not in allowed for w in WORDS_IN.findall(text)):
            return 400, {"error": "That sentence has a word that is not on the class's board."}
        player["checked"] = n
        repeat = any(same_sentence(s["text"], text) for s in player["sentences"])
        if len(player["sentences"]) < MAX_SENTENCES:
            player["sentences"].append({"n": n, "text": text, "repeat": repeat})
        return 200, {"ok": True, "repeat": repeat}

    def pick(self, room, player, body):
        """Which of their sentences a student wants the class to see."""
        if room["phase"] != "building":
            return 409, {"error": "It is too late to change it now."}
        n = body.get("n")
        if not any(s["n"] == n and not s["repeat"] for s in player["sentences"]):
            return 400, {"error": "That is not one of your sentences."}
        player["picked"] = n
        return 200, self.describe(room, me=player["seat"])

    def ballot(self, room, player, body):
        """A vote, which a student can change until the teacher shows the results."""
        if room["phase"] != "voting":
            return 409, {"error": "It is not time to vote."}
        entry = next((e for e in room["entries"] if e["id"] == body.get("entry")), None)
        if entry is None:
            return 400, {"error": "Pick one of the sentences."}
        if entry["seat"] == player["seat"]:
            return 409, {"error": "You cannot vote for your own sentence!"}
        player["vote"] = entry["id"]
        return 200, self.describe(room, me=player["seat"])

    # ---------- what everybody sees ----------

    def view(self, code, teacher=None, me=None):
        room = self.parties.get(str(code).upper())
        if room is None:
            return 404, {"error": "There is no class with that code.", "gone": "class"}
        room["touched"] = self.clock()
        if teacher is not None and not self.is_teacher(room, {"teacher": teacher}):
            return 403, {"error": "Only the teacher who made this class can do that."}
        return 200, self.describe(room, teacher=teacher is not None, me=me)

    def building_over(self, room):
        return room["phase"] == "building" and self.clock() >= room["endsAt"]

    def describe(self, room, teacher=False, me=None):
        """The party as one person sees it. Everything handed back is a copy."""
        phase = room["phase"]
        players = sorted(room["players"].values(), key=lambda p: (-p["score"], p["order"]))
        out = {"code": room["code"], "topic": room["topic"], "phase": phase, "step": room["step"],
               "round": room["round"], "build": room["build"], "prompt": room["prompt"],
               "minutes": room["minutes"], "startsAt": room["startsAt"], "endsAt": room["endsAt"],
               "now": self.clock(), "over": self.building_over(room),
               "players": [{"name": p["name"], "score": p["score"]} for p in players]}
        if phase in ("building", "voting", "results"):
            out["bank"] = {k: list(v) for k, v in room["bank"].items()}
        if phase == "voting":
            out["entries"] = [{"id": e["id"], "text": e["text"]} for e in room["entries"]]
            out["voted"] = sum(1 for p in room["players"].values() if p["vote"])
        if phase == "results":
            out["entries"] = sorted(
                ({"id": e["id"], "text": e["text"], "votes": e["votes"],
                  "name": room["players"][e["seat"]]["name"] if e["seat"] in room["players"] else "?"}
                 for e in room["entries"]), key=lambda e: -e["votes"])
        if teacher:
            for row, p in zip(out["players"], players):
                row.update(seat=p["seat"], sentences=len([s for s in p["sentences"] if not s["repeat"]]),
                           voted=bool(p["vote"]))
                if phase == "writing" and p["card"]:
                    row["card"] = {"words": dict(p["card"]["words"]), "status": p["card"]["status"],
                                   "struck": list(p["card"]["struck"])}
            if phase == "voting":
                for e, src in zip(out["entries"], room["entries"]):
                    e["name"] = room["players"][src["seat"]]["name"] if src["seat"] in room["players"] else "?"
        if me is not None:
            p = room["players"].get(me)
            mine = None
            if p is not None:
                mine = {"name": p["name"], "score": p["score"], "checked": p["checked"],
                        "picked": p["picked"], "vote": p["vote"],
                        "sentences": [{"n": s["n"], "text": s["text"]} for s in p["sentences"] if not s["repeat"]]}
                if p["card"]:
                    mine["card"] = {"words": dict(p["card"]["words"]), "status": p["card"]["status"],
                                    "struck": list(p["card"]["struck"])}
                if phase in ("voting", "results"):
                    mine["entry"] = next((e["id"] for e in room["entries"] if e["seat"] == me), None)
            out["me"] = mine
        return out

    def new_code(self):
        while True:
            code = "".join(secrets.choice(LETTERS) for _ in range(CODE_LENGTH))
            if code not in self.parties and not self.taken(code):
                return code
