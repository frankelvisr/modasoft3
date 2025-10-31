// servidor/servidor.js
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const { pool, verificarConexiónBD, obtenerProductos } = require('./db'); // db.js con MySQL
const { verificarCredenciales } = require('./auth');
const cookieSession = require('cookie-session');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieSession({
  name: 'session',
  keys: ['clave-secreta-unica'], // reemplaza por una clave real en producción
  maxAge: 1000 * 60 * 60 // 1 hora
}));

// Servir archivos estáticos (front-end)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Ruta: estado del servidor y BD
app.get('/api/status', async (req, res) => {
  const bdOK = await verificarConexiónBD();
  // Incluir info de sesión si existe
  const user = req.session.user || null;
  let rol = 'Invitado';
  if (user) {
    if (user.id_rol == 1) rol = 'Administrador';
    if (user.id_rol == 2) rol = 'Caja';
  }
  res.json({ servidor: true, bd: bdOK, usuario: user ? user.usuario : null, rol: rol });
});

// Ruta de login
app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const user = await verificarCredenciales(usuario, password, { pool });
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }
    // Guardar en sesión
    req.session.user = { id: user.id, usuario: user.usuario, id_rol: user.id_rol };
    let rol = user.id_rol == 1 ? 'Administrador' : 'Caja';
    return res.json({ ok: true, usuario: user.usuario, rol });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'Error del servidor' });
  }
});

// Middleware de autenticación
function requiereRol(rol) {
  return (req, res, next) => {
    const u = req.session && req.session.user;
    if (!u) return res.status(401).json({ ok: false, error: 'No autenticado' });
    // Supuestos: id_rol 1 = Administrador, 2 = Caja
    const esAdmin = u.id_rol == 1;
    const esCaja = u.id_rol == 2;

    if (rol === 'administrador' && esAdmin) return next();
    if (rol === 'caja' && esCaja) return next();
    if (rol === 'cualquiera' && (esAdmin || esCaja)) return next(); // Para rutas generales
    
    return res.status(403).json({ ok: false, error: 'Acceso no autorizado' });
  };
}

