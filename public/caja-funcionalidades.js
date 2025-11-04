// JS para mejorar la experiencia de Caja: carrito, cálculo y visualización de promociones
let cajaCart = [];
let productosCache = [];
let promocionesCache = [];
let categoriasCache = [];
let cachedTasa = null;
let cachedTasaTs = 0;

document.addEventListener('DOMContentLoaded', async () => {
  if (document.getElementById('ventaProducto')) {
    console.log('=== INICIANDO CAJA ===');
    // Cargar productos, promociones y categorías de forma automática y esperar a que terminen
    try {
      console.log('Cargando datos iniciales...');
      await loadProductosForCaja();
      console.log('Productos cargados:', productosCache.length);
      
      await loadPromociones();
      console.log('Promociones cargadas:', promocionesCache.length);
      console.log('Promociones:', promocionesCache);
      
      await loadCategorias();
      console.log('Categorías cargadas:', categoriasCache.length);
      // Cargar tasa de conversión para mostrar precios en Bs
      try { await getTasa(); console.log('Tasa cargada:', cachedTasa); } catch(e){ console.warn('No se pudo obtener tasa:', e); }
    } catch (e) {
      console.error('Error inicializando:', e);
      // intentar cargar individualmente si Promise.all falló
      await loadProductosForCaja().catch(()=>{});
      await loadPromociones().catch(()=>{});
      await loadCategorias().catch(()=>{});
    }

    // Listeners
    document.getElementById('btnAgregarProducto').addEventListener('click', onAgregarAlCarrito);
    document.getElementById('btnPagarVenta').addEventListener('click', onPagarVenta);
    // Búsqueda automática de cliente por cédula (debounce)
    const cedInput = document.getElementById('ventaClienteCedula');
    if (cedInput) {
      let tCed;
      cedInput.addEventListener('input', function(e){
        clearTimeout(tCed);
        tCed = setTimeout(() => { buscarClientePorCedula(e.target.value.trim()); }, 350);
      });
      cedInput.addEventListener('blur', function(e){ buscarClientePorCedula(e.target.value.trim()); });
    }
    // Render inicial del carrito (si hay items previos)
    renderCart();
    console.log('=== CAJA INICIADA ===');
  }
});

async function loadProductosForCaja() {
  try {
    const res = await fetch('/api/productos');
    const data = await res.json();
    productosCache = data.productos || [];
    const sel = document.getElementById('ventaProducto');
    sel.innerHTML = `<option value="">Selecciona producto</option>`;
    productosCache.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id_producto;
      opt.textContent = `${p.marca || ''} - ${p.nombre} - $${parseFloat(p.precio_venta||0).toFixed(2)} | Stock: ${p.inventario||0}`;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', onProductoChange);
  } catch (e) {
    console.error('Error cargando productos para caja:', e);
  }
}

async function getTasa() {
  const now = Date.now();
  if (cachedTasa && (now - cachedTasaTs) < (1000*60*5)) return cachedTasa;
  try {
    const res = await fetch('/api/tasa-bcv');
    const j = await res.json();
    const t = Number(j.tasa || j.valor || 0) || 0;
    if (t > 0) { cachedTasa = t; cachedTasaTs = Date.now(); return cachedTasa; }
  } catch (e) { console.warn('getTasa error', e); }
  // fallback
  cachedTasa = 36; cachedTasaTs = Date.now(); return cachedTasa;
}

async function buscarClientePorCedula(cedula) {
  if (!cedula) return;
  try {
    const res = await fetch('/api/clientes/buscar?cedula=' + encodeURIComponent(cedula));
    if (!res.ok) return;
    const j = await res.json();
    if (j && j.cliente) {
      const c = j.cliente;
      document.getElementById('ventaClienteNombre').value = c.nombre || '';
      document.getElementById('ventaClienteTelefono').value = c.telefono || '';
      document.getElementById('ventaClienteEmail').value = c.email || '';
      console.log('Cliente cargado por cédula:', c);
    }
  } catch (e) { console.warn('Error buscarClientePorCedula:', e); }
}

// Si un producto no trae id_categoria en la lista inicial, intentar obtener detalle del producto
async function ensureProductoTieneCategoria(prod) {
  if (!prod || prod.id_categoria !== undefined && prod.id_categoria !== null) return prod;
  try {
    const res = await fetch(`/api/productos/${encodeURIComponent(prod.id_producto)}`);
    if (!res.ok) return prod;
    const json = await res.json();
    if (json && json.producto) {
      prod.id_categoria = json.producto.id_categoria || null;
      // también actualizar el cache global
      const idx = productosCache.findIndex(p => p.id_producto === prod.id_producto);
      if (idx >= 0) productosCache[idx] = Object.assign(productosCache[idx] || {}, prod);
    }
  } catch (e) {
    console.warn('No se pudo obtener detalle de producto para categoría:', e && e.message ? e.message : e);
  }
  return prod;
}

