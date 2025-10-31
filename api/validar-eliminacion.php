<?php
header('Content-Type: application/json');
require_once 'db.php';

$response = ['success' => false, 'puedeEliminar' => false, 'message' => ''];

if (!isset($_GET['tipo']) || !isset($_GET['id'])) {
    $response['message'] = 'Parámetros faltantes';
    echo json_encode($response);
    exit;
}

$tipo = $_GET['tipo'];
$id = intval($_GET['id']);

try {
    $conn = getConnection();
    
    // Validar según el tipo
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
    
    if ($result['total'] == 0) {
        $response['success'] = true;
        $response['puedeEliminar'] = true;
        $response['message'] = 'El elemento puede ser eliminado';
    } else {
        $response['success'] = true;
        $response['puedeEliminar'] = false;
        $response['message'] = 'No se puede eliminar porque está siendo utilizado por ' . $result['total'] . ' producto(s)';
    }
    
} catch (Exception $e) {
    $response['message'] = 'Error: ' . $e->getMessage();
}

echo json_encode($response);
?>