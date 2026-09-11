<?php
declare(strict_types=1);
require_once __DIR__ . '/auth/lib.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Credentials: true');
 = ['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . );
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
if (['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

 = nb_pdo();
 = ['batch_id'] ?? null;

if () {
     = ->prepare('SELECT * FROM batches WHERE id = :id');
    ->execute([':id' => ]);
     = ->fetch(PDO::FETCH_ASSOC);
    if (!) {
        http_response_code(404);
        echo json_encode(['error' => 'Batch not found']);
        exit;
    }
    echo json_encode(['batch' => ]);
    exit;
}

 = ->query('SELECT * FROM batches ORDER BY created_at DESC LIMIT 50');
echo json_encode(['batches' => ->fetchAll(PDO::FETCH_ASSOC)]);