async function loadPromociones() {
  try {
    console.log('[LOAD PROMOCIONES] Iniciando carga...');
    const res = await fetch('/api/promociones/activas');
    if (!res.ok) {
      console.error('[LOAD PROMOCIONES] Error HTTP:', res.status, res.statusText);
      promocionesCache = [];
      showNotification('No se pudieron cargar las promociones. Status: ' + res.status, 'error');
      return;
    }
    const data = await res.json();
    promocionesCache = data.promociones || [];
    console.log(`[LOAD PROMOCIONES] Cargadas ${promocionesCache.length} promociones activas`);
    if (promocionesCache.length > 0) {
      console.log('[LOAD PROMOCIONES] Detalle de promociones:', promocionesCache.map(p => ({
        id: p.id_promocion,
        nombre: p.nombre,
        tipo: p.tipo_promocion,
        valor: p.valor,
        categoria: p.id_categoria,
        producto: p.id_producto,
        activa: p.activa,
        fecha_inicio: p.fecha_inicio,
        fecha_fin: p.fecha_fin
      })));
    }
    
    // Después de cargar promociones, actualizar vista si hay carrito
    if (cajaCart.length > 0) {
      renderCart();
    }
  } catch (e) {
    console.error('[LOAD PROMOCIONES] Error:', e);
    showNotification('No se pudieron cargar las promociones.', 'error');
    promocionesCache = [];
  }
}

async function loadCategorias() {
  try {
    const res = await fetch('/api/categorias');
    if (!res.ok) {
      categoriasCache = [];
      return;
    }
    const data = await res.json();
    categoriasCache = data.categorias || [];
    const categoriaSel = document.getElementById('ventaCategoria');
    if (categoriaSel) {
      categoriaSel.innerHTML = '<option value="">Selecciona categoría</option>';
      categoriasCache.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id_categoria;
        opt.textContent = cat.nombre;
        categoriaSel.appendChild(opt);
      });
    }
  } catch (e) {
    console.error('Error cargando categorías:', e);
    categoriasCache = [];
  }
}

function showNotification(message, type = 'info', timeout = 0) {
  const container = document.getElementById('cajaNotif');
  if (!container) return;
  container.innerHTML = `<div class="notif ${type}">${message}</div>`;
  if (timeout && timeout > 0) setTimeout(() => { container.innerHTML = ''; }, timeout);
}

function clearNotification() {
  const container = document.getElementById('cajaNotif');
  if (!container) return;
  container.innerHTML = '';
}

async function onProductoChange() {
  const pid = document.getElementById('ventaProducto').value;
  const prod = productosCache.find(p => String(p.id_producto) === String(pid));
  if (prod) {
    // Asegurar que el producto tenga id_categoria para las promos
    await ensureProductoTieneCategoria(prod);
    // Precio del producto viene en USD (precio_venta). Convertimos y mostramos el precio unitario en Bs.
    const usd = parseFloat(prod.precio_venta || 0) || 0;
    document.getElementById('ventaPrecioUnitario').value = usd.toFixed(2); // oculto, para referencia
    try {
      const tasa = await getTasa();
      const bs = usd * (Number(tasa) || 1);
      document.getElementById('ventaPrecioUnitarioBs').value = bs ? bs.toFixed(2) : '';
    } catch (e) {
      document.getElementById('ventaPrecioUnitarioBs').value = '';
    }
    const tallaSel = document.getElementById('ventaTalla');
    tallaSel.innerHTML = '<option value="">Selecciona talla</option>';
    (prod.tallas || []).forEach(t => {
      const o = document.createElement('option'); o.value = t.id_talla; o.textContent = `${t.nombre} (${t.cantidad})`; tallaSel.appendChild(o);
    });
    // Pre-seleccionar la categoría del producto si existe
    const categoriaSel = document.getElementById('ventaCategoria');
    if (categoriaSel && prod.id_categoria) {
      categoriaSel.value = prod.id_categoria;
    }
  }
  calcularTotalesForm();
}

