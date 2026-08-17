#!/usr/bin/env python3
"""Insert 20 fresh NEET 2026 mocks across 5 categories (4 mocks each):
  * Full Syllabus (mixed 11+12) — 180 Q
  * Class 11 Part Test — 120 Q, 8-12 chapters
  * Class 12 Part Test — 120 Q, 8-12 chapters
  * Class 11 Full Syllabus — 180 Q, all Class 11 chapters
  * Class 12 Full Syllabus — 180 Q, all Class 12 chapters

Quality gate is strict: 4 options, valid correct index, explanation > 25
chars, text 25-700 chars. NEET subject weightage: Bio 50%, Phy 25%, Chem 25%.
Difficulty mix 30% Easy, 50% Medium, 20% Hard.
"""
import json, random, os, subprocess

DB = os.environ["SB_DB_URL"]
CATS = {
    "full":     "fb85871f-725b-4ff2-aaae-3cca4a8c7d43",  # Full Syllabus
    "c11_part": "11111111-2222-3333-4444-555555555511",
    "c12_part": "11111111-2222-3333-4444-555555555512",
    "c11_full": "24d117b3-ba95-4f76-a3b8-e1b8a48b379b",
    "c12_full": "d000291e-331b-44d3-a5e0-cc3dbfd94b7d",
}
SUBJ_NAME = {"physics": "Physics", "chemistry": "Chemistry", "biology": "Biology"}

def q(sql):
    out = subprocess.run(["psql", DB, "-At", "-F", "\x1f", "-c", sql],
                         capture_output=True, text=True, check=True).stdout
    return [line.split("\x1f") for line in out.splitlines() if line]

# chapters[class][subject] = [(id,name)]
chapters = {}
for cls, subj, cid, name in q(
    "select ch.class, ch.subject_id, ch.id, ch.name from chapters ch "
    "order by ch.class, ch.subject_id, ch.order_index"
):
    chapters.setdefault(int(cls), {}).setdefault(subj, []).append((cid, name))

# pool[chapter_id][difficulty] = [qid]
pool = {}
for cid, diff, qid in q(
    "select q.chapter_id, q.difficulty, q.id from questions q "
    "where q.options is not null and array_length(q.options,1)=4 "
    "and q.correct_index is not null and q.correct_index between 0 and 3 "
    "and q.explanation is not null and length(q.explanation) > 25 "
    "and length(q.text) between 25 and 700 "
    "order by q.chapter_id, q.difficulty, md5(q.id)"
):
    pool.setdefault(cid, {}).setdefault(diff, []).append(qid)

rng = random.Random(20260728)
MIX = [("Easy", 0.30), ("Medium", 0.50), ("Hard", 0.20)]


def pick_from(chapter_id, count, used):
    want, left = {}, count
    for i, (d, s) in enumerate(MIX):
        k = left if i == len(MIX)-1 else round(count * s)
        want[d] = k; left -= k
    chosen = []
    for d, k in want.items():
        avail = [x for x in pool.get(chapter_id, {}).get(d, []) if x not in used]
        rng.shuffle(avail)
        take = avail[:k]
        chosen += take; used.update(take)
    # top up
    if len(chosen) < count:
        rest = [x for dd in pool.get(chapter_id, {}).values() for x in dd if x not in used]
        rng.shuffle(rest)
        chosen += rest[:count-len(chosen)]; used.update(chosen)
    return chosen


def deal(chs_with_pool, quota):
    """Deal `quota` questions across chapters (round-robin, weighted by pool size)."""
    used = set()
    # sort by pool size desc so heavier chapters get their fair share
    chs = sorted(chs_with_pool, key=lambda c: -sum(len(v) for v in pool.get(c[0], {}).values()))
    base, extra = divmod(quota, len(chs))
    picked = []
    for i, (cid, name) in enumerate(chs):
        n = base + (1 if i < extra else 0)
        picked += pick_from(cid, n, used)
    return picked, chs


def build_mock(idx, title, desc, cat_id, chapter_groups, quota_per_subject, duration, total):
    """chapter_groups: [(subject_key, [(cid,name),...]), ...]. Returns row dict."""
    all_ids, syllabus = [], []
    for subj, chs in chapter_groups:
        q_ids, chs_used = deal(chs, quota_per_subject[subj])
        all_ids += q_ids
        syllabus.append({
            "subjectId": subj,
            "subjectName": SUBJ_NAME[subj],
            "chapters": [{"id": c, "name": n} for c, n in chs_used],
        })
    rng.shuffle(all_ids)
    return {
        "title": title, "description": desc, "type": "mock", "difficulty": "medium",
        "duration_min": duration, "total_questions": len(all_ids),
        "question_ids": all_ids, "marks_correct": 4, "marks_wrong": -1,
        "source": "NEET 2026 Prep Series", "syllabus": syllabus, "category_id": cat_id,
    }


rows = []

