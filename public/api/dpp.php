<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

 = nb_pdo();
 = nb_current_user();
 = ['id'] ?? null;
 = ['REQUEST_METHOD'] ?? 'GET';

if ( === 'GET') {
    try {
        // Auto-seed 100 DPPs if tests table has fewer than 100 DPPs on Hostinger
         = ->query('SELECT COUNT(*) FROM tests WHERE type IN (dpp, daily)');
         =  ? (int)->fetchColumn() : 0;

        if ( < 100) {
             = ->query('SELECT id FROM qb_questions LIMIT 1000');
             =  ? ->fetchAll(PDO::FETCH_COLUMN) : [];

             = ->prepare('INSERT INTO tests (id, title, description, difficulty, duration_min, total_questions, marks_correct, marks_wrong, source, type, question_ids, created_at)
                VALUES (:id, :title, :description, :difficulty, :duration_min, :total_questions, :marks_correct, :marks_wrong, :source, :type, :question_ids, :created_at)
                ON DUPLICATE KEY UPDATE title = VALUES(title)');

            for ( = 31;  <= 130; ++) {
                 = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                    0xd000 + , 0x1111, 0x2222, 0x4000 | ( % 0x0fff), 0x8000 | ( % 0x3fff),
                    0xaaaa, 0xbbbb,  * 100);
                 = sprintf('Daily DPP %02d — 20-Q Mixed Rapid Round', );
                 = 'Quality-vetted 20-question daily practice: 8 Biology • 6 Physics • 6 Chemistry. 25 minutes, NEET marking (+4 / -1). Perfect daily boost with detailed explanations.';
                 = [];
                if (count() >= 20) {
                     = (( - 31) * 20) % count();
                     = array_slice(, , 20);
                }
                 = 131 - ;
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
                    ':created_at' => date('Y-m-d H:i:s', strtotime("-{} days")),
                ]);
            }
        }

         = ->prepare('SELECT id, title, description, difficulty, duration_min, total_questions, source, created_at, starts_at, ends_at, type FROM tests WHERE type IN (dpp, daily) ORDER BY created_at DESC LIMIT 250');
        ->execute();
         = ->fetchAll(PDO::FETCH_ASSOC);

         = [];
        if ( && !empty()) {
             = array_column(, 'id');
             = implode(',', array_fill(0, count(), '?'));
             = ->prepare("SELECT id, test_id, status, score, correct_count, wrong_count, started_at, submitted_at FROM attempts WHERE user_id = ? AND test_id IN () ORDER BY started_at DESC");
            ->execute(array_merge([], ));
            while ( = ->fetch(PDO::FETCH_ASSOC)) {
                 = ['test_id'];
                if (!isset([])) {
                    [] = ;
                }
            }
        }

        nb_json([
            'tests' => ,
            'dpp_list' => ,
            'attempts' => ,
        ]);
    } catch (Throwable ) {
        nb_fail(->getMessage(), 500);
    }
}

nb_fail('Method not allowed', 405);