// ---------------- Rutas compartidas: Logout ----------------
app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// ---------------- Administrador (rutas protegidas) ----------------
// Categorías
app.delete('/api/categorias/:id', requiereRol('administrador'), async (req, res) => {
  const id = req.params.id;
  try {
    // Verificar uso en Productos
    const [cnt] = await pool.query('SELECT COUNT(*) as total FROM Productos WHERE id_categoria = ?', [id]);
    const total = (Array.isArray(cnt) && cnt[0]) ? cnt[0].total : (cnt.total || 0);
    if (total > 0) {
      return res.status(400).json({ success: false, message: `No se puede eliminar: ${total} producto(s) usan esta categoría` });
    }
    const [delRes] = await pool.query('DELETE FROM Categorias WHERE id_categoria = ?', [id]);
    if (delRes.affectedRows > 0) return res.json({ success: true });
    return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
  } catch (e) {
    console.error('Error eliminar categoria:', e.message);
    res.status(500).json({ ok: false, message: 'Error del servidor al eliminar categoría' });
  }
});
app.get('/api/categorias', requiereRol('administrador'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id_categoria, nombre FROM Categorias ORDER BY nombre');
    res.json({ categorias: rows });
  } catch (e) {
    res.status(500).json({ categorias: [] });
  }
});
// Editar categoría (PUT)
app.put('/api/categorias/:id', requiereRol('administrador'), async (req, res) => {
  const id = req.params.id;
  const { nombre } = req.body;
  if (!nombre || nombre.trim() === '') return res.status(400).json({ success: false, message: 'Nombre requerido' });
  try {
    const [result] = await pool.query('UPDATE Categorias SET nombre = ? WHERE id_categoria = ?', [nombre.trim(), id]);
    if (result.affectedRows > 0) return res.json({ success: true });
    return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
  } catch (e) {
    console.error('Error editar categoria:', e.message);
    return res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});
app.post('/api/categorias', requiereRol('administrador'), async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.json({ ok: false });
  try {
    await pool.query('INSERT INTO Categorias (nombre) VALUES (?)', [nombre]);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// Proveedores
app.delete('/api/proveedores/:id', requiereRol('administrador'), async (req, res) => {
  const id = req.params.id;
  try {
    // Verificar uso en Productos
    const [cnt] = await pool.query('SELECT COUNT(*) as total FROM Productos WHERE id_proveedor = ?', [id]);
    const total = (Array.isArray(cnt) && cnt[0]) ? cnt[0].total : (cnt.total || 0);
    if (total > 0) {
      return res.status(400).json({ success: false, message: `No se puede eliminar: ${total} producto(s) usan este proveedor` });
    }
    const [delRes] = await pool.query('DELETE FROM Proveedores WHERE id_proveedor = ?', [id]);
    if (delRes.affectedRows > 0) return res.json({ success: true });
    return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
  } catch (e) {
    console.error('Error eliminar proveedor:', e.message);
    res.status(500).json({ ok: false, message: 'Error del servidor al eliminar proveedor' });
  }
});
// Tallas
app.get('/api/tallas', requiereRol('administrador'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id_talla, nombre FROM Tallas ORDER BY nombre');
    res.json({ tallas: rows });
  } catch (e) {
    res.status(500).json({ tallas: [] });
  }
});
app.post('/api/tallas', requiereRol('administrador'), async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.json({ ok: false });
  try {
    await pool.query('INSERT INTO Tallas (nombre) VALUES (?)', [nombre]);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});
// Editar talla (PUT)
app.put('/api/tallas/:id', requiereRol('administrador'), async (req, res) => {
  const id = req.params.id;
  const { nombre, ajuste, pecho, cintura, cadera, largo } = req.body;
  if (!nombre || !ajuste) return res.status(400).json({ success: false, message: 'Nombre y ajuste requeridos' });
  try {
    const [result] = await pool.query('UPDATE Tallas SET nombre = ?, ajuste = ?, pecho = ?, cintura = ?, cadera = ?, largo = ? WHERE id_talla = ?', [nombre, ajuste, pecho || null, cintura || null, cadera || null, largo || null, id]);
    if (result.affectedRows > 0) return res.json({ success: true });
    return res.status(404).json({ success: false, message: 'Talla no encontrada' });
  } catch (e) {
    console.error('Error editar talla:', e.message);
    return res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});
app.delete('/api/tallas/:id', requiereRol('administrador'), async (req, res) => {
  const id = req.params.id;
  try {
    // Verificar uso en Inventario
    const [cnt] = await pool.query('SELECT COUNT(*) as total FROM Inventario WHERE id_talla = ?', [id]);
    const total = (Array.isArray(cnt) && cnt[0]) ? cnt[0].total : (cnt.total || 0);
    if (total > 0) {
      return res.status(400).json({ success: false, message: `No se puede eliminar: ${total} registro(s) en inventario usan esta talla` });
    }
    const [delRes] = await pool.query('DELETE FROM Tallas WHERE id_talla = ?', [id]);
    if (delRes.affectedRows > 0) return res.json({ success: true });
    return res.status(404).json({ success: false, message: 'Talla no encontrada' });
  } catch (e) {
    console.error('Error eliminar talla:', e.message);
    res.status(500).json({ ok: false, message: 'Error del servidor al eliminar talla' });
  }
});

// Endpoint genérico para validar eliminación (usado por el front-end)
app.get('/api/:tipo/validar-eliminacion/:id', requiereRol('administrador'), async (req, res) => {
  const tipo = req.params.tipo;
  const id = req.params.id;
  try {
    let query;
    switch (tipo) {
      case 'categorias':
        query = 'SELECT COUNT(*) as total FROM Productos WHERE id_categoria = ?';
        break;
      case 'tallas':
        query = 'SELECT COUNT(*) as total FROM Inventario WHERE id_talla = ?';
        break;
      case 'proveedores':
        query = 'SELECT COUNT(*) as total FROM Productos WHERE id_proveedor = ?';
        break;
      default:
        return res.status(400).json({ puedeEliminar: false, message: 'Tipo no válido' });
    }
    const [cnt] = await pool.query(query, [id]);
    const total = (Array.isArray(cnt) && cnt[0]) ? cnt[0].total : (cnt.total || 0);
    if (total > 0) {
      return res.json({ puedeEliminar: false, message: `No se puede eliminar: ${total} producto(s) usan este elemento`, total });
    }
    return res.json({ puedeEliminar: true, message: 'El elemento no está en uso', total: 0 });
  } catch (e) {
    console.error('Error validar-eliminacion:', e.message);
    return res.status(500).json({ puedeEliminar: false, message: 'Error del servidor al validar eliminación' });
  }
});
app.get('/api/proveedores', requiereRol('administrador'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id_proveedor, nombre FROM Proveedores ORDER BY nombre');
    res.json({ proveedores: rows });
  } catch (e) {
    res.status(500).json({ proveedores: [] });
  }
});
// Editar proveedor (PUT)
app.put('/api/proveedores/:id', requiereRol('administrador'), async (req, res) => {
  const id = req.params.id;
  const { nombre, contacto, telefono } = req.body;
  if (!nombre || nombre.trim() === '') return res.status(400).json({ success: false, message: 'Nombre requerido' });
  try {
    const [result] = await pool.query('UPDATE Proveedores SET nombre = ?, contacto = ?, telefono = ? WHERE id_proveedor = ?', [nombre.trim(), contacto || null, telefono || null, id]);
    if (result.affectedRows > 0) return res.json({ success: true });
    return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
  } catch (e) {
    console.error('Error editar proveedor:', e.message);
    return res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});
app.post('/api/proveedores', requiereRol('administrador'), async (req, res) => {
  const { nombre, contacto, telefono } = req.body;
  if (!nombre) return res.json({ ok: false });
  try {
    await pool.query('INSERT INTO Proveedores (nombre, contacto, telefono) VALUES (?, ?, ?)', [nombre, contacto, telefono]);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});
// Nuevo endpoint: Registro de productos completo (usado por admin.html)
app.post('/api/productos', requiereRol('administrador'), async (req, res) => {
  const { marca, categoria, proveedor, nombre, precio, inventario, cantidades } = req.body;
  try {
    // 1. Insertar producto principal
    const [prodResult] = await pool.query(
      'INSERT INTO Productos (nombre, marca, precio_venta, inventario, id_categoria, id_proveedor) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre, marca, precio, inventario, categoria, proveedor]
    );
    const id_producto = prodResult.insertId;
    // 2. Insertar cantidades por talla en InventarioTallas
    if (Array.isArray(cantidades)) {
      for (const t of cantidades) {
        await pool.query('INSERT INTO Inventario (id_producto, id_talla, cantidad) VALUES (?, ?, ?)', [id_producto, t.id_talla, t.cantidad]);
      }
    }
    res.json({ ok: true, id_producto });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al registrar producto' });
  }
});
// Listar productos (GET)
// Obtener producto por ID (GET)
app.get('/api/admin/productos/:id', requiereRol('administrador'), async (req, res) => {
  const id = req.params.id;
  try {
    const [rows] = await pool.query('SELECT id_producto, nombre, marca, inventario, precio_venta, id_categoria, id_proveedor FROM Productos WHERE id_producto = ?', [id]);
    if (rows.length > 0) {
      res.json({ producto: rows[0] });
    } else {
      res.json({ producto: null });
    }
  } catch (e) {
    res.json({ producto: null });
  }
});
// Editar producto (PUT)
app.put('/api/admin/productos/:id', requiereRol('administrador'), async (req, res) => {
  const id = req.params.id;
  const { marca, nombre, inventario, precio, id_categoria, id_proveedor } = req.body;
  try {
    await pool.query('UPDATE Productos SET marca = ?, nombre = ?, inventario = ?, precio_venta = ?, id_categoria = ?, id_proveedor = ? WHERE id_producto = ?', [marca, nombre, inventario, precio, id_categoria, id_proveedor, id]);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});
// Eliminar producto (DELETE)
app.delete('/api/admin/productos/:id', requiereRol('administrador'), async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query('DELETE FROM Productos WHERE id_producto = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});
app.get('/api/admin/productos', requiereRol('administrador'), async (req, res) => {
  const { q } = req.query;
  try {
    let query = 'SELECT id_producto, nombre, marca, inventario, precio_venta FROM Productos';
    let params = [];
    if (q) {
      query += ' WHERE nombre LIKE ?';
      params.push(`%${q}%`);
    }
    query += ' LIMIT 100';
    const [rows] = await pool.query(query, params);

    // Obtener cantidades por talla para cada producto
    for (const prod of rows) {
      const [tallas] = await pool.query(
        'SELECT Tallas.nombre AS talla, Inventario.cantidad FROM Inventario JOIN Tallas ON Inventario.id_talla = Tallas.id_talla WHERE Inventario.id_producto = ?',
        [prod.id_producto]
      );
      prod.tallas = tallas.map(t => `${t.talla}=${t.cantidad}`).join(' ');
    }
    res.json({ productos: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al consultar productos' });
  }
});

// Crear producto (POST)
app.post('/api/admin/productos', requiereRol('administrador'), async (req, res) => {
  const { nombre, descripcion, precio_venta, id_categoria } = req.body;
  // Usamos id_categoria: 1 como valor por defecto/ejemplo
  const final_id_categoria = id_categoria || 1; 
  try {
    const [result] = await pool.query(
      'INSERT INTO Productos (nombre, descripcion, precio_venta, id_categoria) VALUES (?, ?, ?, ?)',
      [nombre, descripcion || '', precio_venta, final_id_categoria]
    );
    res.json({ ok: true, id_producto: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// ---------------- Caja (rutas protegidas) ----------------
// Buscar cliente por cédula
app.get('/api/clientes/buscar', requiereRol('caja'), async (req, res) => {
  const cedula = req.query.cedula;
  if (!cedula) return res.json({ cliente: null });
  try {
    const [rows] = await pool.query('SELECT id_cliente, nombre, cedula, telefono, email FROM Clientes WHERE cedula = ? LIMIT 1', [cedula]);
    if (rows.length > 0) {
      res.json({ cliente: rows[0] });
    } else {
      res.json({ cliente: null });
    }
  } catch (e) {
    res.json({ cliente: null });
  }
});
// Nuevo endpoint: Registro de ventas completo (usado por caja.html)
app.post('/api/ventas', requiereRol('caja'), async (req, res) => {
  const { cliente_nombre, cliente_cedula, cliente_telefono, cliente_email, marca, talla, cantidad, precio_unitario, total_dolar, total_bs, tipo_pago } = req.body;
  try {
    // 1. Buscar o crear cliente
    let id_cliente = null;
    const [cliRows] = await pool.query('SELECT id_cliente FROM Clientes WHERE cedula = ?', [cliente_cedula]);
    if (cliRows.length > 0) {
      id_cliente = cliRows[0].id_cliente;
    } else {
      const [cliRes] = await pool.query('INSERT INTO Clientes (nombre, cedula, telefono, email) VALUES (?, ?, ?, ?)', [cliente_nombre, cliente_cedula, cliente_telefono || '', cliente_email || '']);
      id_cliente = cliRes.insertId;
    }
    // 2. Registrar venta principal
    const [ventaRes] = await pool.query(
      'INSERT INTO Ventas (fecha_hora, total_venta, tipo_pago, id_usuario, id_cliente) VALUES (NOW(), ?, ?, ?, ?)',
      [total_dolar, tipo_pago, req.session.user.id, id_cliente]
    );
    const id_venta = ventaRes.insertId;
    // 3. Registrar detalle de venta
    // Buscar id_producto por marca (simplificado)
    const [prodRows] = await pool.query('SELECT id_producto FROM Productos WHERE marca = ? LIMIT 1', [marca]);
    let id_producto = prodRows.length > 0 ? prodRows[0].id_producto : null;
  // Buscar id_talla
  const [tallaRows] = await pool.query('SELECT id_talla FROM Tallas WHERE nombre = ?', [talla]);
  let id_talla = tallaRows.length > 0 ? tallaRows[0].id_talla : null;
    if (id_producto && id_talla) {
      await pool.query('INSERT INTO DetalleVenta (id_venta, id_producto, id_talla, cantidad, precio_unitario) VALUES (?, ?, ?, ?, ?)', [id_venta, id_producto, id_talla, cantidad, precio_unitario]);
    }
    res.json({ ok: true, id_venta });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al registrar venta' });
  }
});
// Endpoint para tasa BCV (simulado)
app.get('/api/tasa-bcv', async (req, res) => {
  // Aquí deberías consultar una API real, pero devolvemos un valor fijo de ejemplo
  res.json({ tasa: 36 });
});
// Registro de venta simple (AJUSTADO para coincidir con la llamada simple del front-end)
app.post('/api/caja/venta', requiereRol('caja'), async (req, res) => {
  const { id_cliente, monto } = req.body;
  
  // Datos simplificados para la venta a través del formulario de "Caja"
  const total_venta = monto;
  const tipo_pago = 'Efectivo'; // Valor por defecto
  
  try {
    // 1) Crear venta (en tabla Ventas)
    const [ventaResult] = await pool.query(
      `INSERT INTO Ventas (fecha_hora, total_venta, tipo_pago, id_usuario, id_cliente)
       VALUES (NOW(), ?, ?, ?, ?)`,
      [total_venta, tipo_pago, req.session.user.id, id_cliente || null]
    );
    const id_venta = ventaResult.insertId;

    // Aquí no se inserta DetalleVenta ni se actualiza Inventario
    // porque el formulario del front-end es muy simple,
    // pero la ruta es funcional y registra la venta principal.
    
    res.json({ ok: true, id_venta });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al registrar venta' });
  }
});

// Ejemplo de función para generar hash (solo para la primera vez)
app.get('/api/generar-hash/:password', async (req, res) => {
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(req.params.password, salt);
    res.send({ password: req.params.password, hash: hash, nota: 'Usar este hash en phpMyAdmin para crear el usuario' });
  } catch (e) {
    res.status(500).json({ error: 'Error al generar hash' });
  }
});

// Inicio del servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});