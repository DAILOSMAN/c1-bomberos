/* stats.js - metricas de estudio y graficas en canvas (sin librerias). */

var Stats = (function () {
  'use strict';

  function resumenBanco() {
    var ps = Store.preguntas();
    var porTema = {}, oficiales = 0, sinClasificar = 0;
    for (var t = 0; t <= 20; t++) porTema[t] = { total: 0, vistas: 0, aciertos: 0, fallos: 0, dominadas: 0, flojas: 0 };
    ps.forEach(function (p) {
      var k = Number(p.tema) || 0;
      if (!porTema[k]) porTema[k] = { total: 0, vistas: 0, aciertos: 0, fallos: 0, dominadas: 0, flojas: 0 };
      porTema[k].total++;
      if (k === 0) sinClasificar++;
      if (p.fuente === 'oficial') oficiales++;
      var g = Store.estado().progreso[p.id];
      if (g && g.vistas) {
        porTema[k].vistas += g.vistas;
        porTema[k].aciertos += g.aciertos;
        porTema[k].fallos += g.fallos;
        if (g.caja >= 4) porTema[k].dominadas++;
        if (g.fallos > g.aciertos) porTema[k].flojas++;
      }
    });
    return {
      total: ps.length,
      oficiales: oficiales,
      sinClasificar: sinClasificar,
      porTema: porTema
    };
  }

  function resumenProgreso() {
    var ps = Store.preguntas();
    var prog = Store.estado().progreso;
    var vistas = 0, dominadas = 0, flojas = 0, sinVer = 0, marcadas = 0;
    var aciertos = 0, fallos = 0, tiempo = 0, respondidas = 0;
    ps.forEach(function (p) {
      var g = prog[p.id];
      if (!g || !g.vistas) { sinVer++; return; }
      vistas++;
      aciertos += g.aciertos; fallos += g.fallos;
      tiempo += g.tiempoTotal || 0;
      respondidas += g.aciertos + g.fallos;
      if (g.caja >= 4) dominadas++;
      if (g.fallos > g.aciertos) flojas++;
      if (g.marcada) marcadas++;
    });
    return {
      totalBanco: ps.length,
      vistas: vistas, sinVer: sinVer, dominadas: dominadas, flojas: flojas, marcadas: marcadas,
      aciertos: aciertos, fallos: fallos,
      tasa: respondidas ? Math.round(aciertos / respondidas * 1000) / 10 : 0,
      segundosPorPregunta: respondidas ? Math.round(tiempo / respondidas / 100) / 10 : 0,
      cobertura: ps.length ? Math.round(vistas / ps.length * 1000) / 10 : 0
    };
  }

  function serieProgresion(soloExamenes) {
    var ints = Store.intentos().slice().sort(function (a, b) { return a.inicio - b.inicio; });
    if (soloExamenes) ints = ints.filter(function (i) { return i.modo === 'examen'; });
    return ints.map(function (i) {
      return {
        fecha: i.inicio,
        porcentaje: i.porcentaje,
        nota: i.modo === 'examen' ? i.nota : Math.round(i.porcentaje / 100 * 6 * 100) / 100,
        aciertos: i.aciertos,
        total: i.total,
        modo: i.modo
      };
    });
  }

  function mediaMovil(serie, ventana) {
    return serie.map(function (_, i) {
      var desde = Math.max(0, i - ventana + 1);
      var trozo = serie.slice(desde, i + 1);
      var s = trozo.reduce(function (a, b) { return a + b.nota; }, 0);
      return s / trozo.length;
    });
  }

  function rachaDias() {
    var dias = {};
    Store.intentos().forEach(function (i) {
      dias[new Date(i.inicio).toDateString()] = true;
    });
    var racha = 0;
    var d = new Date();
    if (!dias[d.toDateString()]) d.setDate(d.getDate() - 1);
    while (dias[d.toDateString()]) { racha++; d.setDate(d.getDate() - 1); }
    return { racha: racha, diasActivos: Object.keys(dias).length };
  }

  function actividad(dias) {
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    var mapa = {};
    Store.intentos().forEach(function (i) {
      var d = new Date(i.inicio); d.setHours(0, 0, 0, 0);
      var k = d.getTime();
      if (!mapa[k]) mapa[k] = 0;
      mapa[k] += i.total;
    });
    var out = [];
    for (var n = dias - 1; n >= 0; n--) {
      var f = new Date(hoy.getTime() - n * 86400000);
      out.push({ fecha: f.getTime(), preguntas: mapa[f.getTime()] || 0 });
    }
    return out;
  }

  /* Prediccion sencilla: media ponderada de los ultimos simulacros. */
  function prediccion() {
    var s = serieProgresion(true);
    if (!s.length) return null;
    var ultimos = s.slice(-5);
    var pesoTotal = 0, suma = 0;
    ultimos.forEach(function (x, i) {
      var w = i + 1;
      suma += x.nota * w; pesoTotal += w;
    });
    var nota = suma / pesoTotal;
    var mejor = Math.max.apply(null, s.map(function (x) { return x.nota; }));
    return {
      estimada: Math.round(nota * 100) / 100,
      mejor: Math.round(mejor * 100) / 100,
      ultima: s[s.length - 1].nota,
      simulacros: s.length,
      aptoEstimado: nota >= OPOSICION.puntuacionMinimaAprobar,
      aciertosEstimados: Math.round(nota / OPOSICION.puntosPorAcierto)
    };
  }

  /* ---------- graficas ---------- */

  function css(v, def) {
    try {
      var c = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
      return c || def;
    } catch (e) { return def; }
  }

  function prepararCanvas(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = rect.width || canvas.clientWidth || 600;
    var h = parseInt(canvas.getAttribute('data-alto') || '220', 10);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function vacio(ctx, w, h, texto) {
    ctx.fillStyle = css('--txt-sec', '#888');
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(texto, w / 2, h / 2);
  }

  function graficaProgresion(canvas, soloExamenes) {
    var c = prepararCanvas(canvas), ctx = c.ctx, w = c.w, h = c.h;
    var serie = serieProgresion(soloExamenes);
    if (serie.length < 1) return vacio(ctx, w, h, 'Aún no hay tests completados.');

    var ml = 34, mr = 12, mt = 14, mb = 26;
    var gw = w - ml - mr, gh = h - mt - mb;
    var maxY = 6;
    var linea = css('--acento', '#e35205');
    var borde = css('--borde', '#ddd');
    var txt = css('--txt-sec', '#777');

    // rejilla y eje Y (0 a 6, escala oficial)
    ctx.strokeStyle = borde; ctx.lineWidth = 1;
    ctx.fillStyle = txt; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'right';
    for (var v = 0; v <= 6; v++) {
      var y = mt + gh - (v / maxY) * gh;
      ctx.beginPath(); ctx.moveTo(ml, y + 0.5); ctx.lineTo(w - mr, y + 0.5); ctx.stroke();
      ctx.fillText(String(v), ml - 6, y + 4);
    }

    // linea de aprobado (3 puntos)
    var yAp = mt + gh - (3 / maxY) * gh;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = css('--ok', '#1f9d55');
    ctx.beginPath(); ctx.moveTo(ml, yAp); ctx.lineTo(w - mr, yAp); ctx.stroke();
    ctx.restore();

    var n = serie.length;
    function px(i) { return n === 1 ? ml + gw / 2 : ml + (i / (n - 1)) * gw; }
    function py(val) { return mt + gh - (Math.min(val, maxY) / maxY) * gh; }

    // area
    if (n > 1) {
      var grad = ctx.createLinearGradient(0, mt, 0, mt + gh);
      grad.addColorStop(0, 'rgba(227,82,5,0.22)');
      grad.addColorStop(1, 'rgba(227,82,5,0)');
      ctx.beginPath();
      ctx.moveTo(px(0), mt + gh);
      serie.forEach(function (s, i) { ctx.lineTo(px(i), py(s.nota)); });
      ctx.lineTo(px(n - 1), mt + gh);
      ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    }

    ctx.strokeStyle = linea; ctx.lineWidth = 2;
    ctx.beginPath();
    serie.forEach(function (s, i) {
      var x = px(i), y = py(s.nota);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // media movil
    if (n >= 3) {
      var mm = mediaMovil(serie, 3);
      ctx.strokeStyle = css('--txt-sec', '#999'); ctx.lineWidth = 1.5;
      ctx.save(); ctx.setLineDash([4, 3]);
      ctx.beginPath();
      mm.forEach(function (v2, i) {
        var x = px(i), y = py(v2);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke(); ctx.restore();
    }

    serie.forEach(function (s, i) {
      ctx.beginPath();
      ctx.arc(px(i), py(s.nota), n > 40 ? 2 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = s.nota >= 3 ? css('--ok', '#1f9d55') : css('--mal', '#c0392b');
      ctx.fill();
    });

    ctx.fillStyle = txt; ctx.textAlign = 'left'; ctx.font = '10px system-ui, sans-serif';
    if (n > 1) {
      ctx.fillText(fechaCorta(serie[0].fecha), ml, h - 8);
      ctx.textAlign = 'right';
      ctx.fillText(fechaCorta(serie[n - 1].fecha), w - mr, h - 8);
    }
  }

  function graficaTemas(canvas) {
    var c = prepararCanvas(canvas), ctx = c.ctx, w = c.w, h = c.h;
    var r = resumenBanco();
    var datos = [];
    TEMARIO.forEach(function (t) {
      var d = r.porTema[t.n];
      var resp = d.aciertos + d.fallos;
      datos.push({ n: t.n, total: d.total, tasa: resp ? d.aciertos / resp : -1, resp: resp });
    });
    if (!datos.some(function (d) { return d.total > 0; })) return vacio(ctx, w, h, 'Importa preguntas para ver el desglose.');

    var ml = 26, mr = 8, mt = 10, mb = 20;
    var gw = w - ml - mr, gh = h - mt - mb;
    var bw = gw / datos.length;
    var borde = css('--borde', '#ddd');
    ctx.strokeStyle = borde;
    [0, 0.5, 1].forEach(function (f) {
      var y = mt + gh - f * gh;
      ctx.beginPath(); ctx.moveTo(ml, y + 0.5); ctx.lineTo(w - mr, y + 0.5); ctx.stroke();
    });
    ctx.fillStyle = css('--txt-sec', '#777'); ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('100%', ml - 4, mt + 8);
    ctx.fillText('0', ml - 4, mt + gh + 3);

    datos.forEach(function (d, i) {
      var x = ml + i * bw + bw * 0.16;
      var ancho = bw * 0.68;
      if (d.tasa < 0) {
        ctx.fillStyle = css('--borde', '#e2e2e2');
        ctx.fillRect(x, mt + gh - 3, ancho, 3);
      } else {
        var alto = Math.max(2, d.tasa * gh);
        ctx.fillStyle = d.tasa >= 0.75 ? css('--ok', '#1f9d55')
          : d.tasa >= 0.5 ? css('--acento', '#e35205') : css('--mal', '#c0392b');
        ctx.fillRect(x, mt + gh - alto, ancho, alto);
      }
      ctx.fillStyle = css('--txt-sec', '#888');
      ctx.font = '9px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(String(d.n), x + ancho / 2, h - 6);
    });
  }

  function graficaActividad(canvas, dias) {
    var c = prepararCanvas(canvas), ctx = c.ctx, w = c.w, h = c.h;
    var serie = actividad(dias || 30);
    var max = Math.max.apply(null, serie.map(function (s) { return s.preguntas; }).concat([1]));
    var ml = 6, mr = 6, mt = 8, mb = 16;
    var gw = w - ml - mr, gh = h - mt - mb;
    var bw = gw / serie.length;
    serie.forEach(function (s, i) {
      var alto = s.preguntas ? Math.max(3, (s.preguntas / max) * gh) : 2;
      ctx.fillStyle = s.preguntas ? css('--acento', '#e35205') : css('--borde', '#e4e4e4');
      ctx.fillRect(ml + i * bw + bw * 0.15, mt + gh - alto, bw * 0.7, alto);
    });
    ctx.fillStyle = css('--txt-sec', '#888'); ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.fillText('hace ' + (dias || 30) + ' días', ml, h - 4);
    ctx.textAlign = 'right'; ctx.fillText('hoy', w - mr, h - 4);
  }

  function graficaDominio(canvas) {
    var c = prepararCanvas(canvas), ctx = c.ctx, w = c.w, h = c.h;
    var prog = Store.estado().progreso;
    var cajas = [0, 0, 0, 0, 0, 0];
    var sinVer = 0;
    Store.preguntas().forEach(function (p) {
      var g = prog[p.id];
      if (!g || !g.vistas) { sinVer++; return; }
      cajas[g.caja]++;
    });
    var total = Store.preguntas().length;
    if (!total) return vacio(ctx, w, h, 'Sin preguntas todavía.');

    var segmentos = [
      { et: 'Sin ver', v: sinVer, col: css('--borde', '#e0e0e0') },
      { et: 'Caja 1', v: cajas[1], col: css('--mal', '#c0392b') },
      { et: 'Caja 2', v: cajas[2], col: '#e8743b' },
      { et: 'Caja 3', v: cajas[3], col: css('--acento', '#e35205') },
      { et: 'Caja 4', v: cajas[4], col: '#7fb069' },
      { et: 'Caja 5', v: cajas[5], col: css('--ok', '#1f9d55') }
    ];
    var x = 0, barra = 26, y = 12;
    segmentos.forEach(function (s) {
      var ancho = (s.v / total) * w;
      if (ancho > 0) { ctx.fillStyle = s.col; ctx.fillRect(x, y, ancho, barra); }
      x += ancho;
    });
    ctx.font = '11px system-ui, sans-serif';
    var lx = 0, ly = y + barra + 20;
    segmentos.forEach(function (s) {
      if (!s.v) return;
      if (lx > w - 90) { lx = 0; ly += 16; }
      ctx.fillStyle = s.col; ctx.fillRect(lx, ly - 8, 9, 9);
      ctx.fillStyle = css('--txt-sec', '#777'); ctx.textAlign = 'left';
      ctx.fillText(s.et + ' ' + s.v, lx + 13, ly);
      lx += ctx.measureText(s.et + ' ' + s.v).width + 30;
    });
  }

  function fechaCorta(ts) {
    var d = new Date(ts);
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
  }

  return {
    resumenBanco: resumenBanco,
    resumenProgreso: resumenProgreso,
    serieProgresion: serieProgresion,
    rachaDias: rachaDias,
    actividad: actividad,
    prediccion: prediccion,
    graficaProgresion: graficaProgresion,
    graficaTemas: graficaTemas,
    graficaActividad: graficaActividad,
    graficaDominio: graficaDominio,
    fechaCorta: fechaCorta
  };
})();
