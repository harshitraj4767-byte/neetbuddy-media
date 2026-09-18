<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
if (!$user) {
    nb_fail("Unauthorized: Authentication required", 401);
}

// Check admin role
$isAdmin = false;
try {
    $stmt = $pdo->prepare("SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1");
    $stmt->execute([$user["id"]]);
    $isAdmin = (bool)$stmt->fetchColumn();
} catch (Throwable $e) {}

if (!$isAdmin) {
    nb_fail("Forbidden: Admin privileges required", 403);
}

$action = $_GET["action"] ?? $_POST["action"] ?? "";
$method = $_SERVER["REQUEST_METHOD"] ?? "GET";

if ($method === "GET") {
    switch ($action) {
        case "stats":
            $usersCount = (int)$pdo->query("SELECT COUNT(*) FROM auth_users")->fetchColumn();
            $questionsCount = (int)$pdo->query("SELECT COUNT(*) FROM qb_questions")->fetchColumn();
            $attemptsCount = (int)$pdo->query("SELECT COUNT(*) FROM attempts")->fetchColumn();
            $activeSubsCount = (int)$pdo->query("SELECT COUNT(*) FROM subscriptions WHERE status = 'active'")->fetchColumn();

            nb_json([
                "stats" => [
                    "users" => $usersCount,
                    "questions" => $questionsCount,
                    "attempts" => $attemptsCount,
                    "active_subscriptions" => $activeSubsCount
                ]
            ]);
            exit;

                case "delete_all_mock_tests":
            $pdo->exec("DELETE FROM attempts WHERE test_id IN (SELECT id FROM tests WHERE type = 'mock' OR type = 'test')");
            $pdo->exec("DELETE FROM tests WHERE type = 'mock' OR type = 'test'");
            nb_json(["success" => true, "message" => "All mock tests and related attempts deleted successfully"]);

        case "delete_all_banners":
            $pdo->exec("DELETE FROM dashboard_banners");
            nb_json(["success" => true, "message" => "All banners deleted successfully"]);
            exit;

        case "banners":
            $banners = $pdo->query("SELECT * FROM dashboard_banners ORDER BY sort_order ASC, created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
            nb_json(["banners" => $banners, "count" => count($banners)]);
            exit;

        case "feedback":
            $feedback = $pdo->query("SELECT f.*, p.full_name, p.email FROM feedback f LEFT JOIN profiles p ON f.user_id = p.id ORDER BY f.created_at DESC LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);
            nb_json(["feedback" => $feedback]);
            exit;

        case "support":
            $tickets = $pdo->query("SELECT t.*, p.full_name, p.email FROM support_tickets t LEFT JOIN profiles p ON t.user_id = p.id ORDER BY t.created_at DESC LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);
            nb_json(["tickets" => $tickets]);
            exit;

        case "materials":
            $materials = $pdo->query("SELECT * FROM study_materials ORDER BY created_at DESC LIMIT 50")->fetchAll(PDO::FETCH_ASSOC);
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

if ($method === "POST" || $method === "DELETE") {
    $input = json_decode(file_get_contents("php://input"), true) ?? $_POST;
    if (!$action && isset($input["action"])) {
        $action = $input["action"];
    }

    switch ($action) {
        case "upload_banner":
            $uploadDir = __DIR__ . '/../uploads/banners';
            if (!is_dir($uploadDir)) {
                @mkdir($uploadDir, 0755, true);
            }

            $uploadedUrl = null;
            if (isset($_FILES['image']) && is_uploaded_file($_FILES['image']['tmp_name'])) {
                $file = $_FILES['image'];
                $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
                $allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'];
                if (!in_array($ext, $allowed, true)) {
                    nb_fail("Invalid image format. Allowed: " . implode(', ', $allowed), 400);
                }
                $filename = 'banner_' . bin2hex(random_bytes(8)) . '_' . time() . '.' . $ext;
                $target = $uploadDir . '/' . $filename;
                if (!move_uploaded_file($file['tmp_name'], $target)) {
                    nb_fail("Failed to save uploaded file", 500);
                }
                $uploadedUrl = '/uploads/banners/' . $filename;
            } elseif (!empty($input['image_data'])) {
                $data = (string)$input['image_data'];
                if (preg_match('/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/', $data, $m)) {
                    $ext = strtolower($m[1]);
                    if ($ext === 'jpeg') $ext = 'jpg';
                    if ($ext === 'svg+xml') $ext = 'svg';
                    $allowed = ['jpg', 'png', 'webp', 'gif', 'svg'];
                    if (!in_array($ext, $allowed, true)) {
                        nb_fail("Invalid image type", 400);
                    }
                    $bin = base64_decode($m[2]);
                    if ($bin === false) {
                        nb_fail("Malformed base64 data", 400);
                    }
                    $filename = 'banner_' . bin2hex(random_bytes(8)) . '_' . time() . '.' . $ext;
                    $target = $uploadDir . '/' . $filename;
                    if (file_put_contents($target, $bin) === false) {
                        nb_fail("Failed to write image to disk", 500);
                    }
                    $uploadedUrl = '/uploads/banners/' . $filename;
                } else {
                    nb_fail("Invalid data URI", 400);
                }
            } else {
                nb_fail("No image file or image_data provided", 400);
            }

            nb_json([
                "success" => true,
                "url" => $uploadedUrl,
                "message" => "Image uploaded successfully"
            ]);
            exit;

        case "delete_all_banners":
            $pdo->exec("DELETE FROM dashboard_banners");
            nb_json(["success" => true, "message" => "All banners deleted successfully"]);
            exit;

        case "delete_banner":
            $id = $input["id"] ?? $_GET["id"] ?? null;
            if (!$id) {
                nb_fail("Missing banner id", 400);
            }
            $stmt = $pdo->prepare("DELETE FROM dashboard_banners WHERE id = ?");
            $stmt->execute([$id]);
            nb_json(["success" => true, "message" => "Banner deleted successfully", "id" => $id]);
            exit;

        case "banners":
        case "save_banner":
            $id = $input["id"] ?? sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff),
                mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000,
                mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
            $title = $input["title"] ?? null;
            $imageUrl = $input["image_url"] ?? "";
            $imageUrlDark = !empty($input["image_url_dark"]) ? $input["image_url_dark"] : null;
            $linkUrl = $input["link_url"] ?? "";
            $sortOrder = (int)($input["sort_order"] ?? 0);
            $active = (int)($input["active"] ?? 1);

            try {
                $pdo->exec("ALTER TABLE dashboard_banners ADD COLUMN image_url_dark TEXT NULL");
            } catch (Throwable $e) {}

            $stmt = $pdo->prepare("INSERT INTO dashboard_banners (id, title, image_url, image_url_dark, link_url, sort_order, active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE title = VALUES(title), image_url = VALUES(image_url), image_url_dark = VALUES(image_url_dark), link_url = VALUES(link_url), sort_order = VALUES(sort_order), active = VALUES(active)");
            $stmt->execute([$id, $title, $imageUrl, $imageUrlDark, $linkUrl, $sortOrder, $active]);
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
            $stmt = $pdo->prepare("INSERT INTO subscriptions (id, user_id, plan, status, started_at, expires_at, source, granted_by, created_at) VALUES (?, ?, ?, 'active', NOW(), ?, 'admin_grant', ?, NOW())");
            $stmt->execute([$subId, $targetUserId, $plan, $expiresAt, $user["id"]]);
            $pdo->prepare("UPDATE profiles SET trial_expires_at = ? WHERE id = ?")->execute([$expiresAt, $targetUserId]);
            nb_json(["success" => true, "subscription_id" => $subId]);
            exit;

        default:
            nb_fail("Invalid action", 400);
    }
}

nb_fail("Method not allowed", 405);
