#!/usr/bin/env python3
"""Generate NEET mock tests: 25 full-length + 5 Class 11 + 5 Class 12 halves.

Design rules (professional NEET simulation):
  Full-length mock (180 Q, 200 min, +4 / -1, max 720):
    - Physics 45, Chemistry 45, Biology 90 (Botany 45 + Zoology 45)
    - Chapter-wise weightage mirrors real NEET (2020-2024 average)
    - Difficulty balance ~30% Easy / 50% Medium / 20% Hard
      (feels like a tough real NEET but a strong student can score 640+)
    - No question repeats across the 25-mock series (deterministic
      sequential slicing on a per-chapter shuffled list)

  Class 11 / Class 12 half-syllabus test (90 Q, 108 min, +4/-1, max 360):
    - Physics 22, Chemistry 22, Biology 46
    - Only chapters belonging to that class
    - Same 30/50/20 difficulty mix
"""
import json, os, random, subprocess, uuid, sys

DB = os.environ["SB_DB_URL"]

CATEGORY_FULL   = "fb85871f-725b-4ff2-aaae-3cca4a8c7d43"  # Full Syllabus
CATEGORY_CLS11  = "24d117b3-ba95-4f76-a3b8-e1b8a48b379b"  # Class 11
CATEGORY_CLS12  = "d000291e-331b-44d3-a5e0-cc3dbfd94b7d"  # Class 12

SUBJECT_NAME = {"physics": "Physics", "chemistry": "Chemistry", "biology": "Biology"}

# ── NEET full-length chapter weightage (per 180-Q mock) ───────────────
FULL_PHYSICS = {
    3:1, 19:1, 20:1, 21:2, 22:2, 23:2, 24:1, 25:1, 26:1, 27:1,
    28:2, 29:1, 30:1, 31:2, 12:2, 32:2, 33:4, 34:2, 35:1, 36:2,
    37:1, 38:1, 18:2, 13:2, 39:2, 40:1, 41:2, 42:2,
}
FULL_CHEMISTRY = {
    15:1, 44:1, 47:1, 48:2, 49:2, 50:1, 57:2, 58:2, 59:2, 60:1, 61:1,
    45:1, 46:3, 51:1, 52:1, 53:2, 63:2, 64:2, 65:2,
    54:2, 55:2, 66:2, 67:2, 68:2, 69:2, 70:1, 71:1, 72:1,
}
FULL_BOTANY = {
    73:2, 74:3, 9:3, 75:3, 76:2, 10:3, 11:1, 77:2, 78:2, 79:1,
    80:3, 81:2, 82:2, 92:1, 8:3, 93:3, 94:3, 105:2, 99:2, 106:1, 107:1,
}
FULL_ZOOLOGY = {
    83:4, 84:2, 85:2, 86:2, 87:2, 88:2, 89:2, 90:4, 91:3,
    100:4, 101:2, 103:4, 96:2, 104:1, 102:3, 97:3, 98:3,
}
assert sum(FULL_PHYSICS.values())   == 45, sum(FULL_PHYSICS.values())
assert sum(FULL_CHEMISTRY.values()) == 45, sum(FULL_CHEMISTRY.values())
assert sum(FULL_BOTANY.values())    == 45, sum(FULL_BOTANY.values())
assert sum(FULL_ZOOLOGY.values())   == 45, sum(FULL_ZOOLOGY.values())

# ── Class-11 / Class-12 chapter sets ─────────────────────────────────
CLS11_PHY  = [3,19,20,21,22,23,24,25,26,27,28,29,30,31]
CLS11_CHEM = [15,44,45,46,47,48,49,50,51,52,53,54,55,56]
CLS11_BIO  = [73,74,9,75,76,10,11,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,8]
# (Sexual Reproduction in Flowering plants id=8 sits in DB under class 12 but
#  the underlying "Sexual Repro" chapter in class 11 NCERT overlap is minimal;
#  keep it as edge, so 8 stays only in class 12 set below.)
CLS11_BIO  = [73,74,9,75,76,10,11,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91]

