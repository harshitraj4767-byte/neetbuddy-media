<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
$userId = $user['id'] ?? null;

$action = $_GET['action'] ?? $_POST['action'] ?? 'today';
$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

if (!$userId) {
    nb_fail('Unauthorized', 401);
}

$date = $input['date'] ?? $_GET['date'] ?? date('Y-m-d');

try {
    if ($action === 'today' || $action === 'get') {
        $stmt = $pdo->prepare('SELECT * FROM daily_checklist WHERE user_id = ? AND date = ? LIMIT 1');
        $stmt->execute([$userId, $date]);
        $cl = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$cl) {
            $clId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
            $ins = $pdo->prepare('INSERT INTO daily_checklist (id, user_id, date, created_at) VALUES (?, ?, ?, NOW())');
            $ins->execute([$clId, $userId, $date]);
            $cl = [
                'id' => $clId,
                'user_id' => $userId,
                'date' => $date,
                'morning_submitted_at' => null,
                'night_submitted_at' => null,
                'good_things' => null,
                'regrets' => null,
            ];
        }

        $iStmt = $pdo->prepare('SELECT * FROM daily_checklist_items WHERE checklist_id = ? ORDER BY position ASC, id ASC');
        $iStmt->execute([$cl['id']]);
        $items = $iStmt->fetchAll(PDO::FETCH_ASSOC);

        nb_json([
            'checklist' => $cl,
            'items' => $items,
        ]);
    }

    if ($action === 'submit_morning') {
        $tasks = $input['tasks'] ?? [];
        if (!is_array($tasks)) $tasks = [];

        $stmt = $pdo->prepare('SELECT id FROM daily_checklist WHERE user_id = ? AND date = ? LIMIT 1');
        $stmt->execute([$userId, $date]);
        $clId = $stmt->fetchColumn();

        if (!$clId) {
            $clId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
            $pdo->prepare('INSERT INTO daily_checklist (id, user_id, date, morning_submitted_at, created_at) VALUES (?, ?, ?, NOW(), NOW())')
                ->execute([$clId, $userId, $date]);
        } else {
            $pdo->prepare('UPDATE daily_checklist SET morning_submitted_at = NOW() WHERE id = ?')
                ->execute([$clId]);
        }

        $pos = 0;
        foreach ($tasks as $t) {
            $taskText = trim(is_string($t) ? $t : ($t['task'] ?? ''));
            if ($taskText !== '') {
                $itemId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                    mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                    mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
                    mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
                $pdo->prepare('INSERT INTO daily_checklist_items (id, checklist_id, task, position, completed, created_at) VALUES (?, ?, ?, ?, 0, NOW())')
                    ->execute([$itemId, $clId, $taskText, $pos++]);
            }
        }

        nb_json(['success' => true]);
    }

    if ($action === 'toggle_item') {
        $itemId = $input['item_id'] ?? $input['id'] ?? '';
        $completed = !empty($input['completed']) ? 1 : 0;
        $stmt = $pdo->prepare('UPDATE daily_checklist_items SET completed = ? WHERE id = ?');
        $stmt->execute([$completed, $itemId]);
        nb_json(['success' => true]);
    }

    if ($action === 'submit_night') {
        $good = $input['good'] ?? '';
        $regret = $input['regret'] ?? '';
        $stmt = $pdo->prepare('UPDATE daily_checklist SET good_things = ?, regrets = ?, night_submitted_at = NOW() WHERE user_id = ? AND date = ?');
        $stmt->execute([$good, $regret, $userId, $date]);
        nb_json(['success' => true]);
    }

    if ($action === 'history') {
        $days = (int)($input['days'] ?? $_GET['days'] ?? 14);
        $stmt = $pdo->prepare('SELECT * FROM daily_checklist WHERE user_id = ? ORDER BY date DESC LIMIT ?');
        $stmt->bindValue(1, $userId, PDO::PARAM_STR);
        $stmt->bindValue(2, $days, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        nb_json(['history' => $rows]);
    }

    nb_json(['status' => 'ok']);
} catch (Throwable $e) {
    nb_fail($e->getMessage(), 500);
}
