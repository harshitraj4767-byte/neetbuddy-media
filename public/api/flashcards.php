<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$chapterId = $_GET['chapter_id'] ?? null;
$subjectId = $_GET['subject_id'] ?? null;

try {
    $query = 'SELECT * FROM flashcards WHERE 1=1';
    $params = [];
    if ($chapterId) {
        $query .= ' AND chapter_id = :cid';
        $params[':cid'] = $chapterId;
    }
    if ($subjectId) {
        $query .= ' AND subject_id = :sid';
        $params[':sid'] = $subjectId;
    }
    $query .= ' ORDER BY order_index ASC LIMIT 200';
    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    nb_json(['flashcards' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
} catch (Throwable $e) {
    nb_json(['flashcards' => []]);
}
