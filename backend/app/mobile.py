"""Phone library, downloadable study snapshots and portable personal backups."""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import threading
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .db import connect, row_to_question, utc_now, DATA_ROOT
from .question_bundle import bundled_preview

router = APIRouter(prefix="/api/mobile", tags=["mobile"])
RENDER_LOCK = threading.Semaphore(1)
PERSONAL_TABLES = (
    "papers", "paper_questions", "paper_blueprints", "paper_export_versions", "exam_sessions",
    "practice_sessions", "practice_attempts", "wrong_questions", "learning_notes",
    "subjective_sessions", "subjective_answers", "subjective_grade_events", "subjective_wrong",
    "scheduled_review_items", "review_events", "review_settings", "sync_state", "sync_practice_sessions",
)


def digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def question_year(question: dict) -> str:
    text = " ".join(str(question.get(key) or "") for key in ("id", "chapter", "source_document_id", "stem_markdown"))
    match = re.search(r"(?<!\d)((?:19|20)\d{2})(?:年|[-_ ]|$)", text)
    return match.group(1) if match else ""


@router.get("/questions")
def search_questions(q: str = Query("", max_length=200), bank: str = "", year: str = "", collection: str = "", page: int = Query(1, ge=1)):
    with connect() as c:
        sql = "SELECT q.* FROM questions q LEFT JOIN learning_notes n ON n.question_id=q.id WHERE q.review_status='approved'"
        args: list[Any] = []
        if bank: sql += " AND q.question_bank_id=?"; args.append(bank)
        if q:
            sql += " AND (q.id LIKE ? ESCAPE '\\' OR q.stem_markdown LIKE ? ESCAPE '\\')"
            term = '%' + q.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
            args.extend([term, term])
        if collection == "favorites": sql += " AND n.favorite=1"
        if collection == "notes": sql += " AND (n.note<>'' OR n.cause<>'')"
        rows = [row_to_question(row) for row in c.execute(sql + " ORDER BY q.id", args)]
    if year: rows = [row for row in rows if question_year(row) == year]
    # Search never returns reference answers, explanations, or scoring points.
    return {"total": len(rows), "page": page, "items": [{**{key: row.get(key) for key in ("id", "type", "subject", "question_bank_id", "stem_markdown", "tags", "chapter")}, "year": question_year(row)} for row in rows[(page-1)*30:page*30]]}


