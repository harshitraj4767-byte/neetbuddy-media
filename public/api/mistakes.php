<?php
declare(strict_types=1);
require_once __DIR__ . '/auth/lib.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Credentials: true');
 = ['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . );
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
if (['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
 = nb_current_user();
if (!) { http_response_code(401); echo json_encode(['error' => 'Authentication required']); exit; }
 = nb_pdo();
 = ['REQUEST_METHOD'];
if ( === 'GET') {
     = ->prepare('SELECT wq.id, wq.question_id, wq.chapter_id, wq.created_at, q.question_text, q.options, q.correct_option, q.explanation, q.subject_id FROM wrong_questions wq JOIN questions q ON q.id = wq.question_id WHERE wq.user_id = :uid ORDER BY wq.created_at DESC');
    ->execute([':uid' => ['id']]);
     = ->fetchAll(PDO::FETCH_ASSOC);
    foreach ( as &) {
        if (isset(['options']) && is_string(['options'])) { ['options'] = json_decode(['options'], true) ?: ['options']; }
    }
    echo json_encode(['mistakes' => , 'count' => count()]);
    exit;
}
if ( === 'POST' ||  === 'DELETE') {
     = file_get_contents('php://input');
     = json_decode(, true) ?: [];
     = ['question_id'] ?? null;
     = ['id'] ?? null;
    if () {
         = ->prepare('DELETE FROM wrong_questions WHERE id = :id AND user_id = :uid');
        ->execute([':id' => , ':uid' => ['id']]);
    } elseif () {
         = ->prepare('DELETE FROM wrong_questions WHERE question_id = :qid AND user_id = :uid');
        ->execute([':qid' => , ':uid' => ['id']]);
    } else {
        http_response_code(400); echo json_encode(['error' => 'Missing id or question_id']); exit;
    }
    echo json_encode(['success' => true]);
    exit;
}
http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
