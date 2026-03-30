<?php
require_once 'database.php';

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {

    // ─── GET ──────────────────────────────────────────────────────────────────
    case 'GET':
        $where  = ['1=1'];
        $params = [];

        if (!empty($_GET['name'])) {
            $where[]  = "CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name) LIKE ?";
            $params[] = '%' . $_GET['name'] . '%';
        }
        if (!empty($_GET['job'])) {
            $where[]  = "e.job_title LIKE ?";
            $params[] = '%' . $_GET['job'] . '%';
        }
        if (!empty($_GET['department_id'])) {
            $where[]  = "e.department_id = ?";
            $params[] = (int)$_GET['department_id'];
        }
        if (isset($_GET['salary_max']) && $_GET['salary_max'] !== '' && (int)$_GET['salary_max'] < 100000) {
            $where[]  = "e.salary <= ?";
            $params[] = (float)$_GET['salary_max'];
        }
        if (!empty($_GET['address'])) {
            $where[]  = "a.address_text LIKE ?";
            $params[] = '%' . $_GET['address'] . '%';
        }
        if (!empty($_GET['town_id'])) {
            $where[]  = "t.town_id = ?";
            $params[] = (int)$_GET['town_id'];
        }

        $whereStr = implode(' AND ', $where);

        $sql = "
            SELECT
                e.employee_id,
                e.first_name,
                e.last_name,
                e.middle_name,
                CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name) AS full_name,
                e.job_title,
                d.department_id,
                d.name  AS department_name,
                e.salary,
                a.address_id,
                a.address_text,
                t.town_id,
                t.name  AS town_name,
                e.manager_id,
                e.hire_date
            FROM employees e
            JOIN departments d ON e.department_id = d.department_id
            LEFT JOIN addresses a ON e.address_id  = a.address_id
            LEFT JOIN towns     t ON a.town_id      = t.town_id
            WHERE $whereStr
            ORDER BY e.employee_id
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        echo json_encode($stmt->fetchAll());
        break;

    // ─── POST ─────────────────────────────────────────────────────────────────
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);

        $first_name    = trim($data['first_name']    ?? '');
        $last_name     = trim($data['last_name']     ?? '');
        $middle_name   = trim($data['middle_name']   ?? '') ?: null;
        $job_title     = trim($data['job_title']     ?? '');
        $department_id = (int)($data['department_id'] ?? 0);
        $salary        = (float)($data['salary']      ?? 0);
        $address_text  = trim($data['address_text']  ?? '');
        $town_id       = (int)($data['town_id']       ?? 0);

        if (!$first_name || !$last_name || !$job_title || !$department_id || !$address_text || !$town_id) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required fields']);
            exit;
        }

        try {
            $pdo->beginTransaction();

            // Insert address
            $stmt = $pdo->prepare("INSERT INTO addresses (address_text, town_id) VALUES (?, ?)");
            $stmt->execute([$address_text, $town_id]);
            $address_id = $pdo->lastInsertId();

            // Insert employee (hire_date defaults to NOW())
            $stmt = $pdo->prepare("
                INSERT INTO employees (first_name, last_name, middle_name, job_title, department_id, salary, address_id, hire_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            ");
            $stmt->execute([$first_name, $last_name, $middle_name, $job_title, $department_id, $salary, $address_id]);
            $employee_id = $pdo->lastInsertId();

            $pdo->commit();

            // Return the newly created employee
            $stmt = $pdo->prepare("
                SELECT e.employee_id, e.first_name, e.last_name, e.middle_name,
                    CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name) AS full_name,
                    e.job_title, d.department_id, d.name AS department_name,
                    e.salary, a.address_id, a.address_text, t.town_id, t.name AS town_name,
                    e.manager_id, e.hire_date
                FROM employees e
                JOIN departments d ON e.department_id = d.department_id
                LEFT JOIN addresses a ON e.address_id = a.address_id
                LEFT JOIN towns t ON a.town_id = t.town_id
                WHERE e.employee_id = ?
            ");
            $stmt->execute([$employee_id]);
            http_response_code(201);
            echo json_encode($stmt->fetch());

        } catch (\Exception $ex) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['error' => $ex->getMessage()]);
        }
        break;

    // ─── PUT ──────────────────────────────────────────────────────────────────
    case 'PUT':
        $id   = (int)($_GET['id'] ?? 0);
        $data = json_decode(file_get_contents('php://input'), true);

        if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }

        $first_name    = trim($data['first_name']    ?? '');
        $last_name     = trim($data['last_name']     ?? '');
        $middle_name   = trim($data['middle_name']   ?? '') ?: null;
        $job_title     = trim($data['job_title']     ?? '');
        $department_id = (int)($data['department_id'] ?? 0);
        $salary        = (float)($data['salary']      ?? 0);
        $address_text  = trim($data['address_text']  ?? '');
        $town_id       = (int)($data['town_id']       ?? 0);
        $address_id    = (int)($data['address_id']    ?? 0);

        try {
            $pdo->beginTransaction();

            if ($address_id) {
                // Update existing address
                $stmt = $pdo->prepare("UPDATE addresses SET address_text = ?, town_id = ? WHERE address_id = ?");
                $stmt->execute([$address_text, $town_id, $address_id]);
            } else {
                // Create new address
                $stmt = $pdo->prepare("INSERT INTO addresses (address_text, town_id) VALUES (?, ?)");
                $stmt->execute([$address_text, $town_id]);
                $address_id = $pdo->lastInsertId();
            }

            // Fetch original hire_date to preserve it (schema has ON UPDATE CURRENT_TIMESTAMP)
            $hStmt = $pdo->prepare("SELECT hire_date FROM employees WHERE employee_id = ?");
            $hStmt->execute([$id]);
            $orig = $hStmt->fetch();
            $hire_date = $orig['hire_date'] ?? date('Y-m-d H:i:s');

            $stmt = $pdo->prepare("
                UPDATE employees
                SET first_name=?, last_name=?, middle_name=?, job_title=?,
                    department_id=?, salary=?, address_id=?, hire_date=?
                WHERE employee_id=?
            ");
            $stmt->execute([$first_name, $last_name, $middle_name, $job_title,
                            $department_id, $salary, $address_id, $hire_date, $id]);

            $pdo->commit();

            // Return updated employee
            $stmt = $pdo->prepare("
                SELECT e.employee_id, e.first_name, e.last_name, e.middle_name,
                    CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name) AS full_name,
                    e.job_title, d.department_id, d.name AS department_name,
                    e.salary, a.address_id, a.address_text, t.town_id, t.name AS town_name,
                    e.manager_id, e.hire_date
                FROM employees e
                JOIN departments d ON e.department_id = d.department_id
                LEFT JOIN addresses a ON e.address_id = a.address_id
                LEFT JOIN towns t ON a.town_id = t.town_id
                WHERE e.employee_id = ?
            ");
            $stmt->execute([$id]);
            echo json_encode($stmt->fetch());

        } catch (\Exception $ex) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['error' => $ex->getMessage()]);
        }
        break;

    // ─── DELETE ───────────────────────────────────────────────────────────────
    case 'DELETE':
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }

        try {
            $pdo->beginTransaction();

            // Get address_id before deleting employee
            $stmt = $pdo->prepare("SELECT address_id FROM employees WHERE employee_id = ?");
            $stmt->execute([$id]);
            $emp = $stmt->fetch();
            $address_id = $emp['address_id'] ?? null;

            // Remove from employees_projects first (FK)
            $pdo->prepare("DELETE FROM employees_projects WHERE employee_id = ?")->execute([$id]);

            // Nullify manager references
            $pdo->prepare("UPDATE employees SET manager_id = NULL WHERE manager_id = ?")->execute([$id]);

            // Nullify department manager if this employee is manager
            $pdo->prepare("UPDATE departments SET manager_id = 1 WHERE manager_id = ?")->execute([$id]);

            // Delete employee
            $pdo->prepare("DELETE FROM employees WHERE employee_id = ?")->execute([$id]);

            // Delete address if it was exclusively used by this employee
            if ($address_id) {
                $chk = $pdo->prepare("SELECT COUNT(*) AS cnt FROM employees WHERE address_id = ?");
                $chk->execute([$address_id]);
                if ($chk->fetch()['cnt'] === 0) {
                    $pdo->prepare("DELETE FROM addresses WHERE address_id = ?")->execute([$address_id]);
                }
            }

            $pdo->commit();
            echo json_encode(['success' => true, 'deleted_id' => $id]);

        } catch (\Exception $ex) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['error' => $ex->getMessage()]);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
