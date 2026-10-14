#!/usr/bin/env python3
"""The sentence judge: a second opinion from Claude on a sentence a child built.

The game checks every sentence itself the moment punctuation is eaten (js/checker.js):
a capital letter, a Noun, a Verb, and words in an order one of the topic's sentence
shapes allows. Those rules are instant and never wrong about a shape they know - but
what they know comes from the topic's word lists. They cannot tell "The hungry bird jumped
quickly." from "The quick bird jumped quickly.", which says the same thing twice. And they turn down good
English the recipe never taught, like "The big brown dog ran."

So the game asks this judge two questions about the words: does it sound right, and
does it make sense? The judge answers the way a careful teacher would, with a short
reason a child can read, and its answer gets the last word on those two questions.

Every answer is saved in data/verdicts.json, filed under the sentence. Nothing is asked
twice, the same sentence always gets the same answer, and the game reads that file too -
so a sentence judged once is judged forever, even with no server and no internet. A
teacher can open the file and change any answer; set "by" to "teacher" and the judge
will never overwrite it.

What the judge is sent: the words of the sentence and the topic's word list. Nothing
else - no names, nothing about who is playing. Only sentences made entirely of the
game's own word tiles are accepted, so this cannot be used to ask Claude anything else.

Needs the Anthropic Python SDK and an API key:

    pip install -r requirements.txt
    export ANTHROPIC_API_KEY=...

Without them the game still works - it checks with its own rules alone.

Ask about one sentence from the command line (type the words as the tiles show them):

    python3 tools/judge.py animals The quick bird jumped quickly
"""
import json
import os
import sys
import tempfile
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STORE = os.path.join(ROOT, "data", "verdicts.json")

# The judge defaults to the most capable model. Effort is "low" because this is a short
# yes-or-no question, and a child is waiting on the answer. Both can be changed without
# touching the code.
MODEL = os.environ.get("BOOKWORMS_JUDGE_MODEL", "claude-opus-5-5")
EFFORT = os.environ.get("BOOKWORMS_JUDGE_EFFORT", "low")
# New questions per minute, across everyone playing. Saved answers do not count.
PER_MINUTE = int(os.environ.get("BOOKWORMS_JUDGE_PER_MINUTE", "30"))
MAX_WORDS = 20
# If the model declines a request, the API retries it on a model Anthropic picks for that
# kind of decline, instead of handing back no answer at all.
FALLBACK_BETA = "server-side-fallback-2026-07-01"

try:
    import anthropic
except ImportError:          # the game works without the judge; it just uses its rules
    anthropic = None

SYSTEM = """\
You are the sentence judge in Bookworms, a word game for children in grades 3 to 5. A \
child steers a worm around a board, eating word tiles to build a sentence. When they \
finish, the game checks the sentence with simple rules - a capital letter, a Noun, a \
Verb, an order it recognises - and then asks you the two questions rules cannot answer \
well.

grammatical: Does it sound right? Is it a complete sentence of standard written \
English, with a subject and a verb, the words in an order that works, nothing missing, \
nothing extra, and every word in a form that fits? "A rice is soft" does not sound \
right: rice is not something you count, so it takes "The" or "My", not "A".

makes_sense: Does it make sense? Do the words fit together in meaning? Children write \
imaginative sentences, and that is a good thing: a sleepy moon or a singing carrot is \
fine, because you can picture it. Say it does not make sense only when a word is used \
in a way its meaning does not allow: "The apple tastes big" (big is a size, not a \
taste), "The bread smelled soft" (soft is how something feels, not how it smells).

Judge only the words. The game takes care of capital letters, of choosing "a" or "an", \
and of the end mark, so ignore those three things.

Judge the way a fair, careful teacher would. Do not mark a sentence wrong for being \
short or simple, or for not being how you would put it. A sentence can be right even \
though it is not one of the game's recipe shapes ("The big brown dog ran."), and a \
sentence can follow a recipe and still be wrong.

Then write to the child:
- feedback: one or two short sentences, 25 words at most, that an eight-year-old can \
read. If something is wrong, name the word that is the problem and say why, using the \
game's names for kinds of word: Determiner, Adjective, Noun, Pronoun, Verb, Adverb, \
Preposition - and its names for the parts of a sentence: Subject, Verb, Object, \
Modifier, Complement. If it is right, praise one specific thing in it. Be warm; never \
scold.
- suggestion: if the sentence is wrong, a corrected sentence that keeps the child's \
idea and uses only the topic's word tiles, so the child could build it next. If it is \
right, an empty string.

Some sentences built from other word lists, and how to judge them:
"The tiny frog jumped." - sounds right and makes sense.
"A shiny red ball bounced." - sounds right (two Adjectives are fine) and makes sense.
"The bus slowly stopped." - sounds right (an Adverb can come before its Verb) and makes sense.
"The sleepy moon smiled." - sounds right and makes sense: it is imaginative, and you can picture it.
"The frog green jumped." - does not sound right: the Adjective "green" goes before the Noun.
"My kite flew sang." - does not sound right: two Verbs in a row.
"A water is cold." - does not sound right: water is not something you count, so it needs "The" or "My".
"The lemon tastes tall." - sounds right but does not make sense: tall is a height, not a taste.
"""

