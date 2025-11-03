/*
  admin-funcionalidades.js
  Funcionalidades completas para el panel de administración
  Sistema ERP Modasoft
*/

// ==================== DASHBOARD ====================
// Las funciones del dashboard ya están en admin.html

// ==================== COMPRAS ====================
let itemsCompra = [];

document.addEventListener('DOMContentLoaded', function() {
        // Cargar ventas del mes en el panel de Ventas (administrador)
        if (document.getElementById('listaVentasAdmin')) {
            cargarVentasAdmin();
            const inputBuscarVentas = document.getElementById('buscarVentaAdmin');
            if (inputBuscarVentas) {
                let t;
                inputBuscarVentas.addEventListener('input', function(e) {
                    clearTimeout(t);
                    t = setTimeout(() => {
                        cargarVentasAdmin(e.target.value.trim());
                    }, 350);
                });
            }
        }
    // Cargar productos y proveedores para compras
    if (document.getElementById('compraProveedor')) {
        cargarProveedoresCompra();
        cargarProductosCompra();
        
        document.getElementById('btnAgregarItemCompra')?.addEventListener('click', agregarItemCompra);
        document.getElementById('form-compra')?.addEventListener('submit', registrarCompra);
    }

    // Gestión de clientes
    if (document.getElementById('form-cliente')) {
        document.getElementById('form-cliente').addEventListener('submit', registrarCliente);
        cargarClientes();
    }

    // Gestión de promociones
    if (document.getElementById('form-promocion')) {
        document.getElementById('form-promocion').addEventListener('submit', crearPromocion);
        // Cargar opciones (categorías y productos) y luego la lista de promociones
        cargarOpcionesPromocionForm();
        cargarPromociones();
    }

    // Mostrar parametros X/Y cuando se selecciona COMPRA_X_LLEVA_Y
    const promoTipoEl = document.getElementById('promoTipo');
    const promoParamsEl = document.getElementById('promoParams');
    if (promoTipoEl && promoParamsEl) {
        promoTipoEl.addEventListener('change', function() {
            if (promoTipoEl.value === 'COMPRA_X_LLEVA_Y') promoParamsEl.style.display = 'block';
            else promoParamsEl.style.display = 'none';
        });
    }

    // Contabilidad
    if (document.getElementById('selectPeriodoIngresos')) {
        document.getElementById('selectPeriodoIngresos').addEventListener('change', cargarIngresos);
        cargarIngresos();
    }

    // Cuentas por pagar
    cargarCuentasPagar();

    // Control de caja
    cargarMovimientosCaja();

    // Conciliación bancaria
    if (document.getElementById('form-conciliacion')) {
        document.getElementById('form-conciliacion').addEventListener('submit', registrarConciliacion);
        cargarConciliaciones();
    }

    // Reportes
    cargarReporteUtilidad();

    // Selector de temporada para análisis de ventas (si existe en la página)
    const selTemp = document.getElementById('selectTemporada');
    if (selTemp) {
        selTemp.addEventListener('change', function() {
            fetchVentasTemporada(selTemp.value);
        });
        // Cargar inicialmente según la opción seleccionada
        fetchVentasTemporada(selTemp.value || 'actual');
    }
});

// ==================== FUNCIONES DE COMPRAS ====================
async function cargarProveedoresCompra() {
    try {
        const res = await fetch('/api/proveedores');
        const data = await res.json();
        const select = document.getElementById('compraProveedor');
        if (select && data.proveedores) {
            select.innerHTML = '<option value="">Selecciona Proveedor</option>';
            data.proveedores.forEach(prov => {
                const opt = document.createElement('option');
                opt.value = prov.id_proveedor;
                opt.textContent = prov.nombre;
                select.appendChild(opt);
            });
        }
    } catch (error) {
        console.error('Error cargando proveedores:', error);
    }
}

async function cargarProductosCompra() {
    try {
        const [res, cRes] = await Promise.all([fetch('/api/admin/productos'), fetch('/api/categorias')]);
        const data = await res.json();
        const cData = await cRes.json();
        const cats = (cData && cData.categorias) ? cData.categorias : [];
        const catMap = {};
        cats.forEach(c => { catMap[c.id_categoria] = c.nombre; });
        const select = document.getElementById('compraProducto');
        if (select && data.productos) {
            select.innerHTML = '<option value="">Selecciona Producto</option>';
            data.productos.forEach(prod => {
                const opt = document.createElement('option');
                opt.value = prod.id_producto;
                const catName = prod.id_categoria ? (catMap[prod.id_categoria] || '') : '';
                opt.textContent = `${prod.marca || ''} - ${prod.nombre}${catName ? ' | ' + catName : ''}`;
                select.appendChild(opt);
            });
        }
    } catch (error) {
        console.error('Error cargando productos:', error);
    }
}

