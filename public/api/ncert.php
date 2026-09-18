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
            // Only select columns that actually exist in this database. Older
            // imports of ncert_book_pyq have no syllabus/year/exam_name columns,
            // and selecting them made every PYQ lookup fail with SQLSTATE 42S22,
            // so highlighted NCERT lines opened an empty practice screen.
            $available = [];
            try {
                $colStmt = $pdo->query('SHOW COLUMNS FROM ncert_book_pyq');
                foreach ($colStmt->fetchAll(PDO::FETCH_ASSOC) as $col) {
                    $available[strtolower((string)$col['Field'])] = true;
                }
            } catch (Throwable $e) {
                $available = [];
            }

            $wanted = ['unique_id', 'subject', 'question', 'answer', 'explanation', 'topic_name',
                       'chapter_name', 'difficulty', 'quiz_type', 'option_a', 'option_b',
                       'option_c', 'option_d', 'image_url', 'syllabus', 'syllabus_update',
                       'year', 'exam_name', 'ncert22_page', 'ncert23_page'];
            $select = [];
            foreach ($wanted as $col) {
                if (!$available || isset($available[$col])) {
                    $select[] = '`' . $col . '`';
                }
            }
            $cols = $select ? implode(', ', $select) : '*';

            $stmt = $pdo->prepare("SELECT $cols FROM ncert_book_pyq WHERE unique_id IN ($in)");
            $stmt->execute(array_values($ids));
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as &$row) {
                // Normalise legacy column names so the app always gets the same shape.
                if (!array_key_exists('syllabus', $row)) {
                    $row['syllabus'] = $row['syllabus_update'] ?? null;
                }
                if (!array_key_exists('year', $row)) {
                    $row['year'] = null;
                }
                if (!array_key_exists('exam_name', $row)) {
                    $row['exam_name'] = null;
                }
            }
            unset($row);
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
    // --- NCERT Nuggets: question bank served straight from MySQL ---------
    case 'qb_chapters':
        try {
            $subject = trim((string)($_GET['subject'] ?? ''));
            if ($subject !== '') {
                $stmt = $pdo->prepare('SELECT id, subject_id, name FROM qb_chapters WHERE LOWER(subject_id) = LOWER(:s) ORDER BY name ASC');
                $stmt->execute([':s' => $subject]);
            } else {
                $stmt = $pdo->query('SELECT id, subject_id, name FROM qb_chapters ORDER BY name ASC');
            }
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as &$r) {
                $r['id'] = (int)$r['id'];
            }
            nb_json(['chapters' => $rows]);
        } catch (Throwable $e) {
            nb_json(['chapters' => [], 'error' => $e->getMessage()]);
        }
        break;

    case 'qb_questions':
        $chapterId = (int)($_GET['chapter_id'] ?? 0);
        if ($chapterId <= 0) {
            nb_json(['questions' => [], 'topics' => []]);
        }
        try {
            $limit = min(5000, max(1, (int)($_GET['limit'] ?? 2000)));
            $offset = max(0, (int)($_GET['offset'] ?? 0));
            $stmt = $pdo->prepare(
                'SELECT id, topic_id, question_html, options, correct_index, explanation,
                        question_image_url, explanation_image_url, difficulty, year
                 FROM qb_questions WHERE chapter_id = :cid ORDER BY id ASC LIMIT :lim OFFSET :off'
            );
            $stmt->bindValue(':cid', $chapterId, PDO::PARAM_INT);
            $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as &$r) {
                $r['id'] = (int)$r['id'];
                $r['topic_id'] = $r['topic_id'] === null ? null : (int)$r['topic_id'];
                $r['correct_index'] = $r['correct_index'] === null ? null : (int)$r['correct_index'];
                $r['year'] = $r['year'] === null ? null : (int)$r['year'];
                if (is_string($r['options'])) {
                    $r['options'] = json_decode($r['options'], true) ?: [];
                }
            }
            unset($r);

            $tStmt = $pdo->prepare('SELECT id, name FROM qb_topics WHERE chapter_id = :cid');
            $tStmt->execute([':cid' => $chapterId]);
            $topics = $tStmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($topics as &$t) {
                $t['id'] = (int)$t['id'];
            }
            nb_json(['questions' => $rows, 'topics' => $topics]);
        } catch (Throwable $e) {
            nb_json(['questions' => [], 'topics' => [], 'error' => $e->getMessage()]);
        }
        break;

    // --- NCERT Nuggets: per-user answers and progress --------------------
    case 'keypoint_answer':
        $userId = nb_current_user_id();
        if ($userId === null) {
            nb_json(['ok' => false, 'error' => 'Not signed in'], 401);
        }
        try {
            $b = nb_body();
            $stmt = $pdo->prepare(
                'INSERT INTO ncert_keypoint_answers
                    (id, user_id, chapter_slug, topic_key, block_id, source, question_id,
                     selected, is_correct, skipped, time_ms, answered_at)
                 VALUES (:id, :uid, :slug, :topic, :block, :source, :qid, :sel, :ok, :skip, :ms, NOW())'
            );
            $stmt->execute([
                ':id' => nb_uuid(),
                ':uid' => $userId,
                ':slug' => (string)($b['chapter_slug'] ?? ''),
                ':topic' => (string)($b['topic_key'] ?? ''),
                ':block' => isset($b['block_id']) && $b['block_id'] !== null ? (int)$b['block_id'] : null,
                ':source' => (string)($b['source'] ?? ''),
                ':qid' => (int)($b['question_id'] ?? 0),
                ':sel' => $b['selected'] ?? null,
                ':ok' => !empty($b['is_correct']) ? 1 : 0,
                ':skip' => !empty($b['skipped']) ? 1 : 0,
                ':ms' => isset($b['time_ms']) && $b['time_ms'] !== null ? (int)$b['time_ms'] : null,
            ]);
            nb_json(['ok' => true]);
        } catch (Throwable $e) {
            nb_json(['ok' => false, 'error' => $e->getMessage()], 500);
        }
        break;

    case 'keypoint_progress_save':
        $userId = nb_current_user_id();
        if ($userId === null) {
            nb_json(['ok' => false, 'error' => 'Not signed in'], 401);
        }
        try {
            $b = nb_body();
            $params = [
                ':uid' => $userId,
                ':slug' => (string)($b['chapter_slug'] ?? ''),
                ':topic' => (string)($b['topic_key'] ?? ''),
                ':idx' => (int)($b['step_index'] ?? 0),
                ':total' => (int)($b['steps_total'] ?? 0),
                ':done' => !empty($b['completed']) ? 1 : 0,
            ];
            $upd = $pdo->prepare(
                'UPDATE ncert_keypoint_progress
                 SET step_index = :idx, steps_total = :total, completed = :done, updated_at = NOW()
                 WHERE user_id = :uid AND chapter_slug = :slug AND topic_key = :topic'
            );
            $upd->execute($params);
            if ($upd->rowCount() === 0) {
                $chk = $pdo->prepare(
                    'SELECT 1 FROM ncert_keypoint_progress WHERE user_id = :uid AND chapter_slug = :slug AND topic_key = :topic LIMIT 1'
                );
                $chk->execute([':uid' => $params[':uid'], ':slug' => $params[':slug'], ':topic' => $params[':topic']]);
                if (!$chk->fetch()) {
                    $ins = $pdo->prepare(
                        'INSERT INTO ncert_keypoint_progress
                            (user_id, chapter_slug, topic_key, step_index, steps_total, completed, updated_at)
                         VALUES (:uid, :slug, :topic, :idx, :total, :done, NOW())'
                    );
                    $ins->execute($params);
                }
            }
            nb_json(['ok' => true]);
        } catch (Throwable $e) {
            nb_json(['ok' => false, 'error' => $e->getMessage()], 500);
        }
        break;

    case 'keypoint_progress':
        $userId = nb_current_user_id();
        if ($userId === null) {
            nb_json(['progress' => []]);
        }
        try {
            $stmt = $pdo->prepare(
                'SELECT topic_key, step_index, steps_total, completed
                 FROM ncert_keypoint_progress WHERE user_id = :uid AND chapter_slug = :slug'
            );
            $stmt->execute([':uid' => $userId, ':slug' => (string)($_GET['chapter_slug'] ?? '')]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as &$r) {
                $r['step_index'] = (int)$r['step_index'];
                $r['steps_total'] = (int)$r['steps_total'];
                $r['completed'] = (bool)$r['completed'];
            }
            nb_json(['progress' => $rows]);
        } catch (Throwable $e) {
            nb_json(['progress' => [], 'error' => $e->getMessage()]);
        }
        break;

    case 'keypoint_answers':
        $userId = nb_current_user_id();
        if ($userId === null) {
            nb_json(['answers' => []]);
        }
        try {
            $stmt = $pdo->prepare(
                'SELECT chapter_slug, topic_key, block_id, source, question_id, selected,
                        is_correct, skipped, time_ms, answered_at
                 FROM ncert_keypoint_answers
                 WHERE user_id = :uid AND chapter_slug = :slug ORDER BY answered_at ASC'
            );
            $stmt->execute([':uid' => $userId, ':slug' => (string)($_GET['chapter_slug'] ?? '')]);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as &$r) {
                $r['block_id'] = $r['block_id'] === null ? null : (int)$r['block_id'];
                $r['question_id'] = (int)$r['question_id'];
                $r['is_correct'] = (bool)$r['is_correct'];
                $r['skipped'] = (bool)$r['skipped'];
                $r['time_ms'] = $r['time_ms'] === null ? null : (int)$r['time_ms'];
            }
            nb_json(['answers' => $rows]);
        } catch (Throwable $e) {
            nb_json(['answers' => [], 'error' => $e->getMessage()]);
        }
        break;

    case 'keypoint_stats':
        $userId = nb_current_user_id();
        if ($userId === null) {
            nb_json(['stats' => []]);
        }
        try {
            $stmt = $pdo->prepare(
                'SELECT chapter_slug,
                        COUNT(DISTINCT CONCAT(source, ":", question_id)) AS attempted,
                        COUNT(DISTINCT CASE WHEN is_correct = 1 THEN CONCAT(source, ":", question_id) END) AS correct
                 FROM ncert_keypoint_answers WHERE user_id = :uid GROUP BY chapter_slug'
            );
            $stmt->execute([':uid' => $userId]);
            $out = [];
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $out[(string)$r['chapter_slug']] = [
                    'attempted' => (int)$r['attempted'],
                    'correct' => (int)$r['correct'],
                ];
            }
            nb_json(['stats' => (object)$out]);
        } catch (Throwable $e) {
            nb_json(['stats' => (object)[], 'error' => $e->getMessage()]);
        }
        break;

    default:
        nb_json(['status' => 'ok']);
        break;
}
