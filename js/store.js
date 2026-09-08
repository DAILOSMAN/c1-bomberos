/* store.js - persistencia local.
   Todo el estado vive en memoria y se vuelca completo a IndexedDB con debounce.
   Si IndexedDB no esta disponible (por ejemplo abriendo el fichero con file://
   en algunos navegadores) cae a localStorage y, en ultimo extremo, a memoria. */

var Store = (function () {
  'use strict';

  var DB_NAME = 'c1bomberos';
  var STORE = 'estado';
  var KEY = 'principal';
  var LS_KEY = 'c1bomberos.estado';

  var modo = 'memoria';
  var idb = null;
  var timer = null;
  var listeners = [];

  var estadoInicial = {
    version: 1,
    preguntas: [],      // ver modelo en importer.js
    progreso: {},       // qid -> { vistas, aciertos, fallos, caja, ultima, marcada, nota }
    intentos: [],       // sesiones cerradas
    enCurso: null,      // sesion sin terminar, para poder retomarla
    ajustes: {
      tema: 'auto',            // auto | claro | oscuro
      barajarOpciones: true,
      incluirReserva: false,   // simular 45 preguntas (5 de reserva)
      avisoMinutos: [10, 5, 1],
      sonido: true,
      soloOficiales: false,
      tamanoTexto: 'normal'
    },
    meta: { creado: Date.now(), ultimoUso: Date.now(), nombre: '' }
  };

  var estado = clonar(estadoInicial);

  function clonar(o) { return JSON.parse(JSON.stringify(o)); }

  function abrirIDB() {
    return new Promise(function (resolve) {
      if (typeof indexedDB === 'undefined' || !indexedDB) return resolve(null);
      var req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return resolve(null); }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
      setTimeout(function () { resolve(req.result || null); }, 3000);
    });
  }

  function leerIDB(db) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(STORE, 'readonly');
        var rq = tx.objectStore(STORE).get(KEY);
        rq.onsuccess = function () { resolve(rq.result || null); };
        rq.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  function escribirIDB(db, valor) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(valor, KEY);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }

  function migrar(guardado) {
    var base = clonar(estadoInicial);
    if (!guardado || typeof guardado !== 'object') return base;
    base.preguntas = Array.isArray(guardado.preguntas) ? guardado.preguntas : [];
    base.progreso = guardado.progreso && typeof guardado.progreso === 'object' ? guardado.progreso : {};
    base.intentos = Array.isArray(guardado.intentos) ? guardado.intentos : [];
    base.enCurso = guardado.enCurso || null;
    if (guardado.ajustes) {
      for (var k in base.ajustes) {
        if (Object.prototype.hasOwnProperty.call(guardado.ajustes, k)) base.ajustes[k] = guardado.ajustes[k];
      }
    }
    if (guardado.meta) base.meta = Object.assign(base.meta, guardado.meta);
    return base;
  }

  function cargar() {
    return abrirIDB().then(function (db) {
      if (db) {
        idb = db; modo = 'indexeddb';
        return leerIDB(db).then(function (v) {
          if (v) { estado = migrar(v); return estado; }
          // primera vez con IDB: intentar rescatar de localStorage
          try {
            var ls = localStorage.getItem(LS_KEY);
            if (ls) estado = migrar(JSON.parse(ls));
          } catch (e) { /* nada */ }
          return estado;
        });
      }
      try {
        var raw = localStorage.getItem(LS_KEY);
        localStorage.setItem(LS_KEY + '.test', '1');
        localStorage.removeItem(LS_KEY + '.test');
        modo = 'localstorage';
        if (raw) estado = migrar(JSON.parse(raw));
      } catch (e) {
        modo = 'memoria';
      }
      return estado;
    });
  }

  function guardarAhora() {
    estado.meta.ultimoUso = Date.now();
    if (modo === 'indexeddb' && idb) {
      return escribirIDB(idb, estado).then(function (ok) {
        if (!ok) { try { localStorage.setItem(LS_KEY, JSON.stringify(estado)); } catch (e) {} }
        return ok;
      });
    }
    if (modo === 'localstorage') {
      try { localStorage.setItem(LS_KEY, JSON.stringify(estado)); return Promise.resolve(true); }
      catch (e) { return Promise.resolve(false); }
    }
    return Promise.resolve(false);
  }

  function guardar() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; guardarAhora(); }, 400);
    listeners.forEach(function (fn) { try { fn(estado); } catch (e) {} });
  }

  function suscribir(fn) { listeners.push(fn); }

  /* ---------- preguntas ---------- */

  function preguntas() { return estado.preguntas; }

  function preguntaPorId(id) {
    for (var i = 0; i < estado.preguntas.length; i++) {
      if (estado.preguntas[i].id === id) return estado.preguntas[i];
    }
    return null;
  }

  function anadirPreguntas(lista) {
    var existentes = {};
    estado.preguntas.forEach(function (p) { existentes[p.huella] = true; });
    var nuevas = 0, duplicadas = 0;
    lista.forEach(function (p) {
      if (existentes[p.huella]) { duplicadas++; return; }
      existentes[p.huella] = true;
      estado.preguntas.push(p);
      nuevas++;
    });
    guardar();
    return { nuevas: nuevas, duplicadas: duplicadas };
  }

  function actualizarPregunta(id, cambios) {
    var p = preguntaPorId(id);
    if (!p) return false;
    for (var k in cambios) p[k] = cambios[k];
    guardar();
    return true;
  }

  function borrarPregunta(id) {
    estado.preguntas = estado.preguntas.filter(function (p) { return p.id !== id; });
    delete estado.progreso[id];
    guardar();
  }

  function borrarPreguntas(ids) {
    var set = {};
    ids.forEach(function (i) { set[i] = true; });
    estado.preguntas = estado.preguntas.filter(function (p) { return !set[p.id]; });
    ids.forEach(function (i) { delete estado.progreso[i]; });
    guardar();
  }

  /* ---------- progreso ---------- */

  function progresoDe(qid) {
    if (!estado.progreso[qid]) {
      estado.progreso[qid] = {
        vistas: 0, aciertos: 0, fallos: 0, blancos: 0,
        caja: 1, ultima: 0, racha: 0, marcada: false, nota: '', tiempoTotal: 0
      };
    }
    return estado.progreso[qid];
  }

  /* Leitner de 5 cajas. Acierto sube de caja, fallo devuelve a la 1. */
  function registrarRespuesta(qid, acierto, enBlanco, tiempoMs) {
    var p = progresoDe(qid);
    p.vistas++;
    p.ultima = Date.now();
    p.tiempoTotal += (tiempoMs || 0);
    if (enBlanco) { p.blancos++; p.racha = 0; return p; }
    if (acierto) {
      p.aciertos++; p.racha++;
      p.caja = Math.min(5, p.caja + 1);
    } else {
      p.fallos++; p.racha = 0;
      p.caja = 1;
    }
    return p;
  }

  function alternarMarcada(qid) {
    var p = progresoDe(qid);
    p.marcada = !p.marcada;
    guardar();
    return p.marcada;
  }

  function ponerNota(qid, texto) {
    progresoDe(qid).nota = texto || '';
    guardar();
  }

  /* ---------- intentos ---------- */

  function intentos() { return estado.intentos; }

  function guardarIntento(intento) {
    estado.intentos.push(intento);
    estado.enCurso = null;
    guardar();
  }

  function enCurso() { return estado.enCurso; }
  function ponerEnCurso(s) { estado.enCurso = s; guardar(); }
  function limpiarEnCurso() { estado.enCurso = null; guardar(); }

  function borrarIntento(id) {
    estado.intentos = estado.intentos.filter(function (i) { return i.id !== id; });
    guardar();
  }

  /* ---------- ajustes ---------- */

  function ajustes() { return estado.ajustes; }
  function ponerAjuste(k, v) { estado.ajustes[k] = v; guardar(); }

  /* ---------- copia de seguridad ---------- */

  function exportarTodo() {
    return {
      formato: 'c1bomberos-copia',
      version: 1,
      fecha: new Date().toISOString(),
      preguntas: estado.preguntas,
      progreso: estado.progreso,
      intentos: estado.intentos,
      ajustes: estado.ajustes
    };
  }

  function exportarBanco() {
    return {
      formato: 'c1bomberos-banco',
      version: 1,
      fecha: new Date().toISOString(),
      oposicion: 'Bombero/a Especialista C1 - Ayuntamiento de Las Palmas de Gran Canaria',
      // la correcta va como letra: asi no hay duda de si empieza en 0 o en 1
      correcta_base: 0,
      preguntas: estado.preguntas.map(function (p) {
        return {
          tema: p.tema, enunciado: p.enunciado, opciones: p.opciones,
          correcta: 'ABCDEF'.charAt(p.correcta), explicacion: p.explicacion,
          fuente: p.fuente, referencia: p.referencia
        };
      })
    };
  }

  function importarCopia(obj, fusionar) {
    if (!obj || !Array.isArray(obj.preguntas)) return { ok: false, error: 'El fichero no tiene preguntas.' };
    if (!fusionar) {
      estado.preguntas = [];
      estado.progreso = {};
      estado.intentos = [];
    }
    var base = obj.correcta_base !== undefined ? Number(obj.correcta_base)
      : Importer.detectarBase(obj.preguntas, function (p) { return p.correcta; });
    var res = anadirPreguntas(obj.preguntas.map(function (p) {
      return (p.id && p.huella) ? p : Importer.normalizar(p, 0, base);
    }).filter(Boolean));
    if (obj.progreso && fusionar !== 'solo-banco') {
      for (var k in obj.progreso) {
        if (!estado.progreso[k]) estado.progreso[k] = obj.progreso[k];
      }
    }
    if (Array.isArray(obj.intentos) && fusionar !== 'solo-banco') {
      var vistos = {};
      estado.intentos.forEach(function (i) { vistos[i.id] = true; });
      obj.intentos.forEach(function (i) { if (!vistos[i.id]) estado.intentos.push(i); });
      estado.intentos.sort(function (a, b) { return a.inicio - b.inicio; });
    }
    guardar();
    return { ok: true, nuevas: res.nuevas, duplicadas: res.duplicadas };
  }

  function reiniciarProgreso() {
    estado.progreso = {};
    estado.intentos = [];
    estado.enCurso = null;
    guardar();
  }

  function borrarTodo() {
    estado = clonar(estadoInicial);
    guardar();
  }

  return {
    cargar: cargar, guardar: guardar, guardarAhora: guardarAhora, suscribir: suscribir,
    modo: function () { return modo; },
    estado: function () { return estado; },
    preguntas: preguntas, preguntaPorId: preguntaPorId, anadirPreguntas: anadirPreguntas,
    actualizarPregunta: actualizarPregunta, borrarPregunta: borrarPregunta, borrarPreguntas: borrarPreguntas,
    progresoDe: progresoDe, registrarRespuesta: registrarRespuesta,
    alternarMarcada: alternarMarcada, ponerNota: ponerNota,
    intentos: intentos, guardarIntento: guardarIntento, borrarIntento: borrarIntento,
    enCurso: enCurso, ponerEnCurso: ponerEnCurso, limpiarEnCurso: limpiarEnCurso,
    ajustes: ajustes, ponerAjuste: ponerAjuste,
    exportarTodo: exportarTodo, exportarBanco: exportarBanco, importarCopia: importarCopia,
    reiniciarProgreso: reiniciarProgreso, borrarTodo: borrarTodo
  };
})();