function calcularTotalesForm() {
  // Precio base en Bs (visible). Convertir a USD usando tasa
  const precio_bs = parseFloat(document.getElementById('ventaPrecioUnitarioBs').value || 0) || 0;
  const cantidad = parseInt(document.getElementById('ventaCantidad').value || 0) || 0;
  const total_bs = precio_bs * cantidad;
  // calcular USD con tasa
  const tasa = Number(cachedTasa || 0);
  const precio_usd = tasa > 0 ? (precio_bs / tasa) : 0;
  const total_usd = precio_usd * cantidad;
  document.getElementById('ventaTotalDolar').value = total_usd ? `$${total_usd.toFixed(2)}` : '';
  document.getElementById('ventaTotalBs').value = total_bs ? `${total_bs.toFixed(2)}` : '';
}

async function onAgregarAlCarrito() {
  const id_producto = document.getElementById('ventaProducto').value;
  const id_talla = document.getElementById('ventaTalla').value || null;
  const cantidad = parseInt(document.getElementById('ventaCantidad').value || 0);
  // Tomamos el precio unitario en Bs desde el formulario y convertimos a USD
  const precio_unitario_bs = parseFloat(document.getElementById('ventaPrecioUnitarioBs').value || 0) || 0;
  const tasa = await getTasa().catch(()=>cachedTasa || 0);
  const precio_unitario = (tasa && tasa > 0) ? (precio_unitario_bs / tasa) : 0; // en USD
  const id_categoria_seleccionada = document.getElementById('ventaCategoria').value || null;
  if (!id_producto || !cantidad || cantidad <= 0) { alert('Selecciona producto y cantidad válida'); return; }
  
  // FORZAR CARGA DE PROMOCIONES ANTES DE AGREGAR
  if (!promocionesCache || promocionesCache.length === 0) {
    console.log('Cargando promociones antes de agregar al carrito...');
    await loadPromociones();
  }
  
  let prod = productosCache.find(p => String(p.id_producto) === String(id_producto));
  // Si el producto no tiene categoría en cache, solicitar su detalle antes de añadir
  if (prod && (prod.id_categoria === undefined || prod.id_categoria === null)) {
    await ensureProductoTieneCategoria(prod).catch(()=>{});
    // refrescar referencia
    prod = productosCache.find(p => String(p.id_producto) === String(id_producto));
  }
  // Usar la categoría seleccionada manualmente si existe, sino usar la del producto
  const categoriaFinal = id_categoria_seleccionada ? Number(id_categoria_seleccionada) : (prod ? (prod.id_categoria || null) : null);
  
  // IMPORTANTE: La talla NO afecta las promociones - cualquier talla (XS, S, M, L, XL, XXL, etc.) puede aplicar promociones
  const id_talla_final = id_talla ? Number(id_talla) : null;
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Agregando al carrito:');
  console.log(`  Producto ID: ${id_producto}`);
  console.log(`  Talla ID: ${id_talla_final || 'Sin talla'} (NO afecta promociones)`);
  console.log(`  Cantidad: ${cantidad}`);
  console.log(`  Precio unitario: $${precio_unitario.toFixed(2)}`);
  console.log(`  Categoría: ${categoriaFinal || 'Sin categoría'}`);
  console.log(`  Promociones disponibles: ${promocionesCache.length}`);
  console.log(`  ⚠️ IMPORTANTE: Las promociones aplican a CUALQUIER talla (incluyendo XXL)`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  cajaCart.push({ 
    id_producto: Number(id_producto), 
    id_talla: id_talla_final, 
    cantidad, 
    // Guardamos ambos: precio en USD (interno) y precio en Bs (para mostrar y consistencia)
    precio_unitario: Number(precio_unitario), // USD
    precio_unitario_bs: Number(precio_unitario_bs),
    nombre: prod ? (prod.nombre || prod.marca) : 'Producto', 
    id_categoria: categoriaFinal,
    idCategoria: categoriaFinal, // también enviar como idCategoria para el servidor
    no_aplicar_promocion: false, 
    force_promotion_id: null 
  });
  
  renderCart();
}

function aplicarMejorPromocion(item) {
  // Si el cajero deshabilitó promociones para este item, retornar sin descuento
  if (item.no_aplicar_promocion) {
    console.log('Promociones deshabilitadas para item:', item);
    return { descuento: 0, promo: null, detalle: null };
  }

  // Si no hay promociones en cache, retornar sin descuento
  if (!promocionesCache || promocionesCache.length === 0) {
    console.warn('No hay promociones en cache para evaluar');
    return { descuento: 0, promo: null, detalle: null };
  }
  
  console.log(`Evaluando promociones para item ${item.id_producto}. Promociones en cache: ${promocionesCache.length}`);
  // IMPORTANTE: Las promociones son INDEPENDIENTES de la talla (id_talla)
  // Una promoción aplica al producto sin importar si es XS, S, M, L, XL, XXL, etc.
  console.log(`[APLICAR PROMO] Talla del item: ${item.id_talla || 'Sin talla'} - Las promociones NO dependen de la talla`);

  const now = new Date();
  const todayStr = now.toISOString().slice(0,10);
  console.log(`[APLICAR PROMO] Fecha hoy: ${todayStr}`);
  
  // Filtrar promociones aplicables (activas y en rango de fechas)
  const pAplicables = promocionesCache.filter(p => {
    try {
      // Verificar que la promoción esté activa
      const estaActiva = p.activa === 1 || p.activa === true || p.activa === '1';
      if (!estaActiva) {
        console.log(`[FILTRO] Promoción ${p.id_promocion} ${p.nombre} no activa (activa=${p.activa}, tipo=${typeof p.activa})`);
        return false;
      }
      
      // Verificar fechas - usar formato date string para comparación
      const fechaInicioStr = p.fecha_inicio ? (p.fecha_inicio.toString().split('T')[0] || p.fecha_inicio.toString().substring(0, 10)) : null;
      const fechaFinStr = p.fecha_fin ? (p.fecha_fin.toString().split('T')[0] || p.fecha_fin.toString().substring(0, 10)) : null;
      
      if (fechaInicioStr && fechaInicioStr > todayStr) {
        console.log(`[FILTRO] Promoción ${p.id_promocion} ${p.nombre} no iniciada (${fechaInicioStr} > ${todayStr})`);
        return false;
      }
      if (fechaFinStr && fechaFinStr < todayStr) {
        console.log(`[FILTRO] Promoción ${p.id_promocion} ${p.nombre} expirada (${fechaFinStr} < ${todayStr})`);
        return false;
      }
      
      console.log(`[FILTRO] ✓ Promoción ${p.id_promocion} "${p.nombre}" APLICABLE (${fechaInicioStr || 'sin inicio'} - ${fechaFinStr || 'sin fin'})`);
      return true;
    } catch (e) { 
      console.warn(`[FILTRO] Error verificando promoción ${p.id_promocion}:`, e);
      return false; 
    }
  });

  // Si no hay promociones aplicables, retornar sin descuento
  if (pAplicables.length === 0) {
    console.log('[APLICAR PROMO] No hay promociones aplicables después de filtrar por fecha');
    console.log('[APLICAR PROMO] Promociones en cache:', promocionesCache.length);
    console.log('[APLICAR PROMO] Fecha hoy:', todayStr);
    return { descuento: 0, promo: null, detalle: null };
  }
  
  console.log(`[APLICAR PROMO] Promociones aplicables después de filtrar por fecha: ${pAplicables.length}`);

  // Obtener información del producto
  const prodInfo = productosCache.find(p => Number(p.id_producto) === Number(item.id_producto)) || {};
  
  // Obtener categoría: priorizar la del item (puede venir de selección manual), luego la del producto
  const prodCat = item.id_categoria || item.idCategoria || prodInfo.id_categoria || null;
  console.log(`Producto ${item.id_producto}, Categoría: ${prodCat}, Producto info:`, prodInfo);
  
  // Calcular subtotales
  const subtotal = item.precio_unitario * item.cantidad;
  const subtotalCarrito = cajaCart.reduce((s, it) => s + (it.precio_unitario * it.cantidad), 0);
  
  let mejor = { descuento: 0, promo: null, detalle: { subtotal } };

  // Si el cajero forzó una promoción específica
  if (item.force_promotion_id) {
    const forced = pAplicables.find(pp => Number(pp.id_promocion) === Number(item.force_promotion_id));
    if (forced) {
      // Verificar aplicabilidad por producto
      if (forced.id_producto && Number(forced.id_producto) !== Number(item.id_producto)) {
        // No aplicable por producto, continuar con evaluación normal
      }
      // Verificar aplicabilidad por categoría
      else if (forced.id_categoria) {
        const promoCat = forced.id_categoria ? Number(forced.id_categoria) : null;
        const itemCat = prodCat ? Number(prodCat) : null;
        
        if (!itemCat || !promoCat || promoCat !== itemCat) {
          // No aplicable por categoría, continuar con evaluación normal
          console.log(`  Promoción forzada no aplica: categoría promoción ${promoCat}, categoría item ${itemCat}`);
        } else {
          // Aplicable: calcular descuento forzado
          console.log(`  ✓ Aplicando promoción forzada por categoría ${promoCat}`);
          const descuentoForced = calcularDescuento(forced, subtotal, subtotalCarrito, item);
          if (descuentoForced > 0) {
            return { descuento: descuentoForced, promo: forced, detalle: { subtotal } };
          }
        }
      }
      // Promoción global (sin producto ni categoría específica)
      else {
        const descuentoForced = calcularDescuento(forced, subtotal, subtotalCarrito, item);
        if (descuentoForced > 0) {
          return { descuento: descuentoForced, promo: forced, detalle: { subtotal } };
        }
      }
    }
  }

  // Evaluar todas las promociones aplicables para encontrar la mejor
  // NOTA CRÍTICA: Las promociones NO verifican talla (id_talla). Aplican a cualquier talla del producto.
  console.log(`\n========== EVALUANDO ${pAplicables.length} PROMOCIONES APLICABLES ==========`);
  console.log(`[INFO] Talla del item evaluado: ${item.id_talla || 'Sin talla'} - NO afecta la evaluación de promociones`);
  for (const p of pAplicables) {
    console.log(`\n[PROMOCIÓN ${p.id_promocion}] ${p.nombre}`);
    console.log(`  Tipo: ${p.tipo_promocion}, Valor: ${p.valor}`);
    console.log(`  Producto ID: ${p.id_producto || 'Ninguno'}, Categoría ID: ${p.id_categoria || 'Ninguna'}`);
    console.log(`  Item - Producto ID: ${item.id_producto}, Talla: ${item.id_talla || 'Sin talla'}, Categoría: ${prodCat}`);
    console.log(`  ⚠️ IMPORTANTE: Esta promoción NO verifica talla - aplica a cualquier talla (XS, S, M, L, XL, XXL, etc.)`);
    
    // Verificar si la promoción aplica por producto
    if (p.id_producto) {
      const promoProdId = Number(p.id_producto);
      const itemProdId = Number(item.id_producto);
      if (promoProdId !== itemProdId) {
        console.log(`  ❌ NO APLICA: Producto diferente (promo: ${promoProdId}, item: ${itemProdId})`);
        continue;
      }
      console.log(`  ✓ Producto coincide`);
    }
    
    // Verificar si la promoción aplica por categoría
    if (p.id_categoria) {
      const promoCat = Number(p.id_categoria);
      const itemCat = prodCat ? Number(prodCat) : null;
      
      if (!itemCat) {
        console.log(`  ❌ NO APLICA: Item no tiene categoría`);
        continue;
      }
      if (promoCat !== itemCat) {
        console.log(`  ❌ NO APLICA: Categoría diferente (promo: ${promoCat}, item: ${itemCat})`);
        continue;
      }
      console.log(`  ✓ Categoría coincide (${promoCat})`);
    } else {
      console.log(`  ✓ Promoción global (aplica a todos)`);
    }
    
    // Verificar mínimo de compra
    const minimo = Number(p.minimo_compra || 0);
    if (minimo > 0) {
      const scope = (p.id_producto || p.id_categoria) ? subtotal : subtotalCarrito;
      if (scope < minimo) {
        console.log(`  ❌ NO APLICA: Mínimo compra ${minimo}, scope es ${scope}`);
        continue;
      }
      console.log(`  ✓ Mínimo compra cumplido (${scope} >= ${minimo})`);
    }
    
    // Calcular descuento de esta promoción
    const descuento = calcularDescuento(p, subtotal, subtotalCarrito, item);
    console.log(`  💰 DESCUENTO CALCULADO: $${descuento.toFixed(2)}`);
    
    // Si este descuento es mayor que el mejor encontrado, actualizar
    if (descuento > mejor.descuento) {
      mejor = { descuento, promo: p, detalle: { subtotal } };
      console.log(`  ✅ NUEVA MEJOR PROMOCIÓN: ${p.nombre} con descuento $${descuento.toFixed(2)}`);
    } else {
      console.log(`  - Descuento menor que el mejor actual ($${mejor.descuento.toFixed(2)})`);
    }
  }
  
  console.log(`\n========== RESULTADO FINAL ==========`);
  console.log(`Descuento: $${mejor.descuento.toFixed(2)}`);
  console.log(`Promoción: ${mejor.promo ? mejor.promo.nombre : 'NINGUNA'}`);
  console.log(`=====================================\n`);
  
  return mejor;
}

// Función auxiliar para calcular descuento según tipo de promoción
function calcularDescuento(promocion, subtotal, subtotalCarrito, item) {
  const tipo = promocion.tipo_promocion;
  let descuento = 0;
  
  console.log(`    [CALCULAR] Tipo: ${tipo}, Valor: ${promocion.valor}, Subtotal: ${subtotal.toFixed(2)}`);
  
  if (tipo === 'DESCUENTO_PORCENTAJE') {
    const porcentaje = Number(promocion.valor || 0);
    descuento = subtotal * (porcentaje / 100);
    console.log(`    → Porcentaje: ${porcentaje}% de ${subtotal.toFixed(2)} = $${descuento.toFixed(2)}`);
  }
  else if (tipo === 'DESCUENTO_FIJO') {
    const valor = Number(promocion.valor || 0);
    // Si es promoción específica de producto o categoría, aplicar por cantidad
    if (promocion.id_producto || promocion.id_categoria) {
      descuento = item.cantidad * valor;
      console.log(`    → Fijo por cantidad: ${item.cantidad} x $${valor} = $${descuento.toFixed(2)}`);
    }
    // Si es promoción global, aplicar proporcional al subtotal
    else {
      descuento = subtotalCarrito > 0 ? (subtotal / subtotalCarrito) * valor : 0;
      console.log(`    → Fijo global: (${subtotal.toFixed(2)}/${subtotalCarrito.toFixed(2)}) x $${valor} = $${descuento.toFixed(2)}`);
    }
  }
  else if (tipo === 'COMPRA_X_LLEVA_Y') {
    const x = Number(promocion.param_x || 0);
    const y = Number(promocion.param_y || 0);
    if (x > 0 && y >= 0) {
      const bloque = x + y;
      const completos = Math.floor(item.cantidad / bloque);
      const gratis = completos * y;
      descuento = gratis * item.precio_unitario;
      console.log(`    → X=Y: Bloque ${bloque}, Completos ${completos}, Gratis ${gratis}, Descuento: $${descuento.toFixed(2)}`);
    }
  }
  
  const descFinal = Math.max(0, descuento);
  console.log(`    → RESULTADO: $${descFinal.toFixed(2)}`);
  return descFinal;
}

function renderCart() {
  const cont = document.getElementById('ventaDetalle');
  if (!cont) return;
  if (cajaCart.length === 0) { cont.innerHTML = '<div class="item">Carrito vacío. Agrega productos para la venta.</div>'; return; }
  
  console.log('=== Renderizando carrito ===');
  console.log('Promociones en cache:', promocionesCache.length);
  console.log('Items en carrito:', cajaCart.length);
  
  let html = '';
  let total = 0; let totalDescuentos = 0;
  let total_bs = 0; let totalDescuentos_bs = 0;
  cajaCart.forEach((it, idx) => {
    console.log(`\n--- Evaluando item ${idx} ---`);
    const calc = aplicarMejorPromocion(it);
  const descuento = Number(calc.descuento || 0); // en USD
  const tasa = Number(cachedTasa || 0);
  const descuento_bs = descuento * (tasa || 0);
  const subtotal_usd = (it.precio_unitario * it.cantidad) || 0;
  const subtotal_bs = (it.precio_unitario_bs * it.cantidad) || 0;
  const lineaTotal_usd = subtotal_usd - descuento;
  const lineaTotal_bs = subtotal_bs - descuento_bs;
  total += lineaTotal_usd; totalDescuentos += descuento;
  total_bs += lineaTotal_bs; totalDescuentos_bs += descuento_bs;
    
  console.log(`Item ${idx}: Subtotal $${subtotal_usd.toFixed(2)} (~Bs ${subtotal_bs.toFixed(2)}), Descuento $${descuento.toFixed(2)} (~Bs ${descuento_bs.toFixed(2)}), Total línea $${lineaTotal_usd.toFixed(2)} (~Bs ${lineaTotal_bs.toFixed(2)})`);
    // Controles: checkbox para aplicar/ignorar promo y select para forzar promoción
    const promoOptions = promocionesCache.filter(p => {
      try {
        const now = new Date();
        if (p.id_producto && Number(p.id_producto) !== Number(it.id_producto)) return false;
        if (p.fecha_inicio && new Date(p.fecha_inicio) > now) return false;
        if (p.fecha_fin && new Date(p.fecha_fin) < now) return false;
        return true;
      } catch (e) { return false; }
    });
    const promoSelectHtml = promoOptions.length > 0 ? `
      <select onchange="window._caja.setForcedPromo(${idx}, this.value)">
        <option value="">Auto</option>
        ${promoOptions.map(pp => `<option value="${pp.id_promocion}" ${it.force_promotion_id && Number(it.force_promotion_id)===Number(pp.id_promocion)?'selected':''}>Forzar: ${pp.nombre}</option>`).join('')}
      </select>` : '';

    // Usar clases CSS en lugar de estilos inline para mejor rendimiento
    const itemClass = descuento > 0 ? 'item-con-descuento' : 'item-sin-descuento';
    const totalLineaClass = descuento > 0 ? 'total-linea-descuento' : 'total-linea-sin-descuento';
    
    const descuentoText = descuento > 0 
      ? `<div class="descuento-info">
          <span class="descuento-monto">✨ Descuento: -$${descuento.toFixed(2)} (~Bs ${descuento_bs.toFixed(2)}) ✨</span>
          <span class="promocion-nombre">📌 Promoción: ${calc.promo ? calc.promo.nombre : 'Promoción'}</span>
        </div>` 
      : '<div style="color:#999;font-size:0.85em;padding:4px;">Sin descuento aplicado</div>';
    
    html += `<div class="item ${itemClass}" data-idx="${idx}" data-has-discount="${descuento > 0 ? 'true' : 'false'}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <strong style="font-size:1.15em;color:#37474f;">${it.nombre || ('#'+it.id_producto)}</strong> 
        <button class="btn btn-small secondary" onclick="removeCartItem(${idx})" style="padding:6px 12px;">Eliminar</button>
      </div>
      <div style="font-size:0.95em;color:#333;margin-top:8px;">
        <div style="margin-bottom:8px;padding:8px;background:#fafafa;border-radius:4px;">
          <span style="color:#666;">Subtotal: </span>
          <strong style="font-size:1.05em;">$${subtotal_usd.toFixed(2)} (~Bs ${subtotal_bs.toFixed(2)})</strong>
        </div>
        ${descuentoText}
        ${calc.promo ? `<div style="margin-top:8px;"><button class="btn-promo-details" onclick="window._caja.showPromoDetails(${idx})">📋 Ver detalles de promoción</button></div>` : ''}
      </div>
      <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <label style="font-size:0.9em;display:flex;align-items:center;gap:6px;">
          <input type="checkbox" ${it.no_aplicar_promocion? 'checked' : ''} onchange="window._caja.toggleNoPromo(${idx}, this.checked)"> Ignorar promo
        </label>
        ${promoSelectHtml}
        <div style="margin-left:auto;font-weight:700;" class="${totalLineaClass}">
          Total línea: $${lineaTotal_usd.toFixed(2)} (~Bs ${lineaTotal_bs.toFixed(2)})
        </div>
      </div>
    </div>`;
  });
  // Footer con totales usando clases CSS
  const totalClass = totalDescuentos > 0 ? 'total-con-descuento' : '';
  html += `<div class="item ${totalClass}">
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:1.1em;">
      ${totalDescuentos > 0 ? `
      <div>
        <span style="color:#666;font-size:0.95em;">Total descuentos: </span>
        <span class="total-descuentos">-$${totalDescuentos.toFixed(2)} (~Bs ${totalDescuentos_bs.toFixed(2)})</span>
      </div>
      ` : ''}
      <div style="text-align:right;margin-left:auto;">
        <div style="margin-bottom:4px;">
          <span style="color:#666;font-size:0.95em;">Subtotal: </span>
          <span style="font-weight:600;">$${(total + totalDescuentos).toFixed(2)} (~Bs ${ (total_bs + totalDescuentos_bs).toFixed(2) })</span>
        </div>
        <div style="border-top:2px solid #4caf50;padding-top:8px;margin-top:8px;">
          <span style="color:#666;font-size:0.95em;">Total a pagar: </span>
          <span class="total-final">$${total.toFixed(2)} (~Bs ${total_bs.toFixed(2)})</span>
        </div>
      </div>
    </div>
  </div>`;
  cont.innerHTML = html;
  
  console.log(`[RENDER CART] Total: $${total.toFixed(2)}, Descuentos: $${totalDescuentos.toFixed(2)}`);
}

window.removeCartItem = function(idx) { cajaCart.splice(idx,1); renderCart(); };

async function onPagarVenta() {
  if (cajaCart.length === 0) { alert('Carrito vacío'); return; }
  // Recopilar datos cliente
  const cliente = {
    cedula: document.getElementById('ventaClienteCedula').value || null,
    nombre: document.getElementById('ventaClienteNombre').value || null,
    telefono: document.getElementById('ventaClienteTelefono').value || null,
    email: document.getElementById('ventaClienteEmail').value || null
  };
  const tipo_pago = document.getElementById('ventaTipoPago').value || 'Efectivo';
  try {
    const res = await fetch('/api/caja/venta', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ 
          items: cajaCart.map(it=>({ 
            id_producto: it.id_producto, 
            id_talla: it.id_talla, 
            cantidad: it.cantidad, 
            precio_unitario: it.precio_unitario, 
            idCategoria: it.idCategoria || it.id_categoria || null,
            id_categoria: it.id_categoria || it.idCategoria || null,
            no_aplicar_promocion: !!it.no_aplicar_promocion, 
            force_promotion_id: it.force_promotion_id 
          })), 
          cliente_nombre: cliente.nombre, 
          cliente_cedula: cliente.cedula, 
          cliente_telefono: cliente.telefono, 
          cliente_email: cliente.email, 
          tipo_pago 
        })
    });
    if (!res.ok) {
      const err = await res.json().catch(()=>({message:'Error servidor'}));
      alert('Error al procesar venta: ' + (err.message || JSON.stringify(err)));
      return;
    }
    const data = await res.json();
    if (data.ok) {
      alert('Venta registrada. ID: ' + (data.id_venta || data.id_venta || 'n/a') + '\nTotal: $' + (data.total||0).toFixed(2));
      cajaCart = [];
      renderCart();
      document.getElementById('form-venta-caja').reset();
    } else {
      alert('Error procesando venta: ' + (data.message || '')); 
    }
  } catch (e) {
    console.error('Error al pagar venta:', e);
    alert('Error de conexión al servidor');
  }
}

