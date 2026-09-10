<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
$userId = $user['id'] ?? null;

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

switch ($action) {
    case 'getQuizTest':
        $testId = $input['testId'] ?? $_GET['testId'] ?? '';
        if (!$testId) nb_fail('testId required');
        
        $stmt = $pdo->prepare('SELECT * FROM tests WHERE id = ? LIMIT 1');
        $stmt->execute([$testId]);
        $test = $stmt->fetch();
        if (!$test) nb_fail('Test not found', 404);
        
        nb_json(['test' => $test]);
        break;

    case 'getQuizQuestions':
        $testId = $input['testId'] ?? $_GET['testId'] ?? null;
        $questionIds = $input['questionIds'] ?? [];
        
        if ($testId && empty($questionIds)) {
            $stmt = $pdo->prepare('SELECT question_ids FROM tests WHERE id = ? LIMIT 1');
            $stmt->execute([$testId]);
            $raw = $stmt->fetchColumn();
            if ($raw) {
                $questionIds = json_decode((string)$raw, true) ?? [];
            }
        }
        
        if (empty($questionIds)) {
            nb_json(['questions' => []]);
        }
        
        $in = implode(',', array_fill(0, count($questionIds), '?'));
        $stmt = $pdo->prepare("SELECT * FROM qb_questions WHERE id IN ($in)");
        $stmt->execute(array_values($questionIds));
        $rows = $stmt->fetchAll();
        
        $questions = array_map(function ($row) {
            $opts = [];
            for ($i = 0; $i < 4; $i++) {
                $k = 'option_' . chr(97 + $i);
                if (isset($row[$k])) {
                    $opts[] = ['index' => $i, 'html' => (string)$row[$k]];
                }
            }
            return [
                'id' => (string)$row['id'],
                'questionHtml' => (string)($row['question_text'] ?? $row['question_html'] ?? ''),
                'options' => $opts,
                'correctIndex' => (int)($row['correct_option'] ?? 0),
                'explanation' => $row['explanation'] ?? null,
                'difficulty' => $row['difficulty'] ?? 'medium',
                'qtype' => $row['qtype'] ?? 'single',
                'subjectName' => $row['subject_name'] ?? null,
                'chapterName' => $row['chapter_name'] ?? null,
            ];
        }, $rows);
        
        nb_json(['questions' => $questions]);
        break;

    case 'saveQuizProgress':
        if (!$userId) nb_fail('Unauthorized', 401);
        $testId = $input['testId'] ?? '';
        $answers = json_encode($input['answers'] ?? []);
        $timeSpent = (int)($input['timeSpent'] ?? 0);
        
        $stmt = $pdo->prepare('INSERT INTO test_attempts (user_id, test_id, answers, time_spent_seconds, updated_at) VALUES (?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE answers = VALUES(answers), time_spent_seconds = VALUES(time_spent_seconds), updated_at = NOW()');
        $stmt->execute([$userId, $testId, $answers, $timeSpent]);
        nb_json(['success' => true]);
        break;

    case 'submitQuizAttempt':
        if (!$userId) nb_fail('Unauthorized', 401);
        $testId = $input['testId'] ?? '';
        $score = (int)($input['score'] ?? 0);
        $totalQuestions = (int)($input['totalQuestions'] ?? 0);
        $answers = json_encode($input['answers'] ?? []);
        $timeSpent = (int)($input['timeSpent'] ?? 0);
        
        $stmt = $pdo->prepare('INSERT INTO test_attempts (user_id, test_id, score, total_questions, answers, time_spent_seconds, is_completed, completed_at) VALUES (?, ?, ?, ?, ?, ?, 1, NOW())');
        $stmt->execute([$userId, $testId, $score, $totalQuestions, $answers, $timeSpent]);
        nb_json(['success' => true, 'attemptId' => (int)$pdo->lastInsertId()]);
        break;

    case 'getQuizBookmarks':
        if (!$userId) nb_fail('Unauthorized', 401);
        $stmt = $pdo->prepare('SELECT question_id FROM bookmarks WHERE user_id = ?');
        $stmt->execute([$userId]);
        $bookmarks = $stmt->fetchAll(PDO::FETCH_COLUMN);
        nb_json(['bookmarks' => $bookmarks]);
        break;

    case 'toggleQuizBookmark':
        if (!$userId) nb_fail('Unauthorized', 401);
        $questionId = $input['questionId'] ?? '';
        if (!$questionId) nb_fail('questionId required');
        
        $stmt = $pdo->prepare('SELECT id FROM bookmarks WHERE user_id = ? AND question_id = ? LIMIT 1');
        $stmt->execute([$userId, $questionId]);
        if ($stmt->fetch()) {
            $del = $pdo->prepare('DELETE FROM bookmarks WHERE user_id = ? AND question_id = ?');
            $del->execute([$userId, $questionId]);
            nb_json(['bookmarked' => false]);
        } else {
            $ins = $pdo->prepare('INSERT INTO bookmarks (user_id, question_id, created_at) VALUES (?, ?, NOW())');
            $ins->execute([$userId, $questionId]);
            nb_json(['bookmarked' => true]);
        }
        break;

    default:
        nb_fail('Invalid action');
}
