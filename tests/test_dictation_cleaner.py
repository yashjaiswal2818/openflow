"""Unit tests for the deterministic dictation cleaner."""

import unittest

from engine.dictation_cleaner import DictationCleaner, clean_dictation


class CleanerBasics(unittest.TestCase):
    def setUp(self):
        self.cleaner = DictationCleaner()

    def test_empty_and_whitespace(self):
        self.assertEqual(self.cleaner.clean(""), "")
        self.assertEqual(self.cleaner.clean("   \n\t "), "")

    def test_filler_words_removed(self):
        self.assertEqual(
            self.cleaner.clean("uh I think um this is erm ready"),
            "I think this is ready",
        )

    def test_fillers_do_not_eat_real_words(self):
        # "ahem"-like words and "hum" must survive; only standalone hesitations go
        self.assertEqual(self.cleaner.clean("the human said hum"), "The human said hum")

    def test_stutter_collapse(self):
        self.assertEqual(self.cleaner.clean("the the report is i i ready"), "The report is I ready")

    def test_hyphenated_stutter(self):
        self.assertEqual(self.cleaner.clean("th-the build b-basically failed"), "The build failed")

    def test_rhetorical_repetition_preserved(self):
        self.assertEqual(self.cleaner.clean("no, no, no! that is wrong"), "No, no, no! That is wrong")
        self.assertEqual(self.cleaner.clean("very, very good"), "Very, very good")

    def test_spoken_punctuation(self):
        self.assertEqual(
            self.cleaner.clean("hello comma world period question mark"),
            "Hello, world?",
        )
        self.assertEqual(self.cleaner.clean("one new line two"), "One\nTwo")

    def test_new_paragraph(self):
        self.assertEqual(self.cleaner.clean("first new paragraph second"), "First\n\nSecond")

    def test_periodic_is_not_punctuation(self):
        self.assertEqual(self.cleaner.clean("a periodic table"), "A periodic table")

    def test_pronoun_and_sentence_casing(self):
        self.assertEqual(
            self.cleaner.clean("i'm sure that i can do it. it works."),
            "I'm sure that I can do it. It works.",
        )

    def test_tech_acronyms(self):
        out = self.cleaner.clean("we shipped the api, the json schema and the sdk for macos")
        self.assertEqual(out, "We shipped the API, the JSON schema and the SDK for macOS")

    def test_brand_names(self):
        self.assertEqual(self.cleaner.clean("openflow runs whisper locally"), "OpenFlow runs Whisper locally")

    def test_hesitation_like_removed_but_verb_kept(self):
        self.assertEqual(self.cleaner.clean("it is, like, really fast"), "It is really fast")
        self.assertEqual(self.cleaner.clean("i like apples"), "I like apples")

    def test_crutch_words(self):
        self.assertEqual(self.cleaner.clean("so basically we are done"), "So we are done")

    def test_whitespace_and_punctuation_spacing(self):
        self.assertEqual(self.cleaner.clean("hello ,  world ."), "Hello, world.")

    def test_multiline_preserved(self):
        self.assertEqual(
            self.cleaner.clean("line one period new line line two period"),
            "Line one.\nLine two.",
        )


class CleanerContract(unittest.TestCase):
    EXAMPLES = [
        "uh basically i think that the the openflow engine is super fast comma new line ready for production period",
        "i i want to to test the api and the json output period",
        "no, no, no! that is uh not what i meant",
        "so um yeah the the meeting is at 5 pm period new paragraph also bring the the report question mark",
        "th-the build failed b-because the the sdk is out of date",
        "we shipped the api, the ui and the json docs period",
    ]

    def test_idempotent(self):
        cleaner = DictationCleaner()
        for text in self.EXAMPLES:
            once = cleaner.clean(text)
            self.assertEqual(cleaner.clean(once), once, msg=f"not idempotent: {text!r}")

    def test_report_counts_and_stages(self):
        report = DictationCleaner().clean_with_report(
            "uh i i love the openflow api period new line ship it question mark"
        )
        self.assertEqual(report.cleaned, "I love the OpenFlow API.\nShip it?")
        self.assertGreaterEqual(report.fillers_removed, 1)
        self.assertGreaterEqual(report.stutters_collapsed, 1)
        self.assertGreaterEqual(report.punctuation_converted, 2)
        self.assertGreaterEqual(report.acronyms_fixed, 2)
        self.assertIn("filler_removal", report.stages)
        self.assertIn("spoken_punctuation", report.stages)
        self.assertTrue(report.changed)
        self.assertEqual(set(report.to_dict()), {
            "raw", "cleaned", "changed", "total_fixes", "fillers_removed",
            "stutters_collapsed", "punctuation_converted", "crutches_removed",
            "acronyms_fixed", "sentences_capitalized", "stages",
        })

    def test_feature_toggles(self):
        raw = "uh hello comma world"
        self.assertEqual(clean_dictation(raw, spoken_punctuation=False, strip_fillers=False), "Uh hello comma world")
        self.assertEqual(clean_dictation(raw, strip_fillers=True), "Hello, world")
        self.assertEqual(clean_dictation(raw, fix_casing=False), "hello, world")
        self.assertEqual(clean_dictation("uh hello comma world"), "Hello, world")

    def test_clean_is_sub_millisecond_scale(self):
        import time

        text = "uh the the openflow engine is fast comma new line ready for production period " * 20
        started = time.perf_counter()
        for _ in range(50):
            DictationCleaner().clean(text)
        elapsed = (time.perf_counter() - started) / 50
        self.assertLess(elapsed, 0.02, msg=f"cleaner too slow: {elapsed * 1000:.2f} ms")


if __name__ == "__main__":
    unittest.main()
