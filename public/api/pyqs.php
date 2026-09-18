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
        $stmt = $pdo->query('SELECT DISTINCT COALESCE(year, pyq_year) as year FROM qb_questions WHERE year IS NOT NULL OR pyq_year IS NOT NULL ORDER BY year DESC');
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
    try {
        // Return chapters with PYQ count
        $stmt = $pdo->query('
            SELECT c.id, c.name, c.subject_id, s.name AS subject_name,
                   (SELECT COUNT(*) FROM qb_questions q WHERE q.chapter_id = c.id AND (q.year IS NOT NULL OR q.pyq_year IS NOT NULL)) AS pyq_count
            FROM qb_chapters c
            LEFT JOIN qb_subjects s ON s.id = c.subject_id
            ORDER BY s.name ASC, c.name ASC
        ');
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
        $stmt = $pdo->prepare('SELECT * FROM qb_questions WHERE chapter_id = ? AND (year IS NOT NULL OR pyq_year IS NOT NULL) ORDER BY year DESC, id ASC LIMIT 200');
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
        $qWhere = ['chapter_id = ?', '(year IS NOT NULL OR pyq_year IS NOT NULL)'];
        $qParams = [$chapterId];

        if ($year && $year !== 'All') {
            if ($year === 'Older') {
                $qWhere[] = 'COALESCE(year, pyq_year) < 2016';
            } else {
                $qWhere[] = 'COALESCE(year, pyq_year) = ?';
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
    try {
        $stmt = $pdo->prepare('SELECT * FROM neet_pyq_questions WHERE paper_id = :pid ORDER BY question_order ASC, id ASC');
        $stmt->execute([':pid' => $paperId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $rows = [];
    }

    if (empty($rows)) {
        $year = null;
        if (preg_match('/(\d{4})/', (string)$paperId, $m)) {
            $year = (int)$m[1];
        }
        if ($year) {
            $stmt = $pdo->prepare('SELECT * FROM qb_questions WHERE (year = :yr OR pyq_year = :yr) ORDER BY id ASC LIMIT 200');
            $stmt->execute([':yr' => $year]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
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

$where = ['(year IS NOT NULL OR pyq_year IS NOT NULL)'];
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
    $where[] = '(year = :yr OR pyq_year = :yr)';
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
