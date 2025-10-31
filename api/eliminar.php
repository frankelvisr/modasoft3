<?php
header('Content-Type: application/json');
require_once 'db.php';

// Obtener el tipo y el ID de la URL
$urlParts = explode('/', trim($_SERVER['REQUEST_URI'], '/'));
$tipo = $urlParts[count($urlParts) - 2] ?? '';
$id = intval($urlParts[count($urlParts) - 1] ?? 0);

$response = ['success' => false, 'message' => ''];

if (!$tipo || !$id) {
    $response['message'] = 'Parámetros faltantes';
    echo json_encode($response);
    exit;
}

try {
    $conn = getConnection();
    
    // Verificar primero si el elemento está siendo utilizado
    switch ($tipo) {
        case 'categorias':
            $sql = "SELECT COUNT(*) as total FROM productos WHERE id_categoria = ?";
            break;
        case 'tallas':
            $sql = "SELECT COUNT(*) as total FROM productos_tallas WHERE id_talla = ?";
            break;
        case 'proveedores':
            $sql = "SELECT COUNT(*) as total FROM productos WHERE id_proveedor = ?";
            break;
        default:
            throw new Exception('Tipo no válido');
    }
    
    $stmt = $conn->prepare($sql);
    $stmt->execute([$id]);
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($result['total'] > 0) {
        $response['message'] = 'No se puede eliminar porque está siendo utilizado por ' . $result['total'] . ' producto(s)';
        echo json_encode($response);
        exit;
    }
    
    // Si no está siendo utilizado, proceder con la eliminación
    switch ($tipo) {
        case 'categorias':
            $sql = "DELETE FROM categorias WHERE id_categoria = ?";
            break;
        case 'tallas':
            $sql = "DELETE FROM tallas WHERE id_talla = ?";
            break;
        case 'proveedores':
            $sql = "DELETE FROM proveedores WHERE id_proveedor = ?";
            break;
        default:
            throw new Exception('Tipo no válido');
    }
    
    $stmt = $conn->prepare($sql);
    $stmt->execute([$id]);
    
    if ($stmt->rowCount() > 0) {
        $response['success'] = true;
        $response['message'] = 'Elemento eliminado correctamente';
    } else {
        $response['message'] = 'No se encontró el elemento para eliminar';
    }
    
} catch (Exception $e) {
    $response['message'] = 'Error: ' . $e->getMessage();
}

echo json_encode($response);
?>