<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
$userId = $user['id'] ?? null;

$action = $_GET['action'] ?? $_POST['action'] ?? 'decks';
$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

switch ($action) {
    case 'decks':
    case 'list_decks':
        try {
            $stmt = $pdo->query('
                SELECT d.id, d.title, d.subject, d.description,
                       COALESCE(d.card_count, (SELECT COUNT(*) FROM flashcards f WHERE f.deck_id = d.id)) AS count
                FROM flashcard_decks d
                WHERE d.is_active = 1 OR d.is_active IS NULL
                ORDER BY d.sort_order ASC, d.title ASC
            ');
            $decks = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            try {
                $stmt = $pdo->query('
                    SELECT subject, COUNT(*) as count
                    FROM flashcards
                    GROUP BY subject
                ');
                $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $decks = [];
                foreach ($rows as $r) {
                    $sub = strtolower((string)$r['subject']);
                    $decks[] = [
                        'id' => $sub,
                        'title' => ucfirst($sub) . ' Core Flashcards',
                        'subject' => $sub,
                        'description' => 'Key NEET definitions and formulas for ' . ucfirst($sub),
                        'count' => (int)$r['count']
                    ];
                }
            } catch (Throwable $e2) {
                $decks = [];
            }
        }
        $totalCards = 0;
        foreach ($decks as $d) {
            $totalCards += (int)($d['count'] ?? 0);
        }
        nb_json(['decks' => $decks, 'totalCards' => $totalCards]);
        break;

    case 'cards':
    case 'list_cards':
        $deckId = $_GET['deck_id'] ?? $input['deck_id'] ?? null;
        $subject = $_GET['subject'] ?? $input['subject'] ?? null;
        $offset = (int)($_GET['offset'] ?? $input['offset'] ?? 0);
        $limit = min((int)($_GET['limit'] ?? $input['limit'] ?? 100), 200);

        try {
            $where = ['1=1'];
            $params = [];
            if ($deckId) {
                $where[] = '(deck_id = :did OR subject = :did)';
                $params[':did'] = $deckId;
            }
            if ($subject) {
                $where[] = 'subject = :sub';
                $params[':sub'] = $subject;
            }
            $sql = 'SELECT id, deck_id, front, back, front_body, back_body, hint, tags, difficulty, source, position 
                    FROM flashcards WHERE ' . implode(' AND ', $where) . ' 
                    ORDER BY position ASC, id ASC LIMIT ' . $limit . ' OFFSET ' . $offset;
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $cards = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($cards as &$c) {
                if (!empty($c['front_body']) && is_string($c['front_body'])) {
                    $c['front_body'] = json_decode($c['front_body'], true) ?: null;
                }
                if (!empty($c['back_body']) && is_string($c['back_body'])) {
                    $c['back_body'] = json_decode($c['back_body'], true) ?: null;
                }
                if (!empty($c['tags']) && is_string($c['tags'])) {
                    $c['tags'] = json_decode($c['tags'], true) ?: explode(',', $c['tags']);
                } else if (!isset($c['tags'])) {
                    $c['tags'] = [];
                }
            }
            nb_json(['cards' => $cards, 'count' => count($cards)]);
        } catch (Throwable $e) {
            nb_json(['cards' => [], 'error' => $e->getMessage()]);
        }
        break;

    case 'review':
        $cardId = $input['card_id'] ?? '';
        $rating = (int)($input['rating'] ?? 0);
        if (!$cardId || $rating < 1 || $rating > 3) {
            nb_fail('card_id and rating (1-3) required');
        }
        if ($userId) {
            try {
                $stmt = $pdo->prepare('INSERT INTO flashcard_reviews (user_id, card_id, rating, reviewed_at) VALUES (?, ?, ?, NOW())');
                $stmt->execute([$userId, $cardId, $rating]);
            } catch (Throwable $ignore) {}
        }
        nb_json(['success' => true]);
        break;

    default:
        nb_json(['status' => 'ok']);
        break;
}
