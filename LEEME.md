# Samples Management & Evidence Center · CESANTONI Somos Logística

| Liga | Para quién |
|---|---|
| https://samples-cesantoni.github.io/ | CESANTONI (supervisión) y Bodega / ARMEX (operación). Cada quien entra con su correo y ve solo su menú. |

Igual que proveedores y movimientos:

| Parte | Servicio |
|---|---|
| Página | GitHub Pages (este repositorio) |
| Accesos | Firebase Authentication (proyecto `proveedores-cesantoni`) |
| Datos, fotos y bitácora | Cloud Firestore, colecciones propias con prefijo `sc_` (no toca `pv_` ni `sm_`) |
| Permisos | Reglas de Firestore (`firestore.rules`, bloque «Samples») |
| Correos a clientes | Gmail por el Apps Script «Correo proveedores CESANTONI», con EmailJS de respaldo |
| Sincronización con la base de Samples, recordatorios y copia a la base de evidencias | Apps Script `apps-script/Samples.gs` (corre en Google, sin navegador abierto) |

## Puesta en marcha (una sola vez)

1. **Reglas de Firestore**: consola de Firebase › Firestore Database › Reglas › pega **todo** `firestore.rules` de este repositorio › Publicar.
   El archivo ya incluye, sin cambios, los bloques de proveedores y movimientos, y agrega el de Samples al final.
   Copia el mismo archivo al repositorio `proveedores-cesantoni.github.io` para que no se pierda en la próxima actualización.
2. **Dominio autorizado**: Authentication › Settings › Authorized domains › agrega `samples-cesantoni.github.io`.
3. **EmailJS** (respaldo): Account › Security › Allowed origins › agrega `https://samples-cesantoni.github.io`.
4. **Primer administrador**: abre la liga. La primera vez pide crear el administrador de CESANTONI con correo y contraseña.
   Si el correo ya tiene cuenta en proveedores o movimientos, se usa la misma contraseña.
5. **Usuarios**: en *Configuración › Usuarios por área*, el administrador da de alta a cada persona con perfil
   *Bodega (ARMEX)*, *CESANTONI* o *CESANTONI · administrador* y le asigna una contraseña temporal. La persona la cambia al entrar.
6. **Apps Script** (sincronización automática y recordatorios):
   - En https://script.google.com, con la cuenta dueña del proyecto de Firebase y de las bases de Sheets, crea el proyecto «Samples CESANTONI».
   - Pega `apps-script/Samples.gs`. En *Configuración del proyecto* marca «Mostrar appsscript.json» y pega `apps-script/appsscript.json`.
   - Ejecuta `instalar` una vez y autoriza los permisos. Crea los activadores: sincronizar cada 15 min, recordatorios cada hora y copia a la base de evidencias cada 30 min.
   - Mientras tanto, CESANTONI puede cargar las solicitudes a mano en *Configuración › Importar la exportación de Sample Request (.xlsx)*. No se duplican folios.
7. **Correos a clientes**: arrancan en **modo PRUEBA**. En *Configuración › Modo de correos a clientes* escribe un destinatario de prueba, revisa las tarjetas
   y, cuando estén aprobadas, un administrador cambia a **PRODUCCIÓN**. Sin destinatario de prueba, los correos quedan «En cola — no enviado».
8. **Copia a «Base Sample Evidence & Costs»**: cuando quieras activarla, cambia `ESCRIBIR_EN_BASE: true` en `Samples.gs`.
   Antes de escribir, el script verifica los encabezados de cada hoja; si alguno cambió, no escribe nada.

## Perfiles

| Perfil | Qué hace | Qué no puede (bloqueado por las reglas, no solo oculto) |
|---|---|---|
| Bodega (ARMEX) | Captura rápida, evidencias con cámara, carga masiva de evidencias (ZIP con una carpeta por folio), inventario (consulta), guías con OCR, entregas, QR y etiquetas | Cambiar estatus, aprobar evidencias, leer costos, facturas, correos del cliente o avisos, subir existencias, borrar bitácora |
| CESANTONI | Todo lo anterior, más dashboard, validación, estatus oficial, correos, avisos, facturación USD, reportes y expedientes con finanzas | Dar de alta usuarios ni activar correos en producción |
| CESANTONI · administrador | Todo, más usuarios por área y activar el envío real a clientes | — |

