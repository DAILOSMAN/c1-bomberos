/* importer.js - lectura de preguntas en cualquier formato razonable.
   Admite JSON, CSV/TSV y texto plano pegado (el que suele salir de un Word o un PDF).
   Modelo normalizado:
   { id, huella, tema, enunciado, opciones:[], correcta:idx, explicacion,
     fuente:'oficial'|'propia', referencia, activa, creada } */

var Importer = (function () {
  'use strict';

  // Rango de marcas diacriticas combinantes U+0300..U+036F, construido sin
  // literales para no depender de la codificacion del fichero.
  var RE_DIACRITICOS = new RegExp('[' + String.fromCharCode(768) + '-' + String.fromCharCode(879) + ']', 'g');

  function sinTildes(s) {
    var t = String(s == null ? '' : s);
    try { t = t.normalize('NFD').replace(RE_DIACRITICOS, ''); } catch (e) {}
    return t;
  }

  function huellaDe(enunciado, opciones) {
    var base = sinTildes(enunciado).toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();
    var ops = (opciones || []).map(function (o) {
      return sinTildes(o).toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim();
    }).sort().join('|');
    var texto = base + '::' + ops;
    var h = 5381;
    for (var i = 0; i < texto.length; i++) { h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0; }
    return h.toString(36) + '-' + texto.length.toString(36);
  }

  function nuevoId() {
    return 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* Convierte a indice 0-based. 'base' resuelve la ambiguedad de los numeros:
     0 = el numero ya es un indice, 1 = la primera opcion es el 1,
     undefined = adivinar (se asume 1-based, que es lo habitual en un fichero
     escrito a mano). Las letras nunca son ambiguas. */
  function letraAIndice(v, base) {
    if (v === null || v === undefined) return -1;
    var s = String(v).trim();
    if (s === '') return -1;
    if (/^[0-9]+$/.test(s)) {
      var n = parseInt(s, 10);
      if (base === 0) return n;
      if (base === 1) return n - 1;
      return n >= 1 && n <= 6 ? n - 1 : n;
    }
    var l = sinTildes(s).toLowerCase().replace(/[^a-z]/g, '').charAt(0);
    return 'abcdef'.indexOf(l);
  }

  /* Mira todo el lote para decidir si los numeros son 0-based o 1-based:
     si aparece algun cero, no pueden ser 1-based. */
  function detectarBase(lista, sacar) {
    var hayCero = false, hayNumero = false;
    for (var i = 0; i < lista.length; i++) {
      var v = sacar(lista[i]);
      if (v === null || v === undefined || String(v).trim() === '') continue;
      if (!/^[0-9]+$/.test(String(v).trim())) continue;
      hayNumero = true;
      if (parseInt(v, 10) === 0) hayCero = true;
    }
    if (!hayNumero) return undefined;
    return hayCero ? 0 : 1;
  }

  function limpiar(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function correctaDe(raw) {
    return raw.correcta !== undefined ? raw.correcta
      : raw.respuesta !== undefined ? raw.respuesta
      : raw.solucion !== undefined ? raw.solucion
      : raw.answer !== undefined ? raw.answer
      : raw.Correcta !== undefined ? raw.Correcta
      : raw.correct !== undefined ? raw.correct
      : raw.valida !== undefined ? raw.valida
      : undefined;
  }

  /* Normaliza un objeto suelto venga como venga.
     'base' se pasa cuando ya sabemos como estan numeradas las respuestas. */
  function normalizar(raw, temaPorDefecto, base) {
    if (!raw) return null;
    var enunciado = limpiar(raw.enunciado || raw.pregunta || raw.texto || raw.question || raw.Pregunta || raw.Enunciado || '');
    var opciones = raw.opciones || raw.respuestas || raw.options || raw.answers || null;

    if (!opciones) {
      var ops = [];
      ['a', 'b', 'c', 'd'].forEach(function (l) {
        var v = raw[l] !== undefined ? raw[l]
          : raw[l.toUpperCase()] !== undefined ? raw[l.toUpperCase()]
          : raw['opcion_' + l] !== undefined ? raw['opcion_' + l]
          : raw['respuesta_' + l] !== undefined ? raw['respuesta_' + l]
          : raw['opcion' + l.toUpperCase()] !== undefined ? raw['opcion' + l.toUpperCase()]
          : undefined;
        if (v !== undefined && limpiar(v) !== '') ops.push(limpiar(v));
      });
      opciones = ops;
    }
    if (!Array.isArray(opciones)) return null;
    opciones = opciones.map(limpiar).filter(function (o) { return o !== ''; });
    if (!enunciado || opciones.length < 2) return null;

    var correctaRaw = correctaDe(raw);
    var correcta = letraAIndice(correctaRaw, base);
    if (correcta < 0 || correcta >= opciones.length) {
      // ultima oportunidad: texto literal de la respuesta correcta
      var txt = limpiar(correctaRaw).toLowerCase();
      for (var i = 0; i < opciones.length; i++) {
        if (opciones[i].toLowerCase() === txt) { correcta = i; break; }
      }
    }
    if (correcta < 0 || correcta >= opciones.length) return null;

    var tema = raw.tema !== undefined ? raw.tema : (raw.Tema !== undefined ? raw.Tema : temaPorDefecto);
    tema = parseInt(tema, 10);
    if (isNaN(tema) || tema < 0 || tema > 20) tema = 0;

    return {
      id: nuevoId(),
      huella: huellaDe(enunciado, opciones),
      tema: tema,
      enunciado: enunciado,
      opciones: opciones,
      correcta: correcta,
      explicacion: limpiar(raw.explicacion || raw.justificacion || raw.comentario || raw.explanation || ''),
      fuente: (raw.fuente === 'oficial' || raw.oficial === true || raw.oficial === 'si') ? 'oficial' : 'propia',
      referencia: limpiar(raw.referencia || raw.norma || raw.fuente_legal || ''),
      activa: true,
      creada: Date.now()
    };
  }

  /* ---------- CSV / TSV ---------- */

  function partirCSV(texto) {
    var sep = ',';
    var primera = texto.split(/\r?\n/)[0] || '';
    var cuenta = { ',': 0, ';': 0, '\t': 0, '|': 0 };
    for (var i = 0; i < primera.length; i++) {
      if (cuenta[primera[i]] !== undefined) cuenta[primera[i]]++;
    }
    var mejor = ',', max = -1;
    for (var k in cuenta) { if (cuenta[k] > max) { max = cuenta[k]; mejor = k; } }
    sep = mejor;

    var filas = [], fila = [], campo = '', dentro = false;
    for (var j = 0; j < texto.length; j++) {
      var c = texto[j];
      if (dentro) {
        if (c === '"') {
          if (texto[j + 1] === '"') { campo += '"'; j++; }
          else dentro = false;
        } else campo += c;
      } else {
        if (c === '"') dentro = true;
        else if (c === sep) { fila.push(campo); campo = ''; }
        else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
        else if (c === '\r') { /* ignorar */ }
        else campo += c;
      }
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas.filter(function (f) { return f.some(function (x) { return limpiar(x) !== ''; }); });
  }

  function desdeCSV(texto, temaPorDefecto) {
    var filas = partirCSV(texto);
    if (filas.length < 2) return { preguntas: [], errores: ['El CSV no tiene filas suficientes.'] };
    var cab = filas[0].map(function (h) { return sinTildes(h).toLowerCase().replace(/[^a-z0-9]/g, ''); });
    var out = [], errores = [];
    var crudas = [];
    for (var f = 1; f < filas.length; f++) {
      var o = {};
      for (var cc = 0; cc < cab.length; cc++) o[cab[cc]] = filas[f][cc];
      crudas.push(o);
    }
    var base = detectarBase(crudas, function (o) {
      return o.correcta || o.respuesta || o.solucion || o.answer || o.valida;
    });
    for (var i = 1; i < filas.length; i++) {
      var obj = crudas[i - 1];
      // alias de cabecera
      var norm = {
        enunciado: obj.enunciado || obj.pregunta || obj.texto || obj.question,
        a: obj.a || obj.opcion1 || obj.opciona || obj.respuestaa || obj.op1,
        b: obj.b || obj.opcion2 || obj.opcionb || obj.respuestab || obj.op2,
        c: obj.c || obj.opcion3 || obj.opcionc || obj.respuestac || obj.op3,
        d: obj.d || obj.opcion4 || obj.opciond || obj.respuestad || obj.op4,
        correcta: obj.correcta || obj.respuesta || obj.solucion || obj.answer || obj.valida,
        tema: obj.tema || obj.bloque || obj.materia,
        explicacion: obj.explicacion || obj.justificacion || obj.comentario,
        referencia: obj.referencia || obj.norma || obj.articulo,
        fuente: obj.fuente
      };
      var p = normalizar(norm, temaPorDefecto, base);
      if (p) out.push(p);
      else errores.push('Fila ' + (i + 1) + ': no se pudo interpretar.');
    }
    return { preguntas: out, errores: errores };
  }

  /* ---------- texto plano ---------- */

  var RE_OPCION = /^\s*(\*?)\s*([a-hA-H])\s*[\)\.\-\:]\s*(.+)$/;
  var RE_OPCION_NUM = /^\s*(\*?)\s*([1-8])\s*[\)\.\-\:]\s*(.+)$/;
  var RE_ENUNCIADO = /^\s*(\d{1,4})\s*[\)\.\-\:]\s*(.+)$/;
  var RE_RESPUESTA = /^\s*(respuesta|solucion|solución|correcta|answer|resp|sol)\s*(correcta)?\s*[\:\.\-\)]?\s*([a-hA-H0-9])\s*$/i;
  var RE_TEMA = /^\s*(tema|bloque|t)\s*[\:\.\-]?\s*(\d{1,2})\b/i;
  var RE_EXPLICACION = /^\s*(explicacion|explicación|justificacion|justificación|comentario|nota)\s*[\:\.\-]\s*(.+)$/i;
  var RE_SOLUCIONARIO = /(\d{1,4})\s*[\.\-\:\)]?\s*([a-cA-C])\b/g;

  function desdeTexto(texto, temaPorDefecto) {
    var lineas = String(texto).replace(/\r/g, '').split('\n');
    var preguntas = [], errores = [];
    var temaActual = temaPorDefecto;
    var actual = null;
    var solucionario = {};

    // Deteccion de un bloque final de soluciones tipo "SOLUCIONES: 1-B 2-C ..."
    var idxSol = -1;
    for (var s = 0; s < lineas.length; s++) {
      if (/^\s*(soluciones|solucionario|respuestas|plantilla|hoja de respuestas)\b/i.test(lineas[s])) { idxSol = s; break; }
    }
    if (idxSol >= 0) {
      var bloque = lineas.slice(idxSol).join(' ');
      var m;
      RE_SOLUCIONARIO.lastIndex = 0;
      while ((m = RE_SOLUCIONARIO.exec(bloque)) !== null) {
        solucionario[parseInt(m[1], 10)] = m[2].toLowerCase();
      }
      lineas = lineas.slice(0, idxSol);
    }

    function cerrar() {
      if (!actual) return;
      if (actual.opciones.length >= 2) {
        if (actual.correcta < 0 && actual.numero && solucionario[actual.numero] !== undefined) {
          actual.correcta = letraAIndice(solucionario[actual.numero]);
        }
        if (actual.correcta >= 0 && actual.correcta < actual.opciones.length) {
          var p = normalizar({
            enunciado: actual.enunciado,
            opciones: actual.opciones,
            correcta: actual.correcta,
            tema: actual.tema,
            explicacion: actual.explicacion,
            referencia: actual.referencia
          }, temaPorDefecto, 0);
          if (p) preguntas.push(p);
          else errores.push('Pregunta ' + (actual.numero || '?') + ': datos incompletos.');
        } else {
          errores.push('Pregunta ' + (actual.numero || '?') + ' ("' + actual.enunciado.slice(0, 45) + '..."): no se encontró la respuesta correcta.');
        }
      } else if (actual.enunciado) {
        errores.push('Pregunta ' + (actual.numero || '?') + ': menos de dos opciones.');
      }
      actual = null;
    }

    for (var i = 0; i < lineas.length; i++) {
      var linea = lineas[i];
      var t = linea.trim();
      if (t === '') continue;

      var mTema = t.match(RE_TEMA);
      if (mTema && t.length < 90 && !RE_ENUNCIADO.test(t)) {
        cerrar();
        temaActual = parseInt(mTema[2], 10);
        continue;
      }

      var mResp = t.match(RE_RESPUESTA);
      if (mResp && actual) {
        actual.correcta = letraAIndice(mResp[3]);
        continue;
      }

      var mExp = t.match(RE_EXPLICACION);
      if (mExp && actual) {
        actual.explicacion = mExp[2];
        continue;
      }

      var mOp = t.match(RE_OPCION);
      // una opcion tipo "a) ..." solo cuenta si ya hay enunciado abierto
      if (mOp && actual && actual.enunciado) {
        var esperada = 'abcdefgh'.charAt(actual.opciones.length);
        if (mOp[2].toLowerCase() === esperada) {
          if (mOp[1] === '*') actual.correcta = actual.opciones.length;
          actual.opciones.push(mOp[3].trim());
          continue;
        }
      }
      var mOpN = t.match(RE_OPCION_NUM);
      if (mOpN && actual && actual.enunciado && actual.opciones.length > 0) {
        if (parseInt(mOpN[2], 10) === actual.opciones.length + 1) {
          if (mOpN[1] === '*') actual.correcta = actual.opciones.length;
          actual.opciones.push(mOpN[3].trim());
          continue;
        }
      }

      var mEnun = t.match(RE_ENUNCIADO);
      if (mEnun) {
        cerrar();
        actual = {
          numero: parseInt(mEnun[1], 10), enunciado: mEnun[2].trim(),
          opciones: [], correcta: -1, tema: temaActual, explicacion: '', referencia: ''
        };
        continue;
      }

      // linea suelta: continuacion del enunciado o de la ultima opcion
      if (actual) {
        if (actual.opciones.length === 0) actual.enunciado += ' ' + t;
        else actual.opciones[actual.opciones.length - 1] += ' ' + t;
      } else if (/\?\s*$/.test(t) || t.length > 25) {
        actual = { numero: null, enunciado: t, opciones: [], correcta: -1, tema: temaActual, explicacion: '', referencia: '' };
      }
    }
    cerrar();
    return { preguntas: preguntas, errores: errores };
  }

  /* ---------- JSON ---------- */

  function desdeJSON(texto, temaPorDefecto) {
    var datos;
    try { datos = typeof texto === 'string' ? JSON.parse(texto) : texto; }
    catch (e) { return null; }
    var lista = Array.isArray(datos) ? datos
      : Array.isArray(datos.preguntas) ? datos.preguntas
      : Array.isArray(datos.questions) ? datos.questions
      : Array.isArray(datos.items) ? datos.items : null;
    if (!lista) return null;
    var out = [], errores = [];
    var base = datos && datos.correcta_base !== undefined
      ? Number(datos.correcta_base)
      : detectarBase(lista, correctaDe);
    lista.forEach(function (r, i) {
      var p = normalizar(r, temaPorDefecto, base);
      if (p) out.push(p);
      else errores.push('Elemento ' + (i + 1) + ': no se pudo interpretar.');
    });
    return { preguntas: out, errores: errores, esCopia: datos && datos.formato === 'c1bomberos-copia' };
  }

  /* ---------- entrada unica ---------- */

  function detectarYParsear(texto, temaPorDefecto) {
    var t = String(texto || '').trim();
    if (!t) return { preguntas: [], errores: ['No hay nada que importar.'], formato: '-' };

    if (t.charAt(0) === '[' || t.charAt(0) === '{') {
      var j = desdeJSON(t, temaPorDefecto);
      if (j) { j.formato = 'JSON'; return j; }
    }
    var primera = t.split(/\r?\n/)[0] || '';
    var pareceCSV = /[,;\t|]/.test(primera) &&
      /(enunciado|pregunta|question|correcta|respuesta|solucion)/i.test(primera) &&
      t.split(/\r?\n/).length > 1;
    if (pareceCSV) {
      var c = desdeCSV(t, temaPorDefecto);
      c.formato = 'CSV';
      if (c.preguntas.length) return c;
    }
    var r = desdeTexto(t, temaPorDefecto);
    r.formato = 'Texto';
    if (!r.preguntas.length && pareceCSV) {
      var c2 = desdeCSV(t, temaPorDefecto);
      c2.formato = 'CSV';
      return c2;
    }
    return r;
  }

  return {
    normalizar: normalizar,
    huellaDe: huellaDe,
    nuevoId: nuevoId,
    letraAIndice: letraAIndice,
    detectarBase: detectarBase,
    desdeJSON: desdeJSON,
    desdeCSV: desdeCSV,
    desdeTexto: desdeTexto,
    detectarYParsear: detectarYParsear
  };
})();
