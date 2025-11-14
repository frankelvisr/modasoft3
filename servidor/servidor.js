// servidor/servidor.js

const express = require('express');
const path = require('path');
let bcrypt;
try {
  // prefer native bcrypt if available
  bcrypt = require('bcrypt');
} catch (e) {
  // fallback to bcryptjs (pure JS) which is already installed
  bcrypt = require('bcryptjs');
}
const { pool, verificarConexiónBD, obtenerProductos } = require('./db'); // db.js con MySQL
const { verificarCredenciales } = require('./auth');
const cookieSession = require('cookie-session');

// 1. INICIALIZAR APP DE EXPRESS
const app = express();

// 2. MIDDLEWARE DE AUTENTICACIÓN (debe ir antes de las rutas que lo usan)
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

// 3. MIDDLEWARE GENERAL
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieSession({
  name: 'session',
  keys: ['clave-secreta-unica'], // reemplaza por una clave real en producción
  maxAge: 1000 * 60 * 60 // 1 hora
}));

// Servir archivos estáticos (front-end)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Revisión segura del esquema al iniciar: detecta si existe `id_talla` en `detallecompra` o FKs
// NO realiza cambios destructivos por defecto. Si de verdad quieres que el servidor ejecute
// las operaciones de eliminación automáticamente, exporta la variable de entorno
// FORCE_SCHEMA_MIGRATE=1 antes de arrancar.
// Mostrar mensajes de revisión de esquema solo si se define la variable de entorno
const SHOW_SCHEMA_WARNINGS = process.env.SHOW_SCHEMA_WARNINGS === '1';

(async function revisarEsquemaDetalleCompra() {
  try {
    // 1) Verificar si la columna existe
    const [cols] = await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'detallecompra' AND COLUMN_NAME = 'id_talla'");
    const hasColumn = Array.isArray(cols) && cols.length > 0;

    // 2) Buscar FKs que referencien la tabla 'tallas'
    const [fks] = await pool.query("SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'detallecompra' AND REFERENCED_TABLE_NAME = 'tallas'");
    const fkNames = Array.isArray(fks) ? fks.map(r => r.CONSTRAINT_NAME) : [];

    if (!hasColumn && fkNames.length === 0) {
      if (SHOW_SCHEMA_WARNINGS) console.log('Esquema: no se detectó columna id_talla ni FKs en detallecompra. No se requieren cambios.');
      return;
    }

    if (SHOW_SCHEMA_WARNINGS) console.log('Esquema: detectado', hasColumn ? 'columna id_talla' : '', fkNames.length ? 'FK(s): ' + fkNames.join(',') : '');

    if (process.env.FORCE_SCHEMA_MIGRATE === '1' || process.env.ALLOW_DESTRUCTIVE_MIGRATIONS === '1') {
      // Ejecutar migración destructiva SOLO si el usuario lo autoriza explícitamente
      try {
        // Eliminar cada FK detectada
        for (const fkName of fkNames) {
          try {
            await pool.query(`ALTER TABLE detallecompra DROP FOREIGN KEY \`${fkName}\``);
            console.log(`Esquema: se eliminó la FK ${fkName} en detallecompra`);
          } catch (e) {
            console.warn(`No se pudo eliminar la FK ${fkName}:`, e.message || e);
          }
        }

        // Eliminar columna si existe
        if (hasColumn) {
          try {
            await pool.query('ALTER TABLE detallecompra DROP COLUMN id_talla');
            console.log('Esquema: columna detallecompra.id_talla eliminada.');
          } catch (e) {
            console.warn('No se pudo eliminar detallecompra.id_talla:', e.message || e);
          }
        }
      } catch (e) {
        console.warn('Error durante migración forzada de esquema:', e.message || e);
      }
      } else {
      // No modificar; informar instrucciones para el usuario solo si el admin lo solicita expresamente
      if (SHOW_SCHEMA_WARNINGS) {
        console.log('\nATENCIÓN: se detectó que el esquema tiene campo o FKs relacionadas con tallas en detallecompra.');
        console.log('Por seguridad no se realizan cambios destructivos automáticamente.');
        if (fkNames.length > 0) console.log('FKs detectadas:', fkNames.join(', '));
        if (hasColumn) console.log('Columna detectada: detallecompra.id_talla');
        console.log('\nSi quieres ejecutar la migración automática en este entorno, arranca el servidor con:');
        console.log('  FORCE_SCHEMA_MIGRATE=1 npm run start');
        console.log('O ejecuta manualmente las siguientes sentencias SQL (reemplaza <FK_NAME> por el nombre real):');
        console.log("  ALTER TABLE detallecompra DROP FOREIGN KEY <FK_NAME>;  -- ejecutar por cada FK detectada");
        console.log('  ALTER TABLE detallecompra DROP COLUMN id_talla;');
        console.log('Si no estás seguro, haz un backup de la base de datos antes de realizar cambios.\n');
      }
    }
  } catch (e) {
    console.warn('Advertencia al revisar esquema detallecompra:', e.message || e);
  }
})();

