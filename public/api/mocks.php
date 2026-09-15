<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$category = $_GET['category'] ?? null;
$limit = min((int)($_GET['limit'] ?? 100), 200);

$query = 'SELECT id, title, description, difficulty, COALESCE(duration_min, 180) AS duration_min, total_questions, source, entry_fee, is_paid, syllabus, category_id, type, created_at FROM tests WHERE (type = "mock" OR type = "test" OR is_active = 1)';
$params = [];

if ($category && $category !== 'all') {
    if ($category === 'uncat') {
        $query .= ' AND (category_id IS NULL OR category_id = "")';
    } else {
        $query .= ' AND category_id = :cat';
        $params[':cat'] = $category;
    }
}
$query .= ' ORDER BY created_at DESC LIMIT ' . $limit;

try {
    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $tests = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    $stmt = $pdo->query('SELECT * FROM tests WHERE is_active = 1 LIMIT ' . $limit);
    $tests = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
}

foreach ($tests as &$t) {
    if (isset($t['syllabus']) && is_string($t['syllabus'])) {
        $parsed = json_decode($t['syllabus'], true);
        if ($parsed !== null) {
            $t['syllabus'] = $parsed;
        }
    }
    if (isset($t['is_paid'])) {
        $t['is_paid'] = (bool)$t['is_paid'];
    }
}

nb_json([
    'tests' => $tests,
    'count' => count($tests),
]);
