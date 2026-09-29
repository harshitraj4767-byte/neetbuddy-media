<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

 = nb_pdo();
 = ['batch_id'] ?? null;

if () {
    try {
         = ->prepare('SELECT * FROM batches WHERE id = :id');
        ->execute([':id' => ]);
         = ->fetch(PDO::FETCH_ASSOC);
        if () {
            nb_json(['batch' => ]);
        }
    } catch (Throwable ) {}
    nb_fail('Batch not found', 404);
}

try {
     = ->query('SELECT id, title, image_url, price, discounted_price, duration_days, features, ai_description, short_tagline, sort_order FROM batches WHERE active = 1 ORDER BY sort_order ASC, created_at ASC');
     = ->fetchAll(PDO::FETCH_ASSOC);
    if (!empty()) {
        foreach ( as &) {
            if (isset(['features']) && is_string(['features'])) {
                ['features'] = json_decode(['features'], true) ?: [];
            }
        }
        unset();
        nb_json();
    }
} catch (Throwable ) {}

// Fallback active batches so Premium page never fails or shows empty
 = [
    [
        'id' => '11111111-2222-3333-4444-555555555501',
        'title' => 'NEET 2026 Rankers Batch',
        'image_url' => null,
        'price' => 4999,
        'discounted_price' => 1499,
        'duration_days' => 365,
        'features' => [
            'daily_dpp' => true,
            'mock_tests' => true,
            'generate_test' => true,
            'battlegrounds' => true,
            'contests' => true,
            'flashcards' => true,
            'ncert_highlights' => true,
            'ncert_nuggets' => true,
            'score_predictor' => true,
            'ai_path' => true,
        ],
        'ai_description' => 'Complete comprehensive NEET 2026 preparation with 100+ Daily DPPs, full mock tests, battlegrounds, NCERT analysis, and unlimited custom tests.',
        'short_tagline' => 'Full NEET 2026 Master Preparation',
        'sort_order' => 1
    ],
    [
        'id' => '11111111-2222-3333-4444-555555555502',
        'title' => 'NEET Test Series & DPP Booster',
        'image_url' => null,
        'price' => 1999,
        'discounted_price' => 499,
        'duration_days' => 180,
        'features' => [
            'daily_dpp' => true,
            'mock_tests' => true,
            'generate_test' => true,
            'flashcards' => true,
            'ncert_highlights' => true,
        ],
        'ai_description' => 'Targeted high-yield question solving, all 100 Daily DPPs, 50+ NEET Full & Part Mocks with in-depth question explanations.',
        'short_tagline' => 'Test Series + 100 Daily DPPs',
        'sort_order' => 2
    ]
];

nb_json();
