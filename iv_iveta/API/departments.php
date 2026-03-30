<?php
require_once 'database.php';

$stmt = $pdo->query("SELECT department_id, name FROM departments ORDER BY name");
echo json_encode($stmt->fetchAll());
