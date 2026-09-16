<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
$userId = $user['id'] ?? null;

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
if (!$action && isset($input['action'])) {
    $action = $input['action'];
}

switch ($action) {
    case 'getQuizTest':
        $testId = $input['testId'] ?? $_GET['testId'] ?? '';
        if (!$testId) nb_fail('testId required');
        
        $stmt = $pdo->prepare('SELECT * FROM tests WHERE id = ? LIMIT 1');
        $stmt->execute([$testId]);
        $test = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$test) nb_fail('Test not found', 404);

        if (isset($test['question_ids']) && is_string($test['question_ids'])) {
            $test['question_ids'] = json_decode($test['question_ids'], true) ?: [];
        }
        
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
        $stmt = $pdo->prepare("
            SELECT q.*, s.name AS subject_name, c.name AS chapter_name 
            FROM qb_questions q
            LEFT JOIN qb_subjects s ON s.id = q.subject_id
            LEFT JOIN qb_chapters c ON c.id = q.chapter_id
            WHERE q.id IN ($in)
        ");
        $stmt->execute(array_values($questionIds));
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $questions = array_map(function ($row) {
            $opts = [];
            if (!empty($row['options'])) {
                $rawOpts = is_string($row['options']) ? json_decode($row['options'], true) : $row['options'];
                if (is_array($rawOpts)) {
                    foreach ($rawOpts as $idx => $opt) {
                        $opts[] = [
                            'index' => is_numeric($idx) ? (int)$idx : count($opts),
                            'html' => is_string($opt) ? $opt : (string)($opt['html'] ?? ''),
                        ];
                    }
                }
            }
            if (empty($opts)) {
                for ($i = 0; $i < 4; $i++) {
                    $k = 'option_' . chr(97 + $i);
                    if (isset($row[$k]) && $row[$k] !== '') {
                        $opts[] = ['index' => $i, 'html' => (string)$row[$k]];
                    }
                }
            }

            return [
                'id' => (string)$row['id'],
                'questionHtml' => (string)($row['question_text'] ?? $row['question_html'] ?? $row['text'] ?? ''),
                'text' => (string)($row['question_text'] ?? $row['question_html'] ?? $row['text'] ?? ''),
                'options' => $opts,
                'correctIndex' => (int)($row['correct_option'] ?? $row['correct_index'] ?? 0),
                'correct_index' => (int)($row['correct_option'] ?? $row['correct_index'] ?? 0),
                'explanation' => $row['explanation'] ?? null,
                'questionImageUrl' => $row['question_image_url'] ?? null,
                'explanationImageUrl' => $row['explanation_image_url'] ?? null,
                'difficulty' => $row['difficulty'] ?? 'medium',
                'qtype' => $row['qtype'] ?? 'single',
                'year' => isset($row['year']) ? (int)$row['year'] : null,
                'tag' => $row['tag'] ?? null,
                'isPyq' => !empty($row['is_pyq']),
                'subjectId' => $row['subject_id'] ?? null,
                'subjectName' => $row['subject_name'] ?? null,
                'chapterId' => $row['chapter_id'] ?? null,
                'chapterName' => $row['chapter_name'] ?? null,
                'diagramIds' => [],
            ];
        }, $rows);
        
        nb_json(['questions' => $questions]);
        break;

    case 'getOrCreateAttempt':
        if (!$userId) nb_fail('Unauthorized', 401);
        $testId = $input['testId'] ?? $_GET['testId'] ?? '';
        if (!$testId) nb_fail('testId required');

        $stmt = $pdo->prepare('SELECT * FROM attempts WHERE user_id = ? AND test_id = ? ORDER BY started_at DESC LIMIT 1');
        $stmt->execute([$userId, $testId]);
        $attempt = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$attempt || $attempt['status'] === 'completed') {
            $attemptId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
            
            $ins = $pdo->prepare('INSERT INTO attempts (id, user_id, test_id, answers, bookmarks, status, started_at) VALUES (?, ?, ?, ?, ?, "in_progress", NOW())');
            $ins->execute([$attemptId, $userId, $testId, '{}', '[]']);

            $attempt = [
                'id' => $attemptId,
                'test_id' => $testId,
                'answers' => [],
                'bookmarks' => [],
                'status' => 'in_progress',
                'started_at' => date('c'),
            ];
        } else {
            if (is_string($attempt['answers'])) {
                $attempt['answers'] = json_decode($attempt['answers'], true) ?: [];
            }
            if (is_string($attempt['bookmarks'])) {
                $attempt['bookmarks'] = json_decode($attempt['bookmarks'], true) ?: [];
            }
        }

        nb_json(['attempt' => $attempt]);
        break;

    case 'saveQuizProgress':
        if (!$userId) nb_fail('Unauthorized', 401);
        $attemptId = $input['attemptId'] ?? '';
        $testId = $input['testId'] ?? '';
        $answers = json_encode($input['answers'] ?? []);
        $bookmarks = json_encode($input['bookmarks'] ?? []);
        $timeTaken = (int)($input['timeTakenSec'] ?? $input['timeSpent'] ?? 0);
        
        if ($attemptId) {
            $stmt = $pdo->prepare('UPDATE attempts SET answers = ?, bookmarks = ?, time_taken_sec = ?, updated_at = NOW() WHERE id = ? AND user_id = ?');
            $stmt->execute([$answers, $bookmarks, $timeTaken, $attemptId, $userId]);
        } else if ($testId) {
            $stmt = $pdo->prepare('UPDATE attempts SET answers = ?, bookmarks = ?, time_taken_sec = ?, updated_at = NOW() WHERE test_id = ? AND user_id = ? AND status = "in_progress" ORDER BY started_at DESC LIMIT 1');
            $stmt->execute([$answers, $bookmarks, $timeTaken, $testId, $userId]);
        }
        nb_json(['success' => true]);
        break;

    case 'submitQuizAttempt':
        if (!$userId) nb_fail('Unauthorized', 401);
        $attemptId = $input['attemptId'] ?? '';
        $testId = $input['testId'] ?? '';
        $score = (float)($input['score'] ?? 0);
        $correctCount = (int)($input['correctCount'] ?? 0);
        $wrongCount = (int)($input['wrongCount'] ?? 0);
        $unattempted = (int)($input['unattemptedCount'] ?? 0);
        $timeTaken = (int)($input['timeTakenSec'] ?? $input['timeSpent'] ?? 0);
        $answers = json_encode($input['answers'] ?? []);
        $bookmarks = json_encode($input['bookmarks'] ?? []);
        
        if ($attemptId) {
            $stmt = $pdo->prepare('UPDATE attempts SET score = ?, correct_count = ?, wrong_count = ?, unattempted_count = ?, time_taken_sec = ?, answers = ?, bookmarks = ?, status = "completed", submitted_at = NOW(), updated_at = NOW() WHERE id = ? AND user_id = ?');
            $stmt->execute([$score, $correctCount, $wrongCount, $unattempted, $timeTaken, $answers, $bookmarks, $attemptId, $userId]);
        } else if ($testId) {
            $attemptId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
            
            $stmt = $pdo->prepare('INSERT INTO attempts (id, user_id, test_id, score, correct_count, wrong_count, unattempted_count, time_taken_sec, answers, bookmarks, status, started_at, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "completed", NOW(), NOW())');
            $stmt->execute([$attemptId, $userId, $testId, $score, $correctCount, $wrongCount, $unattempted, $timeTaken, $answers, $bookmarks]);
        }

        // Award XP
        try {
            $xpGain = max(10, (int)($correctCount * 4));
            $uStmt = $pdo->prepare('UPDATE profiles SET xp_total = COALESCE(xp_total, 0) + ?, updated_at = NOW() WHERE id = ?');
            $uStmt->execute([$xpGain, $userId]);
        } catch (Throwable $ignore) {}

        nb_json(['success' => true, 'attemptId' => $attemptId]);
        break;

        case 'getTopicTree':
        try {
            $chapterIds = $input['chapter_ids'] ?? (isset($_GET['chapter_ids']) ? explode(',', $_GET['chapter_ids']) : []);
            $numeric = array_values(array_filter(array_map('intval', (array)$chapterIds)));
            if (empty($numeric)) {
                nb_json(['tree' => []]);
            }
            $in = implode(',', array_fill(0, count($numeric), '?'));
            $tStmt = $pdo->prepare("SELECT id, chapter_id, name FROM qb_topics WHERE chapter_id IN ($in) ORDER BY name ASC");
            $tStmt->execute($numeric);
            $topics = $tStmt->fetchAll(PDO::FETCH_ASSOC);

            $topicIds = array_column($topics, 'id');
            $subtopics = [];
            if (!empty($topicIds)) {
                $subIn = implode(',', array_fill(0, count($topicIds), '?'));
                $sStmt = $pdo->prepare("SELECT id, topic_id, name FROM qb_subtopics WHERE topic_id IN ($subIn) ORDER BY name ASC");
                $sStmt->execute($topicIds);
                $subtopics = $sStmt->fetchAll(PDO::FETCH_ASSOC);
            }

            $subsByTopic = [];
            foreach ($subtopics as $s) {
                $subsByTopic[$s['topic_id']][] = ['id' => (string)$s['id'], 'name' => $s['name']];
            }

            $topicsByChapter = [];
            foreach ($topics as $t) {
                $cId = (string)$t['chapter_id'];
                $topicsByChapter[$cId][] = [
                    'id' => (string)$t['id'],
                    'name' => $t['name'],
                    'subtopics' => $subsByTopic[$t['id']] ?? []
                ];
            }

            $tree = [];
            foreach ($numeric as $cid) {
                $tree[] = [
                    'chapterId' => (string)$cid,
                    'topics' => $topicsByChapter[(string)$cid] ?? []
                ];
            }
            nb_json(['tree' => $tree]);
        } catch (Throwable $e) {
            nb_fail($e->getMessage(), 500);
        }
        break;

    case 'getSubjectTree':
        try {
            $sStmt = $pdo->query('SELECT id, name FROM qb_subjects ORDER BY name ASC');
            $subjects = $sStmt->fetchAll(PDO::FETCH_ASSOC);
            $cStmt = $pdo->query('SELECT id, name, subject_id FROM qb_chapters ORDER BY name ASC');
            $chapters = $cStmt->fetchAll(PDO::FETCH_ASSOC);

            nb_json(['subjects' => $subjects, 'chapters' => $chapters]);
        } catch (Throwable $e) {
            nb_fail($e->getMessage(), 500);
        }
        break;

    case 'generateCustomTest':
        if (!$userId) nb_fail('Unauthorized', 401);
        $subjectIds = $input['subject_ids'] ?? [];
        $chapterIds = $input['chapter_ids'] ?? [];
        $totalQuestions = (int)($input['total_questions'] ?? 10);
        $durationMin = (int)($input['duration_min'] ?? 15);
        $difficulty = $input['difficulty'] ?? 'mix';
        $title = $input['title'] ?? ('Custom Practice Test - ' . date('d M Y'));

        $where = ['1=1'];
        $params = [];

        if (!empty($chapterIds)) {
            $in = implode(',', array_fill(0, count($chapterIds), '?'));
            $where[] = "chapter_id IN ($in)";
            $params = array_merge($params, $chapterIds);
        } elseif (!empty($subjectIds)) {
            $in = implode(',', array_fill(0, count($subjectIds), '?'));
            $where[] = "subject_id IN ($in)";
            $params = array_merge($params, $subjectIds);
        }

        if ($difficulty !== 'mix' && in_array(strtolower($difficulty), ['easy', 'medium', 'hard', 'very hard'])) {
            $where[] = 'LOWER(difficulty) = ?';
            $params[] = strtolower($difficulty);
        }

        $sql = 'SELECT id FROM qb_questions WHERE ' . implode(' AND ', $where) . ' ORDER BY RAND() LIMIT ' . max(5, min(100, $totalQuestions));
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $qids = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (empty($qids)) {
            // fallback to any random questions
            $fStmt = $pdo->query('SELECT id FROM qb_questions ORDER BY RAND() LIMIT ' . $totalQuestions);
            $qids = $fStmt->fetchAll(PDO::FETCH_COLUMN);
        }

        $testId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));

        $ins = $pdo->prepare('INSERT INTO tests (id, title, description, difficulty, duration_min, total_questions, marks_correct, marks_wrong, source, type, question_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
        $ins->execute([
            $testId,
            $title,
            'Custom NEET test generated with ' . count($qids) . ' questions',
            $difficulty,
            $durationMin,
            count($qids),
            4,
            -1,
            'Custom Generator',
            'generated',
            json_encode($qids),
        ]);

        nb_json(['success' => true, 'test_id' => $testId]);
        break;

    case 'createSubjectQuiz':
        $subject = $input['subject'] ?? $_GET['subject'] ?? '';
        $chapterId = $input['chapter_id'] ?? null;
        $difficulty = $input['difficulty'] ?? 'Medium';
        $count = (int)($input['count'] ?? 15);

        // Find subject id
        $sStmt = $pdo->prepare('SELECT id, name FROM qb_subjects WHERE LOWER(name) = LOWER(?) LIMIT 1');
        $sStmt->execute([$subject]);
        $sRow = $sStmt->fetch(PDO::FETCH_ASSOC);
        $sId = $sRow['id'] ?? null;
        $sName = $sRow['name'] ?? ucfirst($subject);

        $where = ['1=1'];
        $params = [];
        if ($sId) {
            $where[] = 'subject_id = ?';
            $params[] = $sId;
        }
        if ($chapterId) {
            $where[] = 'chapter_id = ?';
            $params[] = $chapterId;
        }
        if ($difficulty && strtolower($difficulty) !== 'all') {
            $where[] = 'LOWER(difficulty) = ?';
            $params[] = strtolower($difficulty);
        }

        $qids = $input['qids'] ?? [];
        if (empty($qids)) {
            $sql = 'SELECT id FROM qb_questions WHERE ' . implode(' AND ', $where) . ' ORDER BY RAND() LIMIT ' . max(5, min(50, $count));
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $qids = $stmt->fetchAll(PDO::FETCH_COLUMN);

            if (empty($qids) && $sId) {
                $stmt = $pdo->prepare('SELECT id FROM qb_questions WHERE subject_id = ? ORDER BY RAND() LIMIT ' . $count);
                $stmt->execute([$sId]);
                $qids = $stmt->fetchAll(PDO::FETCH_COLUMN);
            }
        }

        $testId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));

        $testTitle = !empty($input['title']) ? $input['title'] : ($sName . ' Quiz');
        $ins = $pdo->prepare('INSERT INTO tests (id, title, description, difficulty, duration_min, total_questions, marks_correct, marks_wrong, source, type, question_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
        $ins->execute([
            $testId,
            $testTitle,
            'Practice quiz for ' . $sName,
            strtolower($difficulty),
            max(15, count($qids) * 1),
            count($qids),
            4,
            -1,
            'Subject Quiz',
            'quiz',
            json_encode($qids),
        ]);

        nb_json(['success' => true, 'test_id' => $testId]);
        break;

    case 'getSubjectQuestions':
        $subject = $_GET['subject'] ?? '';
        $sStmt = $pdo->prepare('SELECT id, name FROM qb_subjects WHERE LOWER(name) = LOWER(?) LIMIT 1');
        $sStmt->execute([$subject]);
        $sRow = $sStmt->fetch(PDO::FETCH_ASSOC);
        $sId = $sRow['id'] ?? null;

        $chapters = [];
        if ($sId) {
            $cStmt = $pdo->prepare('SELECT id, name, (SELECT COUNT(*) FROM qb_questions WHERE chapter_id = qb_chapters.id) AS q_count FROM qb_chapters WHERE subject_id = ? ORDER BY name ASC');
            $cStmt->execute([$sId]);
            $chapters = $cStmt->fetchAll(PDO::FETCH_ASSOC);
        }

        nb_json(['subject' => $sRow, 'chapters' => $chapters]);
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
            $ins = $pdo->prepare('INSERT INTO bookmarks (id, user_id, question_id, created_at) VALUES (UUID(), ?, ?, NOW())');
            $ins->execute([$userId, $questionId]);
            nb_json(['bookmarked' => true]);
        }
        break;

    default:
        nb_fail('Invalid action');
}
