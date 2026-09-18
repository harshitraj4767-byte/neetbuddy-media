<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
$userId = $user['id'] ?? null;

$attemptId = $_GET['attempt_id'] ?? $_GET['id'] ?? null;
if (!$attemptId) {
    nb_fail('Missing attempt_id', 400);
}

try {
    // 1. Fetch attempt
    $stmt = $pdo->prepare('SELECT * FROM attempts WHERE id = ? LIMIT 1');
    $stmt->execute([$attemptId]);
    $attempt = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$attempt) {
        nb_fail('Attempt not found', 404);
    }

    if (is_string($attempt['answers'] ?? null)) {
        $attempt['answers'] = json_decode($attempt['answers'], true) ?: [];
    }
    if (is_string($attempt['bookmarks'] ?? null)) {
        $attempt['bookmarks'] = json_decode($attempt['bookmarks'], true) ?: [];
    }

    // 2. Fetch test
    $tStmt = $pdo->prepare('SELECT * FROM tests WHERE id = ? LIMIT 1');
    $tStmt->execute([$attempt['test_id']]);
    $test = $tStmt->fetch(PDO::FETCH_ASSOC);

    if ($test && is_string($test['question_ids'] ?? null)) {
        $test['question_ids'] = json_decode($test['question_ids'], true) ?: [];
    }

    // 3. Fetch questions
    $questions = [];
    $subjects = [];
    $chapters = [];
    $qids = $test['question_ids'] ?? [];

    if (!empty($qids) && is_array($qids)) {
        $placeholders = implode(',', array_fill(0, count($qids), '?'));
        $qStmt = $pdo->prepare("SELECT * FROM qb_questions WHERE id IN ($placeholders)");
        $qStmt->execute(array_values($qids));
        $rawQs = $qStmt->fetchAll(PDO::FETCH_ASSOC);

        $qMap = [];
        $subjIds = [];
        $chapIds = [];

        foreach ($rawQs as $q) {
            $opts = $q['options'] ?? [];
            if (is_string($opts)) {
                $opts = json_decode($opts, true) ?: [];
            }
            $optList = [];
            if (is_array($opts)) {
                foreach ($opts as $o) {
                    if (is_string($o)) {
                        $optList[] = $o;
                    } elseif (is_array($o)) {
                        $optList[] = $o['text'] ?? $o['html'] ?? $o['value'] ?? '';
                    }
                }
            }

            $item = [
                'id' => (string)$q['id'],
                'text' => $q['question_html'] ?? $q['text'] ?? '',
                'options' => $optList,
                'correct_index' => (int)($q['correct_index'] ?? 0),
                'difficulty' => $q['difficulty'] ?? 'medium',
                'source' => $q['tag'] ?? 'NEET',
                'marks_correct' => 4,
                'marks_wrong' => -1,
                'explanation' => $q['explanation'] ?? null,
                'subject_id' => $q['subject_id'] ? (string)$q['subject_id'] : null,
                'chapter_id' => $q['chapter_id'] ? (string)$q['chapter_id'] : null,
                'question_image_url' => $q['question_image_url'] ?? null,
                'explanation_image_url' => $q['explanation_image_url'] ?? null,
            ];
            $qMap[(string)$q['id']] = $item;

            if (!empty($item['subject_id'])) $subjIds[$item['subject_id']] = true;
            if (!empty($item['chapter_id'])) $chapIds[$item['chapter_id']] = true;
        }

        // Preserve test question order
        foreach ($qids as $qid) {
            $sid = (string)$qid;
            if (isset($qMap[$sid])) {
                $questions[] = $qMap[$sid];
            }
        }

        // Fetch subjects
        if (!empty($subjIds)) {
            $sPlaceholders = implode(',', array_fill(0, count($subjIds), '?'));
            $sStmt = $pdo->prepare("SELECT id, name FROM qb_subjects WHERE id IN ($sPlaceholders)");
            $sStmt->execute(array_keys($subjIds));
            foreach ($sStmt->fetchAll(PDO::FETCH_ASSOC) as $s) {
                $subjects[(string)$s['id']] = $s['name'];
            }
        }

        // Fetch chapters
        if (!empty($chapIds)) {
            $cPlaceholders = implode(',', array_fill(0, count($chapIds), '?'));
            $cStmt = $pdo->prepare("SELECT id, name FROM qb_chapters WHERE id IN ($cPlaceholders)");
            $cStmt->execute(array_keys($chapIds));
            foreach ($cStmt->fetchAll(PDO::FETCH_ASSOC) as $c) {
                $chapters[(string)$c['id']] = $c['name'];
            }
        }
    }

    // 4. Fetch reasons
    $reasons = [];
    try {
        $rStmt = $pdo->prepare('SELECT question_id, wrong_reason FROM attempt_answers WHERE attempt_id = ? AND wrong_reason IS NOT NULL');
        $rStmt->execute([$attemptId]);
        foreach ($rStmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $reasons[(string)$r['question_id']] = $r['wrong_reason'];
        }
    } catch (Throwable $e) {}

    nb_json([
        'success' => true,
        'attempt' => $attempt,
        'test' => $test,
        'questions' => $questions,
        'subjects' => (object)$subjects,
        'chapters' => (object)$chapters,
        'reasons' => (object)$reasons,
    ]);

} catch (Throwable $e) {
    nb_fail($e->getMessage(), 500);
}