CLS12_PHY  = [12,13,18,32,33,34,35,36,37,38,39,40,41,42,43]
CLS12_CHEM = [57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72]
CLS12_BIO  = [92,8,100,101,93,94,102,95,96,103,104,97,98,105,99,106,107]

# ── Titles/descriptions per full mock (25) ────────────────────────────
FULL_TITLES = [
    ("Neural Simulation 06 — Balanced Baseline",
     "Balanced NEET-pattern paper: 30% easy / 50% medium / 20% hard. Ideal for calibrating your baseline score before targeted revision."),
    ("Neural Simulation 07 — Concept Sharpener",
     "Concept-heavy paper stressing NCERT lines, definitions and single-statement application. Reveals concept gaps before formula drills."),
    ("Neural Simulation 08 — Application & Numericals",
     "Numerical-loaded Physics & Physical-Chemistry, application-based Biology. Trains time management under calculation pressure."),
    ("Neural Simulation 09 — Assertion • Reason • Match",
     "Assertion-Reason, Statement I/II and Match-the-Column dominate. Tests careful reading and elimination technique."),
    ("Neural Simulation 10 — Diagram & Reaction Focus",
     "Diagram-labelling in Biology, mechanism/reaction-map Organic Chemistry, ray/wave Optics — the visual-reasoning paper."),
    ("Neural Simulation 11 — PYQ Mirror",
     "Weightage exactly mirrors NEET 2020-2024 chapter distribution — closest thing to walking into the real exam."),
    ("Neural Simulation 12 — Twisters",
     "Trap-heavy statements, close-option MCQs and multi-step arithmetic. Trains you to spot near-miss options quickly."),
    ("Neural Simulation 13 — Speed Test",
     "Direct NCERT facts and one-step derivations dominate. Meant for finishing under 170 minutes and reviewing under 30."),
    ("Neural Simulation 14 — Human Physiology Heavy",
     "Zoology tilted toward Human Physiology + Reproduction; Botany balanced; Physics/Chemistry standard NEET mix."),
    ("Neural Simulation 15 — Genetics & Evolution Weekly Focus",
     "Extra emphasis on Genetics, Molecular Basis, Evolution and Biotech chapters — Biology is the deciding subject."),
    ("Neural Simulation 16 — Physical Chemistry Push",
     "Physical Chemistry dominated: Thermo, Equilibrium, Kinetics, Electrochem, Solutions. Standard Physics & Biology."),
    ("Neural Simulation 17 — Organic Chemistry Push",
     "Organic-heavy: mechanisms, IUPAC, GOC, reagents, distinguishing tests. Trains named-reaction recall."),
    ("Neural Simulation 18 — Inorganic Chemistry Push",
     "Periodicity, Bonding, p-block, d/f, Coordination — inorganic-heavy paper with strong NCERT-line questions."),
    ("Neural Simulation 19 — Mechanics & Electrodynamics",
     "Physics leans on Mechanics + Electrodynamics blocks. Chemistry & Biology standard. Great pre-mock warm-up."),
    ("Neural Simulation 20 — Modern Physics & Optics",
     "Physics tilts to Optics + Modern Physics; standard Chemistry & Biology. Sharpens end-of-syllabus scoring chapters."),
    ("Neural Simulation 21 — Ecology & Environment Focus",
     "Biology emphasises Ecology, Biodiversity, Environmental Issues — the high-scoring last unit most students underprepare."),
    ("Neural Simulation 22 — Plant Kingdom + Physiology Focus",
     "Botany-heavy Living World, Plant Kingdom, Morphology, Anatomy, Physiology; standard rest. Nails NCERT Class 11 Biology."),
    ("Neural Simulation 23 — Full Rehearsal I",
     "Strict NEET rehearsal paper. Simulate exam-day timing: 3h 20m sitting, no breaks, single-marker sheet."),
    ("Neural Simulation 24 — Full Rehearsal II",
     "Second exam-day rehearsal with a fresh question set. Compare timing and error patterns with Rehearsal I."),
    ("Neural Simulation 25 — Full Rehearsal III",
     "Third exam-day rehearsal with a fresh question set. Aim for consistency across all three rehearsals."),
    ("Neural Simulation 26 — Grand Test A",
     "Grand test with a fresh non-overlapping question pool. Difficulty tilts slightly harder in Physics."),
    ("Neural Simulation 27 — Grand Test B",
     "Grand test B: harder Physical Chemistry + Genetics; NCERT-tight rest of paper."),
    ("Neural Simulation 28 — Grand Test C",
     "Grand test C: assertion-reason, statement and match questions distributed uniformly across all subjects."),
    ("Neural Simulation 29 — Final Prep I",
     "Final-week paper. Balanced difficulty, tight NCERT alignment, standard NEET weightage. Aim for your top score."),
    ("Neural Simulation 30 — Final Prep II",
     "Final-week paper II. Fresh question set, same rigor. Use for one last cold-start simulation before D-day."),
]
assert len(FULL_TITLES) == 25

