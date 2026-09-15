<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
if (!$user) {
    nb_fail('Authentication required', 401);
}
$userId = $user['id'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    try {
        $stmt = $pdo->prepare('
            SELECT b.id, b.question_id, b.created_at,
                   q.id as q_id, q.question_text, q.options, q.correct_option, q.explanation, q.difficulty, q.subject_id, q.chapter_id,
                   s.name as subject_name, c.name as chapter_name
            FROM bookmarks b
            JOIN qb_questions q ON q.id = b.question_id
            LEFT JOIN qb_subjects s ON s.id = q.subject_id
            LEFT JOIN qb_chapters c ON c.id = q.chapter_id
            WHERE b.user_id = ?
            ORDER BY b.created_at DESC
        ');
        $stmt->execute([$userId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rows as &$r) {
            if (isset($r['options']) && is_string($r['options'])) {
                $r['options'] = json_decode($r['options'], true) ?: $r['options'];
            }
        }

        nb_json(['bookmarks' => $rows, 'count' => count($rows)]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($method === 'POST' || $method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $qid = $input['question_id'] ?? $input['id'] ?? null;
    if (!$qid) {
        nb_fail('Missing question_id or id', 400);
    }

    try {
        $del = $pdo->prepare('DELETE FROM bookmarks WHERE (question_id = ? OR id = ?) AND user_id = ?');
        $del->execute([$qid, $qid, $userId]);
        nb_json(['success' => true]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

nb_fail('Method not allowed', 405);
