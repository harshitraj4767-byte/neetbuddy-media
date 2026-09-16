<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$action = $_GET['action'] ?? $_GET['type'] ?? 'chapters';

switch ($action) {
    case 'book_chapters':
    case 'chapters':
        try {
            $subject = $_GET['subject'] ?? null;
            $sql = 'SELECT id, subject, slug, title, ord, heading_count, para_count, image_count, highlight_count, pyq_count FROM ncert_book_chapters';
            $params = [];
            if ($subject) {
                $sql .= ' WHERE subject = :subject';
                $params[':subject'] = $subject;
            }
            $sql .= ' ORDER BY ord ASC';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            nb_json(['chapters' => $rows]);
        } catch (Throwable $e) {
            nb_json(['chapters' => [], 'error' => $e->getMessage()]);
        }
        break;

    case 'book_chapter':
        $slug = $_GET['slug'] ?? '';
        try {
            $cStmt = $pdo->prepare('SELECT * FROM ncert_book_chapters WHERE slug = :slug LIMIT 1');
            $cStmt->execute([':slug' => $slug]);
            $chapter = $cStmt->fetch(PDO::FETCH_ASSOC);
            if (!$chapter) {
                nb_fail('Chapter not found', 404);
            }

            $bStmt = $pdo->prepare('SELECT id, idx, type, level, text, content, status, pyq_ids, image_url FROM ncert_book_blocks WHERE chapter_id = :cid ORDER BY idx ASC');
            $bStmt->execute([':cid' => $chapter['id']]);
            $blocks = $bStmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($blocks as &$b) {
                if (!empty($b['content']) && is_string($b['content'])) {
                    $b['content'] = json_decode($b['content'], true) ?: [];
                }
                if (!empty($b['pyq_ids']) && is_string($b['pyq_ids'])) {
                    $b['pyq_ids'] = json_decode($b['pyq_ids'], true) ?: [];
                }
            }

            nb_json(['chapter' => $chapter, 'blocks' => $blocks]);
        } catch (Throwable $e) {
            nb_fail($e->getMessage(), 500);
        }
        break;

    case 'book_pyqs':
    case 'pyqs':
        $ids = $_GET['ids'] ?? '';
        if (is_string($ids)) {
            $ids = array_filter(array_map('intval', explode(',', $ids)));
        }
        if (empty($ids)) {
            nb_json(['pyqs' => []]);
        }
        try {
            $in = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $pdo->prepare("SELECT unique_id, subject, question, answer, explanation, topic_name, chapter_name, difficulty, quiz_type, option_a, option_b, option_c, option_d, syllabus, year, exam_name, image_url FROM ncert_book_pyq WHERE unique_id IN ($in)");
            $stmt->execute(array_values($ids));
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            nb_json(['pyqs' => $rows]);
        } catch (Throwable $e) {
            nb_json(['pyqs' => [], 'error' => $e->getMessage()]);
        }
        break;

    default:
        nb_json(['status' => 'ok']);
        break;
}
