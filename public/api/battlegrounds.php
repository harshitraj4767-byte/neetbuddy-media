<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
$userId = $user['id'] ?? null;
$action = $_GET['action'] ?? $_POST['action'] ?? 'rooms';

if ($action === 'history' && $userId) {
    try {
        $stmt = $pdo->prepare('SELECT * FROM battle_matches WHERE player1_id = :uid OR player2_id = :uid ORDER BY created_at DESC LIMIT 20');
        $stmt->execute([':uid' => $userId]);
        nb_json(['history' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (Throwable $e) {
        nb_json(['history' => []]);
    }
}

if ($action === 'rooms') {
    try {
        $stmt = $pdo->prepare('SELECT * FROM battle_matches WHERE status = "waiting" ORDER BY created_at DESC LIMIT 20');
        $stmt->execute();
        nb_json(['rooms' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (Throwable $e) {
        nb_json(['rooms' => []]);
    }
}

nb_json(['success' => true]);
