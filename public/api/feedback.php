<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
$userId = $user['id'] ?? null;
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Ensure feedback table exists
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS feedback (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NULL,
        user_name VARCHAR(128) NULL,
        user_email VARCHAR(128) NULL,
        category VARCHAR(64) NOT NULL DEFAULT 'general',
        rating INT NOT NULL DEFAULT 5,
        message TEXT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
} catch (Throwable $e) {}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $message = trim((string)($input['message'] ?? ''));
    if ($message === '') {
        nb_fail('Message is required', 400);
    }

    $id = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );

    $userName = $input['name'] ?? ($user['full_name'] ?? ($user['name'] ?? 'NEET Aspirant'));
    $userEmail = $input['email'] ?? ($user['email'] ?? 'student@neetbuddy.in');
    $category = $input['category'] ?? 'general';
    $rating = (int)($input['rating'] ?? 5);

    try {
        $stmt = $pdo->prepare("INSERT INTO feedback (id, user_id, user_name, user_email, category, rating, message, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')");
        $stmt->execute([$id, $userId, $userName, $userEmail, $category, $rating, $message]);
        nb_json(['success' => true, 'message' => 'Thank you! Your feedback has been received.', 'id' => $id]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($method === 'GET') {
    try {
        $stmt = $pdo->query("SELECT * FROM feedback ORDER BY created_at DESC LIMIT 50");
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        nb_json(['feedback' => $items]);
    } catch (Throwable $e) {
        nb_json(['feedback' => []]);
    }
}

nb_fail('Method not allowed', 405);