// Helper: procesar venta (reusable por /api/ventas y /api/caja/venta)
async function procesarVenta(itemsInput, clienteData, tipo_pago, userId) {
  // itemsInput: array of {id_producto, id_talla, cantidad, precio_unitario}
  const items = itemsInput.map(it => ({
    id_producto: Number(it.id_producto),
    id_talla: it.id_talla ? Number(it.id_talla) : null,
    cantidad: Number(it.cantidad) || 0,
    precio_unitario: Number(it.precio_unitario) || 0,
    // Opciones opcionales del cliente/cajero
    no_aplicar_promocion: !!it.no_aplicar_promocion,
    force_promotion_id: it.force_promotion_id ? Number(it.force_promotion_id) : null,
    // El front puede enviar idCategoria (ventaCategoria) para ayudar en matching de promociones.
    // Por seguridad, el servidor solo usará este valor como fallback si el producto no tiene categoría.
    preferred_id_categoria: it.idCategoria ? Number(it.idCategoria) : (it.id_categoria ? Number(it.id_categoria) : null)
  }));

  // 1) Verificar stock
  for (const it of items) {
    if (!it.id_producto || !it.cantidad || it.cantidad <= 0) throw new Error('Item inválido: id_producto y cantidad son requeridos');
    if (it.id_talla) {
      const [invRows] = await pool.query('SELECT cantidad FROM inventario WHERE id_producto = ? AND id_talla = ? LIMIT 1', [it.id_producto, it.id_talla]);
      if (invRows.length === 0) throw new Error(`No hay inventario para producto ${it.id_producto} talla ${it.id_talla}`);
      const disponible = Number(invRows[0].cantidad) || 0;
      if (disponible < it.cantidad) throw new Error(`Stock insuficiente para producto ${it.id_producto} talla ${it.id_talla}. Disponible: ${disponible}`);
    } else {
      const [pRows] = await pool.query('SELECT inventario FROM productos WHERE id_producto = ? LIMIT 1', [it.id_producto]);
      if (pRows.length === 0) throw new Error(`Producto no encontrado: ${it.id_producto}`);
      const disponible = Number(pRows[0].inventario || 0);
      if (disponible < it.cantidad) throw new Error(`Stock insuficiente para producto ${it.id_producto}. Disponible: ${disponible}`);
    }
  }

  // 2) Buscar o crear cliente
  let id_cliente = null;
  if (clienteData && clienteData.cedula) {
    const [cliRows] = await pool.query('SELECT id_cliente FROM clientes WHERE cedula = ? LIMIT 1', [clienteData.cedula]);
    if (cliRows.length > 0) {
      id_cliente = cliRows[0].id_cliente;
    } else {
      const [cliRes] = await pool.query('INSERT INTO clientes (nombre, cedula, telefono, email) VALUES (?, ?, ?, ?)', [clienteData.nombre || '', clienteData.cedula || null, clienteData.telefono || '', clienteData.email || '']);
      id_cliente = cliRes.insertId;
    }
  }

  // 3) Obtener promociones activas
  const todayStr = new Date().toISOString().slice(0,10);
  console.log(`[PROCESAR VENTA] Buscando promociones activas para fecha: ${todayStr}`);
  
  // Cargar promociones activas (activa=1 y fecha actual entre fecha_inicio y fecha_fin)
  // Usar CURDATE() para asegurar compatibilidad
  const [promos] = await pool.query(
    `SELECT * FROM promociones 
     WHERE activa = 1 
     AND CURDATE() >= DATE(fecha_inicio) 
     AND CURDATE() <= DATE(fecha_fin)`, 
    []
  );
  
  console.log(`[PROCESAR VENTA] Encontradas ${promos.length} promociones activas para procesar`);

  // 4) Obtener info de productos
  const prodIds = [...new Set(items.map(i => i.id_producto))];
  const [productosInfo] = await pool.query(`SELECT id_producto, id_categoria, precio_venta FROM productos WHERE id_producto IN (${prodIds.map(_=>'?').join(',')})`, prodIds);
  const prodMap = {};
  productosInfo.forEach(p => { prodMap[p.id_producto] = p; });

  // Si el cajero envió una categoría preferida para una línea y el producto no tiene categoría,
  // podemos usar esa preferencia como fallback para la evaluación de promociones.
  // Solo aplicamos el fallback si la categoría existe en la tabla `categorias`.
  try {
    const preferredCats = [...new Set(items.map(it => it.preferred_id_categoria).filter(Boolean))];
    if (preferredCats.length > 0) {
      const [existingCats] = await pool.query(`SELECT id_categoria FROM categorias WHERE id_categoria IN (${preferredCats.map(_=>'?').join(',')})`, preferredCats);
      const existingSet = new Set(existingCats.map(c => Number(c.id_categoria)));
      // Aplicar fallback por producto si no tiene id_categoria
      for (const it of items) {
        if (!prodMap[it.id_producto]) continue;
        if ((!prodMap[it.id_producto].id_categoria || prodMap[it.id_producto].id_categoria === null) && it.preferred_id_categoria && existingSet.has(Number(it.preferred_id_categoria))) {
          // Solo modificar en memoria para uso en matching; no alteramos la base de datos aquí.
          prodMap[it.id_producto].id_categoria = Number(it.preferred_id_categoria);
        }
      }
    }
  } catch (e) {
    // No fatal: si falla esta verificación, seguimos con la lógica normal sin fallback.
    console.warn('No se pudo validar categorías preferidas proporcionadas por la caja:', e.message || e);
  }

  // 5) Calcular descuentos
  const descuentosPorItem = [];
  let subtotalCarrito = 0;
  for (const it of items) {
    const precio = it.precio_unitario || (prodMap[it.id_producto] && prodMap[it.id_producto].precio_venta) || 0;
    const subtotal = precio * it.cantidad;
    subtotalCarrito += subtotal;
  }

  for (const it of items) {
    const precio = it.precio_unitario || (prodMap[it.id_producto] && prodMap[it.id_producto].precio_venta) || 0;
    const subtotal = precio * it.cantidad;
    let mejor = { descuento: 0, id_promocion: null };
    
    // IMPORTANTE: Las promociones son INDEPENDIENTES de la talla (id_talla)
    // Una promoción aplica al producto sin importar la talla (XS, S, M, L, XL, XXL, etc.)
    console.log(`[PROCESAR VENTA] Evaluando promociones para producto ${it.id_producto}, talla: ${it.id_talla || 'Sin talla'} - Las promociones NO dependen de la talla`);
    
    // Si el cajero indicó que no aplique promociones para este item, saltar evaluación
    if (it.no_aplicar_promocion) {
      descuentosPorItem.push({ item: it, descuento: 0, id_promocion: null });
      continue;
    }
    // Si el cajero forzó una promoción, intentar aplicarla únicamente
    if (it.force_promotion_id) {
      const forced = promos.find(pp => Number(pp.id_promocion) === Number(it.force_promotion_id));
      if (forced) {
        let descuentoForced = 0;
        // Validaciones similares a las de abajo
        if (forced.id_producto && Number(forced.id_producto) !== Number(it.id_producto)) {
          // no aplicable
        } else if (forced.id_categoria) {
          // Priorizar la categoría enviada por el frontend (si existe), sino usar la del producto
          const catEnviada = it.preferred_id_categoria || it.idCategoria || it.id_categoria;
          const catProducto = prodMap[it.id_producto] && prodMap[it.id_producto].id_categoria;
          const cat = catEnviada || catProducto;
          if (!cat || Number(cat) !== Number(forced.id_categoria)) {
            // no aplicable
          } else {
            // calcular
            if (forced.tipo_promocion === 'DESCUENTO_PORCENTAJE') descuentoForced = (it.precio_unitario || prodMap[it.id_producto].precio_venta || 0) * it.cantidad * (Number(forced.valor||0)/100);
            else if (forced.tipo_promocion === 'DESCUENTO_FIJO') {
              const val = Number(forced.valor||0);
              descuentoForced = forced.id_producto || forced.id_categoria ? (it.cantidad * val) : (subtotalCarrito > 0 ? ( (it.precio_unitario || prodMap[it.id_producto].precio_venta || 0) * it.cantidad / subtotalCarrito) * val : 0);
            } else if (forced.tipo_promocion === 'COMPRA_X_LLEVA_Y') {
              const px = Number(forced.param_x||0); const py = Number(forced.param_y||0);
              if (px>0 && py>=0) { const bloque = px+py; const completos = Math.floor(it.cantidad / bloque); const gratis = completos * py; descuentoForced = gratis * (it.precio_unitario || prodMap[it.id_producto].precio_venta || 0); }
            }
            descuentosPorItem.push({ item: it, descuento: descuentoForced || 0, id_promocion: forced.id_promocion });
            continue;
          }
        } else {
          // promotion without id_categoria/id_producto (global)
          if (forced.tipo_promocion === 'DESCUENTO_PORCENTAJE') descuentoForced = (it.precio_unitario || prodMap[it.id_producto].precio_venta || 0) * it.cantidad * (Number(forced.valor||0)/100);
          else if (forced.tipo_promocion === 'DESCUENTO_FIJO') { const val = Number(forced.valor||0); descuentoForced = subtotalCarrito>0 ? ((it.precio_unitario || prodMap[it.id_producto].precio_venta || 0) * it.cantidad / subtotalCarrito) * val : 0; }
          else if (forced.tipo_promocion === 'COMPRA_X_LLEVA_Y') { const px = Number(forced.param_x||0); const py = Number(forced.param_y||0); if (px>0 && py>=0) { const bloque = px+py; const completos = Math.floor(it.cantidad / bloque); const gratis = completos * py; descuentoForced = gratis * (it.precio_unitario || prodMap[it.id_producto].precio_venta || 0); } }
          descuentosPorItem.push({ item: it, descuento: descuentoForced || 0, id_promocion: forced.id_promocion });
          continue;
        }
      }
      // Si la promoción forzada no es válida, continuamos con evaluación normal
    }
    for (const p of promos) {
      // Verificar producto (si la promoción es específica de producto)
      if (p.id_producto && Number(p.id_producto) !== Number(it.id_producto)) continue;
      
      // Verificar categoría (si la promoción es específica de categoría)
      if (p.id_categoria) {
        // Priorizar la categoría enviada por el frontend (si existe), sino usar la del producto
        const catEnviada = it.preferred_id_categoria || it.idCategoria || it.id_categoria;
        const catProducto = prodMap[it.id_producto] && prodMap[it.id_producto].id_categoria;
        const cat = catEnviada || catProducto;
        if (!cat || Number(cat) !== Number(p.id_categoria)) continue;
      }
      
      // NOTA: NO verificamos id_talla aquí. Las promociones aplican a CUALQUIER talla del producto.
      // Esto significa que una promoción para un producto o categoría aplica a todas las tallas (XS, S, M, L, XL, XXL, etc.)
      const minimo = Number(p.minimo_compra || 0);
      if (minimo > 0) {
        const scopeSubtotal = (p.id_producto || p.id_categoria) ? subtotal : subtotalCarrito;
        if (scopeSubtotal < minimo) continue;
      }
      let descuento = 0;
      if (p.tipo_promocion === 'DESCUENTO_PORCENTAJE') {
        descuento = subtotal * (Number(p.valor || 0) / 100);
      } else if (p.tipo_promocion === 'DESCUENTO_FIJO') {
        const val = Number(p.valor || 0);
        if (p.id_producto || p.id_categoria) descuento = it.cantidad * val;
        else descuento = subtotalCarrito > 0 ? (subtotal / subtotalCarrito) * val : 0;
      } else if (p.tipo_promocion === 'COMPRA_X_LLEVA_Y') {
        const paramX = Number(p.param_x || 0);
        const paramY = Number(p.param_y || 0);
        if (paramX > 0 && paramY >= 0) {
          const bloque = paramX + paramY;
          const completos = Math.floor(it.cantidad / bloque);
          const gratis = completos * paramY;
          descuento = gratis * precio;
        }
      }
      if (descuento > mejor.descuento) mejor = { descuento, id_promocion: p.id_promocion };
    }
    descuentosPorItem.push({ item: it, descuento: mejor.descuento || 0, id_promocion: mejor.id_promocion || null });
  }

  const totalDescuentos = descuentosPorItem.reduce((s, d) => s + Number(d.descuento || 0), 0);
  const subtotalSuma = items.reduce((s, it) => s + ((it.precio_unitario || (prodMap[it.id_producto] && prodMap[it.id_producto].precio_venta) || 0) * it.cantidad), 0);
  const totalFinal = Math.max(0, subtotalSuma - totalDescuentos);

  // Insert venta
  const [ventaRes] = await pool.query('INSERT INTO ventas (fecha_hora, total_venta, tipo_pago, id_usuario, id_cliente) VALUES (NOW(), ?, ?, ?, ?)', [totalFinal, tipo_pago || 'Efectivo', userId, id_cliente || null]);
  const id_venta = ventaRes.insertId;

  // Insert detalle
  const [colsDetalle] = await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'detalleventa'");
  const colNames = colsDetalle.map(c => c.COLUMN_NAME);
  const hasPromoCols = colNames.includes('id_promocion_aplicada') && colNames.includes('descuento_unitario') && colNames.includes('descuento_total');

  for (const dp of descuentosPorItem) {
    const it = dp.item;
    const descuento = Number(dp.descuento || 0);
    const precio = it.precio_unitario || (prodMap[it.id_producto] && prodMap[it.id_producto].precio_venta) || 0;
    const descuentoUnitario = it.cantidad > 0 ? (descuento / it.cantidad) : 0;
    if (hasPromoCols) {
      await pool.query('INSERT INTO detalleventa (id_venta, id_producto, id_talla, cantidad, precio_unitario, id_promocion_aplicada, descuento_unitario, descuento_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id_venta, it.id_producto, it.id_talla || null, it.cantidad, precio, dp.id_promocion || null, descuentoUnitario, descuento]);
    } else {
      await pool.query('INSERT INTO detalleventa (id_venta, id_producto, id_talla, cantidad, precio_unitario) VALUES (?, ?, ?, ?, ?)', [id_venta, it.id_producto, it.id_talla || null, it.cantidad, precio]);
    }
    // Actualizar inventario: RESTAR cantidad (disminuir stock)
    if (it.id_talla) {
      // Restar del inventario por talla
      await pool.query('UPDATE inventario SET cantidad = GREATEST(0, cantidad - ?) WHERE id_producto = ? AND id_talla = ?', [it.cantidad, it.id_producto, it.id_talla]);
      console.log(`[PROCESAR VENTA] Restando ${it.cantidad} unidades de inventario para producto ${it.id_producto} talla ${it.id_talla}`);
    }
    // Restar del inventario total del producto
    await pool.query('UPDATE productos SET inventario = GREATEST(0, inventario - ?) WHERE id_producto = ?', [it.cantidad, it.id_producto]);
    console.log(`[PROCESAR VENTA] Restando ${it.cantidad} unidades del inventario total del producto ${it.id_producto}`);
  }

  return { id_venta, total: totalFinal, descuentos: totalDescuentos };
}
// Revisión segura para 'detalleventa' y columnas necesarias para promociones
(async function revisarEsquemaDetalleVentaYPromos() {
  try {
    // Verificar columnas en detalleventa
    const [cols] = await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'detalleventa'");
    const names = cols.map(c => c.COLUMN_NAME);
    const needCols = [];
    if (!names.includes('id_promocion_aplicada')) needCols.push('id_promocion_aplicada');
    if (!names.includes('descuento_unitario')) needCols.push('descuento_unitario');
    if (!names.includes('descuento_total')) needCols.push('descuento_total');

    // Verificar columnas param_x/param_y en promociones
    const [colsPromo] = await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promociones'");
    const promoNames = colsPromo.map(c => c.COLUMN_NAME);
    const needPromoCols = [];
    if (!promoNames.includes('param_x')) needPromoCols.push('param_x');
    if (!promoNames.includes('param_y')) needPromoCols.push('param_y');

    if (needCols.length === 0 && needPromoCols.length === 0) {
      if (SHOW_SCHEMA_WARNINGS) console.log('Esquema: detalleventa y promociones ya contienen columnas necesarias para promociones.');
      return;
    }

  // columnas faltantes detectadas (silenciadas para no mostrar advertencias en inicio)

  if (process.env.FORCE_SCHEMA_MIGRATE === '1' || process.env.ALLOW_DESTRUCTIVE_MIGRATIONS === '1') {
      // Ejecutar ALTER TABLE para agregar columnas faltantes (no destructivo)
      try {
        for (const c of needCols) {
          if (c === 'id_promocion_aplicada') {
            await pool.query('ALTER TABLE detalleventa ADD COLUMN id_promocion_aplicada INT NULL');
            console.log('Esquema: columna detalleventa.id_promocion_aplicada creada');
          } else if (c === 'descuento_unitario') {
            await pool.query('ALTER TABLE detalleventa ADD COLUMN descuento_unitario DECIMAL(10,2) NOT NULL DEFAULT 0');
            console.log('Esquema: columna detalleventa.descuento_unitario creada');
          } else if (c === 'descuento_total') {
            await pool.query('ALTER TABLE detalleventa ADD COLUMN descuento_total DECIMAL(12,2) NOT NULL DEFAULT 0');
            console.log('Esquema: columna detalleventa.descuento_total creada');
          }
        }

        for (const c of needPromoCols) {
          if (c === 'param_x') {
            await pool.query('ALTER TABLE promociones ADD COLUMN param_x INT NULL');
            console.log('Esquema: columna promociones.param_x creada');
          } else if (c === 'param_y') {
            await pool.query('ALTER TABLE promociones ADD COLUMN param_y INT NULL');
            console.log('Esquema: columna promociones.param_y creada');
          }
        }
      } catch (e) {
        console.warn('Error aplicando migración de columnas extras:', e.message || e);
      }
      } else {
      // No modificar la base de datos automáticamente. Mostrar mensaje informativo no intrusivo solo si se solicita.
      if (SHOW_SCHEMA_WARNINGS) {
        console.info('Esquema: faltan columnas opcionales para soporte completo de promociones. El servidor funcionará normalmente sin estas columnas.');
        console.info('Si deseas crearlas más tarde, arranca el servidor con: FORCE_SCHEMA_MIGRATE=1 (asegúrate de tener un backup).');
      }
    }
  } catch (e) {
    console.warn('Advertencia al revisar esquema detalleventa/promociones:', e.message || e);
  }
})();


// ---------------- Rutas compartidas: Logout ----------------
app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

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

// ---------------- Endpoint para tasa BCV con cache y fallback ----------------
let _cachedTasa = null;
let _cachedTasaTs = 0;
const TASA_CACHE_MS = 1000 * 60 * 5; // 5 minutos
const fetch = require('node-fetch');

// URL por defecto para consultar la tasa si no se provee la variable de entorno
const BCV_API_URL = process.env.BCV_API_URL || 'https://api.dolarvzla.com/public/exchange-rate';

app.get('/api/tasa-bcv', async (req, res) => {
  const now = Date.now();
  if (_cachedTasa && (now - _cachedTasaTs) < TASA_CACHE_MS) {
    return res.json({ tasa: _cachedTasa, source: 'cache' });
  }
  try {
    // Intentar obtener desde URL configurada (ej: BCV real si la proporcionas)
    if (BCV_API_URL) {
      const resp = await fetch(BCV_API_URL, { timeout: 5000 });
      const json = await resp.json();
      // Soporte para varios formatos: si la API devuelve { current: { usd, date } } usamos current.usd
      let tasaFromApi;
      if (json && json.current && typeof json.current === 'object' && typeof json.current.usd !== 'undefined') {
        tasaFromApi = json.current.usd;
        // opcional: exponer fecha en la respuesta si viene
        const fecha = json.current.date || json.current.fecha || null;
        const parsed = parseFloat(tasaFromApi);
        if (!isNaN(parsed) && parsed > 0) {
          _cachedTasa = parsed;
          _cachedTasaTs = Date.now();
          return res.json({ tasa: _cachedTasa, source: 'BCV_API_URL', fecha: fecha || null });
        }
      }
      // Se asume también que la respuesta puede tener 'tasa' o 'valor' o estructuras antiguas
      const fallbackTasa = json.tasa || json.valor || json.USD || (json.data && json.data.USD);
      const tasa = parseFloat(fallbackTasa);
      if (!isNaN(tasa) && tasa > 0) {
        _cachedTasa = tasa;
        _cachedTasaTs = Date.now();
        return res.json({ tasa: _cachedTasa, source: 'BCV_API_URL' });
      }
    }
    // Fallback: intentar fuente pública (ej. DolarToday JSON como fallback)
    try {
      const resp2 = await fetch('https://s3.amazonaws.com/dolartoday/data.json', { timeout: 5000 });
      const json2 = await resp2.json();
      const tasaDt = json2 && json2.USD && (json2.USD.transferencia || json2.USD.promedio) || json2.USD && json2.USD.sicad2;
      const tasa = parseFloat(tasaDt);
      if (!isNaN(tasa) && tasa > 0) {
        _cachedTasa = tasa;
        _cachedTasaTs = Date.now();
        return res.json({ tasa: _cachedTasa, source: 'dtd-fallback' });
      }
    } catch (e) {
      // no hay fallback exitoso
    }
    // Último recurso: valor fijo (fallback)
    _cachedTasa = 36;
    _cachedTasaTs = Date.now();
    return res.json({ tasa: _cachedTasa, source: 'fallback' });
  } catch (e) {
    console.error('Error obtener tasa BCV:', e.message);
    _cachedTasa = 36;
    _cachedTasaTs = Date.now();
    res.json({ tasa: _cachedTasa, source: 'error-fallback' });
  }
});

// ==================== DEVOLUCIONES (CAJA) ====================
// Validar acceso al módulo de devoluciones mediante clave en tabla configuracion
app.post('/api/devoluciones/validar-clave', requiereRol('caja'), async (req, res) => {
  try {
    const clave = (req.body && req.body.clave ? String(req.body.clave) : '').trim();
    if (!clave) return res.json({ ok: false });
    const [rows] = await pool.query('SELECT valor FROM configuracion WHERE clave = ? LIMIT 1', ['clave_devoluciones']);
    const ok = rows && rows[0] && String(rows[0].valor) === clave;
    return res.json({ ok: !!ok });
  } catch (e) {
    return res.json({ ok: false });
  }
});

// Listar ventas por número de venta, con detalles y cantidades disponibles para devolución (validación 48 horas)
app.get('/api/devoluciones/venta', requiereRol('caja'), async (req, res) => {
  try {
    const id_venta = req.query.id_venta ? Number(req.query.id_venta) : null;
    console.log(`[DEVOLUCIONES] Buscando venta #${id_venta}`);
    
    if (!id_venta || isNaN(id_venta)) {
      console.log('[DEVOLUCIONES] Número de venta inválido');
      return res.json({ ok: false, ventas: [], error: 'Número de venta inválido' });
    }

    // Obtener la venta
    const [ventasRows] = await pool.query(
      `SELECT id_venta, fecha_hora, total_venta, tipo_pago, id_cliente FROM ventas WHERE id_venta = ? LIMIT 1`,
      [id_venta]
    );
    
    if (!ventasRows || ventasRows.length === 0) {
      console.log(`[DEVOLUCIONES] Venta #${id_venta} no encontrada`);
      return res.json({ ok: true, ventas: [], error: 'Venta no encontrada' });
    }
    
    const venta = ventasRows[0];
    console.log(`[DEVOLUCIONES] Venta encontrada: #${venta.id_venta}, fecha: ${venta.fecha_hora}`);
    
    // Validar que la venta no tenga más de 48 horas
    const fechaVenta = new Date(venta.fecha_hora);
    const ahora = new Date();
    const horasTranscurridas = (ahora - fechaVenta) / (1000 * 60 * 60);
    console.log(`[DEVOLUCIONES] Horas transcurridas: ${horasTranscurridas.toFixed(2)}`);
    
    if (horasTranscurridas > 48) {
      console.log(`[DEVOLUCIONES] Venta #${id_venta} expirada (más de 48 horas)`);
      return res.json({ 
        ok: false, 
        ventas: [], 
        error: `La venta #${id_venta} tiene más de 48 horas. No se puede procesar la devolución. Fecha de venta: ${fechaVenta.toLocaleString()}` 
      });
    }
    
    const ventas = [venta];

    // Para cada venta, obtener detalle + cantidad devuelta acumulada
    for (const v of ventas) {
      const [det] = await pool.query(
        `SELECT d.id_detalle, d.id_producto, d.id_talla, d.cantidad, d.precio_unitario,
                COALESCE(t.nombre, '-') AS nombre_talla,
                COALESCE(p.nombre, '') AS nombre_producto,
                COALESCE(SUM(dev.cantidad), 0) AS devuelta
         FROM detalleventa d
         LEFT JOIN productos p ON p.id_producto = d.id_producto
         LEFT JOIN tallas t ON t.id_talla = d.id_talla
         LEFT JOIN devoluciones dev ON dev.id_detalle = d.id_detalle
         WHERE d.id_venta = ?
         GROUP BY d.id_detalle, d.id_producto, d.id_talla, d.cantidad, d.precio_unitario, t.nombre, p.nombre
         ORDER BY d.id_detalle`,
        [v.id_venta]
      );
      // Calcular cantidad disponible para devolución y precio neto
      const [cols] = await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'detalleventa'");
      const hasDescUnit = Array.isArray(cols) && cols.some(c => c.COLUMN_NAME === 'descuento_unitario');
      const detConDispon = [];
      for (const d of det) {
        const disponible = Math.max(0, Number(d.cantidad || 0) - Number(d.devuelta || 0));
        let precio_neto = Number(d.precio_unitario || 0);
        if (hasDescUnit) {
          try {
            const [rr] = await pool.query('SELECT descuento_unitario FROM detalleventa WHERE id_detalle = ? LIMIT 1', [d.id_detalle]);
            if (rr && rr[0] && rr[0].descuento_unitario != null) precio_neto = Math.max(0, precio_neto - Number(rr[0].descuento_unitario || 0));
          } catch (_) {}
        }
        detConDispon.push({
          id_detalle: d.id_detalle,
          id_producto: d.id_producto,
          id_talla: d.id_talla,
          nombre_producto: d.nombre_producto,
          nombre_talla: d.nombre_talla,
          cantidad: Number(d.cantidad),
          devuelta: Number(d.devuelta),
          disponible,
          precio_unitario: Number(d.precio_unitario),
          precio_neto
        });
      }
      v.detalles = detConDispon;
      console.log(`[DEVOLUCIONES] Venta #${v.id_venta} tiene ${detConDispon.length} detalles`);
    }

    console.log(`[DEVOLUCIONES] Retornando ${ventas.length} venta(s)`);
    return res.json({ ok: true, ventas });
  } catch (e) {
    console.error('[DEVOLUCIONES] Error /api/devoluciones/venta:', e.message || e);
    console.error('[DEVOLUCIONES] Stack:', e.stack);
    return res.status(500).json({ ok: false, ventas: [], error: 'Error del servidor: ' + (e.message || 'Error desconocido') });
  }
});

// Mantener endpoint anterior por compatibilidad (deprecated)
app.get('/api/devoluciones/ventas-cliente', requiereRol('caja'), async (req, res) => {
  try {
    const cedula = req.query.cedula ? String(req.query.cedula).trim() : '';
    if (!cedula) return res.json({ ok: false, ventas: [] });
    const [cliRows] = await pool.query('SELECT id_cliente, nombre FROM clientes WHERE cedula = ? LIMIT 1', [cedula]);
    if (!cliRows || cliRows.length === 0) return res.json({ ok: true, ventas: [] });
    const id_cliente = cliRows[0].id_cliente;

    // Ventas del cliente
    const [ventas] = await pool.query(
      `SELECT id_venta, fecha_hora, total_venta, tipo_pago FROM ventas WHERE id_cliente = ? ORDER BY fecha_hora DESC LIMIT 200`,
      [id_cliente]
    );

    // Para cada venta, obtener detalle + cantidad devuelta acumulada
    for (const v of ventas) {
      const [det] = await pool.query(
        `SELECT d.id_detalle, d.id_producto, d.id_talla, d.cantidad, d.precio_unitario,
                COALESCE(t.nombre, '-') AS nombre_talla,
                COALESCE(p.nombre, '') AS nombre_producto,
                COALESCE(SUM(dev.cantidad), 0) AS devuelta
         FROM detalleventa d
         LEFT JOIN productos p ON p.id_producto = d.id_producto
         LEFT JOIN tallas t ON t.id_talla = d.id_talla
         LEFT JOIN devoluciones dev ON dev.id_detalle = d.id_detalle
         WHERE d.id_venta = ?
         GROUP BY d.id_detalle, d.id_producto, d.id_talla, d.cantidad, d.precio_unitario, t.nombre, p.nombre
         ORDER BY d.id_detalle`,
        [v.id_venta]
      );
      // Calcular cantidad disponible para devolución y precio neto
      const [cols] = await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'detalleventa'");
      const hasDescUnit = Array.isArray(cols) && cols.some(c => c.COLUMN_NAME === 'descuento_unitario');
      const detConDispon = [];
      for (const d of det) {
        const disponible = Math.max(0, Number(d.cantidad || 0) - Number(d.devuelta || 0));
        let precio_neto = Number(d.precio_unitario || 0);
        if (hasDescUnit) {
          try {
            const [rr] = await pool.query('SELECT descuento_unitario FROM detalleventa WHERE id_detalle = ? LIMIT 1', [d.id_detalle]);
            if (rr && rr[0] && rr[0].descuento_unitario != null) precio_neto = Math.max(0, precio_neto - Number(rr[0].descuento_unitario || 0));
          } catch (_) {}
        }
        detConDispon.push({
          id_detalle: d.id_detalle,
          id_producto: d.id_producto,
          id_talla: d.id_talla,
          nombre_producto: d.nombre_producto,
          nombre_talla: d.nombre_talla,
          cantidad: Number(d.cantidad),
          devuelta: Number(d.devuelta),
          disponible,
          precio_unitario: Number(d.precio_unitario),
          precio_neto
        });
      }
      v.detalles = detConDispon;
    }

    return res.json({ ok: true, ventas });
  } catch (e) {
    console.error('Error /api/devoluciones/ventas-cliente:', e.message || e);
    return res.status(500).json({ ok: false, ventas: [] });
  }
});

// Registrar devolución de una línea de venta (parcial o total)
app.post('/api/devoluciones', requiereRol('caja'), async (req, res) => {
  const { id_detalle, cantidad } = req.body || {};
  const cant = Number(cantidad || 0);
  if (!id_detalle || !cant || cant <= 0) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Obtener detalle y acumulado devuelto
    const [[detalle]] = await conn.query(
      'SELECT d.id_detalle, d.id_venta, d.id_producto, d.id_talla, d.cantidad, d.precio_unitario, d.descuento_unitario FROM detalleventa d WHERE d.id_detalle = ? LIMIT 1',
      [id_detalle]
    );
    if (!detalle) { await conn.rollback(); conn.release(); return res.status(404).json({ ok: false, error: 'Detalle no encontrado' }); }

    const [[acum]] = await conn.query('SELECT COALESCE(SUM(cantidad),0) AS devuelta FROM devoluciones WHERE id_detalle = ?', [id_detalle]);
    const devuelta = Number(acum && acum.devuelta || 0);
    const disponible = Math.max(0, Number(detalle.cantidad || 0) - devuelta);
    if (cant > disponible) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ ok: false, error: `Cantidad supera lo disponible para devolución (${disponible})` });
    }

    // Calcular monto a restar: precio neto (considerando posible descuento_unitario)
    const precioUnit = Number(detalle.precio_unitario || 0);
    const descUnit = detalle.descuento_unitario != null ? Number(detalle.descuento_unitario || 0) : 0;
    const precioNeto = Math.max(0, precioUnit - descUnit);
    const montoReembolso = precioNeto * cant;

    // Insertar registro de devolución
    await conn.query(
      'INSERT INTO devoluciones (id_detalle, fecha_hora, cantidad, monto_reembolsado) VALUES (?, NOW(), ?, ?)',
      [id_detalle, cant, montoReembolso]
    );

    // Restituir inventario: por talla si aplica, y total del producto
    if (detalle.id_talla) {
      const [upd] = await conn.query('UPDATE inventario SET cantidad = cantidad + ? WHERE id_producto = ? AND id_talla = ?', [cant, detalle.id_producto, detalle.id_talla]);
      if (!upd || upd.affectedRows === 0) {
        await conn.query('INSERT INTO inventario (id_producto, id_talla, cantidad) VALUES (?, ?, ?)', [detalle.id_producto, detalle.id_talla, cant]);
      }
    }
    await conn.query('UPDATE productos SET inventario = inventario + ? WHERE id_producto = ?', [cant, detalle.id_producto]);

    // Disminuir total de la venta del mes/venta específica
    await conn.query('UPDATE ventas SET total_venta = GREATEST(0, total_venta - ?) WHERE id_venta = ?', [montoReembolso, detalle.id_venta]);

    await conn.commit();
    conn.release();
    return res.json({ ok: true, monto_reembolsado: montoReembolso });
  } catch (e) {
    if (conn) { try { await conn.rollback(); conn.release(); } catch (_) {} }
    console.error('Error registrando devolución:', e.message || e);
    return res.status(500).json({ ok: false, error: 'Error del servidor al registrar devolución' });
  }
});


