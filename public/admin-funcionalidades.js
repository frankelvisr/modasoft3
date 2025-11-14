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
        
        // Cargar lista de compras del mes en el panel de Compras (administrador)
        if (document.getElementById('listaCompras')) {
            cargarCompras();
            const inputBuscarCompras = document.getElementById('buscarCompraAdmin');
            if (inputBuscarCompras) {
                let t;
                inputBuscarCompras.addEventListener('input', function(e) {
                    clearTimeout(t);
                    t = setTimeout(() => {
                        cargarCompras(e.target.value.trim());
                    }, 350);
                });
            }
        }
        
    // Cargar productos y proveedores para compras
    if (document.getElementById('compraProveedor')) {
        cargarProveedoresCompra();
        cargarProductosCompra();
        
        // Cargar tallas cuando se seleccione un producto
        const compraProductoSelect = document.getElementById('compraProducto');
        if (compraProductoSelect) {
            compraProductoSelect.addEventListener('change', cargarTallasProductoCompra);
        }
        
        document.getElementById('btnAgregarItemCompra')?.addEventListener('click', agregarItemCompra);
        document.getElementById('form-compra')?.addEventListener('submit', registrarCompra);
    }

    // Gestión de clientes
    if (document.getElementById('form-cliente')) {
        document.getElementById('form-cliente').addEventListener('submit', registrarCliente);
        cargarClientesForm();
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

                        // Ajustar placeholder/label del campo valor según tipo de promoción
                        const valorEl = document.getElementById('promoValor');
                        if (valorEl) {
                            if (promoTipoEl.value === 'DESCUENTO_PORCENTAJE') {
                                valorEl.placeholder = 'Ej: 10 (representa 10%)';
                            } else if (promoTipoEl.value === 'DESCUENTO_FIJO') {
                                valorEl.placeholder = 'Ej: 5.50 (monto en $)';
                            } else {
                                valorEl.placeholder = '';
                            }
                        }
                });
                // Inicializar placeholder según el valor actual del select
                (function(){ const ev = new Event('change'); promoTipoEl.dispatchEvent(ev); })();
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

    // Si el panel de reportes existe en la página, inicializar el sistema de reportes
    if (document.getElementById('reportesPanel')) {
        try {
            if (typeof prepararReportes === 'function') prepararReportes();
        } catch (e) {
            console.error('Error al inicializar prepararReportes():', e);
        }
    }

    // Botones de nuevos reportes
    const btnInv = document.getElementById('btnReporteInventario');
    if (btnInv) btnInv.addEventListener('click', renderReporteInventario);
    const btnCompras = document.getElementById('btnReporteCompras');
    if (btnCompras) btnCompras.addEventListener('click', renderReporteCompras);

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

async function cargarTallasProductoCompra() {
    const idProducto = document.getElementById('compraProducto').value;
    const selectTalla = document.getElementById('compraTalla');
    
    if (!selectTalla) return;
    
    if (!idProducto) {
        selectTalla.innerHTML = '<option value="">Selecciona Talla</option>';
        return;
    }
    
    try {
        // Cargar todas las tallas disponibles y las tallas del producto en paralelo
        const [resTallas, resProducto] = await Promise.all([
            fetch('/api/tallas'),
            fetch(`/api/admin/productos/${idProducto}`)
        ]);
        
        const dataTallas = await resTallas.json();
        const dataProducto = await resProducto.json();
        
        // Crear un mapa de tallas del producto con su stock
        const tallasProductoMap = {};
        if (dataProducto.producto && dataProducto.producto.tallas) {
            dataProducto.producto.tallas.forEach(talla => {
                tallasProductoMap[talla.id_talla] = talla.cantidad;
            });
        }
        
        // Mostrar TODAS las tallas disponibles
        if (dataTallas.tallas && dataTallas.tallas.length > 0) {
            selectTalla.innerHTML = '<option value="">Selecciona Talla</option>';
            dataTallas.tallas.forEach(talla => {
                const opt = document.createElement('option');
                opt.value = talla.id_talla;
                // Si el producto tiene esta talla, mostrar stock; si no, indicar que es nueva
                if (tallasProductoMap.hasOwnProperty(talla.id_talla)) {
                    opt.textContent = `${talla.nombre} (Stock: ${tallasProductoMap[talla.id_talla]})`;
                } else {
                    opt.textContent = `${talla.nombre} (Nueva - se creará en inventario)`;
                }
                selectTalla.appendChild(opt);
            });
        } else {
            selectTalla.innerHTML = '<option value="">No hay tallas disponibles</option>';
        }
    } catch (error) {
        console.error('Error cargando tallas:', error);
        selectTalla.innerHTML = '<option value="">Error al cargar tallas</option>';
    }
}

