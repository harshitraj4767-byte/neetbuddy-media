<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
if (!$user) {
    nb_fail('Unauthorized', 401);
}
$userId = $user['id'];

// Total completed tests
$stmt = $pdo->prepare('SELECT COUNT(*) FROM test_attempts WHERE user_id = ? AND is_completed = 1');
$stmt->execute([$userId]);
$totalTests = (int)$stmt->fetchColumn();

// Average accuracy
$stmt = $pdo->prepare('SELECT AVG(score / NULLIF(total_questions * 4, 0)) * 100 FROM test_attempts WHERE user_id = ? AND is_completed = 1 AND total_questions > 0');
$stmt->execute([$userId]);
$avgAccuracy = round((float)$stmt->fetchColumn(), 1);

// Total bookmarks
$stmt = $pdo->prepare('SELECT COUNT(*) FROM bookmarks WHERE user_id = ?');
$stmt->execute([$userId]);
$totalBookmarks = (int)$stmt->fetchColumn();

// Recent attempts
$stmt = $pdo->prepare('SELECT t.id, t.test_id, t.score, t.total_questions, t.completed_at FROM test_attempts t WHERE t.user_id = ? AND t.is_completed = 1 ORDER BY t.completed_at DESC LIMIT 5');
$stmt->execute([$userId]);
$recent = $stmt->fetchAll();

nb_json([
    'stats' => [
        'totalTests' => $totalTests,
        'averageAccuracy' => $avgAccuracy,
        'totalBookmarks' => $totalBookmarks,
    ],
    'recentAttempts' => $recent,
    'user' => [
        'id' => $user['id'],
        'email' => $user['email'],
        'name' => $user['name'] ?? null,
    ],
]);
