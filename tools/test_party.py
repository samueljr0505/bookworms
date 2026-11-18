#!/usr/bin/env python3
"""Checks for word parties on the server side (tools/party.py). Run with:

    python3 tools/test_party.py

The clock is a pretend one, so building takes no time at all. The last test starts the real
server and plays a round over HTTP, the way the pages do.
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
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import party  # noqa: E402


class Clock:
    def __init__(self):
        self.ms = 1_000_000

    def __call__(self):
        return self.ms

    def wait(self, ms):
        self.ms += ms


class PartyTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.party = party.WordParty(party.load_vocab(ROOT), clock=self.clock)
        code, made = self.party.handle_post(None, None, {"topic": "animals"})
        self.assertEqual(code, 200)
        self.code, self.key = made["code"], made["teacher"]

    def post(self, action, body):
        return self.party.handle_post(self.code, action, body)

    def teacher(self, action, **body):
        return self.post(action, dict(body, teacher=self.key))

    def look(self, me=None, teacher=False):
        params = {"me": me} if me else {}
        if teacher:
            params["teacher"] = self.key
        return self.party.handle_get(self.code, params)[1]

    def join(self, name):
        code, out = self.post("join", {"name": name})
        self.assertEqual(code, 200, out)
        self.assertTrue(out["party"])
        return out["seat"]

    def submit(self, seat, **words):
        return self.post("submit", {"seat": seat, "words": words})

    def write_round(self):
        """Ana and Ben join; Ana writes a sentence with an object, Ben one without."""
        self.ana, self.ben = self.join("Ana"), self.join("Ben")
        self.assertEqual(self.teacher("write", prompt="Who came to lunch?")[0], 200)
        self.assertEqual(self.submit(self.ana, adjective="Sneaky", noun="principal", verb="chased",
                                     object="pizza", adverb="loudly")[0], 200)
        self.assertEqual(self.submit(self.ben, adjective="giant", noun="taco", verb="danced")[0], 200)

    def build(self, minutes=2):
        code, out = self.teacher("build", prompt="What happened on the field trip?", minutes=minutes)
        self.assertEqual(code, 200, out)
        self.clock.wait(party.LEAD_MS)
        return out

    def sentence(self, seat, n, text):
        return self.post("sentence", {"seat": seat, "n": n, "text": text, "build": self.look()["build"]})

    # ---------- writing and reviewing ----------

    def test_only_the_teacher_moves_it_along(self):
        self.join("Ana")
        self.assertEqual(self.post("write", {"teacher": "nope", "prompt": "Hi"})[0], 403)
        self.assertEqual(self.post("write", {"prompt": "Hi"})[0], 403)

    def test_writing_needs_a_prompt_and_a_student(self):
        self.assertEqual(self.teacher("write", prompt="Who came?")[0], 409)
        self.join("Ana")
        self.assertEqual(self.teacher("write", prompt="   ")[0], 400)
        self.assertEqual(self.teacher("write", prompt="Who came?")[0], 200)
        self.assertEqual(self.look()["phase"], "writing")

    def test_words_are_one_word_each_and_the_needed_boxes_are_filled(self):
        seat = self.join("Ana")
        self.teacher("write", prompt="Who came?")
        code, out = self.submit(seat, adjective="big", noun="", verb="ran")
        self.assertEqual((code, out["field"]), (400, "noun"))
        code, out = self.submit(seat, adjective="big red", noun="dog", verb="ran")
        self.assertEqual((code, out["field"]), (400, "adjective"))
        code, out = self.submit(seat, adjective="<b>", noun="dog", verb="ran")
        self.assertEqual(code, 400)
        code, out = self.submit(seat, adjective="BIG", noun=" Dog ", verb="ran", adverb="")
        self.assertEqual(code, 200)
        self.assertEqual(out["me"]["card"]["words"], {"adjective": "big", "noun": "dog", "verb": "ran"})
        self.assertEqual(out["me"]["card"]["status"], "waiting")

    def test_students_cannot_see_each_others_words(self):
        self.write_round()
        mine = self.look(me=self.ana)
        self.assertNotIn("card", json.dumps(mine["players"]))
        self.assertEqual(mine["me"]["card"]["words"]["noun"], "principal")
        everyone = self.look(teacher=True)
        self.assertEqual({p["name"]: p["card"]["words"]["noun"] for p in everyone["players"]},
                         {"Ana": "principal", "Ben": "taco"})

    def test_sent_back_words_can_be_changed_but_approved_ones_cannot(self):
        self.write_round()
        self.assertEqual(self.teacher("review", seat=self.ben, ok=False)[0], 200)
        self.assertEqual(self.look(me=self.ben)["me"]["card"]["status"], "rejected")
        self.assertEqual(self.submit(self.ben, adjective="tiny", noun="taco", verb="danced")[0], 200)
        self.assertEqual(self.look(me=self.ben)["me"]["card"]["status"], "waiting")
        self.teacher("review", seat=self.ben, ok=True)
        self.assertEqual(self.submit(self.ben, adjective="huge", noun="taco", verb="danced")[0], 409)

    def test_building_needs_an_approved_answer(self):
        self.write_round()
        code, out = self.teacher("build", prompt="Go", minutes=2)
        self.assertEqual(code, 409)
        self.teacher("review", seat=self.ana, ok=False)
        self.assertEqual(self.teacher("build", prompt="Go", minutes=2)[0], 409)

    # ---------- the word bank ----------

    def test_approved_words_are_chopped_into_the_bank(self):
        self.write_round()
        self.teacher("review", seat=self.ana, ok=True, struck=["adverb"])
        self.teacher("review", seat=self.ben, ok=True)
        bank = self.build()["bank"]
        self.assertEqual(bank, {"adjective": ["sneaky", "giant"], "noun": ["principal", "pizza", "taco"],
                                "take": ["chased"], "move": ["danced"], "adverb": []})

    def test_a_rejected_answer_and_struck_words_stay_out(self):
        self.write_round()
        self.teacher("review", seat=self.ana, ok=True, struck=["object"])
        self.teacher("review", seat=self.ben, ok=False)
        bank = self.build()["bank"]
        # with its object struck, "chased" is left on its own: a verb that needs nothing after it
        self.assertEqual(bank["noun"], ["principal"])
        self.assertEqual(bank["move"], ["chased"])
        self.assertNotIn("taco", json.dumps(bank))

    def test_a_word_goes_in_the_bank_once(self):
        self.write_round()
        self.submit(self.ben, adjective="sneaky", noun="pizza", verb="danced")
        self.teacher("review", seat=self.ana, ok=True)
        self.teacher("review", seat=self.ben, ok=True)
        bank = self.build()["bank"]
        self.assertEqual(bank["adjective"], ["sneaky"])
        self.assertEqual(bank["noun"], ["principal", "pizza"])

    # ---------- building ----------

    def ready_to_build(self):
        self.write_round()
        self.teacher("review", seat=self.ana, ok=True)
        self.teacher("review", seat=self.ben, ok=True)
        self.build()

    def test_sentences_must_be_made_of_the_boards_words(self):
        self.ready_to_build()
        self.assertEqual(self.sentence(self.ana, 1, "The sneaky taco chased the pizza.")[0], 200)
        # the topic's own words are on the board too, as top-ups and little words
        self.assertEqual(self.sentence(self.ana, 2, "He quickly chased a fox.")[0], 200)
        code, out = self.sentence(self.ana, 3, "The sneaky poop chased the pizza.")
        self.assertEqual(code, 400)
        self.assertEqual(len(self.look(me=self.ana)["me"]["sentences"]), 2)

    def test_a_sentence_sent_twice_is_kept_once_and_repeats_are_not_entries(self):
        self.ready_to_build()
        self.sentence(self.ana, 1, "The sneaky taco danced.")
        self.sentence(self.ana, 1, "The sneaky taco danced.")
        self.assertEqual(self.sentence(self.ana, 2, "the sneaky  taco danced.")[1]["repeat"], True)
        self.assertEqual([s["n"] for s in self.look(me=self.ana)["me"]["sentences"]], [1])

    def test_sentences_only_count_while_building(self):
        self.write_round()
        self.teacher("review", seat=self.ana, ok=True)
        self.teacher("build", prompt="Go", minutes=1)
        self.assertEqual(self.sentence(self.ana, 1, "The sneaky taco danced.")[0], 409)   # not started
        self.clock.wait(party.LEAD_MS + 60000 + party.GRACE_MS + 1)
        self.assertTrue(self.look()["over"])
        self.assertEqual(self.sentence(self.ana, 1, "The sneaky taco danced.")[0], 409)   # too late

    def test_ending_early(self):
        self.ready_to_build()
        self.assertEqual(self.teacher("end")[0], 200)
        self.assertTrue(self.look()["over"])
        self.assertEqual(self.teacher("end")[0], 409)

    # ---------- voting ----------

    def test_the_picked_sentence_goes_up_or_else_the_last(self):
        self.ready_to_build()
        self.sentence(self.ana, 1, "The sneaky taco danced.")
        self.sentence(self.ana, 2, "The giant pizza chased him.")
        self.sentence(self.ben, 1, "The giant principal danced loudly.")
        self.assertEqual(self.post("pick", {"seat": self.ana, "n": 1})[0], 200)
        self.assertEqual(self.post("pick", {"seat": self.ana, "n": 9})[0], 400)
        out = self.teacher("vote")[1]
        self.assertEqual(sorted(e["text"] for e in out["entries"]),
                         ["The giant principal danced loudly.", "The sneaky taco danced."])
        self.assertEqual(self.post("pick", {"seat": self.ana, "n": 2})[0], 409)   # too late now

    def test_votes_are_anonymous_and_not_for_yourself(self):
        self.ready_to_build()
        self.sentence(self.ana, 1, "The sneaky taco danced.")
        self.sentence(self.ben, 1, "The giant principal danced loudly.")
        self.teacher("vote")
        mine = self.look(me=self.ana)
        self.assertNotIn("name", json.dumps(mine["entries"]))
        self.assertNotIn("seat", json.dumps(mine["entries"]))
        own, other = mine["me"]["entry"], next(e["id"] for e in mine["entries"] if e["id"] != mine["me"]["entry"])
        self.assertEqual(self.post("ballot", {"seat": self.ana, "entry": own})[0], 409)
        self.assertEqual(self.post("ballot", {"seat": self.ana, "entry": "Z"})[0], 400)
        self.assertEqual(self.post("ballot", {"seat": self.ana, "entry": other})[0], 200)
        self.assertEqual(self.look()["voted"], 1)
        # the teacher sees who wrote what, to keep an eye on it
        self.assertEqual(sorted(e["name"] for e in self.look(teacher=True)["entries"]), ["Ana", "Ben"])

    def test_results_count_the_votes_into_the_score(self):
        self.ready_to_build()
        cara = self.join("Cara")
        self.sentence(self.ana, 1, "The sneaky taco danced.")
        self.sentence(self.ben, 1, "The giant principal danced loudly.")
        self.teacher("vote")
        entries = {e["text"]: e["id"] for e in self.look()["entries"]}
        ben_id = entries["The giant principal danced loudly."]
        ana_id = entries["The sneaky taco danced."]
        self.post("ballot", {"seat": self.ana, "entry": ben_id})
        self.post("ballot", {"seat": cara, "entry": ana_id})
        self.post("ballot", {"seat": cara, "entry": ben_id})     # changed their mind
        self.assertEqual(self.post("ballot", {"seat": self.ben, "entry": ana_id})[0], 200)
        out = self.teacher("reveal")[1]
        self.assertEqual(out["phase"], "results")
        self.assertEqual([(e["name"], e["votes"]) for e in out["entries"]], [("Ben", 2), ("Ana", 1)])
        self.assertEqual([(p["name"], p["score"]) for p in out["players"]][:2], [("Ben", 2), ("Ana", 1)])
        self.assertEqual(self.post("ballot", {"seat": cara, "entry": ana_id})[0], 409)

    def test_build_again_keeps_the_bank_and_a_new_round_empties_it(self):
        self.ready_to_build()
        self.sentence(self.ana, 1, "The sneaky taco danced.")
        self.teacher("vote")
        self.teacher("reveal")
        bank = self.look()["bank"]
        out = self.build()
        self.assertEqual(out["bank"], bank)
        self.assertEqual(out["build"], 2)
        self.assertEqual(self.look(me=self.ana)["me"]["sentences"], [])
        self.assertEqual(self.teacher("write", prompt="Again")[0], 409)        # still building
        self.teacher("end")
        self.sentence(self.ana, 1, "The sneaky taco danced.")
        self.teacher("vote")
        self.teacher("reveal")
        out = self.teacher("write", prompt="Who is here now?")[1]
        self.assertEqual(out["round"], 2)
        self.assertNotIn("bank", out)
        self.assertIsNone(self.look(me=self.ana)["me"].get("card"))

    def test_a_sentence_from_an_earlier_build_does_not_count(self):
        self.ready_to_build()
        old = self.look()["build"]
        self.teacher("end")
        self.sentence(self.ana, 1, "The sneaky taco danced.")
        self.teacher("vote")
        self.teacher("reveal")
        self.build()
        code, _ = self.post("sentence", {"seat": self.ana, "n": 1, "text": "The sneaky taco danced.", "build": old})
        self.assertEqual(code, 409)

    def test_codes_never_clash_with_a_race(self):
        taken = {"BCDF"}
        p = party.WordParty(clock=self.clock, taken=lambda c: c in taken)
        import secrets
        real = secrets.choice
        seq = iter("BCDFBCDG")
        secrets.choice = lambda letters: next(seq)
        try:
            self.assertEqual(p.handle_post(None, None, {"topic": "animals"})[1]["code"], "BCDG")
        finally:
            secrets.choice = real


class ServerTests(unittest.TestCase):
    """The real server: a word party played over HTTP, and a race code the join page tries first."""

    def setUp(self):
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            self.port = s.getsockname()[1]
        self.dir = tempfile.mkdtemp()
        fake = os.path.join(self.dir, "cloudflared")
        with open(fake, "w") as f:
            f.write("#!/bin/sh\nsleep 60\n")
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

    def call(self, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request("http://127.0.0.1:%d/api/%s" % (self.port, path), data=data,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as err:
            return err.code, json.load(err)

    def test_a_round_over_http(self):
        self.assertEqual(self.call("party", {"topic": "space"})[0], 400)
        status, made = self.call("party", {"topic": "animals"})
        self.assertEqual(status, 200)
        code, key = made["code"], made["teacher"]
        # the join page asks for a race with this code first: there is none
        self.assertEqual(self.call("class/%s/join" % code, {"name": "Ana"})[1].get("gone"), "class")
        status, joined = self.call("party/%s/join" % code, {"name": "Ana"})
        self.assertEqual(status, 200)
        seat = joined["seat"]
        self.assertEqual(self.call("party/%s/write" % code, {"teacher": key, "prompt": "Who came?"})[0], 200)
        self.assertEqual(self.call("party/%s/submit" % code, {"seat": seat, "words": {
            "adjective": "sneaky", "noun": "principal", "verb": "danced"}})[0], 200)
        self.assertEqual(self.call("party/%s/review" % code, {"teacher": key, "seat": seat, "ok": True})[0], 200)
        status, out = self.call("party/%s/build" % code, {"teacher": key, "prompt": "Go!", "minutes": 1})
        self.assertEqual(out["bank"]["move"], ["danced"])
        status, seen = self.call("party/%s?me=%s" % (code, seat))
        self.assertEqual((status, seen["phase"], seen["me"]["name"]), (200, "building", "Ana"))
        self.assertEqual(self.call("party/%s/nothing" % code, {})[0], 404)
        self.assertEqual(self.call("party/ZZZZ?me=x")[0], 404)


if __name__ == "__main__":
    unittest.main()