def render_content(question: dict, kind: str) -> bytes:
    existing = bundled_preview(question, kind)
    if existing: return existing
    parts = ([question.get("stem_markdown", "")] + [f"{item['key']}. {item['text']}" for item in question.get("options", [])]) if kind == "question" else [question.get("answer_markdown", ""), question.get("analysis_markdown", "")]
    payload = {"parts": parts, "renderer": 1}
    key = digest(payload)
    cache = DATA_ROOT / "mobile-render"
    cache.mkdir(parents=True, exist_ok=True)
    output = cache / (key + ".png")
    with RENDER_LOCK:
        if output.is_file(): return output.read_bytes()
        frontend = Path(__file__).resolve().parents[2] / "frontend"
        executable = frontend / "node_modules/electron/dist" / ("electron.exe" if os.name == "nt" else "electron")
        if not executable.is_file(): raise HTTPException(503, "题面渲染器尚未安装，请在电脑运行 setup.bat。")
        source = cache / (key + ".json")
        source.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        try:
            env = dict(os.environ); env.pop("ELECTRON_RUN_AS_NODE", None)
            subprocess.run([str(executable), str(frontend / "mobile-render.cjs"), str(source), str(output), "--no-sandbox"], check=True, timeout=40, capture_output=True, env=env, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except (subprocess.SubprocessError, OSError):
            raise HTTPException(503, "题面图片生成失败，请稍后重试；文字题面仍可阅读。") from None
        if not output.is_file(): raise HTTPException(503, "题面图片尚未生成。")
        return output.read_bytes()


@router.get("/content/{question_id}/{kind}")
def content(question_id: str, kind: Literal["question", "analysis"]):
    with connect() as c:
        row = c.execute("SELECT * FROM questions WHERE id=? AND review_status='approved'", (question_id,)).fetchone()
    if not row: raise HTTPException(404, "题目不存在。")
    image = render_content(row_to_question(row), kind)
    return Response(image, media_type="image/png", headers={"Cache-Control": "private, no-store", "X-Content-SHA256": hashlib.sha256(image).hexdigest()})


@router.get("/assets/{question_id}/{kind}")
def asset_manifest(question_id: str, kind: Literal['question', 'analysis']):
    response = content(question_id, kind)
    return {"path": f"/mobile/content/{question_id}/{kind}", "bytes": len(response.body), "md5": hashlib.md5(response.body).hexdigest(), "sha256": hashlib.sha256(response.body).hexdigest()}


class PackRequest(BaseModel):
    question_ids: list[str] = Field(min_length=1, max_length=100)
    title: str = Field(default="随身学习包", max_length=100)


@router.post("/packs")
def create_pack(payload: PackRequest):
    with connect() as c:
        rows = []
        for qid in dict.fromkeys(payload.question_ids):
            row = c.execute("SELECT * FROM questions WHERE id=? AND review_status='approved'", (qid,)).fetchone()
            if not row: raise HTTPException(404, f"题目 {qid} 不可下载。")
            rows.append(row_to_question(row))
    questions = []
    for row in rows:
        # Learning packages intentionally include answers; they are never used for strict exams.
        question = {key: row.get(key) for key in ("id", "type", "subject", "question_bank_id", "stem_markdown", "options", "answer_markdown", "analysis_markdown", "tags", "knowledge_points", "chapter", "score")}
        question['year'] = question_year(row)
        question['assets'] = [{"kind": kind, "path": f"/mobile/content/{row['id']}/{kind}"} for kind in ("question", "analysis")]
        questions.append(question)
    version = digest(questions)
    return {"schema": 1, "id": version[:20], "version": version, "title": payload.title, "created_at": utc_now(), "questions": questions,
            "text_bytes": len(json.dumps(questions, ensure_ascii=False).encode()), "asset_count": len(questions)*2}


@router.get("/exams")
def exam_records():
    from .exam import _expire, _public
    with connect() as c:
        rows = c.execute("SELECT * FROM exam_sessions ORDER BY started_at DESC LIMIT 100").fetchall()
        result = []
        for row in rows:
            value = _public(_expire(c, row))
            result.append({"id": value['id'], "title": value['paper']['title'], "started_at": value['started_at'], "deadline_at": value['deadline_at'], "submitted_at": value['submitted_at'], "pending_count": value['results']['pending_count'] if value['results'] else None})
    return {"items": result}


@router.post("/exams")
def start_phone_exam(payload: dict):
    from .exam import StartExam, start_exam
    try:
        request = StartExam.model_validate(payload)
    except Exception:
        raise HTTPException(422, "考卷编号或时限格式不正确。") from None
    return start_exam(request, allow_custom_duration=True)


@router.get("/backup")
def export_backup():
    with connect() as c:
        c.execute("BEGIN")
        tables = {table: [dict(row) for row in c.execute(f'SELECT * FROM "{table}"')] for table in PERSONAL_TABLES}
    # No connection token, API key, original document, or machine path is exported.
    payload = {"schema": 1, "created_at": utc_now(), "tables": tables}
    return {**payload, "checksum": digest(payload)}


class BackupImport(BaseModel):
    backup: dict[str, Any]
    apply: bool = False


@router.post("/backup/import")
def import_backup(payload: BackupImport):
    backup = dict(payload.backup)
    checksum = backup.pop("checksum", None)
    if backup.get("schema") != 1 or checksum != digest(backup): raise HTTPException(422, "备份版本或校验值不正确，当前数据未修改。")
    tables = backup.get("tables")
    if not isinstance(tables, dict) or set(tables) != set(PERSONAL_TABLES): raise HTTPException(422, "备份表清单不完整。")
    if len(json.dumps(backup).encode()) > 100_000_000: raise HTTPException(413, "备份超过 100 MB。")
    counts = {key: len(rows) if isinstance(rows, list) else -1 for key, rows in tables.items()}
    if min(counts.values()) < 0: raise HTTPException(422, "备份内容格式错误。")
    try:
        with connect() as c:
            c.execute("BEGIN IMMEDIATE")
            c.execute("PRAGMA defer_foreign_keys=ON")
            for table in PERSONAL_TABLES:
                columns = [dict(row) for row in c.execute(f'PRAGMA table_info("{table}")')]
                allowed = {col['name'] for col in columns}
                primary = [col['name'] for col in sorted(columns, key=lambda col: col['pk']) if col['pk']]
                for row in tables[table]:
                    if not isinstance(row, dict) or set(row) != allowed: raise ValueError("字段不完整")
                    # Validate all data inside the transaction, including foreign keys, even for preview.
                    where = ' AND '.join(f'"{key}"=?' for key in primary)
                    old = c.execute(f'SELECT * FROM "{table}" WHERE {where}', [row[key] for key in primary]).fetchone()
                    if old:
                        if table == 'scheduled_review_items' and (old['source_type'], old['source_id']) != (row['source_type'], row['source_id']):
                            raise ValueError("复习编号来自另一份数据库，不能自动合并")
                        continue  # Existing records win; importing never silently overwrites newer work.
                    names = ','.join(f'"{name}"' for name in row)
                    c.execute(f'INSERT INTO "{table}" ({names}) VALUES ({",".join("?" for _ in row)})', list(row.values()))
            if c.execute('PRAGMA foreign_key_check').fetchone(): raise ValueError("关联题目或记录缺失")
            if not payload.apply: c.rollback()
    except (ValueError, __import__('sqlite3').IntegrityError) as error:
        raise HTTPException(422, "备份无法合并，当前数据未修改：" + str(error)) from None
    return {"ok": True, "applied": payload.apply, "counts": counts, "rule": "保留当前同编号记录，只补入缺少的记录；缺少关联或编号冲突则整体取消。"}