SCHEMA = {
    "type": "object",
    "properties": {
        "grammatical": {"type": "boolean"},
        "makes_sense": {"type": "boolean"},
        "feedback": {"type": "string"},
        "suggestion": {"type": "string"},
    },
    "required": ["grammatical", "makes_sense", "feedback", "suggestion"],
    "additionalProperties": False,
}

ABOUT = (
    "Answers from the sentence judge (tools/judge.py), filed under the sentence they are "
    "about. The game reads this file, so every sentence here gets the same answer every "
    "time - even with no server and no internet. To overrule the judge, change an answer "
    "and set \"by\" to \"teacher\": the judge never overwrites a teacher. To have the "
    "judge look at a sentence again, delete its entry."
)


class JudgeError(Exception):
    """The judge could not give an answer. The game falls back on its own rules."""


def log(message):
    print("  judge: " + message, file=sys.stderr, flush=True)


def render(words):
    """The sentence as the game shows it, without its end mark. This is the key answers
    are filed under, so it must match Sentence.text('') in js/grammar.js exactly."""
    out = list(words)
    for i, w in enumerate(out):
        if w in ("a", "A"):
            nxt = next((x for x in out[i + 1:] if x != ","), None)
            if nxt and nxt[0].lower() in "aeiou":
                out[i] = "An" if w == "A" else "an"
    text = ""
    for i, w in enumerate(out):
        text += w if (i == 0 or w == ",") else " " + w
    return text


def load_topics():
    """Every topic the game offers, with what the judge needs to know about each."""
    with open(os.path.join(ROOT, "data", "topics.json"), encoding="utf-8") as f:
        index = json.load(f)
    topics = {}
    for entry in index["topics"]:
        with open(os.path.join(ROOT, "data", entry["file"]), encoding="utf-8") as f:
            pack = json.load(f)
        families = pack.get("families", {})

        def label(pos):
            info = pack["pos"].get(pos, {})
            return families.get(info.get("family"), {}).get("label") or info.get("label") or pos

        tiles, bank = {}, {}
        for pos, words in pack["words"].items():
            for w in words:
                tiles[w] = label(pos)
            bank.setdefault(label(pos), []).extend(words)
        topics[pack["id"]] = {"name": pack["name"], "tiles": tiles, "bank": bank}
    return topics


