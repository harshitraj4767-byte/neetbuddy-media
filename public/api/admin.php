<?php
declare(strict_types=1);
require_once __DIR__ . '/auth/lib.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Credentials: true');
 = ['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . );
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
if (['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

 = nb_current_user();
if (!) {
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

 = nb_pdo();

// Verify admin role
 = ->prepare('SELECT role FROM user_roles WHERE user_id = :uid LIMIT 1');
->execute([':uid' => ['id']]);
 = ->fetchColumn();

if ( !== 'admin' && (['role'] ?? '') !== 'admin') {
    http_response_code(403);
    echo json_encode(['error' => 'Admin privileges required']);
    exit;
}

 = ['action'] ?? 'stats';

if (['REQUEST_METHOD'] === 'GET') {
    switch () {
        case 'stats':
             = (int)->query('SELECT COUNT(*) FROM profiles')->fetchColumn();
             = (int)->query('SELECT COUNT(*) FROM tests')->fetchColumn();
             = (int)->query('SELECT COUNT(*) FROM questions')->fetchColumn();
             = (int)->query('SELECT COUNT(*) FROM test_attempts')->fetchColumn();
             = ->query('SELECT id, full_name, email, created_at FROM profiles ORDER BY created_at DESC LIMIT 10')->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode([
                'stats' => [
                    'users' => ,
                    'tests' => ,
                    'questions' => ,
                    'attempts' => ,
                ],
                'recent_users' => ,
            ]);
            exit;

        case 'banners':
             = ->query('SELECT * FROM banners ORDER BY created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['banners' => ]);
            exit;

        case 'feedback':
             = ->query('SELECT * FROM feedback ORDER BY created_at DESC LIMIT 50')->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['feedback' => ]);
            exit;

        case 'support':
             = ->query('SELECT * FROM support_tickets ORDER BY updated_at DESC LIMIT 50')->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['tickets' => ]);
            exit;

        case 'materials':
             = ->query('SELECT * FROM study_materials ORDER BY created_at DESC LIMIT 100')->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['materials' => ]);
            exit;

        default:
            echo json_encode(['message' => 'Admin endpoint ready', 'action' => ]);
            exit;
    }
}

if (['REQUEST_METHOD'] === 'POST') {
     = file_get_contents('php://input');
     = json_decode(, true) ?: [];

    if ( === 'create_banner') {
         = ->prepare('INSERT INTO banners (id, title, image_url, link_url, is_active, created_at) VALUES (UUID(), :title, :img, :link, 1, NOW())');
        ->execute([':title' => ['title'] ?? '', ':img' => ['image_url'] ?? '', ':link' => ['link_url'] ?? '']);
        echo json_encode(['success' => true]);
        exit;
    }

    if ( === 'update_support') {
         = ->prepare('UPDATE support_tickets SET status = :status, updated_at = NOW() WHERE id = :id');
        ->execute([':status' => ['status'] ?? 'closed', ':id' => ['id']]);
        echo json_encode(['success' => true]);
        exit;
    }
}

http_response_code(400);
echo json_encode(['error' => 'Invalid action']);
