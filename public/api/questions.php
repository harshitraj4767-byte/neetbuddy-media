<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$raw = file_get_contents('php://input');
$body = json_decode($raw, true) ?: [];

$testId = $_GET['test_id'] ?? $body['test_id'] ?? null;
$chapterId = $_GET['chapter_id'] ?? $body['chapter_id'] ?? null;
$subjectId = $_GET['subject_id'] ?? $body['subject_id'] ?? null;
$questionIds = $_GET['question_ids'] ?? $body['question_ids'] ?? (isset($_GET['ids']) ? explode(',', (string)$_GET['ids']) : null);
$limit = min(max((int)($_GET['limit'] ?? $body['limit'] ?? 50), 1), 1000);
$difficulty = (string)($_GET['difficulty'] ?? $body['difficulty'] ?? '');
$qtype = (string)($_GET['qtype'] ?? $body['qtype'] ?? '');
$isFilter = static fn (string $v): bool => $v !== '' && !in_array(strtolower($v), ['any', 'all'], true);

if ($testId) {
    $stmt = $pdo->prepare('SELECT * FROM tests WHERE id = :id');
    $stmt->execute([':id' => $testId]);
    $test = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$test) {
        nb_fail('Test not found', 404);
    }

    $ids = [];
    if (!empty($test['question_ids'])) {
        $ids = is_string($test['question_ids']) ? json_decode($test['question_ids'], true) : $test['question_ids'];
    }

    $questions = [];
    if (!empty($ids) && is_array($ids)) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $qStmt = $pdo->prepare("SELECT * FROM qb_questions WHERE id IN ($in)");
        $qStmt->execute(array_values($ids));
        $questions = $qStmt->fetchAll(PDO::FETCH_ASSOC);
    }

    foreach ($questions as &$q) {
        if (isset($q['options']) && is_string($q['options'])) {
            $q['options'] = json_decode($q['options'], true) ?: $q['options'];
        }
    }

    nb_json(['test' => $test, 'questions' => $questions, 'count' => count($questions)]);
}

// All placeholders are positional so the filters can be combined with an id list
// (PDO rejects mixing named and positional placeholders in one statement).
$where = ['1=1'];
$params = [];

if (!empty($questionIds) && is_array($questionIds)) {
    $questionIds = array_values(array_filter(array_map('strval', $questionIds), static fn ($v) => $v !== ''));
}
if (!empty($questionIds) && is_array($questionIds)) {
    $where[] = 'id IN (' . implode(',', array_fill(0, count($questionIds), '?')) . ')';
    $params = array_merge($params, $questionIds);
}
if ($chapterId) {
    $where[] = 'chapter_id = ?';
    $params[] = $chapterId;
}
if ($subjectId) {
    $where[] = 'subject_id = ?';
    $params[] = $subjectId;
}
// Filter in SQL so the client always receives a pool that already matches the
// chosen difficulty / question type instead of a truncated, then-filtered page.
if ($isFilter($difficulty)) {
    $where[] = 'LOWER(difficulty) = ?';
    $params[] = strtolower($difficulty);
}
if ($isFilter($qtype)) {
    $where[] = 'LOWER(qtype) = ?';
    $params[] = strtolower($qtype);
}

$stmt = $pdo->prepare('SELECT * FROM qb_questions WHERE ' . implode(' AND ', $where) . ' LIMIT ' . $limit);
$stmt->execute($params);

$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
foreach ($rows as &$r) {
    if (isset($r['options']) && is_string($r['options'])) {
        $r['options'] = json_decode($r['options'], true) ?: $r['options'];
    }
}

nb_json(['questions' => $rows, 'count' => count($rows)]);