// ==================== COMPRAS (ADMIN) ====================
// POST /api/compras: Registrar una compra (talla opcional)
app.post('/api/compras', requiereRol('administrador'), async (req, res) => {
  const { id_proveedor, fecha_compra, estado_pago, total_compra, items } = req.body;
  if (!id_proveedor || !fecha_compra || !estado_pago || !total_compra || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: 'Datos incompletos para registrar la compra.' });
  }
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 1. Insertar compra principal
    const [compraRes] = await conn.query(
      'INSERT INTO compras (id_proveedor, fecha_compra, total_compra, estado_pago) VALUES (?, ?, ?, ?)',
      [id_proveedor, fecha_compra, total_compra, estado_pago]
    );
    const id_compra = compraRes.insertId;

    // 2. Insertar items en detallecompra (talla opcional)
    for (const item of items) {
      const { idProducto, idTalla, cantidad, costo } = item;
      if (!idProducto || !cantidad || !costo) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ ok: false, error: 'Cada item debe tener producto, cantidad y costo.' });
      }

      // Insertar detalle de compra SIN campo id_talla (la tabla detallecompra ya no debe contener id_talla)
      await conn.query(
        'INSERT INTO detallecompra (id_compra, id_producto, cantidad, costo_unitario) VALUES (?, ?, ?, ?)',
        [id_compra, idProducto, cantidad, costo]
      );

      // Actualizar inventario: si el item especifica idTalla actualizamos inventario por talla,
      // si no, actualizamos el inventario total del producto
      if (idTalla) {
        // Si existe registro, sumar; si no, crear
        const [invRows] = await conn.query('SELECT cantidad FROM inventario WHERE id_producto = ? AND id_talla = ? LIMIT 1', [idProducto, idTalla]);
        if (invRows.length > 0) {
          await conn.query('UPDATE inventario SET cantidad = cantidad + ? WHERE id_producto = ? AND id_talla = ?', [cantidad, idProducto, idTalla]);
        } else {
          await conn.query('INSERT INTO inventario (id_producto, id_talla, cantidad) VALUES (?, ?, ?)', [idProducto, idTalla, cantidad]);
        }
        // También ajustar inventario total si existe la columna
        await conn.query('UPDATE productos SET inventario = inventario + ? WHERE id_producto = ?', [cantidad, idProducto]);
      } else {
        // Sumar a inventario total del producto (columna inventario)
        await conn.query('UPDATE productos SET inventario = inventario + ? WHERE id_producto = ?', [cantidad, idProducto]);
      }
    }

    await conn.commit();
    conn.release();
    res.json({ ok: true, id_compra });
  } catch (e) {
    if (conn) { try { await conn.rollback(); conn.release(); } catch (_) {} }
    console.error('Error registrar compra:', e.message || e);
    res.status(500).json({ ok: false, error: 'Error al registrar compra.' });
  }
});

// GET /api/compras: Listar compras con detalles
app.get('/api/compras', requiereRol('administrador'), async (req, res) => {
  try {
    const [compras] = await pool.query(
      `SELECT c.id_compra, c.fecha_compra, c.total_compra, c.estado_pago, p.nombre AS nombre_proveedor
       FROM compras c
       LEFT JOIN proveedores p ON c.id_proveedor = p.id_proveedor
       ORDER BY c.fecha_compra DESC, c.id_compra DESC LIMIT 100`
    );
    
    // Obtener detalles de cada compra
    for (const compra of compras) {
      const [detalles] = await pool.query(
        `SELECT dc.id_detalle, dc.id_producto, dc.cantidad, dc.costo_unitario, 
                pr.nombre AS nombre_producto, pr.marca
         FROM detallecompra dc
         LEFT JOIN productos pr ON dc.id_producto = pr.id_producto
         WHERE dc.id_compra = ?
         ORDER BY dc.id_detalle`,
        [compra.id_compra]
      );
      compra.detalles = detalles;
    }
    
    res.json({ compras });
  } catch (e) {
    console.error('Error listar compras:', e.message || e);
    res.status(500).json({ compras: [] });
  }
});


// Endpoint para indicadores del dashboard (ventas del mes, serie por día, rotación básica)
app.get('/api/dashboard/indicadores', requiereRol('administrador'), async (req, res) => {
  try {
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = Number(req.query.month) || (now.getMonth() + 1);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2,'0')}-01 00:00:00`;
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2,'0')}-01 00:00:00`;

    // Ventas del mes (total en $)
    const [tot] = await pool.query('SELECT IFNULL(SUM(total_venta),0) AS total_mes FROM ventas WHERE fecha_hora >= ? AND fecha_hora < ?', [startStr, endStr]);
    const ventasMes = tot && tot[0] ? Number(tot[0].total_mes) : 0;

    // Serie diaria para gráfico
    const [porDia] = await pool.query(
      `SELECT DATE(fecha_hora) AS dia, IFNULL(SUM(total_venta),0) AS ingreso_total FROM ventas WHERE fecha_hora >= ? AND fecha_hora < ? GROUP BY DATE(fecha_hora) ORDER BY DATE(fecha_hora) ASC`,
      [startStr, endStr]
    );

    // Comparación con mes anterior
    const prevStart = new Date(year, month - 2, 1);
    const prevEnd = new Date(year, month - 1, 1);
    const prevStartStr = `${prevStart.getFullYear()}-${String(prevStart.getMonth() + 1).padStart(2,'0')}-01 00:00:00`;
    const prevEndStr = `${prevEnd.getFullYear()}-${String(prevEnd.getMonth() + 1).padStart(2,'0')}-01 00:00:00`;
    const [prevTot] = await pool.query('SELECT IFNULL(SUM(total_venta),0) AS total_prev FROM ventas WHERE fecha_hora >= ? AND fecha_hora < ?', [prevStartStr, prevEndStr]);
    const totalPrev = prevTot && prevTot[0] ? Number(prevTot[0].total_prev) : 0;
    const ventasCambio = totalPrev > 0 ? ((ventasMes - totalPrev) / totalPrev) * 100 : (ventasMes > 0 ? 100 : 0);

    // Rotación de inventario básica: unidades vendidas / stock total
    const [unidades] = await pool.query(
      `SELECT IFNULL(SUM(d.cantidad),0) AS unidades_vendidas FROM detalleventa d JOIN ventas v ON d.id_venta = v.id_venta WHERE v.fecha_hora >= ? AND v.fecha_hora < ?`,
      [startStr, endStr]
    );
    const unidadesVendidas = unidades && unidades[0] ? Number(unidades[0].unidades_vendidas) : 0;
    const [stock] = await pool.query('SELECT IFNULL(SUM(inventario),0) AS stock_total FROM productos');
    const stockTotal = stock && stock[0] ? Number(stock[0].stock_total) : 0;
    const rotacionInventario = stockTotal > 0 ? unidadesVendidas / stockTotal : 0;
    // Calcular productos con stock bajo (umbral configurable)
    const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD) || 5;
    try {
      const [low] = await pool.query('SELECT COUNT(*) AS bajo FROM productos WHERE inventario <= ?', [LOW_STOCK_THRESHOLD]);
      const stockBajo = (low && low[0]) ? Number(low[0].bajo) : 0;
      res.json({ ventasMes, ventasTemporada: porDia, ventasCambio, rotacionInventario, margenGanancia: 0, stockBajo });
    } catch (e) {
      console.warn('No se pudo calcular stockBajo:', e.message || e);
      res.json({ ventasMes, ventasTemporada: porDia, ventasCambio, rotacionInventario, margenGanancia: 0, stockBajo: 0 });
    }
  } catch (e) {
    console.error('Error indicadores dashboard:', e.message || e);
    res.status(500).json({ error: 'Error al calcular indicadores' });
  }
});


// ---------------- Administrador (rutas protegidas) ----------------
// Categorías
app.delete('/api/categorias/:id', requiereRol('administrador'), async (req, res) => {
  const id = req.params.id;
  try {
    // Verificar uso en Productos
    const [cnt] = await pool.query('SELECT COUNT(*) as total FROM productos WHERE id_categoria = ?', [id]);
    const total = (Array.isArray(cnt) && cnt[0]) ? cnt[0].total : (cnt.total || 0);
    if (total > 0) {
      return res.status(400).json({ ok: false, success: false, message: `No se puede eliminar: ${total} producto(s) usan esta categoría` });
    }
    const [delRes] = await pool.query('DELETE FROM categorias WHERE id_categoria = ?', [id]);
    if (delRes.affectedRows > 0) return res.json({ ok: true, success: true });
    return res.status(404).json({ ok: false, success: false, message: 'Categoría no encontrada' });
  } catch (e) {
    console.error('Error eliminar categoria:', e.message);
    res.status(500).json({ ok: false, success: false, message: 'Error del servidor al eliminar categoría' });
  }
});
app.get('/api/categorias', requiereRol('cualquiera'), async (req, res) => {
  try {
  const [rows] = await pool.query('SELECT id_categoria, nombre FROM categorias ORDER BY nombre');
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
  const [result] = await pool.query('UPDATE categorias SET nombre = ? WHERE id_categoria = ?', [nombre.trim(), id]);
    if (result.affectedRows > 0) return res.json({ ok: true, success: true }); // Ajustado para devolver {ok: true, success: true}
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
  await pool.query('INSERT INTO categorias (nombre) VALUES (?)', [nombre]);
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
    const [cnt] = await pool.query('SELECT COUNT(*) as total FROM productos WHERE id_proveedor = ?', [id]);
    const total = (Array.isArray(cnt) && cnt[0]) ? cnt[0].total : (cnt.total || 0);
    if (total > 0) {
      return res.status(400).json({ ok: false, success: false, message: `No se puede eliminar: ${total} producto(s) usan este proveedor` });
    }
    const [delRes] = await pool.query('DELETE FROM proveedores WHERE id_proveedor = ?', [id]);
    if (delRes.affectedRows > 0) return res.json({ ok: true, success: true });
    return res.status(404).json({ ok: false, success: false, message: 'Proveedor no encontrado' });
  } catch (e) {
    console.error('Error eliminar proveedor:', e.message);
    res.status(500).json({ ok: false, success: false, message: 'Error del servidor al eliminar proveedor' });
  }
});
app.get('/api/proveedores', requiereRol('administrador'), async (req, res) => {
  try {
  const [rows] = await pool.query('SELECT id_proveedor, nombre FROM proveedores ORDER BY nombre');
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
  const [result] = await pool.query('UPDATE proveedores SET nombre = ?, contacto = ?, telefono = ? WHERE id_proveedor = ?', [nombre.trim(), contacto || null, telefono || null, id]);
    if (result.affectedRows > 0) return res.json({ ok: true, success: true }); // Ajustado para devolver {ok: true, success: true}
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
  await pool.query('INSERT INTO proveedores (nombre, contacto, telefono) VALUES (?, ?, ?)', [nombre, contacto, telefono]);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// ------------------ Promociones: CRUD ------------------
app.get('/api/promociones', requiereRol('administrador'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id_promocion, nombre, descripcion, tipo_promocion, valor, fecha_inicio, fecha_fin, activa, id_categoria, id_producto, minimo_compra, param_x, param_y FROM promociones ORDER BY fecha_inicio DESC');
    res.json({ ok: true, promociones: rows });
  } catch (e) {
    console.error('Error listar promociones:', e.message || e);
    res.status(500).json({ ok: false, promociones: [] });
  }
});

// Endpoint público: obtener promociones activas (para uso en Caja, solo lectura)
app.get('/api/promociones/activas', requiereRol('cualquiera'), async (req, res) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().slice(0,10);
    console.log(`[API PROMOCIONES ACTIVAS] Buscando promociones activas para fecha: ${todayStr}`);
    
    // Obtener promociones activas donde la fecha actual esté entre fecha_inicio y fecha_fin
    // Usar CURDATE() para asegurar compatibilidad con MySQL
    const [rows] = await pool.query(
      `SELECT id_promocion, nombre, descripcion, tipo_promocion, valor, fecha_inicio, fecha_fin, activa, id_categoria, id_producto, minimo_compra, param_x, param_y 
       FROM promociones 
       WHERE activa = 1 
       AND CURDATE() >= DATE(fecha_inicio) 
       AND CURDATE() <= DATE(fecha_fin) 
       ORDER BY fecha_inicio DESC`, 
      []
    );
    
    console.log(`[API PROMOCIONES ACTIVAS] Encontradas ${rows.length} promociones activas`);
    if (rows.length > 0) {
      console.log('[API PROMOCIONES ACTIVAS] Detalle:', rows.map(r => ({
        id: r.id_promocion,
        nombre: r.nombre,
        tipo: r.tipo_promocion,
        valor: r.valor,
        categoria: r.id_categoria,
        producto: r.id_producto
      })));
    }
    
    res.json({ ok: true, promociones: rows });
  } catch (e) {
    console.error('[API PROMOCIONES ACTIVAS] Error:', e.message || e);
    res.status(500).json({ ok: false, promociones: [] });
  }
});

