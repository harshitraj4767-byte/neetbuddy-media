<?php
declare(strict_types=1);

require_once __DIR__ . "/auth/lib.php";

nb_cors();

 = nb_pdo();
 = ["category"] ?? null;
 = min((int)(["limit"] ?? 100), 200);

 = "SELECT id, title, description, difficulty, COALESCE(duration_min, duration_minutes, 180) AS duration_min, total_questions, source, entry_fee, is_paid, syllabus, category_id, type, created_at FROM tests WHERE is_active = 1";
 = [];

if ( &&  !== 'all') {
    if ( === 'uncat') {
         .= " AND (category_id IS NULL OR category_id = '')";
    } else {
         .= " AND category_id = :cat";
        [":cat"] = ;
    }
}
 .= " ORDER BY created_at DESC LIMIT " . ;

try {
     = ->prepare();
    ->execute();
     = ->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable ) {
     = ->query("SELECT * FROM tests WHERE is_active = 1 LIMIT " . );
     =  ? ->fetchAll(PDO::FETCH_ASSOC) : [];
}

foreach ( as &) {
    if (isset(["syllabus"]) && is_string(["syllabus"])) {
         = json_decode(["syllabus"], true);
        if ( !== null) {
            ["syllabus"] = ;
        }
    }
    if (isset(["is_paid"])) {
        ["is_paid"] = (bool)["is_paid"];
    }
    if (isset(["duration_minutes"]) && !isset(["duration_min"])) {
        ["duration_min"] = (int)["duration_minutes";
    }
}

nb_json([
    "tests" => ,
    "count" => count(),
]);
