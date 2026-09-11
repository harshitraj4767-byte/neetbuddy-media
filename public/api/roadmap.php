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
if (!) {
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

 = nb_pdo();
 = ['id'];

// 1. Fetch user practice activity from yesterday and today
 = ->prepare('
    SELECT DISTINCT q.chapter_id, q.subject_id, COUNT(ta.id) as questions_attempted,
           AVG(ta.accuracy) as avg_accuracy
    FROM test_attempts ta
    JOIN tests t ON t.id = ta.test_id
    LEFT JOIN questions q ON JSON_CONTAINS(t.question_ids, JSON_QUOTE(q.id))
    WHERE ta.user_id = :uid
      AND ta.created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
      AND ta.created_at < CURDATE()
      AND q.chapter_id IS NOT NULL
    GROUP BY q.chapter_id, q.subject_id
    LIMIT 5
');
->execute([':uid' => ]);
 = ->fetchAll(PDO::FETCH_ASSOC);

// 2. Fetch today practice activity
 = ->prepare('
    SELECT DISTINCT q.chapter_id, q.subject_id, COUNT(ta.id) as questions_attempted
    FROM test_attempts ta
    JOIN tests t ON t.id = ta.test_id
    LEFT JOIN questions q ON JSON_CONTAINS(t.question_ids, JSON_QUOTE(q.id))
    WHERE ta.user_id = :uid
      AND ta.created_at >= CURDATE()
      AND q.chapter_id IS NOT NULL
    GROUP BY q.chapter_id, q.subject_id
    LIMIT 5
');
->execute([':uid' => ]);
 = ->fetchAll(PDO::FETCH_ASSOC);

// 3. Recommended next chapter with direct redirection target
 = ->prepare('
    SELECT c.id as chapter_id, c.name as chapter_name, c.subject_id, s.name as subject_name
    FROM chapters c
    JOIN subjects s ON s.id = c.subject_id
    ORDER BY c.order_index ASC, c.id ASC
    LIMIT 30
');
->execute();
 = ->fetchAll(PDO::FETCH_ASSOC);

// Enrich with redirection path
foreach ( as &) {
    ['redirect_url'] = '/study-view?chapterId=' . urlencode(['chapter_id']) . '&subject=' . urlencode(['subject_id']);
    ['practice_url'] = '/quiz/subjects?chapter=' . urlencode(['chapter_id']);
}

echo json_encode([
    'status' => 'success',
    'automated_tracking' => [
        'chapters_done_yesterday' => ,
        'chapters_done_today' => ,
    ],
    'recommended_chapters' => ,
]);
