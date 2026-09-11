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
 = ['year'] ?? null;

 = 'SELECT * FROM questions WHERE is_pyq = 1';
 = [];

if () {
     .= ' AND subject_id = :sid';
    [':sid'] = ;
}
if () {
     .= ' AND chapter_id = :cid';
    [':cid'] = ;
}
if () {
     .= ' AND pyq_year = :yr';
    [':yr'] = ;
}
 .= ' ORDER BY pyq_year DESC, id ASC LIMIT 100';

 = ->prepare();
->execute();
 = ->fetchAll(PDO::FETCH_ASSOC);

foreach ( as &) {
    if (isset(['options']) && is_string(['options'])) {
        ['options'] = json_decode(['options'], true) ?: ['options'];
    }
}

echo json_encode(['pyqs' => , 'count' => count()]);
