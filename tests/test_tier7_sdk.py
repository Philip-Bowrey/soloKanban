import unittest
import os
import shutil
import tempfile
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.solokanban', 'sdk')))
from solokanban import SoloKanbanClient, ConflictException

class TestPythonSDK(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.tmp_dir, "CON_REV", "features"), exist_ok=True)
        self.card_path = os.path.join(self.tmp_dir, "CON_REV", "features", "CARD-1.md")
        with open(self.card_path, "w", encoding="utf-8") as f:
            f.write("---\ntitle: Py Test Card\nlistId: backlog\n---\nInitial Py Body")

        self.client = SoloKanbanClient(self.tmp_dir)

    def tearDown(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_get_and_update_card(self):
        card = self.client.get_card("CON_REV", "CARD-1")
        self.assertIsNotNone(card)
        self.assertEqual(card["frontmatter"]["title"], "Py Test Card")

        card["body"] += "\nUpdated Py Body"
        updated = self.client.update_card(card)
        self.assertIn("contentHash", updated["frontmatter"]["meta"])

        reloaded = self.client.get_card("CON_REV", "CARD-1")
        self.assertIn("Updated Py Body", reloaded["body"])

    def test_edit_session_presence(self):
        with self.client.edit_session("CARD-1", intent="editing"):
            presence_path = os.path.join(self.tmp_dir, ".solokanban", "presence", "CARD-1", f"{self.client.actor_id}.json")
            self.assertTrue(os.path.exists(presence_path))

        presence_path = os.path.join(self.tmp_dir, ".solokanban", "presence", "CARD-1", f"{self.client.actor_id}.json")
        self.assertFalse(os.path.exists(presence_path))

if __name__ == "__main__":
    unittest.main()