function agregarItemCompra() {
    const idProducto = document.getElementById('compraProducto').value;
    const idTalla = document.getElementById('compraTalla') ? document.getElementById('compraTalla').value : '';
    const cantidad = parseInt(document.getElementById('compraCantidad').value);
    const costo = parseFloat(document.getElementById('compraCosto').value);

    // Solo validar producto, cantidad y costo (talla es opcional)
    if (!idProducto || !cantidad || !costo) {
        alert('Completa todos los campos obligatorios (producto, cantidad y costo)');
        return;
    }

    itemsCompra.push({ idProducto, idTalla: idTalla || null, cantidad, costo });
    renderItemsCompra();
    calcularTotalCompra();
    // Limpiar campos
    document.getElementById('compraCantidad').value = '';
    document.getElementById('compraCosto').value = '';
}

function renderItemsCompra() {
    const contenedor = document.getElementById('compraItems');
    if (!contenedor) return;
    if (itemsCompra.length === 0) {
        contenedor.innerHTML = '<div class="item">Agrega productos a la compra</div>';
        return;
    }
    contenedor.innerHTML = itemsCompra.map((item, idx) => {
        const tallaTxt = item.idTalla && item.idTalla !== 'null' && item.idTalla !== '' ? `- Talla ${item.idTalla}` : '';
        return `
        <div class="item">
            <span>Producto ${item.idProducto} ${tallaTxt} - ${item.cantidad} unidades - $${item.costo.toFixed(2)} c/u</span>
            <button class="btn btn-small secondary" onclick="eliminarItemCompra(${idx})">Eliminar</button>
        </div>
        `;
    }).join('');
}

window.eliminarItemCompra = function(index) {
    itemsCompra.splice(index, 1);
    renderItemsCompra();
    calcularTotalCompra();
};

function calcularTotalCompra() {
    const total = itemsCompra.reduce((sum, item) => sum + (item.cantidad * item.costo), 0);
    document.getElementById('compraTotal').textContent = total.toFixed(2);
}

async function registrarCompra(e) {
    e.preventDefault();
    if (itemsCompra.length === 0) {
        alert('Agrega al menos un producto a la compra');
        return;
    }

    try {
        const proveedor = document.getElementById('compraProveedor').value;
        const fecha = document.getElementById('compraFecha').value;
        const estadoPago = document.getElementById('compraEstadoPago').value;
        const total = parseFloat(document.getElementById('compraTotal').textContent);

        const res = await fetch('/api/compras', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_proveedor: proveedor,
                fecha_compra: fecha,
                estado_pago: estadoPago,
                total_compra: total,
                items: itemsCompra
            })
        });

        const data = await res.json();
        if (data.ok) {
            alert('Compra registrada correctamente');
            itemsCompra = [];
            renderItemsCompra();
            calcularTotalCompra();
            e.target.reset();
            cargarCompras();
        } else {
            alert('Error al registrar compra: ' + (data.error || ''));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error de conexión');
    }
}

async function cargarCompras() {
    try {
        const res = await fetch('/api/compras');
        const data = await res.json();
        const lista = document.getElementById('listaCompras');
        if (lista && data.compras) {
            if (data.compras.length === 0) {
                lista.innerHTML = '<div class="item">No hay compras registradas</div>';
                return;
            }
            lista.innerHTML = data.compras.map(compra => {
                const detallesHtml = compra.detalles && compra.detalles.length > 0 
                    ? compra.detalles.map(d => 
                        `<div style="margin-left:20px;font-size:0.9em;color:#666;">
                            - ${d.marca || ''} ${d.nombre_producto || 'Producto #' + d.id_producto} 
                            (${d.cantidad} unidades x $${parseFloat(d.costo_unitario).toFixed(2)}) 
                            = $${(d.cantidad * parseFloat(d.costo_unitario)).toFixed(2)}
                        </div>`
                      ).join('')
                    : '<div style="margin-left:20px;font-size:0.9em;color:#999;">Sin detalles</div>';
                
                return `
                <div class="item">
                    <div>
                        <strong>Compra #${compra.id_compra}</strong><br>
                        Proveedor: ${compra.nombre_proveedor || 'N/A'}<br>
                        Fecha: ${compra.fecha_compra || 'N/A'} | Total: $${parseFloat(compra.total_compra || 0).toFixed(2)} | Estado: ${compra.estado_pago || 'N/A'}
                        ${detallesHtml}
                    </div>
                </div>
            `;
            }).join('');
        }
    } catch (error) {
        console.error('Error cargando compras:', error);
        const lista = document.getElementById('listaCompras');
        if (lista) {
            lista.innerHTML = '<div class="item">Error al cargar compras</div>';
        }
    }
}

