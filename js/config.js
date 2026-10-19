/* Configuración de Samples. Estos valores NO son secretos: Firebase y EmailJS están diseñados para usarse
   desde el navegador; la seguridad la dan las reglas de Firestore (firestore.rules, bloque «Samples», colecciones sc_)
   y la lista de dominios permitidos de Firebase y EmailJS. Mismo proyecto de Firebase que proveedores y movimientos. */
window.SC_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyAb2NEHLxzpW_MmuUavbYnALxjueL1aI84',
    authDomain: 'proveedores-cesantoni.firebaseapp.com',
    projectId: 'proveedores-cesantoni',
    storageBucket: 'proveedores-cesantoni.firebasestorage.app',
    messagingSenderId: '168248619956',
    appId: '1:168248619956:web:f3e1078e744512bdd538e1'
  },
  /* Correos por Gmail: la misma implementación de Apps Script «Correo proveedores CESANTONI» (URL /exec). */
  correo: {
    url: 'https://script.google.com/macros/s/AKfycbzIjutgV76q8gL34F703HGtKqR3R-__72mTPlFMPqSMmBPd7xGSj-y2osD7-XpRLf_Qqg/exec'
  },
  /* Respaldo EmailJS (agrega samples-cesantoni.github.io en Account › Security › Allowed origins). */
  emailjs: {
    publicKey: '5UDl-dY9RQ6EUDu1U',
    serviceId: 'service_ervj1qs',
    templateId: 'template_lhvvtfp'
  }
};
