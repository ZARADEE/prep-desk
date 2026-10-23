import unittest
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

import test_learning_agent as fixtures
from app import db
from app.composer import compose_paper
from app.main import app


class ExamTests(unittest.TestCase):
    def setUp(self):
        fixtures.LearningAgentTests.setUp(self)
        with db.connect() as connection:
            self.paper = compose_paper(connection, self.template, 7, "考试验证")
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def start(self):
        response = self.client.post("/api/exams", json={"paper_id": self.paper["id"]})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_hidden_answers_preserve_multiple_choice_and_frozen_paper(self):
        qid = self.paper["questions"][0]["id"]
        with db.connect() as connection:
            connection.execute("UPDATE questions SET answer_markdown='AB' WHERE id=?", (qid,))
        exam = self.start()
        self.assertEqual(self.start()["id"], exam["id"])
        question = exam["paper"]["questions"][0]
        self.assertEqual(question["answer_mode"], "multiple")
        self.assertEqual(exam["paper"]["questions"][1]["answer_mode"], "single")
        for field in ("answer_markdown", "analysis_markdown", "scoring_points", "_frozen_previews"):
            self.assertNotIn(field, question)
        self.assertIsNone(exam["results"])
        saved = self.client.put(f"/api/exams/{exam['id']}/answers/{qid}", json={"selected_options": ["A", "B"]})
        self.assertEqual(saved.status_code, 200, saved.text)
        with db.connect() as connection:
            connection.execute("UPDATE questions SET answer_markdown='B', stem_markdown='已修改' WHERE id=?", (qid,))
        submitted = self.client.post(f"/api/exams/{exam['id']}/submit").json()
        self.assertEqual(submitted["paper"]["questions"][0]["stem_markdown"], question["stem_markdown"])
        self.assertEqual(submitted["results"]["questions"][qid]["status"], "correct")

    def test_resume_submission_confidence_and_locked_answers(self):
        exam = self.start()
        qid = exam["paper"]["questions"][0]["id"]
        answer = {"selected_options": ["B"], "confidence_level": 4, "marked": True}
        self.assertEqual(self.client.put(f"/api/exams/{exam['id']}/answers/{qid}", json=answer).status_code, 200)
        resumed = self.client.get(f"/api/exams/paper/{self.paper['id']}/latest").json()
        self.assertEqual(resumed["answers"][qid]["selected_options"], ["B"])
        self.assertTrue(resumed["answers"][qid]["marked"])
        submitted = self.client.post(f"/api/exams/{exam['id']}/submit").json()
        self.assertEqual(submitted["results"]["high_confidence_wrong"], [qid])
        self.assertEqual(self.client.post(f"/api/exams/{exam['id']}/submit").json(), submitted)
        summary = self.client.get("/api/exams/confidence/summary").json()
        self.assertEqual(summary["buckets"][3], {"level": 4, "count": 1, "correct": 0})
        self.assertEqual(self.client.put(f"/api/exams/{exam['id']}/answers/{qid}", json={"selected_options": ["A"]}).status_code, 409)

    def test_expiry_seals_saved_answers_and_rejects_late_changes(self):
        exam = self.start()
        qid = exam["paper"]["questions"][0]["id"]
        self.client.put(f"/api/exams/{exam['id']}/answers/{qid}", json={"selected_options": ["A"]})
        deadline = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        with db.connect() as connection:
            connection.execute("UPDATE exam_sessions SET deadline_at=? WHERE id=?", (deadline, exam["id"]))
        late = self.client.put(f"/api/exams/{exam['id']}/answers/{qid}", json={"selected_options": ["B"]})
        self.assertEqual(late.status_code, 409)
        sealed = self.client.get(f"/api/exams/{exam['id']}").json()
        self.assertEqual(sealed["submitted_at"], deadline)
        self.assertEqual(sealed["answers"][qid]["selected_options"], ["A"])
        self.assertEqual(sealed["results"]["questions"][qid]["status"], "correct")

    def test_subjective_grading_requires_submission_and_respects_score_limit(self):
        qid = self.paper["questions"][0]["id"]
        with db.connect() as connection:
            connection.execute("UPDATE questions SET type='solution', answer_markdown='参考解' WHERE id=?", (qid,))
        exam = self.start()
        grade_url = f"/api/exams/{exam['id']}/self-grade/{qid}"
        self.assertEqual(self.client.patch(grade_url, json={"score": 1}).status_code, 409)
        self.assertEqual(self.client.put(f"/api/exams/{exam['id']}/answers/{qid}", json={"text_answer": "我的解答"}).status_code, 200)
        submitted = self.client.post(f"/api/exams/{exam['id']}/submit").json()
        self.assertEqual(submitted["results"]["pending_count"], 1)
        self.assertEqual(self.client.patch(grade_url, json={"score": 3}).status_code, 422)
        graded = self.client.patch(grade_url, json={"score": 1.5}).json()
        self.assertEqual(graded["results"]["pending_count"], 0)
        self.assertEqual(graded["results"]["questions"][qid]["score"], 1.5)


if __name__ == "__main__":
    unittest.main()
