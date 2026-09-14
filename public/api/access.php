<?php
declare(strict_types=1);

// Access/entitlement endpoint for static hosting (Hostinger).
// The TanStack server function getMyAccess cannot run on a static host, so the
// frontend falls back to this endpoint. It mirrors src/lib/access.server.ts.

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$userId = nb_current_user_id();
if ($userId === null) {
    nb_fail('Not signed in', 401);
}

const TRIAL_FALLBACK_FEATURES = [
    'daily_dpp',
    'mock_tests',
    'generate_test',
    'bookmarks',
    'weekly_progress',
    'subject_wise_quiz',
];
const PRIME_ONLY_FEATURES = ['ai_path', 'score_predictor'];
const FREE_FEATURES = ['daily_dpp', 'contests', 'battlegrounds'];

function nb_features_from_json($features): array
{
    if (is_string($features)) {
        $features = json_decode($features, true);
    }
    if (!is_array($features)) {
        return [];
    }
    $keys = [];
    foreach ($features as $k => $v) {
        if ($v) {
            $keys[] = (string) $k;
        }
    }
    return $keys;
}

function nb_detect_tier(?string $title): string
{
    $t = strtolower((string) $title);
    if (str_contains($t, 'elite')) return 'elite';
    if (str_contains($t, 'prime')) return 'prime';
    return 'essential';
}

function nb_strip_prime_only(array $features): array
{
    return array_values(array_filter($features, fn ($k) => !in_array($k, PRIME_ONLY_FEATURES, true)));
}

function nb_query_one(PDO $db, string $sql, array $params): ?array
{
    try {
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row ?: null;
    } catch (Throwable $e) {
        error_log('[access] query failed: ' . $e->getMessage());
        return null;
    }
}

$db = nb_db();
$now = date('Y-m-d H:i:s');

$isAdmin = nb_query_one($db, "SELECT 1 AS x FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [$userId]) !== null;
$isMentor = nb_query_one($db, 'SELECT 1 AS x FROM mentors WHERE user_id = ? AND active = 1 LIMIT 1', [$userId]) !== null;

$sub = nb_query_one(
    $db,
    "SELECT id, plan, expires_at, source_batch_id FROM subscriptions
     WHERE user_id = ? AND status = 'active' AND expires_at > ?
     ORDER BY expires_at DESC LIMIT 1",
    [$userId, $now]
);

$batch = null;
if ($sub && !empty($sub['source_batch_id'])) {
    $batch = nb_query_one($db, 'SELECT id, title, features FROM batches WHERE id = ? LIMIT 1', [$sub['source_batch_id']]);
}

$prof = nb_query_one($db, 'SELECT trial_expires_at FROM profiles WHERE id = ? LIMIT 1', [$userId]);
$trialExp = $prof['trial_expires_at'] ?? null;
$trialActive = $trialExp !== null && $trialExp !== '' && strtotime((string) $trialExp) > time();

$base = [
    'isAdmin' => $isAdmin,
    'isMentor' => $isMentor,
    'trialExpiresAt' => $trialExp,
];

if ($isAdmin) {
    $merged = [];
    try {
        foreach ($db->query('SELECT features FROM batches') as $row) {
            foreach (nb_features_from_json($row['features']) as $k) {
                $merged[$k] = true;
            }
        }
    } catch (Throwable $e) {
        error_log('[access] batch merge failed: ' . $e->getMessage());
    }
    foreach (['contests', 'battlegrounds', 'infinite_run', 'pyqs'] as $k) {
        $merged[$k] = true;
    }
    nb_json($base + [
        'tier' => 'elite',
        'trialActive' => $trialActive,
        'subscriptionActive' => true,
        'subscriptionExpiresAt' => null,
        'batchId' => $batch['id'] ?? null,
        'batchTitle' => 'Admin',
        'features' => array_keys($merged),
    ]);
}

if ($sub) {
    $isMentorship = is_string($sub['plan']) && str_starts_with($sub['plan'], 'mentorship_');
    if ($isMentorship) {
        $merged = [];
        try {
            foreach ($db->query('SELECT features FROM batches') as $row) {
                foreach (nb_features_from_json($row['features']) as $k) {
                    $merged[$k] = true;
                }
            }
        } catch (Throwable $e) {
            error_log('[access] batch merge failed: ' . $e->getMessage());
        }
        foreach (['contests', 'battlegrounds', 'infinite_run'] as $k) {
            $merged[$k] = true;
        }
        unset($merged['pyqs']);
        $features = array_keys($merged);
        $tier = 'elite';
        $batchTitle = '1-on-1 Mentorship';
    } else {
        $features = nb_features_from_json($batch['features'] ?? null);
        if (count($features) === 0) {
            $features = array_merge(TRIAL_FALLBACK_FEATURES, [
                'flashcards', 'ncert_highlights', 'score_predictor', 'neetlab',
                'ai_path', 'advanced_analytics', 'priority_support',
            ]);
        }
        foreach (['contests', 'battlegrounds', 'infinite_run'] as $k) {
            if (!in_array($k, $features, true)) {
                $features[] = $k;
            }
        }
        $features = array_values(array_filter($features, fn ($k) => $k !== 'pyqs'));
        $tier = nb_detect_tier($batch['title'] ?? $sub['plan'] ?? null);
        $batchTitle = $batch['title'] ?? null;
        if ($tier !== 'prime' && $tier !== 'elite') {
            $features = nb_strip_prime_only($features);
        }
    }
    nb_json($base + [
        'tier' => $tier,
        'trialActive' => false,
        'subscriptionActive' => true,
        'subscriptionExpiresAt' => $sub['expires_at'],
        'batchId' => $batch['id'] ?? null,
        'batchTitle' => $batchTitle,
        'features' => $features,
    ]);
}

if ($trialActive) {
    $prime = nb_query_one($db, "SELECT features FROM batches WHERE title LIKE 'Prime%' LIMIT 1", []);
    $features = $prime ? nb_features_from_json($prime['features']) : [];
    if (count($features) === 0) {
        $features = array_merge(TRIAL_FALLBACK_FEATURES, [
            'flashcards', 'ncert_highlights', 'neetlab',
            'advanced_analytics', 'priority_support',
        ]);
    }
    foreach (['contests', 'battlegrounds', 'infinite_run'] as $k) {
        if (!in_array($k, $features, true)) {
            $features[] = $k;
        }
    }
    $features = array_values(array_filter($features, fn ($k) => $k !== 'pyqs'));
    $features = nb_strip_prime_only($features);
    nb_json($base + [
        'tier' => 'trial',
        'trialActive' => true,
        'subscriptionActive' => false,
        'subscriptionExpiresAt' => null,
        'batchId' => null,
        'batchTitle' => 'Free Trial',
        'features' => $features,
    ]);
}

nb_json($base + [
    'tier' => 'none',
    'trialActive' => false,
    'subscriptionActive' => false,
    'subscriptionExpiresAt' => null,
    'batchId' => null,
    'batchTitle' => null,
    'features' => FREE_FEATURES,
]);
