<?php
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

nb_cors();
nb_json(nb_session_payload(nb_current_user_id()));
