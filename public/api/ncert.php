<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$type = $_GET['type'] ?? 'highlights';
$chapterId = $_GET['chapter_id'] ?? null;

if ($type === 'nuggets') {
    try {
        $query = 'SELECT * FROM ncert_nuggets WHERE 1=1';
        $params = [];
        if ($chapterId) {
            $query .= ' AND chapter_id = :cid';
            $params[':cid'] = $chapterId;
        }
        $query .= ' ORDER BY order_index ASC LIMIT 200';
        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        nb_json(['nuggets' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (Throwable $e) {
        nb_json(['nuggets' => []]);
    }
}

try {
    $query = 'SELECT * FROM ncert_highlights WHERE 1=1';
    $params = [];
    if ($chapterId) {
        $query .= ' AND chapter_id = :cid';
        $params[':cid'] = $chapterId;
    }
    $query .= ' ORDER BY order_index ASC LIMIT 200';
    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    nb_json(['highlights' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
} catch (Throwable $e) {
    nb_json(['highlights' => []]);
}
