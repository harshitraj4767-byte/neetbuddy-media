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
if (['REQUEST_METHOD'] === 'GET') {
     = ->prepare('SELECT * FROM tests WHERE type = "dpp" OR type = "daily" ORDER BY created_at DESC LIMIT 20');
    ->execute();
     = ->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['dpp_list' => ]);
    exit;
}
http_response_code(405); echo json_encode(['error' => 'Method not allowed']);
