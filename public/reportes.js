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
    if (!cont) {
        console.warn('Contenedor reporteCompras no encontrado');
        return;
    }
    
    cont.innerHTML = '<div class="item" style="padding:20px;text-align:center;">⏳ Cargando compras...</div>';
    
    try {
        const res = await fetch('/api/compras', { credentials: 'include' });
        
        if (!res.ok) {
            if (res.status === 401) {
                cont.innerHTML = '<div class="item" style="padding:20px;text-align:center;color:#dc2626;">🔒 No autenticado. Por favor inicie sesión en el sistema.</div>';
                return;
            }
            throw new Error(`Error HTTP: ${res.status}`);
        }
        
        const data = await res.json();
        
        if (!data.compras || !Array.isArray(data.compras) || data.compras.length === 0) {
            cont.innerHTML = '<div class="item" style="padding:20px;text-align:center;color:#999;">📭 No hay datos de compras registrados.</div>';
            return;
        }

        let totalGeneral = 0;
        let html = `<div id="tabla-compras-export" style="padding:20px;background:white;border-radius:8px;">
            <h3 style="text-align:center;margin-bottom:10px;color:#333;font-size:1.3em;">🛒 Reporte de Compras</h3>
            <p style="text-align:center;color:#666;margin-bottom:20px;font-size:0.9em;">Generado: ${new Date().toLocaleDateString('es-VE', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}</p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                <thead>
                    <tr style="background:#ef4444;color:white;">
                        <th style="padding:12px;text-align:left;border:1px solid #dc2626;">Compra #</th>
                        <th style="padding:12px;text-align:left;border:1px solid #dc2626;">Fecha</th>
                        <th style="padding:12px;text-align:left;border:1px solid #dc2626;">Proveedor</th>
                        <th style="padding:12px;text-align:right;border:1px solid #dc2626;">Total</th>
                        <th style="padding:12px;text-align:left;border:1px solid #dc2626;">Estado</th>
                    </tr>
                </thead>
                <tbody>`;

        data.compras.forEach((c, idx) => {
            const total = parseFloat(c.total_compra || 0);
            totalGeneral += total;
            const bgColor = idx % 2 === 0 ? '#f9fafb' : '#ffffff';
            html += `<tr style="background:${bgColor};">
                <td style="padding:12px;border:1px solid #e5e7eb;"><strong>#${c.id_compra}</strong></td>
                <td style="padding:12px;border:1px solid #e5e7eb;">${new Date(c.fecha_compra).toLocaleDateString('es-VE')}</td>
                <td style="padding:12px;border:1px solid #e5e7eb;">${c.nombre_proveedor || 'N/A'}</td>
                <td style="padding:12px;text-align:right;border:1px solid #e5e7eb;font-weight:bold;">$${total.toFixed(2)}</td>
                <td style="padding:12px;border:1px solid #e5e7eb;">${c.estado_pago || 'N/A'}</td>
            </tr>`;
        });

        html += `</tbody></table>
            <div style="border-top:2px solid #e5e7eb;padding-top:15px;text-align:right;">
                <p style="margin:0;color:#666;font-size:0.9em;"><strong>Total de compras:</strong> $${totalGeneral.toFixed(2)}</p>
                <p style="margin:5px 0 0 0;color:#999;font-size:0.8em;">Número de compras: ${data.compras.length}</p>
            </div>
        </div>`;

        cont.innerHTML = html;
        
        // Agregar botones de exportación
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'margin-top:20px;display:flex;gap:10px;';
        btnContainer.innerHTML = `
            <button onclick="exportarComprasAPDF()" class="btn btn-primary" style="background:#ef4444;color:white;padding:12px 24px;border:none;border-radius:6px;cursor:pointer;font-weight:500;font-size:1em;">
                📥 Exportar a PDF
            </button>
            <button onclick="exportarComprasACSV()" class="btn btn-secondary" style="background:#6b7280;color:white;padding:12px 24px;border:none;border-radius:6px;cursor:pointer;font-weight:500;font-size:1em;">
                📊 Exportar a CSV
            </button>
        `;
        cont.appendChild(btnContainer);

    } catch (e) {
        console.error('Error cargando compras:', e);
        cont.innerHTML = `<div class="item" style="padding:20px;text-align:center;color:#dc2626;">
            ❌ Error al cargar compras: ${e.message}
        </div>`;
    }
}

