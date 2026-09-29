<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();

$defaultLinks = [
    'telegram' => 'https://t.me/neetbuddy',
    'instagram' => 'https://instagram.com/neetbuddy.in',
    'youtube' => 'https://youtube.com/@neetbuddy',
    'whatsapp' => 'https://whatsapp.com/channel/neetbuddy',
];

try {
    $stmt = $pdo->prepare("SELECT setting_value FROM admin_settings WHERE setting_key = 'social_links' LIMIT 1");
    $stmt->execute();
    $raw = $stmt->fetchColumn();
    if ($raw) {
        $saved = json_decode((string)$raw, true);
        if (is_array($saved)) {
            foreach ($defaultLinks as $k => $v) {
                if (!empty($saved[$k])) {
                    $defaultLinks[$k] = trim((string)$saved[$k]);
                }
            }
        }
    }
} catch (Throwable $e) {
    // Return default links gracefully
}

nb_json([
    'success' => true,
    'links' => $defaultLinks,
]);
