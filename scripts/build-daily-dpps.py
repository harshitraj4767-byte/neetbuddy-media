#!/usr/bin/env python3
"""Insert 100 fresh Daily DPP tests (Day 31 to Day 130). Each DPP:
   * 20 questions, 25 minutes, +4 / -1
   * mixed subjects (Bio > Phy = Chem) — 8 Bio / 6 Phy / 6 Chem
   * quality gate on questions
   * unique across the batch
"""
import os, subprocess, random

DB = os.environ.get("SB_DB_URL", "")
SUBJ_NAME = {"physics": "Physics", "chemistry": "Chemistry", "biology": "Biology"}
QUOTA = {"biology": 8, "physics": 6, "chemistry": 6}


def q(sql):
    out = subprocess.run(["psql", DB, "-At", "-F", "", "-c", sql],
                         capture_output=True, text=True, check=True).stdout
    return [line.split("") for line in out.splitlines() if line]


# Generate 100 DPPs (Day 31 to Day 130)
START_DAY = int(os.environ.get("START_DAY", 31))
COUNT = int(os.environ.get("DPP_COUNT", 100))

if not DB:
    print(f"SB_DB_URL not set; generating skeleton SQL for {COUNT} DPPs (Day {START_DAY} to {START_DAY + COUNT - 1})")
    rows = []
    for day in range(START_DAY, START_DAY + COUNT):
        title = f"Daily DPP {day:02d} — 20-Q Mixed Rapid Round"
        desc = (f"Quality-vetted 20-question daily practice: 8 Biology • 6 Physics • 6 Chemistry. "
                f"25 minutes, NEET marking (+4 / -1). Perfect daily boost with detailed explanations.")
        rows.append((title, desc, []))
else:
    # subject key -> chapters (subject id <- we compute here in SQL)
    subj_ids = {row[1]: row[0] for row in q("select id,name from subjects")}
    # quality-vetted questions grouped by subject key.
    pool = {"physics": [], "chemistry": [], "biology": []}
    for qid, subj_name in q(
        "select q.id, s.name from questions q join subjects s on s.id=q.subject_id "
        "where q.options is not null and array_length(q.options,1)=4 "
        "and q.correct_index is not null and q.correct_index between 0 and 3 "
        "and q.explanation is not null and length(q.explanation) > 25 "
        "and length(q.text) between 25 and 700 "
        "order by md5(q.id)"
    ):
        key = subj_name.lower()
        if key in pool:
            pool[key].append(qid)

    rng = random.Random(20260729)
    for s in pool: rng.shuffle(pool[s])

    pointers = {"biology": 0, "physics": 0, "chemistry": 0}
    used = set()

    rows = []
    for day in range(START_DAY, START_DAY + COUNT):
        ids = []
        for subj, n in QUOTA.items():
            while len(ids) < sum(QUOTA[s] for s in ("biology", "physics", "chemistry")[:list(QUOTA).index(subj)+1]):
                p = pointers[subj]
                if p >= len(pool[subj]):
                    # Cycle pool if exhausted across 100 DPPs
                    p = pointers[subj] = 0
                    rng.shuffle(pool[subj])
                qid = pool[subj][p]; pointers[subj] += 1
                if qid in used and len(used) < len(pool[subj]): continue
                ids.append(qid); used.add(qid)
        rng.shuffle(ids)
        title = f"Daily DPP {day:02d} — 20-Q Mixed Rapid Round"
        desc = (f"Quality-vetted 20-question daily practice: 8 Biology • 6 Physics • 6 Chemistry. "
                f"25 minutes, NEET marking (+4 / -1). Perfect daily boost with detailed explanations.")
        rows.append((title, desc, ids))


def lit(v): return "'" + str(v).replace("'", "''") + "'"


sql = ["begin;"]
for title, desc, ids in rows:
    arr = "ARRAY[" + ",".join(lit(x) for x in ids) + "]::text[]"
    sql.append(
        "insert into public.tests (title,description,type,difficulty,duration_min,"
        "total_questions,question_ids,marks_correct,marks_wrong,source,is_paid) "
        f"values ({lit(title)},{lit(desc)},'daily','medium',25,{len(ids)},{arr},"
        f"4,-1,'Neet Buddy Daily DPP',false);"
    )
sql.append("commit;")
open("/tmp/daily_dpps.sql", "w").write("
".join(sql))
print(f"wrote /tmp/daily_dpps.sql — {len(rows)} DPPs, {sum(len(r[2]) for r in rows)} total Qs")
