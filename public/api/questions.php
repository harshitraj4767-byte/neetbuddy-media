<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Credentials: true');
 = ['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . );
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if (['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

 = nb_pdo();
 = ['REQUEST_METHOD'];

// Accept params from GET or JSON body
 = file_get_contents('php://input');
 = json_decode(, true) ?: [];

 = ['test_id'] ?? ['test_id'] ?? null;
 = ['chapter_id'] ?? ['chapter_id'] ?? null;
 = ['subject_id'] ?? ['subject_id'] ?? null;
 = ['question_ids'] ?? (isset(['ids']) ? explode(',', ['ids']) : null);
 = min((int)(['limit'] ?? ['limit'] ?? 50), 100);

// Detect if qb_questions table exists, otherwise fallback to questions table
 = ->query("SHOW TABLES LIKE 'qb_questions'")->fetchColumn();
 = !empty();

if () {
    // 1. Fetch test
     = ->prepare('SELECT * FROM tests WHERE id = :id');
    ->execute([':id' => ]);
     = ->fetch(PDO::FETCH_ASSOC);

    if (!) {
        http_response_code(404);
        echo json_encode(['error' => 'Test not found']);
        exit;
    }

     = [];
    if (!empty(['question_ids'])) {
         = is_string(['question_ids']) ? json_decode(['question_ids'], true) : ['question_ids'];
    }

     = [];
    if (!empty() && is_array()) {
         = implode(',', array_fill(0, count(), '?'));
        if () {
             = ->prepare("
                SELECT q.id, q.question_html, q.options, q.correct_index, q.explanation,
                       q.explanation_image_url, q.question_image_url, q.difficulty, q.qtype,
                       q.year, q.tag, q.is_pyq, q.subject_id, s.name as subject_name,
                       q.chapter_id, c.name as chapter_name
                FROM qb_questions q
                LEFT JOIN qb_subjects s ON s.id = q.subject_id
                LEFT JOIN qb_chapters c ON c.id = q.chapter_id
                WHERE q.id IN ()
            ");
        } else {
             = ->prepare("
                SELECT q.id, q.question_text as question_html, q.options,
                       q.correct_option as correct_index, q.explanation,
                       q.difficulty, q.is_pyq, q.subject_id, s.name as subject_name,
                       q.chapter_id, c.name as chapter_name
                FROM questions q
                LEFT JOIN subjects s ON s.id = q.subject_id
                LEFT JOIN chapters c ON c.id = q.chapter_id
                WHERE q.id IN ()
            ");
        }
        ->execute(array_values());
         = ->fetchAll(PDO::FETCH_ASSOC);
    }

    // Format options cleanly
    foreach ( as &) {
        if (isset(['options']) && is_string(['options'])) {
             = json_decode(['options'], true);
            if (is_array()) {
                ['options'] = ;
            }
        }
    }

    echo json_encode([
        'test' => ,
        'questions' => ,
        'total' => count()
    ]);
    exit;
}

// 2. Fetch by chapter or subject or arbitrary questions
 = [];
 = [];

if () {
    [] = 'q.chapter_id = ?';
    [] = ;
}
if () {
    [] = 'q.subject_id = ?';
    [] = ;
}
if (!empty() && is_array()) {
     = implode(',', array_fill(0, count(), '?'));
    [] = "q.id IN ()";
     = array_merge(, );
}

 = !empty() ? 'WHERE ' . implode(' AND ', ) : '';

if () {
     = "
        SELECT q.id, q.question_html, q.options, q.correct_index, q.explanation,
               q.explanation_image_url, q.question_image_url, q.difficulty, q.qtype,
               q.year, q.tag, q.is_pyq, q.subject_id, s.name as subject_name,
               q.chapter_id, c.name as chapter_name
        FROM qb_questions q
        LEFT JOIN qb_subjects s ON s.id = q.subject_id
        LEFT JOIN qb_chapters c ON c.id = q.chapter_id
        
        ORDER BY q.id ASC
        LIMIT ?
    ";
} else {
     = "
        SELECT q.id, q.question_text as question_html, q.options,
               q.correct_option as correct_index, q.explanation,
               q.difficulty, q.is_pyq, q.subject_id, s.name as subject_name,
               q.chapter_id, c.name as chapter_name
        FROM questions q
        LEFT JOIN subjects s ON s.id = q.subject_id
        LEFT JOIN chapters c ON c.id = q.chapter_id
        
        ORDER BY q.id ASC
        LIMIT ?
    ";
}

[] = ;
 = ->prepare();
->execute();
 = ->fetchAll(PDO::FETCH_ASSOC);

foreach ( as &) {
    if (isset(['options']) && is_string(['options'])) {
         = json_decode(['options'], true);
        if (is_array()) {
            ['options'] = ;
        }
    }
}

echo json_encode([
    'questions' => ,
    'count' => count()
]);
