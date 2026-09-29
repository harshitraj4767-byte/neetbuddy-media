<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
if (!$user) {
    nb_fail("Unauthorized: Authentication required", 401);
}

$userId = $user['id'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS score_predictions (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        predicted_marks INT NOT NULL,
        predicted_air_band VARCHAR(64) NOT NULL,
        payload LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_created (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
} catch (Throwable $e) {}

if ($method === 'GET') {
    try {
        $stmt = $pdo->prepare("SELECT id, predicted_marks, predicted_air_band, payload, created_at FROM score_predictions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1");
        $stmt->execute([$userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $row['predicted_marks'] = (int)$row['predicted_marks'];
            $row['payload'] = json_decode((string)$row['payload'], true) ?? [];
            nb_json(['latest' => $row]);
        }
        nb_json(['latest' => null]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($method === 'POST') {
    // Check 48h cooldown
    $isAdmin = in_array(strtolower($user['email'] ?? ''), ['mohdakmal87741@gmail.com', 'admin@neetbuddy.in', 'harshitraj4767@gmail.com']);
    $prevStmt = $pdo->prepare("SELECT created_at FROM score_predictions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1");
    $prevStmt->execute([$userId]);
    $prevCreated = $prevStmt->fetchColumn();
    if ($prevCreated && !$isAdmin) {
        $elapsed = time() - strtotime((string)$prevCreated);
        $cooldown = 48 * 3600;
        if ($elapsed < $cooldown) {
            $nextTime = date('M d, Y h:i A', strtotime((string)$prevCreated) + $cooldown);
            nb_fail("Score predictor is available once every 48 hours. Try again on $nextTime.", 429);
        }
    }

    // Gather real attempts from Hostinger database
    $stmt = $pdo->prepare("SELECT a.score, a.correct_count, a.wrong_count, a.unattempted_count, t.subject, t.total_questions 
        FROM attempts a 
        LEFT JOIN tests t ON a.test_id = t.id 
        WHERE a.user_id = ? 
        ORDER BY a.started_at DESC LIMIT 50");
    $stmt->execute([$userId]);
    $attempts = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($attempts)) {
        // If no test history yet, provide baseline initial estimate
        nb_fail("Please complete at least one Daily DPP or Mock Test before predicting your score.", 400);
    }

    $subjects = [
        'Biology' => ['c' => 0, 'w' => 0, 'max' => 360],
        'Chemistry' => ['c' => 0, 'w' => 0, 'max' => 180],
        'Physics' => ['c' => 0, 'w' => 0, 'max' => 180],
    ];

    $totalCorrect = 0;
    $totalQuestions = 0;
    foreach ($attempts as $a) {
        $sub = ucfirst(strtolower(trim((string)($a['subject'] ?? 'Biology'))));
        if (!isset($subjects[$sub])) $sub = 'Biology';
        $c = (int)($a['correct_count'] ?? 0);
        $w = (int)($a['wrong_count'] ?? 0);
        $subjects[$sub]['c'] += $c;
        $subjects[$sub]['w'] += $w;
        $totalCorrect += $c;
        $totalQuestions += ($c + $w);
    }

    $breakdown = [];
    $totalPredicted = 0;

    foreach ($subjects as $name => $data) {
        $tot = $data['c'] + $data['w'];
        $acc = $tot > 0 ? ($data['c'] / $tot) : ($totalQuestions > 0 ? ($totalCorrect / $totalQuestions) : 0.65);
        // Add realistic negative marking penalty
        $netRatio = max(0.1, ($acc * 1.0) - ((1 - $acc) * 0.25));
        $predictedMarks = (int)round($data['max'] * min(1.0, $netRatio));
        $breakdown[] = [
            'subject' => $name,
            'predicted_marks' => $predictedMarks,
            'max_marks' => $data['max']
        ];
        $totalPredicted += $predictedMarks;
    }

    $totalPredicted = max(120, min(720, $totalPredicted));

    // Calculate AIR Band
    if ($totalPredicted >= 690) $airBand = "AIR 1 - 500";
    elseif ($totalPredicted >= 650) $airBand = "AIR 500 - 3,500";
    elseif ($totalPredicted >= 615) $airBand = "AIR 3,500 - 12,000";
    elseif ($totalPredicted >= 580) $airBand = "AIR 12,000 - 28,000";
    elseif ($totalPredicted >= 520) $airBand = "AIR 28,000 - 65,000";
    elseif ($totalPredicted >= 450) $airBand = "AIR 65,000 - 1,20,000";
    elseif ($totalPredicted >= 350) $airBand = "AIR 1,20,000 - 2,50,000";
    else $airBand = "AIR 2,50,000+";

    // Strengths, weaknesses, advice based on accuracy
    $strengths = [];
    $weaknesses = [];
    $advice = [];

    usort($breakdown, fn($a, $b) => ($b['predicted_marks'] / $b['max_marks']) <=> ($a['predicted_marks'] / $a['max_marks']));

    $strengths[] = "High scoring momentum in " . $breakdown[0]['subject'] . " with " . round(($breakdown[0]['predicted_marks'] / $breakdown[0]['max_marks']) * 100) . "% accuracy.";
    $strengths[] = "Consistent test attempt discipline across recent sessions.";

    $weaknesses[] = "Marks leakage in " . $breakdown[2]['subject'] . " — currently projected at " . $breakdown[2]['predicted_marks'] . "/" . $breakdown[2]['max_marks'] . ".";
    $weaknesses[] = "Negative marking penalty from unverified guesses.";

    $advice[] = "Focus daily revision blocks on " . $breakdown[2]['subject'] . " high-weightage chapters to gain +30 to +45 marks.";
    $advice[] = "Target at least 2 full-length 200-question timed mocks weekly to master negative marking control.";
    $advice[] = "Review bookmarked flashcards and mistake book daily for 30 minutes before sleep.";

    $payload = [
        'subject_breakdown' => $breakdown,
        'strengths' => $strengths,
        'weaknesses' => $weaknesses,
        'advice' => $advice
    ];

    $id = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );

    $encoded = json_encode($payload);
    $ins = $pdo->prepare("INSERT INTO score_predictions (id, user_id, predicted_marks, predicted_air_band, payload) VALUES (?, ?, ?, ?, ?)");
    $ins->execute([$id, $userId, $totalPredicted, $airBand, $encoded]);

    nb_json([
        'success' => true,
        'prediction' => [
            'id' => $id,
            'predicted_marks' => $totalPredicted,
            'predicted_air_band' => $airBand,
            'payload' => $payload,
            'created_at' => date('Y-m-d H:i:s')
        ]
    ]);
}

nb_fail('Method not allowed', 405);
