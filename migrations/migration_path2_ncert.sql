-- =============================================================================
-- PATH 2 MIGRATION SCRIPT: STRICT NCERT HIERARCHY & LINK QUARANTINE
-- Compatible with Hostinger MySQL 8.x / MariaDB
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Create strict NCERT passages table
CREATE TABLE IF NOT EXISTS ncert_passages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  edition VARCHAR(20) NOT NULL DEFAULT '2024-2025',
  subject ENUM('physics', 'chemistry', 'biology') NOT NULL,
  class_level ENUM('11', '12') NOT NULL,
  chapter_number INT NOT NULL,
  chapter_title VARCHAR(255) NOT NULL,
  section_code VARCHAR(50) NOT NULL,          -- e.g. '8.2.1' or 'Chapter8_Sec2'
  paragraph_number INT NOT NULL,              -- 1-based index in that section
  passage_text TEXT NOT NULL,
  diagram_url VARCHAR(500) DEFAULT NULL,
  has_pyq BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_passage (subject, class_level, chapter_number, section_code, paragraph_number),
  INDEX idx_subject_chapter (subject, chapter_number),
  INDEX idx_class_chapter (class_level, chapter_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Create strict many-to-many question linking table
CREATE TABLE IF NOT EXISTS ncert_question_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  passage_id INT NOT NULL,
  question_id INT NOT NULL,
  link_type ENUM('direct_pyq', 'line_concept', 'diagram_based') NOT NULL DEFAULT 'line_concept',
  confidence_score DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  status ENUM('verified', 'needs_review', 'rejected') NOT NULL DEFAULT 'needs_review',
  rejection_reason VARCHAR(255) DEFAULT NULL,
  verified_by VARCHAR(100) DEFAULT NULL,
  verified_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_link_passage FOREIGN KEY (passage_id) REFERENCES ncert_passages(id) ON DELETE CASCADE,
  UNIQUE KEY uq_passage_question (passage_id, question_id),
  INDEX idx_question (question_id),
  INDEX idx_passage_status (passage_id, status),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Populate default passages from existing highlights if not present
-- (Maps existing ncert_highlights or chapter notes into the new passage format)
INSERT IGNORE INTO ncert_passages (subject, class_level, chapter_number, chapter_title, section_code, paragraph_number, passage_text)
SELECT 
  LOWER(COALESCE(s.name, 'biology')) AS subject,
  '11' AS class_level,
  COALESCE(c.id, 1) AS chapter_number,
  COALESCE(c.name, 'General Chapter') AS chapter_title,
  '1.0' AS section_code,
  ROW_NUMBER() OVER(PARTITION BY nh.chapter_id ORDER BY nh.id) AS paragraph_number,
  nh.body AS passage_text
FROM ncert_highlights nh
LEFT JOIN chapters c ON nh.chapter_id = c.id
LEFT JOIN subjects s ON c.subject_id = s.id
WHERE nh.body IS NOT NULL AND CHAR_LENGTH(TRIM(nh.body)) > 0;

-- 4. Initial Audit & Linking
-- Step 4A: Insert links where question and passage have identical chapter and subject
INSERT IGNORE INTO ncert_question_links (passage_id, question_id, link_type, confidence_score, status)
SELECT 
  p.id AS passage_id,
  q.id AS question_id,
  'line_concept' AS link_type,
  0.80 AS confidence_score,
  'needs_review' AS status
FROM qb_questions q
JOIN ncert_passages p 
  ON p.chapter_number = q.chapter_id 
 AND p.subject = q.subject_id;

-- Step 4B: Promote questions with exact diagram matching or exact text mention to 'verified'
UPDATE ncert_question_links l
JOIN ncert_passages p ON l.passage_id = p.id
JOIN qb_questions q ON l.question_id = q.id
SET 
  l.status = 'verified',
  l.confidence_score = 1.00,
  l.verified_by = 'migration_auto_auditor',
  l.verified_at = NOW()
WHERE 
  -- Both have valid matching diagrams or the question specifically tags this chapter/pyq
  (p.diagram_url IS NOT NULL AND q.explanation_image_url IS NOT NULL AND p.diagram_url = q.explanation_image_url)
  OR (q.year IS NOT NULL AND p.has_pyq = 1);

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
  COUNT(*) AS total_links,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM ncert_question_links), 2) AS percentage
FROM ncert_question_links
GROUP BY status;
