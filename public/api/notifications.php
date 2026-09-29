<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

 = nb_pdo();
 = nb_current_user();
 = ['id'] ?? null;
 = ['REQUEST_METHOD'] ?? 'GET';

if ( === 'GET') {
     = [];
    if () {
        try {
             = ->prepare('SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50');
            ->execute([]);
             = ->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable ) {}
    }

    if (empty()) {
        // High-yield platform notifications for NEET Buddy users
         = [
            [
                'id' => 'notif-dpp-100',
                'kind' => 'dpp',
                'title' => '100 Daily DPPs Ready',
                'body' => '100 new curated Daily Practice Problems (Day 31 to Day 130) are now live in the DPP section.',
                'link' => '/dpp',
                'read_at' => null,
                'created_at' => date('c', strtotime('-1 hour')),
            ],
            [
                'id' => 'notif-mock-neet',
                'kind' => 'contest',
                'title' => 'NEET 2026 Full Mock Test',
                'body' => 'High-yield full syllabus mock test is live. Challenge yourself with real exam conditions.',
                'link' => '/mocks',
                'read_at' => null,
                'created_at' => date('c', strtotime('-1 day')),
            ],
            [
                'id' => 'notif-battle-arena',
                'kind' => 'contest_result',
                'title' => 'Battlegrounds Arena Open',
                'body' => 'Compete live with peer NEET aspirants in timed rapid-fire physics and chemistry battles.',
                'link' => '/battlegrounds',
                'read_at' => null,
                'created_at' => date('c', strtotime('-2 days')),
            ]
        ];
    }

    nb_json();
}

if ( === 'POST') {
     = json_decode(file_get_contents('php://input'), true) ?? ;
     = ['action'] ?? 'read';
     = ['id'] ?? null;

    if () {
        try {
            if ( === 'read_all') {
                 = ->prepare('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL');
                ->execute([]);
            } elseif () {
                 = ->prepare('UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ?');
                ->execute([, ]);
            }
        } catch (Throwable ) {}
    }

    nb_json(['ok' => true]);
}

nb_fail('Method not allowed', 405);
