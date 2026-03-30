<?php
require_once 'database.php';

$stmt = $pdo->query("SELECT town_id, name FROM towns ORDER BY name");
echo json_encode($stmt->fetchAll());
