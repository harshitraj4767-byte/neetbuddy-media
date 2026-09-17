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

    case 'highlight_decks':
    case 'decks':
        try {
            $stmt = $pdo->query('
                SELECT c.id AS chapter_id, c.title AS chapter_name, c.subject, c.slug,
                       COALESCE(c.highlight_count, (
                           SELECT COUNT(*) FROM ncert_book_blocks b 
                           WHERE b.chapter_id = c.id AND (b.type = "highlight" OR b.status = "highlight" OR b.text LIKE "%highlight%")
                       ), 15) AS count
                FROM ncert_book_chapters c
                ORDER BY c.ord ASC, c.title ASC
            ');
            $decks = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $mapped = [];
            foreach ($decks as $d) {
                $mapped[] = [
                    'chapter_id' => (string)$d['chapter_id'],
                    'chapter_name' => (string)$d['chapter_name'],
                    'subject_id' => (string)$d['subject'],
                    'subject_name' => ucfirst((string)$d['subject']),
                    'count' => max(5, (int)($d['count'] ?? 10)),
                ];
            }
            nb_json(['decks' => $mapped]);
        } catch (Throwable $e) {
            nb_json(['decks' => [], 'error' => $e->getMessage()]);
        }
        break;

    case 'highlights':
    case 'get_highlights':
        $chapterId = $_GET['chapter_id'] ?? $_POST['chapter_id'] ?? null;
        try {
            $stmt = $pdo->prepare('
                SELECT b.id, b.chapter_id, b.text AS body, c.subject AS subject_id, "NCERT" AS source
                FROM ncert_book_blocks b
                JOIN ncert_book_chapters c ON c.id = b.chapter_id
                WHERE b.chapter_id = ? AND b.text IS NOT NULL AND CHAR_LENGTH(b.text) > 20
                ORDER BY b.idx ASC LIMIT 50
            ');
            $stmt->execute([$chapterId]);
            $highlights = $stmt->fetchAll(PDO::FETCH_ASSOC);
            nb_json(['highlights' => $highlights]);
        } catch (Throwable $e) {
            nb_json(['highlights' => [], 'error' => $e->getMessage()]);
        }
        break;
    default:
        nb_json(['status' => 'ok']);
        break;
}
