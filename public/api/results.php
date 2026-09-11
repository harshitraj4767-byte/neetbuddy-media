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
 = nb_current_user();
if (!) { http_response_code(401); echo json_encode(['error' => 'Authentication required']); exit; }
 = nb_pdo();
 = ['attempt_id'] ?? null;
if (!) { http_response_code(400); echo json_encode(['error' => 'Missing attempt_id']); exit; }
 = ->prepare('SELECT ta.*, t.title as test_title, t.total_questions, t.duration_min FROM test_attempts ta JOIN tests t ON t.id = ta.test_id WHERE ta.id = :aid AND ta.user_id = :uid');
->execute([':aid' => , ':uid' => ['id']]);
 = ->fetch(PDO::FETCH_ASSOC);
if (!) { http_response_code(404); echo json_encode(['error' => 'Attempt not found']); exit; }
echo json_encode(['attempt' => ]);
