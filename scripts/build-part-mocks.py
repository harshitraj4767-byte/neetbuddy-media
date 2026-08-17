#!/usr/bin/env python3
"""Build 10 Class-11 and 10 Class-12 NEET part mock tests.

Design rules (professional NTA-style part tests):
  * 120 questions / 120 minutes, +4 / -1.
  * Subject split: Physics 30, Chemistry 30, Biology 60.
  * Each mock covers 8-12 chapters only.
  * Across the 10 mocks of a class every chapter appears exactly twice
    (a few appear 3x where the count does not divide evenly), so the
    class syllabus is covered twice.
  * Difficulty mix per chapter block: 35% Easy, 45% Medium, 20% Hard.
  * No question repeats inside a class-wise series.
"""
import json
import random
import subprocess
import os

DB = os.environ["SB_DB_URL"]
CAT = {11: "24d117b3-ba95-4f76-a3b8-e1b8a48b379b", 12: "d000291e-331b-44d3-a5e0-cc3dbfd94b7d"}
EXISTING = {
    11: ["32565250-3d78-43c8-a706-5922110e8333", "c7be0c7f-01be-4436-8eea-e469a18a3743",
         "a5032a51-13b0-41c8-aa62-31f7ab043e3e", "52ee2418-4aba-427d-9ff6-b50e4dba0f20",
         "3f836769-d0b5-4cf8-9781-571fa677afc4", "aa442a4b-2781-453c-8a4f-07c8baeef68e"],
    12: ["79c8ea7d-e9c3-43dc-9b2c-a549a526a808", "d894f459-e779-4408-a7a4-1b4b0d39aa03",
         "98f75bf2-fde7-46db-a94a-dc6543dfbd38", "49769ee5-bd32-447f-9c5e-99c29489a490",
         "ea3b927f-ab29-4a85-9fc9-0129d691361f", "373c377e-f5bd-464c-8fd3-51373444dc93",
         "6997e06b-f037-4117-9815-40b9dd6d3467"],
}
SUBJECT_NAME = {"physics": "Physics", "chemistry": "Chemistry", "biology": "Biology"}
QUOTA = {"physics": 30, "chemistry": 30, "biology": 60}
MIX = [("Easy", 0.35), ("Medium", 0.45), ("Hard", 0.20)]


def q(sql):
    out = subprocess.run(["psql", DB, "-At", "-F", "\x1f", "-c", sql],
                         capture_output=True, text=True, check=True).stdout
    return [line.split("\x1f") for line in out.splitlines() if line]


# ---- load chapters -------------------------------------------------
chapters = {}  # class -> subject -> [(id, name)]
for cls, subj, cid, name in q(
    "select ch.class, ch.subject_id, ch.id, ch.name from chapters ch "
    "order by ch.class, ch.subject_id, ch.order_index"
):
    chapters.setdefault(int(cls), {}).setdefault(subj, []).append((cid, name))

# ---- load quality question pool -----------------------------------
pool = {}  # chapter_id -> difficulty -> [ids]
for cid, diff, qid in q(
    "select q.chapter_id, q.difficulty, q.id from questions q "
    "where q.options is not null and array_length(q.options,1)=4 "
    "and q.correct_index is not null and q.correct_index between 0 and 3 "
    "and q.explanation is not null and length(q.explanation) > 25 "
    "and length(q.text) between 25 and 700 "
    "order by q.chapter_id, q.difficulty, md5(q.id)"
):
    pool.setdefault(cid, {}).setdefault(diff, []).append(qid)

rng = random.Random(20260727)


def assign_chapters(items, n_mocks=10, start=0):
    """Deal each chapter into >=2 different mocks, perfectly balanced.

    The chapter list is duplicated (syllabus covered twice) and padded up
    to a multiple of n_mocks so every mock receives the same number of
    chapters from this subject. Copies of a chapter are n_mocks apart in
    the deal order, so a chapter can never land twice in one mock.
    """
    deck = list(items) + list(items)
    while len(deck) % n_mocks:
        deck.append(items[(len(deck) - 2 * len(items)) % len(items)])
    buckets = [[] for _ in range(n_mocks)]
    for i, item in enumerate(deck):
        buckets[(i + start) % n_mocks].append(item)
    return buckets


