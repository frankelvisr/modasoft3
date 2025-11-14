/*
  reportes.js
  Sistema completo de reportes con exportación a PDF
  Modasoft ERP
*/

// Importar librería jsPDF para exportar PDFs
const scriptPDF = document.createElement('script');
scriptPDF.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
document.head.appendChild(scriptPDF);

// ==================== REPORTE DE COMPRAS ====================
async function renderReporteCompras() {
    const cont = document.getElementById('reporteCompras');
    if (!cont) return;
    cont.innerHTML = '<div class="item">Cargando compras...</div>';
    
    try {
        const res = await fetch('/api/compras');
        const data = await res.json();
        
        if (!data.ok || !data.compras || data.compras.length === 0) {
            cont.innerHTML = '<div class="item">No hay datos de compras.</div>';
            return;
        }

        let totalGeneral = 0;
        let html = `
            <div id="tabla-compras-export" style="padding: 20px; background: white;">
                <h3 style="text-align: center; margin-bottom: 20px;">Reporte de Compras</h3>
                <p style="text-align: center; color: #666; margin-bottom: 20px;">Generado: ${new Date().toLocaleDateString('es-VE')}</p>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="background:var(--surface-alt);">
                            <th style="padding:12px;text-align:left;border:1px solid #ccc;">Compra #</th>
                            <th style="padding:12px;text-align:left;border:1px solid #ccc;">Fecha</th>
                            <th style="padding:12px;text-align:left;border:1px solid #ccc;">Proveedor</th>
                            <th style="padding:12px;text-align:right;border:1px solid #ccc;">Total</th>
                            <th style="padding:12px;text-align:left;border:1px solid #ccc;">Estado</th>
                        </tr>
                    </thead>
                    <tbody>`;

        data.compras.forEach(c => {
            const total = parseFloat(c.total_compra || 0);
            totalGeneral += total;
            html += `<tr style="border-bottom:1px solid #eee;">
                <td style="padding:12px;border:1px solid #f4f4f4;">#${c.id_compra}</td>
                <td style="padding:12px;border:1px solid #f4f4f4;">${new Date(c.fecha_compra).toLocaleDateString('es-VE')}</td>
                <td style="padding:12px;border:1px solid #f4f4f4;">${c.nombre_proveedor || 'N/A'}</td>
                <td style="padding:12px;text-align:right;border:1px solid #f4f4f4;font-weight:bold;">$${total.toFixed(2)}</td>
                <td style="padding:12px;border:1px solid #f4f4f4;">${c.estado_pago || 'N/A'}</td>
            </tr>`;
        });

        html += `</tbody></table>
                <div style="margin-top:20px;padding:15px;background:#f0f0f0;border-radius:4px;text-align:right;">
                    <strong>Total General: $${totalGeneral.toFixed(2)}</strong>
                </div>
            </div>`;

        cont.innerHTML = html + `
            <div style="margin-top:20px;">
                <button onclick="exportarComprasAPDF()" class="btn btn-primary" style="background:#3b82f6;color:white;padding:10px 20px;border:none;border-radius:4px;cursor:pointer;">
                    📥 Exportar a PDF
                </button>
            </div>`;

    } catch (e) {
        cont.innerHTML = '<div class="item">Error al cargar compras.</div>';
        console.error('Error:', e);
    }
}

