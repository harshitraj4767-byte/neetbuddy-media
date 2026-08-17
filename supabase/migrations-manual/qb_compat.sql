-- ============================================================
-- QBank compatibility layer — RUN IN YOUR SUPABASE SQL EDITOR
-- ============================================================
-- What this does:
--  1. Creates SQL views `subjects`, `chapters`, `questions` that
--     make the qb_* tables look like the schema the app expects.
--  2. Populates NCERT chapter ordering + class per subject.
--  3. Grants read to anon + authenticated.
--
-- What this does NOT do (do these SEPARATELY after reviewing):
--  - It does NOT alter attempts.answers / contests.chapter_ids column
--    types. Those still hold uuid values from the old data. Before
--    you can create NEW tests/contests off qb_* data, run the
--    "PHASE 2" block at the bottom. Existing rows will need to be
--    archived first (query and export any live contests/attempts you
--    want to keep) because uuid[] cannot hold bigint strings.
-- ============================================================

BEGIN;

-- ---------- 1. NCERT chapter order metadata ----------
-- Insert once; safe to re-run (uses ON CONFLICT).
CREATE TABLE IF NOT EXISTS public.qb_chapter_meta (
  chapter_id bigint PRIMARY KEY REFERENCES public.qb_chapters(id) ON DELETE CASCADE,
  class smallint,          -- 11 or 12
  order_index int          -- NCERT order within class+subject
);
GRANT SELECT ON public.qb_chapter_meta TO anon, authenticated;
GRANT ALL ON public.qb_chapter_meta TO service_role;

-- Populate order_index from a static NCERT list.
-- (Names must match qb_chapters.name exactly; run the SELECT below
--  first to see actual names and adjust if needed.)
--   SELECT id, subject_id, name FROM qb_chapters ORDER BY subject_id, name;