# ---- 4 x FULL SYLLABUS (11+12 combined) 180 Q -------------------------
for i in range(1, 5):
    grp = []
    for s in ("physics", "chemistry", "biology"):
        combined = chapters[11][s] + chapters[12][s]
        rng.shuffle(combined)
        grp.append((s, combined[:18]))
    rows.append(build_mock(
        i,
        f"NEET 2026 Full Syllabus Mock 0{i} — Grand Simulation",
        "NEET 2026-pattern full-syllabus mock. Class 11 + 12 combined, "
        "NEET weightage (Bio 90 • Chem 45 • Phy 45), quality-vetted questions, "
        "180 min, +4 / -1, 30% Easy • 50% Medium • 20% Hard.",
        CATS["full"], grp,
        {"physics": 45, "chemistry": 45, "biology": 90}, 180, 180))

# ---- 4 x CLASS 11 PART TEST 120 Q -------------------------------------
c11_starts = [0, 3, 6, 9]
for i, start in enumerate(c11_starts, 1):
    grp = []
    for s, take in (("physics", 4), ("chemistry", 4), ("biology", 5)):
        chs = chapters[11][s]
        picked = chs[start % len(chs):start % len(chs) + take]
        if len(picked) < take:
            picked = (chs * 2)[start:start+take]
        grp.append((s, picked))
    rows.append(build_mock(
        i,
        f"NEET 2026 Class 11 Part Test 1{i} — Focused Blocks",
        "NEET 2026 pattern part test on selected Class 11 chapters "
        "(Physics 30 • Chemistry 30 • Biology 60). 120 min, +4 / -1, "
        "difficulty 30/50/20.",
        CATS["c11_part"], grp,
        {"physics": 30, "chemistry": 30, "biology": 60}, 120, 120))

# ---- 4 x CLASS 12 PART TEST 120 Q -------------------------------------
c12_starts = [0, 3, 6, 9]
for i, start in enumerate(c12_starts, 1):
    grp = []
    for s, take in (("physics", 4), ("chemistry", 4), ("biology", 5)):
        chs = chapters[12][s]
        picked = chs[start % len(chs):start % len(chs) + take]
        if len(picked) < take:
            picked = (chs * 2)[start:start+take]
        grp.append((s, picked))
    rows.append(build_mock(
        i,
        f"NEET 2026 Class 12 Part Test 1{i} — Focused Blocks",
        "NEET 2026 pattern part test on selected Class 12 chapters "
        "(Physics 30 • Chemistry 30 • Biology 60). 120 min, +4 / -1, "
        "difficulty 30/50/20.",
        CATS["c12_part"], grp,
        {"physics": 30, "chemistry": 30, "biology": 60}, 120, 120))

# ---- 4 x CLASS 11 FULL SYLLABUS 180 Q ---------------------------------
for i in range(1, 5):
    grp = [(s, chapters[11][s]) for s in ("physics", "chemistry", "biology")]
    rows.append(build_mock(
        i,
        f"NEET 2026 Class 11 Full Syllabus Mock 1{i} — Grand Rehearsal",
        "Full-syllabus Class 11 mock in NEET 2026 pattern with NEET weightage "
        "(Bio 90 • Chem 45 • Phy 45). 180 min, +4 / -1, quality-vetted pool.",
        CATS["c11_full"], grp,
        {"physics": 45, "chemistry": 45, "biology": 90}, 180, 180))

# ---- 4 x CLASS 12 FULL SYLLABUS 180 Q ---------------------------------
for i in range(1, 5):
    grp = [(s, chapters[12][s]) for s in ("physics", "chemistry", "biology")]
    rows.append(build_mock(
        i,
        f"NEET 2026 Class 12 Full Syllabus Mock 1{i} — Grand Rehearsal",
        "Full-syllabus Class 12 mock in NEET 2026 pattern with NEET weightage "
        "(Bio 90 • Chem 45 • Phy 45). 180 min, +4 / -1, quality-vetted pool.",
        CATS["c12_full"], grp,
        {"physics": 45, "chemistry": 45, "biology": 90}, 180, 180))


def lit(v):
    return "'" + str(v).replace("'", "''") + "'"


sql = ["begin;"]
for r in rows:
    arr = "ARRAY[" + ",".join(lit(x) for x in r["question_ids"]) + "]::text[]"
    syl = lit(json.dumps(r["syllabus"])) + "::jsonb"
    sql.append(
        "insert into public.tests (title,description,type,difficulty,duration_min,"
        "total_questions,question_ids,marks_correct,marks_wrong,source,syllabus,category_id) "
        f"values ({lit(r['title'])},{lit(r['description'])},'mock','medium',{r['duration_min']},"
        f"{r['total_questions']},{arr},4,-1,{lit(r['source'])},{syl},{lit(r['category_id'])});"
    )
sql.append("commit;")
open("/tmp/neet2026_mocks.sql", "w").write("\n".join(sql))
for r in rows:
    print(f"{r['title']}: {r['total_questions']} Qs")
print(f"\nwrote /tmp/neet2026_mocks.sql — {len(rows)} mocks")
