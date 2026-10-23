"""Export a compact read-only snapshot of the desktop question bank."""
from __future__ import annotations

import json
import re
import sqlite3
from collections import Counter
from pathlib import Path
import shutil
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "backend" / "data" / "paper_helper.sqlite3"
OUTPUT = ROOT / "data"
MAX_CHUNK_BYTES = 380_000
MAX_PACKAGE_BYTES = 1_250_000


def decode(value, default):
    try:
        return json.loads(value) if value else default
    except (ValueError, TypeError):
        return default


def compact(row):
    return {
        "id": row["id"], "type": row["type"], "subject": row["subject"],
        "bank": row["question_bank_id"], "stem": row["stem_markdown"] or "",
        "options": decode(row["options_json"], []),
        "answer": row["answer_markdown"] or "",
        "analysis": row["analysis_markdown"] or "",
        "tags": decode(row["tags_json"], []),
        "chapter": row["chapter"] or "", "score": row["score"] or 0,
    }


def answer_letters(answer):
    text = (answer or "").upper().translate(str.maketrans("ＡＢＣＤ", "ABCD"))
    match = re.search(r"(?:正确答案|参考答案|答案)\s*[:：]?\s*([ABCD]{1,4})", text)
    return match.group(1) if match else re.sub(r"[^A-D]", "", text)


def answer_mode(answer):
    letters = answer_letters(answer)
    return "multiple" if len(set(letters)) > 1 and len(letters) <= 4 else "single"


def emit(path, rows):
    payload = "module.exports=" + json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + ";\n"
    path.write_text(payload, encoding="utf-8")
    return len(payload.encode("utf-8"))


def write_package(index, rows):
    root = f"packages/pack{index:02d}"
    target = ROOT / root
    target.mkdir(parents=True, exist_ok=True)
    files, chunk, chunk_bytes = [], [], 16
    for item in rows:
        item_bytes = len(json.dumps(item, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) + 1
        if chunk and chunk_bytes + item_bytes > MAX_CHUNK_BYTES:
            name = f"part{len(files) + 1}.js"
            files.append(name)
            emit(target / name, chunk)
            chunk, chunk_bytes = [], 16
        chunk.append(item)
        chunk_bytes += item_bytes
    if chunk:
        name = f"part{len(files) + 1}.js"
        files.append(name)
        emit(target / name, chunk)
    require_lines = [f"require('./{name}')" for name in files]
    (target / "questions.js").write_text("module.exports=[].concat(" + ",".join(require_lines) + ");\n", encoding="utf-8")
    (target / "index.js").write_text(
        "const create = require('../../shared/practice-controller.js').create;\n"
        f"Page(create(require('./questions.js'), '{root}'));\n", encoding="utf-8"
    )
    (target / "index.json").write_text('{"navigationBarTitleText":"刷题","usingComponents":{"question-content":"/components/question-content/index"}}\n', encoding="utf-8")
    for extension in ("wxml", "wxss"):
        shutil.copyfile(ROOT / "tools" / ("practice-template." + extension), target / ("index." + extension))
    return {
        "root": root,
        "subject": rows[0]["subject"],
        "count": len(rows),
        "majors": dict(Counter((q["tags"][0] if q["tags"] else q["chapter"] or "综合") for q in rows)),
        "types": dict(Counter(q["type"] for q in rows)),
        "bytes": sum(path.stat().st_size for path in target.iterdir() if path.is_file()),
    }


def main():
    if not SOURCE.is_file():
        raise SystemExit(f"Desktop database missing: {SOURCE}")
    OUTPUT.mkdir(exist_ok=True)
    connection = sqlite3.connect(f"file:{quote(str(SOURCE))}?mode=ro&immutable=1", uri=True)
    connection.row_factory = sqlite3.Row
    questions = [compact(row) for row in connection.execute(
        "SELECT id, type, subject, question_bank_id, stem_markdown, options_json, "
        "answer_markdown, analysis_markdown, tags_json, chapter, score FROM questions "
        "WHERE review_status='approved' ORDER BY subject, type, id"
    )]
    banks = [dict(row) for row in connection.execute(
        "SELECT id, name, subject FROM question_banks ORDER BY name"
    )]
    templates = []
    for row in connection.execute(
        "SELECT id, name, subject, question_bank_id, duration_minutes, total_score, sections_json, distribution_rules_json FROM templates ORDER BY name"
    ):
        item = dict(row)
        item["sections"] = decode(item.pop("sections_json"), [])
        item["distribution_rules"] = decode(item.pop("distribution_rules_json"), {})
        templates.append(item)
    connection.close()

    packages = ROOT / "packages"
    if packages.exists():
        shutil.rmtree(packages)
    parts = []
    chunk = []
    chunk_bytes = 16
    for item in questions:
        item_bytes = len(json.dumps(item, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) + 1
        if chunk and (chunk_bytes + item_bytes > MAX_PACKAGE_BYTES or item["subject"] != chunk[0]["subject"]):
            parts.append(write_package(len(parts) + 1, chunk))
            chunk, chunk_bytes = [], 16
        chunk.append(item)
        chunk_bytes += item_bytes
    if chunk:
        parts.append(write_package(len(parts) + 1, chunk))
    counts = dict(Counter(question["subject"] for question in questions))
    index = []
    offset = 0
    for part in parts:
        for q in questions[offset:offset + part["count"]]:
            entry = {"id": q["id"], "root": part["root"], "bank": q["bank"],
                          "type": q["type"],
                          "tags": q["tags"], "chapter": q["chapter"],
                          "mode": answer_mode(q["answer"]) if q["type"] == "choice" else ""}
            if q["type"] == "choice" and (not q["options"] or not 1 <= len(answer_letters(q["answer"])) <= 4):
                entry["ungradable"] = True
            index.append(entry)
        offset += part["count"]
    emit(OUTPUT / "question-index.js", index)
    metadata = {"banks": banks, "templates": templates, "counts": counts, "parts": parts}
    emit(OUTPUT / "catalog.js", metadata)
    app_json = ROOT / "app.json"
    app = json.loads(app_json.read_text(encoding="utf-8"))
    app["subPackages"] = [{"root": item["root"], "pages": ["index"]} for item in parts]
    app_json.write_text(json.dumps(app, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"questions": len(questions), "subjects": counts, "chunks": parts,
                      "total_bytes": sum(part["bytes"] for part in parts)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
