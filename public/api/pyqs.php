<?php
declare(strict_types=1);

require_once __DIR__ . "/auth/lib.php";

nb_cors();

$pdo = nb_pdo();
$subjectId = $_GET["subject_id"] ?? null;
$chapterId = $_GET["chapter_id"] ?? null;
$year = $_GET["year"] ?? null;

$sql = "SELECT * FROM qb_questions WHERE (is_pyq = 1 OR year IS NOT NULL)";
$params = [];

if ($subjectId) {
    $sql .= " AND subject_id = :sid";
    $params[":sid"] = $subjectId;
}
if ($chapterId) {
    $sql .= " AND chapter_id = :cid";
    $params[":cid"] = $chapterId;
}
if ($year) {
    $sql .= " AND (year = :yr OR pyq_year = :yr)";
    $params[":yr"] = (int)$year;
}
$sql .= " ORDER BY year DESC, id ASC LIMIT 100";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($rows as &$r) {
    if (isset($r["options"]) && is_string($r["options"])) {
        $r["options"] = json_decode($r["options"], true) ?: $r["options"];
    }
}

nb_json([
    "pyqs" => $rows,
    "count" => count($rows),
]);
