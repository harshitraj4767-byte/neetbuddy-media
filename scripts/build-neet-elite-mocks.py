#!/usr/bin/env python3
"""Build 20 fresh NEET-pattern full-syllabus mocks (180 Q / 180 min).

Design rules:
  * NEET subject split: Biology 90 - Chemistry 45 - Physics 45
  * NEET-like chapter weightage (weights below, per chapter id)
  * Heavy focus on new-pattern question types (multiple statements,
    match-the-following, assertion-reason): ~40% of every paper
  * Difficulty balanced so a 3 hour attempt is realistic:
    35% Easy / 47% Medium / 18% Hard
  * Strict quality gate on the pool
  * Zero repeats across the 20 new mocks; questions already used by
    existing mock tests are avoided too (soft fallback if a chapter runs dry)
  * Titles numbered in ascending order
"""
import json, os, random, subprocess

DB = os.environ["SB_DB_URL"]
CAT_FULL = "fb85871f-725b-4ff2-aaae-3cca4a8c7d43"
N_MOCKS = 20
SUBJ_NAME = {"physics": "Physics", "chemistry": "Chemistry", "biology": "Biology"}
SUBJ_QUOTA = {"physics": 45, "chemistry": 45, "biology": 90}
SPECIAL_SHARE = 0.40
MIX = [("Easy", 0.35), ("Medium", 0.47), ("Hard", 0.18)]
SPECIAL_TYPES = ("MCQ type-2", "MCQ type-3", "Assertion and Reason", "Match the following")


def q(sql):
    out = subprocess.run(["psql", DB, "-At", "-F", "\x1f", "-c", sql],
                         capture_output=True, text=True, check=True).stdout
    return [line.split("\x1f") for line in out.splitlines() if line]


# ---- NEET-like chapter weightage (relative) --------------------------------
W = {
    # Physics 11
    "Units & Measurements": 2, "Motion in a straight line": 2, "Motion in a Plane": 2,
    "Newton's Laws of Motion": 4, "Work, Energy and Power": 4,
    "System of Particles and Rotational Motion": 5, "Gravitation": 3,
    "Mechanical Properties of Solids (Elasticity)": 2, "Mechanical Properties of Fluids": 2,
    "Thermal Properties of Matter": 2, "Thermodynamics (Physics)": 4,
    "Kinetic Theory Of Gases": 3, "Oscillations": 3, "Waves": 3,
    # Physics 12
    "Electric charges & Fields": 3, "Electrostatic Potential and Capacitance": 4,
    "Current Electricity": 5, "Moving Charges and Magnetism": 4, "Magnetism and Matter": 2,
    "Electromagnetic Induction": 3, "Alternating Current": 3, "Electromagnetic Waves": 2,
    "Ray Optics And Optical Instruments": 5, "Wave Optics": 3,
    "Dual Nature of Radiation and Matter": 3, "Atoms": 2, "Nuclei": 3,
    "Semiconductor Electronics: Materials, Devices and Simple Circuits": 5,
    # Chemistry 11
    "Some Basic Concepts Of Chemistry": 3, "Structure of Atom": 3,
    "Classification of Elements and Periodicity in Properties": 3, "Chemical Bonding": 6,
    "Thermodynamics (Chemistry)": 4, "Equilibrium": 4, "Redox Reactions": 2,
    "p-block elements (11th)": 3,
    "Organic Chemistry: Some Basic Principles and Techniques": 5, "Hydrocarbons": 4,
    # Chemistry 12
    "Solutions": 4, "Electrochemistry": 4, "Chemical Kinetics": 4,
    "p-block elements (12th )": 4, "d- and f-block elements": 4,
    "Coordination Compounds": 5, "Haloalkanes and Haloarenes": 4,
    "Alcohols, Phenols and Ethers": 4, "Aldehydes, Ketones and Carboxylic Acids": 5,
    "Amines": 3, "Biomolecules (Chemistry)": 3,
    # Biology 11
    "The Living World": 2, "Biological Classification": 4, "Plant Kingdom": 4,
    "Animal Kingdom": 6, "Morphology of Flowering Plants": 5,
    "Anatomy of Flowering Plants": 4, "Structural Organisation in Animals": 3,
    "Cell : The Unit of Life": 6, "Biomolecules": 4, "Cell Cycle and Cell Division": 4,
    "Photosynthesis in Higher Plants": 4, "Respiration in Plants": 3,
    "Plant Growth and Development": 3, "Breathing and Exchange of Gases": 3,
    "Body Fluids and Circulation": 3, "Excretory Products and Their Elimination": 3,
    "Locomotion and Movement": 3, "Neural Control and Coordination": 3,
    "Chemical Coordination and Integration": 4,
    # Biology 12
    "Sexual Reproduction in Flowering plants": 5, "Human Reproduction": 5,
    "Reproductive Health": 3, "Principles of Inheritance and Variation": 7,
    "Molecular Basis of Inheritence": 7, "Evolution": 4, "Human Health and Diseases": 5,
    "Microbes in Human Welfare": 3, "Biotechnology and its Principles": 4,
    "Biotechnology and its Application": 4, "Organisms and Population": 4,
    "Ecosystem": 4, "Biodiversity and Conservation": 4,
}

