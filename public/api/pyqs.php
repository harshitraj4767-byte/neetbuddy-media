<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
$userId = $user['id'] ?? null;

$action = $_GET['action'] ?? $_POST['action'] ?? 'questions';
$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

if ($action === 'papers') {
    try {
        $stmt = $pdo->query('SELECT id, ext_id, title, year, total_questions, duration_minutes FROM neet_pyq_papers ORDER BY year DESC, title ASC');
        $papers = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $stmt = $pdo->query('SELECT DISTINCT year as year FROM qb_questions WHERE year IS NOT NULL ORDER BY year DESC');
        $years = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $papers = [];
        foreach ($years as $row) {
            $yr = (int)($row['year'] ?? 0);
            if ($yr > 0) {
                $papers[] = [
                    'id' => 'pyq_paper_' . $yr,
                    'ext_id' => 'neet_' . $yr,
                    'title' => 'NEET ' . $yr . ' Official Paper',
                    'year' => $yr,
                    'total_questions' => 180,
                    'duration_minutes' => 180
                ];
            }
        }
    }
    nb_json(['papers' => $papers, 'count' => count($papers)]);
}

if ($action === 'chapters') {
    $year = $_GET['year'] ?? null;
    $exam = $_GET['exam_type'] ?? null;

    $qWhere = ['q.chapter_id = c.id', '(q.year IS NOT NULL)'];
    if ($year && $year !== 'All') {
        if ($year === 'Older') {
            $qWhere[] = 'q.year < 2016';
        } else {
            $qWhere[] = 'q.year = ' . (int)$year;
        }
    }
    if ($exam && $exam !== 'All') {
        $safeExam = $pdo->quote('%' . $exam . '%');
        $qWhere[] = "(q.tag LIKE $safeExam OR q.question_html LIKE $safeExam)";
    }
    $subCond = implode(' AND ', $qWhere);

    try {
        $sql = "
            SELECT c.id, c.name, c.subject_id, s.name AS subject_name,
                   (SELECT COUNT(*) FROM qb_questions q WHERE $subCond) AS pyq_count
            FROM qb_chapters c
            LEFT JOIN qb_subjects s ON s.id = c.subject_id
            ORDER BY s.name ASC, c.name ASC
        ";
        $stmt = $pdo->query($sql);
        $chapters = $stmt->fetchAll(PDO::FETCH_ASSOC);
        nb_json(['chapters' => $chapters]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($action === 'chapter_questions') {
    $chapterId = $_GET['chapter_id'] ?? $input['chapter_id'] ?? '';
    if (!$chapterId) nb_fail('chapter_id required');
    try {
        $stmt = $pdo->prepare('SELECT * FROM qb_questions WHERE chapter_id = ? AND (year IS NOT NULL) ORDER BY year DESC, id ASC LIMIT 200');
        $stmt->execute([$chapterId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$r) {
            if (isset($r['options']) && is_string($r['options'])) {
                $r['options'] = json_decode($r['options'], true) ?: $r['options'];
            }
        }
        nb_json(['questions' => $rows, 'count' => count($rows)]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($action === 'get_or_create_chapter_test') {
    $chapterId = $_GET['chapter_id'] ?? $input['chapter_id'] ?? '';
    $year = $_GET['year'] ?? $input['year'] ?? null;
    $examType = $_GET['exam_type'] ?? $input['exam_type'] ?? null;
    if (!$chapterId) nb_fail('chapter_id required');

    try {
        // Fetch chapter details
        $cStmt = $pdo->prepare('SELECT c.name, s.name as subject_name FROM qb_chapters c LEFT JOIN qb_subjects s ON s.id = c.subject_id WHERE c.id = ? LIMIT 1');
        $cStmt->execute([$chapterId]);
        $ch = $cStmt->fetch(PDO::FETCH_ASSOC);
        $chName = $ch['name'] ?? 'Chapter';

        $filterLabel = '';
        if ($year && $year !== 'All') $filterLabel .= " ($year)";
        if ($examType && $examType !== 'All') $filterLabel .= " [$examType]";

        $searchTitle = $chName . ' PYQ Practice' . $filterLabel;
        $tStmt = $pdo->prepare('SELECT id, question_ids FROM tests WHERE title = ? AND type = "practice" LIMIT 1');
        $tStmt->execute([$searchTitle]);
        $existing = $tStmt->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            nb_json(['test_id' => $existing['id'], 'success' => true]);
        }

        // Query questions matching chapter and optional year / exam type filters
        $qWhere = ['chapter_id = ?', '(year IS NOT NULL)'];
        $qParams = [$chapterId];

        if ($year && $year !== 'All') {
            if ($year === 'Older') {
                $qWhere[] = 'year < 2016';
            } else {
                $qWhere[] = 'year = ?';
                $qParams[] = (int)$year;
            }
        }
        if ($examType && $examType !== 'All') {
            $qWhere[] = '(tag LIKE ? OR question_html LIKE ?)';
            $qParams[] = '%' . $examType . '%';
            $qParams[] = '%' . $examType . '%';
        }

        $qStmt = $pdo->prepare('SELECT id FROM qb_questions WHERE ' . implode(' AND ', $qWhere) . ' ORDER BY year DESC, id ASC LIMIT 100');
        $qStmt->execute($qParams);
        $qids = $qStmt->fetchAll(PDO::FETCH_COLUMN);

        if (empty($qids)) {
            // fallback to any questions for chapter
            $qStmt2 = $pdo->prepare('SELECT id FROM qb_questions WHERE chapter_id = ? LIMIT 50');
            $qStmt2->execute([$chapterId]);
            $qids = $qStmt2->fetchAll(PDO::FETCH_COLUMN);
        }

        $testId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));

        $ins = $pdo->prepare('INSERT INTO tests (id, title, description, difficulty, duration_min, total_questions, marks_correct, marks_wrong, source, type, question_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
        $ins->execute([
            $testId,
            $searchTitle,
            'Previous Year Questions practice for ' . $chName,
            'medium',
            max(15, count($qids) * 2),
            count($qids),
            4,
            -1,
            'Chapter PYQ',
            'practice',
            json_encode($qids),
        ]);

        nb_json(['test_id' => $testId, 'success' => true]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($action === 'paper_questions') {
    $paperId = $_GET['paper_id'] ?? $input['paper_id'] ?? '';
    $extId = $_GET['ext_id'] ?? $input['ext_id'] ?? '';
    $requestedYear = $_GET['year'] ?? $input['year'] ?? null;
    $rows = [];

    // 1. Try neet_pyq_questions by paper_id or ext_id
    try {
        if ($paperId || $extId) {
            $stmt = $pdo->prepare('SELECT * FROM neet_pyq_questions WHERE paper_id = :pid OR paper_id = :eid OR ext_id = :pid OR ext_id = :eid ORDER BY question_order ASC, id ASC');
            $stmt->execute([':pid' => (string)$paperId, ':eid' => (string)$extId]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
    } catch (Throwable $e) {
        $rows = [];
    }

    // 2. If empty, resolve paper details from neet_pyq_papers
    $year = $requestedYear ? (int)$requestedYear : null;
    if (empty($rows)) {
        try {
            $stmt = $pdo->prepare('SELECT id, ext_id, year FROM neet_pyq_papers WHERE id = :pid OR ext_id = :pid OR id = :eid OR ext_id = :eid LIMIT 1');
            $stmt->execute([':pid' => (string)$paperId, ':eid' => (string)$extId]);
            $paperRow = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($paperRow && !empty($paperRow['year'])) {
                $year = (int)$paperRow['year'];
            }
        } catch (Throwable $e) {}

        if (!$year && preg_match('/(\d{4})/', (string)$paperId, $m)) {
            $year = (int)$m[1];
        }
        if (!$year && preg_match('/(\d{4})/', (string)$extId, $m)) {
            $year = (int)$m[1];
        }

        // Try neet_pyq_questions by year
        if ($year) {
            try {
                $stmt = $pdo->prepare('SELECT * FROM neet_pyq_questions WHERE year = :yr ORDER BY question_order ASC, id ASC');
                $stmt->execute([':yr' => $year]);
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } catch (Throwable $e) {}
        }

        // Try qb_questions by year
        if (empty($rows) && $year) {
            try {
                $stmt = $pdo->prepare('SELECT * FROM qb_questions WHERE year = :yr ORDER BY id ASC LIMIT 200');
                $stmt->execute([':yr' => $year]);
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } catch (Throwable $e) {}
        }
    }

    foreach ($rows as &$r) {
        if (isset($r['options']) && is_string($r['options'])) {
            $r['options'] = json_decode($r['options'], true) ?: $r['options'];
        }
    }
    nb_json(['questions' => $rows, 'count' => count($rows)]);
}

// Default action: query qb_questions by filters
$subjectId = $_GET['subject_id'] ?? $input['subject_id'] ?? null;
$chapterId = $_GET['chapter_id'] ?? $input['chapter_id'] ?? null;
$year = $_GET['year'] ?? $input['year'] ?? null;
$limit = min((int)($_GET['limit'] ?? $input['limit'] ?? 50), 200);

$where = ['(year IS NOT NULL)'];
$params = [];

if ($subjectId) {
    $where[] = 'subject_id = :sid';
    $params[':sid'] = $subjectId;
}
if ($chapterId) {
    $where[] = 'chapter_id = :cid';
    $params[':cid'] = $chapterId;
}
if ($year) {
    $where[] = 'year = :yr';
    $params[':yr'] = (int)$year;
}

$sql = 'SELECT * FROM qb_questions WHERE ' . implode(' AND ', $where) . ' ORDER BY year DESC, id ASC LIMIT ' . $limit;
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($rows as &$r) {
    if (isset($r['options']) && is_string($r['options'])) {
        $r['options'] = json_decode($r['options'], true) ?: $r['options'];
    }
}

nb_json(['questions' => $rows, 'count' => count($rows)]);

if ($action === 'attempts') {
    if (!$userId) {
        nb_json(['attempts' => []]);
    }
    try {
        $stmt = $pdo->prepare('SELECT id, paper_id, score, submitted_at FROM neet_pyq_attempts WHERE user_id = ? ORDER BY submitted_at DESC');
        $stmt->execute([$userId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        nb_json(['attempts' => $rows]);
    } catch (Throwable $e) {
        nb_json(['attempts' => []]);
    }
}

if ($action === 'save_paper_attempt') {
    if (!$userId) {
        nb_fail('Unauthorized', 401);
    }
    $paperId = $input['paper_id'] ?? '';
    $responses = $input['responses'] ?? [];
    $score = $input['score'] ?? 0;
    $correct = $input['correct_count'] ?? 0;
    $wrong = $input['wrong_count'] ?? 0;
    $skipped = $input['skipped_count'] ?? 0;
    $timeSpent = $input['time_spent_sec'] ?? 0;

    $attemptId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));

    try {
        $ins = $pdo->prepare('INSERT INTO neet_pyq_attempts (id, user_id, paper_id, responses, score, correct_count, wrong_count, skipped_count, time_spent_sec, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
        $ins->execute([
            $attemptId,
            $userId,
            $paperId,
            is_string($responses) ? $responses : json_encode($responses),
            $score,
            $correct,
            $wrong,
            $skipped,
            $timeSpent
        ]);
        nb_json(['success' => true, 'attempt_id' => $attemptId]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}