// Export para tests manuales
if (typeof window !== 'undefined') window._caja = {
  cajaCart,
  renderCart,
  aplicarMejorPromocion,
  toggleNoPromo: (idx, checked) => { if (cajaCart[idx]) { cajaCart[idx].no_aplicar_promocion = !!checked; renderCart(); } },
  setForcedPromo: (idx, promoId) => { if (cajaCart[idx]) { cajaCart[idx].force_promotion_id = promoId ? Number(promoId) : null; renderCart(); } },
  showPromoDetails: (idx) => {
    try {
      const item = cajaCart[idx];
      if (!item) return;
      const calc = aplicarMejorPromocion(item);
      const promo = calc && calc.promo ? calc.promo : null;
      const modal = document.getElementById('promoModal');
      const title = document.getElementById('promoModalTitle');
      const body = document.getElementById('promoModalBody');
      if (!modal || !title || !body) return;
      if (!promo) {
        title.textContent = 'Sin promoción aplicable';
        body.innerHTML = '<p>No hay promociones aplicables para esta línea.</p>';
      } else {
        title.textContent = promo.nombre || 'Promoción';
        body.innerHTML = `
          <p><strong>Tipo:</strong> ${promo.tipo_promocion}</p>
          <p><strong>Descripción:</strong> ${promo.descripcion || '-'} </p>
          <p><strong>Válida desde:</strong> ${promo.fecha_inicio} hasta ${promo.fecha_fin}</p>
          <p><strong>Condiciones:</strong> ${promo.minimo_compra ? 'Mínimo compra: ' + promo.minimo_compra : 'Ninguna'}</p>
          <p><strong>Parámetros:</strong> ${promo.param_x ? 'X=' + promo.param_x : ''} ${promo.param_y ? ' Y=' + promo.param_y : ''}</p>
          <hr>
          <p><strong>Detalle cálculo:</strong></p>
          <pre style="white-space:pre-wrap;">Subtotal línea: $${(item.precio_unitario*item.cantidad).toFixed(2)}\nDescuento estimado: $${(calc.descuento||0).toFixed(2)}</pre>
        `;
      }
      modal.style.display = 'block';
    } catch (e) { console.error('Error mostrando detalles de promo:', e); }
  }
};

// Modal close handler
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const pm = document.getElementById('promoModal');
    const pmClose = document.getElementById('promoModalClose');
    if (pmClose) pmClose.addEventListener('click', () => { if (pm) pm.style.display = 'none'; });
    // Cerrar click fuera del contenido
    if (pm) pm.addEventListener('click', (ev) => { if (ev.target === pm) pm.style.display = 'none'; });
  });
}
