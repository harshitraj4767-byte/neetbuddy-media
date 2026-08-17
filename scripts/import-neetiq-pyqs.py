#!/usr/bin/env python3
"""Replace NEET PYQ papers from the password-protected NEETIQ archive.

Usage:
    python3 scripts/import-neetiq-pyqs.py /path/to/pyq.zip

Required environment variable: SB_DB_URL
The archive password is NEETIQ. Only 2016–2025 are imported. Existing paper
IDs are retained so historical attempts remain attached to the right paper.
"""

from __future__ import annotations

import json
import base64
import os
import re
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5


YEARS = range(2016, 2026)


def flatten_correct(value: object) -> list[str]:
    while isinstance(value, list) and len(value) == 1:
        value = value[0]
    values = value if isinstance(value, list) else [value]
    return [str(item).upper() for item in values if str(item).upper() in {"A", "B", "C", "D"}]


def rich_question_text(question: dict, question_key: str) -> tuple[str, list[tuple[str, str]]]:
    fallback = str(question.get("text") or "").strip()
    content = (question.get("question_body") or {}).get("content") or []
    parts: list[str] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        value = str(block.get("value") or "").strip()
        if value and (not parts or value != parts[-1]):
            parts.append(value)
    if not parts:
        return fallback, []
    if fallback and fallback not in parts and not parts[0].startswith(fallback):
        parts.insert(0, fallback)
    text = "\n\n".join(parts)
    diagrams: list[tuple[str, str]] = []

    def replace_svg(match: re.Match[str]) -> str:
        svg = match.group(0)
        diagram_id = str(uuid5(NAMESPACE_URL, f"neetiq:{question_key}:diagram:{len(diagrams)}"))
        diagrams.append((diagram_id, svg))
        return f"\n\n![diagram](/api/public/diagram/{diagram_id})\n\n"

    text = re.sub(r"<svg\b[\s\S]*?</svg>", replace_svg, text, flags=re.IGNORECASE)
    return text, diagrams


def sql_literal(value: object) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def main(archive: str) -> None:
    db_url = os.environ.get("SB_DB_URL")
    if not db_url:
        raise SystemExit("SB_DB_URL is required")

    with tempfile.TemporaryDirectory(prefix="neetiq-pyq-") as tmp:
        subprocess.run(["7z", "x", "-y", "-pNEETIQ", archive, f"-o{tmp}"], check=True, stdout=subprocess.DEVNULL)
        root = Path(tmp) / "pyq" / "yearwise"
        papers: dict[tuple[int, str], list[dict]] = defaultdict(list)
        for year in YEARS:
            payload = json.loads((root / f"pyq_{year}.json").read_text(encoding="utf-8"))
            for question in payload.get("questions", []):
                papers[(year, str(question.get("paper_set") or "Main"))].append(question)

        sql = ["BEGIN;"]
        # Preserve papers and attempts, replacing only question content.
        sql.append("DELETE FROM public.question_diagrams WHERE question_id IN (SELECT id FROM public.neet_pyq_questions WHERE year BETWEEN 2016 AND 2025);")
        sql.append("DELETE FROM public.neet_pyq_questions WHERE year BETWEEN 2016 AND 2025;")
        wanted_ext_ids: list[str] = []
        for (year, paper_set), questions in sorted(papers.items()):
            ext_id = f"pyq_{year}_{paper_set}"
            wanted_ext_ids.append(ext_id)
            title = f"NEET {year}" if len([key for key in papers if key[0] == year]) == 1 else f"NEET {year} ({paper_set})"
            sql.append(
                "INSERT INTO public.neet_pyq_papers (ext_id,title,year,total_questions,duration_minutes) VALUES "
                f"({sql_literal(ext_id)},{sql_literal(title)},{year},{len(questions)},180) "
                "ON CONFLICT (ext_id) DO UPDATE SET title=EXCLUDED.title,year=EXCLUDED.year,"
                "total_questions=EXCLUDED.total_questions,duration_minutes=EXCLUDED.duration_minutes;"
            )
            for position, q in enumerate(sorted(questions, key=lambda item: int(item.get("question_no") or 9999)), 1):
                options = q.get("options") if isinstance(q.get("options"), list) else []
                normalized_options = [
                    {"key": str(option.get("key") or chr(65 + index)).upper(), "text": str(option.get("text") or "")}
                    for index, option in enumerate(options[:4]) if isinstance(option, dict)
                ]
                correct = flatten_correct(q.get("correct"))
                if len(normalized_options) != 4 or not correct:
                    raise ValueError(f"Invalid question {year}/{paper_set}/{q.get('id')}")
                question_key = f"{year}:{paper_set}:{q.get('id')}"
                question_text, diagrams = rich_question_text(q, question_key)
                values = {
                    "year": year,
                    "subject": q.get("subject") or "General",
                    "chapter": q.get("chapter") or "General",
                    "topic": q.get("topic"),
                    "sub_subject": q.get("sub_subject"),
                    "class_level": q.get("class_level"),
                    "difficulty": q.get("difficulty") or "Medium",
                    "text": question_text,
                    "options": json.dumps(normalized_options, ensure_ascii=False, separators=(",", ":")),
                    "correct": json.dumps(correct, separators=(",", ":")),
                    "explanation": q.get("explanation") or "Explanation not provided.",
                    "question_no": q.get("question_no") or position,
                    "ext_id_str": question_key,
                }
                sql.append(
                    "INSERT INTO public.neet_pyq_questions "
                    "(ext_id,year,subject,chapter,topic,sub_subject,class_level,difficulty,text,options,correct,explanation,paper_id,paper_ext_id,question_no,ext_id_str) "
                    "SELECT NULL," + ",".join([
                        str(values["year"]), sql_literal(values["subject"]), sql_literal(values["chapter"]),
                        sql_literal(values["topic"]), sql_literal(values["sub_subject"]), sql_literal(values["class_level"]),
                        sql_literal(values["difficulty"]), sql_literal(values["text"]), sql_literal(values["options"]) + "::jsonb",
                        sql_literal(values["correct"]) + "::jsonb", sql_literal(values["explanation"]), "id", sql_literal(ext_id),
                        str(values["question_no"]), sql_literal(values["ext_id_str"]),
                    ]) + f" FROM public.neet_pyq_papers WHERE ext_id={sql_literal(ext_id)};"
                )
                for diagram_id, svg in diagrams:
                    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
                    sql.append(
                        "INSERT INTO public.question_diagrams (id,question_id,mime,data,prompt) SELECT "
                        f"{sql_literal(diagram_id)}::uuid,id,'image/svg+xml',decode({sql_literal(encoded)},'base64'),'NEETIQ PYQ diagram' "
                        f"FROM public.neet_pyq_questions WHERE ext_id_str={sql_literal(question_key)};"
                    )
        ids = ",".join(sql_literal(item) for item in wanted_ext_ids)
        sql.append(f"DELETE FROM public.neet_pyq_papers WHERE year BETWEEN 2016 AND 2025 AND ext_id NOT IN ({ids});")
        sql.append("COMMIT;")
        script = Path(tmp) / "import.sql"
        script.write_text("\n".join(sql), encoding="utf-8")
        subprocess.run(["psql", db_url, "-v", "ON_ERROR_STOP=1", "-f", str(script)], check=True, stdout=subprocess.DEVNULL)

    total = sum(len(rows) for rows in papers.values())
    print(f"Imported {total} questions across {len(papers)} papers for 2016–2025.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: import-neetiq-pyqs.py /path/to/pyq.zip")
    main(sys.argv[1])