WITH ncert(subject_id, class, ord, name) AS (VALUES
  -- ===== PHYSICS Class 11 =====
  ('physics',11, 1,'Physical World'),
  ('physics',11, 2,'Units and Measurements'),
  ('physics',11, 3,'Motion in a Straight Line'),
  ('physics',11, 4,'Motion in a Plane'),
  ('physics',11, 5,'Laws of Motion'),
  ('physics',11, 6,'Work, Energy and Power'),
  ('physics',11, 7,'System of Particles and Rotational Motion'),
  ('physics',11, 8,'Gravitation'),
  ('physics',11, 9,'Mechanical Properties of Solids'),
  ('physics',11,10,'Mechanical Properties of Fluids'),
  ('physics',11,11,'Thermal Properties of Matter'),
  ('physics',11,12,'Thermodynamics'),
  ('physics',11,13,'Kinetic Theory'),
  ('physics',11,14,'Oscillations'),
  ('physics',11,15,'Waves'),
  -- ===== PHYSICS Class 12 =====
  ('physics',12, 1,'Electric Charges and Fields'),
  ('physics',12, 2,'Electrostatic Potential and Capacitance'),
  ('physics',12, 3,'Current Electricity'),
  ('physics',12, 4,'Moving Charges and Magnetism'),
  ('physics',12, 5,'Magnetism and Matter'),
  ('physics',12, 6,'Electromagnetic Induction'),
  ('physics',12, 7,'Alternating Current'),
  ('physics',12, 8,'Electromagnetic Waves'),
  ('physics',12, 9,'Ray Optics and Optical Instruments'),
  ('physics',12,10,'Wave Optics'),
  ('physics',12,11,'Dual Nature of Radiation and Matter'),
  ('physics',12,12,'Atoms'),
  ('physics',12,13,'Nuclei'),
  ('physics',12,14,'Semiconductor Electronics'),
  -- ===== CHEMISTRY Class 11 =====
  ('chemistry',11, 1,'Some Basic Concepts of Chemistry'),
  ('chemistry',11, 2,'Structure of Atom'),
  ('chemistry',11, 3,'Classification of Elements and Periodicity in Properties'),
  ('chemistry',11, 4,'Chemical Bonding and Molecular Structure'),
  ('chemistry',11, 5,'States of Matter'),
  ('chemistry',11, 6,'Thermodynamics'),
  ('chemistry',11, 7,'Equilibrium'),
  ('chemistry',11, 8,'Redox Reactions'),
  ('chemistry',11, 9,'Hydrogen'),
  ('chemistry',11,10,'The s-Block Elements'),
  ('chemistry',11,11,'The p-Block Elements'),
  ('chemistry',11,12,'Organic Chemistry - Some Basic Principles and Techniques'),
  ('chemistry',11,13,'Hydrocarbons'),
  ('chemistry',11,14,'Environmental Chemistry'),
  -- ===== CHEMISTRY Class 12 =====
  ('chemistry',12, 1,'The Solid State'),
  ('chemistry',12, 2,'Solutions'),
  ('chemistry',12, 3,'Electrochemistry'),
  ('chemistry',12, 4,'Chemical Kinetics'),
  ('chemistry',12, 5,'Surface Chemistry'),
  ('chemistry',12, 6,'General Principles and Processes of Isolation of Elements'),
  ('chemistry',12, 7,'The p-Block Elements'),
  ('chemistry',12, 8,'The d- and f-Block Elements'),
  ('chemistry',12, 9,'Coordination Compounds'),
  ('chemistry',12,10,'Haloalkanes and Haloarenes'),
  ('chemistry',12,11,'Alcohols, Phenols and Ethers'),
  ('chemistry',12,12,'Aldehydes, Ketones and Carboxylic Acids'),
  ('chemistry',12,13,'Amines'),
  ('chemistry',12,14,'Biomolecules'),
  ('chemistry',12,15,'Polymers'),
  ('chemistry',12,16,'Chemistry in Everyday Life'),
  -- ===== BIOLOGY Class 11 =====
  ('biology',11, 1,'The Living World'),
  ('biology',11, 2,'Biological Classification'),
  ('biology',11, 3,'Plant Kingdom'),
  ('biology',11, 4,'Animal Kingdom'),
  ('biology',11, 5,'Morphology of Flowering Plants'),
  ('biology',11, 6,'Anatomy of Flowering Plants'),
  ('biology',11, 7,'Structural Organisation in Animals'),
  ('biology',11, 8,'Cell: The Unit of Life'),
  ('biology',11, 9,'Biomolecules'),
  ('biology',11,10,'Cell Cycle and Cell Division'),
  ('biology',11,11,'Transport in Plants'),
  ('biology',11,12,'Mineral Nutrition'),
  ('biology',11,13,'Photosynthesis in Higher Plants'),
  ('biology',11,14,'Respiration in Plants'),
  ('biology',11,15,'Plant Growth and Development'),
  ('biology',11,16,'Digestion and Absorption'),
  ('biology',11,17,'Breathing and Exchange of Gases'),
  ('biology',11,18,'Body Fluids and Circulation'),
  ('biology',11,19,'Excretory Products and their Elimination'),
  ('biology',11,20,'Locomotion and Movement'),
  ('biology',11,21,'Neural Control and Coordination'),
  ('biology',11,22,'Chemical Coordination and Integration'),
  -- ===== BIOLOGY Class 12 =====
  ('biology',12, 1,'Reproduction in Organisms'),
  ('biology',12, 2,'Sexual Reproduction in Flowering Plants'),
  ('biology',12, 3,'Human Reproduction'),
  ('biology',12, 4,'Reproductive Health'),
  ('biology',12, 5,'Principles of Inheritance and Variation'),
  ('biology',12, 6,'Molecular Basis of Inheritance'),
  ('biology',12, 7,'Evolution'),
  ('biology',12, 8,'Human Health and Disease'),
  ('biology',12, 9,'Strategies for Enhancement in Food Production'),
  ('biology',12,10,'Microbes in Human Welfare'),
  ('biology',12,11,'Biotechnology: Principles and Processes'),
  ('biology',12,12,'Biotechnology and its Applications'),
  ('biology',12,13,'Organisms and Populations'),
  ('biology',12,14,'Ecosystem'),
  ('biology',12,15,'Biodiversity and Conservation'),
  ('biology',12,16,'Environmental Issues')
)
INSERT INTO public.qb_chapter_meta (chapter_id, class, order_index)
SELECT c.id, n.class, n.ord
FROM public.qb_chapters c
JOIN ncert n
  ON c.subject_id = n.subject_id
 AND lower(regexp_replace(c.name, '\s+', ' ', 'g')) = lower(regexp_replace(n.name, '\s+', ' ', 'g'))
