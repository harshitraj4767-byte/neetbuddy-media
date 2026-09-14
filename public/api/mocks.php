<?php
declare(strict_types=1);

require_once __DIR__ . "/auth/lib.php";

nb_cors();

$pdo = nb_pdo();
$category = $_GET["category"] ?? null;
$limit = min((int)($_GET["limit"] ?? 50), 100);

$sql = "SELECT id, title, description, subject, duration_minutes, total_questions, total_marks, is_active, created_at FROM tests WHERE is_active = 1";
$params = [];

if ($category) {
    $sql .= " AND category = :cat";
    $params[":cat"] = $category;
}
$sql .= " ORDER BY created_at DESC LIMIT " . $limit;

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$tests = $stmt->fetchAll(PDO::FETCH_ASSOC);

nb_json([
    "tests" => $tests,
    "count" => count($tests),
]);
