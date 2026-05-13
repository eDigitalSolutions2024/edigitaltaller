const puppeteer = require('puppeteer');
const dayjs = require('dayjs');

exports.generarPresupuestoPDF = async (res, orden) => {
  try {
    const browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();

    // 1. Formatear Fechas y Datos Generales
    const fechaActual = dayjs().format('DD/MM/YYYY');
    const horaActual = dayjs().format('hh:mm a');

    // 2. Consolidar Conceptos (Refacciones + Mano de Obra) para la tabla principal
    // Mapeamos ambos arreglos a un formato uniforme para la tabla del PDF
    const itemsRefacciones = (orden.presupuesto || []).map(r => ({
      cant: r.cant,
      desc: `${r.concepto} ${r.refaccion ? '- ' + r.refaccion : ''}`,
      precio: Number(r.precioVenta || 0),
      total: Number(r.cant || 0) * Number(r.precioVenta || 0)
    }));

    const itemsManoObra = (orden.manoObra || []).map(m => ({
      cant: 1, // Por defecto 1 servicio
      desc: m.concepto,
      precio: Number(m.precioVenta || 0),
      total: Number(m.precioVenta || 0)
    }));

    const todosLosServicios = [...itemsRefacciones, ...itemsManoObra];

    // 3. Cálculos de Totales
    const subtotal = todosLosServicios.reduce((acc, item) => acc + item.total, 0);
    const iva = subtotal * 0.08; // Ajustar al 0.16 o 0.08 según tu zona (Juárez suele ser 8%)
    const totalFinal = subtotal + iva;

    const htmlContent = `
    <html>
      <head>
        <style>
          @page { size: Letter; margin: 10mm; }
          body { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 10px; color: #333; margin: 0; padding: 0; }
          
          /* Encabezado Estilo L18 */
          .header-container { display: flex; justify-content: space-between; margin-bottom: 10px; }
          .brand-box { width: 30%; }
          .brand-name { color: #0047ba; font-size: 22px; font-weight: bold; margin: 0; }
          .brand-sub { font-size: 9px; font-style: italic; }
          
          .info-box { width: 40%; text-align: center; font-size: 9px; }
          .os-box { width: 25%; text-align: right; }
          .os-label { color: #0047ba; font-size: 16px; font-weight: bold; }
          .os-folio { color: red; font-size: 18px; font-weight: bold; }

          /* Tablas de Datos del Cliente */
          .data-table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
          .data-table td { border: 1px solid #000; padding: 4px; vertical-align: top; }
          .label { background-color: #f2f2f2; font-weight: bold; width: 15%; }
          .value { width: 35%; }

          /* Tabla de Presupuesto Principal */
          .main-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          .main-table th { background-color: #444; color: white; padding: 6px; border: 1px solid #000; }
          .main-table td { border: 1px solid #ccc; padding: 6px; text-align: center; }
          .text-left { text-align: left !important; }
          .text-right { text-align: right !important; }

          /* Bloque de Totales y Observaciones */
          .footer-flex { display: flex; justify-content: space-between; margin-top: 15px; }
          .obs-area { width: 65%; border: 1px solid #000; padding: 8px; min-height: 60px; }
          .totals-area { width: 30%; }
          .total-row { display: flex; justify-content: space-between; padding: 4px; border-bottom: 1px solid #eee; }
          .grand-total { font-size: 14px; font-weight: bold; background: #eee; padding: 5px; }

          /* Legales L18 */
          .legal-text { font-size: 8px; margin-top: 15px; line-height: 1.2; }
          .brands-footer { margin-top: 20px; text-align: center; border-top: 1px solid #eee; padding-top: 10px; opacity: 0.7; }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div class="brand-box">
            <p class="brand-name">Servillantero</p>
            <p class="brand-sub">Profesionales al servicio de su automóvil</p>
          </div>
          <div class="info-box">
            Paseo Triunfo de la República No. 322-B, Col. San Lorenzo<br>
            Cd. Juárez, Chihuahua. CP 32320<br>
            Tels: (656) 623 56 51 al 54
          </div>
          <div class="os-box">
            <div class="os-label">PRESUPUESTO</div>
            <div class="os-folio">L-${orden._id.toString().slice(-4).toUpperCase()}</div>
          </div>
        </div>

        <table class="data-table">
          <tr>
            <td class="label">CLIENTE:</td>
            <td class="value">${orden.clienteNombre || 'PRUEBA'}</td>
            <td class="label">RECEPCIÓN:</td>
            <td class="value">${fechaActual} A LAS ${horaActual}</td>
          </tr>
          <tr>
            <td class="label">DIRIGIDO A:</td>
            <td class="value">${orden.dirigidoA || 'N/A'}</td>
            <td class="label">DEPARTAMENTO:</td>
            <td class="value">${orden.departamento || 'N/A'}</td>
          </tr>
          <tr>
            <td class="label">VEHÍCULO:</td>
            <td class="value">${orden.marca} ${orden.modelo} ${orden.anio}</td>
            <td class="label">PLACAS / SERIE:</td>
            <td class="value">${orden.placas || 'N/A'} / ${orden.serie || 'N/A'}</td>
          </tr>
        </table>

        <table class="main-table">
          <thead>
            <tr>
              <th style="width: 8%;">Cant.</th>
              <th class="text-left">Descripción del Servicio y/o Reparación</th>
              <th style="width: 12%;">Precio</th>
              <th style="width: 10%;">IVA</th>
              <th style="width: 12%;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${todosLosServicios.map(item => `
              <tr>
                <td>${item.cant}</td>
                <td class="text-left">${item.desc}</td>
                <td class="text-right">$${item.precio.toFixed(2)}</td>
                <td class="text-right">$${(item.total * 0.08).toFixed(2)}</td>
                <td class="text-right">$${(item.total * 1.08).toFixed(2)}</td>
              </tr>
            `).join('')}
            ${todosLosServicios.length < 8 ? Array(8 - todosLosServicios.length).fill(0).map(() => `
              <tr><td style="color:white">.</td><td></td><td></td><td></td><td></td></tr>
            `).join('') : ''}
          </tbody>
        </table>

        <div class="footer-flex">
          <div class="obs-area">
            <strong>Observaciones:</strong><br>
            ${orden.servicioReparacion?.revisionFallas || 'Sin observaciones adicionales.'}
          </div>
          <div class="totals-area">
            <div class="total-row"><span>Subtotal:</span> <span>$${subtotal.toFixed(2)}</span></div>
            <div class="total-row"><span>I.V.A.:</span> <span>$${iva.toFixed(2)}</span></div>
            <div class="total-row grand-total"><span>Total:</span> <span>$${totalFinal.toFixed(2)}</span></div>
          </div>
        </div>

        <div class="legal-text">
          <p><strong>TODOS NUESTROS SERVICIOS INCLUYEN MANO DE OBRA Y REFACCIONES</strong></p>
          <p>Importante: La presente cotización tiene una vigencia de 15 días a partir de esta fecha y está sujeta a cambios sin previo aviso, así mismo a la variación del dólar.</p>
          <p>Garantía: Nuestras reparaciones están garantizadas por noventa (90) días en condiciones de uso normal y que no hayan sido intervenidas por terceros. No hay garantía en partes eléctricas y/o usadas, ni en bombas de gasolina.</p>
        </div>

        <div class="brands-footer">
          MICHELIN • BFGOODRICH • PIRELLI • GOODYEAR • CONTINENTAL • DUNLOP • EUZKADI
        </div>
      </body>
    </html>`;

    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({ 
      format: 'Letter', 
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
    });

    await browser.close();
    res.contentType("application/pdf");
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error Generar PDF:', error);
    res.status(500).send('Error al generar el documento PDF');
  }
};