ON CONFLICT (chapter_id) DO UPDATE
  SET class = EXCLUDED.class, order_index = EXCLUDED.order_index;

-- Any chapter that didn't match a NCERT entry gets pushed to the bottom.
UPDATE public.qb_chapter_meta m
   SET order_index = 999
 WHERE m.order_index IS NULL;

INSERT INTO public.qb_chapter_meta (chapter_id, class, order_index)
SELECT c.id, NULL, 999
FROM public.qb_chapters c
LEFT JOIN public.qb_chapter_meta m ON m.chapter_id = c.id
WHERE m.chapter_id IS NULL
ON CONFLICT DO NOTHING;

-- ---------- 2. Compatibility views ----------
DROP VIEW IF EXISTS public.subjects CASCADE;
CREATE VIEW public.subjects AS
SELECT
  s.id                                       AS id,          -- text 'physics' | 'chemistry' | 'biology'
  s.name                                     AS name,
  NULL::text                                 AS color,
  CASE s.id WHEN 'physics' THEN 1 WHEN 'chemistry' THEN 2 WHEN 'biology' THEN 3 ELSE 99 END AS order_index
FROM public.qb_subjects s;

DROP VIEW IF EXISTS public.chapters CASCADE;
CREATE VIEW public.chapters AS
SELECT
  c.id::text                                 AS id,          -- bigint stringified
  c.subject_id                               AS subject_id,
  c.name                                     AS name,
  COALESCE(m.class, 12)                      AS class,
  COALESCE(m.order_index, 999)               AS order_index,
  c.question_count                           AS question_count
FROM public.qb_chapters c
LEFT JOIN public.qb_chapter_meta m ON m.chapter_id = c.id;

DROP VIEW IF EXISTS public.questions CASCADE;
CREATE VIEW public.questions AS
SELECT
  q.id::text                                 AS id,
  q.subject_id                               AS subject_id,
  q.chapter_id::text                         AS chapter_id,
  q.topic_id::text                           AS topic_id,
  q.subtopic_id::text                        AS subtopic_id,
  q.question_html                            AS text,
  q.options                                  AS options,
  q.correct_index                            AS correct_answer,
  q.explanation                              AS explanation,
  q.explanation_image_url                    AS explanation_image_url,
  q.difficulty                               AS difficulty,
  q.qtype                                    AS qtype,
  q.year                                     AS year,
  q.tag                                      AS tag,
  q.is_pyq                                   AS is_pyq,
  NULL::timestamptz                          AS created_at
FROM public.qb_questions q;

GRANT SELECT ON public.subjects   TO anon, authenticated;
GRANT SELECT ON public.chapters   TO anon, authenticated;
GRANT SELECT ON public.questions  TO anon, authenticated;

COMMIT;

-- ============================================================
-- PHASE 2 — ONLY RUN AFTER EXPORTING EXISTING contests/attempts
-- ============================================================
-- These tables still hold uuid ids from the previous data set.
-- Converting them to text is destructive if any rows reference
-- uuids that no longer exist in the new qb_* data.
--
-- Recommended: TRUNCATE contests/attempts (users can re-take tests
-- against the new bank) then run:
--
-- BEGIN;
-- ALTER TABLE public.contests
--   ALTER COLUMN chapter_ids TYPE text[] USING chapter_ids::text[],
--   ALTER COLUMN question_ids TYPE text[] USING question_ids::text[];
-- -- Repeat for any other table with uuid[] chapter_ids / question_ids.
-- COMMIT;
