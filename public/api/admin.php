<?php
declare(strict_types=1);

require_once __DIR__ . "/auth/lib.php";

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);

if (!$user) {
    nb_fail("Authentication required", 401);
}

// Check admin role in user_roles or admin flag
$stmt = $pdo->prepare("SELECT role FROM user_roles WHERE user_id = :uid AND role = "admin" LIMIT 1");
$stmt->execute([":uid" => $user["id"]]);
$isAdmin = (bool)$stmt->fetchColumn();

if (!$isAdmin && ($user["role"] ?? "") !== "admin" && ($user["email"] ?? "") !== "sanskarjaiswal6892@gmail.com") {
    nb_fail("Admin privileges required", 403);
}

$action = $_GET["action"] ?? "stats";
$method = $_SERVER["REQUEST_METHOD"] ?? "GET";

if ($method === "GET") {
    switch ($action) {
        case "stats":
            $usersCount = (int)$pdo->query("SELECT COUNT(*) FROM profiles")->fetchColumn();
            $testsCount = (int)$pdo->query("SELECT COUNT(*) FROM tests")->fetchColumn();
            $questionsCount = (int)$pdo->query("SELECT COUNT(*) FROM qb_questions")->fetchColumn();
            $attemptsCount = (int)$pdo->query("SELECT COUNT(*) FROM attempts")->fetchColumn();
            $recentUsers = $pdo->query("SELECT id, full_name, email, created_at FROM profiles ORDER BY created_at DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);

            nb_json([
                "stats" => [
                    "users" => $usersCount,
                    "tests" => $testsCount,
                    "questions" => $questionsCount,
                    "attempts" => $attemptsCount,
                ],
                "recent_users" => $recentUsers,
            ]);
            exit;

        case "banners":
            $banners = $pdo->query("SELECT * FROM dashboard_banners ORDER BY sort_order ASC, created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
            nb_json(["banners" => $banners]);
            exit;

        case "feedback":
            $feedback = $pdo->query("SELECT * FROM feedback ORDER BY created_at DESC LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);
            nb_json(["feedback" => $feedback]);
            exit;

        case "support":
            $tickets = $pdo->query("SELECT * FROM support_tickets ORDER BY updated_at DESC LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);
            nb_json(["tickets" => $tickets]);
            exit;

        case "materials":
            $materials = $pdo->query("SELECT * FROM study_materials ORDER BY created_at DESC LIMIT 100")->fetchAll(PDO::FETCH_ASSOC);
            nb_json(["materials" => $materials]);
            exit;

        case "subscriptions":
            $subs = $pdo->query("SELECT s.*, p.full_name, p.email FROM subscriptions s LEFT JOIN profiles p ON s.user_id = p.id ORDER BY s.created_at DESC LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);
            nb_json(["subscriptions" => $subs]);
            exit;

        default:
            nb_fail("Invalid action", 400);
    }
}

if ($method === "POST") {
    $input = json_decode(file_get_contents("php://input"), true) ?? [];
    switch ($action) {
        case "banners":
            $id = $input["id"] ?? bin2hex(random_bytes(16));
            $title = $input["title"] ?? null;
            $imageUrl = $input["image_url"] ?? "";
            $linkUrl = $input["link_url"] ?? "";
            $sortOrder = (int)($input["sort_order"] ?? 0);
            $active = (int)($input["active"] ?? 1);

            $stmt = $pdo->prepare("INSERT INTO dashboard_banners (id, title, image_url, link_url, sort_order, active) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title), image_url = VALUES(image_url), link_url = VALUES(link_url), sort_order = VALUES(sort_order), active = VALUES(active)");
            $stmt->execute([$id, $title, $imageUrl, $linkUrl, $sortOrder, $active]);
            nb_json(["success" => true, "id" => $id]);
            exit;

        case "grant_premium":
            $targetUserId = $input["user_id"] ?? null;
            $plan = $input["plan"] ?? "lifetime";
            $expiresAt = $plan === "lifetime" ? "2099-12-31 23:59:59" : date("Y-m-d H:i:s", strtotime("+1 year"));
            if (!$targetUserId) {
                nb_fail("Missing target user_id", 400);
            }
            $subId = bin2hex(random_bytes(16));
            $stmt = $pdo->prepare("INSERT INTO subscriptions (id, user_id, plan, status, started_at, expires_at, source, granted_by) VALUES (?, ?, ?, "active", NOW(), ?, "admin_grant", ?)");
            $stmt->execute([$subId, $targetUserId, $plan, $expiresAt, $user["id"]]);
            $pdo->prepare("UPDATE profiles SET trial_expires_at = ? WHERE id = ?")->execute([$expiresAt, $targetUserId]);
            nb_json(["success" => true, "subscription_id" => $subId]);
            exit;

        default:
            nb_fail("Invalid action", 400);
    }
}

nb_fail("Method not allowed", 405);