app.post('/api/promociones', requiereRol('administrador'), async (req, res) => {
  try {
    const { nombre, descripcion, tipo_promocion, valor, fecha_inicio, fecha_fin, activa, id_categoria, id_producto, minimo_compra, param_x, param_y } = req.body;
    if (!nombre || !tipo_promocion || valor === undefined || !fecha_inicio || !fecha_fin) return res.status(400).json({ ok: false, message: 'Campos requeridos faltantes' });
    await pool.query('INSERT INTO promociones (nombre, descripcion, tipo_promocion, valor, fecha_inicio, fecha_fin, activa, id_categoria, id_producto, minimo_compra, param_x, param_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [nombre, descripcion || null, tipo_promocion, valor, fecha_inicio, fecha_fin, activa ? 1 : 0, id_categoria || null, id_producto || null, minimo_compra || 0, param_x || null, param_y || null]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Error crear promocion:', e.message || e);
    res.status(500).json({ ok: false, message: 'Error al crear promoción' });
  }
});

app.put('/api/promociones/:id', requiereRol('administrador'), async (req, res) => {
  try {
    const id = req.params.id;
    const { nombre, descripcion, tipo_promocion, valor, fecha_inicio, fecha_fin, activa, id_categoria, id_producto, minimo_compra, param_x, param_y } = req.body;
    const [result] = await pool.query('UPDATE promociones SET nombre = ?, descripcion = ?, tipo_promocion = ?, valor = ?, fecha_inicio = ?, fecha_fin = ?, activa = ?, id_categoria = ?, id_producto = ?, minimo_compra = ?, param_x = ?, param_y = ? WHERE id_promocion = ?', [nombre, descripcion || null, tipo_promocion, valor, fecha_inicio, fecha_fin, activa ? 1 : 0, id_categoria || null, id_producto || null, minimo_compra || 0, param_x || null, param_y || null, id]);
    if (result.affectedRows > 0) return res.json({ ok: true });
    return res.status(404).json({ ok: false, message: 'Promoción no encontrada' });
  } catch (e) {
    console.error('Error actualizar promocion:', e.message || e);
    res.status(500).json({ ok: false, message: 'Error al actualizar promoción' });
  }
});

app.delete('/api/promociones/:id', requiereRol('administrador'), async (req, res) => {
  try {
    const id = req.params.id;
    const [result] = await pool.query('DELETE FROM promociones WHERE id_promocion = ?', [id]);
    if (result.affectedRows > 0) return res.json({ ok: true });
    return res.status(404).json({ ok: false, message: 'Promoción no encontrada' });
  } catch (e) {
    console.error('Error eliminar promocion:', e.message || e);
    res.status(500).json({ ok: false, message: 'Error al eliminar promoción' });
  }
});

