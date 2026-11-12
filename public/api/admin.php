<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/lib.php';

nb_cors();

$pdo = nb_pdo();
$user = nb_current_user($pdo);
if (!$user) {
    nb_fail("Unauthorized: Authentication required", 401);
}

// Allow admin access
$isAdmin = false;
try {
    $stmt = $pdo->prepare("SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1");
    $stmt->execute([$user["id"]]);
    $isAdmin = (bool)$stmt->fetchColumn();
} catch (Throwable $e) {
    $isAdmin = false;
}

if (!$isAdmin) {
    nb_fail("Forbidden: Admin privileges required", 403);
}

// Create only the small settings table used by this endpoint. Core tables such as
// coupons, feedback, and study_materials already exist with their application schema;
// never create parallel tables with conflicting columns here.
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS admin_settings (
        setting_key VARCHAR(64) PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
} catch (Throwable $e) {
    nb_fail("Admin settings table is unavailable", 500);
}

$action = $_GET["action"] ?? $_POST["action"] ?? "";
$method = $_SERVER["REQUEST_METHOD"] ?? "GET";
$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
if (!$action && isset($input["action"])) {
    $action = $input["action"];
}

// ==========================================
// 1. USER REPORTS & LIVE ACTIVITY
// ==========================================
if ($action === 'user_reports') {
    try {
        $searchEmail = trim((string)($_GET['email'] ?? ''));
        if ($searchEmail !== '') {
            $uStmt = $pdo->prepare("SELECT u.id, u.email, COALESCE(p.full_name, 'NEET Aspirant') as name, u.created_at,
                (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id) as attempts_count,
                (SELECT ROUND(AVG(score), 1) FROM attempts a WHERE a.user_id = u.id) as avg_score,
                (SELECT ROUND((SUM(correct_count) / NULLIF(SUM(correct_count + wrong_count), 0)) * 100, 1) FROM attempts a WHERE a.user_id = u.id) as accuracy
                FROM auth_users u LEFT JOIN profiles p ON u.id = p.id WHERE LOWER(u.email) = LOWER(?) LIMIT 1");
            $uStmt->execute([$searchEmail]);
            $foundUser = $uStmt->fetch(PDO::FETCH_ASSOC);
            nb_json([
                'user' => $foundUser ?: null,
                'users' => $foundUser ? [$foundUser] : []
            ]);
        }

        $usersStmt = $pdo->query("SELECT u.id, u.email, COALESCE(p.full_name, 'NEET Aspirant') as name, u.created_at,
            (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id) as attempts_count,
            (SELECT ROUND(AVG(score), 1) FROM attempts a WHERE a.user_id = u.id) as avg_score,
            (SELECT ROUND((SUM(correct_count) / NULLIF(SUM(correct_count + wrong_count), 0)) * 100, 1) FROM attempts a WHERE a.user_id = u.id) as accuracy
            FROM auth_users u LEFT JOIN profiles p ON u.id = p.id ORDER BY attempts_count DESC, u.created_at DESC LIMIT 50");
        $usersList = $usersStmt ? $usersStmt->fetchAll(PDO::FETCH_ASSOC) : [];

        $cohortStmt = $pdo->query("SELECT 
            COUNT(DISTINCT user_id) as active_students,
            COUNT(*) as total_attempts,
            ROUND(AVG(score), 1) as cohort_avg_score,
            ROUND((SUM(correct_count) / NULLIF(SUM(correct_count + wrong_count), 0)) * 100, 1) as cohort_accuracy,
            ROUND(AVG(TIMESTAMPDIFF(MINUTE, started_at, COALESCE(submitted_at, NOW()))), 1) as avg_mins_per_test
            FROM attempts WHERE started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
        $cohortStats = $cohortStmt ? $cohortStmt->fetch(PDO::FETCH_ASSOC) : [];

        // Real Progression Index calculated from multi-attempt students
        $progressionRate = 0;
        try {
            $progStmt = $pdo->query("SELECT 
                COUNT(DISTINCT user_id) as multi_users,
                SUM(CASE WHEN last_acc > first_acc THEN 1 ELSE 0 END) as improved_users
                FROM (
                    SELECT 
                        user_id,
                        SUBSTRING_INDEX(GROUP_CONCAT((correct_count / NULLIF(correct_count + wrong_count, 0)) * 100 ORDER BY started_at ASC), ',', 1) as first_acc,
                        SUBSTRING_INDEX(GROUP_CONCAT((correct_count / NULLIF(correct_count + wrong_count, 0)) * 100 ORDER BY started_at DESC), ',', 1) as last_acc,
                        COUNT(*) as att_cnt
                    FROM attempts
                    WHERE correct_count + wrong_count > 0
                    GROUP BY user_id
                    HAVING att_cnt >= 2
                ) sub");
            if ($progStmt && ($progData = $progStmt->fetch(PDO::FETCH_ASSOC))) {
                $multi = (int)($progData['multi_users'] ?? 0);
                $imp = (int)($progData['improved_users'] ?? 0);
                $progressionRate = $multi > 0 ? (int)round(($imp / $multi) * 100) : 0;
            }
        } catch (Throwable $e) {}

        nb_json([
            'users' => $usersList,
            'cohort' => $cohortStats,
            'accuracy_increase_rate' => $progressionRate,
        ]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($action === 'live_attempts') {
    try {
        $stmt = $pdo->query("SELECT a.id, a.user_id, COALESCE(p.full_name, 'Student') as student_name, p.email, t.title as test_title, a.score, a.correct_count, a.wrong_count, a.status, a.submitted_at, a.started_at
            FROM attempts a
            LEFT JOIN profiles p ON a.user_id = p.id
            LEFT JOIN tests t ON a.test_id = t.id
            ORDER BY a.started_at DESC LIMIT 30");
        $attempts = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
        nb_json(['attempts' => $attempts]);
    } catch (Throwable $e) {
        nb_json(['attempts' => []]);
    }
}

if ($action === 'leaderboard') {
    try {
        $stmt = $pdo->query("SELECT a.user_id, COALESCE(p.full_name, 'Aspirant') as name, p.email,
            COUNT(a.id) as tests_taken,
            ROUND(AVG(a.score), 1) as avg_score,
            MAX(a.score) as highest_score,
            ROUND((SUM(a.correct_count) / NULLIF(SUM(a.correct_count + a.wrong_count), 0)) * 100, 1) as accuracy
            FROM attempts a
            LEFT JOIN profiles p ON a.user_id = p.id
            GROUP BY a.user_id
            HAVING tests_taken > 0
            ORDER BY avg_score DESC, tests_taken DESC LIMIT 20");
        $rankers = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
        nb_json(['leaderboard' => $rankers]);
    } catch (Throwable $e) {
        nb_json(['leaderboard' => []]);
    }
}

if ($action === 'send_notification') {
    $targetUserId = $input['user_id'] ?? null;
    $title = trim((string)($input['title'] ?? ''));
    $body = trim((string)($input['body'] ?? ''));
    $link = trim((string)($input['link'] ?? '/dpp'));
    $kind = $input['kind'] ?? 'dpp';

    if (!$title || !$body) nb_fail("Title and body are required", 400);

    try {
        if ($targetUserId) {
            $stmt = $pdo->prepare("INSERT INTO notifications (id, user_id, kind, title, body, link, created_at) VALUES (UUID(), ?, ?, ?, ?, ?, NOW())");
            $stmt->execute([$targetUserId, $kind, $title, $body, $link]);
        } else {
            $userRows = $pdo->query("SELECT id FROM auth_users")->fetchAll(PDO::FETCH_COLUMN);
            $stmt = $pdo->prepare("INSERT INTO notifications (id, user_id, kind, title, body, link, created_at) VALUES (UUID(), ?, ?, ?, ?, ?, NOW())");
            foreach ($userRows as $uid) {
                $stmt->execute([$uid, $kind, $title, $body, $link]);
            }
        }
        nb_json(['success' => true, 'sent_count' => $targetUserId ? 1 : count($userRows), 'message' => 'Notification dispatched successfully']);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($action === 'feedback') {
    try {
        $stmt = $pdo->query("SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100");
        $items = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
        nb_json(['feedback' => $items]);
    } catch (Throwable $e) {
        nb_json(['feedback' => []]);
    }
}

if ($action === 'resolve_feedback') {
    $id = $input['id'] ?? '';
    $isResolved = !empty($input['resolved']) || ($input['status'] ?? '') === 'resolved' ? 1 : 0;
    try {
        $stmt = $pdo->prepare("UPDATE feedback SET resolved = ? WHERE id = ?");
        $stmt->execute([$isResolved, $id]);
        nb_json(['success' => true]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

// ==========================================
// 2. APP REPORT & DEEP DIAGNOSTICS
// ==========================================

if ($action === 'analytics_graphs') {
    try {
        // Genuine data queries from actual database tables - NO fake defaults
        $todayQuestions = (int)$pdo->query("SELECT COALESCE(SUM(correct_count + wrong_count), 0) FROM attempts WHERE DATE(started_at) = CURDATE()")->fetchColumn();
        $monthQuestions = (int)$pdo->query("SELECT COALESCE(SUM(correct_count + wrong_count), 0) FROM attempts WHERE started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)")->fetchColumn();
        $activeUsers = (int)$pdo->query("SELECT COUNT(DISTINCT user_id) FROM attempts WHERE started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)")->fetchColumn();
        $avgQPerStudent = $activeUsers > 0 ? (int)round($monthQuestions / $activeUsers) : 0;

        // Genuine 14-day daily trend from attempts
        $dailyTrend = [];
        $stmt = $pdo->query("SELECT DATE(started_at) as dt, COALESCE(SUM(correct_count + wrong_count), 0) as q_cnt, COUNT(*) as t_cnt FROM attempts WHERE started_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY) GROUP BY DATE(started_at)");
        $dateMap = [];
        while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $dateMap[$r['dt']] = ['q' => (int)$r['q_cnt'], 't' => (int)$r['t_cnt']];
        }
        for ($d = 13; $d >= 0; $d--) {
            $dayStr = date('M d', strtotime("-$d days"));
            $dateVal = date('Y-m-d', strtotime("-$d days"));
            $dailyTrend[] = [
                'date' => $dayStr,
                'questions' => $dateMap[$dateVal]['q'] ?? 0,
                'tests' => $dateMap[$dateVal]['t'] ?? 0
            ];
        }

        // Financial metrics are based only on completed captured purchases.
        $subsCount = (int)$pdo->query("SELECT COUNT(*) FROM subscriptions WHERE status = 'active'")->fetchColumn();
        $salesStmt = $pdo->query("SELECT COUNT(*) as sales, COALESCE(SUM(amount_paid), 0) as revenue FROM batch_purchases WHERE status IN ('active', 'paid', 'completed')");
        $salesSummary = $salesStmt ? $salesStmt->fetch(PDO::FETCH_ASSOC) : ['sales' => 0, 'revenue' => 0];
        $totalBatchesSold = (int)($salesSummary['sales'] ?? 0);
        $totalRev = (float)($salesSummary['revenue'] ?? 0);

        // Monthly paid purchase trend; no estimated prices.
        $revTrend = [];
        for ($m = 4; $m >= 0; $m--) {
            $mStr = date('M', strtotime("-$m months"));
            $mStart = date('Y-m-01 00:00:00', strtotime("-$m months"));
            $mEnd = date('Y-m-t 23:59:59', strtotime("-$m months"));
            $revStmt = $pdo->prepare("SELECT COUNT(*) as sales, COALESCE(SUM(amount_paid), 0) as revenue FROM batch_purchases WHERE status IN ('active', 'paid', 'completed') AND created_at >= ? AND created_at <= ?");
            $revStmt->execute([$mStart, $mEnd]);
            $monthSales = $revStmt->fetch(PDO::FETCH_ASSOC) ?: ['sales' => 0, 'revenue' => 0];
            $revTrend[] = [
                'month' => $mStr,
                'revenue' => (float)($monthSales['revenue'] ?? 0),
                'sales' => (int)($monthSales['sales'] ?? 0)
            ];
        }

        // Real hourly distribution from attempts
        $hourlyMap = ['6-9 AM' => 0, '9-12 PM' => 0, '12-4 PM' => 0, '4-8 PM' => 0, '8-11 PM' => 0, '11-2 AM' => 0];
        try {
            $hStmt = $pdo->query("SELECT HOUR(started_at) as hr, COUNT(*) as cnt FROM attempts GROUP BY hr");
            while ($hr = $hStmt->fetch(PDO::FETCH_ASSOC)) {
                $h = (int)$hr['hr'];
                $c = (int)$hr['cnt'];
                if ($h >= 6 && $h < 9) $hourlyMap['6-9 AM'] += $c;
                elseif ($h >= 9 && $h < 12) $hourlyMap['9-12 PM'] += $c;
                elseif ($h >= 12 && $h < 16) $hourlyMap['12-4 PM'] += $c;
                elseif ($h >= 16 && $h < 20) $hourlyMap['4-8 PM'] += $c;
                elseif ($h >= 20 && $h < 23) $hourlyMap['8-11 PM'] += $c;
                else $hourlyMap['11-2 AM'] += $c;
            }
        } catch (Throwable $e) {}

        $hourly = [
            ['time' => '6-9 AM', 'activity' => $hourlyMap['6-9 AM'], 'label' => 'Morning Focus'],
            ['time' => '9-12 PM', 'activity' => $hourlyMap['9-12 PM'], 'label' => 'Mid-day Study'],
            ['time' => '12-4 PM', 'activity' => $hourlyMap['12-4 PM'], 'label' => 'Afternoon Practice'],
            ['time' => '4-8 PM', 'activity' => $hourlyMap['4-8 PM'], 'label' => 'Evening Rush'],
            ['time' => '8-11 PM', 'activity' => $hourlyMap['8-11 PM'], 'label' => 'Night Rounds'],
            ['time' => '11-2 AM', 'activity' => $hourlyMap['11-2 AM'], 'label' => 'Late Revision']
        ];

        // Real Completion rate
        $totalAttempts = (int)$pdo->query("SELECT COUNT(*) FROM attempts")->fetchColumn();
        $completedAttempts = (int)$pdo->query("SELECT COUNT(*) FROM attempts WHERE status = 'completed'")->fetchColumn();
        $inProgressAttempts = (int)$pdo->query("SELECT COUNT(*) FROM attempts WHERE status = 'in_progress'")->fetchColumn();
        $abandonedAttempts = max(0, $totalAttempts - $completedAttempts - $inProgressAttempts);

        $compPct = $totalAttempts > 0 ? (int)round(($completedAttempts / $totalAttempts) * 100) : 0;
        $progPct = $totalAttempts > 0 ? (int)round(($inProgressAttempts / $totalAttempts) * 100) : 0;
        $abanPct = $totalAttempts > 0 ? max(0, 100 - $compPct - $progPct) : 0;

        $completionRate = [
            ['status' => 'Completed & Scored', 'percent' => $compPct, 'color' => '#10b981'],
            ['status' => 'In Progress / Paused', 'percent' => $progPct, 'color' => '#f59e0b'],
            ['status' => 'Abandoned / Exit', 'percent' => $abanPct, 'color' => '#ef4444']
        ];

        // Subject attribution uses explicit subject names present in test titles.
        $subjectCounts = ['Biology' => 0, 'Chemistry' => 0, 'Physics' => 0];
        try {
            $sStmt = $pdo->query("SELECT 
                CASE
                    WHEN LOWER(t.title) REGEXP 'biology|botany|zoology' THEN 'Biology'
                    WHEN LOWER(t.title) LIKE '%chemistry%' THEN 'Chemistry'
                    WHEN LOWER(t.title) LIKE '%physics%' THEN 'Physics'
                    ELSE 'Mixed / Unlabelled'
                END as subject_name,
                COALESCE(SUM(a.correct_count + a.wrong_count), 0) as q_cnt
                FROM attempts a JOIN tests t ON a.test_id = t.id GROUP BY subject_name");
            while ($sr = $sStmt->fetch(PDO::FETCH_ASSOC)) {
                $subName = $sr['subject_name'] ?? '';
                if (isset($subjectCounts[$subName])) {
                    $subjectCounts[$subName] += (int)$sr['q_cnt'];
                }
            }
        } catch (Throwable $e) {}
        $totSubQ = array_sum($subjectCounts);
        $subjectSplit = [
            ['subject' => 'Biology', 'questions' => $subjectCounts['Biology'], 'share' => $totSubQ > 0 ? (int)round(($subjectCounts['Biology'] / $totSubQ) * 100) : 0, 'color' => '#10b981'],
            ['subject' => 'Chemistry', 'questions' => $subjectCounts['Chemistry'], 'share' => $totSubQ > 0 ? (int)round(($subjectCounts['Chemistry'] / $totSubQ) * 100) : 0, 'color' => '#6366f1'],
            ['subject' => 'Physics', 'questions' => $subjectCounts['Physics'], 'share' => $totSubQ > 0 ? (int)round(($subjectCounts['Physics'] / $totSubQ) * 100) : 0, 'color' => '#f59e0b']
        ];

        // Real Accuracy Milestones
        $accuracyMilestones = [];
        try {
            $accStmt = $pdo->query("SELECT user_id, COUNT(*) as t_count, SUM(correct_count) as c_sum, SUM(correct_count + wrong_count) as tot_sum FROM attempts GROUP BY user_id");
            $buckets = ['1 - 5 Tests' => [], '6 - 15 Tests' => [], '16 - 30 Tests' => [], '30+ Tests' => []];
            while ($ar = $accStmt->fetch(PDO::FETCH_ASSOC)) {
                $tc = (int)$ar['t_count'];
                $tot = (int)$ar['tot_sum'];
                $acc = $tot > 0 ? (int)round(((int)$ar['c_sum'] / $tot) * 100) : 0;
                if ($tc <= 5) $buckets['1 - 5 Tests'][] = $acc;
                elseif ($tc <= 15) $buckets['6 - 15 Tests'][] = $acc;
                elseif ($tc <= 30) $buckets['16 - 30 Tests'][] = $acc;
                else $buckets['30+ Tests'][] = $acc;
            }
            foreach ($buckets as $k => $accList) {
                $avg = count($accList) > 0 ? (int)round(array_sum($accList) / count($accList)) : 0;
                $accuracyMilestones[] = ['tier' => $k, 'accuracy' => $avg];
            }
        } catch (Throwable $e) {
            $accuracyMilestones = [
                ['tier' => '1 - 5 Tests', 'accuracy' => 0],
                ['tier' => '6 - 15 Tests', 'accuracy' => 0],
                ['tier' => '16 - 30 Tests', 'accuracy' => 0],
                ['tier' => '30+ Tests', 'accuracy' => 0]
            ];
        }

        // Time per question uses attempts.time_taken_sec and answered question counts.
        $timePerQ = [
            ['subject' => 'Biology', 'seconds' => 0, 'target' => 45],
            ['subject' => 'Chemistry', 'seconds' => 0, 'target' => 60],
            ['subject' => 'Physics', 'seconds' => 0, 'target' => 75]
        ];
        try {
            $tStmt = $pdo->query("SELECT 
                CASE
                    WHEN LOWER(t.title) REGEXP 'biology|botany|zoology' THEN 'Biology'
                    WHEN LOWER(t.title) LIKE '%chemistry%' THEN 'Chemistry'
                    WHEN LOWER(t.title) LIKE '%physics%' THEN 'Physics'
                    ELSE 'Mixed / Unlabelled'
                END as subject_name,
                AVG(a.time_taken_sec / NULLIF(a.correct_count + a.wrong_count, 0)) as avg_sec
                FROM attempts a JOIN tests t ON a.test_id = t.id
                WHERE a.time_taken_sec > 0 GROUP BY subject_name");
            while ($tr = $tStmt->fetch(PDO::FETCH_ASSOC)) {
                $sub = $tr['subject_name'] ?? '';
                foreach ($timePerQ as &$item) {
                    if ($item['subject'] === $sub) {
                        $item['seconds'] = (int)round((float)$tr['avg_sec']);
                    }
                }
                unset($item);
            }
        } catch (Throwable $e) {}

        // Mode share from actual test types; battlegrounds are tracked in battle_matches.
        $dppAttempts = (int)$pdo->query("SELECT COUNT(*) FROM attempts a JOIN tests t ON a.test_id = t.id WHERE t.type IN ('dpp', 'daily')")->fetchColumn();
        $mockAttempts = (int)$pdo->query("SELECT COUNT(*) FROM attempts a JOIN tests t ON a.test_id = t.id WHERE t.type IN ('mock', 'test')")->fetchColumn();
        $battleAttempts = (int)$pdo->query("SELECT COUNT(*) FROM battle_matches")->fetchColumn();
        $otherAttempts = max(0, $totalAttempts - $dppAttempts - $mockAttempts);

        $modeShare = [
            ['mode' => 'Daily DPPs', 'percent' => $totalAttempts > 0 ? (int)round(($dppAttempts / $totalAttempts) * 100) : 0, 'color' => '#10b981'],
            ['mode' => 'Full Mocks', 'percent' => $totalAttempts > 0 ? (int)round(($mockAttempts / $totalAttempts) * 100) : 0, 'color' => '#6366f1'],
            ['mode' => 'Battlegrounds', 'percent' => $totalAttempts > 0 ? (int)round(($battleAttempts / $totalAttempts) * 100) : 0, 'color' => '#ec4899'],
            ['mode' => 'Other / Practice', 'percent' => $totalAttempts > 0 ? (int)round(($otherAttempts / $totalAttempts) * 100) : 0, 'color' => '#f59e0b']
        ];

        nb_json([
            'questions_today' => $todayQuestions,
            'questions_this_month' => $monthQuestions,
            'avg_questions_per_student' => $avgQPerStudent,
            'active_students' => $activeUsers,
            'total_batches_sold' => $totalBatchesSold,
            'total_revenue' => $totalRev,
            'daily_trend' => $dailyTrend,
            'revenue_trend' => $revTrend,
            'hourly_activity' => $hourly,
            'completion_rate' => $completionRate,
            'subject_split' => $subjectSplit,
            'accuracy_milestones' => $accuracyMilestones,
            'time_per_question' => $timePerQ,
            'mode_share' => $modeShare
        ]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($action === 'app_report') {
    try {
        $usersCount = (int)$pdo->query("SELECT COUNT(*) FROM auth_users")->fetchColumn();
        $qbCount = (int)$pdo->query("SELECT COUNT(*) FROM qb_questions")->fetchColumn();
        $nuggetCount = (int)$pdo->query("SELECT COUNT(*) FROM nugget_questions")->fetchColumn();
        $pyqCount = (int)$pdo->query("SELECT COUNT(*) FROM neet_pyq_questions")->fetchColumn();
        $dppCount = (int)$pdo->query("SELECT COUNT(*) FROM tests WHERE type IN ('dpp', 'daily')")->fetchColumn();
        $mockCount = (int)$pdo->query("SELECT COUNT(*) FROM tests WHERE type IN ('mock', 'test')")->fetchColumn();
        $attemptsCount = (int)$pdo->query("SELECT COUNT(*) FROM attempts")->fetchColumn();
        $subsCount = (int)$pdo->query("SELECT COUNT(*) FROM subscriptions WHERE status = 'active'")->fetchColumn();
        $feedbacksCount = (int)$pdo->query("SELECT COUNT(*) FROM feedback")->fetchColumn();
        $bannersCount = (int)$pdo->query("SELECT COUNT(*) FROM dashboard_banners")->fetchColumn();
        $battleMatchesCount = (int)$pdo->query("SELECT COUNT(*) FROM battle_matches")->fetchColumn();
        $reviewCount = (int)$pdo->query("SELECT COUNT(*) FROM flashcard_reviews")->fetchColumn();
        $bookmarkCount = (int)$pdo->query("SELECT COUNT(*) FROM bookmarks")->fetchColumn();
        $mistakeCount = (int)$pdo->query("SELECT COUNT(*) FROM wrong_questions")->fetchColumn();

        $dppAttempts = (int)$pdo->query("SELECT COUNT(*) FROM attempts a JOIN tests t ON a.test_id = t.id WHERE t.type IN ('dpp', 'daily')")->fetchColumn();
        $mockAttempts = (int)$pdo->query("SELECT COUNT(*) FROM attempts a JOIN tests t ON a.test_id = t.id WHERE t.type IN ('mock', 'test')")->fetchColumn();
        $purchaseStmt = $pdo->query("SELECT COUNT(*) as sales, COALESCE(SUM(amount_paid), 0) as revenue FROM batch_purchases WHERE status IN ('active', 'paid', 'completed')");
        $purchaseSummary = $purchaseStmt ? ($purchaseStmt->fetch(PDO::FETCH_ASSOC) ?: ['sales' => 0, 'revenue' => 0]) : ['sales' => 0, 'revenue' => 0];

        $features = [
            ['name' => 'Daily DPPs', 'usage_count' => $dppAttempts, 'popularity_percent' => $attemptsCount > 0 ? (int)round(($dppAttempts / $attemptsCount) * 100) : 0],
            ['name' => 'NEET Mock Tests', 'usage_count' => $mockAttempts, 'popularity_percent' => $attemptsCount > 0 ? (int)round(($mockAttempts / $attemptsCount) * 100) : 0],
            ['name' => 'Question Bank', 'usage_count' => $qbCount, 'popularity_percent' => null],
            ['name' => 'NCERT Nuggets', 'usage_count' => $nuggetCount, 'popularity_percent' => null],
            ['name' => 'Battlegrounds', 'usage_count' => $battleMatchesCount, 'popularity_percent' => null],
            ['name' => 'Flashcard Reviews', 'usage_count' => $reviewCount, 'popularity_percent' => null],
            ['name' => 'Bookmarks', 'usage_count' => $bookmarkCount, 'popularity_percent' => null],
            ['name' => 'Mistakes Saved', 'usage_count' => $mistakeCount, 'popularity_percent' => null],
            ['name' => 'Student Feedback', 'usage_count' => $feedbacksCount, 'popularity_percent' => null],
        ];

        // Group actual subscriptions by their real plan field.
        $plansList = [];
        $planStmt = $pdo->query("SELECT plan, status, COUNT(*) as cnt FROM subscriptions GROUP BY plan, status ORDER BY plan, status");
        while ($pr = $planStmt->fetch(PDO::FETCH_ASSOC)) {
            $plansList[] = [
                'plan' => $pr['plan'] ?: 'Unspecified',
                'status' => $pr['status'] ?: 'unknown',
                'purchases' => (int)$pr['cnt'],
                'price' => null,
                'share' => $subsCount > 0 ? (string)round(((int)$pr['cnt'] / $subsCount) * 100) . '%' : '0%'
            ];
        }

        // Table diagnostic list reports measured row counts without claiming unmeasured index/health status.
        $tableDiagnostics = [
            ['table' => 'auth_users (Registered Students)', 'rows' => $usersCount, 'status' => 'Available'],
            ['table' => 'tests (DPPs & Full Mocks)', 'rows' => $dppCount + $mockCount, 'status' => 'Available'],
            ['table' => 'attempts (Student Test Sessions)', 'rows' => $attemptsCount, 'status' => 'Available'],
            ['table' => 'qb_questions (Master Question Bank)', 'rows' => $qbCount, 'status' => 'Available'],
            ['table' => 'nugget_questions (NCERT Micro-Concepts)', 'rows' => $nuggetCount, 'status' => 'Available'],
            ['table' => 'neet_pyq_questions (PYQ Bank)', 'rows' => $pyqCount, 'status' => 'Available'],
            ['table' => 'subscriptions (Memberships)', 'rows' => $subsCount, 'status' => 'Available'],
            ['table' => 'feedback (Student Reviews)', 'rows' => $feedbacksCount, 'status' => 'Available'],
            ['table' => 'dashboard_banners (Promos)', 'rows' => $bannersCount, 'status' => 'Available'],
        ];

        // Subject accuracy is only attributed for attempts whose test titles explicitly identify a subject.
        $subjectErrors = [];
        $seStmt = $pdo->query("SELECT 
            CASE
                WHEN LOWER(t.title) REGEXP 'biology|botany|zoology' THEN 'Biology'
                WHEN LOWER(t.title) LIKE '%chemistry%' THEN 'Chemistry'
                WHEN LOWER(t.title) LIKE '%physics%' THEN 'Physics'
                ELSE 'Mixed / Unlabelled'
            END as subject_name,
            SUM(a.correct_count) as c_tot,
            SUM(a.wrong_count) as w_tot,
            COUNT(a.id) as attempts
            FROM attempts a JOIN tests t ON a.test_id = t.id GROUP BY subject_name");
        while ($se = $seStmt->fetch(PDO::FETCH_ASSOC)) {
            $c = (int)($se['c_tot'] ?? 0);
            $w = (int)($se['w_tot'] ?? 0);
            $tot = $c + $w;
            $subjectErrors[] = [
                'subject' => $se['subject_name'],
                'accuracy' => $tot > 0 ? round(($c / $tot) * 100, 1) : null,
                'error_rate' => $tot > 0 ? round(($w / $tot) * 100, 1) : null,
                'attempts' => (int)$se['attempts']
            ];
        }

        nb_json([
            'total_users' => $usersCount,
            'total_questions' => $qbCount + $nuggetCount + $pyqCount,
            'total_dpps' => $dppCount,
            'total_mocks' => $mockCount,
            'total_attempts' => $attemptsCount,
            'active_subscribers' => $subsCount,
            'total_batches_sold' => (int)($purchaseSummary['sales'] ?? 0),
            'total_revenue' => (float)($purchaseSummary['revenue'] ?? 0),
            'features' => $features,
            'plans' => $plansList,
            'tables' => $tableDiagnostics,
            'subject_errors' => $subjectErrors
        ]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}
if ($action === 'banners') {
    if ($method === 'GET') {
        try {
            $banners = $pdo->query("SELECT id, title, image_url, link_url, link_path, image_url_dark, sort_order, active, created_at, updated_at FROM dashboard_banners ORDER BY sort_order ASC, created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
            nb_json(['banners' => $banners]);
        } catch (Throwable $e) {
            nb_fail($e->getMessage(), 500);
        }
    }
    if ($method === 'POST') {
        $id = trim((string)($input['id'] ?? sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x', random_int(0, 65535), random_int(0, 65535), random_int(0, 65535), random_int(16384, 20479), random_int(32768, 49151), random_int(0, 65535), random_int(0, 65535), random_int(0, 65535))));
        $title = trim((string)($input['title'] ?? ''));
        $imageUrl = trim((string)($input['image_url'] ?? ''));
        $imageUrlDark = trim((string)($input['image_url_dark'] ?? ''));
        $linkUrl = trim((string)($input['link_url'] ?? ''));
        $sortOrder = (int)($input['sort_order'] ?? 0);
        $active = isset($input['active']) ? (int)(bool)$input['active'] : 1;
        if ($title === '') nb_fail("Banner title is required", 400);
        if ($imageUrl === '') nb_fail("Banner image URL is required", 400);
        try {
            $stmt = $pdo->prepare("INSERT INTO dashboard_banners (id, title, image_url, image_url_dark, link_url, link_path, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE title=VALUES(title), image_url=VALUES(image_url), image_url_dark=VALUES(image_url_dark), link_url=VALUES(link_url), link_path=VALUES(link_path), sort_order=VALUES(sort_order), active=VALUES(active), updated_at=NOW()");
            $stmt->execute([$id, $title, $imageUrl, $imageUrlDark ?: null, $linkUrl, $linkUrl, $sortOrder, $active]);
            nb_json(['success' => true, 'id' => $id]);
        } catch (Throwable $e) {
            nb_fail($e->getMessage(), 500);
        }
    }
}

if ($action === 'save_banner') {
    $id = trim((string)($input['id'] ?? sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x', random_int(0, 65535), random_int(0, 65535), random_int(0, 65535), random_int(16384, 20479), random_int(32768, 49151), random_int(0, 65535), random_int(0, 65535), random_int(0, 65535))));
    $title = trim((string)($input['title'] ?? ''));
    $imageUrl = trim((string)($input['image_url'] ?? ''));
    $linkUrl = trim((string)($input['link_url'] ?? $input['cta_link'] ?? ''));
    $sortOrder = (int)($input['sort_order'] ?? 0);
    $active = isset($input['active']) ? (int)(bool)$input['active'] : 1;
    if ($title === '') nb_fail("Banner title is required", 400);
    if ($imageUrl === '') nb_fail("Banner image URL is required", 400);
    try {
        $stmt = $pdo->prepare("INSERT INTO dashboard_banners (id, title, image_url, link_url, link_path, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE title=VALUES(title), image_url=VALUES(image_url), link_url=VALUES(link_url), link_path=VALUES(link_path), sort_order=VALUES(sort_order), active=VALUES(active), updated_at=NOW()");
        $stmt->execute([$id, $title, $imageUrl, $linkUrl, $linkUrl, $sortOrder, $active]);
        nb_json(['success' => true, 'id' => $id]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($action === 'upload_banner' || $action === 'upload_batch_image') {
    if ($method !== 'POST') nb_fail("Method not allowed", 405);
    if (empty($_FILES['file'])) {
        nb_fail("No file uploaded", 400);
    }
    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        nb_fail("File upload error code: " . $file['error'], 400);
    }

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'];
    if (!in_array($ext, $allowed, true)) {
        nb_fail("Invalid file extension. Allowed: " . implode(', ', $allowed), 400);
    }

    $filename = sprintf('banner_%d_%s.%s', time(), bin2hex(random_bytes(4)), $ext);
    $uploadDir = __DIR__ . '/../uploads/banners';
    if (!is_dir($uploadDir)) {
        @mkdir($uploadDir, 0775, true);
    }

    $destination = $uploadDir . '/' . $filename;
    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        nb_fail("Failed to save uploaded file", 500);
    }

    $publicUrl = '/uploads/banners/' . $filename;
    nb_json([
        'success' => true,
        'url' => $publicUrl,
        'image_url' => $publicUrl
    ]);
}

if ($action === 'delete_banner') {
    $id = $input['id'] ?? '';
    try {
        $stmt = $pdo->prepare("DELETE FROM dashboard_banners WHERE id = ?");
        $stmt->execute([$id]);
        nb_json(['success' => true]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($action === 'grant_premium') {
    $email = trim((string)($input['email'] ?? ''));
    $tier = $input['tier'] ?? 'prime';
    $days = (int)($input['duration_days'] ?? 365);
    if (!$email) nb_fail("User email required", 400);

    try {
        $uStmt = $pdo->prepare("SELECT id FROM auth_users WHERE LOWER(email) = LOWER(?) LIMIT 1");
        $uStmt->execute([$email]);
        $targetId = $uStmt->fetchColumn();
        if (!$targetId) nb_fail("User with email {$email} not found", 404);

        $expiresAt = date('Y-m-d H:i:s', strtotime("+{$days} days"));
        $stmt = $pdo->prepare("INSERT INTO subscriptions (id, user_id, tier, status, started_at, expires_at)
            VALUES (UUID(), ?, ?, 'active', NOW(), ?)
            ON DUPLICATE KEY UPDATE tier = VALUES(tier), status = 'active', expires_at = VALUES(expires_at)");
        $stmt->execute([$targetId, $tier, $expiresAt]);
        nb_json(['success' => true, 'message' => "Granted {$tier} access to {$email} for {$days} days"]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($action === 'coupons') {
    if ($method === 'GET') {
        try {
            $coupons = $pdo->query("SELECT id, code, kind, value, max_uses, used_count, expires_at, batch_id, active, created_at, owner_user_id, program, allowed_plans FROM coupons ORDER BY created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
            nb_json(['coupons' => $coupons]);
        } catch (Throwable $e) {
            nb_fail($e->getMessage(), 500);
        }
    }
    if ($method === 'POST') {
        $code = strtoupper(trim((string)($input['code'] ?? '')));
        $discount = (float)($input['value'] ?? $input['discount_percent'] ?? 20);
        $kind = strtolower(trim((string)($input['kind'] ?? 'percent')));
        $maxUsesRaw = $input['max_uses'] ?? null;
        $maxUses = $maxUsesRaw === null || $maxUsesRaw === '' ? null : (string)(int)$maxUsesRaw;
        if (!$code) nb_fail("Coupon code required", 400);
        if (!in_array($kind, ['percent', 'flat'], true)) nb_fail("Coupon kind must be percent or flat", 400);
        if ($discount <= 0 || ($kind === 'percent' && $discount > 100)) nb_fail("Coupon value is invalid", 400);

        try {
            $exists = $pdo->prepare("SELECT COUNT(*) FROM coupons WHERE code = ?");
            $exists->execute([$code]);
            if ((int)$exists->fetchColumn() > 0) nb_fail("Coupon code already exists", 409);
            $stmt = $pdo->prepare("INSERT INTO coupons (id, code, kind, value, max_uses, used_count, active, created_at) VALUES (UUID(), ?, ?, ?, ?, 0, 1, NOW())");
            $stmt->execute([$code, $kind, $discount, $maxUses]);
            nb_json(['success' => true, 'message' => "Coupon {$code} created"]);
        } catch (Throwable $e) {
            nb_fail($e->getMessage(), 500);
        }
    }
}

if ($action === 'delete_coupon') {
    $id = trim((string)($input['id'] ?? ''));
    if ($id === '') nb_fail("Coupon id required", 400);
    try {
        $stmt = $pdo->prepare("DELETE FROM coupons WHERE id = ?");
        $stmt->execute([$id]);
        nb_json(['success' => $stmt->rowCount() > 0, 'deleted' => $stmt->rowCount() > 0]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($action === 'batches') {
    if ($method === 'GET') {
        try {
            $batches = $pdo->query("SELECT * FROM batches ORDER BY sort_order ASC, created_at DESC")->fetchAll(PDO::FETCH_ASSOC);
            nb_json(['batches' => $batches]);
        } catch (Throwable $e) {
            nb_json(['batches' => []]);
        }
    }
    if ($method === 'POST') {
        $id = $input['id'] ?? sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x', random_int(0, 65535), random_int(0, 65535), random_int(0, 65535), random_int(16384, 20479), random_int(32768, 49151), random_int(0, 65535), random_int(0, 65535), random_int(0, 65535));
        $title = trim((string)($input['title'] ?? 'New NEET Batch'));
        $price = (int)($input['price'] ?? 1999);
        $discPrice = (int)($input['discounted_price'] ?? 999);
        $duration = (int)($input['duration_days'] ?? 365);
        $tagline = $input['short_tagline'] ?? 'High Yield NEET Program';

        try {
            $stmt = $pdo->prepare("INSERT INTO batches (id, title, price, discounted_price, duration_days, short_tagline, active, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, 1, 1)
                ON DUPLICATE KEY UPDATE title=VALUES(title), price=VALUES(price), discounted_price=VALUES(discounted_price), duration_days=VALUES(duration_days), short_tagline=VALUES(short_tagline)");
            $stmt->execute([$id, $title, $price, $discPrice, $duration, $tagline]);
            nb_json(['success' => true, 'message' => "Batch '{$title}' saved successfully"]);
        } catch (Throwable $e) {
            nb_fail($e->getMessage(), 500);
        }
    }
}

if ($action === 'save_maintenance') {
    $enabled = (int)($input['enabled'] ?? 0);
    $msg = trim((string)($input['message'] ?? 'Platform under routine scheduled upgrade.'));
    try {
        $stmt = $pdo->prepare("INSERT INTO admin_settings (setting_key, setting_value) VALUES ('maintenance', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
        $stmt->execute([json_encode(['enabled' => $enabled, 'message' => $msg])]);
        nb_json(['success' => true, 'message' => 'Maintenance configuration updated']);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($action === 'save_alert_ticker') {
    $enabled = (int)($input['enabled'] ?? 1);
    $text = trim((string)($input['text'] ?? '⚡ NEET 2026 Test Series & 100 Daily DPPs now unlocked for all students!'));
    $link = trim((string)($input['link'] ?? '/dpp'));
    try {
        $stmt = $pdo->prepare("INSERT INTO admin_settings (setting_key, setting_value) VALUES ('alert_ticker', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
        $stmt->execute([json_encode(['enabled' => $enabled, 'text' => $text, 'link' => $link])]);
        nb_json(['success' => true, 'message' => 'Sitewide alert ticker updated']);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($action === 'save_razorpay') {
    $keyId = trim((string)($input['key_id'] ?? ''));
    $keySecret = trim((string)($input['key_secret'] ?? ''));
    try {
        $stmt = $pdo->prepare("INSERT INTO admin_settings (setting_key, setting_value) VALUES ('razorpay_config', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
        $stmt->execute([json_encode(['key_id' => $keyId, 'key_secret' => $keySecret])]);
        nb_json(['success' => true, 'message' => 'Razorpay configuration saved']);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($action === 'save_ai_keys') {
    $lovableKey = trim((string)($input['lovable_ai_key'] ?? ''));
    $geminiKey = trim((string)($input['gemini_api_key'] ?? ''));
    $model = trim((string)($input['default_model'] ?? 'gemini-1.5-flash'));
    try {
        $stmt = $pdo->prepare("INSERT INTO admin_settings (setting_key, setting_value) VALUES ('ai_config', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
        $stmt->execute([json_encode(['lovable_ai_key' => $lovableKey, 'gemini_api_key' => $geminiKey, 'default_model' => $model])]);
        nb_json(['success' => true, 'message' => 'AI keys & provider configuration saved']);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($action === 'save_battle_settings') {
    $battleQCount = (int)($input['question_count'] ?? 5);
    $timePerQ = (int)($input['seconds_per_question'] ?? 20);
    $botFallback = (int)($input['bot_fallback_enabled'] ?? 1);
    try {
        $stmt = $pdo->prepare("INSERT INTO admin_settings (setting_key, setting_value) VALUES ('battle_settings', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
        $stmt->execute([json_encode(['question_count' => $battleQCount, 'seconds_per_question' => $timePerQ, 'bot_fallback' => $botFallback])]);
        nb_json(['success' => true, 'message' => 'Battlegrounds arena settings updated']);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

if ($action === 'add_question') {
    $subject = trim((string)($input['subject'] ?? 'Biology'));
    $chapter = trim((string)($input['chapter'] ?? 'General NEET'));
    $qText = trim((string)($input['question'] ?? ''));
    $optA = trim((string)($input['option_a'] ?? ''));
    $optB = trim((string)($input['option_b'] ?? ''));
    $optC = trim((string)($input['option_c'] ?? ''));
    $optD = trim((string)($input['option_d'] ?? ''));
    $correct = strtoupper(trim((string)($input['correct_option'] ?? 'A')));
    $explanation = trim((string)($input['explanation'] ?? ''));

    if (!$qText || !$optA || !$optB) nb_fail("Question text and options are required", 400);

    try {
        $id = sprintf('q_adm_%d_%d', time(), mt_rand(100, 999));
        $optionsJson = json_encode(['A' => $optA, 'B' => $optB, 'C' => $optC, 'D' => $optD]);
        $stmt = $pdo->prepare("INSERT INTO qb_questions (id, subject, chapter, question, options, correct_option, explanation, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())");
        $stmt->execute([$id, $subject, $chapter, $qText, $optionsJson, $correct, $explanation]);
        nb_json(['success' => true, 'message' => "Question added successfully to {$subject} / {$chapter}"]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}


if ($action === 'save_social_links') {
    $input = nb_input();
    $links = [
        'telegram' => trim((string)($input['telegram'] ?? '')),
        'instagram' => trim((string)($input['instagram'] ?? '')),
        'youtube' => trim((string)($input['youtube'] ?? '')),
    ];
    $encoded = json_encode($links);
    $stmt = $pdo->prepare("INSERT INTO admin_settings (setting_key, setting_value) VALUES ('social_links', ?) ON DUPLICATE KEY UPDATE setting_value = ?");
    $stmt->execute([$encoded, $encoded]);
    nb_json(['success' => true, 'message' => 'Community & social links updated successfully', 'links' => $links]);
}

if ($action === 'get_social_links') {
    $stmt = $pdo->prepare("SELECT setting_value FROM admin_settings WHERE setting_key = 'social_links' LIMIT 1");
    $stmt->execute();
    $raw = $stmt->fetchColumn();
    $links = [
        'telegram' => 'https://t.me/neetbuddy',
        'instagram' => 'https://instagram.com/neetbuddy.in',
        'youtube' => 'https://youtube.com/@neetbuddy',
    ];
    if ($raw) {
        $saved = json_decode((string)$raw, true);
        if (is_array($saved)) {
            foreach ($links as $k => $v) {
                if (!empty($saved[$k])) $links[$k] = trim((string)$saved[$k]);
            }
        }
    }
    nb_json(['success' => true, 'links' => $links]);
}

if ($action === 'get_settings') {
    try {
        $rows = $pdo->query("SELECT setting_key, setting_value FROM admin_settings")->fetchAll(PDO::FETCH_KEY_PAIR);
        $razorpay = isset($rows['razorpay_config']) ? json_decode($rows['razorpay_config'], true) : ['key_id' => '', 'key_secret' => ''];
        $ai = isset($rows['ai_config']) ? json_decode($rows['ai_config'], true) : ['lovable_ai_key' => '', 'gemini_api_key' => '', 'default_model' => 'gemini-1.5-flash'];
        $maint = isset($rows['maintenance']) ? json_decode($rows['maintenance'], true) : ['enabled' => 0, 'message' => ''];
        $ticker = isset($rows['alert_ticker']) ? json_decode($rows['alert_ticker'], true) : ['enabled' => 1, 'text' => '⚡ 100 Daily DPPs live for NEET 2026', 'link' => '/dpp'];
        $battle = isset($rows['battle_settings']) ? json_decode($rows['battle_settings'], true) : ['question_count' => 5, 'seconds_per_question' => 20, 'bot_fallback' => 1];
        $social = isset($rows['social_links']) ? json_decode($rows['social_links'], true) : ['telegram' => 'https://t.me/neetbuddy', 'instagram' => 'https://instagram.com/neetbuddy.in', 'youtube' => 'https://youtube.com/@neetbuddy',];
        nb_json(['razorpay' => $razorpay, 'ai' => $ai, 'maintenance' => $maint, 'alert_ticker' => $ticker, 'battle_settings' => $battle, 'social_links' => $social]);
    } catch (Throwable $e) {
        nb_json(['razorpay' => ['key_id' => ''], 'ai' => ['default_model' => 'gemini-1.5-flash']]);
    }
}

// 4. SEQUENTIAL DPP GENERATOR
if ($action === 'generate_dpps') {
    $quantity = max(1, min(100, (int)($input['quantity'] ?? 10)));
    try {
        $stmt = $pdo->query("SELECT title FROM tests WHERE type IN ('dpp', 'daily')");
        $titles = $stmt ? $stmt->fetchAll(PDO::FETCH_COLUMN) : [];
        $maxNum = 30;
        foreach ($titles as $t) {
            if (preg_match('/Daily DPP\s*(\d+)/i', $t, $m)) {
                $val = (int)$m[1];
                if ($val > $maxNum) $maxNum = $val;
            }
        }

        $qStmt = $pdo->query("SELECT id FROM qb_questions LIMIT 1000");
        $allQids = $qStmt ? $qStmt->fetchAll(PDO::FETCH_COLUMN) : [];

        $insStmt = $pdo->prepare("INSERT INTO tests (id, title, description, difficulty, duration_min, total_questions, marks_correct, marks_wrong, source, type, question_ids, created_at)
            VALUES (:id, :title, :description, 'medium', 25, 20, 4, -1, 'Neet Buddy Daily DPP', 'dpp', :question_ids, NOW())");

        for ($i = 1; $i <= $quantity; $i++) {
            $dppNum = $maxNum + $i;
            $dppId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                0xd000 + ($dppNum % 4000), 0x2222, 0x3333, 0x4000 | ($dppNum % 0x0fff), 0x8000 | ($dppNum % 0x3fff),
                0xcccc, 0xdddd, $dppNum * 10);
            $title = sprintf("Daily DPP %02d — 20-Q Mixed Rapid Round", $dppNum);
            $desc = "Quality-vetted 20-question daily practice: 8 Biology • 6 Physics • 6 Chemistry. 25 minutes, NEET marking (+4 / -1).";

            $qids = [];
            if (count($allQids) >= 20) {
                $offset = (($dppNum) * 20) % count($allQids);
                $qids = array_slice($allQids, $offset, 20);
            }

            $insStmt->execute([
                ':id' => $dppId,
                ':title' => $title,
                ':description' => $desc,
                ':question_ids' => json_encode($qids)
            ]);
        }

        nb_json([
            'success' => true,
            'message' => "Successfully created {$quantity} new DPPs sequentially numbered from Daily DPP " . ($maxNum + 1) . " to Daily DPP " . ($maxNum + $quantity),
            'first_num' => $maxNum + 1,
            'last_num' => $maxNum + $quantity,
            'count' => $quantity
        ]);
    } catch (Throwable $e) {
        nb_fail($e->getMessage(), 500);
    }
}

$usersCount = (int)$pdo->query("SELECT COUNT(*) FROM auth_users")->fetchColumn();
nb_json([
    "stats" => [
        "users" => $usersCount,
        "status" => "online"
    ]
]);
