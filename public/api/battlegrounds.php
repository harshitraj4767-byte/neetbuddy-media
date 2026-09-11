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
 = nb_current_user();
 = nb_pdo();
if (['REQUEST_METHOD'] === 'GET') {
     = ['action'] ?? 'rooms';
    if ( === 'history' && ) {
         = ->prepare('SELECT * FROM battle_matches WHERE player1_id = :uid OR player2_id = :uid ORDER BY created_at DESC LIMIT 20');
        ->execute([':uid' => ['id']]);
        echo json_encode(['history' => ->fetchAll(PDO::FETCH_ASSOC)]);
        exit;
    }
     = ->prepare('SELECT * FROM battle_matches WHERE status = "waiting" ORDER BY created_at DESC LIMIT 20');
    ->execute();
    echo json_encode(['rooms' => ->fetchAll(PDO::FETCH_ASSOC)]);
    exit;
}
http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
