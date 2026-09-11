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
 = ['chapter_id'] ?? null;
 = ['subject_id'] ?? null;
 = 'SELECT * FROM flashcards WHERE 1=1';
 = [];
if () {  .= ' AND chapter_id = :cid'; [':cid'] = ; }
if () {  .= ' AND subject_id = :sid'; [':sid'] = ; }
 .= ' ORDER BY order_index ASC LIMIT 200';
 = ->prepare();
->execute();
echo json_encode(['flashcards' => ->fetchAll(PDO::FETCH_ASSOC)]);