function agregarItemCompra() {
    const idProducto = document.getElementById('compraProducto').value;
    const selectTalla = document.getElementById('compraTalla');
    const idTalla = selectTalla ? selectTalla.value : '';
    const nombreTalla = selectTalla && selectTalla.selectedIndex > 0 ? selectTalla.options[selectTalla.selectedIndex].textContent.split(' ')[0] : '';
    const cantidad = parseInt(document.getElementById('compraCantidad').value);
    const costo = parseFloat(document.getElementById('compraCosto').value);

    // Solo validar producto, cantidad y costo (talla es opcional)
    if (!idProducto || !cantidad || !costo) {
        alert('Completa todos los campos obligatorios (producto, cantidad y costo)');
        return;
    }

    itemsCompra.push({ idProducto, idTalla: idTalla || null, nombreTalla, cantidad, costo });
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
        const tallaTxt = item.idTalla && item.idTalla !== 'null' && item.idTalla !== '' ? `- Talla ${item.nombreTalla || item.idTalla}` : '- Sin talla';
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

async function cargarCompras(busqueda = '') {
    try {
        const res = await fetch('/api/compras');
        const data = await res.json();
        const lista = document.getElementById('listaCompras');
        if (!lista) return;
        
        if (!data.compras || data.compras.length === 0) {
            lista.innerHTML = '<div class="item">No hay compras registradas</div>';
            return;
        }
        
        // Filtrar compras si hay búsqueda
        let compras = data.compras;
        if (busqueda) {
            const b = busqueda.toLowerCase();
            compras = compras.filter(c => 
                (c.nombre_proveedor || '').toLowerCase().includes(b) ||
                String(c.id_compra).includes(b) ||
                (c.estado_pago || '').toLowerCase().includes(b)
            );
        }
        
        if (compras.length === 0) {
            lista.innerHTML = '<div class="item">No se encontraron compras</div>';
            return;
        }
        
        lista.innerHTML = compras.map(compra => {
            const detallesHtml = compra.detalles && compra.detalles.length > 0 
                ? compra.detalles.map(d => {
                    const nombre = (d && d.nombre_producto) ? d.nombre_producto : ('Producto #' + d.id_producto);
                    const label = (String(nombre).toLowerCase() === 'producto eliminado') ? 'Producto eliminado' : `${d.marca || ''} ${nombre}`;
                    const costo = parseFloat(d.costo_unitario || 0);
                    return `<div style="margin-left:20px;font-size:0.9em;color:#666;">- ${label} (${d.cantidad} unidades x $${costo.toFixed(2)}) = $${(Number(d.cantidad||0) * costo).toFixed(2)}</div>`;
                  }).join('')
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
    } catch (error) {
        console.error('Error cargando compras:', error);
        const lista = document.getElementById('listaCompras');
        if (lista) {
            lista.innerHTML = '<div class="item">Error al cargar compras</div>';
        }
    }
}

// ==================== FUNCIONES DE CLIENTES ====================
async function cargarClientesForm(busqueda = '') {
    const cont = document.getElementById('reporteClientes');
    if (!cont) {
        // Si no existe el contenedor de reportes, usar el de clientes normal
        const lista = document.getElementById('listaClientes');
        if (!lista) return;
        cont = lista;
    }
    
    try {
    // Usar endpoint administrativo para listar clientes cuando se requiere listado completo
    const res = await fetch('/api/admin/clientes');
    const data = await res.json();
        if (!data || !data.clientes || data.clientes.length === 0) {
            cont.innerHTML = '<div class="item">No hay clientes registrados.</div>';
            return;
        }
        
        let clientes = data.clientes;
        if (busqueda) {
            const b = busqueda.toLowerCase();
            clientes = clientes.filter(c => 
                (c.nombre || '').toLowerCase().includes(b) ||
                (c.cedula || '').includes(b) ||
                (c.telefono || '').includes(b) ||
                (c.email || '').toLowerCase().includes(b)
            );
        }
        
        if (clientes.length === 0) {
            cont.innerHTML = '<div class="item">No se encontraron clientes.</div>';
            return;
        }
        
        let html = `<table style="width:100%;border-collapse:collapse;">
            <thead>
                <tr style="background:var(--surface-alt);">
                    <th style="padding:var(--spacing-md);text-align:left;">Nombre</th>
                    <th style="padding:var(--spacing-md);text-align:left;">Cédula</th>
                    <th style="padding:var(--spacing-md);text-align:left;">Teléfono</th>
                    <th style="padding:var(--spacing-md);text-align:left;">Email</th>
                </tr>
            </thead>
            <tbody>`;
        clientes.forEach(c => {
            html += `<tr>
                <td style="padding:var(--spacing-md);">${c.nombre || 'N/A'}</td>
                <td style="padding:var(--spacing-md);">${c.cedula || 'N/A'}</td>
                <td style="padding:var(--spacing-md);">${c.telefono || 'N/A'}</td>
                <td style="padding:var(--spacing-md);">${c.email || 'N/A'}</td>
            </tr>`;
        });
        html += `</tbody></table>`;
        cont.innerHTML = html;
    } catch (e) {
        console.error('Error cargando clientes:', e);
        if (cont) {
            cont.innerHTML = '<div class="item">Error al cargar clientes.</div>';
        }
    }
}

async function registrarCliente(e) {
    e.preventDefault();
    try {
        const res = await fetch('/api/admin/clientes', {
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
    // Priorizar el contenedor específico del panel de Ventas (listaVentasAdmin).
    // Antes se usaba 'reporteVentas' primero (que existe también en la sección de reportes)
    // lo que hacía que el contenido se pintara en el reporte y no en el panel de gestión.
    const lista = document.getElementById('listaVentasAdmin') || document.getElementById('reporteVentas');
    if (!lista) return;
    
    try {
        // Por ahora tomamos mes/año actuales; se pueden exponer filtros en UI
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const res = await fetch(`/api/admin/ventas?year=${year}&month=${month}`, { credentials: 'include' });
        const data = await res.json();

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

        // Usar el nuevo endpoint que incluye totales por tipo de pago
        const resDetalle = await fetch(`/api/reportes/ventas-detalle?year=${year}&month=${month}`, { credentials: 'include' });
        const dataDetalle = await resDetalle.json();
        
        if (dataDetalle.ok && dataDetalle.ventas) {
            ventas = dataDetalle.ventas;
        }
        
        let html = ventas.map(v => `
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
        
        // Agregar totales por tipo de pago al final
        if (dataDetalle.ok && dataDetalle.totales) {
            const totales = dataDetalle.totales;
            html += `
                <div class="item" style="background:var(--surface-alt);padding:16px;margin-top:16px;border-radius:8px;">
                    <strong style="font-size:1.1em;">📊 Resumen de Pagos</strong><br>
                    <div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
                        <div><strong>Total General:</strong> $${parseFloat(totales.total || 0).toFixed(2)}</div>
                        <div><strong>Efectivo:</strong> $${parseFloat(totales.efectivo || 0).toFixed(2)}</div>
                        <div><strong>Pago Móvil:</strong> $${parseFloat(totales.pago_movil || 0).toFixed(2)}</div>
                        <div><strong>Transferencia:</strong> $${parseFloat(totales.transferencia || 0).toFixed(2)}</div>
                        <div><strong>Tarjeta:</strong> $${parseFloat(totales.tarjeta || 0).toFixed(2)}</div>
                    </div>
                </div>
            `;
        }

        lista.innerHTML = html;

        // Mostrar totales resumidos (si existe contenedor en dashboard)
        if (document.getElementById('ventasMes')) {
            const total = dataDetalle.ok && dataDetalle.totales ? dataDetalle.totales.total : (data.totales && data.totales.total_mes ? data.totales.total_mes : 0);
            document.getElementById('ventasMes').textContent = '$' + parseFloat(total).toFixed(2);
        }

    } catch (error) {
        console.error('Error cargando ventas admin:', error);
        const lista = document.getElementById('listaVentasAdmin');
        if (lista) lista.innerHTML = '<div class="item">Error de conexión al cargar ventas</div>';
    }
}

window.verDetalleVenta = function(id) {
        // Mostrar modal con detalle de venta (llamada al endpoint admin)
        (async function(){
            try {
                const modal = document.getElementById('modalDetalleVenta');
                const title = document.getElementById('detalleVentaTitle');
                const body = document.getElementById('detalleVentaBody');
                if (!modal || !title || !body) { alert('Detalle de venta no disponible'); return; }
                title.textContent = 'Cargando venta #' + id + '...';
                body.innerHTML = '<div>Cargando...</div>';
                modal.style.display = 'flex';
                const res = await fetch('/api/admin/ventas/' + encodeURIComponent(id));
                if (!res.ok) {
                    const err = await res.json().catch(()=>({}));
                    body.innerHTML = '<div>Error: ' + (err.message || 'No se pudo cargar la venta') + '</div>';
                    return;
                }
                const j = await res.json();
                if (!j.ok || !j.venta) { body.innerHTML = '<div>Venta no encontrada</div>'; return; }
                const v = j.venta;
                title.textContent = 'Venta #' + v.id_venta + ' — ' + (v.cliente || 'Cliente');
                const detalleHtml = (v.detalle || []).map(d => {
                    const descuentoUnit = d.descuento_unitario != null ? ` - Desc(unit): $${Number(d.descuento_unitario).toFixed(2)}` : '';
                    return `<div style="margin-bottom:8px;"><strong>${d.marca || ''} ${d.producto || ''}</strong><br>Talla: ${d.talla || '-'} | Cant: ${d.cantidad} | Precio unit: $${Number(d.precio_unitario||0).toFixed(2)}${descuentoUnit}</div>`;
                }).join('');
                body.innerHTML = `<div><b>Fecha:</b> ${v.fecha_hora}<br><b>Total:</b> $${Number(v.total_venta||0).toFixed(2)}<br><b>Pago:</b> ${v.tipo_pago || ''}<br><b>Usuario:</b> ${v.usuario || ''}</div><hr>${detalleHtml}`;
            } catch (e) {
                console.error('verDetalleVenta error', e);
                alert('Error al cargar detalle de venta');
            }
        })();
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

// ==================== FUNCIONES DE CLIENTES ====================
async function cargarClientes(busqueda = '') {
    const lista = document.getElementById('reporteClientes');
    if (!lista) return;
    
    try {
        const url = '/api/admin/clientes' + (busqueda ? `?busqueda=${encodeURIComponent(busqueda)}` : '');
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.ok || !data.clientes || data.clientes.length === 0) {
            lista.innerHTML = '<div class="item">No hay clientes registrados.</div>';
            return;
        }
        
        lista.innerHTML = data.clientes.map(cliente => `
            <div class="item">
                <div>
                    <strong>${cliente.nombre}</strong><br>
                    <strong>Cédula:</strong> ${cliente.cedula}<br>
                    <strong>Teléfono:</strong> ${cliente.telefono}<br>
                    <strong>Email:</strong> ${cliente.email}<br>
                    <strong>Total Ventas:</strong> ${cliente.total_ventas}<br>
                    <strong>Total Compras:</strong> $${parseFloat(cliente.total_compras || 0).toFixed(2)}
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error cargando clientes:', error);
        lista.innerHTML = '<div class="item">Error al cargar clientes.</div>';
    }
}


// ==================== FUNCIONES DE CUENTAS POR PAGAR ====================
async function cargarCuentasPagar() {
    try {
        const res = await fetch('/api/cuentas-pagar');
        const data = await res.json();
        const lista = document.getElementById('listaCuentasPagar');
        if (!lista) return;
        
        if (!data.ok || !data.cuentas || data.cuentas.length === 0) {
            lista.innerHTML = '<div class="item">No hay cuentas por pagar pendientes.</div>';
            return;
        }
        
            lista.innerHTML = data.cuentas.map(cuenta => `
                <div class="item">
                    <div>
                    <strong>Compra #${cuenta.id_compra} - ${cuenta.nombre_proveedor}</strong><br>
                    <div style="margin-top:8px;">
                        <strong>Monto Total:</strong> $${parseFloat(cuenta.monto_total).toFixed(2)} USD / ${parseFloat(cuenta.monto_total_bs).toFixed(2)} BS<br>
                        <strong>Monto Pagado:</strong> $${parseFloat(cuenta.monto_pagado).toFixed(2)} USD<br>
                        <strong>Monto Pendiente:</strong> $${parseFloat(cuenta.monto_pendiente).toFixed(2)} USD / ${parseFloat(cuenta.monto_pendiente_bs).toFixed(2)} BS<br>
                        <strong>Porcentaje Pendiente:</strong> ${cuenta.porcentaje_pendiente}%<br>
                        <strong>Fecha Compra:</strong> ${cuenta.fecha_compra}<br>
                        <strong>Fecha Vencimiento:</strong> ${cuenta.fecha_vencimiento}<br>
                        <strong>Estado:</strong> ${cuenta.estado}<br>
                        <small style="color:#666;">Tasa Dólar: ${cuenta.tasa_dolar} BS/USD</small>
                    </div>
                    </div>
                    <div class="actions">
                    <button class="btn btn-small" onclick="abrirModalRegistrarPago(${cuenta.id_compra}, ${cuenta.monto_pendiente}, ${cuenta.monto_total})">Registrar Pago</button>
                    </div>
                </div>
            `).join('');
    } catch (error) {
        console.error('Error cargando cuentas por pagar:', error);
        const lista = document.getElementById('listaCuentasPagar');
        if (lista) {
            lista.innerHTML = '<div class="item">Error al cargar cuentas por pagar.</div>';
        }
    }
}

// Función para abrir modal de registro de pago
function abrirModalRegistrarPago(idCompra, montoPendiente, montoTotal) {
    document.getElementById('pagoIdCompra').value = idCompra;
    const montoPendienteEl = document.getElementById('pagoMontoPendiente');
    montoPendienteEl.textContent = parseFloat(montoPendiente || 0).toFixed(2);
    montoPendienteEl.dataset.montoTotal = montoTotal;
    document.getElementById('pagoMonto').value = '';
    document.getElementById('pagoMonto').max = montoPendiente;
    document.getElementById('pagoMonto').min = 0.01;
    document.getElementById('pagoEstado').value = 'PARCIAL';
    document.getElementById('pagoMetodo').value = 'EFECTIVO';
    document.getElementById('pagoReferencia').value = '';
    document.getElementById('pagoNotas').value = '';
    toggleMontoPago();
    mostrarModal('modalRegistrarPago');
}

// Función para toggle del campo de monto según el estado
function toggleMontoPago() {
    const estado = document.getElementById('pagoEstado').value;
    const montoInput = document.getElementById('pagoMonto');
    const montoPendiente = parseFloat(document.getElementById('pagoMontoPendiente').textContent || 0);
    
    if (estado === 'PAGADA') {
        // Si es pago completo, establecer el monto pendiente automáticamente
        montoInput.value = montoPendiente.toFixed(2);
        montoInput.readOnly = true;
        calcularMontoRestante();
    } else {
        // Si es parcial, permitir editar el monto
        montoInput.readOnly = false;
        montoInput.value = '';
        montoInput.max = montoPendiente;
        calcularMontoRestante();
    }
}

// Función para calcular cuánto quedará debiendo
function calcularMontoRestante() {
    const montoPendiente = parseFloat(document.getElementById('pagoMontoPendiente').textContent || 0);
    const montoPagado = parseFloat(document.getElementById('pagoMonto').value || 0);
    const montoRestante = Math.max(0, montoPendiente - montoPagado);
    
    const restanteEl = document.getElementById('pagoMontoRestante');
    if (restanteEl) {
        restanteEl.textContent = montoRestante.toFixed(2);
        if (montoRestante === 0) {
            restanteEl.style.color = 'var(--success)';
            restanteEl.textContent += ' (Pago completo)';
        } else {
            restanteEl.style.color = 'var(--error)';
        }
    }
}

// Función para registrar pago
window.registrarPago = async function() {
    // Esta función se llama desde el botón, pero el submit se maneja en el listener
};

// ==================== FUNCIONES DE CONTROL DE CAJA ====================
async function cargarMovimientosCaja() {
    try {
        const res = await fetch('/api/caja/movimientos');
        const data = await res.json();
        const lista = document.getElementById('listaMovimientosCaja');
        if (!lista) return;
        
        if (!data.ok || !data.movimientos || data.movimientos.length === 0) {
            lista.innerHTML = '<div class="item">No hay movimientos de caja registrados.</div>';
            return;
        }
        
            lista.innerHTML = data.movimientos.map(mov => `
                <div class="item">
                    <div>
                    <strong>${mov.tipo || 'Movimiento'}</strong><br>
                    <strong>Monto:</strong> $${parseFloat(mov.monto || 0).toFixed(2)}<br>
                    <strong>Descripción:</strong> ${mov.descripcion || 'Sin descripción'}<br>
                    <strong>Fecha:</strong> ${mov.fecha_hora || 'N/A'}<br>
                    <strong>Usuario:</strong> ${mov.nombre_usuario || 'N/A'}<br>
                    ${mov.referencia ? `<strong>Referencia:</strong> ${mov.referencia}<br>` : ''}
                    </div>
                </div>
            `).join('');
    } catch (error) {
        console.error('Error cargando movimientos de caja:', error);
        const lista = document.getElementById('listaMovimientosCaja');
        if (lista) {
            lista.innerHTML = '<div class="item">Error al cargar movimientos de caja.</div>';
        }
    }
}

// ==================== FUNCIONES DE CONCILIACIÓN ====================
async function registrarConciliacion(e) {
    e.preventDefault();
    try {
        const res = await fetch('/api/conciliaciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fecha_conciliacion: document.getElementById('conciliacionFecha').value,
                saldo_libro: document.getElementById('conciliacionSaldoLibro').value,
                saldo_banco: document.getElementById('conciliacionSaldoBanco').value,
                notas: document.getElementById('conciliacionNotas').value
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
        const res = await fetch('/api/conciliaciones');
        const data = await res.json();
        const lista = document.getElementById('listaConciliaciones');
        if (!lista) return;
        
        if (!data.ok || !data.conciliaciones || data.conciliaciones.length === 0) {
            lista.innerHTML = '<div class="item">No hay conciliaciones registradas.</div>';
            return;
        }
        
            lista.innerHTML = data.conciliaciones.map(conc => `
                <div class="item">
                    <div>
                    <strong>Conciliación #${conc.id_conciliacion}</strong><br>
                    <strong>Fecha:</strong> ${conc.fecha_conciliacion}<br>
                    <strong>Saldo Libro:</strong> $${parseFloat(conc.saldo_libro || 0).toFixed(2)}<br>
                    <strong>Saldo Banco:</strong> $${parseFloat(conc.saldo_banco || 0).toFixed(2)}<br>
                    <strong>Diferencia:</strong> $${parseFloat(conc.diferencia || 0).toFixed(2)}<br>
                    <strong>Estado:</strong> ${conc.estado || 'N/A'}<br>
                    ${conc.notas ? `<strong>Notas:</strong> ${conc.notas}<br>` : ''}
                    <small style="color:#666;">Registrado: ${conc.fecha_registro || 'N/A'}</small>
                    </div>
                </div>
            `).join('');
    } catch (error) {
        console.error('Error cargando conciliaciones:', error);
        const lista = document.getElementById('listaConciliaciones');
        if (lista) {
            lista.innerHTML = '<div class="item">Error al cargar conciliaciones.</div>';
        }
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
                    <td style="padding:var(--spacing-md);text-align:right;">${parseFloat(prod.margen_porcentaje || 0).toFixed(1)}%</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error cargando reporte:', error);
    }
}

// ============ NUEVOS REPORTES ============
async function renderReporteInventario() {
    const cont = document.getElementById('reporteInventario');
    if (!cont) return;
    cont.innerHTML = '<div class="item">Cargando inventario...</div>';
    try {
        const res = await fetch('/api/reportes/inventario-actual');
        const data = await res.json();
        if (!data.ok || !data.rows || data.rows.length === 0) {
            cont.innerHTML = '<div class="item">No hay datos de inventario.</div>';
            return;
        }
        // Construir tabla
        let html = `<table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:var(--surface-alt);">
                <th style="padding:8px;text-align:left;border:1px solid #eee;">Marca</th>
                <th style="padding:8px;text-align:left;border:1px solid #eee;">Producto</th>
                <th style="padding:8px;text-align:left;border:1px solid #eee;">Categoría</th>
                <th style="padding:8px;text-align:right;border:1px solid #eee;">Stock Total</th>
                <th style="padding:8px;text-align:left;border:1px solid #eee;">Tallas (cantidad)</th>
              </tr>
            </thead>
            <tbody>`;
        data.rows.forEach(r => {
            const tallas = (r.tallas||[]).map(t => `${t.talla||'-'}: ${t.cantidad}`).join(' · ');
            html += `<tr>
                <td style="padding:8px;border:1px solid #f4f4f4;">${r.marca || ''}</td>
                <td style="padding:8px;border:1px solid #f4f4f4;">${r.nombre}</td>
                <td style="padding:8px;border:1px solid #f4f4f4;">${r.categoria || 'N/A'}</td>
                <td style="padding:8px;text-align:right;border:1px solid #f4f4f4;">${r.stock_total}</td>
                <td style="padding:8px;border:1px solid #f4f4f4;">${tallas}</td>
            </tr>`;
        });
        html += `</tbody></table>`;
        cont.innerHTML = html;
    } catch (e) {
        cont.innerHTML = '<div class="item">Error al cargar inventario.</div>';
    }
}

// Ahora manejada en reportes.js - mantener para compatibilidad
async function renderReporteCompras() {
    // Llamar a la función en reportes.js
    if (typeof window.renderReporteCompras !== 'function') {
        console.error('renderReporteCompras no está disponible en reportes.js');
        return;
    }
}

// Manejada en reportes.js
async function renderReporteTemporada() {
    // Llamar función en reportes.js
}

// Manejada en reportes.js
async function renderReporteRotacion() {
    // Llamar función en reportes.js
}

// Manejada en reportes.js
async function renderReporteClientes() {
    // Llamar función en reportes.js
}

function exportarReporteUtilidad() {
    try {
        const tbody = document.getElementById('tbodyReporteUtilidad');
        if (!tbody) {
            alert('No hay datos para exportar');
            return;
        }
        
        const rows = tbody.querySelectorAll('tr');
        if (rows.length === 0) {
            alert('No hay datos para exportar');
            return;
        }
        
        let csv = 'Producto,Costo,Precio Venta,Utilidad Unitaria,Unidades Vendidas,Utilidad Total,Margen %\n';
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 7) {
                const line = Array.from(cells).map(cell => {
                    let text = cell.textContent.trim();
                    text = text.replace(/[$,%]/g, '');
                    return `"${text}"`;
                }).join(',');
                csv += line + '\n';
            }
        });
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `reporte_utilidad_${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) {
        console.error('Error exportando:', e);
        alert('Error al exportar el reporte');
    }
}

// Función para cambiar entre tabs de reportes
window.switchReporteTab = function(tabName) {
    // Ocultar todas las secciones
    const sections = ['utilidad', 'inventario', 'compras', 'ventas', 'clientes', 'temporada', 'rotacion'];
    sections.forEach(sec => {
        const section = document.getElementById(`reporte-${sec}`);
        if (section) section.style.display = 'none';
        const tab = document.getElementById(`tab-${sec}`);
        if (tab) tab.classList.remove('active');
    });
    
    // Mostrar la sección seleccionada
    const section = document.getElementById(`reporte-${tabName}`);
    const tab = document.getElementById(`tab-${tabName}`);
    if (section) section.style.display = 'block';
    if (tab) tab.classList.add('active');
    
    // Cargar datos según el tab
    setTimeout(() => {
        switch(tabName) {
            case 'utilidad':
                if (typeof cargarReporteUtilidad === 'function') cargarReporteUtilidad();
                break;
            case 'inventario':
                if (typeof renderReporteInventario === 'function') renderReporteInventario();
                break;
            case 'compras':
                if (typeof renderReporteCompras === 'function') renderReporteCompras();
                break;
            case 'ventas':
                if (typeof cargarVentasAdmin === 'function') cargarVentasAdmin();
                break;
            case 'clientes':
                if (typeof cargarClientes === 'function') cargarClientes();
                break;
            case 'temporada':
                if (typeof fetchVentasTemporada === 'function') fetchVentasTemporada('actual');
                break;
            case 'rotacion':
                if (typeof cargarRotacionInventario === 'function') cargarRotacionInventario();
                break;
        }
    }, 100);
};

// Listeners para reportes
// Adjuntar listeners y comportamientos de reportes inmediatamente (script se carga al final del body)
function attachReportListeners(){
    console.log('Iniciando attachReportListeners - DOM Estado:', document.readyState);
    
    // Listener para botón de reporte de inventario
    const btnReporteInventario = document.getElementById('btnReporteInventario');
    if (btnReporteInventario) {
        console.log('✓ Encontrado btnReporteInventario');
        btnReporteInventario.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Clicked btnReporteInventario');
            renderReporteInventario();
        });
    } else {
        console.log('✗ btnReporteInventario no encontrado');
    }

    // Listener para botón de reporte de compras
    const btnReporteCompras = document.getElementById('btnReporteCompras');
    if (btnReporteCompras) {
        console.log('✓ Encontrado btnReporteCompras');
        btnReporteCompras.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Click en btnReporteCompras - iniciando renderReporteCompras');
            renderReporteCompras();
        });
    } else {
        console.log('✗ btnReporteCompras no encontrado');
    }

    // Listener para botón de reporte de ventas
    const btnReporteVentas = document.getElementById('btnReporteVentas');
    if (btnReporteVentas) {
        console.log('✓ Encontrado btnReporteVentas');
        btnReporteVentas.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Click en btnReporteVentas - iniciando renderReporteVentas');
            renderReporteVentas();
        });
    } else {
        console.log('✗ btnReporteVentas no encontrado');
    }

    // Listener para botón de reporte de clientes
    const btnReporteClientes = document.getElementById('btnReporteClientes');
    if (btnReporteClientes) {
        console.log('✓ Encontrado btnReporteClientes');
        btnReporteClientes.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Click en btnReporteClientes - iniciando renderReporteClientes');
            renderReporteClientes();
        });
    } else {
        console.log('✗ btnReporteClientes no encontrado');
    }

    // Listener para botón de reporte de temporada
    const btnReporteTemporada = document.getElementById('btnReporteTemporada');
    if (btnReporteTemporada) {
        console.log('✓ Encontrado btnReporteTemporada');
        btnReporteTemporada.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Click en btnReporteTemporada - iniciando renderReporteTemporada');
            renderReporteTemporada();
        });
    } else {
        console.log('✗ btnReporteTemporada no encontrado');
    }

    // Listener para botón de reporte de rotación
    const btnReporteRotacion = document.getElementById('btnReporteRotacion');
    if (btnReporteRotacion) {
        console.log('✓ Encontrado btnReporteRotacion');
        btnReporteRotacion.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Click en btnReporteRotacion - iniciando renderReporteRotacion');
            renderReporteRotacion();
        });
    } else {
        console.log('✗ btnReporteRotacion no encontrado');
    }

    // Listener para búsqueda de ventas
    const buscarVenta = document.getElementById('buscarVenta');
    if (buscarVenta) {
        buscarVenta.addEventListener('input', function() {
            cargarVentasAdmin(this.value);
        });
    }

    // Cargar datos iniciales cuando se muestran los reportes
    setTimeout(() => {
        const reportesPanel = document.getElementById('reportesPanel');
        if (reportesPanel && reportesPanel.style.display !== 'none') {
            const tabUtilidad = document.getElementById('tab-utilidad');
            if (tabUtilidad && tabUtilidad.classList.contains('active')) {
                cargarReporteUtilidad();
            }
        }
    }, 500);

    // Listener para select de periodo de ingresos
    const selectPeriodoIngresos = document.getElementById('selectPeriodoIngresos');
    if (selectPeriodoIngresos) {
        selectPeriodoIngresos.addEventListener('change', cargarIngresos);
    }

    // Listener para formulario de registrar pago
    const formRegistrarPago = document.getElementById('formRegistrarPago');
    if (formRegistrarPago) {
        formRegistrarPago.addEventListener('submit', async function(e) {
            e.preventDefault();
            try {
                const idCompra = document.getElementById('pagoIdCompra').value;
                const montoPagado = parseFloat(document.getElementById('pagoMonto').value || 0);
                const estadoPago = document.getElementById('pagoEstado').value;
                const metodoPago = document.getElementById('pagoMetodo').value;
                const referencia = document.getElementById('pagoReferencia').value;
                const notas = document.getElementById('pagoNotas').value;
                
                if (montoPagado <= 0) {
                    alert('El monto a pagar debe ser mayor a 0');
                    return;
                }
                
                const res = await fetch('/api/cuentas-pagar/pagar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id_compra: idCompra,
                        monto_pagado: montoPagado,
                        estado_pago: estadoPago,
                        metodo_pago: metodoPago,
                        referencia: referencia,
                        notas: notas,
                        monto_total: document.getElementById('pagoMontoPendiente').dataset.montoTotal || 0
                    })
                });
                
                const data = await res.json();
                if (data.ok) {
                    alert('Pago registrado correctamente');
                    cerrarModal('modalRegistrarPago');
                    cargarCuentasPagar();
                } else {
                    alert('Error: ' + (data.error || 'No se pudo registrar el pago'));
                }
            } catch (error) {
                console.error('Error registrando pago:', error);
                alert('Error de conexión');
            }
        });
    }
}

// Ejecutar attachReportListeners cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachReportListeners);
} else {
    // Si el script carga después de que el DOM esté listo
    attachReportListeners();
}

// ==================== FUNCIONES GERENCIALES ====================
// Cargar margen de ganancia por categoría con gráfica
async function cargarMargenCategoria() {
    try {
        const res = await fetch('/api/reportes/margen-categoria');
        const data = await res.json();
        
        if (!data.ok || !data.categorias || data.categorias.length === 0) {
            console.log('No hay datos de margen por categoría');
            return;
        }
        
        // Actualizar gráfico de márgenes si existe (en dashboard o reportes)
        const canvas = document.getElementById('margenChart');
        if (canvas && typeof Chart !== 'undefined') {
            const ctx = canvas.getContext('2d');
            const labels = data.categorias.map(c => c.categoria);
            const margenes = data.categorias.map(c => Number(c.margen_promedio || 0));
            
            if (window.margenChartInstance) {
                window.margenChartInstance.destroy();
            }
            
            window.margenChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Margen de Ganancia (%)',
                        data: margenes,
                        backgroundColor: data.categorias.map((c, i) => {
                            const colors = ['rgba(37, 99, 235, 0.6)', 'rgba(16, 185, 129, 0.6)', 'rgba(245, 158, 11, 0.6)', 'rgba(239, 68, 68, 0.6)', 'rgba(139, 92, 246, 0.6)'];
                            return colors[i % colors.length];
                        }),
                        borderColor: data.categorias.map((c, i) => {
                            const colors = ['rgb(37, 99, 235)', 'rgb(16, 185, 129)', 'rgb(245, 158, 11)', 'rgb(239, 68, 68)', 'rgb(139, 92, 246)'];
                            return colors[i % colors.length];
                        }),
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top'
                        },
                        title: {
                            display: true,
                            text: 'Margen de Ganancia por Categoría',
                            font: {
                                size: 16,
                                weight: 'bold'
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const cat = data.categorias[context.dataIndex];
                                    return [
                                        'Margen: ' + context.parsed.y.toFixed(2) + '%',
                                        'Utilidad: $' + parseFloat(cat.utilidad_total || 0).toFixed(2),
                                        'Ventas: $' + parseFloat(cat.total_ventas || 0).toFixed(2)
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return value + '%';
                                }
                            },
                            title: {
                                display: true,
                                text: 'Margen (%)'
                            }
                        }
                    }
                }
            });
        }
    } catch (e) {
        console.error('Error cargando margen por categoría:', e);
    }
}

// Cargar top 10 utilidad por producto
async function cargarTop10Utilidad() {
    try {
        const res = await fetch('/api/reportes/utilidad-top10');
        const data = await res.json();
        
        if (!data.ok || !data.productos || data.productos.length === 0) {
            const tbody = document.getElementById('tbodyUtilidad');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="4" style="padding:var(--spacing-md);text-align:center;">No hay datos de utilidad disponibles</td></tr>';
            }
            return;
        }
        
        // Actualizar tabla de utilidad en dashboard
        const tbody = document.getElementById('tbodyUtilidad');
        if (tbody) {
            tbody.innerHTML = data.productos.map(prod => `
                <tr style="border-bottom:1px solid var(--surface-alt);">
                    <td style="padding:var(--spacing-md);">${prod.nombre || 'N/A'}</td>
                    <td style="padding:var(--spacing-md);text-align:right;">$${parseFloat(prod.total_ventas || 0).toFixed(2)}</td>
                    <td style="padding:var(--spacing-md);text-align:right;">$${parseFloat(prod.utilidad_total || 0).toFixed(2)}</td>
                    <td style="padding:var(--spacing-md);text-align:right;">${parseFloat(prod.margen_porcentaje || 0).toFixed(1)}%</td>
                </tr>
            `).join('');
        }
    } catch (e) {
        console.error('Error cargando top 10 utilidad:', e);
        const tbody = document.getElementById('tbodyUtilidad');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding:var(--spacing-md);text-align:center;">Error al cargar datos</td></tr>';
        }
    }
}


// ==================== GESTIÓN DE CLIENTES ====================
async function cargarClientesAdmin(busqueda = '') {
    try {
        const response = await fetch('/api/clientes');
        const data = await response.json();
        const listaClientes = document.getElementById('listaClientesAdmin');

        if (!listaClientes) return;

        if (data.ok && data.clientes && data.clientes.length > 0) {
            // Filtrar en el cliente para el ejemplo (mejor en el servidor)
                        const clientesFiltrados = busqueda
                                ? data.clientes.filter(c =>
                                        (c.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
                                        (c.cedula || '').toLowerCase().includes(busqueda.toLowerCase()) ||
                                        (c.email || '').toLowerCase().includes(busqueda.toLowerCase())
                                    )
                                : data.clientes;

            listaClientes.innerHTML = clientesFiltrados.map(cliente => `
                <div class="item">
                    <span class="item-title">${cliente.nombre} ${cliente.cedula ? '(' + cliente.cedula + ')' : ''}</span>
                    <span class="item-detail">${cliente.email || 'N/A'} | Tel: ${cliente.telefono || 'N/A'}</span>
                    <button class="btn btn-sm btn-info" onclick="editarCliente(${cliente.id_cliente})">Editar</button>
                </div>
            `).join('');
        } else {
            listaClientes.innerHTML = '<div class="item">No hay clientes registrados.</div>';
        }

    } catch (e) {
        console.error('Error cargando clientes:', e);
    }
}

// Llama a esta función al cargar el DOM si estás en el panel de clientes
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('clientesPanel')) {
        cargarClientesAdmin();
        // Agregar listener de búsqueda si tienes un campo de búsqueda en el panel de clientes
        // const inputBuscarClientes = document.getElementById('buscarClienteAdmin');
        // ... (similar a la búsqueda de ventas)
    }
});

// ==================== REPORTES ====================

// Chart.js instance storage
let ventasChart;
let comprasChart;
let clientesChart;
let temporadaChart;

function prepararReportes() {
    // Solo se ejecutan si estamos en el panel de reportes
    if (!document.getElementById('reportesPanel')) return;

    cargarReporteVentasMensual();
    cargarReporteComprasMensual();
    cargarReporteTopClientes();
    cargarReporteTendenciasTemporada();
    cargarReporteInventarioLento(); // Reporte adicional

    // Listener para cambiar el tipo de reporte visible
    document.querySelectorAll('.reporte-switch').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('data-target');
            document.querySelectorAll('.reporte-section').forEach(section => {
                section.style.display = 'none';
            });
            const targetSection = document.getElementById(targetId);
            if (targetSection) targetSection.style.display = 'block';

            document.querySelectorAll('.reporte-switch').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Mostrar el primer reporte por defecto
    const primerReporte = document.querySelector('.reporte-switch');
    if(primerReporte) primerReporte.click();
}

// Venta Mensual
async function cargarReporteVentasMensual() {
    try {
        const response = await fetch('/api/reportes/ventas/mensual');
        const data = await response.json();
        
        if (data.ok && data.data) {
            const ctx = document.getElementById('ventasChartReportes').getContext('2d');
            const labels = data.data.map(item => item.mes);
            const totales = data.data.map(item => parseFloat(item.total_ventas));
            
            if (ventasChart) ventasChart.destroy();

            ventasChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Ingresos por Mes',
                        data: totales,
                        backgroundColor: 'rgba(37, 99, 235, 0.5)', // var(--primary)
                        borderColor: 'rgba(37, 99, 235, 1)',
                        borderWidth: 2,
                        tension: 0.3
                    }]
                }
                // ... opciones de chartjs
            });
        }
    } catch (e) {
        console.error('Error al cargar Reporte de Ventas:', e);
    }
}

// Compra Mensual
async function cargarReporteComprasMensual() {
    try {
        const response = await fetch('/api/reportes/compras/mensual');
        const data = await response.json();

        if (data.ok && data.data) {
            const ctx = document.getElementById('comprasChartReportes').getContext('2d');
            const labels = data.data.map(item => item.mes);
            const totales = data.data.map(item => parseFloat(item.total_compras));

            if (comprasChart) comprasChart.destroy();

            comprasChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Gastos por Compra Mensual',
                        data: totales,
                        backgroundColor: 'rgba(239, 68, 68, 0.7)', // var(--error)
                        borderWidth: 1
                    }]
                }
            });
        }
    } catch (e) {
        console.error('Error al cargar Reporte de Compras:', e);
    }
}

// Top Clientes
async function cargarReporteTopClientes() {
    try {
        const response = await fetch('/api/reportes/clientes/top');
        const data = await response.json();
        const listaClientes = document.getElementById('reporteTopClientes');
        
        if (!listaClientes) return;
        listaClientes.innerHTML = ''; // Limpiar

        if (data.ok && data.data && data.data.length > 0) {
            listaClientes.innerHTML = data.data.map(cliente => `
                <div class="item">
                    <span class="item-title">${cliente.nombre} ${cliente.cedula ? '(' + cliente.cedula + ')' : ''}</span>
                    <span class="item-detail">Gasto: $${parseFloat(cliente.gasto_total).toFixed(2)} (${cliente.total_compras} Compras)</span>
                </div>
            `).join('');
        } else {
            listaClientes.innerHTML = '<div class="item">No hay datos de clientes para el ranking.</div>';
        }
    } catch (e) {
        console.error('Error al cargar Reporte Top Clientes:', e);
    }
}

// Reporte de Temporada (Tendencias por Categoría)
async function cargarReporteTendenciasTemporada() {
    try {
        const response = await fetch('/api/reportes/tendencias/categorias');
        const data = await response.json();
        
        if (data.ok && data.data) {
            const ctx = document.getElementById('temporadaChartReportes').getContext('2d');
            const labels = data.data.map(item => item.categoria);
            const ingresos = data.data.map(item => parseFloat(item.ingresos_categoria));
            
            if (temporadaChart) temporadaChart.destroy();

            temporadaChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Ingresos por Categoría',
                        data: ingresos,
                        backgroundColor: [ // Usa una paleta de colores
                            '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#34d399', '#3b82f6', '#1e40af', '#059669', '#f97316'
                        ],
                    }]
                }
                // ... opciones de chartjs
            });

            // Actualizar el título para reflejar que es por categoría
            const titulo = document.querySelector('#reporte-temporada .chart-title');
            if (titulo) titulo.textContent = 'Tendencias de Venta por Categoría (Último Año)';
        }
    } catch (e) {
        console.error('Error al cargar Reporte de Tendencias/Temporada:', e);
    }
}

// Reporte Adicional (Inventario Lento)
async function cargarReporteInventarioLento() {
    try {
        const response = await fetch('/api/reportes/inventario/lento');
        const data = await response.json();
        const listaInventario = document.getElementById('reporteRotacion'); // Usando el ID existente
        
        if (!listaInventario) return;
        listaInventario.innerHTML = ''; // Limpiar

        if (data.ok && data.data && data.data.length > 0) {
            listaInventario.innerHTML = data.data.map(prod => `
                <div class="item">
                    <span class="item-title">${prod.nombre}</span>
                    <span class="item-detail">Precio: $${parseFloat(prod.precio_venta).toFixed(2)} | Última Venta: ${prod.ultima_venta ? new Date(prod.ultima_venta).toLocaleDateString() : 'Nunca'}</span>
                </div>
            `).join('');
        } else {
            listaInventario.innerHTML = '<div class="item">¡Excelente! Todos los productos han rotado recientemente.</div>';
        }

    } catch (e) {
        console.error('Error al cargar Reporte de Inventario Lento:', e);
    }
}

// Nota: la inicialización de reportes se realiza en la carga DOM principal.
// Evitar duplicar listeners 'DOMContentLoaded' al final del archivo.