// Tallas
app.get('/api/tallas', requiereRol('administrador'), async (req, res) => {
  try {
  const [rows] = await pool.query('SELECT id_talla, nombre FROM tallas ORDER BY nombre');
    res.json({ tallas: rows });
  } catch (e) {
    res.status(500).json({ tallas: [] });
  }
});
app.post('/api/tallas', requiereRol('administrador'), async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.json({ ok: false });
  try {
  await pool.query('INSERT INTO tallas (nombre) VALUES (?)', [nombre]);
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
  const [result] = await pool.query('UPDATE tallas SET nombre = ?, ajuste = ?, pecho = ?, cintura = ?, cadera = ?, largo = ? WHERE id_talla = ?', [nombre, ajuste, pecho || null, cintura || null, cadera || null, largo || null, id]);
    if (result.affectedRows > 0) return res.json({ ok: true, success: true }); // Ajustado para devolver {ok: true, success: true}
    return res.status(404).json({ success: false, message: 'Talla no encontrada' });
  } catch (e) {
    console.error('Error editar talla:', e.message);
    return res.status(500).json({ success: false, message: 'Error del servidor' });
  }
});
app.delete('/api/tallas/:id', requiereRol('administrador'), async (req, res) => {
  const id = req.params.id;
  try {
    // Verificar uso en inventario
    const [cnt] = await pool.query('SELECT COUNT(*) as total FROM inventario WHERE id_talla = ?', [id]);
    const total = (Array.isArray(cnt) && cnt[0]) ? cnt[0].total : (cnt.total || 0);
    if (total > 0) {
      return res.status(400).json({ ok: false, success: false, message: `No se puede eliminar: ${total} registro(s) en inventario usan esta talla` });
    }
    const [delRes] = await pool.query('DELETE FROM tallas WHERE id_talla = ?', [id]);
    if (delRes.affectedRows > 0) return res.json({ ok: true, success: true });
    return res.status(404).json({ ok: false, success: false, message: 'Talla no encontrada' });
  } catch (e) {
    console.error('Error eliminar talla:', e.message);
    res.status(500).json({ ok: false, success: false, message: 'Error del servidor al eliminar talla' });
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
        query = 'SELECT COUNT(*) as total FROM productos WHERE id_categoria = ?';
        break;
      case 'tallas':
        query = 'SELECT COUNT(*) as total FROM inventario WHERE id_talla = ?';
        break;
      case 'proveedores':
        query = 'SELECT COUNT(*) as total FROM productos WHERE id_proveedor = ?';
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

// Nuevo endpoint: Registro de productos completo (usado por admin.html)
// SIEMPRE crea un producto nuevo, incluso si existe uno idéntico
app.post('/api/productos', requiereRol('administrador'), async (req, res) => {
  const { marca, categoria, proveedor, nombre, precio, inventario, cantidades, sumarAExistente } = req.body;
  try {
    const totalInventario = Number(inventario) || 0;
    let sumaTallas = 0;
    if (Array.isArray(cantidades)) {
      for (const t of cantidades) {
        sumaTallas += Number(t.cantidad) || 0;
      }
    }

    // Si el usuario explícitamente quiere sumar a un producto existente, buscar y sumar
    if (sumarAExistente === true || sumarAExistente === 'true' || sumarAExistente === 1) {
      const [productosExistentes] = await pool.query(
        'SELECT id_producto, inventario FROM productos WHERE nombre = ? AND marca = ? AND id_categoria = ? LIMIT 1',
        [nombre, marca, categoria]
      );

      if (productosExistentes.length > 0) {
        // Producto existe: SUMAR cantidades sin validación restrictiva
        const id_producto = productosExistentes[0].id_producto;
        const inventarioActual = Number(productosExistentes[0].inventario) || 0;
        const nuevoInventario = inventarioActual + totalInventario;
        
        // Actualizar producto: sumar inventario total
        await pool.query(
          'UPDATE productos SET inventario = inventario + ? WHERE id_producto = ?',
          [totalInventario, id_producto]
        );
        console.log(`[REGISTRO PRODUCTO] Sumando a producto existente ${id_producto}: sumando ${totalInventario} unidades al inventario total (de ${inventarioActual} a ${nuevoInventario})`);
        console.log(`[REGISTRO PRODUCTO] Sumando ${sumaTallas} unidades en total por tallas (sin restricción)`);
        
        // Manejar cantidades por talla: sumar si existe, crear si no
        if (Array.isArray(cantidades)) {
          for (const t of cantidades) {
            const id_talla = Number(t.id_talla);
            const cantidad = Number(t.cantidad) || 0;
            
            if (cantidad > 0) {
              const [invExistente] = await pool.query(
                'SELECT cantidad FROM inventario WHERE id_producto = ? AND id_talla = ? LIMIT 1',
                [id_producto, id_talla]
              );

              if (invExistente.length > 0) {
                const cantidadActual = Number(invExistente[0].cantidad) || 0;
                await pool.query(
                  'UPDATE inventario SET cantidad = cantidad + ? WHERE id_producto = ? AND id_talla = ?',
                  [cantidad, id_producto, id_talla]
                );
                console.log(`[REGISTRO PRODUCTO] Talla ${id_talla} existente: sumando ${cantidad} unidades (de ${cantidadActual} a ${cantidadActual + cantidad})`);
              } else {
                await pool.query(
                  'INSERT INTO inventario (id_producto, id_talla, cantidad) VALUES (?, ?, ?)',
                  [id_producto, id_talla, cantidad]
                );
                console.log(`[REGISTRO PRODUCTO] Nueva talla ${id_talla}: creando con ${cantidad} unidades`);
              }
            }
          }
        }

        return res.json({ ok: true, id_producto, actualizado: true, message: 'Cantidades agregadas al producto existente' });
      }
    }

    // Por defecto: SIEMPRE crear un producto nuevo (incluso si existe uno idéntico)
    // Validar que la suma de tallas no exceda el inventario total solo para productos nuevos
    if (sumaTallas > totalInventario) {
      return res.status(400).json({ ok: false, message: `La suma de las cantidades por talla (${sumaTallas}) excede el inventario total (${totalInventario}). Ajusta los valores.` });
    }
    
    // Crear producto nuevo siempre
    const [prodResult] = await pool.query(
      'INSERT INTO productos (nombre, marca, precio_venta, inventario, id_categoria, id_proveedor) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre, marca, precio, inventario, categoria, proveedor]
    );
    const id_producto = prodResult.insertId;
    console.log(`[REGISTRO PRODUCTO] Nuevo producto creado: ${id_producto} (nombre: ${nombre}, marca: ${marca}, categoria: ${categoria})`);

    // 2. Manejar cantidades por talla para producto nuevo (crear registros)
    if (Array.isArray(cantidades)) {
      for (const t of cantidades) {
        const id_talla = Number(t.id_talla);
        const cantidad = Number(t.cantidad) || 0;
        
        if (cantidad > 0) {
          // Para productos nuevos, siempre crear registros de inventario (no verificar si existe)
          await pool.query(
            'INSERT INTO inventario (id_producto, id_talla, cantidad) VALUES (?, ?, ?)',
            [id_producto, id_talla, cantidad]
          );
          console.log(`[REGISTRO PRODUCTO] Talla ${id_talla}: creando con ${cantidad} unidades para producto nuevo ${id_producto}`);
        }
      }
    }

    res.json({ ok: true, id_producto, actualizado: false, message: 'Producto nuevo creado correctamente' });
  } catch (e) {
    console.error('[REGISTRO PRODUCTO] Error:', e);
    res.status(500).json({ ok: false, error: 'Error al registrar producto', message: e.message });
  }
});

// Listar productos (GET)
// Obtener producto por ID (GET) - Incluye tallas con cantidades
app.get('/api/admin/productos/:id', requiereRol('administrador'), async (req, res) => {
  const id = req.params.id;
  try {
    // Obtener información del producto
    const [rows] = await pool.query(
      'SELECT id_producto, nombre, marca, inventario, precio_venta, id_categoria, id_proveedor FROM productos WHERE id_producto = ?', 
      [id]
    );
    
    if (rows.length === 0) {
      return res.json({ producto: null });
    }
    
    const producto = rows[0];
    
    // Obtener tallas con cantidades del inventario
    const [inventarioRows] = await pool.query(
      'SELECT i.id_talla, t.nombre as nombre_talla, i.cantidad FROM inventario i INNER JOIN tallas t ON i.id_talla = t.id_talla WHERE i.id_producto = ? ORDER BY t.nombre',
      [id]
    );
    
    // Agregar tallas al producto
    producto.tallas = inventarioRows.map(row => ({
      id_talla: row.id_talla,
      nombre: row.nombre_talla,
      cantidad: row.cantidad
    }));
    
    res.json({ producto });
  } catch (e) {
    console.error('[GET PRODUCTO] Error:', e);
    res.json({ producto: null });
  }
});
// Editar producto (PUT) - Actualiza producto y maneja tallas sumando cantidades
app.put('/api/admin/productos/:id', requiereRol('administrador'), async (req, res) => {
  const id = req.params.id;
  const { marca, nombre, inventario_adicional, precio, id_categoria, id_proveedor, cantidades } = req.body;
  let conn;
  
  try {
    console.log(`[EDITAR PRODUCTO] Iniciando edición del producto ${id}`);
    console.log(`[EDITAR PRODUCTO] Datos recibidos:`, { marca, nombre, inventario_adicional, precio, id_categoria, id_proveedor, cantidades });
    
    conn = await pool.getConnection();
    await conn.beginTransaction();
    
    // 1. Actualizar datos básicos del producto
    await conn.query(
      'UPDATE productos SET marca = ?, nombre = ?, precio_venta = ?, id_categoria = ?, id_proveedor = ? WHERE id_producto = ?',
      [marca, nombre, precio, id_categoria, id_proveedor, id]
    );
    console.log(`[EDITAR PRODUCTO] Datos básicos actualizados`);
    
    // 2. Si se envió inventario_adicional, SUMAR al inventario total (no reemplazar)
    // Aceptar cualquier valor mayor o igual a 0, pero solo sumar si es > 0
    let inventarioAdd = 0;
    if (inventario_adicional !== undefined && inventario_adicional !== null) {
      inventarioAdd = Number(inventario_adicional) || 0;
    }
    
    console.log(`[EDITAR PRODUCTO] Inventario adicional recibido: ${inventario_adicional} (convertido a: ${inventarioAdd})`);
    
    if (inventarioAdd > 0) {
      const [currentInv] = await conn.query('SELECT inventario FROM productos WHERE id_producto = ?', [id]);
      const inventarioActual = Number(currentInv[0].inventario) || 0;
      
      await conn.query(
        'UPDATE productos SET inventario = inventario + ? WHERE id_producto = ?',
        [inventarioAdd, id]
      );
      console.log(`[EDITAR PRODUCTO] ✓ Sumando ${inventarioAdd} unidades al inventario total (${inventarioActual} → ${inventarioActual + inventarioAdd})`);
    } else {
      console.log(`[EDITAR PRODUCTO] ⚠ No se agregó inventario adicional (valor recibido: ${inventario_adicional}, convertido: ${inventarioAdd})`);
    }
    
    // 3. Manejar cantidades por talla: SUMAR si existe, crear si no
    let sumaTotalTallas = 0;
    if (Array.isArray(cantidades) && cantidades.length > 0) {
      console.log(`[EDITAR PRODUCTO] Procesando ${cantidades.length} tallas`);
      
      for (const t of cantidades) {
        const id_talla = Number(t.id_talla);
        const cantidad_adicional = Number(t.cantidad) || 0;
        
        if (cantidad_adicional > 0) {
          sumaTotalTallas += cantidad_adicional;
          
          // Verificar si ya existe registro de inventario para esta talla
          const [invExistente] = await conn.query(
            'SELECT cantidad FROM inventario WHERE id_producto = ? AND id_talla = ? LIMIT 1',
            [id, id_talla]
          );

          if (invExistente.length > 0) {
            // Talla existe: SUMAR cantidad (no reemplazar)
            const cantidadActual = Number(invExistente[0].cantidad) || 0;
            await conn.query(
              'UPDATE inventario SET cantidad = cantidad + ? WHERE id_producto = ? AND id_talla = ?',
              [cantidad_adicional, id, id_talla]
            );
            console.log(`[EDITAR PRODUCTO] ✓ Talla ${id_talla}: sumando ${cantidad_adicional} unidades (${cantidadActual} → ${cantidadActual + cantidad_adicional})`);
          } else {
            // Talla nueva: crear registro
            await conn.query(
              'INSERT INTO inventario (id_producto, id_talla, cantidad) VALUES (?, ?, ?)',
              [id, id_talla, cantidad_adicional]
            );
            console.log(`[EDITAR PRODUCTO] ✓ Nueva talla ${id_talla}: creando con ${cantidad_adicional} unidades`);
          }
        } else {
          console.log(`[EDITAR PRODUCTO] - Talla ${id_talla}: cantidad 0, omitida`);
        }
      }
      
      // Actualizar inventario total sumando todas las cantidades agregadas por tallas
      if (sumaTotalTallas > 0) {
        const [currentInvBefore] = await conn.query('SELECT inventario FROM productos WHERE id_producto = ?', [id]);
        const inventarioAntes = Number(currentInvBefore[0].inventario) || 0;
        
        await conn.query(
          'UPDATE productos SET inventario = inventario + ? WHERE id_producto = ?',
          [sumaTotalTallas, id]
        );
        console.log(`[EDITAR PRODUCTO] ✓ Inventario total actualizado: sumando ${sumaTotalTallas} unidades de tallas (${inventarioAntes} → ${inventarioAntes + sumaTotalTallas})`);
      }
    } else {
      console.log(`[EDITAR PRODUCTO] No se enviaron cantidades por talla o el array está vacío`);
    }
    
    await conn.commit();
    conn.release();
    
    console.log(`[EDITAR PRODUCTO] ✓ Producto ${id} actualizado correctamente`);
    res.json({ ok: true, message: 'Producto actualizado correctamente', inventario_agregado: inventarioAdd, tallas_agregadas: sumaTotalTallas });
  } catch (e) {
    if (conn) {
      try { 
        await conn.rollback(); 
        conn.release(); 
        console.log(`[EDITAR PRODUCTO] ✗ Transacción revertida por error`);
      } catch (_) {}
    }
    console.error('[EDITAR PRODUCTO] ✗ Error:', e);
    res.status(500).json({ ok: false, message: 'Error al editar producto', error: e.message });
  }
});
// Eliminar producto (DELETE) - Ajustado para devolver {ok: true, success: true}
app.delete('/api/admin/productos/:id', requiereRol('administrador'), async (req, res) => {
  const id = req.params.id;
  let conn;
  try {
    // Obtener conexión y comenzar transacción
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Asegurar producto placeholder para preservar historial en ventas y compras
    // Buscamos un producto con marca '-' y nombre 'Producto eliminado'
    let placeholderId = null;
    {
      const [ph] = await conn.query("SELECT id_producto FROM productos WHERE nombre = 'Producto eliminado' AND marca = '-' LIMIT 1");
      if (ph && ph.length > 0) {
        placeholderId = ph[0].id_producto;
      } else {
        // Obtener una categoría válida (primera disponible) o usar 1
        let catId = 1;
        try {
          const [cats] = await conn.query('SELECT id_categoria FROM categorias ORDER BY id_categoria LIMIT 1');
          if (cats && cats.length > 0) catId = cats[0].id_categoria;
        } catch (_) {}
        const [ins] = await conn.query(
          'INSERT INTO productos (nombre, marca, precio_venta, inventario, id_categoria, id_proveedor) VALUES (?, ?, ?, ?, ?, ?)',
          ['Producto eliminado', '-', 0, 0, catId, null]
        );
        placeholderId = ins.insertId;
      }
    }

    // Reasignar referencias en detalleventa y detallecompra al placeholder (mantener ventas/compras históricas)
    await conn.query('UPDATE detalleventa SET id_producto = ? WHERE id_producto = ?', [placeholderId, id]);
    try {
      await conn.query('UPDATE detallecompra SET id_producto = ? WHERE id_producto = ?', [placeholderId, id]);
    } catch (_) { /* si la tabla no existe, continuar */ }

    // 2) Eliminar filas relacionadas en inventario (si existen)
    await conn.query('DELETE FROM inventario WHERE id_producto = ?', [id]);

    // 3) Eliminar el producto
    const [delRes] = await conn.query('DELETE FROM productos WHERE id_producto = ?', [id]);
    if (delRes.affectedRows === 0) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ ok: false, success: false, message: 'Producto no encontrado' });
    }

    // Commit y liberar
    await conn.commit();
    conn.release();
    return res.json({ ok: true, success: true });
  } catch (e) {
    if (conn) {
      try { await conn.rollback(); conn.release(); } catch (_) {}
    }
    console.error('Error eliminar producto admin (transaction):', e.message || e);
    return res.status(500).json({ ok: false, success: false, message: 'Error del servidor al eliminar producto' });
  }
});
app.get('/api/admin/productos', requiereRol('administrador'), async (req, res) => {
  const { q } = req.query;
  try {
  // Incluir id_categoria para que el frontend admin pueda mostrar el nombre de la categoría
  let query = 'SELECT id_producto, nombre, marca, inventario, precio_venta, id_categoria FROM productos';
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
        'SELECT tallas.nombre AS talla, inventario.cantidad FROM inventario JOIN tallas ON inventario.id_talla = tallas.id_talla WHERE inventario.id_producto = ?',
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
      'INSERT INTO productos (nombre, descripcion, precio_venta, id_categoria) VALUES (?, ?, ?, ?)',
      [nombre, descripcion || '', precio_venta, final_id_categoria]
    );
    res.json({ ok: true, id_producto: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// Endpoint administrativo: listar ventas por mes (con detalle y totales diarios)
app.get('/api/admin/ventas', requiereRol('administrador'), async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || (new Date().getMonth() + 1); // 1-12

    // Rango inicio/fin para el mes
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1); // inicio del siguiente mes

    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01 00:00:00`;
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-01 00:00:00`;

    // Preparar posible filtro por cédula de cliente (req.query.cliente)
    const clienteCedula = req.query.cliente ? String(req.query.cliente).trim() : null;

    // 1) Obtener ventas en el rango (con opcional filtro por cédula)
    let baseWhere = 'v.fecha_hora >= ? AND v.fecha_hora < ?';
    const ventasParams = [startStr, endStr];
    if (clienteCedula) {
      baseWhere += ' AND c.cedula = ?';
      ventasParams.push(clienteCedula);
    }

    const [ventasRows] = await pool.query(
      `SELECT v.id_venta, v.fecha_hora, v.total_venta, v.tipo_pago, u.usuario AS usuario, c.nombre AS cliente, c.cedula AS cliente_cedula
       FROM ventas v
       LEFT JOIN usuarios u ON v.id_usuario = u.id_usuario
       LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
       WHERE ${baseWhere}
       ORDER BY v.fecha_hora DESC
      `,
      ventasParams
    );

    // 2) Obtener detalle para cada venta (optimizable, pero suficiente para volúmenes moderados)
    for (const v of ventasRows) {
      // Evitar referenciar columnas que pueden no existir en esquemas distintos.
      const [det] = await pool.query(
        `SELECT d.id_producto, p.marca, p.nombre AS producto, d.id_talla, t.nombre AS talla, d.cantidad, d.precio_unitario
         FROM detalleventa d
         LEFT JOIN productos p ON d.id_producto = p.id_producto
         LEFT JOIN tallas t ON d.id_talla = t.id_talla
         WHERE d.id_venta = ?`,
        [v.id_venta]
      );
      v.detalle = det;
    }

    // 3) Totales del mes
    // 3) Totales del mes (aplicar mismo filtro por cliente si existe)
    let totQuery = 'SELECT IFNULL(SUM(total_venta),0) AS total_mes, COUNT(*) AS ventas_count FROM ventas v';
    let totParams = [startStr, endStr];
    if (clienteCedula) {
      totQuery += ' LEFT JOIN clientes c ON v.id_cliente = c.id_cliente WHERE v.fecha_hora >= ? AND v.fecha_hora < ? AND c.cedula = ?';
      totParams.push(clienteCedula);
    } else {
      totQuery += ' WHERE v.fecha_hora >= ? AND v.fecha_hora < ?';
    }
    const [tot] = await pool.query(totQuery, totParams);
    const total_mes = (Array.isArray(tot) && tot[0]) ? tot[0].total_mes : (tot.total_mes || 0);

    // 4) Totales por día (para gráficas)
    // 4) Totales por día (aplicar filtro por cliente si existe)
    let porDiaQuery = `SELECT DATE(v.fecha_hora) AS dia, SUM(v.total_venta) AS total, COUNT(*) AS ventas
       FROM ventas v`;
    const porDiaParams = [startStr, endStr];
    if (clienteCedula) {
      porDiaQuery += ' LEFT JOIN clientes c ON v.id_cliente = c.id_cliente WHERE v.fecha_hora >= ? AND v.fecha_hora < ? AND c.cedula = ?';
      porDiaParams.push(clienteCedula);
    } else {
      porDiaQuery += ' WHERE v.fecha_hora >= ? AND v.fecha_hora < ?';
    }
    porDiaQuery += ' GROUP BY DATE(v.fecha_hora) ORDER BY DATE(v.fecha_hora) ASC';
    const [porDia] = await pool.query(porDiaQuery, porDiaParams);

    res.json({ ok: true, ventas: ventasRows, totales: { total_mes: Number(total_mes), count: tot[0] ? tot[0].ventas_count : 0 }, por_dia: porDia, year, month });
  } catch (e) {
    console.error('Error listar ventas admin:', e.message || e);
    res.status(500).json({ ok: false, ventas: [], message: 'Error al consultar ventas' });
  }
});

// Obtener detalle de una venta por ID (administrador)
app.get('/api/admin/ventas/:id', requiereRol('administrador'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, message: 'ID inválido' });
    const [ventasRows] = await pool.query(
      `SELECT v.id_venta, v.fecha_hora, v.total_venta, v.tipo_pago, u.usuario AS usuario, c.nombre AS cliente, c.cedula AS cliente_cedula
       FROM ventas v
       LEFT JOIN usuarios u ON v.id_usuario = u.id_usuario
       LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
       WHERE v.id_venta = ? LIMIT 1`,
      [id]
    );
    if (!ventasRows || ventasRows.length === 0) return res.status(404).json({ ok: false, message: 'Venta no encontrada' });
    const venta = ventasRows[0];
    const [det] = await pool.query(
      `SELECT d.id_detalle, d.id_producto, p.marca, p.nombre AS producto, d.id_talla, t.nombre AS talla, d.cantidad, d.precio_unitario, d.descuento_unitario, d.descuento_total, d.id_promocion_aplicada
       FROM detalleventa d
       LEFT JOIN productos p ON d.id_producto = p.id_producto
       LEFT JOIN tallas t ON d.id_talla = t.id_talla
       WHERE d.id_venta = ?`,
      [id]
    );
    venta.detalle = det || [];
    return res.json({ ok: true, venta });
  } catch (e) {
    console.error('Error obtener venta por id:', e.message || e);
    return res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

// Eliminar venta (DELETE) - Reversa inventario y borra detalleventa + venta en transacción
app.delete('/api/admin/ventas/:id', requiereRol('administrador'), async (req, res) => {
  const id = req.params.id;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Verificar existencia de la venta
    const [ventaRows] = await conn.query('SELECT id_venta FROM ventas WHERE id_venta = ?', [id]);
    if (!ventaRows || ventaRows.length === 0) {
      await conn.release();
      return res.status(404).json({ ok: false, message: 'Venta no encontrada' });
    }

    // Obtener detalle de la venta para revertir inventario
    const [detalles] = await conn.query('SELECT id_detalle, id_producto, id_talla, cantidad, precio_unitario, descuento_unitario FROM detalleventa WHERE id_venta = ?', [id]);

    // Borrar devoluciones que referencian a los detalles de esta venta (evita error por FK)
    if (detalles.length > 0) {
      const ids = detalles.map(d => d.id_detalle);
      const placeholders = ids.map(_ => '?').join(',');
      await conn.query(`DELETE FROM devoluciones WHERE id_detalle IN (${placeholders})`, ids);
    }

    for (const d of detalles) {
      const cantidad = Number(d.cantidad || 0);
      if (cantidad <= 0) continue;

      // Si la línea tiene talla, intentar actualizar inventario por talla; si no existe registro, insertarlo
      if (d.id_talla) {
        const [upd] = await conn.query('UPDATE inventario SET cantidad = cantidad + ? WHERE id_producto = ? AND id_talla = ?', [cantidad, d.id_producto, d.id_talla]);
        // Si no se actualizó (no existía), insertamos el registro
        if (!upd || upd.affectedRows === 0) {
          await conn.query('INSERT INTO inventario (id_producto, id_talla, cantidad) VALUES (?, ?, ?)', [d.id_producto, d.id_talla, cantidad]);
        }
      }

      // También revertir inventario total del producto
      await conn.query('UPDATE productos SET inventario = inventario + ? WHERE id_producto = ?', [cantidad, d.id_producto]);
    }

    // Borrar detalle y venta
    await conn.query('DELETE FROM detalleventa WHERE id_venta = ?', [id]);
    const [delRes] = await conn.query('DELETE FROM ventas WHERE id_venta = ?', [id]);
    if (delRes.affectedRows === 0) {
      await conn.rollback();
      await conn.release();
      return res.status(404).json({ ok: false, message: 'Venta no encontrada (al borrar)' });
    }

    await conn.commit();
    await conn.release();
    return res.json({ ok: true, message: 'Venta eliminada y stock revertido' });
  } catch (e) {
    if (conn) {
      try { await conn.rollback(); await conn.release(); } catch (_) {}
    }
    console.error('Error eliminar venta admin:', e.message || e);
    return res.status(500).json({ ok: false, message: 'Error del servidor al eliminar venta' });
  }
});

// Endpoint optimizado: listar clientes con resumen de compras (count, total)
app.get('/api/admin/clientes/resumen', requiereRol('administrador'), async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const per_page = Math.max(1, Math.min(500, Number(req.query.per_page) || 100));
    const offset = (page - 1) * per_page;

    // Obtener clientes que tengan al menos una venta, con conteo y total gastado
    const [rows] = await pool.query(
      `SELECT c.id_cliente, c.nombre, c.cedula, c.telefono, c.email,
              COUNT(v.id_venta) AS compras_count, IFNULL(SUM(v.total_venta),0) AS total_gastado, MAX(v.fecha_hora) AS ultima_compra
       FROM clientes c
       JOIN ventas v ON v.id_cliente = c.id_cliente
       GROUP BY c.id_cliente
       HAVING compras_count > 0
       ORDER BY total_gastado DESC
       LIMIT ? OFFSET ?`,
      [per_page, offset]
    );

    // Opcional: contar total de clientes con compras (para paginación)
    const [cntRows] = await pool.query(
      `SELECT COUNT(DISTINCT c.id_cliente) AS total_clients_with_purchases FROM clientes c JOIN ventas v ON v.id_cliente = c.id_cliente`
    );
    const total_clients = (Array.isArray(cntRows) && cntRows[0]) ? Number(cntRows[0].total_clients_with_purchases) : 0;

    res.json({ ok: true, clientes: rows, page, per_page, total_clients });
  } catch (e) {
    console.error('Error listar clientes resumen admin:', e.message || e);
    res.status(500).json({ ok: false, clientes: [], page: 1, per_page: 0, total_clients: 0, message: 'Error del servidor' });
  }
});

