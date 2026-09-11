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

// Stats for home page
 = (int)->query('SELECT COUNT(*) FROM questions')->fetchColumn();
 = (int)->query('SELECT COUNT(*) FROM profiles')->fetchColumn();
 = (int)->query('SELECT COUNT(*) FROM tests')->fetchColumn();

// Featured / Upcoming Contests
 = ->query('SELECT id, title, description, duration_min, total_questions, prize_pool, starts_at, ends_at FROM tests WHERE type = "contest" AND (ends_at IS NULL OR ends_at > NOW()) ORDER BY starts_at ASC LIMIT 4');
 = ->fetchAll(PDO::FETCH_ASSOC);

// Daily DPP
 = ->query('SELECT id, title, total_questions, duration_min FROM tests WHERE type = "dpp" OR type = "daily" ORDER BY created_at DESC LIMIT 1');
 = ->fetch(PDO::FETCH_ASSOC);

echo json_encode([
    'stats' => [
        'total_questions' => ,
        'total_users' => ,
        'total_tests' => ,
    ],
    'featured_contests' => ,
    'daily_challenge' => ,
]);
