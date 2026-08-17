#!/usr/bin/env python3
"""Bulk import the NEET question bank JSON export into qb_* tables.

Usage:
    python3 scripts/import-final-json.py <json-root-dir>

The JSON root must contain one folder per subject (physics/chemistry/biology)
with one .json file per chapter. Each file is a list of question objects:

    {
      "id": 103519, "question": "...", "explanation": "...",
      "options": [{ "id": "1", "text": "...", "isCorrect": true }, ...],
      "difficulty": "Easy", "type": "Match the following",
      "subject": "Chemistry", "chapter": "...", "topic": "...", "subtopic": "...",
      "subject_id": 2, "chapter_id": 44, "topic_id": 401, "subtopic_id": 798,
      "image": "/img/data/chemistry/44_103790_question_1.png", "hasImage": true,
      "year": 2019, "tag": "NEET"
    }

Images: only the CDN-relative path (e.g. `chemistry/44_103790_question_1.png`)
is stored in `qb_questions.question_image_url`. The frontend resolves it via
`src/lib/qbank-images.ts`, so the image host can change with no data migration.
"""

import json
import os
import re
import sys
import csv

SUBJECTS = {"physics": "Physics", "chemistry": "Chemistry", "biology": "Biology"}


def norm_image(raw):
    """Return a host-agnostic relative path, or an absolute URL untouched."""
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None
    if re.match(r"^(https?:|data:|blob:)", s, re.I):
        return s
    s = re.sub(r"^/?(?:img/data/|public/)", "", s.lstrip("/"))
    return s or None


def norm_year(raw):
    """`2012`, `"2012"`, `"[2012]"`, `"2012, 2015"` -> first 4-digit year int."""
    if raw is None:
        return None
    m = re.search(r"(19|20)\d{2}", str(raw))
    return int(m.group(0)) if m else None


def main(root, outdir):
    chapters = {}   # id -> (subject_id, name)
    topics = {}     # id -> (chapter_id, name)
    subtopics = {}  # id -> (topic_id, name)
    questions = {}  # id -> row (dedupe: later files win)

    skipped = []
    for subject_dir in sorted(os.listdir(root)):
        sub_path = os.path.join(root, subject_dir)
        if not os.path.isdir(sub_path):
            continue
        subject_id = subject_dir.lower()
        if subject_id not in SUBJECTS:
            continue
        for fname in sorted(os.listdir(sub_path)):
            if not fname.endswith(".json"):
                continue
            with open(os.path.join(sub_path, fname), encoding="utf-8") as fh:
                rows = json.load(fh)
            for q in rows:
                qid = q.get("id")
                chap_id = q.get("chapter_id")
                if qid is None or chap_id is None:
                    skipped.append((fname, qid, "missing id/chapter_id"))
                    continue
                opts = q.get("options") or []
                texts, correct = [], None
                for i, o in enumerate(opts):
                    if isinstance(o, dict):
                        texts.append({"text": o.get("text") or o.get("label") or "",
                                      "isCorrect": bool(o.get("isCorrect"))})
                        if o.get("isCorrect"):
                            correct = i if correct is None else correct
                    else:
                        texts.append({"text": str(o), "isCorrect": False})
                if not texts or correct is None:
                    skipped.append((fname, qid, "no options / no correct answer"))
                    continue

                chapters[int(chap_id)] = (subject_id, q.get("chapter") or f"Chapter {chap_id}")
                tid = q.get("topic_id")
                if tid:
                    topics[int(tid)] = (int(chap_id), q.get("topic") or f"Topic {tid}")
                stid = q.get("subtopic_id")
                if stid and tid:
                    subtopics[int(stid)] = (int(tid), q.get("subtopic") or f"Subtopic {stid}")

                questions[int(qid)] = {
                    "id": int(qid),
                    "subject_id": subject_id,
                    "chapter_id": int(chap_id),
                    "topic_id": int(tid) if tid else None,
                    "subtopic_id": int(stid) if (stid and tid) else None,
                    "question_html": q.get("question") or "",
                    "options": json.dumps(texts, ensure_ascii=False),
                    "correct_index": correct,
                    "explanation": q.get("explanation") or None,
                    "question_image_url": norm_image(q.get("image")),
                    "difficulty": (q.get("difficulty") or "Medium").strip().title(),
                    "qtype": q.get("type") or "MCQ",
                    "year": norm_year(q.get("year")),
                    "tag": q.get("tag") or None,
                }

    os.makedirs(outdir, exist_ok=True)

    def dump(name, header, rows):
        path = os.path.join(outdir, name)
        with open(path, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh, quoting=csv.QUOTE_ALL, lineterminator="\n")
            w.writerow(header)
            for r in rows:
                w.writerow(["" if v is None else v for v in r])
        return path

    dump("chapters.csv", ["id", "subject_id", "name"],
         [(cid, v[0], v[1]) for cid, v in sorted(chapters.items())])
    dump("topics.csv", ["id", "chapter_id", "name"],
         [(tid, v[0], v[1]) for tid, v in sorted(topics.items())])
    dump("subtopics.csv", ["id", "topic_id", "name"],
         [(sid, v[0], v[1]) for sid, v in sorted(subtopics.items())])
    cols = ["id", "subject_id", "chapter_id", "topic_id", "subtopic_id", "question_html",
            "options", "correct_index", "explanation", "question_image_url",
            "difficulty", "qtype", "year", "tag"]
    dump("questions.csv", cols, [[questions[k][c] for c in cols] for k in sorted(questions)])

    print(f"chapters={len(chapters)} topics={len(topics)} subtopics={len(subtopics)} "
          f"questions={len(questions)} with_image="
          f"{sum(1 for q in questions.values() if q['question_image_url'])} skipped={len(skipped)}")
    for s in skipped[:20]:
        print("  skipped:", s)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "/tmp/qb-import")