// Endpoint administrativo: listar todos los clientes
app.get('/api/admin/clientes', requiereRol('administrador'), async (req, res) => {
  try {
    const busqueda = req.query.busqueda ? String(req.query.busqueda).trim() : null;
    
    let query = `SELECT 
      c.id_cliente,
      c.nombre,
      c.cedula,
      c.telefono,
      c.email,
      COUNT(DISTINCT v.id_venta) AS total_ventas,
      COALESCE(SUM(v.total_venta), 0) AS total_compras
    FROM clientes c
    LEFT JOIN ventas v ON c.id_cliente = v.id_cliente
    WHERE 1=1`;
    
    const params = [];
    if (busqueda) {
      query += ` AND (c.nombre LIKE ? OR c.cedula LIKE ? OR c.email LIKE ?)`;
      const busquedaPattern = `%${busqueda}%`;
      params.push(busquedaPattern, busquedaPattern, busquedaPattern);
    }
    
    query += ` GROUP BY c.id_cliente, c.nombre, c.cedula, c.telefono, c.email
               ORDER BY c.nombre ASC
               LIMIT 500`;
    
    const [clientes] = await pool.query(query, params);
    
    const clientesData = clientes.map(c => ({
      id_cliente: c.id_cliente,
      nombre: c.nombre || 'Sin nombre',
      cedula: c.cedula || 'N/A',
      telefono: c.telefono || 'N/A',
      email: c.email || 'N/A',
      total_ventas: Number(c.total_ventas || 0),
      total_compras: Number(c.total_compras || 0)
    }));
    
    res.json({ ok: true, clientes: clientesData });
  } catch (e) {
    console.error('Error listar clientes admin:', e.message || e);
    res.status(500).json({ ok: false, clientes: [], error: 'Error del servidor' });
  }
});

// Crear cliente (administrador)
app.post('/api/admin/clientes', requiereRol('administrador'), async (req, res) => {
  try {
    const { nombre, cedula, telefono, email } = req.body || {};
    if (!nombre || nombre.trim() === '') return res.status(400).json({ ok: false, message: 'Nombre requerido' });

    // Si se envía cédula y ya existe, devolver ese cliente
    if (cedula) {
      const [exists] = await pool.query('SELECT id_cliente FROM clientes WHERE cedula = ? LIMIT 1', [cedula]);
      if (exists && exists.length > 0) {
        return res.json({ ok: true, id_cliente: exists[0].id_cliente, message: 'Cliente ya existe' });
      }
    }

    const [ins] = await pool.query('INSERT INTO clientes (nombre, cedula, telefono, email) VALUES (?, ?, ?, ?)', [nombre, cedula || null, telefono || null, email || null]);
    return res.json({ ok: true, id_cliente: ins.insertId });
  } catch (e) {
    console.error('Error crear cliente admin:', e.message || e);
    return res.status(500).json({ ok: false, message: 'Error del servidor al crear cliente' });
  }
});

// Endpoint administrativo: obtener ventas (historial) completas de un cliente por cédula
app.get('/api/admin/clientes/ventas', requiereRol('administrador'), async (req, res) => {
  try {
    const cedula = req.query.cedula ? String(req.query.cedula).trim() : null;
    if (!cedula) return res.json({ ok: false, ventas: [], total: 0, count: 0, message: 'Cédula requerida' });

    const [ventasRows] = await pool.query(
      `SELECT v.id_venta, v.fecha_hora, v.total_venta, v.tipo_pago, u.usuario AS usuario
       FROM ventas v
       LEFT JOIN usuarios u ON v.id_usuario = u.id_usuario
       LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
       WHERE c.cedula = ?
       ORDER BY v.fecha_hora DESC`,
      [cedula]
    );

    // Agregar detalle de cada venta
    for (const v of ventasRows) {
      const [det] = await pool.query(
        `SELECT d.id_producto, p.marca, p.nombre AS producto, d.id_talla, t.nombre AS talla, d.cantidad, d.precio_unitario
         FROM detalleventa d
         LEFT JOIN productos p ON d.id_producto = p.id_producto
         LEFT JOIN tallas t ON d.id_talla = t.id_talla
         WHERE d.id_venta = ?`,
        [v.id_venta]
      );
      v.detalle = det;
    }

    const total = ventasRows.reduce((s, v) => s + (Number(v.total_venta) || 0), 0);
    const count = ventasRows.length;
    return res.json({ ok: true, ventas: ventasRows, total, count });
  } catch (e) {
    console.error('Error historial cliente admin:', e.message || e);
    return res.status(500).json({ ok: false, ventas: [], total: 0, count: 0, message: 'Error del servidor' });
  }
});


// ---------------- Caja (rutas protegidas) ----------------
// Buscar cliente por cédula
app.get('/api/clientes/buscar', requiereRol('caja'), async (req, res) => {
  const cedula = req.query.cedula;
  if (!cedula) return res.json({ cliente: null });
  try {
  const [rows] = await pool.query('SELECT id_cliente, nombre, cedula, telefono, email FROM clientes WHERE cedula = ? LIMIT 1', [cedula]);
    if (rows.length > 0) {
      res.json({ cliente: rows[0] });
    } else {
      res.json({ cliente: null });
    }
  } catch (e) {
    res.json({ cliente: null });
  }
});

// ==================== GESTIÓN DE CLIENTES ====================
// Rol: Administrador
app.get('/api/clientes', requiereRol('administrador'), async (req, res) => {
  try {
    // La tabla `clientes` en la base de datos contiene: id_cliente, nombre, cedula, telefono, email
    // Evitar columnas inexistentes como `apellido` o `direccion` que causan ER_BAD_FIELD_ERROR.
    const [rows] = await pool.query(
      'SELECT id_cliente, nombre, cedula, telefono, email FROM clientes ORDER BY id_cliente DESC'
    );
    res.json({ ok: true, clientes: rows });
  } catch (e) {
    console.error('Error cargando clientes:', e);
    res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
  }
});

app.post('/api/clientes', requiereRol('administrador'), async (req, res) => {
  // Alinear con la estructura real de la tabla `clientes` en la BD.
  const { nombre, cedula, telefono, email } = req.body || {};
  if (!nombre) {
    return res.status(400).json({ ok: false, error: 'Nombre requerido' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO clientes (nombre, cedula, telefono, email) VALUES (?, ?, ?, ?)',
      [nombre, cedula || null, telefono || null, email || null]
    );
    res.json({ ok: true, id_cliente: result.insertId });
  } catch (e) {
    console.error('Error creando cliente:', e);
    res.status(500).json({ ok: false, error: 'Error al crear cliente.' });
  }
});

// Implementar PUT y DELETE de forma similar si es necesario.

// Registro de venta simple (AJUSTADO para coincidir con la llamada simple del front-end)
app.post('/api/caja/venta', requiereRol('caja'), async (req, res) => {
  // Si el front envía un arreglo de items, procesamos la venta completa (con promociones)
  if (Array.isArray(req.body.items) && req.body.items.length > 0) {
    try {
      const clienteData = {
        nombre: req.body.cliente_nombre || null,
        cedula: req.body.cliente_cedula || null,
        telefono: req.body.cliente_telefono || null,
        email: req.body.cliente_email || null
      };
      const tipo_pago = req.body.tipo_pago || 'Efectivo';
      const result = await procesarVenta(req.body.items, clienteData, tipo_pago, req.session.user.id);
      return res.json(Object.assign({ ok: true }, result));
    } catch (e) {
      console.error('Error procesando venta en caja (items):', e.message || e);
      return res.status(500).json({ ok: false, message: e.message || 'Error al procesar venta' });
    }
  }

  // Si no hay items, mantenemos comportamiento simple por compatibilidad
  const { id_cliente, monto } = req.body;
  const total_venta = monto;
  const tipo_pago = 'Efectivo';
  try {
    const [ventaResult] = await pool.query(
      `INSERT INTO ventas (fecha_hora, total_venta, tipo_pago, id_usuario, id_cliente)
       VALUES (NOW(), ?, ?, ?, ?)`,
      [total_venta, tipo_pago, req.session.user.id, id_cliente || null]
    );
    const id_venta = ventaResult.insertId;
    res.json({ ok: true, id_venta });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al registrar venta' });
  }
});


// ---------------- Ventas: validar stock y actualizar inventario ----------------
// Ajustar para aceptar id_producto e id_talla (requerido) y decrementar inventario
// (Esta ruta reemplaza la primera ruta fallida /api/ventas que estaba mezclada con la lógica antigua)
app.post('/api/ventas', requiereRol('caja'), async (req, res) => {
  const {
    cliente_nombre, cliente_cedula, cliente_telefono, cliente_email,
    id_producto, id_talla, cantidad, precio_unitario, tipo_pago
  } = req.body;

  // Normalizar items
  let items = Array.isArray(req.body.items) ? req.body.items : [];
  if (items.length === 0 && id_producto) items = [{ id_producto, id_talla, cantidad, precio_unitario }];

  const clienteData = { nombre: cliente_nombre || null, cedula: cliente_cedula || null, telefono: cliente_telefono || null, email: cliente_email || null };
  try {
    const result = await procesarVenta(items, clienteData, tipo_pago || 'Efectivo', req.session.user.id);
    res.json(Object.assign({ ok: true }, result));
  } catch (e) {
    console.error('Error al registrar venta (with promos):', e.message || e);
    res.status(500).json({ ok: false, message: e.message || 'Error al registrar venta' });
  }
});

// Registro de venta: endpoint directo para integraciones o llamadas administrativas
// Rol: cualquiera (Admin o Caja)
app.post('/api/ventas/registrar', requiereRol('cualquiera'), async (req, res) => {
  const { id_cliente, id_usuario, total, detalles, tipo_pago } = req.body || {};

  if (!id_usuario || !total || !Array.isArray(detalles) || detalles.length === 0) {
    return res.status(400).json({ ok: false, error: 'Datos de venta incompletos. Se requieren id_usuario, total y detalles.' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Insertar venta (usar fecha_hora consistente con el esquema existente)
    const [ventaResult] = await conn.query(
      'INSERT INTO ventas (id_cliente, id_usuario, fecha_hora, total_venta, tipo_pago) VALUES (?, ?, NOW(), ?, ?)',
      [id_cliente || null, id_usuario, total, tipo_pago || 'Efectivo']
    );
    const id_venta = ventaResult.insertId;

    // Insertar detalle y actualizar inventario
    for (const item of detalles) {
      const id_producto = Number(item.id_producto || item.id_producto_id || item.producto);
      const id_talla = item.id_talla || null;
      const cantidad = Number(item.cantidad || 0);
      const precio_unitario = Number(item.precio_unitario || item.precio || 0);

      if (!id_producto || !cantidad || cantidad <= 0) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ ok: false, error: 'Cada detalle requiere id_producto y cantidad válidos.' });
      }

      await conn.query(
        'INSERT INTO detalleventa (id_venta, id_producto, id_talla, cantidad, precio_unitario) VALUES (?, ?, ?, ?, ?)',
        [id_venta, id_producto, id_talla || null, cantidad, precio_unitario]
      );

      // Restar inventario por talla si aplica
      if (id_talla) {
        const [upd] = await conn.query('UPDATE inventario SET cantidad = GREATEST(0, cantidad - ?) WHERE id_producto = ? AND id_talla = ?', [cantidad, id_producto, id_talla]);
        // Si no existía fila de inventario por talla, no hacemos insert negativo; simplemente actualizamos inventario total abajo
      }

      // Restar del inventario total del producto
      await conn.query('UPDATE productos SET inventario = GREATEST(0, inventario - ?) WHERE id_producto = ?', [cantidad, id_producto]);
    }

    await conn.commit();
    conn.release();
    return res.json({ ok: true, message: 'Venta registrada exitosamente', id_venta });
  } catch (e) {
    if (conn) { try { await conn.rollback(); conn.release(); } catch (_) {} }
    console.error('Error registrando venta /api/ventas/registrar:', e.message || e);
    return res.status(500).json({ ok: false, error: 'Error al registrar la venta.' });
  }
});


// ---------------- Rutas públicas para Productos (CAJA y front) ----------------
// Listado de productos (para Caja) -> incluye tallas y cantidades
app.get('/api/productos', requiereRol('cualquiera'), async (req, res) => {
  try {
    // Incluir id_categoria para que la Caja pueda evaluar promociones por categoría
    const [rows] = await pool.query('SELECT id_producto, nombre, marca, inventario, precio_venta, id_categoria FROM productos LIMIT 500');
    // Obtener tallas por producto
    for (const prod of rows) {
      const [tallas] = await pool.query(
        'SELECT inventario.id_talla, tallas.nombre, inventario.cantidad FROM inventario JOIN tallas ON inventario.id_talla = tallas.id_talla WHERE inventario.id_producto = ?',
        [prod.id_producto]
      );
      prod.tallas = tallas.map(t => ({ id_talla: t.id_talla, nombre: t.nombre, cantidad: t.cantidad }));
    }
    res.json({ productos: rows });
  } catch (e) {
    console.error('Error listar productos publico:', e.message);
    res.status(500).json({ productos: [] });
  }
});

// Obtener producto por id (para Caja)
app.get('/api/productos/:id', requiereRol('cualquiera'), async (req, res) => {
  const id = req.params.id;
  try {
    // Incluir id_categoria para que la caja/cliente puedan conocer la categoría del producto
    const [rows] = await pool.query('SELECT id_producto, nombre, marca, inventario, precio_venta, id_categoria FROM productos WHERE id_producto = ? LIMIT 1', [id]);
    if (rows.length === 0) return res.json({ producto: null });
    const prod = rows[0];
    const [tallas] = await pool.query(
      'SELECT inventario.id_talla, tallas.nombre, inventario.cantidad FROM inventario JOIN tallas ON inventario.id_talla = tallas.id_talla WHERE inventario.id_producto = ?',
      [prod.id_producto]
    );
    prod.tallas = tallas.map(t => ({ id_talla: t.id_talla, nombre: t.nombre, cantidad: t.cantidad }));
    res.json({ producto: prod });
  } catch (e) {
    console.error('Error obtener producto publico:', e.message);
    res.status(500).json({ producto: null });
  }
});


// Inicio del servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