class Store:
    """data/verdicts.json. Re-read whenever it changes on disk, so a teacher's edit counts
    straight away; never written over if a hand edit has broken it."""

    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        self.mtime = None
        self.verdicts = {}
        self.broken = None
        self._load()

    def _load(self):
        try:
            mtime = os.path.getmtime(self.path)
        except OSError:
            self.verdicts, self.mtime, self.broken = {}, None, None
            return
        if mtime == self.mtime:
            return
        self.mtime = mtime
        try:
            with open(self.path, encoding="utf-8") as f:
                self.verdicts = dict(json.load(f).get("verdicts") or {})
            self.broken = None
        except (OSError, ValueError, AttributeError) as err:
            if not self.broken:
                log("%s cannot be read (%s) - new answers will not be saved until it is fixed"
                    % (os.path.relpath(self.path, ROOT), err))
            self.broken = str(err)

    def get(self, key):
        with self.lock:
            self._load()
            return self.verdicts.get(key)

    def put(self, key, verdict):
        with self.lock:
            self._load()
            if self.broken:
                return False
            old = self.verdicts.get(key)
            if old and old.get("by") == "teacher":      # a teacher's ruling stands
                return False
            self.verdicts[key] = verdict
            doc = {"about": ABOUT, "verdicts": self.verdicts}
            # write a copy, then swap it in, so a crash mid-write never leaves half a file
            fd, tmp = tempfile.mkstemp(dir=os.path.dirname(self.path), suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(doc, f, indent=2, sort_keys=True, ensure_ascii=False)
                f.write("\n")
            os.replace(tmp, self.path)
            self.mtime = os.path.getmtime(self.path)
            return True


class Judge:
    def __init__(self, client=None, store_path=STORE, probe=True):
        self.topics = load_topics()
        self.store = Store(store_path)
        self.lock = threading.Lock()
        self.recent = []                  # when recent questions were asked, for PER_MINUTE
        self.fallbacks = True
        self.why = None                   # why the judge is off, when it is
        self.client = client
        if client is None:
            if anthropic is None:
                self.why = "the anthropic package is not installed (pip install -r requirements.txt)"
            else:
                self.client = anthropic.Anthropic(timeout=30.0, max_retries=1)
                if probe:
                    threading.Thread(target=self.probe, daemon=True).start()

    def off(self, why):
        if self.client is not None:
            log("switched off: " + why)
        self.client, self.why = None, why

    def probe(self):
        """Check the key and the model once at start-up. Looking a model up costs nothing,
        so a judge that cannot work says so before any child is left waiting on it."""
        try:
            self.client.with_options(timeout=8.0, max_retries=0).models.retrieve(MODEL)
            log("on, using %s. Answers are saved in data/verdicts.json." % MODEL)
        except TypeError as err:
            if not no_credentials(err):
                raise
            self.off("no API key found (set ANTHROPIC_API_KEY)")
        except anthropic.AuthenticationError:
            self.off("the API key was not accepted")
        except anthropic.PermissionDeniedError:
            self.off("this API key is not allowed to use the API")
        except anthropic.NotFoundError:
            self.off("the model %s is not available to this API key "
                     "(choose another with BOOKWORMS_JUDGE_MODEL)" % MODEL)
        except anthropic.APIError as err:
            # no internet right now, or a hiccup: stay on, and let each question try
            log("could not reach the API to check the key (%s); will try when asked" % err)

    def status(self):
        return {"available": self.client is not None,
                "model": MODEL if self.client is not None else None,
                "why": self.why}

    def handle(self, body):
        """Answer POST /api/judge. Returns (HTTP status, JSON-ready reply)."""
        try:
            topic, words = self.validate(body)
        except ValueError as err:
            return 400, {"error": str(err)}
        key = render(words)
        saved = self.store.get(key)
        if saved:
            return 200, {"key": key, "verdict": saved, "saved": True}
        if self.client is None:
            return 503, {"error": "no judge: " + (self.why or "not set up")}
        if not self.allow():
            return 429, {"error": "the judge is busy - try again in a minute"}
        try:
            verdict = self.ask(topic, words, key)
        except JudgeError as err:
            log('could not judge "%s": %s' % (key, err))
            return 502, {"error": str(err)}
        self.store.put(key, verdict)
        return 200, {"key": key, "verdict": verdict, "saved": False}

    def validate(self, body):
        if not isinstance(body, dict):
            raise ValueError("send a JSON object")
        topic = self.topics.get(body.get("topic"))
        if topic is None:
            raise ValueError("unknown topic")
        words = body.get("words")
        if not isinstance(words, list) or not 1 <= len(words) <= MAX_WORDS:
            raise ValueError("send between 1 and %d words" % MAX_WORDS)
        for w in words:
            if not isinstance(w, str) or w not in topic["tiles"]:
                raise ValueError("only the topic's word tiles can be judged")
        return topic, words

    def allow(self):
        now = time.monotonic()
        with self.lock:
            self.recent = [t for t in self.recent if now - t < 60]
            if len(self.recent) >= PER_MINUTE:
                return False
            self.recent.append(now)
            return True

    def ask(self, topic, words, key):
        tagged = ", ".join("%s (%s)" % (w, topic["tiles"][w]) for w in words)
        bank = "\n".join("- %s: %s" % (label, ", ".join(ws)) for label, ws in topic["bank"].items())
        prompt = ("Topic: %s\nSentence: %s\nWord by word: %s\nWord tiles in this topic:\n%s"
                  % (topic["name"], key, tagged, bank))
        response = self.call({
            "model": MODEL,
            "max_tokens": 4096,          # room for the model's thinking as well as the answer
            "system": [{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
            "output_config": {"effort": EFFORT,
                              "format": {"type": "json_schema", "schema": SCHEMA}},
            "messages": [{"role": "user", "content": prompt}],
        })
        if response.stop_reason == "refusal":
            raise JudgeError("the model declined to judge it")
        if response.stop_reason == "max_tokens":
            raise JudgeError("the answer was cut off")
        text = next((b.text for b in response.content if b.type == "text"), None)
        try:
            answer = json.loads(text)
        except (TypeError, ValueError):
            raise JudgeError("the answer was not the JSON that was asked for")
        return {
            "grammatical": bool(answer.get("grammatical")),
            "makes_sense": bool(answer.get("makes_sense")),
            "feedback": tidy(answer.get("feedback")),
            "suggestion": tidy(answer.get("suggestion")),
            "by": "ai",
            "model": response.model,
        }

    def call(self, params):
        if anthropic is None:            # a stand-in client, from the tests
            return self.client.messages.create(**params)
        try:
            if self.fallbacks:
                return self.client.beta.messages.create(
                    betas=[FALLBACK_BETA], fallbacks="default", **params)
            return self.client.messages.create(**params)
        except anthropic.BadRequestError as err:
            if self.fallbacks and ("anthropic-beta" in str(err) or "fallbacks" in str(err)):
                log("refusal fallbacks are not available to this key; asking without them")
                self.fallbacks = False
                return self.call(params)
            raise JudgeError("the API turned the request down: %s" % err.message)
        except TypeError as err:
            if not no_credentials(err):
                raise
            self.off("no API key found (set ANTHROPIC_API_KEY)")
            raise JudgeError("no API key")
        except anthropic.AuthenticationError:
            self.off("the API key was not accepted")
            raise JudgeError("the API key was not accepted")
        except anthropic.PermissionDeniedError:
            self.off("this API key is not allowed to use the API")
            raise JudgeError("permission denied")
        except anthropic.NotFoundError:
            self.off("the model %s is not available to this API key" % MODEL)
            raise JudgeError("model not found")
        except anthropic.RateLimitError:
            raise JudgeError("the API is rate limiting this key")
        except anthropic.APIStatusError as err:
            raise JudgeError("the API answered with an error (%s)" % err.status_code)
        except anthropic.APIConnectionError:
            raise JudgeError("could not reach the API")


def no_credentials(err):
    """The SDK only finds out there is no API key when it goes to send a request."""
    return "authentication method" in str(err)


def tidy(text, limit=240):
    """Keep what reaches the screen short and on one line, whatever came back."""
    text = " ".join(str(text or "").split())
    return text if len(text) <= limit else text[:limit - 3].rstrip() + "..."


def main(argv):
    if len(argv) < 3:
        print(__doc__.strip().splitlines()[-1].strip())
        return 2
    judge = Judge(probe=False)
    if judge.client is None:
        print("The judge is off: " + judge.why)
        return 1
    code, reply = judge.handle({"topic": argv[1], "words": argv[2:]})
    print(json.dumps(reply, indent=2, ensure_ascii=False))
    return 0 if code == 200 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
