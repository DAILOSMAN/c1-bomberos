/* engine.js - seleccion de preguntas, sesion en curso y correccion oficial. */

var Engine = (function () {
  'use strict';

  function barajar(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- filtros y seleccion ---------- */

  function candidatas(opc) {
    opc = opc || {};
    var todas = Store.preguntas().filter(function (p) { return p.activa !== false; });
    if (opc.soloOficiales) todas = todas.filter(function (p) { return p.fuente === 'oficial'; });
    if (opc.temas && opc.temas.length) {
      var set = {};
      opc.temas.forEach(function (t) { set[Number(t)] = true; });
      todas = todas.filter(function (p) { return set[Number(p.tema)]; });
    }
    return todas;
  }

  function conProgreso(lista) {
    return lista.map(function (p) {
      return { p: p, g: Store.progresoDe(p.id) };
    });
  }

  function seleccionFalladas(lista, limite) {
    var conP = conProgreso(lista).filter(function (x) { return x.g.fallos > 0; });
    conP.sort(function (a, b) {
      var da = a.g.fallos - a.g.aciertos, db = b.g.fallos - b.g.aciertos;
      if (db !== da) return db - da;
      if (a.g.caja !== b.g.caja) return a.g.caja - b.g.caja;
      return a.g.ultima - b.g.ultima;
    });
    return conP.slice(0, limite).map(function (x) { return x.p; });
  }

  function seleccionNuevas(lista, limite) {
    var conP = conProgreso(lista).filter(function (x) { return x.g.vistas === 0; });
    return barajar(conP.map(function (x) { return x.p; })).slice(0, limite);
  }

  function seleccionMarcadas(lista, limite) {
    var conP = conProgreso(lista).filter(function (x) { return x.g.marcada; });
    return barajar(conP.map(function (x) { return x.p; })).slice(0, limite);
  }

  /* Repaso espaciado sencillo: la caja define cuantos dias esperar. */
  var DIAS_CAJA = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 16 };

  function tocaHoy(g) {
    if (g.vistas === 0) return true;
    var dias = DIAS_CAJA[g.caja] === undefined ? 0 : DIAS_CAJA[g.caja];
    return (Date.now() - g.ultima) >= dias * 86400000;
  }

  function seleccionRepaso(lista, limite) {
    var conP = conProgreso(lista).filter(function (x) { return tocaHoy(x.g); });
    conP.sort(function (a, b) {
      if (a.g.caja !== b.g.caja) return a.g.caja - b.g.caja;
      return a.g.ultima - b.g.ultima;
    });
    return conP.slice(0, limite).map(function (x) { return x.p; });
  }

  /* Mezcla equilibrada para el examen: reparte entre temas disponibles
     y da algo mas de peso a lo flojo, sin volverse predecible. */
  function seleccionExamen(lista, limite) {
    if (lista.length <= limite) return barajar(lista);
    var porTema = {};
    lista.forEach(function (p) {
      var k = Number(p.tema) || 0;
      if (!porTema[k]) porTema[k] = [];
      porTema[k].push(p);
    });
    var temas = Object.keys(porTema);
    temas.forEach(function (k) {
      porTema[k] = barajar(porTema[k]).sort(function (a, b) {
        var ga = Store.progresoDe(a.id), gb = Store.progresoDe(b.id);
        var ra = ga.vistas ? ga.aciertos / ga.vistas : 0.5;
        var rb = gb.vistas ? gb.aciertos / gb.vistas : 0.5;
        return (ra - rb) + (Math.random() - 0.5) * 0.8;
      });
    });
    var out = [], i = 0, seguridad = 0;
    while (out.length < limite && seguridad < limite * 40) {
      var k = temas[i % temas.length];
      if (porTema[k].length) out.push(porTema[k].shift());
      i++; seguridad++;
    }
    return barajar(out);
  }

  /* ---------- construccion de la sesion ---------- */

  function crearSesion(config) {
    var opc = {
      soloOficiales: config.soloOficiales || false,
      temas: config.temas || []
    };
    var pool = candidatas(opc);
    var limite = config.numPreguntas || OPOSICION.preguntasExamen;
    var elegidas;

    switch (config.modo) {
      case 'examen':
        limite = OPOSICION.preguntasExamen + (config.incluirReserva ? OPOSICION.preguntasReserva : 0);
        elegidas = seleccionExamen(pool, limite);
        break;
      case 'falladas': elegidas = seleccionFalladas(pool, limite); break;
      case 'nuevas': elegidas = seleccionNuevas(pool, limite); break;
      case 'marcadas': elegidas = seleccionMarcadas(pool, limite); break;
      case 'repaso': elegidas = seleccionRepaso(pool, limite); break;
      default: elegidas = barajar(pool).slice(0, limite);
    }

    if (!elegidas.length) return null;

    var barajarOps = config.barajarOpciones !== undefined
      ? config.barajarOpciones : Store.ajustes().barajarOpciones;

    var items = elegidas.map(function (p) {
      var orden = p.opciones.map(function (_, i) { return i; });
      if (barajarOps) orden = barajar(orden);
      return {
        qid: p.id,
        orden: orden,
        respuesta: null,     // indice en el orden mostrado
        dudosa: false,
        tiempoMs: 0
      };
    });

    return {
      id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      modo: config.modo,
      etiqueta: config.etiqueta || nombreModo(config.modo),
      temas: config.temas || [],
      soloOficiales: opc.soloOficiales,
      feedbackInmediato: config.modo !== 'examen' && config.feedbackInmediato !== false,
      cronometrado: config.modo === 'examen' || !!config.cronometrado,
      limiteMs: config.modo === 'examen'
        ? OPOSICION.minutosExamen * 60000
        : (config.minutos ? config.minutos * 60000 : 0),
      puntuables: config.modo === 'examen' ? OPOSICION.preguntasExamen : items.length,
      items: items,
      indice: 0,
      inicio: Date.now(),
      fin: null,
      pausadoMs: 0
    };
  }

  function nombreModo(m) {
    return {
      examen: 'Simulacro de examen',
      estudio: 'Estudio por temas',
      falladas: 'Repaso de falladas',
      nuevas: 'Preguntas nuevas',
      marcadas: 'Preguntas marcadas',
      repaso: 'Repaso programado',
      libre: 'Test libre'
    }[m] || 'Test';
  }

  /* ---------- durante la sesion ---------- */

  function preguntaDe(item) { return Store.preguntaPorId(item.qid); }

  function opcionesMostradas(item) {
    var p = preguntaDe(item);
    if (!p) return [];
    return item.orden.map(function (i) { return p.opciones[i]; });
  }

  function indiceCorrectoMostrado(item) {
    var p = preguntaDe(item);
    if (!p) return -1;
    return item.orden.indexOf(p.correcta);
  }

  function esAcierto(item) {
    if (item.respuesta === null || item.respuesta === undefined) return false;
    return item.respuesta === indiceCorrectoMostrado(item);
  }

  /* ---------- correccion ---------- */

  function corregir(sesion) {
    var puntuables = sesion.items.slice(0, sesion.puntuables);
    var aciertos = 0, fallos = 0, blancos = 0;
    puntuables.forEach(function (it) {
      if (it.respuesta === null || it.respuesta === undefined) blancos++;
      else if (esAcierto(it)) aciertos++;
      else fallos++;
    });

    // Base 7a: 0,15 por acierto; fallos y blancos ni suman ni restan.
    var nota = Math.round(aciertos * OPOSICION.puntosPorAcierto * 1000) / 1000;
    if (nota > OPOSICION.puntuacionMaximaOposicion) nota = OPOSICION.puntuacionMaximaOposicion;

    var duracion = (sesion.fin || Date.now()) - sesion.inicio - (sesion.pausadoMs || 0);

    var porTema = {};
    sesion.items.forEach(function (it) {
      var p = preguntaDe(it);
      if (!p) return;
      var k = Number(p.tema) || 0;
      if (!porTema[k]) porTema[k] = { total: 0, aciertos: 0, fallos: 0, blancos: 0 };
      porTema[k].total++;
      if (it.respuesta === null || it.respuesta === undefined) porTema[k].blancos++;
      else if (esAcierto(it)) porTema[k].aciertos++;
      else porTema[k].fallos++;
    });

    return {
      id: sesion.id,
      modo: sesion.modo,
      etiqueta: sesion.etiqueta,
      temas: sesion.temas,
      inicio: sesion.inicio,
      fin: sesion.fin || Date.now(),
      duracionMs: duracion,
      total: puntuables.length,
      presentadas: sesion.items.length,
      aciertos: aciertos,
      fallos: fallos,
      blancos: blancos,
      porcentaje: puntuables.length ? Math.round(aciertos / puntuables.length * 1000) / 10 : 0,
      nota: nota,
      notaSobre10: Math.round((puntuables.length ? aciertos / puntuables.length * 10 : 0) * 100) / 100,
      apto: sesion.modo === 'examen' ? nota >= OPOSICION.puntuacionMinimaAprobar : null,
      porTema: porTema,
      detalle: sesion.items.map(function (it) {
        var p = preguntaDe(it);
        return {
          qid: it.qid,
          tema: p ? p.tema : 0,
          respuesta: it.respuesta,
          correcta: indiceCorrectoMostrado(it),
          acertada: esAcierto(it),
          enBlanco: it.respuesta === null || it.respuesta === undefined,
          dudosa: it.dudosa,
          tiempoMs: it.tiempoMs,
          orden: it.orden
        };
      })
    };
  }

  /* Vuelca el resultado al progreso por pregunta (Leitner incluido). */
  function aplicarProgreso(resultado) {
    resultado.detalle.forEach(function (d) {
      Store.registrarRespuesta(d.qid, d.acertada, d.enBlanco, d.tiempoMs);
    });
    Store.guardar();
  }

  /* Cuantos aciertos hacen falta todavia para el 3 sobre 6 */
  function aciertosParaAprobar() { return OPOSICION.aciertosMinimos; }

  function notaProceso(notaOposicion, puntosConcurso) {
    var c = Math.min(Number(puntosConcurso) || 0, OPOSICION.puntuacionMaximaConcurso);
    var o = Math.min(Number(notaOposicion) || 0, OPOSICION.puntuacionMaximaOposicion);
    return {
      oposicion: o,
      concurso: c,
      total: Math.round((o + c) * 1000) / 1000,
      superaOposicion: o >= OPOSICION.puntuacionMinimaAprobar,
      superaProceso: o >= OPOSICION.puntuacionMinimaAprobar && (o + c) >= OPOSICION.totalMinimoProceso
    };
  }

  return {
    barajar: barajar,
    candidatas: candidatas,
    crearSesion: crearSesion,
    nombreModo: nombreModo,
    preguntaDe: preguntaDe,
    opcionesMostradas: opcionesMostradas,
    indiceCorrectoMostrado: indiceCorrectoMostrado,
    esAcierto: esAcierto,
    corregir: corregir,
    aplicarProgreso: aplicarProgreso,
    aciertosParaAprobar: aciertosParaAprobar,
    notaProceso: notaProceso,
    tocaHoy: tocaHoy,
    seleccionFalladas: seleccionFalladas,
    seleccionRepaso: seleccionRepaso
  };
})();
