-- =============================================================================
-- PATH 2 MIGRATION SCRIPT: NCERT PAGE & SECTION HIERARCHY + LINK AUDITOR
-- Compatible with Hostinger MySQL 8.x / MariaDB
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Create strict NCERT passages table with Page and Section hierarchy
CREATE TABLE IF NOT EXISTS ncert_passages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  edition VARCHAR(20) NOT NULL DEFAULT '2024-2025',
  subject ENUM('physics', 'chemistry', 'biology') NOT NULL,
  class_level ENUM('11', '12') NOT NULL,
  chapter_number INT NOT NULL,
  chapter_title VARCHAR(255) NOT NULL,
  page_number INT NOT NULL DEFAULT 1,             -- NCERT textbook official page number
  section_code VARCHAR(50) NOT NULL DEFAULT '1.0', -- e.g. '8.2', '8.2.1'
  section_title VARCHAR(255) NOT NULL DEFAULT '', -- e.g. 'Endoplasmic Reticulum'
  paragraph_start INT NOT NULL DEFAULT 1,         -- Start paragraph number on this page
  paragraph_end INT NOT NULL DEFAULT 1,           -- End paragraph number on this page
  passage_text LONGTEXT NOT NULL,
  diagram_url VARCHAR(500) DEFAULT NULL,
  has_pyq BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_subject_chapter_page (subject, chapter_number, page_number),
  INDEX idx_subject_chapter_section (subject, chapter_number, section_code),
  INDEX idx_class_chapter (class_level, chapter_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Create strict many-to-many question linking table anchored by Page & Passage
CREATE TABLE IF NOT EXISTS ncert_question_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  passage_id INT NOT NULL,
  question_id INT NOT NULL,
  page_number INT DEFAULT NULL,
  link_scope ENUM('page', 'section', 'paragraph_window', 'exact_line') NOT NULL DEFAULT 'page',
  link_type ENUM('direct_pyq', 'line_concept', 'diagram_based') NOT NULL DEFAULT 'line_concept',
  confidence_score DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  status ENUM('verified', 'needs_review', 'rejected') NOT NULL DEFAULT 'needs_review',
  rejection_reason VARCHAR(255) DEFAULT NULL,
  verified_by VARCHAR(100) DEFAULT NULL,
  verified_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_link_passage FOREIGN KEY (`passage_id`) REFERENCES `ncert_passages` (`id`) ON DELETE CASCADE,
  UNIQUE KEY uq_passage_question (`passage_id`, `question_id`),
  INDEX idx_question (`question_id`),
  INDEX idx_passage_page_status (`passage_id`, `page_number`, `status`),
  INDEX idx_status (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Populate default passages using existing nugget_pages & nugget_blocks if available,
-- else fallback to ncert_book_blocks / ncert_highlights
INSERT IGNORE INTO ncert_passages 
  (subject, class_level, chapter_number, chapter_title, page_number, section_code, section_title, paragraph_start, paragraph_end, passage_text)
SELECT 
  LOWER(COALESCE(c.subject, 'biology')) AS subject,
  CASE WHEN c.ord <= 19 THEN '11' ELSE '12' END AS class_level,
  COALESCE(c.id, 1) AS chapter_number,
  COALESCE(c.title, 'General Chapter') AS chapter_title,
  COALESCE(CAST(NULLIF(p.ncert_page, '') AS UNSIGNED), p.position, 1) AS page_number,
  CONCAT('P.', COALESCE(p.position, 1)) AS section_code,
  COALESCE(p.heading, 'Chapter Section') AS section_title,
  1 AS paragraph_start,
  GREATEST(1, COUNT(b.id)) AS paragraph_end,
  GROUP_CONCAT(b.text ORDER BY b.position SEPARATOR '\n\n') AS passage_text
FROM nugget_pages p
JOIN nugget_chapters c ON p.chapter_id = c.id
LEFT JOIN nugget_blocks b ON b.page_id = p.id AND b.kind = 'paragraph'
GROUP BY p.id;

-- 4. Initial Audit & Linking
-- Step 4A: Link questions by explicit NCERT Page Number (from nugget_questions or ncert_book_pyq)
INSERT IGNORE INTO ncert_question_links 
  (passage_id, question_id, page_number, link_scope, link_type, confidence_score, status, verified_by, verified_at)
SELECT 
  p.id AS passage_id,
  q.id AS question_id,
  p.page_number,
  'page' AS link_scope,
  'direct_pyq' AS link_type,
  1.00 AS confidence_score,
  'verified' AS status,
  'ncert_page_match' AS verified_by,
  NOW() AS verified_at
FROM nugget_questions q
JOIN ncert_passages p 
  ON p.chapter_number = q.chapter_id 
 AND p.subject = q.subject 
 AND p.page_number = CAST(NULLIF(q.ncert_page, '') AS UNSIGNED)
WHERE q.ncert_page IS NOT NULL AND q.ncert_page != '';

-- Step 4B: Link remaining question bank questions to their section/page
INSERT IGNORE INTO ncert_question_links 
  (passage_id, question_id, page_number, link_scope, link_type, confidence_score, status)
SELECT 
  p.id AS passage_id,
  q.id AS question_id,
  p.page_number,
  'section' AS link_scope,
  'line_concept' AS link_type,
  0.85 AS confidence_score,
  'needs_review' AS status
FROM qb_questions q
JOIN ncert_passages p 
  ON p.chapter_number = q.chapter_id 
 AND p.subject = q.subject_id;

-- Step 4C: HARD QUARANTINE / REJECT:
-- Disconnect questions where subject or chapter doesn't match the passage
UPDATE ncert_question_links l
JOIN ncert_passages p ON l.passage_id = p.id
JOIN qb_questions q ON l.question_id = q.id
SET 
  l.status = 'rejected',
  l.rejection_reason = 'Cross-chapter or cross-subject mismatch detected in legacy data'
WHERE p.chapter_number != q.chapter_id OR p.subject != q.subject_id;

-- Step 4D: QUARANTINE:
-- Questions with an image that does not match the passage diagram MUST be quarantined
UPDATE ncert_question_links l
JOIN ncert_passages p ON l.passage_id = p.id
JOIN qb_questions q ON l.question_id = q.id
SET 
  l.status = 'needs_review',
  l.rejection_reason = 'Image present on question but does not match passage diagram'
WHERE l.status != 'rejected'
  AND (
    (q.explanation_image_url IS NOT NULL AND (p.diagram_url IS NULL OR p.diagram_url != q.explanation_image_url))
    OR (q.question_html LIKE '%<img%' AND p.diagram_url IS NULL)
  );

SET FOREIGN_KEY_CHECKS = 1;

-- 5. Status Summary Output
SELECT 
  status, 
  link_scope,
  COUNT(*) AS total_links,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM ncert_question_links), 2) AS percentage
FROM ncert_question_links
GROUP BY status, link_scope;