// ---------------- Reportes: Ventas por Temporada y Rotación de Inventario ----------------
// Estas rutas usan las vistas definidas en la base de datos: vista_ventas_temporada y vista_rotacion_inventario
app.get('/api/reportes/ventas-temporada', requiereRol('administrador'), async (req, res) => {
  try {
    // periodo puede ser: actual, anterior, trimestre, anual, todos
    const periodo = req.query.periodo || 'actual';
    const now = new Date();
    let start, end;
    
    // Calcular rango de fechas según periodo
    switch(periodo) {
      case 'actual':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'anterior':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'trimestre':
        const trimestre = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), trimestre * 3, 1);
        end = new Date(now.getFullYear(), (trimestre + 1) * 3, 1);
        break;
      case 'anual':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear() + 1, 0, 1);
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    const startStr = start.toISOString().slice(0, 19).replace('T', ' ');
    const endStr = end.toISOString().slice(0, 19).replace('T', ' ');

    // Intentar usar la vista si existe, sino calcular manualmente
    try {
      // Algunas vistas no exponen la columna fecha_hora; la vista_ventas_temporada
      // sí ofrece campos como anio, mes y periodo (ej. '2025-11').
      // Filtramos por el campo `periodo` para evitar errores de columna desconocida.
      const startPeriod = startStr.slice(0,7); // 'YYYY-MM'
      const endPeriod = endStr.slice(0,7);
      let query = `SELECT anio, mes, trimestre, periodo, ingreso_total, unidades_vendidas 
                   FROM vista_ventas_temporada 
                   WHERE periodo >= ? AND periodo < ?
                   ORDER BY anio DESC, mes DESC LIMIT 48`;
      const [rows] = await pool.query(query, [startPeriod, endPeriod]);

      if (rows.length > 0) {
        // Si se pidió trimestre, agrupar
    if (periodo === 'trimestre') {
          const grouped = {};
          for (const r of rows) {
            const key = `${r.anio}-T${r.trimestre}`;
            if (!grouped[key]) grouped[key] = { periodo: key, ingreso_total: 0, unidades_vendidas: 0 };
            grouped[key].ingreso_total += Number(r.ingreso_total || 0);
            grouped[key].unidades_vendidas += Number(r.unidades_vendidas || 0);
          }
          return res.json({ ok: true, periodo: 'trimestre', rows: Object.values(grouped) });
        }
        return res.json({ ok: true, periodo, rows });
      }
    } catch (viewError) {
      console.log('Vista no disponible, calculando manualmente:', viewError.message);
    }

    // Fallback: calcular manualmente desde ventas
    const [ventas] = await pool.query(
      `SELECT 
        DATE_FORMAT(v.fecha_hora, '%Y') AS anio,
        DATE_FORMAT(v.fecha_hora, '%m') AS mes,
        QUARTER(v.fecha_hora) AS trimestre,
        DATE_FORMAT(v.fecha_hora, '%Y-%m') AS periodo,
        SUM(v.total_venta) AS ingreso_total,
        SUM((SELECT SUM(dv.cantidad) FROM detalleventa dv WHERE dv.id_venta = v.id_venta)) AS unidades_vendidas
      FROM ventas v
      WHERE v.fecha_hora >= ? AND v.fecha_hora < ?
      GROUP BY anio, mes, trimestre, periodo
      ORDER BY anio DESC, mes DESC`,
      [startStr, endStr]
    );

    const rows = ventas.map(v => ({
      anio: Number(v.anio || 0),
      mes: Number(v.mes || 0),
      trimestre: Number(v.trimestre || 0),
      periodo: v.periodo || '',
      ingreso_total: Number(v.ingreso_total || 0),
      unidades_vendidas: Number(v.unidades_vendidas || 0)
    }));

    if (periodo === 'trimestre') {
      const grouped = {};
      for (const r of rows) {
        const key = `${r.anio}-T${r.trimestre}`;
        if (!grouped[key]) grouped[key] = { periodo: key, ingreso_total: 0, unidades_vendidas: 0 };
        grouped[key].ingreso_total += Number(r.ingreso_total || 0);
        grouped[key].unidades_vendidas += Number(r.unidades_vendidas || 0);
      }
      return res.json({ ok: true, periodo: 'trimestre', rows: Object.values(grouped) });
    }

    return res.json({ ok: true, periodo, rows });
  } catch (e) {
    console.error('Error reportes ventas-temporada:', e.message || e);
    res.status(500).json({ ok: false, rows: [], message: 'Error al obtener ventas por temporada' });
  }
});

// ==================== CONTABILIDAD ====================
// Endpoint para ingresos por ventas
app.get('/api/contabilidad/ingresos', requiereRol('administrador'), async (req, res) => {
  try {
    const periodo = req.query.periodo || 'mes';
    const now = new Date();
    let start, end;
    
    switch(periodo) {
      case 'mes':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'trimestre':
        const trimestre = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), trimestre * 3, 1);
        end = new Date(now.getFullYear(), (trimestre + 1) * 3, 1);
        break;
      case 'anual':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear() + 1, 0, 1);
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }
    
    const startStr = start.toISOString().slice(0, 19).replace('T', ' ');
    const endStr = end.toISOString().slice(0, 19).replace('T', ' ');
    
    const [ingresos] = await pool.query(
      `SELECT fecha_hora, total_venta, tipo_pago 
       FROM ventas 
       WHERE fecha_hora >= ? AND fecha_hora < ? 
       ORDER BY fecha_hora DESC`,
      [startStr, endStr]
    );
    
    res.json({ ok: true, ingresos });
  } catch (e) {
    console.error('Error /api/contabilidad/ingresos:', e.message || e);
    res.status(500).json({ ok: false, ingresos: [], error: 'Error del servidor' });
  }
});

// Endpoint para reporte de utilidad por productos
app.get('/api/reportes/utilidad-productos', requiereRol('administrador'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
        p.id_producto,
        p.nombre,
        p.marca,
        p.precio_venta,
        COALESCE(AVG(dc.costo_unitario), 0) AS costo_promedio,
        COALESCE(SUM(dv.cantidad), 0) AS unidades_vendidas,
        COALESCE(SUM(dv.cantidad * dv.precio_unitario), 0) AS total_ventas,
        COALESCE(SUM(dv.cantidad * COALESCE(dc.costo_unitario, 0)), 0) AS total_costos,
        (COALESCE(SUM(dv.cantidad * dv.precio_unitario), 0) - COALESCE(SUM(dv.cantidad * COALESCE(dc.costo_unitario, 0)), 0)) AS utilidad_total,
        (p.precio_venta - COALESCE(AVG(dc.costo_unitario), 0)) AS utilidad_unitaria,
        CASE 
          WHEN p.precio_venta > 0 THEN 
            ((p.precio_venta - COALESCE(AVG(dc.costo_unitario), 0)) / p.precio_venta) * 100
          ELSE 0
        END AS margen_porcentaje
      FROM productos p
      LEFT JOIN detalleventa dv ON p.id_producto = dv.id_producto
      LEFT JOIN detallecompra dc ON p.id_producto = dc.id_producto
      GROUP BY p.id_producto, p.nombre, p.marca, p.precio_venta
      HAVING unidades_vendidas > 0
      ORDER BY utilidad_total DESC`
    );
    
    const utilidad = rows.map(r => ({
      nombre: `${r.marca || ''} ${r.nombre || ''}`.trim(),
      costo_promedio: Number(r.costo_promedio || 0),
      precio_venta: Number(r.precio_venta || 0),
      utilidad_unitaria: Number(r.utilidad_unitaria || 0),
      unidades_vendidas: Number(r.unidades_vendidas || 0),
      utilidad_total: Number(r.utilidad_total || 0),
      margen_porcentaje: Number(r.margen_porcentaje || 0)
    }));
    
    res.json({ ok: true, utilidad });
  } catch (e) {
    console.error('Error /api/reportes/utilidad-productos:', e.message || e);
    res.status(500).json({ ok: false, utilidad: [], error: 'Error del servidor' });
  }
});

app.get('/api/reportes/rotacion-inventario', requiereRol('administrador'), async (req, res) => {
  try {
    const top = Math.max(1, Math.min(500, Number(req.query.top) || 100));
    // Intentar usar la vista si existe, sino calcular manualmente
    try {
    const [rows] = await pool.query(`SELECT id_producto, nombre, marca, categoria, stock_actual, unidades_vendidas_ultimo_mes, indice_rotacion FROM vista_rotacion_inventario ORDER BY indice_rotacion DESC LIMIT ?`, [top]);
    return res.json({ ok: true, rows });
    } catch (viewError) {
      // Si la vista no existe, calcular manualmente
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const startStr = lastMonth.toISOString().slice(0, 19).replace('T', ' ');
      const endStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 19).replace('T', ' ');
      
      const [rows] = await pool.query(
        `SELECT 
          p.id_producto,
          p.nombre,
          p.marca,
          c.nombre AS categoria,
          p.inventario AS stock_actual,
          COALESCE(SUM(dv.cantidad), 0) AS unidades_vendidas_ultimo_mes,
          CASE 
            WHEN p.inventario > 0 THEN COALESCE(SUM(dv.cantidad), 0) / p.inventario
            ELSE 0
          END AS indice_rotacion
        FROM productos p
        LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
        LEFT JOIN detalleventa dv ON p.id_producto = dv.id_producto
        LEFT JOIN ventas v ON dv.id_venta = v.id_venta
        WHERE v.fecha_hora >= ? AND v.fecha_hora < ?
        GROUP BY p.id_producto, p.nombre, p.marca, c.nombre, p.inventario
        ORDER BY indice_rotacion DESC
        LIMIT ?`,
        [startStr, endStr, top]
      );
      return res.json({ ok: true, rows });
    }
  } catch (e) {
    console.error('Error reportes rotacion-inventario:', e.message || e);
    res.status(500).json({ ok: false, rows: [], message: 'Error al obtener rotación de inventario' });
  }
});

// Endpoint para reporte de inventario actual
app.get('/api/reportes/inventario-actual', requiereRol('administrador'), async (req, res) => {
  try {
    const [productos] = await pool.query(
      `SELECT p.id_producto, p.nombre, p.marca, p.inventario AS stock_total, c.nombre AS categoria
       FROM productos p
       LEFT JOIN categorias c ON p.id_categoria = c.id_categoria
       ORDER BY p.marca, p.nombre`
    );
    
    // Para cada producto, obtener tallas con cantidades
    for (const prod of productos) {
      const [tallas] = await pool.query(
        `SELECT t.nombre AS talla, i.cantidad
         FROM inventario i
         LEFT JOIN tallas t ON i.id_talla = t.id_talla
         WHERE i.id_producto = ?
         ORDER BY t.nombre`,
        [prod.id_producto]
      );
      prod.tallas = tallas;
    }
    
    res.json({ ok: true, rows: productos });
  } catch (e) {
    console.error('Error /api/reportes/inventario-actual:', e.message || e);
    res.status(500).json({ ok: false, rows: [], error: 'Error del servidor' });
  }
});

// Endpoint para reporte de compras por periodo
app.get('/api/reportes/compras-periodo', requiereRol('administrador'), async (req, res) => {
  try {
    const start = req.query.start || null;
    const end = req.query.end || null;
    
    console.log('📊 Reporte de compras solicitado - Período:', { start, end });
    
    let query = `
      SELECT 
        c.id_compra,
        c.fecha_compra,
        c.total_compra,
        pr.nombre AS proveedor,
        dc.id_producto,
        p.marca,
        p.nombre AS producto,
        dc.cantidad,
        dc.costo_unitario,
        (dc.cantidad * dc.costo_unitario) AS total_linea
       FROM compras c
      LEFT JOIN proveedores pr ON c.id_proveedor = pr.id_proveedor
      LEFT JOIN detallecompra dc ON c.id_compra = dc.id_compra
      LEFT JOIN productos p ON dc.id_producto = p.id_producto
      WHERE 1=1
    `;
    const params = [];
    
    if (start) {
      query += ' AND DATE(c.fecha_compra) >= ?';
      params.push(start);
      console.log('  - Fecha inicio:', start);
    }
    if (end) {
      query += ' AND DATE(c.fecha_compra) <= ?';
      params.push(end);
      console.log('  - Fecha fin:', end);
    }
    
    query += ' ORDER BY c.fecha_compra DESC, c.id_compra, dc.id_producto';
    
    console.log('  - Query:', query);
    console.log('  - Parámetros:', params);
    
    const [rows] = await pool.query(query, params);
    
    console.log('  - Filas obtenidas de la BD:', rows.length);

    // Agrupar por proveedor > compra > líneas
    const grupos = {};
    let totalGeneral = 0;
    let comprasCount = 0;
    
    rows.forEach(row => {
      const prov = row.proveedor || 'Sin proveedor';
      const compraId = row.id_compra;
      
      if (!grupos[prov]) {
        grupos[prov] = { proveedor: prov, compras: [] };
      }
      
      // Buscar si la compra ya existe en este proveedor
      let compra = grupos[prov].compras.find(c => c.id_compra === compraId);
      if (!compra) {
        compra = {
          id_compra: compraId,
          fecha_compra: row.fecha_compra,
          total_compra: row.total_compra,
          lineas: []
        };
        grupos[prov].compras.push(compra);
        comprasCount++;
      }
      
      // Agregar línea si existe (product existe)
      if (row.id_producto) {
        compra.lineas.push({
          id_producto: row.id_producto,
          marca: row.marca,
          producto: row.producto,
          cantidad: row.cantidad,
          costo_unitario: row.costo_unitario,
          total_linea: row.total_linea
        });
        totalGeneral += Number(row.total_linea || 0);
      }
    });
    
    console.log('  - Compras agrupadas:', comprasCount);
    console.log('  - Proveedores únicos:', Object.keys(grupos).length);
    console.log('  - Total general calculado: $' + totalGeneral.toFixed(2));
    
    res.json({ 
      ok: true, 
      grupos: Object.values(grupos), 
      total_general: totalGeneral,
      compras_count: comprasCount
    });
  } catch (e) {
    console.error('❌ Error /api/reportes/compras-periodo:', e.message || e);
    console.error('   Stack:', e.stack);
    res.status(500).json({ 
      ok: false, 
      grupos: [], 
      error: 'Error del servidor: ' + e.message,
      compras_count: 0
    });
  }
});

// ==================== CUENTAS POR PAGAR ====================
// Endpoint para obtener cuentas por pagar desde compras
app.get('/api/cuentas-pagar', requiereRol('administrador'), async (req, res) => {
  try {
    // Obtener tasa de cambio actual
    let tasaDolar = 36.0; // Valor por defecto
    try {
      // Intentar obtener desde la API de tasa BCV del mismo servidor
      const fetch = require('node-fetch');
      const tasaRes = await fetch('http://localhost:3000/api/tasa-bcv', { timeout: 2000 }).catch(() => null);
      if (tasaRes && tasaRes.ok) {
        const tasaData = await tasaRes.json();
        tasaDolar = Number(tasaData.tasa || 36.0);
      }
  } catch (e) {
      console.log('No se pudo obtener tasa, usando default:', e.message);
    }

    // Obtener compras con estado pendiente o parcial
    const [compras] = await pool.query(
      `SELECT 
        c.id_compra,
        c.fecha_compra,
        c.total_compra,
        c.estado_pago,
        pr.nombre AS nombre_proveedor,
        pr.id_proveedor,
        cpp.id_cuenta,
        cpp.monto_total,
        cpp.monto_pagado,
        cpp.monto_pendiente,
        cpp.fecha_vencimiento,
        cpp.estado AS estado_cuenta
      FROM compras c
      LEFT JOIN proveedores pr ON c.id_proveedor = pr.id_proveedor
      LEFT JOIN cuentas_por_pagar cpp ON c.id_compra = cpp.id_compra
      WHERE c.estado_pago IN ('Pendiente', 'Parcial')
      ORDER BY c.fecha_compra DESC`
    );

    const cuentas = compras.map(compra => {
      // Obtener monto total desde la compra o desde cuentas_por_pagar
      const montoTotal = Number(compra.monto_total || compra.total_compra || 0);
      const montoPagado = Number(compra.monto_pagado || 0);
      const montoPendiente = montoTotal - montoPagado;
      const porcentajePendiente = montoTotal > 0 ? ((montoPendiente / montoTotal) * 100).toFixed(2) : '100.00';
      
      // Calcular fecha de vencimiento (30 días después de la compra)
      const fechaCompra = new Date(compra.fecha_compra);
      const fechaVencimiento = new Date(fechaCompra);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
      
      return {
        id_cuenta: compra.id_cuenta || compra.id_compra,
        id_compra: compra.id_compra,
        nombre_proveedor: compra.nombre_proveedor || 'Sin proveedor',
        monto_total: montoTotal,
        monto_pagado: montoPagado,
        monto_pendiente: montoPendiente,
        porcentaje_pendiente: porcentajePendiente,
        fecha_compra: compra.fecha_compra,
        fecha_vencimiento: compra.fecha_vencimiento || fechaVencimiento.toISOString().split('T')[0],
        estado: compra.estado_pago,
        monto_total_usd: montoTotal,
        monto_total_bs: (montoTotal * tasaDolar).toFixed(2),
        monto_pendiente_usd: montoPendiente,
        monto_pendiente_bs: (montoPendiente * tasaDolar).toFixed(2),
        tasa_dolar: tasaDolar
      };
    });

    res.json({ ok: true, cuentas });
  } catch (e) {
    console.error('Error /api/cuentas-pagar:', e.message || e);
    res.status(500).json({ ok: false, cuentas: [], error: 'Error del servidor' });
  }
});

// Endpoint para registrar pago de cuenta por pagar
app.post('/api/cuentas-pagar/pagar', requiereRol('administrador'), async (req, res) => {
  let conn;
  try {
    const { id_compra, monto_pagado, estado_pago, metodo_pago, referencia, notas } = req.body;
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Actualizar o crear cuenta por pagar
    const [cuentaExist] = await conn.query(
      'SELECT id_cuenta, monto_total, monto_pagado FROM cuentas_por_pagar WHERE id_compra = ?',
      [id_compra]
    );

    // Obtener monto total desde la compra si no existe en cuentas_por_pagar
    let montoTotal = 0;
    if (cuentaExist.length > 0) {
      montoTotal = Number(cuentaExist[0].monto_total || 0);
    } else {
      const [compra] = await conn.query('SELECT total_compra FROM compras WHERE id_compra = ?', [id_compra]);
      montoTotal = compra.length > 0 ? Number(compra[0].total_compra || 0) : Number(req.body.monto_total || 0);
    }
    
    const montoPagadoAnterior = cuentaExist.length > 0 ? Number(cuentaExist[0].monto_pagado || 0) : 0;
    const nuevoMontoPagado = montoPagadoAnterior + Number(monto_pagado || 0);
    const nuevoMontoPendiente = montoTotal - nuevoMontoPagado;

    let nuevoEstado = 'PENDIENTE';
    if (nuevoMontoPendiente <= 0) {
      nuevoEstado = 'PAGADA';
    } else if (nuevoMontoPagado > 0) {
      nuevoEstado = 'PARCIAL';
    }

    // Obtener id_cuenta (crear si no existe)
    let idCuenta = cuentaExist.length > 0 ? cuentaExist[0].id_cuenta : null;
    
    if (!idCuenta) {
      // Crear cuenta si no existe
      const fechaCompra = new Date();
      const fechaVencimiento = new Date(fechaCompra);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);
      
      const [compra] = await conn.query('SELECT id_proveedor, total_compra FROM compras WHERE id_compra = ?', [id_compra]);
      const idProveedor = compra.length > 0 ? compra[0].id_proveedor : null;
      const montoTotalCompra = compra.length > 0 ? Number(compra[0].total_compra || 0) : montoTotal;

      const [result] = await conn.query(
        `INSERT INTO cuentas_por_pagar 
         (id_proveedor, id_compra, monto_total, monto_pagado, monto_pendiente, fecha_vencimiento, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [idProveedor, id_compra, montoTotalCompra, nuevoMontoPagado, nuevoMontoPendiente, fechaVencimiento.toISOString().split('T')[0], nuevoEstado]
      );
      idCuenta = result.insertId;
    } else {
      // Actualizar cuenta existente
      await conn.query(
        `UPDATE cuentas_por_pagar 
         SET monto_pagado = ?, monto_pendiente = ?, estado = ?
         WHERE id_cuenta = ?`,
        [nuevoMontoPagado, nuevoMontoPendiente, nuevoEstado, idCuenta]
      );
    }

    // Registrar pago en tabla pagos_proveedores
    await conn.query(
      `INSERT INTO pagos_proveedores 
       (id_cuenta, monto, metodo_pago, referencia, id_usuario, notas)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [idCuenta, monto_pagado, metodo_pago || 'EFECTIVO', referencia || null, req.session.user.id, notas || null]
    );

    // Actualizar estado de la compra
    await conn.query(
      'UPDATE compras SET estado_pago = ? WHERE id_compra = ?',
      [nuevoEstado, id_compra]
    );

    await conn.commit();
    res.json({ ok: true, message: 'Pago registrado correctamente' });
  } catch (e) {
    if (conn) await conn.rollback();
    console.error('Error /api/cuentas-pagar/pagar:', e.message || e);
    res.status(500).json({ ok: false, error: 'Error del servidor' });
  } finally {
    if (conn) conn.release();
  }
});

// ==================== CONTROL DE CAJA ====================
// Endpoint para obtener movimientos de caja
app.get('/api/caja/movimientos', requiereRol('administrador'), async (req, res) => {
  try {
    const [movimientos] = await pool.query(
      `SELECT 
        mc.id_movimiento,
        mc.tipo_movimiento AS tipo,
        mc.monto,
        mc.descripcion,
        mc.fecha_hora,
        u.usuario AS nombre_usuario,
        mc.referencia_id AS referencia
      FROM movimientoscaja mc
      LEFT JOIN usuarios u ON mc.id_usuario = u.id_usuario
      ORDER BY mc.fecha_hora DESC
      LIMIT 500`
    );

    res.json({ ok: true, movimientos });
  } catch (e) {
    console.error('Error /api/caja/movimientos:', e.message || e);
    res.status(500).json({ ok: false, movimientos: [], error: 'Error del servidor' });
  }
});

// ==================== CONCILIACIÓN BANCARIA ====================
// Endpoint para obtener conciliaciones
app.get('/api/conciliaciones', requiereRol('administrador'), async (req, res) => {
  try {
    const [conciliaciones] = await pool.query(
      `SELECT 
        id_conciliacion,
        fecha_conciliacion,
        saldo_libro,
        saldo_banco,
        diferencia,
        estado,
        notas,
        fecha_registro
      FROM conciliacion_bancaria
      ORDER BY fecha_conciliacion DESC
      LIMIT 100`
    );

    res.json({ ok: true, conciliaciones });
  } catch (e) {
    console.error('Error /api/conciliaciones:', e.message || e);
    res.status(500).json({ ok: false, conciliaciones: [], error: 'Error del servidor' });
  }
});

// Endpoint para crear conciliación
app.post('/api/conciliaciones', requiereRol('administrador'), async (req, res) => {
  try {
    const { fecha_conciliacion, saldo_libro, saldo_banco, notas } = req.body;
    const diferencia = Number(saldo_libro) - Number(saldo_banco);
    const estado = Math.abs(diferencia) < 0.01 ? 'CONCILIADA' : 'CON_DIFERENCIAS';

    const [result] = await pool.query(
      `INSERT INTO conciliacion_bancaria 
       (fecha_conciliacion, saldo_libro, saldo_banco, diferencia, estado, notas, id_usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fecha_conciliacion, saldo_libro, saldo_banco, diferencia, estado, notas || null, req.session.user.id]
    );

    res.json({ ok: true, id_conciliacion: result.insertId });
  } catch (e) {
    console.error('Error /api/conciliaciones POST:', e.message || e);
    res.status(500).json({ ok: false, error: 'Error del servidor' });
  }
});

