<?php
declare(strict_types=1);
require_once __DIR__ . '/auth/lib.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Credentials: true');
 = ['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . );
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
if (['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

 = nb_pdo();
 = nb_current_user();
 = ['contest_id'] ?? null;

if (['REQUEST_METHOD'] === 'GET') {
    if () {
         = ->prepare('SELECT * FROM tests WHERE id = :id AND type = "contest"');
        ->execute([':id' => ]);
         = ->fetch(PDO::FETCH_ASSOC);
        if (!) {
            http_response_code(404);
            echo json_encode(['error' => 'Contest not found']);
            exit;
        }
        echo json_encode(['contest' => ]);
        exit;
    }

     = ->query('SELECT * FROM tests WHERE type = "contest" ORDER BY starts_at DESC LIMIT 30');
    echo json_encode(['contests' => ->fetchAll(PDO::FETCH_ASSOC)]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
