// Interface language (ES / EN). Generated documents, emails, labels and exports are
// always English and do NOT use this dictionary.
const D = {
  // shell & nav
  'nav.operation': ['Operation', 'Operación'], 'nav.control': ['Control', 'Control'], 'nav.finance': ['Finance & analytics', 'Finanzas y análisis'], 'nav.admin': ['Administration', 'Administración'],
  'nav.dashboard': ['Dashboard', 'Dashboard'], 'nav.requests': ['Requests', 'Solicitudes'], 'nav.inventory': ['Inventory', 'Inventario'], 'nav.capture': ['Quick capture', 'Captura rápida'],
  'nav.validation': ['Evidence validation', 'Validación de evidencias'], 'nav.status': ['Status change', 'Cambio de estatus'], 'nav.shipments': ['Shipments & tracking', 'Envíos y guías'],
  'nav.labels': ['QR & labels', 'QR y etiquetas'], 'nav.notices': ['Operational notices', 'Avisos operativos'], 'nav.emails': ['Notifications', 'Notificaciones'],
  'nav.alerts': ['Alerts', 'Alertas'], 'nav.duplicates': ['Duplicates', 'Duplicados'], 'nav.billing': ['Monthly billing', 'Facturación mensual'], 'nav.reports': ['Reports', 'Reportes'],
  'nav.bulk': ['Bulk evidence upload', 'Carga masiva de evidencias'], 'nav.activity': ['Activity log', 'Bitácora'], 'nav.settings': ['Settings', 'Configuración'],
  // bulk evidence upload
  'bk.title': ['Bulk evidence upload', 'Carga masiva de evidencias'],
  'bk.sub': ['Upload a ZIP with one folder per request (or several photos). Each photo is matched to its request and evidence type.', 'Sube un ZIP con una carpeta por folio (o varias fotos). Cada foto se acomoda en su folio y tipo de evidencia.'],
  'bk.zip': ['Choose ZIP', 'Elegir ZIP'], 'bk.photos': ['Choose photos', 'Elegir fotos'],
  'bk.hint': ['The request is taken from the folder or file name (e.g. SMCES-005 or SMCES-0005). The type is taken from words in the name (label/guía, box/caja, packaging/embalaje, material, preparation/preparación…). Shipping labels are read on this device to confirm the request and tracking number. Review everything before uploading.', 'El folio se toma del nombre de la carpeta o del archivo (por ejemplo SMCES-005 o SMCES-0005). El tipo se toma de palabras en el nombre (guía/etiqueta, caja, embalaje, material, preparación…). Las etiquetas de paquetería se leen en este equipo para confirmar el folio y la guía. Revisa todo antes de subir.'],
  'bk.review': ['Review', 'Revisión'], 'bk.reviewHint': ['Choose the request and type where they are missing. Photos already uploaded are skipped automatically.', 'Elige el folio y el tipo donde falten. Las fotos que ya se subieron antes se saltan solas.'],
  'bk.upload': ['Upload', 'Subir'], 'bk.file': ['File', 'Archivo'], 'bk.detected': ['Read from label', 'Leído de la etiqueta'],
  'bk.reading': ['Reading label…', 'Leyendo etiqueta…'], 'bk.labelSays': ['Label reference:', 'Referencia en la etiqueta:'],
  'bk.conflict': ['The label belongs to another request — confirm the request', 'La etiqueta es de otro folio — confirma el folio'],
  'bk.check': ['Check request', 'Revisar folio'], 'bk.use': ['Use', 'Usar'], 'bk.ready': ['Ready', 'Lista'], 'bk.missing': ['Missing request or type', 'Falta folio o tipo'],
  'bk.uploading': ['Uploading', 'Subiendo'], 'bk.done': ['Uploaded', 'Subida'], 'bk.dup': ['Already uploaded', 'Ya estaba subida'], 'bk.failed': ['with errors', 'con error'],
  'bk.summary': ['Bulk upload', 'Carga masiva'], 'bk.none': ['No photos or PDFs found', 'No se encontraron fotos ni PDF'], 'bk.badZip': ['The ZIP file could not be read', 'No se pudo leer el ZIP'],
  'menu.toggle': ['Toggle menu', 'Mostrar u ocultar menú'], 'logout': ['Sign out', 'Cerrar sesión'],
  'area.CESANTONI': ['CESANTONI', 'CESANTONI'], 'area.BODEGA': ['WAREHOUSE · ARMEX', 'BODEGA · ARMEX'],
  'demo.banner': ['Customer emails are NOT being sent: TEST mode without a test recipient, or no email service configured (Settings). Queued messages are never shown as sent.', 'Los correos a clientes NO se están enviando: modo PRUEBA sin destinatario de prueba, o sin servicio de correo configurado (Configuración). Los mensajes en cola nunca se muestran como enviados.'],
  'test.banner': ['EMAIL TEST MODE — messages are redirected to the configured test recipient, never to customers.', 'MODO DE PRUEBA DE CORREO — los mensajes se redirigen al destinatario de prueba, nunca a clientes.'],
  // login
  'login.title': ['Samples Management & Evidence Center', 'Samples Management & Evidence Center'],
  'login.tagline': ['One source of truth for sample requests: preparation, evidence, shipping, notifications and billing.', 'Una sola fuente de información para solicitudes de muestras: preparación, evidencias, envíos, notificaciones y facturación.'],
  'login.signin': ['Sign in', 'Iniciar sesión'], 'login.sub': ['Use the access assigned to your area.', 'Utilice el acceso asignado a su área.'],
  'login.user': ['User', 'Usuario'], 'login.password': ['Password', 'Contraseña'], 'login.invalid': ['Invalid user or password.', 'Usuario o contraseña incorrectos.'],
  'login.email': ['Email', 'Correo'], 'login.setupTitle': ['Create the first administrator', 'Crear el primer administrador'],
  'login.setupSub': ['Samples has no administrator yet. This account will belong to CESANTONI and can add the other users.', 'Samples aún no tiene administrador. Esta cuenta será de CESANTONI y podrá dar de alta a los demás usuarios.'],
  'login.setupBtn': ['Create administrator', 'Crear administrador'], 'login.pwRule': ['At least 10 characters, with letters and numbers.', 'Al menos 10 caracteres, con letras y números.'],
  'login.forgot': ['Forgot your password?', '¿Olvidaste tu contraseña?'], 'login.forgotSub': ['We will email you a link to create a new password.', 'Te enviaremos por correo una liga para crear una nueva contraseña.'],
  'login.send': ['Send link', 'Enviar liga'], 'login.forgotSent': ['If the email has access, it will receive a link to create a new password.', 'Si el correo tiene acceso, recibirá una liga para crear una nueva contraseña.'],
  'login.changeTitle': ['Change your temporary password', 'Cambia tu contraseña temporal'], 'login.changeSub': ['For security, set your own password before continuing.', 'Por seguridad, define tu propia contraseña antes de continuar.'],
  'login.current': ['Current password', 'Contraseña actual'], 'login.new': ['New password', 'Nueva contraseña'],
  'login.noAccess': ['This account does not have access to Samples. Ask a CESANTONI administrator to add you.', 'Esta cuenta no tiene acceso a Samples. Pide a un administrador de CESANTONI que te dé de alta.'],
  'set.users': ['Users by area', 'Usuarios por área'], 'set.usersSub': ['Only the area is shown in the platform; the email is used to sign in.', 'En la plataforma solo se muestra el área; el correo se usa para iniciar sesión.'],
  'set.addUser': ['Add user', 'Agregar usuario'], 'set.tempPw': ['Temporary password', 'Contraseña temporal'], 'set.role': ['Profile', 'Perfil'],
  'role.admin': ['CESANTONI · administrator', 'CESANTONI · administrador'], 'role.cesantoni': ['CESANTONI', 'CESANTONI'], 'role.bodega': ['Warehouse (ARMEX)', 'Bodega (ARMEX)'],
  'set.active': ['Active', 'Activo'], 'set.invited': ['Invited (uses the password of their existing account)', 'Invitado (entra con la contraseña de su cuenta existente)'],
  'set.emailMode': ['Customer email mode', 'Modo de correos a clientes'], 'set.modeTest': ['TEST — every email goes to the test recipient', 'PRUEBA — todos los correos van al destinatario de prueba'],
  'set.modeProd': ['PRODUCTION — emails go to the customer on the request', 'PRODUCCIÓN — los correos van al cliente de la solicitud'], 'set.testRecipient': ['Test recipient', 'Destinatario de prueba'],
  'set.import': ['Import the Sample Request export (.xlsx)', 'Importar la exportación de Sample Request (.xlsx)'],
  'set.importSub': ['Backup of the automatic synchronization: download «Base Sample Request CESANTONI - English» as .xlsx and upload it here. Existing requests are not duplicated.', 'Respaldo de la sincronización automática: descarga «Base Sample Request CESANTONI - English» como .xlsx y súbela aquí. No se duplican folios.'],
  'set.importBtn': ['Import', 'Importar'], 'set.password': ['My password', 'Mi contraseña'],
  'det.baseDeducts': ['The Sample Request base deducts stock automatically for every request. Here you see what it deducted, from which location, and the remaining stock.', 'La base de Sample Request descuenta el inventario automáticamente por cada folio. Aquí ves lo que descontó, de qué ubicación y la existencia que queda.'],
  'det.deducted': ['Deducted', 'Descontado'], 'det.deductedOk': ['Deducted by the base', 'Descontado por la base'], 'det.notDeducted': ['Not deducted yet', 'Sin descuento todavía'], 'det.stockMove': ['Stock before → after', 'Existencia antes → después'],
  // common
  'common.search': ['Search', 'Buscar'], 'common.all': ['All', 'Todos'], 'common.save': ['Save', 'Guardar'], 'common.cancel': ['Cancel', 'Cancelar'], 'common.close': ['Close', 'Cerrar'],
  'common.confirm': ['Confirm', 'Confirmar'], 'common.view': ['View', 'Ver'], 'common.edit': ['Edit', 'Editar'], 'common.download': ['Download', 'Descargar'], 'common.loading': ['Loading…', 'Cargando…'],
  'common.none': ['No records found.', 'No se encontraron registros.'], 'common.na': ['Not available', 'No disponible'], 'common.from': ['From', 'Desde'], 'common.to': ['To', 'Hasta'],
  'common.year': ['Year', 'Año'], 'common.month': ['Month', 'Mes'], 'common.status': ['Status', 'Estatus'], 'common.notes': ['Notes', 'Observaciones'], 'common.date': ['Date', 'Fecha'],
  'common.area': ['Area', 'Área'], 'common.open': ['Open', 'Abrir'], 'common.clear': ['Clear', 'Limpiar'], 'common.yes': ['Yes', 'Sí'], 'common.no': ['No', 'No'], 'common.back': ['Back', 'Regresar'],
  'common.request': ['Request', 'Solicitud'], 'common.customer': ['Customer', 'Cliente'], 'common.company': ['Company', 'Empresa'], 'common.country': ['Country', 'País'], 'common.state': ['State', 'Estado'],
  'common.city': ['City', 'Ciudad'], 'common.carrier': ['Carrier', 'Paquetería'], 'common.mode': ['Delivery mode', 'Modalidad de entrega'], 'common.actions': ['Actions', 'Acciones'],
  'common.select': ['Select…', 'Seleccione…'], 'common.refresh': ['Refresh', 'Actualizar'], 'common.saved': ['Saved', 'Guardado'], 'common.error': ['Something went wrong', 'Ocurrió un error'],
  'common.filters': ['Filters', 'Filtros'], 'common.apply': ['Apply', 'Aplicar'], 'common.total': ['Total', 'Total'], 'common.qty': ['Quantity', 'Cantidad'], 'common.location': ['Location', 'Ubicación'],
  'common.model': ['Model', 'Modelo'], 'common.color': ['Color', 'Color'], 'common.size': ['Size', 'Formato'], 'common.sku': ['SKU', 'SKU'], 'common.notRegistered': ['Not registered', 'Sin registrar'],
  'common.pieces': ['Pieces', 'Piezas'], 'common.products': ['Products', 'Productos'], 'common.documentation': ['Documentation', 'Documentación'], 'common.observations': ['Observations', 'Observaciones'],
  // statuses
  'st.RECEIVED': ['Received', 'Recibida'], 'st.PREPARING': ['Preparing', 'En preparación'], 'st.PREPARED': ['Prepared', 'Preparada'], 'st.READY_FOR_PICKUP': ['Ready for pickup', 'Lista para recolección'],
  'st.SHIPPED': ['Shipped', 'Enviada'], 'st.IN_TRANSIT': ['In transit', 'En tránsito'], 'st.DELIVERED': ['Delivered', 'Entregada'], 'st.ON_HOLD': ['On hold', 'Detenida'], 'st.CANCELLED': ['Cancelled', 'Cancelada'],
  'mode.COURIER': ['Courier shipment', 'Envío por paquetería'], 'mode.PICKUP': ['Customer pickup', 'Recolección por cliente'], 'mode.WAREHOUSE': ['Warehouse delivery', 'Entrega en Bodega'], 'mode.none': ['Not defined', 'Sin definir'],
  'ev.PENDING': ['Pending review', 'En revisión'], 'ev.APPROVED': ['Approved', 'Aprobada'], 'ev.RETURNED': ['Returned', 'Devuelta'],
  'cl.MISSING': ['Missing', 'Faltante'], 'cl.PENDING_REVIEW': ['Uploaded · pending review', 'Cargada · en revisión'], 'cl.APPROVED': ['Approved', 'Aprobada'], 'cl.RETURNED': ['Returned', 'Devuelta'], 'cl.COMPLETE': ['Captured', 'Capturado'],
  'light.GREEN': ['Complete', 'Completa'], 'light.AMBER': ['Pending evidence', 'Evidencias pendientes'], 'light.RED': ['Critical missing', 'Faltan críticos'],
  // dashboard
  'dash.title': ['Logistics dashboard', 'Dashboard logístico'], 'dash.sub': ['Supervision of sample requests — figures computed only from recorded data.', 'Supervisión de solicitudes de muestras — cifras calculadas solo con registros reales.'],
  'k.total': ['Total requests', 'Total de solicitudes'], 'k.received': ['Received', 'Recibidas'], 'k.preparing': ['In preparation', 'En preparación'], 'k.prepared': ['Samples prepared', 'Muestras preparadas'],
  'k.pendingEvidence': ['Pending evidence', 'Pendientes de evidencias'], 'k.shipped': ['Shipped', 'Enviadas'], 'k.delivered': ['Delivered', 'Entregadas'], 'k.documented': ['Complete dossiers', 'Expedientes completos'],
  'k.onHold': ['On hold', 'Detenidas'], 'k.overdue': ['Overdue', 'Vencidas'], 'k.costUsd': ['Accumulated cost (USD)', 'Gastos acumulados (USD)'], 'k.invoicesPending': ['Pending invoices', 'Facturas pendientes'], 'k.invoicesRecorded': ['Recorded invoices', 'Facturas registradas'],
  'p.title': ['Performance indicators', 'Indicadores de desempeño'], 'p.avgPrep': ['Avg. preparation time', 'Tiempo promedio de preparación'], 'p.avgShip': ['Avg. time to shipment', 'Tiempo promedio hasta envío'], 'p.avgDelivery': ['Avg. time to delivery', 'Tiempo promedio hasta entrega'],
  'p.evidence': ['Complete evidence', 'Evidencias completas'], 'p.delivered': ['Confirmed deliveries', 'Entregas confirmadas'], 'p.late': ['Out of target time', 'Fuera de tiempo objetivo'], 'p.costReq': ['Avg. cost per request', 'Costo promedio por solicitud'], 'p.costCarrier': ['Avg. cost by carrier', 'Costo promedio por paquetería'],
  'p.bh': ['business hours', 'horas hábiles'],
  'ch.monthly': ['Requests received vs delivered by month', 'Solicitudes recibidas vs entregadas por mes'], 'ch.cost': ['Shipping cost by month (USD)', 'Gasto de envío por mes (USD)'], 'ch.status': ['Requests by status', 'Solicitudes por estatus'],
  'ch.carrier': ['Shipments by carrier', 'Envíos por paquetería'], 'ch.prep': ['Average preparation time by month (business h)', 'Tiempo promedio de preparación por mes (h hábiles)'], 'ch.invoiced': ['Invoiced vs recorded cost by month (USD)', 'Facturado vs gasto registrado por mes (USD)'],
  'ch.empty': ['No recorded data for this chart yet.', 'Aún no hay datos registrados para esta gráfica.'], 'ch.png': ['PNG', 'PNG'],
  // requests
  'req.title': ['Sample requests', 'Solicitudes de muestras'], 'req.sub': ['Synchronized from the original Sample Request form. Request numbers are preserved.', 'Sincronizadas desde el formulario original de Samples. Se conservan los folios.'],
  'req.searchPh': ['Request, customer, company, SKU, model, country, state, date…', 'Folio, cliente, empresa, SKU, modelo, país, estado, fecha…'], 'req.light': ['Traffic light', 'Semáforo'], 'req.activeOnly': ['Active only', 'Solo activas'],
  'req.date': ['Date & time', 'Fecha y hora'], 'req.address': ['Delivery address', 'Dirección de entrega'], 'req.count': ['requests', 'solicitudes'],
  'det.general': ['General', 'Información general'], 'det.products': ['Products', 'Productos'], 'det.inventory': ['Inventory & location', 'Inventario y ubicación'], 'det.prep': ['Preparation', 'Preparación'],
  'det.pack': ['Packaging', 'Embalaje'], 'det.ship': ['Carrier & tracking', 'Paquetería y guía'], 'det.delivery': ['Delivery', 'Entrega'], 'det.obs': ['Observations', 'Observaciones'], 'det.history': ['History', 'Historial'], 'det.docs': ['Documents', 'Documentos'],
  'det.timeline': ['Logistics timeline', 'Línea de tiempo logística'], 'det.checklist': ['Mandatory evidence checklist', 'Checklist de evidencias obligatorias'], 'det.setMode': ['Define the delivery mode to enable the full checklist.', 'Defina la modalidad de entrega para habilitar el checklist completo.'],
  'det.pdf': ['Evidence report PDF', 'Expediente PDF'], 'det.pdfFin': ['PDF with financial data', 'PDF con datos financieros'], 'det.changeStatus': ['Change status', 'Cambiar estatus'], 'det.labels': ['Labels & QR', 'Etiquetas y QR'],
  'det.phone': ['Phone', 'Teléfono'], 'det.email': ['Customer email', 'Correo del cliente'], 'det.zip': ['ZIP code', 'Código postal'], 'det.refs': ['Delivery references', 'Referencias de entrega'], 'det.sourceNotes': ['Notes from the original request', 'Notas de la solicitud original'],
  'det.reserve': ['Reserve', 'Reservar'], 'det.release': ['Release', 'Liberar'], 'det.issue': ['Register exit', 'Registrar salida'], 'det.reserved': ['Reserved', 'Reservado'], 'det.issued': ['Issued', 'Salida registrada'],
  'det.candidates': ['Matching inventory', 'Inventario coincidente'], 'det.shortage': ['Insufficient stock', 'Existencia insuficiente'], 'det.noMatch': ['No catalog item matches this model and color.', 'Ningún artículo del catálogo coincide con este modelo y color.'],
  'det.available': ['Available', 'Disponible'], 'det.preferred': ['Suggested', 'Sugerido'], 'det.qtyConfirm': ['Quantity confirmation', 'Confirmación de cantidades'], 'det.qtyConfirmBtn': ['Confirm quantities', 'Confirmar cantidades'],
  'det.addObs': ['Add observation', 'Agregar observación'], 'det.obsPh': ['Write an operational observation…', 'Escriba una observación operativa…'], 'det.noEvidence': ['No evidence uploaded for this stage yet.', 'Aún no hay evidencias para esta etapa.'],
  'det.returnedNote': ['Returned by CESANTONI', 'Devuelta por CESANTONI'], 'det.uploadCorrection': ['Upload correction', 'Cargar corrección'], 'det.superseded': ['Replaced by a newer version', 'Reemplazada por una versión nueva'],
  'det.cost': ['Shipping cost (USD) — CESANTONI only', 'Costo de envío (USD) — solo CESANTONI'], 'det.invoices': ['Linked invoices', 'Facturas vinculadas'], 'det.emails': ['Email history', 'Historial de correos'], 'det.duplicates': ['Possible duplicates', 'Posibles duplicados'],
  'det.events': ['Activity', 'Movimientos'], 'det.statusHistory': ['Status history', 'Historial de estatus'], 'det.exception': ['Authorized exception', 'Excepción autorizada'],
  // uploader / evidence
  'up.type': ['Evidence type', 'Tipo de evidencia'], 'up.camera': ['Take photo', 'Tomar fotografía'], 'up.file': ['Choose photo or PDF', 'Elegir foto o PDF'], 'up.notes': ['Notes (optional)', 'Notas (opcional)'],
  'up.save': ['Save evidence', 'Guardar evidencia'], 'up.saved': ['Evidence saved', 'Evidencia guardada'], 'up.need': ['Add at least one photo or PDF.', 'Agregue al menos una fotografía o PDF.'], 'up.processing': ['Processing image…', 'Procesando imagen…'],
  'up.unsupported': ['Unsupported format. Use JPEG, PNG, WEBP or PDF.', 'Formato no compatible. Use JPEG, PNG, WEBP o PDF.'], 'up.tooBig': ['File exceeds 5 MB.', 'El archivo supera 5 MB.'], 'up.when': ['Event date & time', 'Fecha y hora del evento'],
  // shipping
  'sh.title': ['Shipments & tracking', 'Envíos y guías'], 'sh.sub': ['Carrier data, tracking numbers and the logistics timeline per request.', 'Datos de paquetería, guías y línea de tiempo por solicitud.'],
  'sh.tracking': ['Tracking number', 'Número de guía'], 'sh.shipDate': ['Carrier drop-off date', 'Fecha de depósito'], 'sh.method': ['Shipping method / service', 'Método / servicio de envío'], 'sh.other': ['Carrier name', 'Nombre de paquetería'],
  'sh.ocr': ['Read from label photo (OCR)', 'Leer desde foto de guía (OCR)'], 'sh.ocrRun': ['Reading label…', 'Leyendo guía…'], 'sh.ocrNone': ['No tracking number could be recognized. Type it manually.', 'No se reconoció un número de guía. Captúrelo manualmente.'],
  'sh.ocrPick': ['Candidates found — select one and verify it against the label:', 'Candidatos encontrados — seleccione uno y verifíquelo contra la guía:'], 'sh.confirm': ['I verified that this tracking number matches the printed label.', 'Verifiqué que el número de guía coincide con la guía impresa.'],
  'sh.label': ['Shipping label photo', 'Fotografía de la guía'], 'sh.dropoff': ['Carrier drop-off proof', 'Comprobante de recepción por paquetería'], 'sh.estimated': ['Estimated delivery date', 'Fecha estimada de entrega'], 'sh.estimateConfirmed': ['Estimate confirmed by the carrier', 'Fecha confirmada por la paquetería'],
  'sh.track': ['Open carrier tracking', 'Consultar rastreo'], 'sh.noUrl': ['No verified tracking link for this carrier.', 'Sin enlace de rastreo verificado para esta paquetería.'], 'sh.saveShip': ['Save carrier data', 'Guardar datos de envío'],
  'sh.deliveredAt': ['Delivery date & time', 'Fecha y hora de entrega'], 'sh.result': ['Delivery result', 'Resultado de entrega'], 'sh.saveDelivery': ['Save delivery confirmation', 'Guardar confirmación de entrega'],
  'res.DELIVERED_OK': ['Delivered in good condition', 'Entregado en buen estado'], 'res.DELIVERED_WITH_ISSUES': ['Delivered with issues', 'Entregado con incidencias'], 'res.NOT_DELIVERED': ['Not delivered', 'No entregado'],
  'sh.estimateNote': ['Estimates are shown as estimates; only a recorded delivery counts as delivered.', 'Las fechas estimadas se muestran como estimadas; solo una entrega registrada cuenta como entregada.'],
  // capture
  'cap.title': ['Quick capture', 'Captura rápida'], 'cap.sub': ['Warehouse evidence from the phone camera in a few taps.', 'Evidencias de Bodega con la cámara del celular en pocos pasos.'], 'cap.searchPh': ['Request number or customer', 'Folio o cliente'],
  'cap.search': ['Search request', 'Buscar solicitud'], 'cap.material': ['View material', 'Ver material'], 'cap.inventory': ['Check inventory', 'Consultar inventario'], 'cap.prep': ['Capture preparation photo', 'Foto de preparación'],
  'cap.pack': ['Capture packaging photo', 'Foto de embalaje'], 'cap.label': ['Upload tracking label', 'Cargar guía'], 'cap.delivery': ['Upload delivery proof', 'Comprobante de entrega'], 'cap.qr': ['Download QR', 'Descargar QR'], 'cap.save': ['Save evidence', 'Guardar evidencia'],
  'cap.pick': ['Select a request to start.', 'Seleccione una solicitud para comenzar.'], 'cap.returned': ['Returned evidence to correct', 'Evidencias devueltas por corregir'],
  // validation
  'val.title': ['Evidence validation center', 'Centro de validación de evidencias'], 'val.sub': ['Warehouse uploads, CESANTONI reviews. Approving evidence does not change the official status.', 'Bodega carga y CESANTONI revisa. Aprobar una evidencia no cambia el estatus oficial.'],
  'val.approve': ['Approve evidence', 'Aprobar evidencia'], 'val.return': ['Return for correction', 'Devolver para corrección'], 'val.attachment': ['View attachment', 'Ver adjunto'], 'val.obs': ['Observations for the warehouse', 'Observaciones para Bodega'],
  'val.obsReq': ['Explain what must be corrected (required to return).', 'Explique qué debe corregirse (obligatorio para devolver).'], 'val.pending': ['Pending', 'Pendientes'], 'val.approved': ['Approved', 'Aprobadas'], 'val.returned': ['Returned', 'Devueltas'],
  // status
  'stc.title': ['Official status change', 'Cambio oficial de estatus'], 'stc.sub': ['Exclusive to CESANTONI. Each change is recorded in the history; the customer email is optional and always in English.', 'Exclusivo de CESANTONI. Cada cambio queda en el historial; el correo al cliente es opcional y siempre en inglés.'],
  's1': ['Select request', 'Seleccione el folio'], 's2': ['Current status', 'Estatus vigente'], 's3': ['New status', 'Nuevo estatus'], 's4': ['Evidence & requirements', 'Evidencias y requisitos'], 's5': ['Observations', 'Observaciones'],
  's6': ['Customer notification', 'Notificación al cliente'], 's7': ['Email preview', 'Vista previa de la tarjeta'], 's8': ['Confirm update', 'Confirmar actualización'],
  'stc.reqOk': ['All requirements met.', 'Todos los requisitos se cumplen.'], 'stc.exception': ['Authorized exception — reason (required to continue without mandatory evidence)', 'Excepción autorizada — motivo (obligatorio para continuar sin la evidencia requerida)'],
  'stc.inconsistent': ['I confirm this change even though it does not follow the normal flow.', 'Confirmo este cambio aunque no sigue el flujo normal.'], 'stc.obsHint': ['Written in English if the customer will be notified.', 'Escríbalas en inglés si se notificará al cliente.'],
  'stc.notify': ['Notify the customer by email', 'Notificar al cliente por correo'], 'stc.recipient': ['Recipient (from the original request)', 'Destinatario (de la solicitud original)'], 'stc.preview': ['Preview email', 'Vista previa del correo'],
  'stc.apply': ['Confirm status update', 'Confirmar actualización de estatus'], 'stc.done': ['Status updated', 'Estatus actualizado'], 'stc.confirmQ': ['Apply this status change?', '¿Aplicar este cambio de estatus?'],
  'stc.emailResult': ['Email result', 'Resultado del correo'], 'stc.noEmailMode': ['No valid customer email on the request — notification unavailable.', 'La solicitud no tiene un correo válido — notificación no disponible.'],
  'mail.SENT': ['Sent', 'Enviado'], 'mail.QUEUED': ['Queued — not sent', 'En cola — no enviado'], 'mail.FAILED': ['Failed', 'Fallido'], 'mail.SENDING': ['Sending', 'Enviando'], 'mail.retry': ['Retry', 'Reintentar'],
  // notices
  'nt.title': ['Operational notices', 'Avisos operativos'], 'nt.sub': ['Holidays, closures and delays that may affect requests. Closures stop the operational clock.', 'Días festivos, cierres y retrasos que pueden afectar solicitudes. Los cierres detienen el reloj operativo.'],
  'nt.new': ['New notice', 'Nuevo aviso'], 'nt.type': ['Notice type', 'Tipo de aviso'], 'nt.start': ['Start date', 'Fecha inicial'], 'nt.end': ['End date', 'Fecha final'], 'nt.message': ['Message to customers (English)', 'Mensaje para clientes (inglés)'],
  'nt.scope': ['Scope', 'Alcance'], 'nt.one': ['One request', 'Una solicitud'], 'nt.allActive': ['All active requests', 'Todas las solicitudes activas'], 'nt.notify': ['Email the affected customers', 'Enviar correo a los clientes afectados'],
  'nt.initial': ['Initial send date', 'Fecha de envío inicial'], 'nt.reminders': ['Schedule reminders (server-side)', 'Programar recordatorios (en el servidor)'], 'nt.freq': ['Every (days)', 'Cada (días)'], 'nt.until': ['Until', 'Hasta'],
  'nt.preview': ['Calculate recipients & preview', 'Calcular destinatarios y previsualizar'], 'nt.recipients': ['Calculated recipients', 'Destinatarios calculados'], 'nt.excluded': ['Excluded', 'Excluidas'], 'nt.register': ['Register notice', 'Registrar aviso'],
  'nt.history': ['Notice history', 'Historial de avisos'], 'nt.stop': ['Stop reminders', 'Detener recordatorios'], 'nt.cancelNotice': ['Cancel notice', 'Cancelar aviso'], 'nt.next': ['Next send', 'Próximo envío'],
  'nt.example': ['Due to a public holiday, our warehouse operations will be temporarily suspended. Sample preparation and shipping activities will resume on the next scheduled business day.', 'Due to a public holiday, our warehouse operations will be temporarily suspended. Sample preparation and shipping activities will resume on the next scheduled business day.'],
  'cat.PUBLIC_HOLIDAY': ['Public Holiday', 'Día festivo'], 'cat.WAREHOUSE_CLOSURE': ['Warehouse Closure', 'Cierre de Bodega'], 'cat.OPERATIONAL_DELAY': ['Operational Delay', 'Retraso operativo'], 'cat.TEMPORARY_SUSPENSION': ['Temporary Suspension', 'Suspensión temporal'], 'cat.GENERAL_NOTICE': ['General Notice', 'Aviso general'], 'cat.OTHER': ['Other', 'Otro'],
  // emails
  'em.title': ['Customer notifications', 'Notificaciones a clientes'], 'em.sub': ['Every email with its real delivery result. Queued messages are not sent.', 'Cada correo con su resultado real. Los mensajes en cola no se han enviado.'], 'em.to': ['Recipient', 'Destinatario'], 'em.subject': ['Subject', 'Asunto'], 'em.type': ['Type', 'Tipo'], 'em.reason': ['Detail', 'Detalle'],
  // alerts
  'al.title': ['Smart alerts', 'Centro de alertas'], 'al.sub': ['Detected automatically from real dates, business hours, holidays and registered closures.', 'Detectadas automáticamente con fechas reales, horario hábil, festivos y cierres registrados.'],
  'sev.CRITICAL': ['Critical', 'Crítica'], 'sev.WARNING': ['Attention', 'Atención'], 'sev.INFO': ['Info', 'Info'],
  'at.NOT_PREPARED': ['Not prepared', 'Sin preparación'], 'at.OVERDUE': ['Out of target time', 'Fuera de tiempo'], 'at.MISSING_EVIDENCE': ['Missing evidence', 'Falta evidencia'], 'at.TRACKING_PENDING': ['Tracking pending', 'Guía pendiente'],
  'at.DROPOFF_MISSING': ['Carrier proof missing', 'Falta comprobante de paquetería'], 'at.DELIVERY_UNCONFIRMED': ['Delivery to confirm', 'Entrega por confirmar'], 'at.EVIDENCE_RETURNED': ['Evidence returned', 'Evidencia devuelta'], 'at.ON_HOLD': ['On hold', 'Detenida'],
  'at.MODE_MISSING': ['Delivery mode missing', 'Modalidad sin definir'], 'at.INVENTORY_SHORTAGE': ['Inventory shortage', 'Faltante de inventario'], 'at.PENDING_REVIEW': ['Awaiting validation', 'Por validar'], 'at.POSSIBLE_DUPLICATE': ['Possible duplicate', 'Posible duplicado'],
  'at.EMAIL_FAILED': ['Email failed', 'Correo fallido'], 'at.EMAIL_QUEUED': ['Email queued', 'Correo en cola'],
  // duplicates
  'dup.title': ['Duplicate request detector', 'Detector de solicitudes duplicadas'], 'dup.sub': ['Compares active requests (customer, company, address, products, quantities, dates). Nothing is cancelled automatically.', 'Compara solicitudes activas (cliente, empresa, dirección, productos, cantidades, fechas). Nada se cancela automáticamente.'],
  'dup.not': ['Not a duplicate', 'No es duplicado'], 'dup.confirmed': ['Confirmed duplicate', 'Duplicado confirmado'], 'dup.review': ['Under review', 'En revisión'], 'dup.score': ['Match score', 'Coincidencia'],
  // billing
  'bil.title': ['Monthly billing (USD)', 'Facturación mensual (USD)'], 'bil.sub': ['Carrier invoices and shipping costs. Amounts in USD, never converted.', 'Facturas de paquetería y gastos de envío. Importes en USD, sin conversión.'],
  'bil.new': ['Register invoice', 'Registrar factura'], 'bil.invoiceNo': ['Invoice number', 'Número de factura'], 'bil.issueDate': ['Issue date', 'Fecha de emisión'], 'bil.supplier': ['Carrier / supplier', 'Paquetería / proveedor'], 'bil.amount': ['Total amount (USD)', 'Importe total (USD)'],
  'bil.pdf': ['PDF attachment', 'PDF adjunto'], 'bil.related': ['Related requests', 'Folios relacionados'], 'bil.recon': ['Reconciliation', 'Conciliación'], 'rec.PENDING': ['Pending', 'Pendiente'], 'rec.MATCHED': ['Reconciled', 'Conciliada'], 'rec.DISPUTED': ['Disputed', 'En aclaración'],
  'bil.k1': ['Monthly invoiced amount', 'Importe facturado'], 'bil.k2': ['Recorded shipping costs', 'Gastos de envío registrados'], 'bil.k3': ['Pending invoices', 'Facturas pendientes'], 'bil.k4': ['Matched shipments', 'Envíos conciliados'], 'bil.k5': ['Unmatched shipments', 'Envíos sin conciliar'], 'bil.k6': ['Average cost per shipment', 'Costo promedio por envío'],
  'bil.invoices': ['Invoices (grouped by issue month)', 'Facturas (agrupadas por mes de emisión)'], 'bil.shipments': ['Shipments and recorded costs', 'Envíos y gastos registrados'], 'bil.criterion': ['Period criterion', 'Criterio del periodo'], 'bil.cost': ['Cost (USD)', 'Costo (USD)'],
  'bil.setCost': ['Record cost', 'Registrar costo'], 'bil.shared': ['Shared invoice — amount counted once', 'Factura compartida — el importe se cuenta una sola vez'],
  // reports
  'rep.title': ['Smart reports', 'Reportes inteligentes'], 'rep.sub': ['All downloadable files are generated in English, without staff data.', 'Todos los archivos descargables se generan en inglés, sin datos del personal.'], 'rep.pick': ['Report', 'Reporte'],
  // labels
  'lb.title': ['QR codes & identification labels', 'Códigos QR y etiquetas de identificación'], 'lb.sub': ['Generated locally in the browser. The QR contains English text only — no prices, costs or staff data.', 'Se generan localmente en el navegador. El QR contiene solo texto en inglés — sin precios, costos ni datos del personal.'],
  'lb.request': ['Request', 'Folio'], 'lb.product': ['Product / SKU', 'Producto / SKU'], 'lb.type': ['Label type', 'Tipo de etiqueta'], 'lb.perSku': ['One label per SKU / line', 'Una etiqueta por SKU / línea'], 'lb.general': ['General label for the request', 'Etiqueta general del folio'],
  'lb.qrPng': ['Download QR PNG', 'Descargar QR PNG'], 'lb.labelPng': ['Download Label PNG', 'Descargar etiqueta PNG'], 'lb.print': ['Print Labels', 'Imprimir etiquetas'], 'lb.printSize': ['Print size', 'Tamaño de impresión'], 'lb.printAll': ['All lines of the request', 'Todas las líneas del folio'],
  'lb.content': ['Encoded text', 'Texto codificado'], 'lb.readerNote': ['A phone camera may offer to search this text online — that depends on the reader app. The QR does not open any page.', 'La cámara del celular puede ofrecer buscar este texto en internet — depende de la app lectora. El QR no abre ninguna página.'],
  // inventory
  'inv.title': ['Sample inventory', 'Inventario de muestras'], 'inv.sub': ['Stock as recorded in the Sample Request base, which deducts it automatically per request. Nothing is deleted.', 'Existencias tal como las lleva la base de Sample Request, que las descuenta automáticamente por folio. No se elimina nada.'],
  'inv.catalog': ['Operational catalog', 'Catálogo operativo'], 'inv.physical': ['Physical inventory (reference)', 'Inventario físico (referencia)'], 'inv.movements': ['Movements', 'Movimientos'], 'inv.searchPh': ['SKU, model, color, format…', 'SKU, modelo, color, formato…'],
  'inv.format': ['Source format', 'Formato origen'], 'inv.type': ['Sample type', 'Tipo de muestra'], 'inv.onHand': ['On hand', 'Existencia'], 'inv.reserved': ['Reserved', 'Reservado'], 'inv.available': ['Available', 'Disponible'], 'inv.backup': ['Backup location', 'Ubicación respaldo'],
  'inv.state': ['Availability', 'Disponibilidad'], 'is.AVAILABLE': ['Available', 'Disponible'], 'is.LOW': ['Low', 'Bajo'], 'is.OUT_OF_STOCK': ['Out of stock', 'Agotado'], 'inv.finish': ['Finish', 'Acabado'], 'inv.sampleSize': ['Sample size', 'Tamaño de muestra'],
  'inv.cabinet': ['Cabinet', 'Mueble'], 'inv.position': ['Position', 'Posición'], 'inv.type2': ['Movement', 'Movimiento'], 'mv.RESERVE': ['Reservation', 'Reserva'], 'mv.RELEASE': ['Release', 'Liberación'], 'mv.ISSUE': ['Exit', 'Salida'], 'mv.BASE': ['Deducted by the base', 'Descuento de la base'],
  // activity & settings
  'act.title': ['Activity log', 'Bitácora e historial'], 'act.sub': ['Visible log by area only. Security records are kept separately on the server.', 'Bitácora visible solo por área. Los registros de seguridad se guardan aparte en el servidor.'], 'act.event': ['Event', 'Movimiento'],
  'set.title': ['Settings', 'Configuración'], 'set.sub': ['Operating hours, holidays, target times and integrations.', 'Horario operativo, festivos, tiempos objetivo e integraciones.'], 'set.hours': ['Business hours', 'Horario operativo'], 'set.days': ['Working days', 'Días laborables'],
  'set.holidays': ['Holidays', 'Días festivos'], 'set.addHoliday': ['Add holiday', 'Agregar festivo'], 'set.targets': ['Target times (business hours)', 'Tiempos objetivo (horas hábiles)'], 'set.dupWindow': ['Duplicate window (days)', 'Ventana de duplicados (días)'],
  'set.carriers': ['Verified carrier tracking links', 'Enlaces de rastreo verificados'], 'set.carrierHint': ['HTTPS URL with {n} where the tracking number goes. Leave empty if not verified.', 'URL HTTPS con {n} donde va el número de guía. Déjelo vacío si no está verificado.'],
  'set.integration': ['Integrations', 'Integraciones'], 'set.sync': ['Google Sheets synchronization', 'Sincronización con Google Sheets'], 'set.runSync': ['Run sync now', 'Sincronizar ahora'], 'set.email': ['Email delivery', 'Envío de correos'],
  't.RECEIVED_TO_PREPARED': ['Received → Prepared', 'Recibida → Preparada'], 't.PREPARED_TO_SHIPPED': ['Prepared → Shipped', 'Preparada → Enviada'], 't.SHIPPED_TO_DELIVERED': ['Shipped → Delivered', 'Enviada → Entregada'], 't.READY_TO_PICKED_UP': ['Ready for pickup → Picked up', 'Lista → Recolectada'],
  'day.0': ['Sun', 'Dom'], 'day.1': ['Mon', 'Lun'], 'day.2': ['Tue', 'Mar'], 'day.3': ['Wed', 'Mié'], 'day.4': ['Thu', 'Jue'], 'day.5': ['Fri', 'Vie'], 'day.6': ['Sat', 'Sáb'],
  'err.FORBIDDEN': ['Your profile does not have access to this function.', 'Su perfil no tiene acceso a esta función.'],
};

let lang = 'es';
try { lang = localStorage.getItem('cs.lang') || (navigator.language || 'es').slice(0, 2); } catch { /* storage unavailable */ }
if (!['es', 'en'].includes(lang)) lang = 'es';

export function t(key, fallback) {
  const e = D[key];
  if (!e) return fallback ?? key;
  return lang === 'es' ? e[1] : e[0];
}
export function getLang() { return lang; }
export function setLang(l) {
  lang = l;
  try { localStorage.setItem('cs.lang', l); } catch { /* ignore */ }
  document.documentElement.lang = l;
}
document.documentElement.lang = lang;
