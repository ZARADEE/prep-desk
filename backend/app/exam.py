"""Persistent, timed answer sheets for composed papers."""
from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from . import db
from .composer import load_paper
from .paper_package import freeze, version_row
from .practice import answer_options, is_correct, normalize_options

router = APIRouter(prefix="/api/exams", tags=["exams"])


def init_tables(connection: Any) -> None:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS exam_sessions (
            id TEXT PRIMARY KEY,
            paper_id TEXT NOT NULL REFERENCES papers(id),
            snapshot_json TEXT NOT NULL,
            answers_json TEXT NOT NULL DEFAULT '{}',
            started_at TEXT NOT NULL,
            deadline_at TEXT NOT NULL,
            submitted_at TEXT
        )
    """)
    connection.execute("CREATE INDEX IF NOT EXISTS idx_exam_paper ON exam_sessions(paper_id, started_at)")


class StartExam(BaseModel):
    paper_id: str = Field(min_length=1, max_length=150)
    source_version: str | None = Field(default=None, max_length=100)
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)


class SaveAnswer(BaseModel):
    selected_options: list[str] = Field(default_factory=list, max_length=12)
    text_answer: str = Field(default="", max_length=20000)
    confidence_level: int | None = Field(default=None, ge=1, le=4)
    marked: bool = False


class SelfGrade(BaseModel):
    score: float = Field(ge=0, allow_inf_nan=False)


def _row(connection: Any, exam_id: str) -> Any:
    row = connection.execute("SELECT * FROM exam_sessions WHERE id=?", (exam_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "答卷不存在。")
    return row


def _expire(connection: Any, row: Any) -> Any:
    if row["submitted_at"] is None and datetime.now(timezone.utc) >= datetime.fromisoformat(row["deadline_at"]):
        connection.execute("UPDATE exam_sessions SET submitted_at=? WHERE id=?", (row["deadline_at"], row["id"]))
        return _row(connection, row["id"])
    return row


def _results(paper: dict[str, Any], answers: dict[str, Any]) -> dict[str, Any]:
    score = 0.0
    possible = 0.0
    pending = 0
    high_confidence_wrong: list[str] = []
    by_question: dict[str, Any] = {}
    for question in paper["questions"]:
        qid = question["id"]
        answer = answers.get(qid, {})
        allocated = float(question.get("allocated_score", 0))
        correct = answer_options(question.get("answer_markdown", "")) if question["type"] == "choice" else []
        selected = normalize_options(answer.get("selected_options", []))
        if correct:
            earned = allocated if is_correct(selected, correct) else 0.0
            score += earned
            possible += allocated
            if selected and not earned and answer.get("confidence_level") == 4:
                high_confidence_wrong.append(qid)
            by_question[qid] = {"status": "correct" if earned else "incorrect", "score": earned, "correct_options": correct}
        elif isinstance(answer.get("self_score"), (int, float)):
            earned = min(allocated, max(0.0, float(answer["self_score"])))
            score += earned
            possible += allocated
            by_question[qid] = {"status": "self_graded", "score": earned, "correct_options": []}
        else:
            pending += 1
            by_question[qid] = {"status": "pending", "score": None, "correct_options": []}
    return {"score": round(score, 2), "graded_possible": round(possible, 2),
            "paper_possible": paper["validation"]["total_score"], "pending_count": pending,
            "high_confidence_wrong": high_confidence_wrong, "questions": by_question}


def _public(row: Any) -> dict[str, Any]:
    paper = json.loads(row["snapshot_json"])
    answers = json.loads(row["answers_json"])
    submitted = row["submitted_at"] is not None
    for question in paper["questions"]:
        if question["type"] == "choice":
            question["answer_mode"] = "multiple" if len(answer_options(question.get("answer_markdown", ""))) > 1 else "single"
        question["frozen_question_preview"] = bool(question.get("_frozen_previews", {}).get("question"))
        question.pop("_frozen_previews", None)
        if not submitted:
            for key in ("answer_markdown", "analysis_markdown", "scoring_points", "option_explanations", "visual"):
                question.pop(key, None)
    return {"id": row["id"], "paper_id": row["paper_id"], "paper": paper,
            "answers": answers, "started_at": row["started_at"], "deadline_at": row["deadline_at"],
            "submitted_at": row["submitted_at"], "results": _results(json.loads(row["snapshot_json"]), answers) if submitted else None}


@router.post("")
def start_exam(payload: StartExam, allow_custom_duration: bool = False) -> dict[str, Any]:
    with db.connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        active = connection.execute("SELECT * FROM exam_sessions WHERE paper_id=? AND submitted_at IS NULL ORDER BY started_at DESC LIMIT 1", (payload.paper_id,)).fetchone()
        if active:
            active = _expire(connection, active)
            if active["submitted_at"] is None:
                return _public(active)
        if payload.source_version:
            paper = json.loads(version_row(payload.paper_id, payload.source_version)["snapshot_json"])
        else:
            paper = load_paper(connection, payload.paper_id)
        if paper is None:
            raise HTTPException(404, "试卷不存在。")
        paper, _issues = freeze(paper)
        now = datetime.now(timezone.utc)
        if payload.duration_minutes is not None and not allow_custom_duration:
            raise HTTPException(422, "此考试不允许修改试卷时限。")
        deadline = now + timedelta(minutes=payload.duration_minutes or int(paper["template"]["duration_minutes"]))
        exam_id = f"exam-{uuid.uuid4().hex[:16]}"
        connection.execute("INSERT INTO exam_sessions(id,paper_id,snapshot_json,started_at,deadline_at) VALUES(?,?,?,?,?)",
                           (exam_id, payload.paper_id, json.dumps(paper, ensure_ascii=False), now.isoformat(), deadline.isoformat()))
        return _public(_row(connection, exam_id))


@router.get("/paper/{paper_id}/latest")
def latest_exam(paper_id: str) -> dict[str, Any] | None:
    with db.connect() as connection:
        row = connection.execute("SELECT * FROM exam_sessions WHERE paper_id=? ORDER BY started_at DESC LIMIT 1", (paper_id,)).fetchone()
        return _public(_expire(connection, row)) if row else None


@router.get("/{exam_id}")
def get_exam(exam_id: str) -> dict[str, Any]:
    with db.connect() as connection:
        return _public(_expire(connection, _row(connection, exam_id)))


@router.put("/{exam_id}/answers/{question_id}")
def save_answer(exam_id: str, question_id: str, payload: SaveAnswer) -> dict[str, Any]:
    expired = False
    with db.connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = _expire(connection, _row(connection, exam_id))
        if row["submitted_at"] is not None:
            expired = True
        else:
            paper = json.loads(row["snapshot_json"])
            question = next((q for q in paper["questions"] if q["id"] == question_id), None)
            if not question:
                raise HTTPException(404, "题目不在这份试卷中。")
            selected = normalize_options(payload.selected_options)
            if question["type"] == "choice":
                valid_keys = {option["key"] for option in question["options"]}
                if len(selected) != len(payload.selected_options) or not set(selected).issubset(valid_keys):
                    raise HTTPException(422, "选项不属于当前题目。")
                if len(answer_options(question.get("answer_markdown", ""))) == 1 and len(selected) > 1:
                    raise HTTPException(422, "单选题只能选择一个选项。")
            elif selected:
                raise HTTPException(422, "此题使用文字作答。")
            answers = json.loads(row["answers_json"])
            answers[question_id] = {"selected_options": selected, "text_answer": payload.text_answer,
                                    "confidence_level": payload.confidence_level, "marked": payload.marked}
            connection.execute("UPDATE exam_sessions SET answers_json=? WHERE id=?", (json.dumps(answers, ensure_ascii=False), exam_id))
    if expired:
        raise HTTPException(409, "答题时间已结束，答卷已经自动提交。")
    return {"question_id": question_id, "answer": answers[question_id]}


@router.post("/{exam_id}/submit")
def submit_exam(exam_id: str) -> dict[str, Any]:
    with db.connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = _expire(connection, _row(connection, exam_id))
        if row["submitted_at"] is None:
            connection.execute("UPDATE exam_sessions SET submitted_at=? WHERE id=?", (db.utc_now(), exam_id))
            row = _row(connection, exam_id)
        return _public(row)


@router.patch("/{exam_id}/self-grade/{question_id}")
def self_grade(exam_id: str, question_id: str, payload: SelfGrade) -> dict[str, Any]:
    with db.connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = _row(connection, exam_id)
        if row["submitted_at"] is None:
            raise HTTPException(409, "交卷后才能自评。")
        paper = json.loads(row["snapshot_json"])
        question = next((q for q in paper["questions"] if q["id"] == question_id), None)
        if not question:
            raise HTTPException(404, "题目不在这份试卷中。")
        if question["type"] == "choice" and answer_options(question.get("answer_markdown", "")):
            raise HTTPException(409, "选择题由系统判分。")
        if payload.score > float(question.get("allocated_score", 0)):
            raise HTTPException(422, "自评分不能超过本题分值。")
        answers = json.loads(row["answers_json"])
        answers.setdefault(question_id, {})["self_score"] = payload.score
        connection.execute("UPDATE exam_sessions SET answers_json=? WHERE id=?", (json.dumps(answers, ensure_ascii=False), exam_id))
        return _public(_row(connection, exam_id))


@router.get("/{exam_id}/preview/{question_id}")
def exam_preview(exam_id: str, question_id: str, kind: str = "question") -> Response:
    with db.connect() as connection:
        row = _row(connection, exam_id)
        if kind not in ("question", "analysis") or (kind == "analysis" and row["submitted_at"] is None):
            raise HTTPException(403, "交卷后才能查看解析图片。")
        paper = json.loads(row["snapshot_json"])
    question = next((q for q in paper["questions"] if q["id"] == question_id), None)
    content = question and question.get("_frozen_previews", {}).get(kind)
    if not content:
        raise HTTPException(404, "该题没有题面图片。")
    return Response(base64.b64decode(content), media_type="image/png")


@router.get("/confidence/summary")
def confidence_summary() -> dict[str, Any]:
    buckets = {level: {"level": level, "count": 0, "correct": 0} for level in range(1, 5)}
    with db.connect() as connection:
        for row in connection.execute("SELECT confidence_level, is_correct FROM practice_attempts WHERE confidence_level BETWEEN 1 AND 4"):
            item = buckets[row["confidence_level"]]
            item["count"] += 1
            item["correct"] += row["is_correct"]
        for row in connection.execute("SELECT snapshot_json, answers_json FROM exam_sessions WHERE submitted_at IS NOT NULL"):
            paper = json.loads(row["snapshot_json"])
            answers = json.loads(row["answers_json"])
            for question in paper["questions"]:
                answer = answers.get(question["id"], {})
                level = answer.get("confidence_level")
                correct = answer_options(question.get("answer_markdown", "")) if question["type"] == "choice" else []
                if level not in buckets or not correct or not answer.get("selected_options"):
                    continue
                item = buckets[level]
                item["count"] += 1
                item["correct"] += int(is_correct(answer["selected_options"], correct))
    return {"buckets": list(buckets.values())}
