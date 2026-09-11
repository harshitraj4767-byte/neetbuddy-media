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
if (!) {
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

 = nb_pdo();
 = ['REQUEST_METHOD'];

if ( === 'GET') {
     = ->prepare('SELECT b.id, b.question_id, b.created_at, q.question_text, q.options, q.correct_option, q.explanation, q.difficulty, q.subject_id, q.chapter_id FROM bookmarks b JOIN questions q ON q.id = b.question_id WHERE b.user_id = :uid ORDER BY b.created_at DESC');
    ->execute([':uid' => ['id']]);
     = ->fetchAll(PDO::FETCH_ASSOC);
    foreach ( as &) {
        if (isset(['options']) && is_string(['options'])) {
            ['options'] = json_decode(['options'], true) ?: ['options'];
        }
    }
    echo json_encode(['bookmarks' => ]);
    exit;
}

if ( === 'POST') {
     = file_get_contents('php://input');
     = json_decode(, true) ?: [];
     = ['question_id'] ?? null;
    if (!) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing question_id']);
        exit;
    }
     = ->prepare('SELECT id FROM bookmarks WHERE user_id = :uid AND question_id = :qid');
    ->execute([':uid' => ['id'], ':qid' => ]);
     = ->fetch();
    if () {
         = ->prepare('DELETE FROM bookmarks WHERE id = :id');
        ->execute([':id' => ['id']]);
        echo json_encode(['bookmarked' => false]);
    } else {
         = ->prepare('INSERT INTO bookmarks (id, user_id, question_id, created_at) VALUES (UUID(), :uid, :qid, NOW())');
        ->execute([':uid' => ['id'], ':qid' => ]);
        echo json_encode(['bookmarked' => true]);
    }
    exit;
}
http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