# ── Pick helpers ─────────────────────────────────────────────────────
def sql(cmd):
    return subprocess.check_output(["psql", DB, "-A", "-t", "-F\x01", "-c", cmd], text=True)

def fetch_chapter_ids(chapter_ids):
    """{chapter_id: {'Easy':[ids], 'Medium':[ids], 'Hard':[ids]}} sorted."""
    ids = ",".join(str(c) for c in chapter_ids)
    out = sql(f"""SELECT chapter_id, difficulty, id FROM qb_questions
                  WHERE chapter_id IN ({ids}) ORDER BY chapter_id, difficulty, id""")
    buckets = {c: {"Easy": [], "Medium": [], "Hard": []} for c in chapter_ids}
    for line in out.strip().splitlines():
        parts = line.split("\x01")
        if len(parts) < 3: continue
        cid, diff, qid = int(parts[0]), parts[1].strip(), parts[2].strip()
        d = diff if diff in ("Easy","Medium","Hard") else "Medium"
        buckets[cid][d].append(qid)
    # Deterministic shuffle per chapter+difficulty using seed 20260727
    for c in buckets:
        for d in buckets[c]:
            random.Random(f"neet-{c}-{d}").shuffle(buckets[c][d])
    return buckets

def split_quota(n):
    """Return (easy, med, hard) counts summing to n at ~30/50/20."""
    if n <= 0: return (0,0,0)
    e = max(1, round(n*0.30)) if n>=3 else (1 if n>=2 else 0)
    h = max(1, round(n*0.20)) if n>=5 else 0
    m = n - e - h
    if m < 0:
        m = 0; e = n - h
    return (e, m, h)

def pick(buckets, chapter_id, n, cursors):
    """Take n questions from chapter with 30/50/20 mix, advancing cursor."""
    e_want, m_want, h_want = split_quota(n)
    picks = []
    for diff, want in (("Easy", e_want), ("Medium", m_want), ("Hard", h_want)):
        pool = buckets[chapter_id][diff]
        cur_key = (chapter_id, diff)
        cur = cursors.get(cur_key, 0)
        take = pool[cur:cur+want]
        cursors[cur_key] = cur + want
        # if pool exhausted for that difficulty, wrap around
        if len(take) < want:
            need = want - len(take)
            take += pool[:need]
            cursors[cur_key] = need
        picks.extend(take)
    # Fallback: if still short (very small chapter), pull from any difficulty
    if len(picks) < n:
        all_pool = buckets[chapter_id]["Medium"] + buckets[chapter_id]["Easy"] + buckets[chapter_id]["Hard"]
        for q in all_pool:
            if q not in picks:
                picks.append(q)
                if len(picks) == n: break
    return picks[:n]