window.exportarComprasAPDF = function() {
    const element = document.getElementById('tabla-compras-export');
    if (!element) {
        alert('No hay datos para exportar');
        return;
    }
    
    const opt = {
        margin: 10,
        filename: `reporte_compras_${new Date().toISOString().slice(0,10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };
    
    html2pdf().set(opt).from(element).save();
};

// ==================== REPORTE DE VENTAS ====================
async function cargarVentasAdmin(busqueda = '') {
    const lista = document.getElementById('listaVentasAdmin') || document.getElementById('reporteVentas');
    if (!lista) return;
    
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const res = await fetch(`/api/admin/ventas?year=${year}&month=${month}`);
        const data = await res.json();

        if (!data.ok) {
            lista.innerHTML = `<div class="item">Error cargando ventas: ${data.message || 'error'}</div>`;
            return;
        }

        let ventas = data.ventas || [];
        if (busqueda) {
            const b = busqueda.toLowerCase();
            ventas = ventas.filter(v => 
                (v.cliente || '').toLowerCase().includes(b) || 
                (v.usuario || '').toLowerCase().includes(b) || 
                String(v.id_venta).includes(b)
            );
        }

        if (ventas.length === 0) {
            lista.innerHTML = '<div class="item">No hay ventas para el mes seleccionado.</div>';
            return;
        }

        let totalVentas = 0;
        let html = `<div id="tabla-ventas-export" style="padding:20px;background:white;">
            <h3 style="text-align:center;margin-bottom:20px;">Reporte de Ventas</h3>
            <p style="text-align:center;color:#666;margin-bottom:20px;">Período: ${new Date(year, month-1).toLocaleDateString('es-VE', {month:'long', year:'numeric'})}</p>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:var(--surface-alt);">
                        <th style="padding:12px;text-align:left;border:1px solid #ccc;">Venta #</th>
                        <th style="padding:12px;text-align:left;border:1px solid #ccc;">Cliente</th>
                        <th style="padding:12px;text-align:left;border:1px solid #ccc;">Fecha</th>
                        <th style="padding:12px;text-align:right;border:1px solid #ccc;">Total</th>
                        <th style="padding:12px;text-align:left;border:1px solid #ccc;">Pago</th>
                    </tr>
                </thead>
                <tbody>`;

        ventas.forEach(v => {
            const total = parseFloat(v.total_venta || 0);
            totalVentas += total;
            html += `<tr style="border-bottom:1px solid #eee;">
                <td style="padding:12px;border:1px solid #f4f4f4;">#${v.id_venta}</td>
                <td style="padding:12px;border:1px solid #f4f4f4;">${v.cliente || 'Anónimo'}</td>
                <td style="padding:12px;border:1px solid #f4f4f4;">${new Date(v.fecha_hora).toLocaleDateString('es-VE')}</td>
                <td style="padding:12px;text-align:right;border:1px solid #f4f4f4;font-weight:bold;">$${total.toFixed(2)}</td>
                <td style="padding:12px;border:1px solid #f4f4f4;">${v.tipo_pago || 'N/A'}</td>
            </tr>`;
        });

        html += `</tbody></table>
                <div style="margin-top:20px;padding:15px;background:#f0f0f0;border-radius:4px;text-align:right;">
                    <strong>Total de Ventas: $${totalVentas.toFixed(2)}</strong>
                </div>
            </div>`;

        lista.innerHTML = html + `
            <div style="margin-top:20px;">
                <button onclick="exportarVentasAPDF()" class="btn btn-primary" style="background:#3b82f6;color:white;padding:10px 20px;border:none;border-radius:4px;cursor:pointer;">
                    📥 Exportar a PDF
                </button>
            </div>`;

    } catch (error) {
        console.error('Error:', error);
        lista.innerHTML = '<div class="item">Error de conexión</div>';
    }
}

window.exportarVentasAPDF = function() {
    const element = document.getElementById('tabla-ventas-export');
    if (!element) {
        alert('No hay datos para exportar');
        return;
    }
    
    const opt = {
        margin: 10,
        filename: `reporte_ventas_${new Date().toISOString().slice(0,10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };
    
    html2pdf().set(opt).from(element).save();
};

// ==================== REPORTE DE CLIENTES ====================
async function cargarClientes(busqueda = '') {
    const lista = document.getElementById('reporteClientes') || document.getElementById('listaClientesAdmin');
    if (!lista) return;
    
    try {
        const res = await fetch('/api/admin/clientes');
        const data = await res.json();
        
        if (!data.ok || !data.clientes || data.clientes.length === 0) {
            lista.innerHTML = '<div class="item">No hay clientes registrados.</div>';
            return;
        }
        
        let clientes = data.clientes;
        if (busqueda) {
            const b = busqueda.toLowerCase();
            clientes = clientes.filter(c => 
                (c.nombre || '').toLowerCase().includes(b) ||
                (c.cedula || '').includes(b) ||
                (c.email || '').toLowerCase().includes(b)
            );
        }

        if (clientes.length === 0) {
            lista.innerHTML = '<div class="item">No se encontraron clientes.</div>';
            return;
        }

        let html = `<div id="tabla-clientes-export" style="padding:20px;background:white;">
            <h3 style="text-align:center;margin-bottom:20px;">Reporte de Clientes</h3>
            <p style="text-align:center;color:#666;margin-bottom:20px;">Generado: ${new Date().toLocaleDateString('es-VE')}</p>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:var(--surface-alt);">
                        <th style="padding:12px;text-align:left;border:1px solid #ccc;">Nombre</th>
                        <th style="padding:12px;text-align:left;border:1px solid #ccc;">Cédula</th>
                        <th style="padding:12px;text-align:left;border:1px solid #ccc;">Email</th>
                        <th style="padding:12px;text-align:left;border:1px solid #ccc;">Teléfono</th>
                    </tr>
                </thead>
                <tbody>`;

        clientes.forEach(c => {
            html += `<tr style="border-bottom:1px solid #eee;">
                <td style="padding:12px;border:1px solid #f4f4f4;">${c.nombre || 'N/A'}</td>
                <td style="padding:12px;border:1px solid #f4f4f4;">${c.cedula || 'N/A'}</td>
                <td style="padding:12px;border:1px solid #f4f4f4;">${c.email || 'N/A'}</td>
                <td style="padding:12px;border:1px solid #f4f4f4;">${c.telefono || 'N/A'}</td>
            </tr>`;
        });

        html += `</tbody></table>
            </div>`;

        lista.innerHTML = html + `
            <div style="margin-top:20px;">
                <button onclick="exportarClientesAPDF()" class="btn btn-primary" style="background:#3b82f6;color:white;padding:10px 20px;border:none;border-radius:4px;cursor:pointer;">
                    📥 Exportar a PDF
                </button>
            </div>`;

    } catch (error) {
        console.error('Error:', error);
        lista.innerHTML = '<div class="item">Error al cargar clientes</div>';
    }
}

window.exportarClientesAPDF = function() {
    const element = document.getElementById('tabla-clientes-export');
    if (!element) {
        alert('No hay datos para exportar');
        return;
    }
    
    const opt = {
        margin: 10,
        filename: `reporte_clientes_${new Date().toISOString().slice(0,10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };
    
    html2pdf().set(opt).from(element).save();
};

// ==================== REPORTE DE UTILIDAD ====================
async function cargarReporteUtilidad() {
    try {
        const res = await fetch('/api/reportes/utilidad-productos');
        const data = await res.json();
        
        if (!data.ok || !data.utilidad) {
            const tbody = document.getElementById('tbodyReporteUtilidad');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="7">Error cargando datos</td></tr>';
            }
            return;
        }

        let html = `<div id="tabla-utilidad-export" style="padding:20px;background:white;">
            <h3 style="text-align:center;margin-bottom:20px;">Reporte de Utilidad por Producto</h3>
            <p style="text-align:center;color:#666;margin-bottom:20px;">Generado: ${new Date().toLocaleDateString('es-VE')}</p>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:var(--surface-alt);">
                        <th style="padding:12px;text-align:left;border:1px solid #ccc;">Producto</th>
                        <th style="padding:12px;text-align:right;border:1px solid #ccc;">Costo</th>
                        <th style="padding:12px;text-align:right;border:1px solid #ccc;">Precio Venta</th>
                        <th style="padding:12px;text-align:right;border:1px solid #ccc;">Utilidad Unit.</th>
                        <th style="padding:12px;text-align:right;border:1px solid #ccc;">Unidades</th>
                        <th style="padding:12px;text-align:right;border:1px solid #ccc;">Utilidad Total</th>
                        <th style="padding:12px;text-align:right;border:1px solid #ccc;">Margen %</th>
                    </tr>
                </thead>
                <tbody>`;

        let totalUtilidad = 0;
        data.utilidad.forEach(prod => {
            const utilTotal = parseFloat(prod.utilidad_total || 0);
            totalUtilidad += utilTotal;
            html += `<tr style="border-bottom:1px solid #eee;">
                <td style="padding:12px;border:1px solid #f4f4f4;">${prod.nombre}</td>
                <td style="padding:12px;text-align:right;border:1px solid #f4f4f4;">$${parseFloat(prod.costo_promedio || 0).toFixed(2)}</td>
                <td style="padding:12px;text-align:right;border:1px solid #f4f4f4;">$${parseFloat(prod.precio_venta || 0).toFixed(2)}</td>
                <td style="padding:12px;text-align:right;border:1px solid #f4f4f4;">$${parseFloat(prod.utilidad_unitaria || 0).toFixed(2)}</td>
                <td style="padding:12px;text-align:right;border:1px solid #f4f4f4;">${prod.unidades_vendidas || 0}</td>
                <td style="padding:12px;text-align:right;border:1px solid #f4f4f4;font-weight:bold;">$${parseFloat(prod.utilidad_total || 0).toFixed(2)}</td>
                <td style="padding:12px;text-align:right;border:1px solid #f4f4f4;">${parseFloat(prod.margen_porcentaje || 0).toFixed(1)}%</td>
            </tr>`;
        });

        html += `</tbody></table>
                <div style="margin-top:20px;padding:15px;background:#f0f0f0;border-radius:4px;text-align:right;">
                    <strong>Utilidad Total: $${totalUtilidad.toFixed(2)}</strong>
                </div>
            </div>`;

        const cont = document.getElementById('tablaReporteUtilidad');
        if (cont) {
            cont.innerHTML = html + `
                <div style="margin-top:20px;">
                    <button onclick="exportarUtilidadAPDF()" class="btn btn-primary" style="background:#3b82f6;color:white;padding:10px 20px;border:none;border-radius:4px;cursor:pointer;">
                        📥 Exportar a PDF
                    </button>
                </div>`;
        }

        // Actualizar tabla en tbody si existe
        const tbody = document.getElementById('tbodyReporteUtilidad');
        if (tbody) {
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

window.exportarUtilidadAPDF = function() {
    const element = document.getElementById('tabla-utilidad-export');
    if (!element) {
        alert('No hay datos para exportar');
        return;
    }
    
    const opt = {
        margin: 10,
        filename: `reporte_utilidad_${new Date().toISOString().slice(0,10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4' }
    };
    
    html2pdf().set(opt).from(element).save();
};

// ==================== FUNCIÓN AUXILIAR ====================
function switchReporteTab(tab) {
    // Ocultar todos los reportes
    const reporteSections = document.querySelectorAll('.reporte-section');
    reporteSections.forEach(section => section.style.display = 'none');
    
    // Remover active de todos los botones
    const reporteTabs = document.querySelectorAll('.reporte-tab');
    reporteTabs.forEach(btn => btn.classList.remove('active'));
    
    // Mostrar el reporte seleccionado
    const targetSection = document.getElementById(`reporte-${tab}`);
    const targetTab = document.getElementById(`tab-${tab}`);
    
    if (targetSection) {
        targetSection.style.display = 'block';
    }
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    // Cargar datos según el tipo de reporte
    setTimeout(() => {
        switch(tab) {
            case 'utilidad':
                if (typeof cargarReporteUtilidad === 'function') cargarReporteUtilidad();
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
        }
    }, 100);
}

// ==================== FUNCIONES AUXILIARES ====================
// Función para reportes de inventario
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
        let html = `<table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:var(--surface-alt);">
                <th style="padding:8px;text-align:left;border:1px solid #eee;">Marca</th>
                <th style="padding:8px;text-align:left;border:1px solid #eee;">Producto</th>
                <th style="padding:8px;text-align:left;border:1px solid #eee;">Categoría</th>
                <th style="padding:8px;text-align:right;border:1px solid #eee;">Stock Total</th>
                <th style="padding:8px;text-align:left;border:1px solid #eee;">Tallas</th>
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

// Función para ventas por temporada
async function fetchVentasTemporada(periodo) {
    const cont = document.getElementById('reporteTemporada') || document.getElementById('temporadaChart');
    if (!cont) return;
    
    try {
        // Simular datos por período
        const res = await fetch('/api/admin/ventas');
        const data = await res.json();
        if (!data.ok || !data.ventas) {
            if (cont.id === 'temporadaChart') return;
            cont.innerHTML = '<div class="item">No hay datos.</div>';
            return;
        }

        const ventasPorMes = {};
        let totalGeneral = 0;
        
        data.ventas.forEach(v => {
            const fecha = new Date(v.fecha_hora);
            const mes = fecha.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
            const monto = Number(v.total_venta || 0);
            if (!ventasPorMes[mes]) {
                ventasPorMes[mes] = { count: 0, total: 0 };
            }
            ventasPorMes[mes].count++;
            ventasPorMes[mes].total += monto;
            totalGeneral += monto;
        });

        // Si es contenedor de tabla
        if (cont.id !== 'temporadaChart') {
            let html = `<table style="width:100%;border-collapse:collapse;">
                <thead>
                  <tr style="background:var(--surface-alt);">
                    <th style="padding:8px;text-align:left;border:1px solid #eee;">Período</th>
                    <th style="padding:8px;text-align:right;border:1px solid #eee;">Transacciones</th>
                    <th style="padding:8px;text-align:right;border:1px solid #eee;">Total</th>
                  </tr>
                </thead>
                <tbody>`;
            
            Object.entries(ventasPorMes).forEach(([mes, datos]) => {
                html += `<tr>
                    <td style="padding:8px;border:1px solid #f4f4f4;">${mes}</td>
                    <td style="padding:8px;text-align:right;border:1px solid #f4f4f4;">${datos.count}</td>
                    <td style="padding:8px;text-align:right;border:1px solid #f4f4f4;font-weight:bold;">$${datos.total.toFixed(2)}</td>
                </tr>`;
            });
            html += `</tbody></table>`;
            cont.innerHTML = html;
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

// Función para rotación de inventario
async function cargarRotacionInventario() {
    const cont = document.getElementById('reporteRotacion');
    if (!cont) return;
    cont.innerHTML = '<div class="item">Cargando rotación...</div>';
    try {
        const res = await fetch('/api/reportes/rotacion-inventario?top=100');
        const data = await res.json();
        if (data && data.rows && data.rows.length > 0) {
            let html = `<table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:var(--surface-alt);">
                        <th style="padding:var(--spacing-md);text-align:left;">Producto</th>
                        <th style="padding:var(--spacing-md);text-align:left;">Categoría</th>
                        <th style="padding:var(--spacing-md);text-align:right;">Stock</th>
                        <th style="padding:var(--spacing-md);text-align:right;">Vendidas</th>
                        <th style="padding:var(--spacing-md);text-align:right;">Rotación</th>
                    </tr>
                </thead>
                <tbody>`;
            data.rows.forEach(r => {
                html += `<tr>
                    <td style="padding:var(--spacing-md);">${r.marca || ''} ${r.nombre || ''}</td>
                    <td style="padding:var(--spacing-md);">${r.categoria || 'N/A'}</td>
                    <td style="padding:var(--spacing-md);text-align:right;">${r.stock_actual || 0}</td>
                    <td style="padding:var(--spacing-md);text-align:right;">${r.unidades_vendidas_ultimo_mes || 0}</td>
                    <td style="padding:var(--spacing-md);text-align:right;font-weight:600;">${parseFloat(r.indice_rotacion||0).toFixed(2)}</td>
                </tr>`;
            });
            html += `</tbody></table>`;
            cont.innerHTML = html;
        } else {
            cont.innerHTML = '<div class="item">No hay datos.</div>';
        }
    } catch (e) {
        cont.innerHTML = '<div class="item">Error al cargar.</div>';
    }
}