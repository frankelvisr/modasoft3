/*
  devoluciones.js
  Funcionalidades para el módulo de devoluciones en caja
*/

document.addEventListener('DOMContentLoaded', function() {
    const formAcceso = document.getElementById('form-acceso-devoluciones');
    const panelDevoluciones = document.getElementById('panelDevoluciones');
    const btnBuscarVenta = document.getElementById('btnBuscarVentaDevolucion');
    
    if (formAcceso) {
        formAcceso.addEventListener('submit', async function(e) {
            e.preventDefault();
            const clave = document.getElementById('claveDevoluciones').value;
            
            try {
                const res = await fetch('/api/devoluciones/validar-clave', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clave })
                });
                
                const data = await res.json();
                if (data.ok) {
                    panelDevoluciones.style.display = 'block';
                    formAcceso.reset();
                } else {
                    alert('Clave incorrecta');
                }
            } catch (error) {
                alert('Error de conexión');
            }
        });
    }

    if (btnBuscarVenta) {
        btnBuscarVenta.addEventListener('click', buscarVentasCliente);
    }
});

async function buscarVentasCliente() {
    const cedula = document.getElementById('devolucionCedula').value.trim();
    if (!cedula) {
        alert('Ingrese la cédula del cliente');
        return;
    }

    try {
        const res = await fetch(`/api/devoluciones/ventas-cliente?cedula=${encodeURIComponent(cedula)}`);
        const data = await res.json();
        const contenedor = document.getElementById('ventasClienteDevolucion');
        
        if (data.ok && data.ventas && data.ventas.length > 0) {
            contenedor.innerHTML = data.ventas.map(venta => `
                <div class="item">
                    <div>
                        <strong>Venta #${venta.id_venta}</strong><br>
                        Fecha: ${venta.fecha_hora}<br>
                        Total: $${venta.total_venta}<br>
                        Productos:
                        <ul style="margin-top:8px;">
                            ${venta.detalles.map(det => {
                                const disponible = Number(det.disponible || 0);
                                const badge = disponible > 0 ? `<span style='color:#2e7d32;font-weight:600;margin-left:6px;'>(Disp.: ${disponible})</span>` : `<span style='color:#b71c1c;font-weight:600;margin-left:6px;'>(Sin disp.)</span>`;
                                const btn = disponible > 0 ? `<button class="btn btn-small" onclick="procesarDevolucion(${det.id_detalle}, ${disponible})" style="margin-left:10px;">Devolver</button>` : '';
                                return `<li>${det.nombre_producto} - Talla: ${det.nombre_talla} - Cantidad vendida: ${det.cantidad} ${badge} - Precio neto: $${Number(det.precio_neto || det.precio_unitario).toFixed(2)} ${btn}</li>`;
                            }).join('')}
                        </ul>
                    </div>
                </div>
            `).join('');
        } else {
            contenedor.innerHTML = '<div class="item">No se encontraron ventas para este cliente</div>';
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error al buscar ventas');
    }
}

window.procesarDevolucion = async function(idDetalle, cantidadMax) {
    const cantidad = prompt(`Ingrese la cantidad a devolver (máximo: ${cantidadMax}):`, cantidadMax);
    if (!cantidad || isNaN(cantidad) || parseInt(cantidad) < 1 || parseInt(cantidad) > cantidadMax) {
        alert('Cantidad inválida');
        return;
    }

    try {
        const res = await fetch('/api/devoluciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_detalle: idDetalle,
                cantidad: parseInt(cantidad)
            })
        });

        const data = await res.json();
        if (data.ok) {
            alert(`Devolución procesada. Reembolso: $${Number(data.monto_reembolsado || 0).toFixed(2)}. Inventario actualizado y venta ajustada.`);
            buscarVentasCliente(); // Recargar ventas
        } else {
            alert('Error: ' + (data.error || ''));
        }
    } catch (error) {
        alert('Error de conexión');
    }
};

