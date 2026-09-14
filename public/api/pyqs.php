<?php
declare(strict_types=1);

require_once __DIR__ . "/auth/lib.php";

nb_cors();

 = nb_pdo();
 = ["action"] ?? (["action"] ?? "questions");

if ( === "papers") {
    try {
         = ->query("SELECT id, ext_id, title, year, total_questions, duration_minutes FROM neet_pyq_papers ORDER BY year DESC, title ASC");
         = ->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable ) {
         = ->query("SELECT DISTINCT COALESCE(year, pyq_year) as year FROM qb_questions WHERE is_pyq = 1 OR year IS NOT NULL ORDER BY year DESC");
         = ->fetchAll(PDO::FETCH_ASSOC);
         = [];
        foreach ( as ) {
             = (int)["year"];
            if ( > 0) {
                [] = [
                    "id" => "pyq_paper_" . ,
                    "ext_id" => "neet_" . ,
                    "title" => "NEET " .  . " Official Paper",
                    "year" => ,
                    "total_questions" => 180,
                    "duration_minutes" => 180
                ];
            }
        }
    }
    nb_json(["papers" => , "count" => count()]);
}

if ( === "attempts") {
     = nb_current_user();
    if (!) {
        nb_json(["attempts" => []]);
    }
    try {
         = ->prepare("SELECT id, paper_id, score, submitted_at FROM neet_pyq_attempts WHERE user_id = :uid ORDER BY submitted_at DESC");
        ->execute([":uid" => ["id"]]);
         = ->fetchAll(PDO::FETCH_ASSOC);
        nb_json(["attempts" => ]);
    } catch (Throwable ) {
        nb_json(["attempts" => []]);
    }
}

if ( === "paper_questions") {
     = ["paper_id"] ?? "";
    try {
         = ->prepare("SELECT * FROM neet_pyq_questions WHERE paper_id = :pid ORDER BY question_order ASC, id ASC");
        ->execute([":pid" => ]);
         = ->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable ) {
         = [];
    }

    if (empty()) {
         = null;
        if (preg_match('/(\d{4})/', , )) {
             = (int)[1];
        }
        if () {
             = ->prepare("SELECT * FROM qb_questions WHERE (year = :yr OR pyq_year = :yr) ORDER BY id ASC LIMIT 200");
            ->execute([":yr" => ]);
             = ->fetchAll(PDO::FETCH_ASSOC);
        }
    }

    foreach ( as &) {
        if (isset(["options"]) && is_string(["options"])) {
            ["options"] = json_decode(["options"], true) ?: ["options"];
        }
    }
    nb_json(["questions" => , "count" => count()]);
}

// Default action: query qb_questions by filters
 = ["subject_id"] ?? null;
 = ["chapter_id"] ?? null;
 = ["year"] ?? null;

 = "SELECT * FROM qb_questions WHERE (is_pyq = 1 OR year IS NOT NULL)";
 = [];

if () {
     .= " AND subject_id = :sid";
    [":sid"] = ;
}
if () {
     .= " AND chapter_id = :cid";
    [":cid"] = ;
}
if () {
     .= " AND (year = :yr OR pyq_year = :yr)";
    [":yr"] = (int);
}
 .= " ORDER BY year DESC, id ASC LIMIT 100";

 = ->prepare();
->execute();
 = ->fetchAll(PDO::FETCH_ASSOC);

foreach ( as &) {
    if (isset(["options"]) && is_string(["options"])) {
        ["options"] = json_decode(["options"], true) ?: ["options"];
    }
}

nb_json([
    "pyqs" => ,
    "count" => count(),
]);
