-- Mistakes notebook storage.
-- The UNIQUE KEY is required: every insert uses
-- `ON DUPLICATE KEY UPDATE created_at = NOW(6)` so re-attempting the same
-- question refreshes the row instead of piling up duplicates.

CREATE TABLE IF NOT EXISTS `wrong_questions` (
  `id` CHAR(36) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `question_id` VARCHAR(64) NOT NULL,
  `chapter_id` VARCHAR(64) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `wrong_questions_user_question` (`user_id`, `question_id`),
  KEY `wrong_questions_user_created` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- If the table already existed without the unique key, add it once
-- (run manually; MySQL has no IF NOT EXISTS for keys):
-- ALTER TABLE `wrong_questions`
--   ADD UNIQUE KEY `wrong_questions_user_question` (`user_id`, `question_id`);
