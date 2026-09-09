-- Email + password authentication tables for the MySQL migration.
-- Replaces Supabase's auth.users / auth.sessions. Loaded last by ./load.sh.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `auth_users` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(255) DEFAULT NULL,
  `email_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `suspended` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_users_email_key` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auth_sessions` (
  `token_hash` CHAR(64) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `expires_at` DATETIME(6) NOT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `auth_sessions_user_id_idx` (`user_id`),
  KEY `auth_sessions_expires_at_idx` (`expires_at`),
  CONSTRAINT `auth_sessions_user_id_fkey` FOREIGN KEY (`user_id`)
    REFERENCES `auth_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing profiles carried over from PostgreSQL have no auth row yet.
-- Seed one per profile so those accounts can use "forgot password" later;
-- the placeholder hash can never match a real password.
INSERT IGNORE INTO `auth_users` (`id`, `email`, `password_hash`, `full_name`, `email_verified`, `suspended`, `created_at`)
SELECT p.`id`, p.`email`, 'pbkdf2$100000$migrated$migrated', p.`full_name`, 1, 0, COALESCE(p.`created_at`, NOW(6))
FROM `profiles` p
WHERE p.`email` IS NOT NULL AND p.`email` <> '';
