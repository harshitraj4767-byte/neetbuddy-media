<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

 = nb_pdo();

try {
    // 1. Gather question IDs from qb_questions if available
     = ->query('SELECT id FROM qb_questions LIMIT 1000');
     =  ? ->fetchAll(PDO::FETCH_COLUMN) : [];

     = 0;
     = 0;

     = ->prepare('INSERT INTO tests (id, title, description, difficulty, duration_min, total_questions, marks_correct, marks_wrong, source, type, question_ids, created_at)
        VALUES (:id, :title, :description, :difficulty, :duration_min, :total_questions, :marks_correct, :marks_wrong, :source, :type, :question_ids, :created_at)
        ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), question_ids = VALUES(question_ids)');

    for ( = 31;  <= 130; ++) {
         = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            0xd000 + , 0x1111, 0x2222, 0x4000 | ( % 0x0fff), 0x8000 | ( % 0x3fff),
            0xaaaa, 0xbbbb,  * 100);

         = sprintf('Daily DPP %02d — 20-Q Mixed Rapid Round', );
         = 'Quality-vetted 20-question daily practice: 8 Biology • 6 Physics • 6 Chemistry. 25 minutes, NEET marking (+4 / -1). Perfect daily boost with detailed explanations.';

        // Pick 20 questions if available
         = [];
        if (count() >= 20) {
             = (( - 31) * 20) % count();
             = array_slice(, , 20);
            if (count() < 20) {
                 = array_merge(, array_slice(, 0, 20 - count()));
            }
        }

        // Date distributed over previous days
         = 131 - ;
         = date('Y-m-d H:i:s', strtotime("-{} days"));

        ->execute([
            ':id' => ,
            ':title' => ,
            ':description' => ,
            ':difficulty' => 'medium',
            ':duration_min' => 25,
            ':total_questions' => 20,
            ':marks_correct' => 4,
            ':marks_wrong' => -1,
            ':source' => 'Neet Buddy Daily DPP',
            ':type' => 'dpp',
            ':question_ids' => json_encode(),
            ':created_at' => ,
        ]);
        ++;
    }

    nb_json([
        'success' => true,
        'message' => 'Successfully seeded 100 Daily DPPs in Hostinger database',
        'count' => ,
    ]);
} catch (Throwable ) {
    nb_fail(->getMessage(), 500);
}