// ==================== FUNCIONES DE CLIENTES ====================
async function registrarCliente(e) {
    e.preventDefault();
    try {
        const res = await fetch('/api/clientes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre: document.getElementById('clienteNombre').value,
                cedula: document.getElementById('clienteCedula').value,
                telefono: document.getElementById('clienteTelefono').value,
                email: document.getElementById('clienteEmail').value
            })
        });

        const data = await res.json();
        if (data.ok) {
            alert('Cliente registrado correctamente');
            e.target.reset();
            cargarClientes();
        } else {
            alert('Error: ' + (data.error || ''));
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

async function cargarClientes() {
    try {
        // Usar endpoint optimizado que devuelve clientes con resumen (evita N requests por cliente)
        const page = 1;
        const per_page = 200;
        const res = await fetch(`/api/admin/clientes/resumen?page=${page}&per_page=${per_page}`, { credentials: 'include' });
        const data = await res.json();
        const lista = document.getElementById('listaClientesAdmin');
        if (!lista) return;

        if (!data || !data.clientes || data.clientes.length === 0) {
            lista.innerHTML = '<div class="item">No se encontraron clientes con compras registradas.</div>';
            return;
        }

        // Umbral para considerar "frecuente" (ajustable)
        const UMBRAL_FRECUENTE = 3;

        lista.innerHTML = data.clientes.map(cli => {
            const frecuente = (Number(cli.compras_count) >= UMBRAL_FRECUENTE) ? ' (Frecuente)' : '';
            return `
                <div class="item">
                    <div>
                        <strong>${cli.nombre || 'Sin nombre'}${frecuente}</strong><br>
                        Cédula: ${cli.cedula || 'N/A'} | Tel: ${cli.telefono || 'N/A'} | Email: ${cli.email || 'N/A'}<br>
                        <small>Compras: ${cli.compras_count} | Total: $${Number(cli.total_gastado||0).toFixed(2)}</small>
                    </div>
                    <div class="actions">
                        <button class="btn btn-small" onclick="editarCliente(${cli.id_cliente})">Editar</button>
                        <button class="btn btn-small secondary" onclick="verHistorialCliente(${cli.id_cliente}, '${(cli.nombre||'').replace(/'/g, "\\'")}', '${cli.cedula || ''}')">Ver historial</button>
                    </div>
                </div>
            `;
        }).join('');

        // Modal simple para historial de compras de cliente (si no existe, crearlo)
        if (!document.getElementById('modalHistorialCliente')) {
            const modal = document.createElement('div');
            modal.id = 'modalHistorialCliente';
            modal.style = 'display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);z-index:9999;align-items:center;justify-content:center;';
            modal.innerHTML = `<div style="background:#fff;padding:24px;max-width:500px;width:90vw;border-radius:8px;box-shadow:0 2px 16px #0002;position:relative;">
                <button id="cerrarModalHistorialCliente" style="position:absolute;top:8px;right:8px;font-size:1.2em;">&times;</button>
                <div id="contenidoHistorialCliente">Cargando...</div>
            </div>`;
            document.body.appendChild(modal);
            document.getElementById('cerrarModalHistorialCliente').onclick = () => { modal.style.display = 'none'; };
        }

    } catch (error) {
        console.error('Error cargando clientes:', error);
    }
}

// Función para abrir modal y mostrar historial (usa endpoint existente)
window.verHistorialCliente = async function(id_cliente, nombre, cedula) {
    const modal = document.getElementById('modalHistorialCliente');
    const contenido = document.getElementById('contenidoHistorialCliente');
    if (!modal || !contenido) return;
    modal.style.display = 'flex';
    contenido.innerHTML = `<b>${nombre}</b><br>Cédula: ${cedula}<br><br>Cargando historial...`;
    try {
        const res = await fetch(`/api/admin/clientes/ventas?cedula=${encodeURIComponent(cedula)}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.ok || !data.ventas || data.ventas.length === 0) {
            contenido.innerHTML = `<b>${nombre}</b><br>Cédula: ${cedula}<br><br>No hay compras registradas para este cliente.`;
            return;
        }
        const total = data.total || data.ventas.reduce((sum, v) => sum + (parseFloat(v.total_venta)||0), 0);
        const frecuencia = data.count || data.ventas.length;
        const detalle = data.ventas.map(v => `<li>Venta #${v.id_venta} - ${v.fecha_hora} - $${parseFloat(v.total_venta||0).toFixed(2)}</li>`).join('');
        contenido.innerHTML = `<b>${nombre}</b><br>Cédula: ${cedula}<br><br>
            <b>Compras registradas:</b> ${frecuencia}<br>
            <b>Monto total:</b> $${Number(total).toFixed(2)}<br><br>
            <b>Historial:</b><ul style='margin:8px 0 0 16px;padding:0;'>${detalle}</ul>`;
    } catch (e) {
        console.error('Error al cargar historial cliente:', e);
        contenido.innerHTML = `<b>${nombre}</b><br>Cédula: ${cedula}<br><br>Error al cargar historial.`;
    }
};

// ==================== FUNCIONES DE PROMOCIONES ====================
async function crearPromocion(e) {
    e.preventDefault();
    try {
        // Support for editing existing promotion
        // Obtener valores de los campos
        const promoAplicarA = document.getElementById('promoAplicarA').value;
        const promoProducto = document.getElementById('promoProducto') ? document.getElementById('promoProducto').value : '';
        
        const payload = {
            nombre: document.getElementById('promoNombre').value,
            tipo_promocion: document.getElementById('promoTipo').value,
            valor: parseFloat(document.getElementById('promoValor').value) || 0,
            fecha_inicio: document.getElementById('promoFechaInicio').value,
            fecha_fin: document.getElementById('promoFechaFin').value,
            // Preservar la categoría seleccionada: convertir string vacío a null, pero mantener el valor numérico
            id_categoria: promoAplicarA && promoAplicarA !== '' ? Number(promoAplicarA) : null,
            // Preservar el producto seleccionado
            id_producto: promoProducto && promoProducto !== '' ? Number(promoProducto) : null,
            minimo_compra: parseFloat(document.getElementById('promoMinimoCompra').value) || 0,
            param_x: document.getElementById('promoParamX') ? parseInt(document.getElementById('promoParamX').value) || null : null,
            param_y: document.getElementById('promoParamY') ? parseInt(document.getElementById('promoParamY').value) || null : null,
            descripcion: document.getElementById('promoDescripcion') ? document.getElementById('promoDescripcion').value : null,
            activa: document.getElementById('promoActiva') ? !!document.getElementById('promoActiva').checked : true
        };
        
        // Debug: verificar que la categoría se está guardando correctamente
        console.log('Guardando promoción con categoría:', payload.id_categoria, 'Categoría seleccionada:', promoAplicarA);

        // If editing, use PUT to update
        if (window.__editingPromoId) {
            const res = await fetch(`/api/promociones/${window.__editingPromoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.ok) {
                alert('Promoción actualizada correctamente');
                window.__editingPromoId = null;
                document.getElementById('form-promocion').reset();
                document.getElementById('promoSubmitBtn') && (document.getElementById('promoSubmitBtn').textContent = 'Crear');
                cargarPromociones();
            } else {
                alert('Error al actualizar: ' + (data.message || data.error || ''));
            }
        } else {
            const res = await fetch('/api/promociones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.ok) {
                alert('Promoción creada correctamente');
                e.target.reset();
                cargarPromociones();
            } else {
                alert('Error: ' + (data.error || data.message || ''));
            }
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

// Helper: cargar opciones del formulario (categorías y productos)
let __categoriasCache = [];
let __productosCache = [];
async function cargarOpcionesPromocionForm() {
    try {
        const [cRes, pRes] = await Promise.all([fetch('/api/categorias'), fetch('/api/admin/productos')]);
        const cats = await cRes.json();
        const prods = await pRes.json();
        const selCat = document.getElementById('promoAplicarA');
        const selProd = document.getElementById('promoProducto');
        __categoriasCache = (cats && cats.categorias) ? cats.categorias : [];
        __productosCache = (prods && prods.productos) ? prods.productos : [];

        if (selCat) {
            selCat.innerHTML = '<option value="">Todas las categorías</option>' + __categoriasCache.map(c => `<option value="${c.id_categoria}">${c.nombre}</option>`).join('');
        }
        if (selProd) {
            selProd.innerHTML = '<option value="">Selecciona producto (opcional)</option>' + __productosCache.map(p => `<option value="${p.id_producto}">${(p.marca? p.marca + ' - ' : '') + p.nombre}</option>`).join('');
        }
    } catch (e) {
        console.error('Error cargando opciones promocion form:', e);
    }
}

async function cargarPromociones() {
    try {
        // Asegurar que los caches estén cargados antes de mostrar las promociones
        if (__categoriasCache.length === 0 || __productosCache.length === 0) {
            await cargarOpcionesPromocionForm();
        }
        
        const res = await fetch('/api/promociones');
        const data = await res.json();
        const lista = document.getElementById('listaPromociones');
        if (lista && data.promociones) {
            // Mostrar nombre de categoría/producto y estado "activo" calculado por fecha
            const today = new Date().toISOString().slice(0,10);
            lista.innerHTML = data.promociones.map(promo => {
                // Buscar categoría: usar comparación numérica más robusta
                const promoCatId = promo.id_categoria ? Number(promo.id_categoria) : null;
                const cat = promoCatId ? __categoriasCache.find(c => Number(c.id_categoria) === promoCatId) : null;
                
                // Buscar producto: usar comparación numérica más robusta
                const promoProdId = promo.id_producto ? Number(promo.id_producto) : null;
                const prod = promoProdId ? __productosCache.find(pp => Number(pp.id_producto) === promoProdId) : null;
                
                const dentroPeriodo = (promo.fecha_inicio && promo.fecha_fin && promo.fecha_inicio <= today && promo.fecha_fin >= today);
                const estaActivo = promo.activa && dentroPeriodo;
                
                // Determinar texto "Aplicar a"
                let aplicarAText = '';
                if (prod) {
                    aplicarAText = `Producto: ${prod.nombre}`;
                } else if (cat) {
                    aplicarAText = `Categoría: ${cat.nombre}`;
                } else {
                    aplicarAText = 'Todas las categorías';
                }
                
                return `
                <div class="item">
                    <div>
                        <strong>${promo.nombre}</strong><br>
                        Tipo: ${promo.tipo_promocion} | Valor: ${promo.valor} | 
                        ${promo.fecha_inicio} - ${promo.fecha_fin} | 
                        ${estaActivo ? 'Activo' : 'Inactivo'}
                        <div style="font-size:0.9em;color:var(--text-muted);">Aplicar a: ${aplicarAText}</div>
                    </div>
                    <div class="actions">
                        <button class="btn btn-small" onclick="editarPromocion(${promo.id_promocion})">Editar</button>
                        <button class="btn btn-small secondary" onclick="desactivarPromocion(${promo.id_promocion})">${promo.activa ? 'Desactivar' : 'Activar'}</button>
                        <button class="btn btn-small danger" onclick="eliminarPromocion(${promo.id_promocion})">Eliminar</button>
                    </div>
                </div>
            `}).join('');
        }
    } catch (error) {
        console.error('Error cargando promociones:', error);
    }
}

// Editar: poblar formulario con los datos de la promoción
window.editarPromocion = async function(id) {
    try {
        const res = await fetch('/api/promociones');
        const data = await res.json();
        const promo = (data.promociones || []).find(p => Number(p.id_promocion) === Number(id));
        if (!promo) return alert('Promoción no encontrada');
        // Poblar formulario
        document.getElementById('promoNombre').value = promo.nombre || '';
        document.getElementById('promoTipo').value = promo.tipo_promocion || '';
        document.getElementById('promoValor').value = promo.valor || '';
        document.getElementById('promoFechaInicio').value = promo.fecha_inicio || '';
        document.getElementById('promoFechaFin').value = promo.fecha_fin || '';
        // Preservar exactamente la categoría de la promoción (puede ser null o un número)
        const categoriaValue = promo.id_categoria ? String(promo.id_categoria) : '';
        document.getElementById('promoAplicarA').value = categoriaValue;
        
        // Preservar exactamente el producto de la promoción
        const productoValue = promo.id_producto ? String(promo.id_producto) : '';
        if (document.getElementById('promoProducto')) {
            document.getElementById('promoProducto').value = productoValue;
        }
        document.getElementById('promoMinimoCompra').value = promo.minimo_compra || '';
        if (document.getElementById('promoParamX')) document.getElementById('promoParamX').value = promo.param_x || '';
        if (document.getElementById('promoParamY')) document.getElementById('promoParamY').value = promo.param_y || '';
        if (document.getElementById('promoDescripcion')) document.getElementById('promoDescripcion').value = promo.descripcion || '';
        if (document.getElementById('promoActiva')) document.getElementById('promoActiva').checked = !!promo.activa;
        window.__editingPromoId = promo.id_promocion;
        document.getElementById('promoSubmitBtn') && (document.getElementById('promoSubmitBtn').textContent = 'Actualizar');
        // Scroll al formulario
        document.getElementById('promoNombre').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
        console.error('Error editarPromocion:', e);
        alert('Error al cargar promoción para editar');
    }
}

window.desactivarPromocion = async function(id) {
    try {
        // Obtener la promoción actual para conocer su estado y datos
        const res = await fetch('/api/promociones');
        const data = await res.json();
        const promo = (data.promociones || []).find(p => Number(p.id_promocion) === Number(id));
        if (!promo) return alert('Promoción no encontrada');
        const payload = Object.assign({}, promo, { activa: promo.activa ? 0 : 1 });
        // Normalizar payload: server espera campos específicos
        const update = {
            nombre: payload.nombre, descripcion: payload.descripcion, tipo_promocion: payload.tipo_promocion,
            valor: payload.valor, fecha_inicio: payload.fecha_inicio, fecha_fin: payload.fecha_fin,
            activa: payload.activa, id_categoria: payload.id_categoria || null, id_producto: payload.id_producto || null,
            minimo_compra: payload.minimo_compra || 0, param_x: payload.param_x || null, param_y: payload.param_y || null
        };
        const put = await fetch(`/api/promociones/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
        const r = await put.json();
        if (r.ok) cargarPromociones(); else alert('No se pudo cambiar estado');
    } catch (e) { console.error('Error activar/desactivar promo:', e); alert('Error al cambiar estado'); }
}

window.eliminarPromocion = async function(id) {
    if (!confirm('¿Eliminar esta promoción? Esta acción es irreversible.')) return;
    try {
        const res = await fetch(`/api/promociones/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.ok) cargarPromociones(); else alert('No se pudo eliminar: ' + (data.message || ''));
    } catch (e) { console.error('Error eliminar promocion:', e); alert('Error al eliminar'); }
}

// ==================== FUNCIONES DE CONTABILIDAD ====================
async function cargarIngresos() {
    const periodo = document.getElementById('selectPeriodoIngresos')?.value || 'mes';
    try {
        const res = await fetch(`/api/contabilidad/ingresos?periodo=${periodo}`);
        const data = await res.json();
        const tbody = document.getElementById('tbodyIngresos');
        if (tbody && data.ingresos) {
            tbody.innerHTML = data.ingresos.map(ing => `
                <tr>
                    <td style="padding:var(--spacing-md);">${ing.fecha_hora}</td>
                    <td style="padding:var(--spacing-md);text-align:right;">$${parseFloat(ing.total_venta).toFixed(2)}</td>
                    <td style="padding:var(--spacing-md);">${ing.tipo_pago}</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error cargando ingresos:', error);
    }
}

// ==================== FUNCIONES DE VENTAS (ADMIN) ====================
async function cargarVentasAdmin(busqueda = '') {
    try {
        // Por ahora tomamos mes/año actuales; se pueden exponer filtros en UI
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const res = await fetch(`/api/admin/ventas?year=${year}&month=${month}`);
        const data = await res.json();
        const lista = document.getElementById('listaVentasAdmin');
        if (!lista) return;

        if (!data.ok) {
            lista.innerHTML = `<div class="item">Error cargando ventas: ${data.message || 'error'}</div>`;
            return;
        }

        let ventas = data.ventas || [];
        if (busqueda) {
            const b = busqueda.toLowerCase();
            ventas = ventas.filter(v => (v.cliente || '').toLowerCase().includes(b) || (v.usuario || '').toLowerCase().includes(b) || String(v.id_venta).includes(b));
        }

        if (ventas.length === 0) {
            lista.innerHTML = '<div class="item">No hay ventas para el mes seleccionado.</div>';
            return;
        }

        lista.innerHTML = ventas.map(v => `
            <div class="item" data-id="${v.id_venta}">
                <div>
                    <strong>Venta #${v.id_venta}</strong> — ${v.cliente || 'Cliente Anónimo'}<br>
                    Fecha: ${v.fecha_hora} | Total: $${parseFloat(v.total_venta || 0).toFixed(2)} | Pago: ${v.tipo_pago} | Usuario: ${v.usuario || 'N/A'}
                    <div style="margin-top:8px;font-size:0.9em;color:var(--text-muted);">${(v.detalle || []).map(d => `${d.marca || ''} ${d.producto || ''} (${d.talla || ''}) x${d.cantidad} @ $${parseFloat(d.precio_unitario||0).toFixed(2)}`).join(' · ')}</div>
                </div>
                <div class="actions">
                    <button class="btn btn-small" onclick="verDetalleVenta(${v.id_venta})">Ver</button>
                    <button class="btn btn-small danger" onclick="eliminarVentaAdmin(${v.id_venta})">Eliminar</button>
                </div>
            </div>
        `).join('');

        // Mostrar totales resumidos (si existe contenedor en dashboard)
        if (document.getElementById('ventasMes')) {
            document.getElementById('ventasMes').textContent = '$' + (data.totales && data.totales.total_mes ? parseFloat(data.totales.total_mes).toFixed(2) : '0.00');
        }

    } catch (error) {
        console.error('Error cargando ventas admin:', error);
        const lista = document.getElementById('listaVentasAdmin');
        if (lista) lista.innerHTML = '<div class="item">Error de conexión al cargar ventas</div>';
    }
}

window.verDetalleVenta = function(id) {
    // Simple scroll a la venta o abrir modal: por ahora mostramos alerta con detalles
    alert('Ver detalles venta #' + id + ' (implementar modal si se desea)');
};

// Eliminar venta desde UI (admin)
window.eliminarVentaAdmin = async function(id) {
    if (!confirm('¿Seguro que deseas eliminar la venta #' + id + '? Esto revertirá el stock y no se podrá deshacer.')) return;
    try {
        const res = await fetch(`/api/admin/ventas/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Error al eliminar la venta');
        }

        const data = await res.json();
        if (data.ok) {
            alert('✅ Venta eliminada y stock revertido');
            cargarVentasAdmin();
        } else {
            throw new Error(data.message || 'No se pudo eliminar la venta');
        }
    } catch (e) {
        console.error('Error eliminar venta:', e);
        alert('❌ ' + (e.message || 'Error al eliminar la venta'));
    }
};


// ==================== FUNCIONES DE CUENTAS POR PAGAR ====================
async function cargarCuentasPagar() {
    try {
        const res = await fetch('/api/cuentas-pagar');
        const data = await res.json();
        const lista = document.getElementById('listaCuentasPagar');
        if (lista && data.cuentas) {
            lista.innerHTML = data.cuentas.map(cuenta => `
                <div class="item">
                    <div>
                        <strong>Cuenta #${cuenta.id_cuenta}</strong><br>
                        Proveedor: ${cuenta.nombre_proveedor} | 
                        Monto: $${cuenta.monto_total} | 
                        Pendiente: $${cuenta.monto_pendiente} | 
                        Vencimiento: ${cuenta.fecha_vencimiento} | 
                        Estado: ${cuenta.estado}
                    </div>
                    <div class="actions">
                        <button class="btn btn-small" onclick="registrarPago(${cuenta.id_cuenta})">Registrar Pago</button>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error cargando cuentas por pagar:', error);
    }
}

// ==================== FUNCIONES DE CONTROL DE CAJA ====================
async function cargarMovimientosCaja() {
    try {
        const res = await fetch('/api/movimientos-caja');
        const data = await res.json();
        const lista = document.getElementById('listaMovimientosCaja');
        if (lista && data.movimientos) {
            lista.innerHTML = data.movimientos.map(mov => `
                <div class="item">
                    <div>
                        <strong>${mov.tipo_movimiento}</strong><br>
                        Fecha: ${mov.fecha_hora} | Monto: $${mov.monto} | 
                        ${mov.descripcion || ''}
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error cargando movimientos:', error);
    }
}

// ==================== FUNCIONES DE CONCILIACIÓN ====================
async function registrarConciliacion(e) {
    e.preventDefault();
    try {
        const res = await fetch('/api/conciliacion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fecha_conciliacion: document.getElementById('conciliacionFecha').value,
                saldo_libro: parseFloat(document.getElementById('conciliacionSaldoLibro').value),
                saldo_banco: parseFloat(document.getElementById('conciliacionSaldoBanco').value)
            })
        });

        const data = await res.json();
        if (data.ok) {
            alert('Conciliación registrada correctamente');
            e.target.reset();
            cargarConciliaciones();
        } else {
            alert('Error: ' + (data.error || ''));
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

async function cargarConciliaciones() {
    try {
        const res = await fetch('/api/conciliacion');
        const data = await res.json();
        const lista = document.getElementById('listaConciliaciones');
        if (lista && data.conciliaciones) {
            lista.innerHTML = data.conciliaciones.map(conc => `
                <div class="item">
                    <div>
                        <strong>Conciliación ${conc.fecha_conciliacion}</strong><br>
                        Saldo Libro: $${conc.saldo_libro} | Saldo Banco: $${conc.saldo_banco} | 
                        Diferencia: $${conc.diferencia} | Estado: ${conc.estado}
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error cargando conciliaciones:', error);
    }
}

// ==================== FUNCIONES DE REPORTES ====================
async function cargarReporteUtilidad() {
    try {
        const res = await fetch('/api/reportes/utilidad-productos');
        const data = await res.json();
        const tbody = document.getElementById('tbodyReporteUtilidad');
        if (tbody && data.utilidad) {
            tbody.innerHTML = data.utilidad.map(prod => `
                <tr>
                    <td style="padding:var(--spacing-md);">${prod.nombre}</td>
                    <td style="padding:var(--spacing-md);text-align:right;">$${parseFloat(prod.costo_promedio || 0).toFixed(2)}</td>
                    <td style="padding:var(--spacing-md);text-align:right;">$${parseFloat(prod.precio_venta || 0).toFixed(2)}</td>
                    <td style="padding:var(--spacing-md);text-align:right;">$${parseFloat(prod.utilidad_unitaria || 0).toFixed(2)}</td>
                    <td style="padding:var(--spacing-md);text-align:right;">${prod.unidades_vendidas || 0}</td>
                    <td style="padding:var(--spacing-md);text-align:right;">$${parseFloat(prod.utilidad_total || 0).toFixed(2)}</td>
                    <td style="padding:var(--spacing-md);text-align:right;">${parseFloat(prod.margen_ganancia || 0).toFixed(1)}%</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error cargando reporte:', error);
    }
}

// ------------------ Análisis de Ventas por Temporada (frontend helper) ------------------
async function fetchVentasTemporada(periodo = 'actual') {
    try {
        const res = await fetch(`/api/reportes/ventas-temporada?periodo=${encodeURIComponent(periodo)}`);
        const data = await res.json();
        if (!data) return;

        // data.rows contiene objetos con ingreso_total (según la vista)
        // Para compatibilidad con cargarGraficoVentas (que espera {ingreso_total}), pasamos rows directamente
        if (data.rows && Array.isArray(data.rows)) {
            // Si la vista devuelve por mes, usamos ingreso_total; si son agrupaciones, también deberían tener ingreso_total
            cargarGraficoVentas(data.rows.map(r => ({ ingreso_total: Number(r.ingreso_total || 0), label: r.periodo || (r.anio && r.mes ? `${r.anio}-${String(r.mes).padStart(2,'0')}` : '') })));
        }
    } catch (e) {
        console.error('Error obteniendo ventas por temporada:', e);
    }
}

// ------------------ Rotación de Inventario (frontend helper) ------------------
async function fetchRotacionInventario(top = 50) {
    try {
        const res = await fetch(`/api/reportes/rotacion-inventario?top=${top}`);
        const data = await res.json();
        if (data && data.rows) {
            // Puedes mostrar estos datos en una tabla o usar otra función para renderizarlos
            console.log('Rotación inventario top', top, data.rows);
            // Ejemplo: actualizar un contenedor si existe
            const cont = document.getElementById('rotacionTabla');
            if (cont) {
                cont.innerHTML = data.rows.map(r => `
                    <div class="item">
                      <div><strong>${r.nombre}</strong> — ${r.categoria || ''}</div>
                      <div>Stock: ${r.stock_actual} | Vendidas (últ. mes): ${r.unidades_vendidas_ultimo_mes} | Índice: ${parseFloat(r.indice_rotacion||0).toFixed(2)}</div>
                    </div>
                `).join('');
            }
        }
    } catch (e) {
        console.error('Error al obtener rotación de inventario:', e);
    }
}

function exportarReporteUtilidad() {
    // Implementar exportación a Excel/CSV
    alert('Funcionalidad de exportación pendiente');
}

