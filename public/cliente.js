document.addEventListener('DOMContentLoaded', () => {
    // --- Mostrar tallas dinámicas en registro de producto ---
    const tallasDinamicasDiv = document.getElementById('tallas-dinamicas');
    window.mostrarTallasDinamicas = async function mostrarTallasDinamicas() {
        if (!tallasDinamicasDiv) return;
        try {
            const res = await fetch('/api/tallas');
            const data = await res.json();
            tallasDinamicasDiv.innerHTML = '';
            data.tallas.forEach(talla => {
                const label = document.createElement('label');
                label.style.marginRight = '10px';
                label.innerHTML = `<b>${talla.nombre}</b> <input type='number' min='0' value='0' style='width:60px;' name='cantidad_talla_${talla.id_talla}' data-id-talla='${talla.id_talla}'>`;
                tallasDinamicasDiv.appendChild(label);
            });
        } catch {}
    }
    mostrarTallasDinamicas();
    // --- ADMINISTRADOR: Gestión de Tallas ---
    const formTalla = document.getElementById('form-talla');
    const catalogoTallas = document.getElementById('catalogoTallas');
    let todasLasTallas = [];
    
    window.cargarTallas = async function cargarTallas() {
        try {
            const res = await fetch('/api/tallas');
            const data = await res.json();
            todasLasTallas = data.tallas || [];
            if (catalogoTallas) {
                renderTallas(todasLasTallas);
            }
        } catch { 
            if (catalogoTallas) {
                catalogoTallas.innerHTML = '<div class="item">Error al cargar tallas.</div>';
            }
        }
    }
    
    function renderTallas(tallas) {
        if (!catalogoTallas) return;
        catalogoTallas.innerHTML = '';
        if (tallas.length === 0) {
            catalogoTallas.innerHTML = '<div class="item">No hay tallas registradas.</div>';
            return;
        }
        tallas.forEach(talla => {
            const div = document.createElement('div');
            div.className = 'item';
            div.dataset.id = talla.id_talla;
            div.dataset.ajuste = talla.ajuste || '';
            div.dataset.pecho = talla.pecho || '';
            div.dataset.cintura = talla.cintura || '';
            div.dataset.cadera = talla.cadera || '';
            div.dataset.largo = talla.largo || '';
            div.innerHTML = `
                <span><b>${talla.nombre}</b> | Ajuste: ${talla.ajuste || '-'} | Pecho: ${talla.pecho || '-'} | Cintura: ${talla.cintura || '-'} | Cadera: ${talla.cadera || '-'} | Largo: ${talla.largo || '-'}</span>
                <div class="actions">
                    <button class='btn btn-small' onclick='editarTalla(${talla.id_talla}, ${JSON.stringify(talla)})'>Editar</button>
                    <button class='btn btn-small secondary' onclick='mostrarConfirmacion(${talla.id_talla}, "tallas", "${talla.nombre}")'>Eliminar</button>
                </div>`;
            catalogoTallas.appendChild(div);
        });
    }
    
    // Búsqueda de tallas
    const buscarTalla = document.getElementById('buscarTalla');
    if (buscarTalla) {
        buscarTalla.addEventListener('input', function() {
            const busqueda = this.value.toLowerCase().trim();
            if (busqueda === '') {
                renderTallas(todasLasTallas);
            } else {
                const filtradas = todasLasTallas.filter(talla => 
                    (talla.nombre && talla.nombre.toLowerCase().includes(busqueda)) ||
                    (talla.ajuste && talla.ajuste.toLowerCase().includes(busqueda))
                );
                renderTallas(filtradas);
            }
        });
    }
    if (formTalla) {
        formTalla.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombre = document.getElementById('tallaNombre').value.trim();
            const ajuste = document.getElementById('tallaAjuste').value;
            const pecho = parseInt(document.getElementById('tallaPecho').value) || null;
            const cintura = parseInt(document.getElementById('tallaCintura').value) || null;
            const cadera = parseInt(document.getElementById('tallaCadera').value) || null;
            const largo = parseInt(document.getElementById('tallaLargo').value) || null;
            if (!nombre || !ajuste) return;
            try {
                const res = await fetch('/api/tallas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nombre, ajuste, pecho, cintura, cadera, largo })
                });
                const data = await res.json();
                if (data.ok) {
                    formTalla.reset();
                    cargarTallas();
                } else {
                    alert('Error al crear talla');
                }
            } catch (err) { alert('Error de conexión'); }
        });
        cargarTallas();
    }
    window.eliminarTalla = async function(id) {
        if (!confirm('¿Seguro que deseas eliminar esta talla?')) return;
        try {
            const res = await fetch(`/api/tallas/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.ok) {
                cargarTallas();
            } else {
                alert('Error al eliminar talla');
            }
        } catch { alert('Error de conexión'); }
    };
    // Funciones para cargar opciones en el modal de edición
    async function cargarOpcionesEdicionCategoria(selectedId) {
        const select = document.getElementById('editCategoria');
        if (!select) return;
        try {
            const res = await fetch('/api/categorias');
            const data = await res.json();
            select.innerHTML = '';
            data.categorias.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id_categoria;
                opt.textContent = cat.nombre;
                if (cat.id_categoria == selectedId) opt.selected = true;
                select.appendChild(opt);
            });
        } catch {}
    }
    async function cargarOpcionesEdicionProveedor(selectedId) {
        const select = document.getElementById('editProveedor');
        if (!select) return;
        try {
            const res = await fetch('/api/proveedores');
            const data = await res.json();
            select.innerHTML = '';
            data.proveedores.forEach(prov => {
                const opt = document.createElement('option');
                opt.value = prov.id_proveedor;
                opt.textContent = prov.nombre;
                if (prov.id_proveedor == selectedId) opt.selected = true;
                select.appendChild(opt);
            });
        } catch {}
    }
    // --- Modal de edición de producto ---
    const modalEditar = document.getElementById('modalEditarProducto');
    const formEditar = document.getElementById('formEditarProducto');
    const btnCerrarModal = document.getElementById('btnCerrarModal');
    async function mostrarModalEditar(prod) {
        document.getElementById('editIdProducto').value = prod.id_producto;
        document.getElementById('editMarca').value = prod.marca || '';
        document.getElementById('editNombre').value = prod.nombre;
        // Inicializar en 0 para que el usuario ingrese la cantidad adicional que quiere sumar
        document.getElementById('editInventario').value = '';
        document.getElementById('editInventario').placeholder = '0'; // Cantidad adicional a sumar
        document.getElementById('editPrecio').value = prod.precio_venta;
        
        // Mostrar el inventario actual como referencia
        const inventarioActual = prod.inventario || 0;
        const editInventarioLabel = document.querySelector('label[for="editInventario"]') || 
                                     document.querySelector('label:has(input#editInventario)');
        if (editInventarioLabel) {
            editInventarioLabel.innerHTML = `Cantidad adicional (sumar al total): <span style="color:#666;font-size:0.9em;">(Stock actual: ${inventarioActual})</span><input type="number" id="editInventario" class="input" min="0" value="" placeholder="0">`;
        }
        
        await cargarOpcionesEdicionCategoria(prod.id_categoria);
        await cargarOpcionesEdicionProveedor(prod.id_proveedor);
        
        // Cargar tallas del producto para edición
        await cargarTallasParaEdicion(prod.tallas || []);
        
        modalEditar.style.display = 'flex';
    }
    
    // Función para cargar tallas en el modal de edición
    async function cargarTallasParaEdicion(tallasProducto) {
        const editTallasDiv = document.getElementById('editTallasDinamicas');
        if (!editTallasDiv) return;
        
        try {
            // Obtener todas las tallas disponibles
            const res = await fetch('/api/tallas');
            const data = await res.json();
            const todasLasTallas = data.tallas || [];
            
            editTallasDiv.innerHTML = '';
            
            todasLasTallas.forEach(talla => {
                // Buscar si esta talla ya tiene cantidad en el producto
                const tallaProducto = tallasProducto.find(tp => Number(tp.id_talla) === Number(talla.id_talla));
                const cantidadActual = tallaProducto ? Number(tallaProducto.cantidad) : 0;
                
                const label = document.createElement('label');
                label.style.display = 'block';
                label.style.marginBottom = '10px';
                label.style.padding = '8px';
                label.style.background = cantidadActual > 0 ? '#e8f5e9' : '#f5f5f5';
                label.style.borderRadius = '4px';
                label.innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <strong>${talla.nombre}</strong>
                            ${cantidadActual > 0 ? `<span style="color:#666;font-size:0.9em;"> (Actual: ${cantidadActual})</span>` : '<span style="color:#999;font-size:0.9em;"> (Sin stock)</span>'}
                        </div>
                        <input 
                            type="number" 
                            min="0" 
                            value="0" 
                            placeholder="0" 
                            style="width:80px;padding:6px;" 
                            name="edit_cantidad_talla_${talla.id_talla}" 
                            data-id-talla="${talla.id_talla}"
                            title="Cantidad a AGREGAR (se sumará a ${cantidadActual})">
                    </div>
                `;
                editTallasDiv.appendChild(label);
            });
        } catch (e) {
            console.error('Error cargando tallas para edición:', e);
            editTallasDiv.innerHTML = '<p style="color:red;">Error al cargar tallas</p>';
        }
    }
    if (btnCerrarModal) {
        btnCerrarModal.onclick = () => { modalEditar.style.display = 'none'; };
    }
    if (formEditar) {
        formEditar.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('editIdProducto').value;
            const marca = document.getElementById('editMarca').value.trim();
            const nombre = document.getElementById('editNombre').value.trim();
            const inventario_adicional = parseInt(document.getElementById('editInventario').value) || 0;
            const precio = parseFloat(document.getElementById('editPrecio').value);
            const id_categoria = document.getElementById('editCategoria').value;
            const id_proveedor = document.getElementById('editProveedor').value;
            
            if (!marca || !nombre || isNaN(precio) || !id_categoria || !id_proveedor) {
                alert('Completa todos los campos requeridos.'); 
                return;
            }
            
            // Obtener cantidades de tallas del formulario
            const editTallasDiv = document.getElementById('editTallasDinamicas');
            const cantidades = [];
            if (editTallasDiv) {
                const inputs = editTallasDiv.querySelectorAll('input[type="number"]');
                inputs.forEach(input => {
                    const id_talla = input.getAttribute('data-id-talla');
                    const cantidad = parseInt(input.value) || 0;
                    if (cantidad > 0) {
                        cantidades.push({ id_talla, cantidad });
                    }
                });
            }
            
            // Preparar datos a enviar
            const datosEnvio = { 
                marca, 
                nombre, 
                inventario_adicional, 
                precio, 
                id_categoria, 
                id_proveedor,
                cantidades 
            };
            
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('[EDITAR PRODUCTO] Enviando datos al servidor:');
            console.log('  Producto ID:', id);
            console.log('  Inventario adicional:', inventario_adicional);
            console.log('  Cantidades por talla:', cantidades);
            console.log('  Total de datos:', datosEnvio);
            console.log('═══════════════════════════════════════════════════════════════');
            
            try {
                const res = await fetch(`/api/admin/productos/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datosEnvio)
                });
                
                const data = await res.json();
                console.log('[EDITAR PRODUCTO] Respuesta del servidor:', data);
                
                if (data.ok) {
                    const mensaje = `✅ Producto actualizado correctamente\n\n` +
                                   `📦 Inventario agregado: ${data.inventario_agregado || 0} unidades\n` +
                                   `📏 Tallas agregadas: ${data.tallas_agregadas || 0} unidades`;
                    alert(mensaje);
                    modalEditar.style.display = 'none';
                    cargarProductos();
                } else {
                    alert('❌ Error al editar producto: ' + (data.message || data.error || ''));
                }
            } catch (e) {
                console.error('Error al editar producto:', e);
                alert('❌ Error de conexión al editar producto');
            }
        };
    }
    window.editarProducto = async function(id) {
        try {
            const res = await fetch(`/api/admin/productos/${id}`);
            const data = await res.json();
            if (data.producto) {
                mostrarModalEditar(data.producto);
            } else {
                alert('No se encontró el producto');
            }
        } catch { alert('Error al cargar producto'); }
    };
    // --- ADMINISTRADOR: Listado, edición y eliminación de productos ---
    const adminProductos = document.getElementById('adminProductos');
    let todosLosProductos = []; // Almacenar todos los productos para búsqueda
    
    async function cargarProductos() {
        try {
            const res = await fetch('/api/admin/productos');
            const data = await res.json();
            if (adminProductos) {
                todosLosProductos = data.productos || [];
                // Asegurar que cada producto tenga el nombre de su categoría para mostrar en la lista
                try {
                    const cRes = await fetch('/api/categorias');
                    const cData = await cRes.json();
                    const cats = (cData && cData.categorias) ? cData.categorias : [];
                    const catMap = {};
                    cats.forEach(c => { catMap[c.id_categoria] = c.nombre; });
                    todosLosProductos = todosLosProductos.map(p => (Object.assign({}, p, { categoria: p.id_categoria ? (catMap[p.id_categoria] || null) : null })));
                } catch (e) {
                    // si falla obtener categorías, seguimos mostrando sin nombre de categoría
                    console.warn('No se pudo cargar nombres de categorías para productos:', e);
                }
                renderProductos(todosLosProductos);
            }
        } catch { 
            if (adminProductos) {
                adminProductos.innerHTML = '<div class="item">Error al cargar productos.</div>';
            }
        }
    }
    
    function renderProductos(productos) {
        if (!adminProductos) return;
        adminProductos.innerHTML = '';
        if (productos.length === 0) {
            adminProductos.innerHTML = '<div class="item">No hay productos registrados.</div>';
            return;
        }
        productos.forEach(prod => {
            const div = document.createElement('div');
            div.className = 'item';
            div.dataset.id = prod.id_producto;
                div.innerHTML = `
                <div class="producto-info">
                    <strong>${prod.marca || ''} - ${prod.nombre}</strong><br>
                    Categoría: <span id="prod-cat-${prod.id_producto}">${prod.categoria || (prod.id_categoria ? 'Cargando...' : 'Sin categoría')}</span><br>
                    Precio: $${prod.precio_venta || '0.00'} | Stock: ${prod.inventario || 0}
                </div>
                <div class="actions">
                    <button class="btn btn-small" onclick="editarProducto(${prod.id_producto})">Editar</button>
                    <button class="btn btn-small secondary" onclick="eliminarProducto(${prod.id_producto})">Eliminar</button>
                </div>`;
            adminProductos.appendChild(div);
            // Si tenemos id_categoria pero no nombre resuelto, intentar obtenerlo en segundo plano
            if (!prod.categoria && prod.id_categoria) {
                (async () => {
                    try {
                        const res = await fetch('/api/categorias');
                        if (!res.ok) return;
                        const data = await res.json();
                        const cats = data.categorias || [];
                        const found = cats.find(c => Number(c.id_categoria) === Number(prod.id_categoria));
                        const span = document.getElementById(`prod-cat-${prod.id_producto}`);
                        if (span) span.textContent = found ? found.nombre : 'Sin categoría';
                    } catch (e) {
                        const span = document.getElementById(`prod-cat-${prod.id_producto}`);
                        if (span) span.textContent = 'Sin categoría';
                    }
                })();
            }
        });
    }
    
    // Función de búsqueda de productos (búsqueda local)
    const prodBuscar = document.getElementById('prodBuscar');
    if (prodBuscar) {
        prodBuscar.addEventListener('input', function() {
            const busqueda = this.value.toLowerCase().trim();
            if (busqueda === '') {
                renderProductos(todosLosProductos);
            } else {
                const filtrados = todosLosProductos.filter(prod => 
                    (prod.nombre && prod.nombre.toLowerCase().includes(busqueda)) ||
                    (prod.marca && prod.marca.toLowerCase().includes(busqueda)) ||
                    (prod.categoria && prod.categoria.toLowerCase().includes(busqueda))
                );
                renderProductos(filtrados);
            }
        });
    }
    
    // Cargar productos al iniciar si estamos en admin.html
    if (window.location.pathname.includes('admin.html')) {
        cargarProductos();
    }
    // (Ya está definida la versión funcional de window.editarProducto más arriba)
    window.eliminarProducto = async function(id) {
        if (!confirm('¿Está seguro de que desea eliminar este producto?\n\n⚠️ Esta acción no se puede deshacer.')) return;
        try {
            const res = await fetch(`/api/admin/productos/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.ok || data.success) {
                alert('✅ Producto eliminado correctamente');
                cargarProductos();
            } else {
                const mensaje = data.message || 'Error al eliminar producto';
                alert('❌ ' + mensaje);
            }
        } catch (e) {
            console.error('Error al eliminar producto:', e);
            alert('❌ Error de conexión al eliminar producto');
        }
    };
    // --- ADMINISTRADOR: Registro de Categorías ---
    const formCategoria = document.getElementById('form-categoria');
    const catalogoCategorias = document.getElementById('catalogoCategorias');
    const prodCategoria = document.getElementById('prodCategoria');
    let todasLasCategorias = [];
    
    window.cargarCategorias = async function cargarCategorias() {
        try {
            const res = await fetch('/api/categorias');
            const data = await res.json();
            todasLasCategorias = data.categorias || [];
            if (catalogoCategorias) {
                renderCategorias(todasLasCategorias);
            }
            if (prodCategoria) {
                prodCategoria.innerHTML = '<option value="">Selecciona Categoría</option>';
                todasLasCategorias.forEach(cat => {
                    const opt = document.createElement('option');
                    opt.value = cat.id_categoria;
                    opt.textContent = cat.nombre; 
                    prodCategoria.appendChild(opt);
                });
            }
        } catch {}
    }
    
    function renderCategorias(categorias) {
        if (!catalogoCategorias) return;
        catalogoCategorias.innerHTML = '';
        if (categorias.length === 0) {
            catalogoCategorias.innerHTML = '<div class="item">No hay categorías registradas.</div>';
            return;
        }
        categorias.forEach(cat => {
            const div = document.createElement('div');
            div.className = 'item';
            div.dataset.id = cat.id_categoria;
            div.innerHTML = `
                <span>${cat.nombre}</span>
                <div class="actions">
                    <button class='btn btn-small' onclick='editarCategoria(${cat.id_categoria}, "${cat.nombre}")'>Editar</button>
                    <button class='btn btn-small secondary' onclick='mostrarConfirmacion(${cat.id_categoria}, "categorias", "${cat.nombre}")'>Eliminar</button>
                </div>`;
            catalogoCategorias.appendChild(div);
        });
    }
    
    // Búsqueda de categorías
    const buscarCategoria = document.getElementById('buscarCategoria');
    if (buscarCategoria) {
        buscarCategoria.addEventListener('input', function() {
            const busqueda = this.value.toLowerCase().trim();
            if (busqueda === '') {
                renderCategorias(todasLasCategorias);
            } else {
                const filtradas = todasLasCategorias.filter(cat => 
                    cat.nombre && cat.nombre.toLowerCase().includes(busqueda)
                );
                renderCategorias(filtradas);
            }
        });
    }
    if (formCategoria) {
        formCategoria.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombre = document.getElementById('catNombre').value.trim();
            if (!nombre) return;
            try {
                const res = await fetch('/api/categorias', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nombre })
                });
                const data = await res.json();
                if (data.ok) {
                    formCategoria.reset();
                    cargarCategorias();
                } else {
                    alert('Error al crear categoría');
                }
            } catch { alert('Error de conexión'); }
        });
        cargarCategorias();
    }

    // --- ADMINISTRADOR: Registro de Proveedores ---
    const formProveedor = document.getElementById('form-proveedor');
    const catalogoProveedores = document.getElementById('catalogoProveedores');
    const prodProveedor = document.getElementById('prodProveedor');
    let todosLosProveedores = [];
    
    window.cargarProveedores = async function cargarProveedores() {
        try {
            const res = await fetch('/api/proveedores');
            const data = await res.json();
            todosLosProveedores = data.proveedores || [];
            if (catalogoProveedores) {
                renderProveedores(todosLosProveedores);
            }
            if (prodProveedor) {
                prodProveedor.innerHTML = '<option value="">Selecciona Proveedor</option>';
                todosLosProveedores.forEach(prov => {
                    const opt = document.createElement('option');
                    opt.value = prov.id_proveedor;
                    opt.textContent = prov.nombre;
                    prodProveedor.appendChild(opt);
                });
            }
        } catch {}
    }
    
    function renderProveedores(proveedores) {
        if (!catalogoProveedores) return;
        catalogoProveedores.innerHTML = '';
        if (proveedores.length === 0) {
            catalogoProveedores.innerHTML = '<div class="item">No hay proveedores registrados.</div>';
            return;
        }
        proveedores.forEach(prov => {
            const div = document.createElement('div');
            div.className = 'item';
            div.dataset.id = prov.id_proveedor;
            div.dataset.contacto = prov.contacto || '';
            div.dataset.telefono = prov.telefono || '';
            div.innerHTML = `
                <span><b>${prov.nombre}</b>${prov.contacto ? ` | Contacto: ${prov.contacto}` : ''}${prov.telefono ? ` | Tel: ${prov.telefono}` : ''}</span>
                <div class="actions">
                    <button class='btn btn-small' onclick='editarProveedor(${prov.id_proveedor}, ${JSON.stringify({nombre: prov.nombre, contacto: prov.contacto, telefono: prov.telefono})})'>Editar</button>
                    <button class='btn btn-small secondary' onclick='mostrarConfirmacion(${prov.id_proveedor}, "proveedores", "${prov.nombre}")'>Eliminar</button>
                </div>`;
            catalogoProveedores.appendChild(div);
        });
    }
    
    // Búsqueda de proveedores
    const buscarProveedor = document.getElementById('buscarProveedor');
    if (buscarProveedor) {
        buscarProveedor.addEventListener('input', function() {
            const busqueda = this.value.toLowerCase().trim();
            if (busqueda === '') {
                renderProveedores(todosLosProveedores);
            } else {
                const filtrados = todosLosProveedores.filter(prov => 
                    (prov.nombre && prov.nombre.toLowerCase().includes(busqueda)) ||
                    (prov.contacto && prov.contacto.toLowerCase().includes(busqueda)) ||
                    (prov.telefono && prov.telefono.includes(busqueda))
                );
                renderProveedores(filtrados);
            }
        });
    }
    if (formProveedor) {
        formProveedor.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nombre = document.getElementById('provNombre').value.trim();
            const contacto = document.getElementById('provContacto').value.trim();
            const telefono = document.getElementById('provTelefono').value.trim();
            if (!nombre) return;
            try {
                const res = await fetch('/api/proveedores', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nombre, contacto, telefono })
                });
                const data = await res.json();
                if (data.ok) {
                    formProveedor.reset();
                    cargarProveedores();
                } else {
                    alert('Error al crear proveedor');
                }
            } catch { alert('Error de conexión'); }
        });
        cargarProveedores();
    }
    // --- ADMINISTRADOR: Registro de Productos ---
    const formProductoAdmin = document.getElementById('form-producto-admin');
    if (formProductoAdmin) {
        formProductoAdmin.addEventListener('submit', async (e) => {
            e.preventDefault();
            // Obtener datos del formulario
            const marca = document.getElementById('prodMarca').value.trim();
            const categoria = document.getElementById('prodCategoria').value;
            const proveedor = document.getElementById('prodProveedor').value;
            const nombre = document.getElementById('prodNombre').value.trim();
            const precio = parseFloat(document.getElementById('prodPrecio').value);
            const inventario = parseInt(document.getElementById('prodInventario').value);
            // Obtener cantidades por talla
            const cantidades = [];
            if (tallasDinamicasDiv) {
                const inputs = tallasDinamicasDiv.querySelectorAll('input[type="number"]');
                inputs.forEach(input => {
                    const id_talla = input.getAttribute('data-id-talla');
                    const cantidad = parseInt(input.value) || 0;
                    cantidades.push({ id_talla, cantidad });
                });
            }
            // Validación básica
            if (!marca || !categoria || !proveedor || !nombre || isNaN(precio) || isNaN(inventario)) {
                alert('Completa todos los campos obligatorios.');
                return;
            }
            // Enviar al backend
            try {
                const res = await fetch('/api/productos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ marca, categoria, proveedor, nombre, precio, inventario, cantidades })
                });
                const data = await res.json();
                if (data.ok) {
                    if (data.actualizado) {
                        alert(`✅ Producto existente actualizado correctamente.\n\nSe sumó el inventario al producto existente (ID: ${data.id_producto}).`);
                    } else {
                        alert(`✅ Producto nuevo registrado correctamente.\n\nID del producto: ${data.id_producto}`);
                    }
                    formProductoAdmin.reset();
                    mostrarTallasDinamicas();
                    // Recargar lista de productos si existe
                    if (typeof cargarProductos === 'function') {
                        cargarProductos();
                    }
                } else {
                    alert('❌ Error al registrar producto: ' + (data.error || data.message || ''));
                }
            } catch (err) {
                alert('Error de conexión al guardar producto.');
            }
        });
    }

    // --- CAJA: Registro de Ventas ---
    
    // 1. Elementos del DOM y variables de estado para CAJA
    const loginSection = document.getElementById('loginSection');
    const loginBtn = document.getElementById('loginBtn');
    const usuarioEl = document.getElementById('usuario');
    const passwordEl = document.getElementById('password');
    const loginMsg = document.getElementById('loginMsg');
    const statusDisplay = document.getElementById('statusDisplay');
    const logoutBtn = document.getElementById('logoutBtn'); 
    
    // Elementos del formulario de Venta
    const formVentaCaja = document.getElementById('form-venta-caja');
    const inputCedula = document.getElementById('ventaClienteCedula');
    const inputNombre = document.getElementById('ventaClienteNombre');
    const inputTelefono = document.getElementById('ventaClienteTelefono');
    const inputEmail = document.getElementById('ventaClienteEmail');
    const selectProducto = document.getElementById('ventaProducto');
    const selectCategoria = document.getElementById('ventaCategoria');
    const selectTalla = document.getElementById('ventaTalla');
    const inputCantidad = document.getElementById('ventaCantidad');
    const inputPrecioUnitario = document.getElementById('ventaPrecioUnitario');
    const inputTotalDolar = document.getElementById('ventaTotalDolar');
    const inputTotalBs = document.getElementById('ventaTotalBs');
    const btnAgregarProducto = document.getElementById('btnAgregarProducto');
    const ventaDetalle = document.getElementById('ventaDetalle');
    const btnPagarVenta = document.getElementById('btnPagarVenta');
    const selectTipoPago = document.getElementById('ventaTipoPago'); // CORRECCIÓN 1: Referencia a elemento DOM
    
    let carrito = [];
    let productosDisponibles = []; // CORRECCIÓN 2: Declaración de la variable
    let categoriasDisponibles = [];
    let categoriaMap = {};

    /**
     * Función reutilizable para cerrar la sesión.
     */
    async function handleLogout() {
        if (loginMsg) loginMsg.textContent = 'Cerrando sesión...';
        try {
            await fetch('/api/logout', { method: 'POST', credentials: 'include' });
        } catch (e) {
            console.error('Error al intentar cerrar sesión:', e);
        }
        // Recargar la página para limpiar el estado y volver al login
        window.location.href = 'index.html'; // Siempre volvemos al index.html
    }


    /**
     * Función que chequea el estado del servidor y la sesión.
     * @param {boolean} shouldRedirect - Si es true, redirige al usuario según su rol si está autenticado.
     */
    async function checkStatus(shouldRedirect = false) {
        if (!statusDisplay || !loginSection) return;

        statusDisplay.textContent = 'Cargando estado...';
        statusDisplay.style.color = 'gray';
        if (loginMsg) loginMsg.textContent = '';
        
        try {
            const res = await fetch('/api/status', { credentials: 'include' });
            const data = await res.json();
            
            // 3.1. Actualizar indicador de estado
            const servidorStatus = data.servidor ? 'Servidor: ✅ OK' : 'Servidor: ❌ FAIL';
            const bdStatus = data.bd ? 'BD: ✅ OK' : 'BD: ❌ FAIL';
            statusDisplay.textContent = `${servidorStatus} | ${bdStatus}`;
            statusDisplay.style.color = (data.servidor && data.bd) ? '#10b981' : '#ef4444'; 
            
            // 3.2. Manejo de autenticación
            if (data.servidor && data.bd && data.usuario) {
                const rol = (data.rol || '').toLowerCase();
                
                if (shouldRedirect) {
                    // Solo redirigimos si es un login EXITOSO (shouldRedirect=true)
                    if (rol === 'administrador') {
                        window.location.href = 'admin.html';
                    } else if (rol === 'caja') {
                        window.location.href = 'caja.html';
                    } else {
                        // Rol no reconocido, mostramos mensaje de sesión activa aquí
                        displayActiveSession(data, rol);
                    }
                } else {
                    // Sesión activa en carga inicial, PERO NO REDIRIGIMOS
                    // Mostramos el mensaje de sesión activa en lugar del formulario.
                    displayActiveSession(data, rol);
                }
            } else {
                // No autenticado: Mostrar el formulario de login.
                if (loginSection) loginSection.style.display = 'block';
                if (loginMsg) {
                    loginMsg.textContent = 'Introduce tus credenciales para continuar.';
                    loginMsg.style.color = '#3b82f6';
                }
            }
        } catch (e) {
            // Falla de red/servidor apagado
            statusDisplay.textContent = 'Servidor: ❌ OFFLINE | BD: ❌ DESCONOCIDA';
            statusDisplay.style.color = '#ef4444';
            if (loginMsg) {
                loginMsg.textContent = 'Error: No se pudo conectar con el servidor. Revise Node.js.';
                loginMsg.style.color = '#ef4444';
            }
            console.error('Fallo grave de conexión:', e);
        }
    }

    // Nueva función para mostrar la sesión activa y el botón de logout
    function displayActiveSession(data, rol) {
        // En index.html, reemplazamos el formulario de login
        if (loginSection) {
            loginSection.innerHTML = `
                <h2 style="color: #3b82f6;">Sesión Activa</h2>
                <p style="padding: 15px; background: #e0f2fe; border-radius: 4px; margin-top: 15px;">
                    Bienvenido, <strong>${data.usuario}</strong> (${data.rol || 'Usuario'}). 
                    <br>Por favor, usa el botón de abajo para ir a tu panel o cerrar sesión.
                    <br>Tu rol es: <strong>${rol.toUpperCase()}</strong>
                </p>
                <button id="goToPanelBtn" class="btn primary" style="margin-top: 15px;">Ir a mi Panel</button>
                <button id="logoutDummyBtn" class="btn secondary" style="margin-top: 15px;">Cerrar sesión</button>
            `;
            
            const logoutDummyBtn = document.getElementById('logoutDummyBtn');
            const goToPanelBtn = document.getElementById('goToPanelBtn');

            if (logoutDummyBtn) {
                logoutDummyBtn.addEventListener('click', handleLogout);
            }

            if (goToPanelBtn) {
                goToPanelBtn.addEventListener('click', () => {
                    // Forzamos la redirección manual al panel correcto
                    const targetRol = (data.rol || '').toLowerCase();
                    if (targetRol === 'administrador') {
                        window.location.href = 'admin.html';
                    } else if (targetRol === 'caja') {
                        window.location.href = 'caja.html';
                    } else {
                        // En el entorno real, usarías un modal o mensaje.
                        alert('Tu rol no tiene un panel de destino definido.'); 
                    }
                });
            }
        }
    }


    // 4. Eventos
    // Evento de Login (Solo en index.html)
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const usuario = usuarioEl.value.trim();
            const password = passwordEl.value.trim();
            if (loginMsg) loginMsg.textContent = ''; 

            if (!usuario || !password) {
                if (loginMsg) {
                    loginMsg.textContent = 'Ingresa usuario y contraseña';
                    loginMsg.style.color = '#ef4444'; 
                }
                return;
            }

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ usuario, password }),
                });
                const data = await res.json();
                if (data.ok) {
                    if (loginMsg) {
                        loginMsg.textContent = 'Login exitoso, redirigiendo...';
                        loginMsg.style.color = '#10b981';
                    }
                    // Redirigimos SÓLO después de un login exitoso (checkStatus(true))
                    await checkStatus(true); 
                } else {
                    if (loginMsg) {
                        loginMsg.textContent = data.error || 'Error de login. Credenciales inválidas.';
                        loginMsg.style.color = '#ef4444';
                    }
                    if (passwordEl) passwordEl.value = '';
                }
            } catch (e) {
                if (loginMsg) {
                    loginMsg.textContent = 'Error de conexión con el servidor.';
                    loginMsg.style.color = '#ef4444';
                }
            }
        });
    }

    // 5. Inicialización
    // Llama a checkStatus(false) para verificar el estado de la conexión PERO NO REDIRIGIR AUTOMÁTICAMENTE
    // Si hay una sesión activa en index.html, muestra el mensaje de "Sesión Activa".
    checkStatus(false);
    
    // 6. Listener para el botón genérico de Logout
    // Esto hace que el mismo script funcione en admin.html y caja.html si tienen un elemento con ID 'logoutBtn'
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // --- CAJA: Lógica de Ventas ---
    if (formVentaCaja) {
        // Si existe el módulo avanzado de caja, delegar toda la lógica de carrito/render a él
        // para evitar que este archivo sobrescriba el DOM del carrito y oculte promociones.
        if (typeof window !== 'undefined' && window._caja && typeof window._caja.renderCart === 'function') {
            console.log('[cliente.js] Delegando lógica de carrito a caja-funcionalidades.js');
            // Aún así, mantener autocompletar de cliente y botones de logout fuera del flujo del carrito
            // y no registrar los listeners de carrito/venta aquí.
            return;
        }
        // Autocompletar datos del cliente al ingresar la cédula
        inputCedula.addEventListener('blur', async () => {
            const cedula = inputCedula.value.trim();
            if (!cedula) return;
            try {
                // Incluir credenciales (cookies de sesión) para rutas protegidas
                const res = await fetch(`/api/clientes/buscar?cedula=${encodeURIComponent(cedula)}`, { credentials: 'include' });
                if (!res.ok) {
                    // Si no está autenticado o hay error, no sobreescribir campos
                    console.warn('No se pudo buscar cliente (estado:', res.status, ')');
                    return;
                }
                const data = await res.json();
                if (data && data.cliente) {
                    inputNombre.value = data.cliente.nombre || '';
                    if (inputTelefono) inputTelefono.value = data.cliente.telefono || '';
                    if (inputEmail) inputEmail.value = data.cliente.email || '';
                } else {
                    // No existe: dejar los campos para que el cajero los complete
                    inputNombre.value = '';
                    if (inputTelefono) inputTelefono.value = '';
                    if (inputEmail) inputEmail.value = '';
                }
            } catch (err) {
                console.error('Error buscando cliente por cédula:', err);
            }
        });
        // Actualizar totales automáticamente
        const precioUnitario = document.getElementById('ventaPrecioUnitario');
        const cantidad = document.getElementById('ventaCantidad');
        const totalDolar = document.getElementById('ventaTotalDolar');
        const totalBs = document.getElementById('ventaTotalBs');

        async function actualizarTotales() {
            const precio = parseFloat(precioUnitario.value) || 0;
            const cant = parseInt(cantidad.value) || 0;
            const total = precio * cant;
            totalDolar.value = total.toFixed(2);
            // Obtener tasa BCV
            let tasa = 36; // Valor fijo de ejemplo, deberías obtenerlo de una API real
            try {
                const res = await fetch('/api/tasa-bcv');
                const data = await res.json();
                if (data.tasa) tasa = parseFloat(data.tasa);
            } catch {}
            // Precio unitario en Bs y total en Bs
            const precioUnitBs = precio * tasa;
            if (document.getElementById('ventaPrecioUnitarioBs')) {
                document.getElementById('ventaPrecioUnitarioBs').value = precioUnitBs ? precioUnitBs.toFixed(2) : '';
            }
            totalBs.value = (total * tasa).toFixed(2);
        }
        precioUnitario.addEventListener('input', actualizarTotales);
        cantidad.addEventListener('input', actualizarTotales);

        // Cargar productos disponibles en el select (CAJA) -> usar endpoint público /api/productos
        async function cargarProductosCaja() {
            try {
                const [res, cRes] = await Promise.all([fetch('/api/productos'), fetch('/api/categorias')]);
                const data = await res.json();
                const cData = await cRes.json();
                const cats = (cData && cData.categorias) ? cData.categorias : [];
                categoriasDisponibles = cats;
                categoriaMap = {};
                cats.forEach(c => { categoriaMap[c.id_categoria] = c.nombre; });
                productosDisponibles = data.productos || [];
                selectProducto.innerHTML = '<option value="">Selecciona producto</option>';
                // Llenar select de categorías global para el cajero
                if (selectCategoria) {
                    selectCategoria.innerHTML = '<option value="">Selecciona categoría</option>';
                    cats.forEach(c => {
                        selectCategoria.innerHTML += `<option value="${c.id_categoria}">${c.nombre}</option>`;
                    });
                }
                productosDisponibles.forEach(prod => {
                    const catName = prod.id_categoria ? (categoriaMap[prod.id_categoria] || '') : '';
                    const label = `${prod.marca || ''} - ${prod.nombre}${catName ? ' | ' + catName : ''}`;
                    // incluir data-cat para facilitar preselección
                    selectProducto.innerHTML += `<option value="${prod.id_producto}" data-precio="${prod.precio_venta}" data-nombre="${prod.nombre}" data-marca="${prod.marca}" data-cat="${prod.id_categoria || ''}">${label}</option>`;
                });
            } catch {}
        }
        cargarProductosCaja();

        // Al cambiar el producto, obtener su información completa (precio, tallas, categoría)
        selectProducto.addEventListener('change', async () => {
            const option = selectProducto.selectedOptions[0];
            if (option) {
                const idProd = option.value;
                // cargarTallasPorProducto devuelve el objeto producto si es exitoso
                const prod = await cargarTallasPorProducto(idProd);
                if (prod) {
                    inputPrecioUnitario.value = prod.precio_venta || option.getAttribute('data-precio') || '';
                    if (selectCategoria) selectCategoria.value = prod.id_categoria || '';
                } else {
                    // fallback a datos embebidos en la opción
                    const precio = option.getAttribute('data-precio');
                    inputPrecioUnitario.value = precio || '';
                    if (selectCategoria) {
                        const prodCat = option.getAttribute('data-cat');
                        selectCategoria.value = prodCat || '';
                    }
                }
                await actualizarTotales();
            } else {
                inputPrecioUnitario.value = '';
                document.getElementById('ventaPrecioUnitarioBs').value = '';
                selectTalla.innerHTML = '<option value="">Selecciona talla</option>';
                if (selectCategoria) selectCategoria.value = '';
            }
        });

        // Cargar tallas disponibles para el producto seleccionado usando GET /api/productos/:id (público para caja)
        // Devuelve el objeto producto (o null) para que el llamador pueda usar id_categoria/precio_venta
        async function cargarTallasPorProducto(idProducto) {
            if (!idProducto) {
                selectTalla.innerHTML = '<option value="">Selecciona talla</option>';
                return null;
            }
            try {
                const res = await fetch(`/api/productos/${encodeURIComponent(idProducto)}`);
                const data = await res.json();
                const prod = data.producto || null;
                const tallas = prod ? prod.tallas : [];
                selectTalla.innerHTML = '<option value="">Selecciona talla</option>';
                tallas.forEach(talla => {
                    selectTalla.innerHTML += `<option value="${talla.id_talla}" data-cantidad="${talla.cantidad}">${talla.nombre} (${talla.cantidad} disponibles)</option>`;
                });
                return prod;
            } catch (e) {
                selectTalla.innerHTML = '<option value="">Error al cargar tallas</option>';
                return null;
            }
        }

        btnAgregarProducto.addEventListener('click', async () => {
            const idProd = selectProducto.value;
            const idTalla = selectTalla.value;
            const optTalla = selectTalla.selectedOptions[0];
            const optProd = selectProducto.selectedOptions[0];
            const nombreProd = optProd ? optProd.getAttribute('data-nombre') : '';
            const marcaProd = optProd ? optProd.getAttribute('data-marca') : '';
            let idCategoriaSeleccionada = selectCategoria ? (selectCategoria.value || null) : null;
            const nombreTalla = optTalla ? optTalla.textContent.replace(/\s*\(\d+\s+disponibles\)/, '').trim() : '';
            const cantidadVal = parseInt(inputCantidad.value) || 0;
            const maxCant = optTalla ? parseInt(optTalla.getAttribute('data-cantidad')) : 0;
            const precio = parseFloat(inputPrecioUnitario.value) || 0;
            
            if (!idProd || !idTalla) {
                alert('Selecciona producto y talla.');
                return;
            }
            if (cantidadVal < 1) {
                alert('Ingresa una cantidad válida.');
                return;
            }
            if (cantidadVal > maxCant) {
                alert(`Cantidad solicitada (${cantidadVal}) supera el stock disponible (${maxCant}).`);
                return;
            }
            // Si no se seleccionó categoría, intentar obtenerla desde el producto servidor
            if (!idCategoriaSeleccionada) {
                try {
                    const prod = await cargarTallasPorProducto(idProd);
                    if (prod && prod.id_categoria) idCategoriaSeleccionada = prod.id_categoria;
                } catch (e) {}
            }
            // Requerir categoría: según tu regla, sin categoría no puede haber precio ni talla
            if (!idCategoriaSeleccionada) {
                alert('Este producto no tiene categoría. Selecciona la categoría antes de agregar al carrito.');
                return;
            }

            // Incluir idProd, idTalla e idCategoria en el carrito
            carrito.push({ idProd, nombreProd, marcaProd, idTalla, nombreTalla, cantidad: cantidadVal, precio, idCategoria: idCategoriaSeleccionada });
            renderCarrito();
            // Limpiar campos
            selectProducto.value = '';
            selectTalla.innerHTML = '<option value="">Selecciona talla</option>';
            if (selectCategoria) selectCategoria.value = '';
            inputCantidad.value = '';
            inputPrecioUnitario.value = '';
            if (document.getElementById('ventaPrecioUnitarioBs')) document.getElementById('ventaPrecioUnitarioBs').value = '';
            inputTotalDolar.value = '';
            inputTotalBs.value = '';
        });

        function renderCarrito() {
            ventaDetalle.innerHTML = '';
            let subtotal = 0;
            if (carrito.length === 0) {
                ventaDetalle.innerHTML = '<div class="item">Carrito vacío. Agrega productos para la venta.</div>';
                return;
            }
            carrito.forEach((item, idx) => {
                const totalItem = item.precio * item.cantidad;
                subtotal += totalItem;
                const catName = item.idCategoria ? (categoriaMap[item.idCategoria] || '') : '';
                const catLabel = catName ? ` | Categoria: ${catName}` : '';
                ventaDetalle.innerHTML += `<div class="item">${item.marcaProd} - ${item.nombreProd}${catLabel} - ${item.nombreTalla} x${item.cantidad} ($${totalItem.toFixed(2)}) <button class='btn danger' style='background:#ef4444;color:#fff;margin-left:10px;' onclick='eliminarDelCarrito(${idx})'>Eliminar</button></div>`;
            });
            ventaDetalle.innerHTML += `<div class="item" style="border-top: 1px solid #ccc; margin-top: 10px; padding-top: 10px;"><b>Total Carrito: $${subtotal.toFixed(2)}</b></div>`;
        }

        window.eliminarDelCarrito = function(index) {
            carrito.splice(index, 1);
            renderCarrito();
        };

        btnPagarVenta.addEventListener('click', async () => {
            // Obtener datos del cliente (Uso seguro de referencias)
            const cliente_nombre = inputNombre.value.trim();
            const cliente_cedula = inputCedula.value.trim();
            const cliente_telefono = inputTelefono ? inputTelefono.value.trim() : '';
            const cliente_email = inputEmail ? inputEmail.value.trim() : '';
            const tipo_pago = selectTipoPago ? selectTipoPago.value : '';
            
            if (!cliente_nombre || !cliente_cedula || carrito.length === 0 || !tipo_pago) {
                alert('Completa todos los campos del cliente, agrega productos al carrito y selecciona el tipo de pago.');
                return;
            }
            // 1) Validar stock actual PARA TODO EL CARRITO antes de enviar cualquier venta.
            try {
                for (const item of carrito) {
                    // Obtener estado actual del producto (incluye tallas)
                    const resCheck = await fetch(`/api/productos/${encodeURIComponent(item.idProd)}`);
                    if (!resCheck.ok) {
                        alert('Error al verificar stock de productos. Intenta de nuevo.');
                        return;
                    }
                    const dataCheck = await resCheck.json();
                    const tallas = dataCheck.producto ? dataCheck.producto.tallas : [];
                    const t = tallas.find(tt => String(tt.id_talla) === String(item.idTalla) || tt.id_talla == item.idTalla);
                    const disponible = t ? Number(t.cantidad) : 0;
                    if (disponible === 0) {
                        alert(`No hay unidades disponibles para ${item.marcaProd} - ${item.nombreProd} (${item.nombreTalla}). La venta fue cancelada.`);
                        return;
                    }
                    if (disponible < item.cantidad) {
                        alert(`Stock insuficiente para ${item.marcaProd} - ${item.nombreProd} (${item.nombreTalla}). Disponible: ${disponible}. Ajusta la cantidad.`);
                        return;
                    }
                }
            } catch (e) {
                console.error('Error al validar stock antes de venta:', e);
                alert('Error de conexión al verificar stock. Intenta de nuevo.');
                return;
            }

            // 2) Si todas las líneas pasan la validación, proceder a registrar cada venta individualmente.
            let ok = true;
            for (const item of carrito) {
                const body = {
                    cliente_nombre,
                    cliente_cedula,
                    cliente_telefono,
                    cliente_email,
                    id_producto: item.idProd,
                    id_talla: item.idTalla,
                    cantidad: item.cantidad,
                    precio_unitario: item.precio,
                    idCategoria: item.idCategoria || null,
                    tipo_pago
                };
                try {
                    const res = await fetch('/api/ventas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                        credentials: 'include'
                    });
                    const data = await res.json();
                    if (!data.ok) {
                        ok = false;
                        console.error('Error al registrar venta de producto:', item.nombreProd, data.message || data.error);
                        alert('Error en venta: ' + (data.message || data.error || 'Revise la consola.'));
                        // No continuar con más envíos si uno falla
                        break;
                    } else {
                        // Si el servidor indica que la talla quedó agotada, informarlo al usuario
                        if (data.agotado) {
                            alert(`Atención: La talla ${item.nombreTalla} del producto ${item.marcaProd} - ${item.nombreProd} se ha agotado.`);
                        }
                    }
                } catch (e) { 
                    ok = false; 
                    console.error('Error de conexión al registrar venta:', e);
                    alert('Error de conexión al registrar venta. Intenta de nuevo.');
                    break;
                }
            }
            if (ok) {
                alert('Venta registrada correctamente.');
                carrito = [];
                renderCarrito();
                formVentaCaja.reset();
                inputTotalDolar.value = '';
                inputTotalBs.value = '';
                cargarProductosCaja(); 
            } else {
                // Si hubo un fallo parcial, actualizar catálogo y dejar el carrito para que el usuario lo corrija.
                alert('Ocurrió un error al registrar una o más ventas. Revise la consola para detalles.');
                cargarProductosCaja();
            }
        });
    }
});