<?php
header('Content-Type: application/json');
require_once 'db.php';

// Obtener el tipo y el ID de la URL
$urlParts = explode('/', trim($_SERVER['REQUEST_URI'], '/'));
$tipo = $urlParts[count($urlParts) - 2] ?? '';
$id = intval($urlParts[count($urlParts) - 1] ?? 0);

// Obtener los datos enviados
$data = json_decode(file_get_contents('php://input'), true);
$response = ['success' => false, 'message' => ''];

if (!$tipo || !$id || !$data) {
    $response['message'] = 'Parámetros faltantes o inválidos';
    echo json_encode($response);
    exit;
}

try {
    $conn = getConnection();
    
    switch ($tipo) {
        case 'categorias':
            if (!isset($data['nombre']) || trim($data['nombre']) === '') {
                throw new Exception('El nombre es requerido');
            }
            $sql = "UPDATE categorias SET nombre = ? WHERE id_categoria = ?";
            $params = [trim($data['nombre']), $id];
            break;
            
        case 'tallas':
            if (!isset($data['nombre']) || trim($data['nombre']) === '' || !isset($data['ajuste'])) {
                throw new Exception('El nombre y el ajuste son requeridos');
            }
            $sql = "UPDATE tallas SET nombre = ?, ajuste = ?, pecho = ?, cintura = ?, cadera = ?, largo = ? WHERE id_talla = ?";
            $params = [
                trim($data['nombre']),
                $data['ajuste'],
                $data['pecho'] ?? null,
                $data['cintura'] ?? null,
                $data['cadera'] ?? null,
                $data['largo'] ?? null,
                $id
            ];
            break;
            
        case 'proveedores':
            if (!isset($data['nombre']) || trim($data['nombre']) === '') {
                throw new Exception('El nombre es requerido');
            }
            $sql = "UPDATE proveedores SET nombre = ?, contacto = ?, telefono = ? WHERE id_proveedor = ?";
            $params = [
                trim($data['nombre']),
                trim($data['contacto'] ?? ''),
                trim($data['telefono'] ?? ''),
                $id
            ];
            break;
            
        default:
            throw new Exception('Tipo no válido');
    }
    
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    
    if ($stmt->rowCount() > 0) {
        $response['success'] = true;
        $response['message'] = 'Actualización exitosa';
    } else {
        $response['message'] = 'No se encontró el elemento o no hubo cambios';
    }
    
} catch (Exception $e) {
    $response['message'] = 'Error: ' . $e->getMessage();
}

echo json_encode($response);
?>