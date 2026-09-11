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
 = ['subject_id'] ?? null;
 = ['chapter_id'] ?? null;

 = 'SELECT * FROM study_materials WHERE 1=1';
 = [];
if () {
     .= ' AND subject_id = :sid';
    [':sid'] = ;
}
if () {
     .= ' AND chapter_id = :cid';
    [':cid'] = ;
}
 .= ' ORDER BY order_index ASC LIMIT 100';

 = ->prepare();
->execute();
 = ->fetchAll(PDO::FETCH_ASSOC);

echo json_encode(['materials' => ]);
