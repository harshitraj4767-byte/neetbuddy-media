<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
$userId = $user['id'] ?? null;
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    try {
        $stmt = $pdo->prepare('SELECT id, title, description, difficulty, duration_min, total_questions, source, created_at, starts_at, ends_at, type FROM tests WHERE type IN ("dpp", "daily") ORDER BY created_at DESC LIMIT 100');
        $stmt->execute();
        $tests = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $attemptsMap = [];
        if ($userId && !empty($tests)) {
            $testIds = array_column($tests, 'id');
            $in = implode(',', array_fill(0, count($testIds), '?'));
            $aStmt = $pdo->prepare("SELECT id, test_id, status, score, correct_count, wrong_count, started_at, submitted_at FROM attempts WHERE user_id = ? AND test_id IN ($in) ORDER BY started_at DESC");
            $aStmt->execute(array_merge([$userId], $testIds));
            while ($att = $aStmt->fetch(PDO::FETCH_ASSOC)) {
                $tid = $att['test_id'];
                if (!isset($attemptsMap[$tid])) {
                    $attemptsMap[$tid] = $att;
                }
            }
        }

        if (empty($tests)) {
            // First visit of the day: create today's DPP so the page is never empty.
            $qStmt = $pdo->prepare('SELECT id FROM qb_questions ORDER BY RAND() LIMIT 10');
            $qStmt->execute();
            $dppQids = $qStmt->fetchAll(PDO::FETCH_COLUMN);
            if (!empty($dppQids)) {
                $dppId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                    mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
                    mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
                $insDpp = $pdo->prepare('INSERT INTO tests (id, title, description, difficulty, duration_min, total_questions, marks_correct, marks_wrong, source, type, question_ids, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
                $insDpp->execute([
                    $dppId,
                    'Daily DPP - ' . date('d M Y'),
                    '10 Daily Practice Questions curated for NEET',
                    'medium',
                    15,
                    count($dppQids),
                    4,
                    -1,
                    'Daily DPP',
                    'dpp',
                    json_encode($dppQids),
                    $userId,
                ]);
                $tStmt = $pdo->prepare('SELECT id, title, description, difficulty, duration_min, total_questions, source, created_at, starts_at, ends_at, type FROM tests WHERE id = ? LIMIT 1');
                $tStmt->execute([$dppId]);
                $tests = $tStmt->fetchAll(PDO::FETCH_ASSOC);
            }
        }

        nb_json([
            'tests' => $tests,
            'dpp_list' => $tests,
            'attempts' => $attemptsMap,
        ]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $action = $input['action'] ?? $_GET['action'] ?? 'start';

    if ($action === 'start' || $action === 'generate') {
        try {
            // Find existing DPP for today or recent
            $today = date('Y-m-d');
            $stmt = $pdo->prepare('SELECT * FROM tests WHERE (type = "dpp" OR type = "daily") AND DATE(created_at) = ? ORDER BY created_at DESC LIMIT 1');
            $stmt->execute([$today]);
            $test = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$test) {
                // Generate a fresh DPP test from qb_questions
                $qStmt = $pdo->prepare('SELECT id FROM qb_questions ORDER BY RAND() LIMIT 10');
                $qStmt->execute();
                $qids = $qStmt->fetchAll(PDO::FETCH_COLUMN);

                if (!empty($qids)) {
                    $testId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                        mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
                        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
                    
                    $ins = $pdo->prepare('INSERT INTO tests (id, title, description, difficulty, duration_min, total_questions, marks_correct, marks_wrong, source, type, question_ids, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
                    $title = 'Daily DPP - ' . date('d M Y');
                    $ins->execute([
                        $testId,
                        $title,
                        '10 Daily Practice Questions curated for NEET',
                        'medium',
                        15,
                        count($qids),
                        4,
                        -1,
                        'Daily DPP',
                        'dpp',
                        json_encode($qids),
                        $userId,
                    ]);

                    $tStmt = $pdo->prepare('SELECT * FROM tests WHERE id = ? LIMIT 1');
                    $tStmt->execute([$testId]);
                    $test = $tStmt->fetch(PDO::FETCH_ASSOC);
                }
            }

            if ($test) {
                nb_json(['success' => true, 'test' => $test, 'test_id' => $test['id']]);
            } else {
                nb_fail('Could not generate DPP test', 500);
            }
        } catch (Throwable $e) {
            nb_fail($e->getMessage(), 500);
        }
    }
}

nb_fail('Method not allowed', 405);
