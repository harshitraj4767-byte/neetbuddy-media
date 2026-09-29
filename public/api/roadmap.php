<?php
// Roadmap state persistence for Hostinger MySQL backend.
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_db_try();
if (!$pdo) {
    nb_json(['ok' => false, 'error' => 'Database not connected'], 200);
}

// Auto-create roadmap_progress table if missing
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `roadmap_progress` (
            `user_id` VARCHAR(191) NOT NULL PRIMARY KEY,
            `current_level` INT NOT NULL DEFAULT 1,
            `highest_unlocked` INT NOT NULL DEFAULT 1,
            `total_xp` INT NOT NULL DEFAULT 0,
            `planner_mode` VARCHAR(50) NOT NULL DEFAULT 'Normal',
            `completed_mission_ids` JSON NULL,
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
} catch (Throwable $e) {
    // Proceed if table already exists or couldn't be created
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $userId = $_GET['user_id'] ?? '';
    if (!$userId) {
        $u = nb_current_user();
        $userId = $u['id'] ?? '';
    }
    if (!$userId) {
        nb_json(['ok' => false, 'error' => 'user_id required'], 400);
    }

    try {
        $stmt = $pdo->prepare("SELECT current_level, highest_unlocked, total_xp, planner_mode, completed_mission_ids FROM roadmap_progress WHERE user_id = ? LIMIT 1");
        $stmt->execute([$userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            nb_json(['ok' => true, 'data' => null]);
        }

        $completed = [];
        if (!empty($row['completed_mission_ids'])) {
            $decoded = json_decode($row['completed_mission_ids'], true);
            if (is_array($decoded)) {
                $completed = $decoded;
            }
        }

        nb_json([
            'ok' => true,
            'data' => [
                'current_level' => (int) $row['current_level'],
                'highest_unlocked' => (int) $row['highest_unlocked'],
                'total_xp' => (int) $row['total_xp'],
                'planner_mode' => $row['planner_mode'] ?: 'Normal',
                'completed_mission_ids' => $completed,
            ]
        ]);
    } catch (Throwable $e) {
        nb_json(['ok' => false, 'error' => $e->getMessage()], 200);
    }
} elseif ($method === 'POST') {
    $body = nb_body();
    $userId = $body['user_id'] ?? '';
    if (!$userId) {
        $u = nb_current_user();
        $userId = $u['id'] ?? '';
    }
    if (!$userId) {
        nb_json(['ok' => false, 'error' => 'user_id required'], 400);
    }

    $currentLevel = (int) ($body['current_level'] ?? 1);
    $highestUnlocked = (int) ($body['highest_unlocked'] ?? 1);
    $totalXp = (int) ($body['total_xp'] ?? 0);
    $plannerMode = (string) ($body['planner_mode'] ?? 'Normal');
    $completedMissions = json_encode($body['completed_mission_ids'] ?? [], JSON_UNESCAPED_SLASHES);

    try {
        $stmt = $pdo->prepare("
            INSERT INTO roadmap_progress (user_id, current_level, highest_unlocked, total_xp, planner_mode, completed_mission_ids)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                current_level = VALUES(current_level),
                highest_unlocked = GREATEST(highest_unlocked, VALUES(highest_unlocked)),
                total_xp = GREATEST(total_xp, VALUES(total_xp)),
                planner_mode = VALUES(planner_mode),
                completed_mission_ids = VALUES(completed_mission_ids)
        ");
        $stmt->execute([$userId, $currentLevel, $highestUnlocked, $totalXp, $plannerMode, $completedMissions]);
        nb_json(['ok' => true]);
    } catch (Throwable $e) {
        nb_json(['ok' => false, 'error' => $e->getMessage()], 200);
    }
}