// ==================== REPORTES MEJORADOS ====================
// Reporte de ventas con totales por tipo de pago
app.get('/api/reportes/ventas-detalle', requiereRol('administrador'), async (req, res) => {
  try {
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = Number(req.query.month) || (now.getMonth() + 1);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2,'0')}-01 00:00:00`;
    const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2,'0')}-01 00:00:00`;

    const [ventas] = await pool.query(
      `SELECT 
        v.id_venta,
        v.fecha_hora,
        v.total_venta,
        v.tipo_pago,
        c.nombre AS cliente,
        u.usuario AS vendedor
      FROM ventas v
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
      LEFT JOIN usuarios u ON v.id_usuario = u.id_usuario
      WHERE v.fecha_hora >= ? AND v.fecha_hora < ?
      ORDER BY v.fecha_hora DESC`,
      [startStr, endStr]
    );

    // Calcular totales por tipo de pago
    const totales = {
      efectivo: 0,
      pago_movil: 0,
      transferencia: 0,
      tarjeta: 0,
      total: 0
    };

    ventas.forEach(v => {
      const monto = Number(v.total_venta || 0);
      totales.total += monto;
      const tipo = (v.tipo_pago || '').toLowerCase();
      if (tipo.includes('efectivo')) totales.efectivo += monto;
      else if (tipo.includes('movil') || tipo.includes('pago móvil')) totales.pago_movil += monto;
      else if (tipo.includes('transferencia')) totales.transferencia += monto;
      else if (tipo.includes('tarjeta')) totales.tarjeta += monto;
      else totales.efectivo += monto; // Por defecto
    });

    res.json({ ok: true, ventas, totales });
  } catch (e) {
    console.error('Error /api/reportes/ventas-detalle:', e.message || e);
    res.status(500).json({ ok: false, ventas: [], totales: {}, error: 'Error del servidor' });
  }
});

// Reporte de margen de ganancia por categoría
app.get('/api/reportes/margen-categoria', requiereRol('administrador'), async (req, res) => {
  try {
    // Primero obtener todas las categorías
    const [categorias] = await pool.query('SELECT id_categoria, nombre FROM categorias ORDER BY nombre');
    
    // Luego calcular estadísticas para cada categoría
    const categoriasConDatos = await Promise.all(categorias.map(async (cat) => {
      const [stats] = await pool.query(
        `SELECT 
          COUNT(DISTINCT p.id_producto) AS total_productos,
          COALESCE(AVG(p.precio_venta), 0) AS precio_promedio,
          COALESCE(AVG(dc.costo_unitario), 0) AS costo_promedio,
          COALESCE(SUM(dv.cantidad * dv.precio_unitario), 0) AS total_ventas,
          COALESCE(SUM(dv.cantidad * COALESCE(dc.costo_unitario, 0)), 0) AS total_costos,
          COALESCE(SUM(dv.cantidad * dv.precio_unitario), 0) - COALESCE(SUM(dv.cantidad * COALESCE(dc.costo_unitario, 0)), 0) AS utilidad_total
        FROM categorias c
        LEFT JOIN productos p ON c.id_categoria = p.id_categoria
        LEFT JOIN detalleventa dv ON p.id_producto = dv.id_producto
        LEFT JOIN detallecompra dc ON p.id_producto = dc.id_producto
        WHERE c.id_categoria = ?
        GROUP BY c.id_categoria, c.nombre`,
        [cat.id_categoria]
      );
      
      const stat = stats[0] || {};
      const precioPromedio = Number(stat.precio_promedio || 0);
      const costoPromedio = Number(stat.costo_promedio || 0);
      const margenPromedio = precioPromedio > 0 ? ((precioPromedio - costoPromedio) / precioPromedio) * 100 : 0;
      
      return {
        categoria: cat.nombre || 'Sin categoría',
        total_productos: Number(stat.total_productos || 0),
        precio_promedio: precioPromedio,
        costo_promedio: costoPromedio,
        total_ventas: Number(stat.total_ventas || 0),
        total_costos: Number(stat.total_costos || 0),
        utilidad_total: Number(stat.utilidad_total || 0),
        margen_promedio: margenPromedio
      };
    }));

  // Ordenar por margen promedio descendente (mayor margen primero)
  categoriasConDatos.sort((a, b) => b.margen_promedio - a.margen_promedio);

    res.json({ ok: true, categorias: categoriasConDatos });
  } catch (e) {
    console.error('Error /api/reportes/margen-categoria:', e.message || e);
    res.status(500).json({ ok: false, categorias: [], error: 'Error del servidor' });
  }
});

// Reporte top 10 utilidad por producto
app.get('/api/reportes/utilidad-top10', requiereRol('administrador'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
        p.id_producto,
        p.nombre,
        p.marca,
        p.precio_venta,
        COALESCE(AVG(dc.costo_unitario), 0) AS costo_promedio,
        COALESCE(SUM(dv.cantidad), 0) AS unidades_vendidas,
        COALESCE(SUM(dv.cantidad * dv.precio_unitario), 0) AS total_ventas,
        COALESCE(SUM(dv.cantidad * COALESCE(dc.costo_unitario, 0)), 0) AS total_costos,
        (COALESCE(SUM(dv.cantidad * dv.precio_unitario), 0) - COALESCE(SUM(dv.cantidad * COALESCE(dc.costo_unitario, 0)), 0)) AS utilidad_total,
        (p.precio_venta - COALESCE(AVG(dc.costo_unitario), 0)) AS utilidad_unitaria,
        CASE 
          WHEN p.precio_venta > 0 THEN 
            ((p.precio_venta - COALESCE(AVG(dc.costo_unitario), 0)) / p.precio_venta) * 100
          ELSE 0
        END AS margen_porcentaje
      FROM productos p
      LEFT JOIN detalleventa dv ON p.id_producto = dv.id_producto
      LEFT JOIN detallecompra dc ON p.id_producto = dc.id_producto
      GROUP BY p.id_producto, p.nombre, p.marca, p.precio_venta
      HAVING unidades_vendidas > 0
      ORDER BY utilidad_total DESC
      LIMIT 10`
    );

    const productos = rows.map(r => ({
      nombre: `${r.marca || ''} ${r.nombre || ''}`.trim(),
      costo_promedio: Number(r.costo_promedio || 0),
      precio_venta: Number(r.precio_venta || 0),
      utilidad_unitaria: Number(r.utilidad_unitaria || 0),
      unidades_vendidas: Number(r.unidades_vendidas || 0),
      total_ventas: Number(r.total_ventas || 0),
      utilidad_total: Number(r.utilidad_total || 0),
      margen_porcentaje: Number(r.margen_porcentaje || 0)
    }));

    res.json({ ok: true, productos });
  } catch (e) {
    console.error('Error /api/reportes/utilidad-top10:', e.message || e);
    res.status(500).json({ ok: false, productos: [], error: 'Error del servidor' });
  }
});

// ---------------- NUEVOS REPORTES ----------------
// Todos requieren rol de administrador

// Reporte de Ventas (Totales mensuales)
app.get('/api/reportes/ventas/mensual', requiereRol('administrador'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        DATE_FORMAT(fecha_hora, '%Y-%m') AS mes,
        SUM(total_venta) AS total_ventas,
        COUNT(id_venta) AS num_ventas
      FROM ventas
      WHERE fecha_hora >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY mes
      ORDER BY mes ASC
    `);
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('Error Reporte Ventas Mensuales:', e.message || e);
    res.status(500).json({ ok: false, error: 'Error al generar reporte de ventas.' });
  }
});

// Reporte de Compras (Totales mensuales)
app.get('/api/reportes/compras/mensual', requiereRol('administrador'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        DATE_FORMAT(fecha_compra, '%Y-%m') AS mes,
        SUM(total_compra) AS total_compras,
        COUNT(id_compra) AS num_compras
      FROM compras
      WHERE fecha_compra >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY mes
      ORDER BY mes ASC
    `);
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('Error Reporte Compras Mensuales:', e.message || e);
    res.status(500).json({ ok: false, error: 'Error al generar reporte de compras.' });
  }
});

// Reporte de Clientes (Top 10 por gasto)
app.get('/api/reportes/clientes/top', requiereRol('administrador'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        c.id_cliente,
        c.nombre,
        c.cedula,
        COALESCE(SUM(v.total_venta),0) AS gasto_total,
        COUNT(v.id_venta) AS total_compras
      FROM clientes c
      JOIN ventas v ON c.id_cliente = v.id_cliente
      GROUP BY c.id_cliente, c.nombre, c.cedula
      ORDER BY gasto_total DESC
      LIMIT 10
    `);
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('Error Reporte Top Clientes:', e.message || e);
    res.status(500).json({ ok: false, error: 'Error al generar reporte de clientes.' });
  }
});

// Reporte de Temporada/Tendencias (Ventas agrupadas por Categoría en el último año)
app.get('/api/reportes/tendencias/categorias', requiereRol('administrador'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        cat.nombre AS categoria,
        SUM(dv.cantidad) AS unidades_vendidas,
        SUM(dv.cantidad * dv.precio_unitario) AS ingresos_categoria
      FROM detalleventa dv
      JOIN productos p ON dv.id_producto = p.id_producto
      JOIN categorias cat ON p.id_categoria = cat.id_categoria
      JOIN ventas v ON dv.id_venta = v.id_venta
      WHERE v.fecha_hora >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY cat.nombre
      ORDER BY ingresos_categoria DESC
    `);
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('Error Reporte Tendencias:', e.message || e);
    res.status(500).json({ ok: false, error: 'Error al generar reporte de tendencias.' });
  }
});

// Reporte Adicional: Rotación de Inventario Lenta (Productos sin venta en 90 días)
app.get('/api/reportes/inventario/lento', requiereRol('administrador'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        p.id_producto,
        p.nombre,
        p.precio_venta,
        MAX(v.fecha_hora) AS ultima_venta
      FROM productos p
      LEFT JOIN detalleventa dv ON p.id_producto = dv.id_producto
      LEFT JOIN ventas v ON dv.id_venta = v.id_venta
      GROUP BY p.id_producto
      HAVING ultima_venta IS NULL OR ultima_venta <= DATE_SUB(NOW(), INTERVAL 90 DAY)
      ORDER BY ultima_venta ASC
    `);
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('Error Reporte Inventario Lento:', e.message || e);
    res.status(500).json({ ok: false, error: 'Error al generar reporte de inventario lento.' });
  }
});
