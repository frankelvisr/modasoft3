# 📊 Sistema de Reportes - Modasoft ERP

## ✅ Estado Actual

Se han eliminado y reemplazado los siguientes archivos:
- ❌ `reporte-compras-final.js` → ✅ Integrado en `reportes.js`
- ❌ `reporte-compras-mejorado.js` → ✅ Integrado en `reportes.js`
- ❌ `reporte-ventas.js` → ✅ Integrado en `reportes.js`

## 📈 Reportes Disponibles

### 1. Reporte de Compras
- **Ubicación**: Panel de Reportes → Pestaña "Compras"
- **Datos que muestra**:
  - Número de compra
  - Fecha de compra
  - Proveedor
  - Total de la compra
  - Estado de pago
- **Exportar**: Botón "📥 Exportar a PDF" genera archivo con formato `reporte_compras_YYYY-MM-DD.pdf`

### 2. Reporte de Ventas
- **Ubicación**: Panel de Reportes → Pestaña "Ventas"
- **Datos que muestra**:
  - Número de venta
  - Cliente
  - Fecha de la venta
  - Total vendido
  - Método de pago
  - Resumen por tipo de pago
- **Exportar**: Botón "📥 Exportar a PDF" genera archivo con formato `reporte_ventas_YYYY-MM-DD.pdf`

### 3. Reporte de Clientes
- **Ubicación**: Panel de Reportes → Pestaña "Clientes"
- **Datos que muestra**:
  - Nombre del cliente
  - Cédula
  - Email
  - Teléfono
- **Exportar**: Botón "📥 Exportar a PDF" genera archivo con formato `reporte_clientes_YYYY-MM-DD.pdf`

### 4. Reporte de Utilidad por Producto
- **Ubicación**: Panel de Reportes → Pestaña "Utilidad"
- **Datos que muestra**:
  - Nombre del producto
  - Costo promedio
  - Precio de venta
  - Utilidad unitaria
  - Unidades vendidas
  - Utilidad total
  - Margen de ganancia (%)
- **Exportar**: Botón "📥 Exportar a PDF" genera archivo en orientación horizontal (landscape) con formato `reporte_utilidad_YYYY-MM-DD.pdf`

## 🔧 Funciones Principales

Todas las funciones están en `public/reportes.js`:

### Funciones de Exportación
```javascript
exportarComprasAPDF()      // Exporta reporte de compras
exportarVentasAPDF()       // Exporta reporte de ventas
exportarClientesAPDF()     // Exporta reporte de clientes
exportarUtilidadAPDF()     // Exporta reporte de utilidad
```

### Funciones de Carga de Datos
```javascript
renderReporteCompras()          // Carga y renderiza compras
cargarVentasAdmin()             // Carga y renderiza ventas
cargarClientes()                // Carga y renderiza clientes
cargarReporteUtilidad()         // Carga y renderiza utilidad
renderReporteInventario()       // Carga inventario actual
fetchVentasTemporada()          // Carga ventas por período
cargarRotacionInventario()      // Carga rotación de inventario
```

## 📱 Cómo Usar

1. **Acceder a Reportes**:
   - En el panel de administración, ir a: `Reportes` → Sub-menú de reportes

2. **Generar un Reporte**:
   - Hacer click en la pestaña del reporte deseado
   - Los datos se cargan automáticamente
   - Se muestra una tabla con toda la información

3. **Exportar a PDF**:
   - Hacer click en el botón "📥 Exportar a PDF"
   - El navegador descargará automáticamente el archivo PDF
   - El archivo se guarda en la carpeta de descargas del usuario

## 🎨 Características de Exportación

- ✅ Exportación a PDF con librería **html2pdf.js**
- ✅ Formato profesional con headers y datos formateados
- ✅ Fecha de generación en cada reporte
- ✅ Totales resumidos en cada reporte
- ✅ Tablas bien estructuradas y legibles
- ✅ Archivo se guarda automáticamente en descargas

## 📦 Dependencias

- **html2pdf.js**: Para exportación a PDF (cargado vía CDN)
- **Chart.js**: Para gráficos (ya estaba en el proyecto)
- **Endpoints API**:
  - `/api/compras` - Lista de compras
  - `/api/admin/ventas` - Lista de ventas
  - `/api/admin/clientes` - Lista de clientes
  - `/api/reportes/utilidad-productos` - Utilidad por producto
  - `/api/reportes/inventario-actual` - Inventario actual
  - `/api/reportes/rotacion-inventario` - Rotación de inventario

## 🚀 Próximas Mejoras (Opcional)

- [ ] Filtros por fecha en reportes
- [ ] Exportación a Excel
- [ ] Gráficos interactivos en reportes
- [ ] Reportes programados por email
- [ ] Comparativa mes a mes

---

**Última actualización**: 14 de Noviembre 2025
**Versión**: 1.0
