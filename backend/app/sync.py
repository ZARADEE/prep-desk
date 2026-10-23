"""Small, local-first state synchronisation API for the companion Mini Program.

The desktop application remains the source of truth for its SQLite records.  This
table is deliberately a narrow bridge for data that the offline Mini Program can
produce without keeping a desktop process open (for example the todo notebook and
its resumable practice state).  Values are versioned independently so a change to
one part of the state cannot overwrite an unrelated change made on the other side.
"""

from __future__ import annotations

import json
import os
import re
import uuid
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from .db import connect, json_load, row_to_question, utc_now
from .practice import answer_options, is_correct, normalize_options
from .review_scheduler import enroll_wrong


router = APIRouter(prefix="/api/sync", tags=["sync"])
SYNC_KEYS = {
    "todos",
    "target",
    "wrong",
    "history",
    "practiceSession",
    "practiceFilters",
    "timer",
    "notes", "mastery", "goals", "preferences", "sketches",
}
DEVICE_RE = re.compile(r"^[A-Za-z0-9._:-]{1,120}$")


def init_tables(connection: Any) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS sync_state (
            state_key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1,
            device_id TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_practice_sessions (
            client_session_id TEXT PRIMARY KEY,
            server_session_id TEXT NOT NULL UNIQUE,
            device_id TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )


def _check_token(token: str | None) -> None:
    expected = os.getenv("PAPER_HELPER_SYNC_TOKEN", "").strip()
    # A token is optional for the existing localhost-only desktop launcher.  A
    # deployment that exposes the API beyond its private LAN can turn it on.
    if expected and token != expected:
        raise HTTPException(status_code=401, detail="同步令牌无效。")


def _device(value: str) -> str:
    if not DEVICE_RE.fullmatch(value or ""):
        raise HTTPException(status_code=400, detail="设备标识无效。")
    return value


class SyncPush(BaseModel):
    device_id: str = Field(min_length=1, max_length=120)
    changes: dict[str, Any] = Field(default_factory=dict)
    base_values: dict[str, Any] | None = None


def merge_value(key: str, base: Any, incoming: Any, current: Any) -> Any:
    """Three-way merge. Only changes relative to the client's saved base apply."""
    if incoming == base:
        return current
    if current == base or incoming == current or current is None:
        return incoming
    if key == "todos" and isinstance(incoming, list) and isinstance(current, list):
        def indexed(items):
            if not isinstance(items, list): return {}
            result = {}
            for item in items:
                if not isinstance(item, dict) or "id" not in item:
                    raise HTTPException(422, "待办缺少稳定标识。")
                result[str(item["id"])] = item
            return result
        merged = merge_value("notes", indexed(base), indexed(incoming), indexed(current))
        return list(merged.values())
    if key in {"notes", "mastery", "sketches", "target"} and isinstance(incoming, dict) and isinstance(current, dict):
        before = base if isinstance(base, dict) else {}
        result = dict(current)
        missing = object()
        for item in set(before) | set(incoming):
            old, new, remote = before.get(item, missing), incoming.get(item, missing), current.get(item, missing)
            if old == new: continue
            if remote != old and remote != new:
                raise HTTPException(409, {"message": "同一条记录已在另一设备修改，请选择保留版本。", "key": key, "item": item, "current": current})
            if new is missing: result.pop(item, None)
            else: result[item] = new
        return result
    raise HTTPException(409, {"message": "记录版本冲突，请选择保留版本。", "key": key, "current": current})


class MiniAnswer(BaseModel):
    device_id: str = Field(min_length=1, max_length=120)
    client_session_id: str = Field(min_length=1, max_length=160)
    question_id: str = Field(min_length=1, max_length=300)
    selected_options: list[str] = Field(min_length=1, max_length=8)
    subject: str = Field(default="刷题", max_length=100)
    question_bank_id: str | None = Field(default=None, max_length=100)
    question_ids: list[str] = Field(default_factory=list, max_length=500)
    confidence_level: int | None = Field(default=None, ge=1, le=4)


def _rows(connection: Any, keys: list[str] | None = None) -> dict[str, Any]:
    if keys:
        keys = [key for key in keys if key in SYNC_KEYS]
    if keys:
        marks = ",".join("?" for _ in keys)
        rows = connection.execute(
            f"SELECT * FROM sync_state WHERE state_key IN ({marks})", keys
        ).fetchall()
    else:
        rows = connection.execute("SELECT * FROM sync_state").fetchall()
    return {
        row["state_key"]: {
            "value": json.loads(row["value_json"]),
            "revision": row["revision"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    }


@router.get("/state")
def pull_state(
    device_id: str = "desktop",
    keys: str = "",
    x_paper_helper_sync_token: str | None = Header(default=None),
) -> dict[str, Any]:
    _check_token(x_paper_helper_sync_token)
    device_id = _device(device_id)
    requested = [item.strip() for item in keys.split(",") if item.strip()] or None
    with connect() as connection:
        return {"ok": True, "device_id": device_id, "state": _rows(connection, requested)}


@router.post("/state")
def push_state(
    payload: SyncPush,
    x_paper_helper_sync_token: str | None = Header(default=None),
) -> dict[str, Any]:
    _check_token(x_paper_helper_sync_token)
    device_id = _device(payload.device_id)
    changes = {key: value for key, value in payload.changes.items() if key in SYNC_KEYS}
    if len(changes) > 20:
        raise HTTPException(status_code=400, detail="同步字段过多。")
    encoded = json.dumps(changes, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > 2_000_000:
        raise HTTPException(status_code=413, detail="同步数据过大。")
    with connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        now = utc_now()
        for key, value in changes.items():
            previous = connection.execute("SELECT value_json FROM sync_state WHERE state_key=?", (key,)).fetchone()
            if payload.base_values is not None:
                value = merge_value(key, payload.base_values.get(key), value, json.loads(previous[0]) if previous else None)
            serialized = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
            existing = connection.execute(
                "SELECT revision FROM sync_state WHERE state_key=?", (key,)
            ).fetchone()
            revision = (existing["revision"] if existing else 0) + 1
            connection.execute(
                """
                INSERT INTO sync_state(state_key,value_json,revision,device_id,updated_at)
                VALUES(?,?,?,?,?)
                ON CONFLICT(state_key) DO UPDATE SET
                    value_json=excluded.value_json, revision=excluded.revision,
                    device_id=excluded.device_id, updated_at=excluded.updated_at
                """,
                (key, serialized, revision, device_id, now),
            )
        state = _rows(connection)
    return {"ok": True, "device_id": device_id, "state": state}


@router.post("/practice/answer")
def record_mini_answer(
    payload: MiniAnswer,
    x_paper_helper_sync_token: str | None = Header(default=None),
) -> dict[str, Any]:
    """Record an offline Mini Program answer in the normal desktop practice tables."""
    _check_token(x_paper_helper_sync_token)
    device_id = _device(payload.device_id)
    selected = normalize_options(payload.selected_options)
    if not selected:
        raise HTTPException(status_code=400, detail="至少选择一个选项。")
    with connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        mapping = connection.execute(
            "SELECT server_session_id FROM sync_practice_sessions WHERE client_session_id=? AND device_id=?",
            (payload.client_session_id, device_id),
        ).fetchone()
        if mapping is None:
            ids = list(dict.fromkeys(payload.question_ids))
            if payload.question_id not in ids:
                ids.append(payload.question_id)
            existing = connection.execute(
                f"SELECT id FROM questions WHERE id IN ({','.join('?' for _ in ids)})", ids
            ).fetchall() if ids else []
            ids = [row["id"] for row in existing]
            if payload.question_id not in ids:
                raise HTTPException(status_code=404, detail="题目不存在或尚未同步到桌面数据库。")
            server_id = "mini-practice-" + uuid.uuid4().hex[:12]
            now = utc_now()
            connection.execute(
                """INSERT INTO practice_sessions(
                    id,subject,question_bank_id,major_tag,sub_tag,practice_mode,total_count,
                    answered_count,question_ids_json,wrong_question_ids_json,created_at
                ) VALUES(?,?,?,?,?,'standard',?,0,?,'[]',?)""",
                (server_id, payload.subject, payload.question_bank_id, "", "", len(ids), json.dumps(ids, ensure_ascii=False), now),
            )
            connection.execute(
                "INSERT INTO sync_practice_sessions(client_session_id,server_session_id,device_id,created_at) VALUES(?,?,?,?)",
                (payload.client_session_id, server_id, device_id, now),
            )
        else:
            server_id = mapping["server_session_id"]
        session = connection.execute("SELECT * FROM practice_sessions WHERE id=?", (server_id,)).fetchone()
        question_ids = json_load(session["question_ids_json"], [])
        if payload.question_id not in question_ids:
            raise HTTPException(status_code=400, detail="题目不属于当前练习。")
        prior = connection.execute(
            "SELECT is_correct,selected_option,correct_option FROM practice_attempts WHERE session_id=? AND question_id=?",
            (server_id, payload.question_id),
        ).fetchone()
        if prior is not None:
            return {"ok": True, "duplicate": True, "server_session_id": server_id, "correct": bool(prior["is_correct"])}
        row = connection.execute("SELECT * FROM questions WHERE id=?", (payload.question_id,)).fetchone()
        question = row_to_question(row)
        correct = answer_options(question.get("answer_markdown", ""))
        result = is_correct(selected, correct)
        now = utc_now()
        connection.execute(
            """INSERT INTO practice_attempts(
                id,session_id,question_id,selected_option,correct_option,is_correct,confidence_level,created_at
            ) VALUES(?,?,?,?,?,?,?,?)""",
            ("attempt-" + uuid.uuid4().hex[:12], server_id, payload.question_id, "".join(selected), "".join(correct), int(result), payload.confidence_level, now),
        )
        wrong_ids = json_load(session["wrong_question_ids_json"], [])
        if not result:
            enroll_wrong(connection, question, f"微信小程序答错 · 练习 {server_id}")
            connection.execute(
                """INSERT INTO wrong_questions(
                    question_id,subject,first_wrong_at,last_wrong_at,wrong_count,last_selected_option,last_correct_option
                ) VALUES(?,?,?,?,1,?,?) ON CONFLICT(question_id) DO UPDATE SET
                    last_wrong_at=excluded.last_wrong_at,wrong_count=wrong_questions.wrong_count+1,
                    last_selected_option=excluded.last_selected_option,last_correct_option=excluded.last_correct_option""",
                (payload.question_id, question.get("subject", payload.subject), now, now, "".join(selected), "".join(correct)),
            )
            if payload.question_id not in wrong_ids: wrong_ids.append(payload.question_id)
        answered = connection.execute("SELECT COUNT(*) AS count FROM practice_attempts WHERE session_id=?", (server_id,)).fetchone()["count"]
        connection.execute(
            "UPDATE practice_sessions SET answered_count=?,wrong_question_ids_json=?,completed_at=? WHERE id=?",
            (answered, json.dumps(wrong_ids, ensure_ascii=False), now if answered >= session["total_count"] else session["completed_at"], server_id),
        )
    return {"ok": True, "duplicate": False, "server_session_id": server_id, "correct": result, "answered_count": answered, "wrong_question_ids": wrong_ids}


@router.get("/health")
def sync_health(x_paper_helper_sync_token: str | None = Header(default=None)) -> dict[str, Any]:
    _check_token(x_paper_helper_sync_token)
    with connect() as connection:
        count = connection.execute("SELECT COUNT(*) AS count FROM sync_state").fetchone()["count"]
    return {"ok": True, "state_count": count}