def pick(chapter_id, count, used):
    """Pick `count` questions from a chapter honouring the difficulty mix."""
    want = {}
    left = count
    for i, (diff, share) in enumerate(MIX):
        k = left if i == len(MIX) - 1 else round(count * share)
        want[diff] = k
        left -= k
    chosen, shortfall = [], 0
    for diff, k in want.items():
        avail = [x for x in pool.get(chapter_id, {}).get(diff, []) if x not in used]
        rng.shuffle(avail)
        take = avail[:k]
        shortfall += k - len(take)
        chosen += take
        used.update(take)
    if shortfall:  # top up from any difficulty in the same chapter
        rest = [x for d in pool.get(chapter_id, {}).values() for x in d if x not in used]
        rng.shuffle(rest)
        chosen += rest[:shortfall]
        used.update(rest[:shortfall])
    return chosen


def short(name):
    return name.split("(")[0].split(":")[0].strip()


statements = []
for cls in (11, 12):
    used = set()
    starts = {"physics": 0, "chemistry": 4, "biology": 7}
    per_subject = {s: assign_chapters(chapters[cls][s], start=starts[s]) for s in QUOTA}
    for m in range(10):
        syllabus, qids = [], []
        for subj, quota in QUOTA.items():
            chs = per_subject[subj][m]
            base, extra = divmod(quota, len(chs))
            picked_here = []
            for j, (cid, name) in enumerate(chs):
                picked_here += pick(cid, base + (1 if j < extra else 0), used)
            qids += picked_here
            syllabus.append({
                "subjectId": subj,
                "subjectName": SUBJECT_NAME[subj],
                "chapters": [{"id": c, "name": n} for c, n in chs],
            })
        rng.shuffle(qids)
        n_ch = sum(len(s["chapters"]) for s in syllabus)
        theme = " • ".join(short(per_subject[s][m][m % len(per_subject[s][m])][1]) for s in QUOTA)
        title = f"NEET Class {cls} Part Test {m + 1:02d} — {theme}"
        desc = (f"{len(qids)}-question NTA-pattern part test covering {n_ch} Class {cls} chapters "
                f"(Physics 30 • Chemistry 30 • Biology 60). Balanced Easy–Medium–Hard mix, "
                f"+4 / -1 marking, 120 minutes.")
        row = {
            "title": title, "description": desc, "type": "mock", "difficulty": "medium",
            "duration_min": 120, "total_questions": len(qids), "question_ids": qids,
            "marks_correct": 4, "marks_wrong": -1, "source": "NEET Part Test Series",
            "syllabus": syllabus, "category_id": CAT[cls],
        }
        row_id = EXISTING[cls][m] if m < len(EXISTING[cls]) else None
        statements.append((row_id, row))
        print(f"{title}: {len(qids)} Qs / {n_ch} chapters")

# ---- emit SQL ------------------------------------------------------
def lit(v):
    return "'" + str(v).replace("'", "''") + "'"


sql = ["begin;"]
for row_id, r in statements:
    arr = "ARRAY[" + ",".join(lit(x) for x in r["question_ids"]) + "]::text[]"
    syl = lit(json.dumps(r["syllabus"])) + "::jsonb"
    cols = (f"title={lit(r['title'])}, description={lit(r['description'])}, type='mock', "
            f"difficulty='medium', duration_min=120, total_questions={r['total_questions']}, "
            f"question_ids={arr}, marks_correct=4, marks_wrong=-1, "
            f"source={lit(r['source'])}, syllabus={syl}, category_id={lit(r['category_id'])}")
    if row_id:
        sql.append(f"update public.tests set {cols} where id={lit(row_id)};")
    else:
        sql.append(
            "insert into public.tests (title,description,type,difficulty,duration_min,"
            "total_questions,question_ids,marks_correct,marks_wrong,source,syllabus,category_id) "
            f"values ({lit(r['title'])},{lit(r['description'])},'mock','medium',120,"
            f"{r['total_questions']},{arr},4,-1,{lit(r['source'])},{syl},{lit(r['category_id'])});"
        )
sql.append("commit;")
open("/tmp/mocks.sql", "w").write("\n".join(sql))
print("wrote /tmp/mocks.sql")