En pantallas, PDF, Excel, etiquetas y correos solo aparece el área (CESANTONI / Warehouse / System), nunca el nombre de una persona.
El registro técnico de quién hizo qué se guarda en `sc_seguridad`, que solo leen los administradores desde la consola.

## Inventario (lo lleva la plataforma)

- Desde el primer uso de esta versión (`inventoryFrom` en *sc_config/ajustes*) la plataforma lleva las existencias; la base de Sheets ya no las sobrescribe.
- Cada folio que llega después se **descuenta al llegar**, línea por línea, del artículo del mismo modelo y color (prefiere corte o pieza completa
  según lo pedido) y de su mueble/posición en el inventario físico. Queda como movimiento «Descuento al llegar» en el folio y en *Inventario*.
- Si el folio se **cancela** o CESANTONI marca «No descontar inventario de este folio», las piezas **regresan** solas.
- Los folios anteriores ya los había descontado la base y no se descuentan otra vez.
- **Entradas y conteos:** en *Inventario*, CESANTONI usa **Ajustar** en el artículo, escribe la nueva existencia y el motivo; queda registrado.
- Lo hace la sesión de CESANTONI al abrir la plataforma o el Apps Script (`sincronizar`, cada 15 min), lo que ocurra primero; mismos ids, nunca dos veces.

## Carga masiva de evidencias

*Operación › Carga masiva de evidencias* recibe un ZIP con una carpeta por folio (`SMCES-005` o `SMCES-0005`) o varias fotos sueltas.
- El folio sale del nombre de la carpeta o del archivo; el tipo, de palabras en el nombre (guía/etiqueta, caja, embalaje, material, preparación…).
- Para las fotos cuyo nombre no dice qué son, se elige un tipo para todas («Tipo para las fotos sin tipo») o foto por foto.
- Una foto que ya se subió al mismo folio y tipo se salta sola, aunque se vuelva a cargar el mismo ZIP.

## Estatus automático «Shipped»

Cuando un folio tiene **número de guía capturado y foto de la guía** (en cualquier orden, la capture Bodega o CESANTONI), pasa solo a **Shipped**
si estaba en Received, Preparing o Prepared y su modo de entrega es paquetería o aún no está definido. Queda en el historial como cambio de *System*.
Las reglas de Firestore permiten a Bodega únicamente ese cambio, y solo si el folio ya tiene guía.

## Rastreo UPS y correos automáticos

- El Apps Script (`rastreo`, cada 30 min) consulta UPS por cada folio con guía UPS que no se ha entregado. En *Envíos y guías* aparece la fecha y el estatus de la paquetería
  (etiqueta azul; verde cuando se entrega), y la fecha estimada que da UPS queda marcada como «carrier».
- UPS en tránsito → el folio pasa solo a **In Transit** (sin correo). UPS entregado → pasa a **Delivered** con la fecha de entrega.
- El correo al cliente de cada cambio automático **Shipped** y **Delivered** sale solo, con las mismas reglas de PRUEBA / PRODUCCIÓN que cualquier correo.
  Lo envía la primera sesión de CESANTONI que esté abierta o, si no hay ninguna, el Apps Script. Nunca sale dos veces.
- Credenciales de UPS (gratis): en https://developer.ups.com crea una app con el producto **Tracking**. En el proyecto de Apps Script:
  *Configuración del proyecto › Propiedades del script* › agrega `UPS_CLIENT_ID` y `UPS_CLIENT_SECRET`. Después ejecuta `instalar` otra vez.
  Sin credenciales, el rastreo no consulta UPS, pero los correos automáticos sí se envían.

## Capacidad (plan gratuito de Firebase, compartido con proveedores y movimientos)

- Las fotos se guardan dentro de Firestore, por partes, igual que los documentos de proveedores. Se reducen a 1600 px, unos 150–300 KB cada una, y el límite por archivo es de 5 MB.
- El almacenamiento gratuito es de **1 GiB para los tres sistemas juntos**. Con unas 8 fotos por solicitud son unas 400–600 solicitudes con evidencia completa.
  Si se acerca al límite: pasar el proyecto al plan Blaze (pago por uso) o mover las fotos a Google Drive.
- La plataforma lee solo lo que cambió desde la última consulta, para cuidar el límite diario de lecturas.

## Versión

`version.txt` sube de número con cada publicación. La página la compara al abrir y se recarga sola si hay una versión nueva.
