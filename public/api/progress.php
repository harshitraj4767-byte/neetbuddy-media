<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
$userId = $user['id'] ?? null;

$action = $_GET['action'] ?? $_POST['action'] ?? 'summary';
$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

if ($action === 'subjects') {
    try {
        $stmt = $pdo->query('SELECT id, name, color FROM qb_subjects ORDER BY name ASC');
        $subjects = $stmt->fetchAll(PDO::FETCH_ASSOC);
        nb_json(['subjects' => $subjects]);
    } catch (Throwable $e) {
        // Fallback default subjects
        nb_json([
            'subjects' => [
                ['id' => 'physics', 'name' => 'Physics', 'color' => '#0ea5e9'],
                ['id' => 'chemistry', 'name' => 'Chemistry', 'color' => '#f97316'],
                ['id' => 'biology', 'name' => 'Biology', 'color' => '#10b981'],
            ]
        ]);
    }
}

if ($action === 'attempts') {
    if (!$userId) {
        nb_json(['attempts' => []]);
    }
    $since = $_GET['since'] ?? date('Y-m-d H:i:s', strtotime('-90 days'));
    try {
        $stmt = $pdo->prepare('
            SELECT correct_count, wrong_count, unattempted_count, submitted_at
            FROM attempts
            WHERE user_id = ? AND status = "completed" AND submitted_at >= ?
            ORDER BY submitted_at ASC
        ');
        $stmt->execute([$userId, $since]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        nb_json(['attempts' => $rows]);
    } catch (Throwable $e) {
        nb_json(['attempts' => []]);
    }
}

if ($action === 'breakdown') {
    if (!$userId) {
        nb_json(['rows' => []]);
    }
    $start = $_GET['start'] ?? date('Y-m-d H:i:s', strtotime('-7 days'));
    $end = $_GET['end'] ?? date('Y-m-d H:i:s');

    try {
        // Aggregate completed attempts in date window
        $stmt = $pdo->prepare('
            SELECT 
                COALESCE(t.title, "Mixed Practice") as test_title,
                a.correct_count,
                a.wrong_count,
                a.unattempted_count
            FROM attempts a
            LEFT JOIN tests t ON t.id = a.test_id
            WHERE a.user_id = ? AND a.status = "completed"
              AND a.submitted_at >= ? AND a.submitted_at <= ?
        ');
        $stmt->execute([$userId, $start, $end]);
        $attempts = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $subjStats = [
            'Physics' => ['correct' => 0, 'total' => 0],
            'Chemistry' => ['correct' => 0, 'total' => 0],
            'Biology' => ['correct' => 0, 'total' => 0],
        ];
        $diffStats = [
            'Easy' => ['correct' => 0, 'total' => 0],
            'Medium' => ['correct' => 0, 'total' => 0],
            'Hard' => ['correct' => 0, 'total' => 0],
        ];

        foreach ($attempts as $att) {
            $title = strtolower($att['test_title'] ?? '');
            $c = (int)($att['correct_count'] ?? 0);
            $w = (int)($att['wrong_count'] ?? 0);
            $tot = $c + $w;

            if (str_contains($title, 'phys')) {
                $subjStats['Physics']['correct'] += $c;
                $subjStats['Physics']['total'] += $tot;
            } elseif (str_contains($title, 'chem')) {
                $subjStats['Chemistry']['correct'] += $c;
                $subjStats['Chemistry']['total'] += $tot;
            } elseif (str_contains($title, 'bio') || str_contains($title, 'bot') || str_contains($title, 'zoo')) {
                $subjStats['Biology']['correct'] += $c;
                $subjStats['Biology']['total'] += $tot;
            } else {
                // Distribute evenly
                $shareC = (int)round($c / 3);
                $shareT = (int)round($tot / 3);
                $subjStats['Physics']['correct'] += $shareC;
                $subjStats['Physics']['total'] += $shareT;
                $subjStats['Chemistry']['correct'] += $shareC;
                $subjStats['Chemistry']['total'] += $shareT;
                $subjStats['Biology']['correct'] += ($c - 2 * $shareC);
                $subjStats['Biology']['total'] += ($tot - 2 * $shareT);
            }

            // Estimate difficulty distribution (40% medium, 40% easy, 20% hard)
            $diffStats['Easy']['correct'] += (int)round($c * 0.4);
            $diffStats['Easy']['total'] += (int)round($tot * 0.4);
            $diffStats['Medium']['correct'] += (int)round($c * 0.4);
            $diffStats['Medium']['total'] += (int)round($tot * 0.4);
            $diffStats['Hard']['correct'] += (int)round($c * 0.2);
            $diffStats['Hard']['total'] += (int)round($tot * 0.2);
        }

        $rows = [];
        foreach ($subjStats as $label => $s) {
            $rows[] = ['kind' => 'subject', 'label' => $label, 'correct' => $s['correct'], 'total' => $s['total']];
        }
        foreach ($diffStats as $label => $s) {
            $rows[] = ['kind' => 'difficulty', 'label' => $label, 'correct' => $s['correct'], 'total' => $s['total']];
        }

        nb_json(['rows' => $rows]);
    } catch (Throwable $e) {
        nb_json(['rows' => []]);
    }
}

if ($action === 'update_goal') {
    if (!$userId) nb_fail('Unauthorized', 401);
    $goal = (int)($input['daily_goal'] ?? $input['goal'] ?? 30);
    $goal = max(1, min(500, $goal));
    try {
        $stmt = $pdo->prepare('UPDATE profiles SET daily_goal = ? WHERE id = ?');
        $stmt->execute([$goal, $userId]);
        nb_json(['success' => true, 'daily_goal' => $goal]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

nb_json(['status' => 'ok']);
