-- Bookmarks storage. The app writes here from setQuizBookmark /
-- toggleQuizBookmark and reads via listUserBookmarks. The UNIQUE key is
-- required: without it ON DUPLICATE KEY UPDATE cannot dedupe and one question
-- can be bookmarked many times.
CREATE TABLE IF NOT EXISTS `bookmarks` (
  `id` CHAR(36) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `question_id` VARCHAR(64) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `bookmarks_user_question` (`user_id`, `question_id`),
  KEY `bookmarks_user_created` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
