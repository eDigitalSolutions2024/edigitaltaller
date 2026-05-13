const fs = require("fs");
const path = require("path");

const raw = require("./clientes.json");

// Buscar la tabla clientes dentro del JSON exportado por phpMyAdmin
const tablaClientes = raw.find(
  (item) => item.type === "table" && item.name === "clientes"
);

if (!tablaClientes || !Array.isArray(tablaClientes.data)) {
  throw new Error("No se encontró data de la tabla clientes en el JSON.");
}

const clientesSQL = tablaClientes.data;

function limpiar(valor) {
  if (valor === null || valor === undefined) return undefined;
  const texto = String(valor).trim();
  return texto === "" || texto.toLowerCase() === "null" ? undefined : texto;
}

function mapTipoCliente(tipo) {
  const t = limpiar(tipo);

  // Según tu SQL:
  // 0 = Particular
  // 1 = Empresa Privada
  // 2 = Empresa Arrendadora
  // 3 = Empresa Gobierno

  if (t === "1") return "Empresa Privada";
  if (t === "2") return "Empresa Arrendadora";
  if (t === "3") return "Empresa Gobierno";

  return "Particular";
}

function objetoConDatos(obj) {
  return Object.values(obj).some((v) => v !== undefined);
}

const clientesMongo = clientesSQL.map((c) => {
  const tipoCliente = mapTipoCliente(c.tipo_cliente);

  const telefono = {
    lada: limpiar(c.telefono_lada),
    numero: limpiar(c.telefono),
    extension: limpiar(c.extension),
  };

  const celular = {
    lada: limpiar(c.celular_lada),
    numero: limpiar(c.celular),
  };

  const direccion = {
    calle: limpiar(c.direccion),
    numeroExterior: limpiar(c.numero_casa),
    numeroInterior: limpiar(c.numero_interior),
    colonia: limpiar(c.colonia),
    codigoPostal: limpiar(c.codigo_postal),
    ciudad: limpiar(c.ciudad),
    estado: limpiar(c.estado),
  };

  const cliente = {
    sqlId: limpiar(c.id),
    tipoCliente,

    nombre: limpiar(c.nombre_cliente),
    apellidoPaterno: limpiar(c.apellido_paterno),
    apellidoMaterno: limpiar(c.apellido_materno),
    email: limpiar(c.correo)?.toLowerCase(),

    rfc: limpiar(c.rfc)?.toUpperCase(),

    asesorResponsable: limpiar(c.asesor_responsable),
    condicionesPago: limpiar(c.forma_pago || c.dias_credito),
    observaciones: limpiar(c.observaciones_especiales),

    facturacion: {
      mismaQueDireccion: true,
    },
  };

  if (objetoConDatos(telefono)) cliente.telefono = telefono;
  if (objetoConDatos(celular)) cliente.celular = celular;
  if (objetoConDatos(direccion)) cliente.direccion = direccion;

  if (tipoCliente === "Empresa Privada" || tipoCliente === "Empresa Arrendadora") {
    cliente.empresa = {
      razonSocial: limpiar(c.nombre_cliente || c.nombre_sub_cliente),
      contacto: {
        nombre: limpiar(c.nombre_contacto_empresa || c.nombre_contacto_principal),
        correo: limpiar(c.correo_arrendadora)?.toLowerCase(),
        telefono: {
          lada: limpiar(c.telefono_lada_arrendadora),
          numero: limpiar(c.telefono_arrendadora),
          extension: limpiar(c.extension_arrendadora),
        },
        celular: {
          lada: limpiar(c.celular_lada_arrendadora),
          numero: limpiar(c.celular_arrendadora),
        },
        departamento: limpiar(c.departamento_arrendadora),
        puesto: limpiar(c.puesto_arrendadora),
      },
    };
  }

  if (tipoCliente === "Empresa Gobierno") {
    cliente.gobierno = {
      nombreGobierno: limpiar(c.nombre_cliente || c.nombre_sub_cliente),
      contactoGobierno: {
        nombre: limpiar(c.nombre_contacto_principal),
        correo: limpiar(c.correo)?.toLowerCase(),
        telefono,
        celular,
        departamento: limpiar(c.departamento),
        puesto: limpiar(c.puesto),
      },
    };
  }

  return JSON.parse(JSON.stringify(cliente));
});

const salida = path.join(__dirname, "clientes_mongo.json");

fs.writeFileSync(salida, JSON.stringify(clientesMongo, null, 2), "utf8");

console.log(`Clientes SQL encontrados: ${clientesSQL.length}`);
console.log(`Clientes convertidos: ${clientesMongo.length}`);
console.log(`Archivo generado: ${salida}`);