/**
 * Samples CESANTONI · cargador automático (Google Apps Script)
 *
 * Se pega UNA sola vez en lugar de Samples.gs. En cada corrida descarga la versión publicada de Samples.gs
 * desde el repositorio de la plataforma (GitHub) y la ejecuta, así las correcciones llegan solas, sin volver
 * a copiar código. Si GitHub no responde, usa la última versión que descargó.
 *
 * Importante: el código que se descarga corre con los permisos de esta cuenta (Sheets, Firebase, Gmail de solo
 * lectura, envío de correos). Solo quien puede publicar en el repositorio samples-cesantoni puede cambiarlo.
 */
var CARGADOR = {
  FUENTE: 'https://raw.githubusercontent.com/samples-cesantoni/samples-cesantoni.github.io/main/apps-script/Samples.gs',
  MINUTOS: 10 // cada cuánto se vuelve a revisar si hay versión nueva
};

// Las propiedades del script guardan máximo 9 KB por valor: la copia de respaldo se guarda en partes.
function guardarRespaldo_(props, src) {
  var partes = Math.ceil(src.length / 8000), datos = { samples_partes: String(partes) };
  for (var i = 0; i < partes; i++) datos['samples_' + i] = src.slice(i * 8000, (i + 1) * 8000);
  props.setProperties(datos);
}
function leerRespaldo_(props) {
  var n = Number(props.getProperty('samples_partes') || 0), src = '';
  for (var i = 0; i < n; i++) src += props.getProperty('samples_' + i) || '';
  return src;
}
function codigo_() {
  var cache = CacheService.getScriptCache(), props = PropertiesService.getScriptProperties();
  var src = cache.get('samples_src');
  if (src) return src;
  try {
    var r = UrlFetchApp.fetch(CARGADOR.FUENTE + '?t=' + Date.now(), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('GitHub ' + r.getResponseCode());
    src = r.getContentText();
    if (src.indexOf('function sincronizar') < 0) throw new Error('El archivo descargado no es Samples.gs');
    guardarRespaldo_(props, src); // copia de respaldo por si GitHub no responde
  } catch (e) {
    console.error('No se pudo descargar Samples.gs (' + e.message + '); se usa la última versión guardada.');
    src = leerRespaldo_(props);
    if (!src) throw e;
  }
  try { cache.put('samples_src', src, CARGADOR.MINUTOS * 60); } catch (e) { /* más de 100 KB: se descarga en cada corrida */ }
  return src;
}
// Carga Samples.gs en el ámbito global (sus funciones reemplazan a las de abajo) y ejecuta la tarea pedida.
function ejecutar_(tarea) {
  var propia = globalThis[tarea];
  (0, eval)(codigo_());
  if (globalThis[tarea] === propia) throw new Error('Samples.gs no definió ' + tarea);
  return globalThis[tarea]();
}

// Los activadores y el botón «Ejecutar» usan estos nombres.
function instalar() { return ejecutar_('instalar'); }
function sincronizar() { return ejecutar_('sincronizar'); }
function recordatorios() { return ejecutar_('recordatorios'); }
function volcarSalida() { return ejecutar_('volcarSalida'); }
function rastreo() { return ejecutar_('rastreo'); }
// Para ver qué versión está corriendo: Ejecutar › version
function version() { var s = codigo_(); console.log('Samples.gs · ' + s.length + ' caracteres · descargado de ' + CARGADOR.FUENTE); return s.length; }