window.exportarComprasAPDF = function() {
    const element = document.getElementById('tabla-compras-export');
    if (!element) {
        alert('❌ No hay datos para exportar');
        return;
    }
    
    try {
        const opt = {
            margin: 10,
            filename: `reporte_compras_${new Date().toISOString().slice(0,10)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
        };
        
        html2pdf().set(opt).from(element).save();
        console.log('✅ PDF de compras generado correctamente');
    } catch (error) {
        console.error('Error generando PDF:', error);
        alert('❌ Error al generar el PDF: ' + error.message);
    }
};

window.exportarComprasACSV = function() {
    const element = document.getElementById('tabla-compras-export');
    if (!element) {
        alert('❌ No hay datos para exportar');
        return;
    }
    
    try {
        const tabla = element.querySelector('table');
        if (!tabla) {
            alert('❌ No se encontró la tabla de compras');
            return;
        }
        
        let csv = 'Compra #,Fecha,Proveedor,Total,Estado\n';
        const filas = tabla.querySelectorAll('tbody tr');
        
        filas.forEach(fila => {
            const celdas = fila.querySelectorAll('td');
            const compra = (celdas[0]?.textContent || '').trim();
            const fecha = (celdas[1]?.textContent || '').trim();
            const proveedor = (celdas[2]?.textContent || '').trim();
            const total = (celdas[3]?.textContent || '').trim();
            const estado = (celdas[4]?.textContent || '').trim();
            
            csv += `"${compra}","${fecha}","${proveedor}","${total}","${estado}"\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `reporte_compras_${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log('✅ CSV de compras generado correctamente');
    } catch (error) {
        console.error('Error generando CSV:', error);
        alert('❌ Error al generar el CSV: ' + error.message);
    }
};

// ==================== REPORTE DE VENTAS ====================
async function cargarVentasReporte(busqueda = '') {
    const lista = document.getElementById('reporteVentas');
    if (!lista) {
        console.warn('Contenedor reporteVentas no encontrado');
        return;
    }
    
    lista.innerHTML = '<div class="item" style="padding:20px;text-align:center;">⏳ Cargando ventas...</div>';
    
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const res = await fetch(`/api/admin/ventas?year=${year}&month=${month}`, { credentials: 'include' });
        
        if (!res.ok) {
            if (res.status === 401) {
                lista.innerHTML = '<div class="item" style="padding:20px;text-align:center;color:#dc2626;">🔒 No autenticado. Por favor inicie sesión en el sistema.</div>';
                return;
            }
            throw new Error(`Error HTTP: ${res.status}`);
        }
        
        const data = await res.json();

        if (!data || !data.ventas || !Array.isArray(data.ventas) || data.ventas.length === 0) {
            lista.innerHTML = '<div class="item" style="padding:20px;text-align:center;color:#999;">📭 No hay ventas registradas para el período seleccionado.</div>';
            return;
        }

        let ventas = data.ventas || [];
        if (busqueda && busqueda.trim()) {
            const b = busqueda.toLowerCase();
            ventas = ventas.filter(v => 
                (v.cliente || '').toLowerCase().includes(b) || 
                (v.usuario || '').toLowerCase().includes(b) || 
                String(v.id_venta).includes(b)
            );
        }

        if (ventas.length === 0 && busqueda) {
            lista.innerHTML = '<div class="item" style="padding:20px;text-align:center;color:#999;">❌ No se encontraron ventas que coincidan con la búsqueda.</div>';
            return;
        }

        let totalVentas = 0;
        let html = `<div id="tabla-ventas-export" style="padding:20px;background:white;border-radius:8px;">
            <h3 style="text-align:center;margin-bottom:10px;color:#333;font-size:1.3em;">💰 Reporte de Ventas</h3>
            <p style="text-align:center;color:#666;margin-bottom:20px;font-size:0.9em;">Período: ${new Date(year, month-1).toLocaleDateString('es-VE', {month:'long', year:'numeric'})}</p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                <thead>
                    <tr style="background:#10b981;color:white;">
                        <th style="padding:12px;text-align:left;border:1px solid #059669;">Venta #</th>
                        <th style="padding:12px;text-align:left;border:1px solid #059669;">Cliente</th>
                        <th style="padding:12px;text-align:left;border:1px solid #059669;">Fecha</th>
                        <th style="padding:12px;text-align:right;border:1px solid #059669;">Total</th>
                        <th style="padding:12px;text-align:left;border:1px solid #059669;">Pago</th>
                    </tr>
                </thead>
                <tbody>`;

        ventas.forEach((v, idx) => {
            const total = parseFloat(v.total_venta || 0);
            totalVentas += total;
            const bgColor = idx % 2 === 0 ? '#f0fdf4' : '#ffffff';
            html += `<tr style="background:${bgColor};">
                <td style="padding:12px;border:1px solid #dcfce7;"><strong>#${v.id_venta}</strong></td>
                <td style="padding:12px;border:1px solid #dcfce7;">${v.cliente || 'Cliente General'}</td>
                <td style="padding:12px;border:1px solid #dcfce7;">${new Date(v.fecha_hora).toLocaleDateString('es-VE')}</td>
                <td style="padding:12px;text-align:right;border:1px solid #dcfce7;font-weight:bold;">$${total.toFixed(2)}</td>
                <td style="padding:12px;border:1px solid #dcfce7;">${v.tipo_pago || 'N/A'}</td>
            </tr>`;
        });

        html += `</tbody></table>
            <div style="border-top:2px solid #dcfce7;padding-top:15px;text-align:right;">
                <p style="margin:0;color:#666;font-size:0.9em;"><strong>Total de ventas:</strong> $${totalVentas.toFixed(2)}</p>
                <p style="margin:5px 0 0 0;color:#999;font-size:0.8em;">Número de ventas: ${ventas.length}</p>
            </div>
        </div>`;

        lista.innerHTML = html;
        
        // Agregar botones de exportación
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'margin-top:20px;display:flex;gap:10px;';
        btnContainer.innerHTML = `
            <button onclick="exportarVentasAPDF()" class="btn btn-primary" style="background:#10b981;color:white;padding:12px 24px;border:none;border-radius:6px;cursor:pointer;font-weight:500;font-size:1em;">
                📥 Exportar a PDF
            </button>
            <button onclick="exportarVentasACSV()" class="btn btn-secondary" style="background:#6b7280;color:white;padding:12px 24px;border:none;border-radius:6px;cursor:pointer;font-weight:500;font-size:1em;">
                📊 Exportar a CSV
            </button>
        `;
        lista.appendChild(btnContainer);

    } catch (error) {
        console.error('Error cargando ventas:', error);
        lista.innerHTML = `<div class="item" style="padding:20px;text-align:center;color:#dc2626;">
            ❌ Error al cargar ventas: ${error.message}
        </div>`;
    }
}

window.exportarVentasAPDF = function() {
    const element = document.getElementById('tabla-ventas-export');
    if (!element) {
        alert('❌ No hay datos para exportar');
        return;
    }
    
    try {
        const opt = {
            margin: 10,
            filename: `reporte_ventas_${new Date().toISOString().slice(0,10)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
        };
        
        html2pdf().set(opt).from(element).save();
        console.log('✅ PDF de ventas generado correctamente');
    } catch (error) {
        console.error('Error generando PDF:', error);
        alert('❌ Error al generar el PDF: ' + error.message);
    }
};

window.exportarVentasACSV = function() {
    const element = document.getElementById('tabla-ventas-export');
    if (!element) {
        alert('❌ No hay datos para exportar');
        return;
    }
    
    try {
        const tabla = element.querySelector('table');
        if (!tabla) {
            alert('❌ No se encontró la tabla de ventas');
            return;
        }
        
        let csv = 'Venta #,Cliente,Fecha,Total,Pago\n';
        const filas = tabla.querySelectorAll('tbody tr');
        
        filas.forEach(fila => {
            const celdas = fila.querySelectorAll('td');
            const venta = (celdas[0]?.textContent || '').trim();
            const cliente = (celdas[1]?.textContent || '').trim();
            const fecha = (celdas[2]?.textContent || '').trim();
            const total = (celdas[3]?.textContent || '').trim();
            const pago = (celdas[4]?.textContent || '').trim();
            
            csv += `"${venta}","${cliente}","${fecha}","${total}","${pago}"\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `reporte_ventas_${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log('✅ CSV de ventas generado correctamente');
    } catch (error) {
        console.error('Error generando CSV:', error);
        alert('❌ Error al generar el CSV: ' + error.message);
    }
};

// ==================== REPORTE DE CLIENTES ====================
async function cargarClientes(busqueda = '') {
    // Buscar el contenedor correcto
    const lista = document.getElementById('reporteClientes');
    if (!lista) {
        console.warn('Contenedor reporteClientes no encontrado');
        return;
    }
    
    // Mostrar estado de carga
    lista.innerHTML = '<div class="item" style="padding:20px;text-align:center;">⏳ Cargando clientes...</div>';
    
    try {
        const res = await fetch('/api/admin/clientes', { credentials: 'include' });
        
        if (!res.ok) {
            if (res.status === 401) {
                lista.innerHTML = '<div class="item" style="padding:20px;text-align:center;color:#dc2626;">🔒 No autenticado. Por favor inicie sesión en el sistema.</div>';
                return;
            }
            throw new Error(`Error HTTP: ${res.status}`);
        }
        
        const data = await res.json();
        
        // Verificar que tenemos datos válidos
        if (!data || !data.clientes || data.clientes.length === 0) {
            lista.innerHTML = '<div class="item" style="padding:20px;text-align:center;color:#999;">📭 No hay clientes registrados.</div>';
            return;
        }
        
        let clientes = data.clientes;
        
        // Aplicar búsqueda si existe
        if (busqueda && busqueda.trim()) {
            const b = busqueda.toLowerCase();
            clientes = clientes.filter(c => 
                (c.nombre || '').toLowerCase().includes(b) ||
                (c.cedula || '').includes(b) ||
                (c.email || '').toLowerCase().includes(b) ||
                (c.telefono || '').includes(b)
            );
        }

        if (clientes.length === 0 && busqueda) {
            lista.innerHTML = '<div class="item" style="padding:20px;text-align:center;color:#999;">❌ No se encontraron clientes que coincidan con la búsqueda.</div>';
            return;
        }

        // Construir HTML
        let html = `<div id="tabla-clientes-export" style="padding:20px;background:white;border-radius:8px;">
            <h3 style="text-align:center;margin-bottom:10px;color:#333;font-size:1.3em;">📋 Reporte de Clientes</h3>
            <p style="text-align:center;color:#666;margin-bottom:20px;font-size:0.9em;">Generado: ${new Date().toLocaleDateString('es-VE', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}</p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                <thead>
                    <tr style="background:#3b82f6;color:white;">
                        <th style="padding:12px;text-align:left;border:1px solid #2563eb;">Nombre</th>
                        <th style="padding:12px;text-align:left;border:1px solid #2563eb;">Cédula</th>
                        <th style="padding:12px;text-align:left;border:1px solid #2563eb;">Email</th>
                        <th style="padding:12px;text-align:left;border:1px solid #2563eb;">Teléfono</th>
                    </tr>
                </thead>
                <tbody>`;

        // Agregar filas de clientes
        clientes.forEach((c, idx) => {
            const bgColor = idx % 2 === 0 ? '#f9fafb' : '#ffffff';
            html += `<tr style="background:${bgColor};">
                <td style="padding:12px;border:1px solid #e5e7eb;"><strong>${(c.nombre || 'N/A').toUpperCase()}</strong></td>
                <td style="padding:12px;border:1px solid #e5e7eb;">${c.cedula || 'N/A'}</td>
                <td style="padding:12px;border:1px solid #e5e7eb;">${c.email || 'N/A'}</td>
                <td style="padding:12px;border:1px solid #e5e7eb;">${c.telefono || 'N/A'}</td>
            </tr>`;
        });

        html += `</tbody>
            </table>
            <div style="border-top:2px solid #e5e7eb;padding-top:15px;text-align:right;">
                <p style="margin:0;color:#666;font-size:0.9em;"><strong>Total de clientes:</strong> ${clientes.length}</p>
            </div>
        </div>`;

        // Mostrar tabla
        lista.innerHTML = html;
        
        // Agregar botón de exportación después
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'margin-top:20px;display:flex;gap:10px;';
        btnContainer.innerHTML = `
            <button onclick="exportarClientesAPDF()" class="btn btn-primary" style="background:#3b82f6;color:white;padding:12px 24px;border:none;border-radius:6px;cursor:pointer;font-weight:500;font-size:1em;">
                📥 Exportar a PDF
            </button>
            <button onclick="exportarClientesACSV()" class="btn btn-secondary" style="background:#6b7280;color:white;padding:12px 24px;border:none;border-radius:6px;cursor:pointer;font-weight:500;font-size:1em;">
                📊 Exportar a CSV
            </button>
        `;
        lista.appendChild(btnContainer);

        // Agregar botón para ver Top Clientes
        const topBtn = document.createElement('button');
        topBtn.textContent = '🏆 Ver Top Clientes';
        topBtn.className = 'btn btn-tertiary';
        topBtn.style.cssText = 'margin-left:10px;background:#111827;color:white;padding:8px 12px;border:none;border-radius:6px;cursor:pointer;font-weight:500;';
        topBtn.onclick = () => cargarTopClientes(10);
        lista.appendChild(topBtn);

    } catch (error) {
        console.error('Error cargando clientes:', error);
        lista.innerHTML = `<div class="item" style="padding:20px;text-align:center;color:#dc2626;">
            ❌ Error al cargar clientes: ${error.message}
        </div>`;
    }
}

// ==================== REPORTE TOP CLIENTES ====================
async function cargarTopClientes(top = 10) {
    const cont = document.getElementById('reporteClientes');
    if (!cont) {
        console.warn('Contenedor reporteClientes no encontrado');
        return;
    }
    cont.innerHTML = '<div class="item" style="padding:20px;text-align:center;">⏳ Cargando Top clientes...</div>';
    try {
        const res = await fetch(`/api/reportes/top-clientes?top=${encodeURIComponent(top)}`);
        if (!res.ok) {
            if (res.status === 401) {
                cont.innerHTML = '<div class="item" style="padding:20px;text-align:center;color:#dc2626;">🔒 No autenticado. Por favor inicie sesión en el sistema.</div>';
                return;
            }
            throw new Error(`Error HTTP: ${res.status}`);
        }
        const data = await res.json();
        if (!data || !data.clientes || !Array.isArray(data.clientes) || data.clientes.length === 0) {
            cont.innerHTML = '<div class="item" style="padding:20px;text-align:center;color:#999;">📭 No hay clientes para mostrar.</div>';
            return;
        }

        let html = `<div id="tabla-top-clientes-export" style="padding:20px;background:white;border-radius:8px;">
            <h3 style="text-align:center;margin-bottom:10px;color:#333;font-size:1.3em;">🏆 Top Clientes</h3>
            <p style="text-align:center;color:#666;margin-bottom:20px;font-size:0.9em;">Top ${data.clientes.length} por gasto total</p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                <thead>
                    <tr style="background:#f97316;color:white;">
                        <th style="padding:12px;text-align:left;border:1px solid #c2410c;">#</th>
                        <th style="padding:12px;text-align:left;border:1px solid #c2410c;">Cliente</th>
                        <th style="padding:12px;text-align:left;border:1px solid #c2410c;">Cédula</th>
                        <th style="padding:12px;text-align:right;border:1px solid #c2410c;">Transacciones</th>
                        <th style="padding:12px;text-align:right;border:1px solid #c2410c;">Total Gastado</th>
                        <th style="padding:12px;text-align:left;border:1px solid #c2410c;">Última compra</th>
                    </tr>
                </thead>
                <tbody>`;

        data.clientes.forEach((c, idx) => {
            const total = parseFloat(c.total_gastado || 0);
            const bgColor = idx % 2 === 0 ? '#fff7ed' : '#ffffff';
            html += `<tr style="background:${bgColor};">
                <td style="padding:12px;border:1px solid #fee7d6;"><strong>${idx + 1}</strong></td>
                <td style="padding:12px;border:1px solid #fee7d6;">${c.nombre || 'N/A'}</td>
                <td style="padding:12px;border:1px solid #fee7d6;">${c.cedula || 'N/A'}</td>
                <td style="padding:12px;text-align:right;border:1px solid #fee7d6;">${c.ventas_count || 0}</td>
                <td style="padding:12px;text-align:right;border:1px solid #fee7d6;font-weight:bold;color:#b45309;">$${total.toFixed(2)}</td>
                <td style="padding:12px;border:1px solid #fee7d6;">${c.ultima_compra ? new Date(c.ultima_compra).toLocaleDateString('es-VE') : '—'}</td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
        cont.innerHTML = html;

        // Agregar botón para volver a la lista completa
        const volver = document.createElement('button');
        volver.textContent = '⬅️ Volver a Clientes';
        volver.className = 'btn btn-secondary';
        volver.style.cssText = 'margin-top:8px;background:#6b7280;color:white;padding:8px 12px;border:none;border-radius:6px;cursor:pointer;font-weight:500;';
        volver.onclick = () => cargarClientes();
        cont.appendChild(volver);

    } catch (e) {
        console.error('Error cargando Top clientes:', e);
        cont.innerHTML = `<div class="item" style="padding:20px;text-align:center;color:#dc2626;">❌ Error al cargar Top clientes: ${e.message}</div>`;
    }
}


window.exportarClientesAPDF = function() {
    const element = document.getElementById('tabla-clientes-export');
    if (!element) {
        alert('❌ No hay datos para exportar');
        return;
    }
    
    try {
        const opt = {
            margin: 10,
            filename: `reporte_clientes_${new Date().toISOString().slice(0,10)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
        };
        
        html2pdf().set(opt).from(element).save();
        console.log('✅ PDF generado correctamente');
    } catch (error) {
        console.error('Error generando PDF:', error);
        alert('❌ Error al generar el PDF: ' + error.message);
    }
};

window.exportarClientesACSV = function() {
    const element = document.getElementById('tabla-clientes-export');
    if (!element) {
        alert('❌ No hay datos para exportar');
        return;
    }
    
    try {
        const tabla = element.querySelector('table');
        if (!tabla) {
            alert('❌ No se encontró la tabla de clientes');
            return;
        }
        
        let csv = 'Nombre,Cédula,Email,Teléfono\n';
        const filas = tabla.querySelectorAll('tbody tr');
        
        filas.forEach(fila => {
            const celdas = fila.querySelectorAll('td');
            const nombre = (celdas[0]?.textContent || '').trim();
            const cedula = (celdas[1]?.textContent || '').trim();
            const email = (celdas[2]?.textContent || '').trim();
            const telefono = (celdas[3]?.textContent || '').trim();
            
            csv += `"${nombre}","${cedula}","${email}","${telefono}"\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `reporte_clientes_${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log('✅ CSV generado correctamente');
    } catch (error) {
        console.error('Error generando CSV:', error);
        alert('❌ Error al generar el CSV: ' + error.message);
    }
};

// ==================== REPORTE DE UTILIDAD ====================
async function cargarReporteUtilidad() {
    const cont = document.getElementById('tablaReporteUtilidad');
    if (!cont) {
        console.warn('Contenedor tablaReporteUtilidad no encontrado');
        return;
    }
    
    cont.innerHTML = '<div class="item" style="padding:20px;text-align:center;">⏳ Cargando reporte de utilidad...</div>';
    
    try {
        const res = await fetch('/api/reportes/utilidad-productos', { credentials: 'include' });
        
        if (!res.ok) {
            if (res.status === 401) {
                cont.innerHTML = '<div class="item" style="padding:20px;text-align:center;color:#dc2626;">🔒 No autenticado. Por favor inicie sesión en el sistema.</div>';
                return;
            }
            throw new Error(`Error HTTP: ${res.status}`);
        }
        
        const data = await res.json();
        
        if (!data || !data.utilidad || !Array.isArray(data.utilidad) || data.utilidad.length === 0) {
            cont.innerHTML = '<div class="item" style="padding:20px;text-align:center;color:#999;">📭 No hay datos de utilidad disponibles.</div>';
            return;
        }

        let html = `<div id="tabla-utilidad-export" style="padding:20px;background:white;border-radius:8px;">
            <h3 style="text-align:center;margin-bottom:10px;color:#333;font-size:1.3em;">💵 Reporte de Utilidad por Producto</h3>
            <p style="text-align:center;color:#666;margin-bottom:20px;font-size:0.9em;">Generado: ${new Date().toLocaleDateString('es-VE', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}</p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;overflow-x:auto;display:block;">
                <thead>
                    <tr style="background:#8b5cf6;color:white;">
                        <th style="padding:12px;text-align:left;border:1px solid #7c3aed;min-width:150px;">Producto</th>
                        <th style="padding:12px;text-align:right;border:1px solid #7c3aed;">Costo</th>
                        <th style="padding:12px;text-align:right;border:1px solid #7c3aed;">Precio Venta</th>
                        <th style="padding:12px;text-align:right;border:1px solid #7c3aed;">Utilidad Unit.</th>
                        <th style="padding:12px;text-align:right;border:1px solid #7c3aed;">Unidades</th>
                        <th style="padding:12px;text-align:right;border:1px solid #7c3aed;">Utilidad Total</th>
                        <th style="padding:12px;text-align:right;border:1px solid #7c3aed;">Margen %</th>
                    </tr>
                </thead>
                <tbody>`;

        let totalUtilidad = 0;
        data.utilidad.forEach((prod, idx) => {
            const utilTotal = parseFloat(prod.utilidad_total || 0);
            totalUtilidad += utilTotal;
            const bgColor = idx % 2 === 0 ? '#faf5ff' : '#ffffff';
            html += `<tr style="background:${bgColor};">
                <td style="padding:12px;border:1px solid #e9d5ff;"><strong>${(prod.nombre || 'N/A').toUpperCase()}</strong></td>
                <td style="padding:12px;text-align:right;border:1px solid #e9d5ff;">$${parseFloat(prod.costo_promedio || 0).toFixed(2)}</td>
                <td style="padding:12px;text-align:right;border:1px solid #e9d5ff;">$${parseFloat(prod.precio_venta || 0).toFixed(2)}</td>
                <td style="padding:12px;text-align:right;border:1px solid #e9d5ff;">$${parseFloat(prod.utilidad_unitaria || 0).toFixed(2)}</td>
                <td style="padding:12px;text-align:right;border:1px solid #e9d5ff;"><strong>${prod.unidades_vendidas || 0}</strong></td>
                <td style="padding:12px;text-align:right;border:1px solid #e9d5ff;font-weight:bold;color:#7c3aed;">$${utilTotal.toFixed(2)}</td>
                <td style="padding:12px;text-align:right;border:1px solid #e9d5ff;font-weight:bold;">${parseFloat(prod.margen_porcentaje || 0).toFixed(1)}%</td>
            </tr>`;
        });

        html += `</tbody></table>
            <div style="border-top:2px solid #e9d5ff;padding-top:15px;text-align:right;">
                <p style="margin:0;color:#666;font-size:0.9em;"><strong>Utilidad Total:</strong> <span style="color:#7c3aed;font-weight:bold;font-size:1.1em;">$${totalUtilidad.toFixed(2)}</span></p>
                <p style="margin:5px 0 0 0;color:#999;font-size:0.8em;">Número de productos: ${data.utilidad.length}</p>
            </div>
        </div>`;

        cont.innerHTML = html;
        
        // Agregar botones de exportación
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'margin-top:20px;display:flex;gap:10px;';
        btnContainer.innerHTML = `
            <button onclick="exportarUtilidadAPDF()" class="btn btn-primary" style="background:#8b5cf6;color:white;padding:12px 24px;border:none;border-radius:6px;cursor:pointer;font-weight:500;font-size:1em;">
                📥 Exportar a PDF
            </button>
            <button onclick="exportarUtilidadACSV()" class="btn btn-secondary" style="background:#6b7280;color:white;padding:12px 24px;border:none;border-radius:6px;cursor:pointer;font-weight:500;font-size:1em;">
                📊 Exportar a CSV
            </button>
        `;
        cont.appendChild(btnContainer);

        // Actualizar tabla en tbody si existe (para compatibilidad)
        const tbody = document.getElementById('tbodyReporteUtilidad');
        if (tbody) {
            tbody.innerHTML = data.utilidad.map(prod => `
                <tr>
                    <td style="padding:12px;">${prod.nombre}</td>
                    <td style="padding:12px;text-align:right;">$${parseFloat(prod.costo_promedio || 0).toFixed(2)}</td>
                    <td style="padding:12px;text-align:right;">$${parseFloat(prod.precio_venta || 0).toFixed(2)}</td>
                    <td style="padding:12px;text-align:right;">$${parseFloat(prod.utilidad_unitaria || 0).toFixed(2)}</td>
                    <td style="padding:12px;text-align:right;">${prod.unidades_vendidas || 0}</td>
                    <td style="padding:12px;text-align:right;">$${parseFloat(prod.utilidad_total || 0).toFixed(2)}</td>
                    <td style="padding:12px;text-align:right;">${parseFloat(prod.margen_porcentaje || 0).toFixed(1)}%</td>
                </tr>
            `).join('');
        }

    } catch (error) {
        console.error('Error cargando reporte de utilidad:', error);
        const cont = document.getElementById('tablaReporteUtilidad') || document.getElementById('reporteUtilidad');
        if (cont) {
            cont.innerHTML = `<div class="item" style="padding:20px;text-align:center;color:#dc2626;">
                ❌ Error al cargar reporte: ${error.message}
            </div>`;
        }
    }
}

window.exportarUtilidadAPDF = function() {
    const element = document.getElementById('tabla-utilidad-export');
    if (!element) {
        alert('❌ No hay datos para exportar');
        return;
    }
    
    try {
        const opt = {
            margin: 10,
            filename: `reporte_utilidad_${new Date().toISOString().slice(0,10)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4' }
        };
        
        html2pdf().set(opt).from(element).save();
        console.log('✅ PDF de utilidad generado correctamente');
    } catch (error) {
        console.error('Error generando PDF:', error);
        alert('❌ Error al generar el PDF: ' + error.message);
    }
};

window.exportarUtilidadACSV = function() {
    const element = document.getElementById('tabla-utilidad-export');
    if (!element) {
        alert('❌ No hay datos para exportar');
        return;
    }
    
    try {
        const tabla = element.querySelector('table');
        if (!tabla) {
            alert('❌ No se encontró la tabla de utilidad');
            return;
        }
        
        let csv = 'Producto,Costo,Precio Venta,Utilidad Unit.,Unidades,Utilidad Total,Margen %\n';
        const filas = tabla.querySelectorAll('tbody tr');
        
        filas.forEach(fila => {
            const celdas = fila.querySelectorAll('td');
            const producto = (celdas[0]?.textContent || '').trim();
            const costo = (celdas[1]?.textContent || '').trim();
            const precio = (celdas[2]?.textContent || '').trim();
            const utilUnit = (celdas[3]?.textContent || '').trim();
            const unidades = (celdas[4]?.textContent || '').trim();
            const utilTotal = (celdas[5]?.textContent || '').trim();
            const margen = (celdas[6]?.textContent || '').trim();
            
            csv += `"${producto}","${costo}","${precio}","${utilUnit}","${unidades}","${utilTotal}","${margen}"\n`;
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
        console.log('✅ CSV de utilidad generado correctamente');
    } catch (error) {
        console.error('Error generando CSV:', error);
        alert('❌ Error al generar el CSV: ' + error.message);
    }
};


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
                if (typeof cargarVentasReporte === 'function') cargarVentasReporte();
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
        const res = await fetch('/api/reportes/inventario-actual', { credentials: 'include' });
        const data = await res.json();
        if (!data || !data.rows || !Array.isArray(data.rows) || data.rows.length === 0) {
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
        const res = await fetch('/api/admin/ventas', { credentials: 'include' });
        const data = await res.json();
        if (!data || !data.ventas || !Array.isArray(data.ventas) || data.ventas.length === 0) {
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
        const res = await fetch('/api/reportes/rotacion-inventario?top=100', { credentials: 'include' });
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