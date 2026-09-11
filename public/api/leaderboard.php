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
 = min((int)(['limit'] ?? 50), 100);
 = 'SELECT p.id as user_id, p.full_name, p.avatar_url, COALESCE(SUM(ta.score), 0) as total_score, COUNT(ta.id) as tests_completed, ROUND(AVG(ta.accuracy), 1) as avg_accuracy FROM profiles p LEFT JOIN test_attempts ta ON ta.user_id = p.id GROUP BY p.id, p.full_name, p.avatar_url ORDER BY total_score DESC LIMIT :lim';
 = ->prepare();
->bindValue(':lim', , PDO::PARAM_INT);
->execute();
 = ->fetchAll(PDO::FETCH_ASSOC);
 = 1;
foreach ( as &) { ['rank'] = ++; }
echo json_encode(['leaderboard' => ]);
