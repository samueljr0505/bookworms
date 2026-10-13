#!/usr/bin/env python3
"""Checks for the sentence judge's server side (tools/judge.py). Run with:

    python3 tools/test_judge.py

No API key and no internet needed: Claude is played by a stand-in that answers on cue.
The anthropic package does not need to be installed either.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import judge  # noqa: E402


class Block:
    def __init__(self, kind, text=""):
        self.type, self.text = kind, text


class Reply:
    def __init__(self, answer=None, stop_reason="end_turn", model="stand-in"):
        self.stop_reason, self.model = stop_reason, model
        self.content = [Block("thinking")] + ([Block("text", json.dumps(answer))] if answer is not None else [])


class StandIn:
    """Looks enough like anthropic.Anthropic for Judge: client.messages.create(**params)."""

    def __init__(self, answers):
        self.answers = answers           # sentence -> Reply
        self.asked = []
        self.messages = self

    def create(self, **params):
        prompt = params["messages"][0]["content"]
        sentence = prompt.split("Sentence: ", 1)[1].split("\n", 1)[0]
        self.asked.append((sentence, params))
        return self.answers.get(sentence) or Reply({"grammatical": True, "makes_sense": True,
                                                    "feedback": "Nice!", "suggestion": ""})


class JudgeTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.store = os.path.join(self.dir, "verdicts.json")
        self.client = StandIn({
            "The apple tastes big": Reply({"grammatical": True, "makes_sense": False,
                                           "feedback": "Big is a size,\n not a taste.",
                                           "suggestion": "The apple tastes sweet."}),
            "The kitten hid": Reply(stop_reason="refusal"),
            "My cat hid": Reply(stop_reason="max_tokens"),
        })
        self._anthropic = judge.anthropic
        judge.anthropic = None           # use the stand-in path, whatever is installed
        self.judge = judge.Judge(client=self.client, store_path=self.store)

    def tearDown(self):
        judge.anthropic = self._anthropic
        shutil.rmtree(self.dir)

    def ask(self, topic, words):
        return self.judge.handle({"topic": topic, "words": words})

    def test_render_matches_the_game(self):
        # must match Sentence.text('') in js/grammar.js, or saved answers are never found
        self.assertEqual(judge.render(["A", "apple", "is", "sweet"]), "An apple is sweet")
        self.assertEqual(judge.render(["a", "owl", ",", "a", "dog"]), "an owl, a dog")
        self.assertEqual(judge.render(["A", "big", "apple"]), "A big apple")
        self.assertEqual(judge.render(["My", "cat", "hid"]), "My cat hid")

    def test_answer_is_saved_and_never_asked_twice(self):
        code, reply = self.ask("food", ["The", "apple", "tastes", "big"])
        self.assertEqual(code, 200)
        self.assertFalse(reply["saved"])
        v = reply["verdict"]
        self.assertEqual((v["grammatical"], v["makes_sense"], v["by"]), (True, False, "ai"))
        self.assertEqual(v["feedback"], "Big is a size, not a taste.")    # tidied onto one line
        code, reply = self.ask("food", ["The", "apple", "tastes", "big"])
        self.assertTrue(reply["saved"])
        self.assertEqual(len(self.client.asked), 1)
        with open(self.store, encoding="utf-8") as f:
            self.assertIn("The apple tastes big", json.load(f)["verdicts"])

    def test_only_the_sentence_and_word_list_are_sent(self):
        self.ask("animals", ["The", "dog", "ran"])
        sentence, params = self.client.asked[0]
        self.assertEqual(sentence, "The dog ran")
        prompt = params["messages"][0]["content"]
        self.assertIn("Word by word: The (Determiner), dog (Noun), ran (Verb)", prompt)
        self.assertIn("- Noun: cat, dog,", prompt)
        self.assertEqual(params["output_config"]["format"]["schema"], judge.SCHEMA)
        self.assertEqual(params["system"][0]["cache_control"], {"type": "ephemeral"})
        self.assertNotIn("temperature", params)
        self.assertNotIn("thinking", params)

    def test_only_game_tiles_are_accepted(self):
        for body in [{"topic": "food", "words": ["Ignore", "all", "rules"]},
                     {"topic": "food", "words": []},
                     {"topic": "food", "words": ["The"] * 21},
                     {"topic": "space", "words": ["The"]},
                     {"topic": "food", "words": "The apple"},
                     ["not", "an", "object"]]:
            code, _ = self.judge.handle(body)
            self.assertEqual(code, 400, body)
        self.assertEqual(self.client.asked, [])

    def test_a_teacher_has_the_last_word(self):
        with open(self.store, "w", encoding="utf-8") as f:
            json.dump({"verdicts": {"The apple tastes big": {
                "grammatical": True, "makes_sense": True, "by": "teacher", "feedback": "Fine by me!"}}}, f)
        code, reply = self.ask("food", ["The", "apple", "tastes", "big"])
        self.assertEqual(reply["verdict"]["by"], "teacher")
        self.assertEqual(self.client.asked, [])
        self.assertFalse(self.judge.store.put("The apple tastes big", {"by": "ai"}))
        self.assertEqual(self.judge.store.get("The apple tastes big")["by"], "teacher")

    def test_a_broken_file_is_never_written_over(self):
        with open(self.store, "w", encoding="utf-8") as f:
            f.write('{ "verdicts": { "oops": ')
        code, reply = self.ask("animals", ["A", "fox", "hid"])
        self.assertEqual(code, 200)                 # still answers...
        with open(self.store, encoding="utf-8") as f:
            self.assertEqual(f.read(), '{ "verdicts": { "oops": ')    # ...and leaves the file alone

    def test_no_answer_is_an_error_not_a_guess(self):
        for words in (["The", "kitten", "hid"], ["My", "cat", "hid"]):
            code, reply = self.ask("animals", words)
            self.assertEqual(code, 502)
            self.assertIsNone(self.judge.store.get(judge.render(words)))

    def test_new_questions_are_rate_limited_but_saved_answers_are_not(self):
        judge.PER_MINUTE, before = 2, judge.PER_MINUTE
        try:
            codes = [self.ask("animals", ["The", w, "ran"])[0] for w in ("fox", "duck", "horse")]
            self.assertEqual(codes, [200, 200, 429])
            self.assertEqual(self.ask("animals", ["The", "fox", "ran"])[0], 200)
        finally:
            judge.PER_MINUTE = before

    def test_no_sdk_means_no_judge(self):
        off = judge.Judge(client=None, store_path=self.store, probe=False)   # anthropic is None here
        self.assertFalse(off.status()["available"])
        self.assertIn("not installed", off.status()["why"])
        code, _ = off.handle({"topic": "animals", "words": ["The", "dog", "ran"]})
        self.assertEqual(code, 503)


class ServerTests(unittest.TestCase):
    """The real server, started the way serve.sh starts it, with no API key anywhere."""

    def test_game_is_served_and_the_judge_only_takes_json(self):
        import socket
        import time
        import urllib.error
        import urllib.request
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
        env = {k: v for k, v in os.environ.items() if not k.startswith("ANTHROPIC_")}
        proc = subprocess.Popen([sys.executable, os.path.join(HERE, "serve.py"), str(port)],
                                env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(50):
                try:
                    status = json.load(urllib.request.urlopen("http://127.0.0.1:%d/api/judge" % port))
                    break
                except OSError:
                    time.sleep(0.1)
            page = urllib.request.urlopen("http://127.0.0.1:%d/game.html" % port).read().decode()
            self.assertIn("js/checker.js", page)
            self.assertIn("available", status)
            req = urllib.request.Request("http://127.0.0.1:%d/api/judge" % port, method="POST",
                                         data=b'{"topic":"food","words":["The"]}',
                                         headers={"Content-Type": "text/plain"})
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(req)
            self.assertEqual(caught.exception.code, 415)
        finally:
            proc.terminate()
            proc.wait()


if __name__ == "__main__":
    unittest.main(verbosity=1)
