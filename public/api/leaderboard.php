<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
$userId = $user['id'] ?? null;
$limit = min((int)($_GET['limit'] ?? 100), 100);

try {
    // XP leaderboard
    $stmt = $pdo->prepare('
        SELECT p.id, p.full_name, COALESCE(p.xp_total, 0) as xp_total
        FROM profiles p
        ORDER BY xp_total DESC, p.created_at ASC
        LIMIT :lim
    ');
    $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // My rank
    $myRank = null;
    $myStreak = 0;
    if ($userId) {
        $mStmt = $pdo->prepare('SELECT xp_total FROM profiles WHERE id = ? LIMIT 1');
        $mStmt->execute([$userId]);
        $myXp = (int)$mStmt->fetchColumn();

        $rStmt = $pdo->prepare('SELECT COUNT(*) FROM profiles WHERE xp_total > ?');
        $rStmt->execute([$myXp]);
        $myRank = (int)$rStmt->fetchColumn() + 1;

        // streak calculation: count consecutive days with completed attempts
        $sStmt = $pdo->prepare('SELECT COUNT(DISTINCT DATE(submitted_at)) FROM attempts WHERE user_id = ? AND status = "completed" AND submitted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)');
        $sStmt->execute([$userId]);
        $myStreak = (int)$sStmt->fetchColumn();
    }

    // Streaks
    $stStmt = $pdo->prepare('
        SELECT p.id, p.full_name, COUNT(DISTINCT DATE(a.submitted_at)) as streak
        FROM profiles p
        JOIN attempts a ON a.user_id = p.id AND a.status = "completed" AND a.submitted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY p.id, p.full_name
        ORDER BY streak DESC
        LIMIT :lim
    ');
    $stStmt->bindValue(':lim', $limit, PDO::PARAM_INT);
    $stStmt->execute();
    $streakRows = $stStmt->fetchAll(PDO::FETCH_ASSOC);

    nb_json([
        'rows' => $rows,
        'myRank' => $myRank,
        'streakRows' => $streakRows,
        'myStreak' => $myStreak,
        'myStreakRank' => $myRank,
    ]);
} catch (Throwable $e) {
    nb_fail($e->getMessage(), 500);
}