chapters = {}   # subject -> [(cid, name, weight)]
for cls, subj, cid, name in q(
    "select ch.class, ch.subject_id, ch.id, ch.name from chapters ch "
    "order by ch.class, ch.subject_id, ch.order_index"
):
    chapters.setdefault(subj, []).append((cid, name, W.get(name, 3)))

# ---- pool -------------------------------------------------------------------
QUALITY = (
    "q.options is not null and array_length(q.options,1)=4 "
    "and q.correct_index is not null and q.correct_index between 0 and 3 "
    "and q.explanation is not null and length(q.explanation) > 25 "
    "and length(q.text) between 25 and 900"
)
pool = {}  # chapter_id -> (kind, difficulty) -> [qid]
for cid, diff, qtype, qid in q(
    f"select q.chapter_id, q.difficulty, q.qtype, q.id from questions q where {QUALITY} "
    "order by md5(q.id)"
):
    kind = "special" if qtype in SPECIAL_TYPES else "plain"
    d = diff if diff in ("Easy", "Medium", "Hard") else "Medium"
    pool.setdefault(cid, {}).setdefault((kind, d), []).append(qid)

# question ids already used by existing mock tests -> avoid
already = set()
for (row,) in q("select unnest(question_ids) from public.tests where type in ('mock','contest')"):
    already.add(row)

rng = random.Random(20260801)
used = set()          # global across the new mocks
STARVED = [0]


def take(cid, kind, diff, n, avoid_existing=True):
    got = []
    bucket = pool.get(cid, {}).get((kind, diff), [])
    for pass_no in (0, 1):
        for qid in bucket:
            if len(got) >= n:
                break
            if qid in used:
                continue
            if pass_no == 0 and avoid_existing and qid in already:
                continue
            got.append(qid)
            used.add(qid)
        if len(got) >= n or not avoid_existing:
            break
        STARVED[0] += 1
    return got


def pick_chapter(cid, count):
    """Pick `count` questions for one chapter honouring type + difficulty mix."""
    n_special = round(count * SPECIAL_SHARE)
    plan = []
    for kind, total in (("special", n_special), ("plain", count - n_special)):
        left = total
        for i, (d, share) in enumerate(MIX):
            k = left if i == len(MIX) - 1 else round(total * share)
            plan.append((kind, d, k))
            left -= k
    chosen = []
    for kind, d, k in plan:
        if k > 0:
            chosen += take(cid, kind, d, k)
    # top-up from anything left in the chapter
    if len(chosen) < count:
        rest = [x for b in pool.get(cid, {}).values() for x in b if x not in used]
        rng.shuffle(rest)
        for qid in rest[:count - len(chosen)]:
            used.add(qid)
            chosen.append(qid)
    return chosen


def deal(subject, quota):
    chs = chapters[subject]
    total_w = sum(w for _, _, w in chs)
    counts = {}
    assigned = 0
    for cid, name, w in chs:
        n = int(quota * w / total_w)
        counts[cid] = n
        assigned += n
    # distribute the remainder to the heaviest chapters
    for cid, name, w in sorted(chs, key=lambda c: -c[2]):
        if assigned >= quota:
            break
        counts[cid] += 1
        assigned += 1
    picked = []
    for cid, name, w in chs:
        if counts[cid]:
            picked += pick_chapter(cid, counts[cid])
    syllabus = {
        "subjectId": subject,
        "subjectName": SUBJ_NAME[subject],
        "chapters": [{"id": cid, "name": name} for cid, name, _ in chs if counts[cid]],
    }
    return picked, syllabus


rows = []
for i in range(1, N_MOCKS + 1):
    ids, syl = [], []
    for s in ("physics", "chemistry", "biology"):
        p, sy = deal(s, SUBJ_QUOTA[s])
        ids += p
        syl.append(sy)
    rng.shuffle(ids)
    rows.append({
        "title": f"NEET 2026 Elite Mock {i:02d} — Full Syllabus Simulation",
        "description": (
            "Full-syllabus NEET 2026 pattern paper with real exam weightage "
            "(Biology 90 • Chemistry 45 • Physics 45) and NEET 2025/re-NEET style "
            "question mix — multiple-statement, match-the-following and "
            "assertion-reason items make up ~40% of the paper. "
            "180 questions • 180 minutes • +4 / −1 • balanced 35% Easy, 47% Medium, 18% Hard."
        ),
        "duration_min": 180,
        "question_ids": ids,
        "syllabus": syl,
    })
    print(f"mock {i:02d}: {len(ids)} questions, unique so far {len(used)}")

print("starved buckets (fell back to already-used-in-old-mocks pool):", STARVED[0])


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
        f"{len(r['question_ids'])},{arr},4,-1,'NEET 2026 Elite Series',{syl},{lit(CAT_FULL)});"
    )
sql.append("commit;")
open("/tmp/neet_elite_mocks.sql", "w").write("\n".join(sql))
print("wrote /tmp/neet_elite_mocks.sql")