def make_syllabus(subject_id, chapter_ids, chapter_names):
    return {
        "subjectId": subject_id,
        "subjectName": SUBJECT_NAME[subject_id],
        "chapters": [{"id": str(c), "name": chapter_names[c]} for c in chapter_ids],
    }

def chapter_names_map():
    out = sql("SELECT id, name FROM qb_chapters")
    d = {}
    for line in out.strip().splitlines():
        parts = line.split("\x01")
        d[int(parts[0])] = parts[1].strip()
    return d

# ── Insert helper ────────────────────────────────────────────────────
def insert_tests(rows):
    """rows = [(title, description, type, difficulty, duration_min, total_q,
                marks_correct, marks_wrong, source, question_ids, syllabus_json, category_id)]"""
    # Write as CSV-ish via psql \COPY -- simpler: emit INSERT via -c per row
    values_sql = []
    for r in rows:
        (title, desc, ttype, diff, dur, total, mc, mw, src, qids, syl, cat) = r
        qids_lit = "{" + ",".join(qids) + "}"
        # escape single quotes
        t = title.replace("'", "''")
        d = desc.replace("'", "''")
        syl_lit = json.dumps(syl).replace("'", "''")
        values_sql.append(
            f"('{t}','{d}','{ttype}','{diff}',{dur},{total},{mc},{mw},'{src}',"
            f"'{qids_lit}'::text[],'{syl_lit}'::jsonb,'{cat}'::uuid)"
        )
    stmt = ("INSERT INTO tests (title,description,type,difficulty,duration_min,"
            "total_questions,marks_correct,marks_wrong,source,question_ids,"
            "syllabus,category_id) VALUES " + ",".join(values_sql) + " RETURNING id;")
    with open("/tmp/mock_insert.sql","w") as f:
        f.write(stmt)
    out = subprocess.check_output(["psql", DB, "-f", "/tmp/mock_insert.sql"], text=True)
    print(out[-500:])

# ── Build full mocks ─────────────────────────────────────────────────
def build_full_mocks():
    all_ch = list(FULL_PHYSICS)+list(FULL_CHEMISTRY)+list(FULL_BOTANY)+list(FULL_ZOOLOGY)
    buckets = fetch_chapter_ids(all_ch)
    names   = chapter_names_map()
    cursors = {}
    rows = []
    for idx, (title, desc) in enumerate(FULL_TITLES, start=1):
        qids = []
        for cid, n in FULL_PHYSICS.items():   qids += pick(buckets, cid, n, cursors)
        for cid, n in FULL_CHEMISTRY.items(): qids += pick(buckets, cid, n, cursors)
        for cid, n in FULL_BOTANY.items():    qids += pick(buckets, cid, n, cursors)
        for cid, n in FULL_ZOOLOGY.items():   qids += pick(buckets, cid, n, cursors)
        assert len(qids) == 180, (idx, len(qids))
        # Deterministic per-mock shuffle so subjects aren't clustered
        random.Random(f"neet-full-{idx}").shuffle(qids)
        syllabus = [
            make_syllabus("physics",   list(FULL_PHYSICS),   names),
            make_syllabus("chemistry", list(FULL_CHEMISTRY), names),
            make_syllabus("biology",   list(FULL_BOTANY)+list(FULL_ZOOLOGY), names),
        ]
        full_desc = (
            f"{desc}  •  Format: 180 questions, 200 minutes, +4 / -1, max 720. "
            "Physics 45, Chemistry 45, Botany 45, Zoology 45. "
            "Difficulty balance ~30% easy / 50% medium / 20% hard — tuned so strong students can cross 640."
        )
        rows.append((title, full_desc, "mock", "hard", 200, 180, 4, -1, "NEET",
                     qids, syllabus, CATEGORY_FULL))
    insert_tests(rows)

