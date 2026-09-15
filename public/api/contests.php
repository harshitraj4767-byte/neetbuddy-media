<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
$userId = $user['id'] ?? null;
$contestId = $_GET['contest_id'] ?? null;

if ($contestId) {
    try {
        $stmt = $pdo->prepare('SELECT * FROM tests WHERE id = :id AND type = "contest" LIMIT 1');
        $stmt->execute([':id' => $contestId]);
        $contest = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$contest) {
            nb_fail('Contest not found', 404);
        }
        nb_json(['contest' => $contest]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

try {
    $stmt = $pdo->query('SELECT * FROM tests WHERE type = "contest" ORDER BY starts_at DESC, created_at DESC LIMIT 50');
    $contests = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $myEntries = [];
    if ($userId && !empty($contests)) {
        $ids = array_column($contests, 'id');
        $in = implode(',', array_fill(0, count($ids), '?'));
        $eStmt = $pdo->prepare("SELECT test_id, id as attempt_id, status, score FROM attempts WHERE user_id = ? AND test_id IN ($in)");
        $eStmt->execute(array_merge([$userId], $ids));
        while ($r = $eStmt->fetch(PDO::FETCH_ASSOC)) {
            $myEntries[$r['test_id']] = $r;
        }
    }

    nb_json(['contests' => $contests, 'entries' => $myEntries]);
} catch (Throwable $e) {
    nb_fail($e->getMessage(), 500);
}