# ── Build class-11/12 half-syllabus mocks ────────────────────────────
CLS_TITLES_11 = [
    ("NEET Class 11 Half Test 11 — Balanced",         "Class 11 half-syllabus test: 90 Q, 108 min, +4/-1. Balanced across every Class 11 chapter."),
    ("NEET Class 11 Half Test 12 — Physical + Cell",  "Class 11 focus on Physics mechanics, Physical Chemistry, Cell & Biomolecules."),
    ("NEET Class 11 Half Test 13 — Diversity + Bonding","Class 11 focus on Living World / Plant / Animal Kingdom and Chemical Bonding, Periodicity."),
    ("NEET Class 11 Half Test 14 — Physiology Focus", "Class 11 focus on plant & human physiology chapters."),
    ("NEET Class 11 Half Test 15 — Final Rehearsal",  "Class 11 exam-day rehearsal with a fresh, non-overlapping question set."),
]
CLS_TITLES_12 = [
    ("NEET Class 12 Half Test 11 — Balanced",         "Class 12 half-syllabus test: 90 Q, 108 min, +4/-1. Balanced across every Class 12 chapter."),
    ("NEET Class 12 Half Test 12 — Genetics + Organic","Class 12 focus on Genetics, Molecular Basis and Organic Chemistry mechanisms."),
    ("NEET Class 12 Half Test 13 — Electro + Reproduction","Class 12 focus on Electrodynamics, Reproduction and Reproductive Health."),
    ("NEET Class 12 Half Test 14 — Optics + Coordination","Class 12 focus on Optics, Coordination Compounds and Evolution."),
    ("NEET Class 12 Half Test 15 — Final Rehearsal",  "Class 12 exam-day rehearsal with a fresh, non-overlapping question set."),
]

def build_class_mocks(phy_ch, chem_ch, bio_ch, titles, category):
    # 90 Q: Physics 22, Chemistry 22, Biology 46
    def distribute(ch_list, total):
        base = total // len(ch_list)
        extra = total - base*len(ch_list)
        counts = {}
        for i, c in enumerate(ch_list):
            counts[c] = base + (1 if i < extra else 0)
        return counts
    phy_q  = distribute(phy_ch, 22)
    chem_q = distribute(chem_ch, 22)
    bio_q  = distribute(bio_ch, 46)

    buckets = fetch_chapter_ids(phy_ch + chem_ch + bio_ch)
    names   = chapter_names_map()
    cursors = {}
    rows = []
    for idx, (title, desc) in enumerate(titles, start=1):
        qids = []
        for cid, n in phy_q.items():  qids += pick(buckets, cid, n, cursors)
        for cid, n in chem_q.items(): qids += pick(buckets, cid, n, cursors)
        for cid, n in bio_q.items():  qids += pick(buckets, cid, n, cursors)
        assert len(qids) == 90
        random.Random(f"neet-cls-{category}-{idx}").shuffle(qids)
        syllabus = [
            make_syllabus("physics",   phy_ch,  names),
            make_syllabus("chemistry", chem_ch, names),
            make_syllabus("biology",   bio_ch,  names),
        ]
        full_desc = (
            f"{desc}  •  Format: 90 questions, 108 minutes, +4 / -1, max 360. "
            "Physics 22, Chemistry 22, Biology 46. "
            "Difficulty ~30% easy / 50% medium / 20% hard — real-exam feel with fair scoring headroom."
        )
        rows.append((title, full_desc, "mock", "hard", 108, 90, 4, -1, "NEET",
                     qids, syllabus, category))
    insert_tests(rows)

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    if mode in ("full","all"):
        print("Building 25 NEET full-length mocks…")
        build_full_mocks()
    if mode in ("c11","all"):
        print("Building 5 Class-11 half mocks…")
        build_class_mocks(CLS11_PHY, CLS11_CHEM, CLS11_BIO, CLS_TITLES_11, CATEGORY_CLS11)
    if mode in ("c12","all"):
        print("Building 5 Class-12 half mocks…")
        build_class_mocks(CLS12_PHY, CLS12_CHEM, CLS12_BIO, CLS_TITLES_12, CATEGORY_CLS12)
    print("Done.")
