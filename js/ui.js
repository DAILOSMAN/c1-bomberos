/* ui.js - interfaz, navegacion y ciclo de vida de la sesion. */

(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var sesion = null;
  var cronoTimer = null;
  var marcaTiempo = 0;
  var avisosDados = {};
  var bancoLimite = 25;
  var promptInstalar = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(msg, ms) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('ver');
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove('ver'); }, ms || 2600);
  }

  function modal(html, alCerrar) {
    var f = $('#modal-fondo');
    $('#modal').innerHTML = html;
    f.classList.add('ver');
    f._cerrar = alCerrar;
  }
  function cerrarModal() {
    var f = $('#modal-fondo');
    f.classList.remove('ver');
    if (f._cerrar) { try { f._cerrar(); } catch (e) {} f._cerrar = null; }
  }
  window.cerrarModal = cerrarModal;

  function confirmar(titulo, texto, alAceptar, textoBoton) {
    modal('<h3>' + esc(titulo) + '</h3><p class="sub">' + esc(texto) + '</p>' +
      '<div class="btn-fila" style="justify-content:flex-end">' +
      '<button class="btn" onclick="cerrarModal()">Cancelar</button>' +
      '<button class="btn peligro" id="m-ok">' + esc(textoBoton || 'Confirmar') + '</button></div>');
    $('#m-ok').onclick = function () { cerrarModal(); alAceptar(); };
  }

  function fmtTiempo(ms) {
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    var h = Math.floor(m / 60);
    s = s % 60; m = m % 60;
    if (h) return h + ':' + ('0' + m).slice(-2) + ':' + ('0' + s).slice(-2);
    return ('0' + m).slice(-2) + ':' + ('0' + s).slice(-2);
  }

  function fmtFecha(ts) {
    var d = new Date(ts);
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear() +
      ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function fmtDuracion(ms) {
    var m = Math.round(ms / 60000);
    if (m < 1) return Math.round(ms / 1000) + ' s';
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }

  function pitido(frecuencia, dur) {
    if (!Store.ajustes().sonido) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ctx = pitido._ctx || (pitido._ctx = new AC());
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = frecuencia || 880;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (dur || 0.18));
      o.start(); o.stop(ctx.currentTime + (dur || 0.18) + 0.02);
    } catch (e) {}
  }

  /* ================= navegacion ================= */

  function irA(nombre) {
    if (sesion && nombre !== 'sesion') {
      // no salir del test sin querer
    }
    $$('.vista').forEach(function (v) { v.classList.remove('activa'); });
    var v = $('#v-' + nombre);
    if (v) v.classList.add('activa');
    $$('#nav button').forEach(function (b) {
      b.classList.toggle('activo', b.getAttribute('data-vista') === nombre);
    });
    window.scrollTo(0, 0);
    if (nombre === 'inicio') pintarInicio();
    if (nombre === 'estadisticas') pintarEstadisticas();
    if (nombre === 'banco') { bancoLimite = 25; pintarBanco(); }
    if (nombre === 'test') pintarConfigTest();
    if (nombre === 'ajustes') pintarAjustes();
  }

  /* ================= tema ================= */

  function aplicarTema() {
    var t = Store.ajustes().tema;
    var real = t;
    if (t === 'auto') {
      // si la pagina va incrustada en un visor que marca su tema, mandar el suyo
      var host = document.documentElement.getAttribute('data-theme');
      if (host === 'dark') real = 'oscuro';
      else if (host === 'light') real = 'claro';
      else real = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'oscuro' : 'claro';
    }
    document.documentElement.setAttribute('data-tema', real);
    document.documentElement.setAttribute('data-texto', Store.ajustes().tamanoTexto || 'normal');
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', real === 'oscuro' ? '#1c2025' : '#e35205');
  }

  /* ================= inicio ================= */

  function pintarInicio() {
    var rp = Stats.resumenProgreso();
    var rb = Stats.resumenBanco();
    var racha = Stats.rachaDias();

    $('#m-banco').textContent = rp.totalBanco;
    $('#m-cobertura').textContent = rp.cobertura + '%';
    $('#m-tasa').textContent = rp.tasa ? rp.tasa + '%' : '—';
    $('#m-racha').textContent = racha.racha;

    var sinPreg = $('#aviso-sin-preguntas');
    if (!rp.totalBanco) {
      sinPreg.innerHTML = '<div class="aviso-caja info"><strong>Todavía no hay preguntas.</strong> ' +
        'Ve a <em>Importar</em> y pega las que te pasen: la app entiende JSON, CSV y el formato normal de test. ' +
        'Mientras tanto puedes cargar el cuestionario de muestra para ver cómo funciona todo. ' +
        '<div class="btn-fila" style="margin-top:10px">' +
        '<button class="btn pequeno pri" id="cargar-muestra">Cargar 12 preguntas de muestra</button>' +
        '<button class="btn pequeno" data-vista-ir="importar">Ir a importar</button></div></div>';
      var bm = $('#cargar-muestra');
      if (bm) bm.onclick = cargarMuestra;
    } else if (rb.sinClasificar) {
      sinPreg.innerHTML = '<div class="aviso-caja neutro">Tienes <strong>' + rb.sinClasificar +
        '</strong> preguntas sin tema asignado. Puedes clasificarlas desde <em>Preguntas</em> para que el desglose por tema tenga sentido.</div>';
    } else sinPreg.innerHTML = '';

    var enC = Store.enCurso();
    var av = $('#aviso-en-curso');
    if (enC && enC.items && enC.items.length) {
      av.innerHTML = '<div class="aviso-caja info"><strong>Tienes un test a medias</strong> (' +
        esc(enC.etiqueta) + ', ' + enC.items.length + ' preguntas). ' +
        '<div class="btn-fila" style="margin-top:10px">' +
        '<button class="btn pequeno pri" id="retomar">Retomar</button>' +
        '<button class="btn pequeno" id="descartar">Descartar</button></div></div>';
      $('#retomar').onclick = function () { sesion = enC; avisosDados = {}; irA('sesion'); marcaTiempo = Date.now(); arrancarCrono(); pintarPregunta(); };
      $('#descartar').onclick = function () { Store.limpiarEnCurso(); pintarInicio(); };
    } else av.innerHTML = '';

    var pool = Engine.candidatas({});
    $('#cnt-falladas').textContent = Engine.seleccionFalladas(pool, 9999).length;
    $('#cnt-repaso').textContent = Engine.seleccionRepaso(pool, 9999).length;

    Stats.graficaProgresion($('#g-inicio'), true);
    Stats.graficaTemas($('#g-inicio-temas'));

    var pred = Stats.prediccion();
    $('#txt-prediccion').innerHTML = pred
      ? 'Con ' + pred.simulacros + ' simulacro' + (pred.simulacros === 1 ? '' : 's') +
        ', tu nota estimada es <strong>' + pred.estimada.toFixed(2) + ' / 6</strong> (' + pred.aciertosEstimados +
        ' aciertos). Mejor marca: ' + pred.mejor.toFixed(2) + '. ' +
        (pred.aptoEstimado ? '<span style="color:var(--ok)">Por encima del corte.</span>'
                           : '<span style="color:var(--mal)">Aún por debajo del 3.</span>')
      : 'Haz un simulacro completo para empezar a ver la curva.';

    pintarUltimosIntentos();
    pintarTablaOposicion();
  }

  function pintarUltimosIntentos() {
    var ints = Store.intentos().slice().sort(function (a, b) { return b.inicio - a.inicio; }).slice(0, 6);
    var c = $('#ultimos-intentos');
    if (!ints.length) { c.innerHTML = '<div class="vacio">Sin tests todavía.</div>'; return; }
    var h = '<div class="tabla-scroll"><table class="tabla"><thead><tr><th>Fecha</th><th>Tipo</th><th class="num">Aciertos</th><th class="num">%</th><th class="num">Nota</th><th class="num">Tiempo</th></tr></thead><tbody>';
    ints.forEach(function (i) {
      h += '<tr><td>' + fmtFecha(i.inicio) + '</td><td>' + esc(i.etiqueta || Engine.nombreModo(i.modo)) + '</td>' +
        '<td class="num">' + i.aciertos + '/' + i.total + '</td><td class="num">' + i.porcentaje + '%</td>' +
        '<td class="num"><strong style="color:' + (i.nota >= 3 ? 'var(--ok)' : 'var(--mal)') + '">' + i.nota.toFixed(2) + '</strong></td>' +
        '<td class="num">' + fmtDuracion(i.duracionMs) + '</td></tr>';
    });
    c.innerHTML = h + '</tbody></table></div>';
  }

  function pintarTablaOposicion() {
    var filas = [
      ['Plazas', '108 · Bombero/a Especialista, subgrupo C1'],
      ['Turno', 'Promoción interna · concurso-oposición'],
      ['Ejercicio', 'Test de 40 preguntas + 5 de reserva, 3 opciones'],
      ['Tiempo', '60 minutos'],
      ['Puntuación', '0,15 por acierto · fallos y blancos no penalizan'],
      ['Aprobado', '3 puntos sobre 6 (20 aciertos)'],
      ['Concurso', '4 puntos: titulaciones 1 · cursos 1 · experiencia 1 · antigüedad 1'],
      ['Superar el proceso', '3 en el test y 5 puntos en total'],
      ['Temario', '20 temas: 5 de parte común y 15 de parte específica'],
      ['Batería previa', '200 preguntas publicadas en el Portal de Transparencia'],
      ['Llamamiento', 'Dos días correlativos, dos exámenes equivalentes sorteados en público'],
      ['Material', 'Solo lápiz del n.º 2 y goma. Sin textos legales'],
      ['Publicación', 'BOP Las Palmas n.º 103, de 28/08/2026 · BOE 08/09/2026']
    ];
    var h = '<tbody>';
    filas.forEach(function (f) {
      h += '<tr><td style="width:34%;color:var(--txt-sec)">' + f[0] + '</td><td>' + f[1] + '</td></tr>';
    });
    $('#tabla-oposicion').innerHTML = h + '</tbody>';
  }

  /* ================= configurador ================= */

  function pintarConfigTest() {
    var cont = $('#cfg-temas');
    if (!cont.dataset.listo) {
      var h = '';
      TEMARIO.forEach(function (t) {
        h += '<label class="tema-chip" data-tema="' + t.n + '" title="' + esc(t.detalle) + '">' +
          '<input type="checkbox" value="' + t.n + '" checked>' +
          '<span>' + t.n + '. ' + esc(t.titulo) + '</span>' +
          '<span class="cnt" data-cnt="' + t.n + '">0</span></label>';
      });
      h += '<label class="tema-chip" data-tema="0"><input type="checkbox" value="0" checked>' +
        '<span>Sin clasificar</span><span class="cnt" data-cnt="0">0</span></label>';
      cont.innerHTML = h;
      cont.dataset.listo = '1';
      $$('#cfg-temas input').forEach(function (i) {
        i.addEventListener('change', function () {
          i.closest('.tema-chip').classList.toggle('sel', i.checked);
          resumenConfig();
        });
      });
    }
    var rb = Stats.resumenBanco();
    $$('#cfg-temas .cnt').forEach(function (s) {
      var n = Number(s.getAttribute('data-cnt'));
      s.textContent = (rb.porTema[n] ? rb.porTema[n].total : 0);
    });
    $$('#cfg-temas input').forEach(function (i) {
      i.closest('.tema-chip').classList.toggle('sel', i.checked);
    });
    ajustarCamposModo();
    resumenConfig();
  }

  function temasSeleccionados() {
    return $$('#cfg-temas input:checked').map(function (i) { return Number(i.value); });
  }

  function ajustarCamposModo() {
    var modo = $('#cfg-modo').value;
    var esExamen = modo === 'examen';
    $('#campo-num').style.display = esExamen ? 'none' : '';
    $('#campo-min').style.display = esExamen ? 'none' : '';
    $('#check-reserva').style.display = esExamen ? '' : 'none';
    $('#cfg-feedback').closest('.check').style.display = esExamen ? 'none' : '';
  }

  function resumenConfig() {
    var modo = $('#cfg-modo').value;
    var temas = temasSeleccionados();
    var pool = Engine.candidatas({ temas: temas, soloOficiales: $('#cfg-oficiales').checked });
    var disp = pool.length;
    if (modo === 'falladas') disp = Engine.seleccionFalladas(pool, 9999).length;
    if (modo === 'repaso') disp = Engine.seleccionRepaso(pool, 9999).length;
    if (modo === 'nuevas') disp = pool.filter(function (p) { return Store.progresoDe(p.id).vistas === 0; }).length;
    if (modo === 'marcadas') disp = pool.filter(function (p) { return Store.progresoDe(p.id).marcada; }).length;

    var pedidas = modo === 'examen'
      ? OPOSICION.preguntasExamen + ($('#cfg-reserva').checked ? OPOSICION.preguntasReserva : 0)
      : Number($('#cfg-num').value) || 0;

    var caja = $('#cfg-resumen');
    var btn = $('#btn-empezar');
    if (!disp) {
      caja.className = 'aviso-caja mal';
      caja.innerHTML = 'No hay ninguna pregunta que cumpla estos criterios.';
      btn.disabled = true;
    } else if (disp < pedidas) {
      caja.className = 'aviso-caja neutro';
      caja.innerHTML = 'Disponibles: <strong>' + disp + '</strong>. Se usarán todas (pediste ' + pedidas + ').' +
        (modo === 'examen' ? ' El simulacro no será representativo hasta que tengas al menos 40.' : '');
      btn.disabled = false;
    } else {
      caja.className = 'aviso-caja ok';
      caja.innerHTML = 'Disponibles: <strong>' + disp + '</strong>. Se sortearán <strong>' + pedidas + '</strong>.';
      btn.disabled = false;
    }
  }

  function lanzar(modo, extra) {
    var cfg = Object.assign({
      modo: modo,
      temas: [],
      numPreguntas: 20,
      soloOficiales: Store.ajustes().soloOficiales,
      barajarOpciones: Store.ajustes().barajarOpciones,
      feedbackInmediato: true,
      incluirReserva: Store.ajustes().incluirReserva
    }, extra || {});

    var s = Engine.crearSesion(cfg);
    if (!s) { toast('No hay preguntas suficientes para ese test.'); return; }
    sesion = s;
    avisosDados = {};
    marcaTiempo = Date.now();
    Store.ponerEnCurso(sesion);
    irA('sesion');
    arrancarCrono();
    pintarPregunta();
  }

  /* ================= sesion ================= */

  function itemActual() { return sesion.items[sesion.indice]; }

  function acumularTiempo() {
    if (!sesion) return;
    var ahora = Date.now();
    var it = itemActual();
    if (it) it.tiempoMs += ahora - marcaTiempo;
    marcaTiempo = ahora;
  }

  function arrancarCrono() {
    pararCrono();
    cronoTimer = setInterval(tickCrono, 250);
    tickCrono();
  }
  function pararCrono() { if (cronoTimer) { clearInterval(cronoTimer); cronoTimer = null; } }

  function tickCrono() {
    if (!sesion) return;
    var el = $('#crono');
    var transcurrido = Date.now() - sesion.inicio - (sesion.pausadoMs || 0);
    if (sesion.limiteMs) {
      var resta = sesion.limiteMs - transcurrido;
      el.textContent = fmtTiempo(resta);
      var min = Math.ceil(resta / 60000);
      el.className = 'crono' + (resta <= 60000 ? ' critico' : resta <= 300000 ? ' aviso' : '');
      (Store.ajustes().avisoMinutos || []).forEach(function (m) {
        if (min === m && resta > 0 && !avisosDados[m]) {
          avisosDados[m] = true;
          toast('Quedan ' + m + ' minuto' + (m === 1 ? '' : 's'));
          pitido(m === 1 ? 1200 : 760, 0.2);
        }
      });
      if (resta <= 0) { pitido(400, 0.6); terminar(true); }
    } else {
      el.textContent = fmtTiempo(transcurrido);
      el.className = 'crono';
    }
  }

  function pintarPregunta() {
    if (!sesion) return;
    var it = itemActual();
    var p = Engine.preguntaDe(it);
    if (!p) { siguiente(); return; }

    var g = Store.progresoDe(p.id);
    var esReserva = sesion.indice >= sesion.puntuables;

    var meta = '<span class="etiqueta">' + esc(tituloTema(p.tema)) + '</span>';
    if (p.fuente === 'oficial') meta += '<span class="etiqueta oficial">Oficial</span>';
    if (esReserva) meta += '<span class="etiqueta">Reserva (no puntúa)</span>';
    if (g.vistas) meta += '<span class="etiqueta">' + g.aciertos + '✓ / ' + g.fallos + '✗</span>';
    meta += '<button class="btn pequeno icono" id="btn-marcar" title="Marcar para revisar" style="margin-left:auto">' +
      (g.marcada ? '★' : '☆') + '</button>';
    $('#pregunta-meta').innerHTML = meta;
    $('#btn-marcar').onclick = function () {
      var m = Store.alternarMarcada(p.id);
      $('#btn-marcar').textContent = m ? '★' : '☆';
      toast(m ? 'Marcada para revisar' : 'Desmarcada');
    };

    $('#enunciado').textContent = p.enunciado;

    var opciones = Engine.opcionesMostradas(it);
    var correcta = Engine.indiceCorrectoMostrado(it);
    var respondida = it.respuesta !== null && it.respuesta !== undefined;
    var revelar = sesion.feedbackInmediato && respondida;

    var h = '';
    opciones.forEach(function (txt, i) {
      var cls = 'opcion';
      if (revelar) {
        cls += ' bloqueada';
        if (i === correcta) cls += ' correcta';
        else if (i === it.respuesta) cls += ' incorrecta';
      } else if (it.respuesta === i) cls += ' sel';
      h += '<button class="' + cls + '" data-op="' + i + '">' +
        '<span class="letra">' + 'ABCDEF'.charAt(i) + '</span>' +
        '<span>' + esc(txt) + '</span></button>';
    });
    $('#opciones').innerHTML = h;
    $$('#opciones .opcion').forEach(function (b) {
      b.onclick = function () { responder(Number(b.getAttribute('data-op'))); };
    });

    var fb = $('#feedback');
    if (revelar) {
      var bien = it.respuesta === correcta;
      fb.innerHTML = '<div class="feedback ' + (bien ? 'bien' : 'mal') + '">' +
        '<strong>' + (bien ? 'Correcta' : 'Incorrecta. La buena es la ' + 'ABCDEF'.charAt(correcta)) + '</strong>' +
        (p.explicacion ? esc(p.explicacion) : (p.referencia ? esc(p.referencia) : '')) + '</div>';
    } else fb.innerHTML = '';

    $('#btn-dudosa').textContent = it.dudosa ? '★ Dudosa' : '☆ Dudosa';
    $('#btn-dudosa').classList.toggle('pri', !!it.dudosa);

    var n = sesion.items.length;
    $('#progreso-txt').textContent = (sesion.indice + 1) + ' / ' + n;
    var respondidas = sesion.items.filter(function (x) { return x.respuesta !== null && x.respuesta !== undefined; }).length;
    $('#barra-sesion').style.width = Math.round(respondidas / n * 100) + '%';
    $('#btn-anterior').disabled = sesion.indice === 0;
    $('#btn-siguiente').textContent = sesion.indice === n - 1 ? 'Terminar ▶' : 'Siguiente ▶';

    pintarMapa();
  }

  function pintarMapa() {
    var h = '';
    sesion.items.forEach(function (it, i) {
      var cls = '';
      if (it.respuesta !== null && it.respuesta !== undefined) cls += ' resp';
      if (it.dudosa) cls += ' dudosa';
      if (i === sesion.indice) cls += ' actual';
      if (i >= sesion.puntuables) cls += ' reserva';
      h += '<button class="' + cls.trim() + '" data-i="' + i + '">' + (i + 1) + '</button>';
    });
    $('#mapa').innerHTML = h;
    $$('#mapa button').forEach(function (b) {
      b.onclick = function () {
        acumularTiempo();
        sesion.indice = Number(b.getAttribute('data-i'));
        pintarPregunta();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    });
  }

  function responder(i) {
    var it = itemActual();
    if (sesion.feedbackInmediato && it.respuesta !== null && it.respuesta !== undefined) return;
    acumularTiempo();
    it.respuesta = (it.respuesta === i && !sesion.feedbackInmediato) ? null : i;
    Store.ponerEnCurso(sesion);
    pintarPregunta();
    if (sesion.feedbackInmediato && it.respuesta !== null) {
      var ok = it.respuesta === Engine.indiceCorrectoMostrado(it);
      pitido(ok ? 900 : 300, 0.09);
    }
  }

  function siguiente() {
    acumularTiempo();
    if (sesion.indice >= sesion.items.length - 1) { terminar(false); return; }
    sesion.indice++;
    Store.ponerEnCurso(sesion);
    pintarPregunta();
  }

  function anterior() {
    acumularTiempo();
    if (sesion.indice > 0) { sesion.indice--; pintarPregunta(); }
  }

  function terminar(porTiempo) {
    if (!sesion) return;
    var sinResponder = sesion.items.slice(0, sesion.puntuables)
      .filter(function (x) { return x.respuesta === null || x.respuesta === undefined; }).length;
    if (!porTiempo && sinResponder > 0) {
      confirmar('Terminar el test',
        'Te quedan ' + sinResponder + ' preguntas sin contestar. Recuerda que en este examen los blancos no restan, así que conviene marcar algo.',
        cerrarYCorregir, 'Terminar igualmente');
      return;
    }
    cerrarYCorregir();
  }

  function cerrarYCorregir() {
    acumularTiempo();
    pararCrono();
    sesion.fin = Date.now();
    var res = Engine.corregir(sesion);
    Engine.aplicarProgreso(res);
    Store.guardarIntento(res);
    var s = sesion;
    sesion = null;
    pintarResultado(res, s);
    irA('resultado');
  }

  function abandonar() {
    confirmar('Salir del test', 'Se guardará como pendiente y podrás retomarlo desde el inicio. No se corregirá.', function () {
      acumularTiempo();
      pararCrono();
      Store.ponerEnCurso(sesion);
      sesion = null;
      irA('inicio');
    }, 'Salir');
  }

  /* ================= resultado ================= */

  function pintarResultado(res, s) {
    var esExamen = res.modo === 'examen';
    var apto = esExamen ? res.apto : res.porcentaje >= 50;
    var h = '';

    h += '<div class="veredicto ' + (apto ? 'apto' : 'noapto') + '">';
    if (esExamen) {
      h += '<div class="nota">' + res.nota.toFixed(2) + '</div><div class="de">sobre 6 puntos</div>' +
        '<div class="txt">' + (apto ? 'APTO' : 'NO APTO') + '</div>' +
        '<div class="de" style="margin-top:6px">' + res.aciertos + ' aciertos de ' + res.total +
        ' · necesitas ' + OPOSICION.aciertosMinimos +
        (apto ? '' : ' (te faltan ' + (OPOSICION.aciertosMinimos - res.aciertos) + ')') + '</div>';
    } else {
      h += '<div class="nota">' + res.porcentaje + '%</div><div class="de">' + res.aciertos + ' de ' + res.total + '</div>' +
        '<div class="txt">' + esc(res.etiqueta) + '</div>' +
        '<div class="de" style="margin-top:6px">Equivale a ' + (res.porcentaje / 100 * 6).toFixed(2) + ' puntos en la escala oficial</div>';
    }
    h += '</div>';

    h += '<div class="rejilla c4" style="margin-bottom:14px">' +
      '<div class="metrica bien"><div class="val">' + res.aciertos + '</div><div class="et">Aciertos</div></div>' +
      '<div class="metrica mal"><div class="val">' + res.fallos + '</div><div class="et">Fallos</div></div>' +
      '<div class="metrica"><div class="val">' + res.blancos + '</div><div class="et">En blanco</div></div>' +
      '<div class="metrica acento"><div class="val">' + fmtDuracion(res.duracionMs) + '</div><div class="et">Tiempo</div></div>' +
      '</div>';

    if (esExamen && res.blancos) {
      h += '<div class="aviso-caja neutro">Dejaste <strong>' + res.blancos + '</strong> en blanco. ' +
        'En este examen los fallos no restan: contestar siempre es gratis. Con 3 opciones, esas ' + res.blancos +
        ' podrían haber sido unos ' + (res.blancos / 3).toFixed(1) + ' aciertos de regalo.</div>';
    }

    var tiempoPorPregunta = res.total ? res.duracionMs / res.total / 1000 : 0;
    if (esExamen) {
      var ritmoNecesario = OPOSICION.minutosExamen * 60 / OPOSICION.preguntasExamen;
      h += '<div class="aviso-caja ' + (tiempoPorPregunta <= ritmoNecesario ? 'ok' : 'mal') + '">' +
        'Ritmo: <strong>' + tiempoPorPregunta.toFixed(1) + ' s por pregunta</strong>. ' +
        'El examen da ' + ritmoNecesario.toFixed(0) + ' s de media. ' +
        (tiempoPorPregunta <= ritmoNecesario ? 'Vas sobrado de tiempo.' : 'Vas justo: hay que acelerar.') + '</div>';
    }

    // desglose por tema
    var temas = Object.keys(res.porTema).filter(function (k) { return res.porTema[k].total > 0; });
    if (temas.length > 1) {
      h += '<div class="tarjeta"><h3>Por tema</h3><div class="tabla-scroll"><table class="tabla"><thead><tr>' +
        '<th>Tema</th><th class="num">Aciertos</th><th class="num">%</th></tr></thead><tbody>';
      temas.sort(function (a, b) {
        var ra = res.porTema[a].aciertos / res.porTema[a].total;
        var rb = res.porTema[b].aciertos / res.porTema[b].total;
        return ra - rb;
      }).forEach(function (k) {
        var d = res.porTema[k];
        var pct = Math.round(d.aciertos / d.total * 100);
        h += '<tr><td>' + esc(tituloTema(k)) + '</td><td class="num">' + d.aciertos + '/' + d.total + '</td>' +
          '<td class="num" style="color:' + (pct >= 75 ? 'var(--ok)' : pct >= 50 ? 'var(--acento)' : 'var(--mal)') + '"><strong>' + pct + '%</strong></td></tr>';
      });
      h += '</tbody></table></div></div>';
    }

    h += '<div class="btn-fila" style="margin-bottom:14px">' +
      '<button class="btn pri" id="r-repetir">Repetir este tipo de test</button>' +
      '<button class="btn" id="r-fallos">Test con los fallos de ahora</button>' +
      '<button class="btn" data-vista-ir="estadisticas">Ver progresión</button>' +
      '<button class="btn" data-vista-ir="inicio">Inicio</button></div>';

    // revision
    h += '<div class="tarjeta"><h3>Revisión</h3>' +
      '<div class="btn-fila" style="margin-bottom:12px">' +
      '<button class="btn pequeno" data-filtro="todas">Todas</button>' +
      '<button class="btn pequeno pri" data-filtro="fallos">Solo fallos y blancos</button>' +
      '<button class="btn pequeno" data-filtro="dudosas">Dudosas</button></div>' +
      '<div id="revision"></div></div>';

    $('#resultado-cuerpo').innerHTML = h;

    $('#r-repetir').onclick = function () { lanzar(res.modo, { temas: res.temas, numPreguntas: res.total }); };
    $('#r-fallos').onclick = function () {
      var ids = res.detalle.filter(function (d) { return !d.acertada; }).map(function (d) { return d.qid; });
      if (!ids.length) { toast('No fallaste ninguna. Enhorabuena.'); return; }
      lanzarConIds(ids, 'Fallos del último test');
    };

    var filtro = 'fallos';
    function pintarRev() {
      var lista = res.detalle.filter(function (d) {
        if (filtro === 'fallos') return !d.acertada;
        if (filtro === 'dudosas') return d.dudosa;
        return true;
      });
      if (!lista.length) { $('#revision').innerHTML = '<div class="vacio">Nada que mostrar aquí.</div>'; return; }
      var hh = '';
      lista.forEach(function (d, idx) {
        var p = Store.preguntaPorId(d.qid);
        if (!p) return;
        var ops = d.orden.map(function (i) { return p.opciones[i]; });
        var cls = d.enBlanco ? 'blanco' : d.acertada ? 'bien' : 'mal';
        hh += '<div class="revision-item ' + cls + '">' +
          '<div class="enun">' + esc(p.enunciado) + '</div><ul>';
        ops.forEach(function (o, i) {
          var c = i === d.correcta ? 'c' : (i === d.respuesta ? 'x' : '');
          hh += '<li class="' + c + '">' + 'ABCDEF'.charAt(i) + ') ' + esc(o) +
            (i === d.correcta ? ' ✓' : (i === d.respuesta ? ' ← tu respuesta' : '')) + '</li>';
        });
        hh += '</ul>';
        if (d.enBlanco) hh += '<div class="sub" style="margin:8px 0 0">Sin contestar.</div>';
        if (p.explicacion) hh += '<div class="feedback bien" style="margin-top:9px">' + esc(p.explicacion) + '</div>';
        if (p.referencia) hh += '<div class="sub" style="margin:7px 0 0">' + esc(p.referencia) + '</div>';
        hh += '<div class="sub" style="margin-top:7px">' + esc(tituloTema(p.tema)) + ' · ' + (d.tiempoMs / 1000).toFixed(0) + ' s</div>';
        hh += '</div>';
      });
      $('#revision').innerHTML = hh;
    }
    $$('#resultado-cuerpo [data-filtro]').forEach(function (b) {
      b.onclick = function () {
        filtro = b.getAttribute('data-filtro');
        $$('#resultado-cuerpo [data-filtro]').forEach(function (x) { x.classList.remove('pri'); });
        b.classList.add('pri');
        pintarRev();
      };
    });
    pintarRev();
  }

  function lanzarConIds(ids, etiqueta) {
    var mapa = {};
    ids.forEach(function (i) { mapa[i] = true; });
    var lista = Store.preguntas().filter(function (p) { return mapa[p.id]; });
    if (!lista.length) { toast('No quedan preguntas.'); return; }
    var barajarOps = Store.ajustes().barajarOpciones;
    sesion = {
      id: 's' + Date.now().toString(36),
      modo: 'libre', etiqueta: etiqueta || 'Selección', temas: [], soloOficiales: false,
      feedbackInmediato: true, cronometrado: false, limiteMs: 0,
      puntuables: lista.length,
      items: Engine.barajar(lista).map(function (p) {
        var orden = p.opciones.map(function (_, i) { return i; });
        if (barajarOps) orden = Engine.barajar(orden);
        return { qid: p.id, orden: orden, respuesta: null, dudosa: false, tiempoMs: 0 };
      }),
      indice: 0, inicio: Date.now(), fin: null, pausadoMs: 0
    };
    avisosDados = {}; marcaTiempo = Date.now();
    Store.ponerEnCurso(sesion);
    irA('sesion'); arrancarCrono(); pintarPregunta();
  }

  /* ================= estadisticas ================= */

  function pintarEstadisticas() {
    var rp = Stats.resumenProgreso();
    var ints = Store.intentos();
    $('#e-tests').textContent = ints.length;
    $('#e-preguntas').textContent = rp.aciertos + rp.fallos;
    $('#e-dominadas').textContent = rp.dominadas;
    $('#e-flojas').textContent = rp.flojas;

    Stats.graficaProgresion($('#g-progresion'), $('#e-solo-examenes').checked);
    Stats.graficaDominio($('#g-dominio'));
    Stats.graficaActividad($('#g-actividad'), 30);

    var r = Stats.rachaDias();
    $('#txt-racha').innerHTML = 'Racha actual: <strong>' + r.racha + '</strong> día' + (r.racha === 1 ? '' : 's') +
      ' seguido' + (r.racha === 1 ? '' : 's') + '. Has estudiado ' + r.diasActivos + ' día' + (r.diasActivos === 1 ? '' : 's') +
      ' en total. Media: ' + rp.segundosPorPregunta + ' s por pregunta.';

    // tabla por tema
    var rb = Stats.resumenBanco();
    var h = '<thead><tr><th>Tema</th><th class="num">Preguntas</th><th class="num">Resp.</th><th class="num">Aciertos</th><th class="num">Dominadas</th><th>Nivel</th></tr></thead><tbody>';
    TEMARIO.concat([{ n: 0, titulo: 'Sin clasificar', parte: '' }]).forEach(function (t) {
      var d = rb.porTema[t.n];
      if (!d || !d.total) return;
      var resp = d.aciertos + d.fallos;
      var pct = resp ? Math.round(d.aciertos / resp * 100) : null;
      h += '<tr><td>' + (t.n ? '<strong>' + t.n + '.</strong> ' : '') + esc(t.titulo) +
        (t.parte === 'comun' ? ' <span class="etiqueta">común</span>' : '') + '</td>' +
        '<td class="num">' + d.total + '</td><td class="num">' + resp + '</td>' +
        '<td class="num">' + (pct === null ? '—' : pct + '%') + '</td>' +
        '<td class="num">' + d.dominadas + '</td>' +
        '<td style="min-width:110px"><div class="barra-fondo"><div style="width:' + (pct || 0) + '%;background:' +
        (pct === null ? 'var(--borde)' : pct >= 75 ? 'var(--ok)' : pct >= 50 ? 'var(--acento)' : 'var(--mal)') + '"></div></div></td></tr>';
    });
    $('#tabla-temas').innerHTML = h + '</tbody>';

    // historial
    var hi = '<thead><tr><th>Fecha</th><th>Tipo</th><th class="num">Resultado</th><th class="num">Nota</th><th class="num">Tiempo</th><th></th></tr></thead><tbody>';
    var lista = ints.slice().sort(function (a, b) { return b.inicio - a.inicio; });
    if (!lista.length) hi += '<tr><td colspan="6" style="text-align:center;color:var(--txt-sec);padding:20px">Sin tests todavía.</td></tr>';
    lista.forEach(function (i) {
      hi += '<tr><td>' + fmtFecha(i.inicio) + '</td><td>' + esc(i.etiqueta || Engine.nombreModo(i.modo)) + '</td>' +
        '<td class="num">' + i.aciertos + '/' + i.total + ' (' + i.porcentaje + '%)</td>' +
        '<td class="num"><strong style="color:' + (i.nota >= 3 ? 'var(--ok)' : 'var(--mal)') + '">' + i.nota.toFixed(2) + '</strong></td>' +
        '<td class="num">' + fmtDuracion(i.duracionMs) + '</td>' +
        '<td class="num"><button class="btn pequeno" data-borrar-int="' + i.id + '">✕</button></td></tr>';
    });
    $('#tabla-historial').innerHTML = hi + '</tbody>';
    $$('[data-borrar-int]').forEach(function (b) {
      b.onclick = function () { Store.borrarIntento(b.getAttribute('data-borrar-int')); pintarEstadisticas(); };
    });

    pintarBaremo();
    calcularNota();
  }

  function pintarBaremo() {
    var filas = [
      ['a) Titulaciones académicas', 'Máx. 1', 'Licenciado/Ingeniero/Arquitecto o Grado + Máster 1 · Grado 0,83 · Diplomado/Ing. Téc. 0,67 · Doctorado 0,50 · Máster 0,33 · Experto 0,17. No acumulables y no se valora la exigida como requisito.'],
      ['b) Cursos de formación', 'Máx. 1', 'Por hora: 0,010 aprovechamiento / 0,005 asistencia si tiene menos de 5 años. 0,0075 / 0,00375 hasta 10 años. 0,005 / 0,0025 hasta 15. Más 0,02 si hay formación específica en PRL. No cuentan jornadas ni congresos.'],
      ['c) Experiencia profesional', 'Máx. 1', '0,009 por mes completo en Cuerpos de Extinción de Incendios y Salvamento de cualquier Administración.'],
      ['d) Antigüedad', 'Máx. 1', '0,009 por mes completo reconocido en cualquier Administración. En el Ayuntamiento se acredita de oficio.']
    ];
    var h = '<tbody>';
    filas.forEach(function (f) {
      h += '<tr><td style="white-space:nowrap"><strong>' + f[0] + '</strong></td><td class="num">' + f[1] + '</td><td style="font-size:12.5px;color:var(--txt-sec)">' + f[2] + '</td></tr>';
    });
    $('#tabla-baremo').innerHTML = h + '</tbody>';
  }

  function calcularNota() {
    var ac = Math.max(0, Math.min(40, Number($('#calc-aciertos').value) || 0));
    var co = Math.max(0, Math.min(4, Number($('#calc-concurso').value) || 0));
    var nota = ac * OPOSICION.puntosPorAcierto;
    var r = Engine.notaProceso(nota, co);
    var h = '<div class="rejilla c3">' +
      '<div class="metrica ' + (r.superaOposicion ? 'bien' : 'mal') + '"><div class="val">' + r.oposicion.toFixed(2) + '</div><div class="et">Oposición / 6</div></div>' +
      '<div class="metrica"><div class="val">' + r.concurso.toFixed(2) + '</div><div class="et">Concurso / 4</div></div>' +
      '<div class="metrica ' + (r.superaProceso ? 'bien' : 'mal') + '"><div class="val">' + r.total.toFixed(2) + '</div><div class="et">Total / 10</div></div></div>';
    h += '<div class="aviso-caja ' + (r.superaProceso ? 'ok' : 'mal') + '" style="margin-top:12px">';
    if (!r.superaOposicion) {
      h += 'Con ' + ac + ' aciertos <strong>no superas el ejercicio</strong>: hacen falta 3 puntos, es decir ' +
        OPOSICION.aciertosMinimos + ' aciertos. Te faltan ' + (OPOSICION.aciertosMinimos - ac) + '.';
    } else if (!r.superaProceso) {
      h += 'Apruebas el test, pero el total se queda en ' + r.total.toFixed(2) +
        ' y hacen falta 5. Necesitas ' + (5 - r.total).toFixed(2) + ' puntos más entre test y méritos.';
    } else {
      h += 'Superas el proceso: ' + r.oposicion.toFixed(2) + ' en el ejercicio y ' + r.total.toFixed(2) + ' en total. ' +
        'Recuerda que las plazas van por orden de puntuación.';
    }
    h += '</div>';
    $('#calc-salida').innerHTML = h;
  }

  /* ================= banco ================= */

  function filtrarBanco() {
    var q = ($('#b-buscar').value || '').toLowerCase().trim();
    var tema = $('#b-tema').value;
    var filtro = $('#b-filtro').value;
    return Store.preguntas().filter(function (p) {
      if (tema !== '' && Number(p.tema) !== Number(tema)) return false;
      if (q) {
        var texto = (p.enunciado + ' ' + p.opciones.join(' ')).toLowerCase();
        if (texto.indexOf(q) === -1) return false;
      }
      var g = Store.estado().progreso[p.id];
      switch (filtro) {
        case 'falladas': return g && g.fallos > 0;
        case 'marcadas': return g && g.marcada;
        case 'sinver': return !g || !g.vistas;
        case 'dominadas': return g && g.caja >= 4;
        case 'oficiales': return p.fuente === 'oficial';
        case 'sinclasificar': return !p.tema;
        default: return true;
      }
    });
  }

  function pintarBanco() {
    var selT = $('#b-tema');
    if (!selT.dataset.listo) {
      var h = '<option value="">Todos los temas</option><option value="0">Sin clasificar</option>';
      TEMARIO.forEach(function (t) { h += '<option value="' + t.n + '">' + t.n + '. ' + esc(t.titulo) + '</option>'; });
      selT.innerHTML = h;
      selT.dataset.listo = '1';
    }
    var lista = filtrarBanco();
    $('#b-conteo').textContent = lista.length + ' de ' + Store.preguntas().length + ' preguntas';

    var mostrar = lista.slice(0, bancoLimite);
    if (!mostrar.length) {
      $('#b-lista').innerHTML = '<div class="vacio"><div class="icono">◇</div>No hay preguntas con esos filtros.</div>';
      $('#b-mas').style.display = 'none';
      return;
    }
    var hh = '';
    mostrar.forEach(function (p) {
      var g = Store.progresoDe(p.id);
      hh += '<div class="revision-item" style="border-left-color:' +
        (g.vistas ? (g.fallos > g.aciertos ? 'var(--mal)' : g.caja >= 4 ? 'var(--ok)' : 'var(--acento)') : 'var(--borde)') + ';border-left-width:3px">' +
        '<div class="enun">' + esc(p.enunciado) + '</div><ul>';
      p.opciones.forEach(function (o, i) {
        hh += '<li class="' + (i === p.correcta ? 'c' : '') + '">' + 'ABCDEF'.charAt(i) + ') ' + esc(o) + '</li>';
      });
      hh += '</ul><div class="pregunta-meta" style="margin:9px 0 0">' +
        '<span class="etiqueta">' + esc(tituloTema(p.tema)) + '</span>' +
        (p.fuente === 'oficial' ? '<span class="etiqueta oficial">Oficial</span>' : '') +
        '<span class="etiqueta">' + g.aciertos + '✓ / ' + g.fallos + '✗ · caja ' + g.caja + '</span>' +
        (g.marcada ? '<span class="etiqueta">★ marcada</span>' : '') +
        '<span style="margin-left:auto"></span>' +
        '<button class="btn pequeno" data-editar="' + p.id + '">Editar</button>' +
        '<button class="btn pequeno peligro" data-borrar="' + p.id + '">Borrar</button>' +
        '</div></div>';
    });
    $('#b-lista').innerHTML = hh;
    $('#b-mas').style.display = lista.length > bancoLimite ? '' : 'none';

    $$('[data-borrar]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-borrar');
        confirmar('Borrar pregunta', 'Se elimina del banco junto con su historial.', function () {
          Store.borrarPregunta(id); pintarBanco(); toast('Pregunta borrada');
        }, 'Borrar');
      };
    });
    $$('[data-editar]').forEach(function (b) {
      b.onclick = function () { editorPregunta(b.getAttribute('data-editar')); };
    });
  }

  function editorPregunta(id) {
    var p = id ? Store.preguntaPorId(id) : null;
    var ops = p ? p.opciones.slice() : ['', '', ''];
    while (ops.length < 3) ops.push('');
    var h = '<h3>' + (p ? 'Editar pregunta' : 'Nueva pregunta') + '</h3>';
    h += '<label class="campo"><span>Enunciado</span><textarea id="ed-enun" style="min-height:80px;font-family:inherit;font-size:14px">' + esc(p ? p.enunciado : '') + '</textarea></label>';
    ops.forEach(function (o, i) {
      h += '<label class="campo"><span>Opción ' + 'ABC'.charAt(i) + '</span><input type="text" id="ed-op' + i + '" value="' + esc(o) + '"></label>';
    });
    h += '<div class="rejilla c2"><label class="campo"><span>Respuesta correcta</span><select id="ed-cor">' +
      ['A', 'B', 'C'].map(function (l, i) { return '<option value="' + i + '"' + (p && p.correcta === i ? ' selected' : '') + '>' + l + '</option>'; }).join('') +
      '</select></label>';
    h += '<label class="campo"><span>Tema</span><select id="ed-tema"><option value="0">Sin clasificar</option>' +
      TEMARIO.map(function (t) { return '<option value="' + t.n + '"' + (p && Number(p.tema) === t.n ? ' selected' : '') + '>' + t.n + '. ' + esc(t.titulo) + '</option>'; }).join('') +
      '</select></label></div>';
    h += '<label class="campo"><span>Explicación (opcional)</span><textarea id="ed-exp" style="min-height:60px;font-family:inherit;font-size:14px">' + esc(p ? p.explicacion : '') + '</textarea></label>';
    h += '<label class="campo"><span>Referencia legal (opcional)</span><input type="text" id="ed-ref" value="' + esc(p ? p.referencia : '') + '"></label>';
    h += '<label class="check"><input type="checkbox" id="ed-of"' + (p && p.fuente === 'oficial' ? ' checked' : '') + '> <span>Es una pregunta oficial de la batería del Ayuntamiento</span></label>';
    h += '<div class="btn-fila" style="justify-content:flex-end"><button class="btn" onclick="cerrarModal()">Cancelar</button>' +
      '<button class="btn pri" id="ed-guardar">Guardar</button></div>';
    modal(h);
    $('#ed-guardar').onclick = function () {
      var datos = {
        enunciado: $('#ed-enun').value,
        opciones: [$('#ed-op0').value, $('#ed-op1').value, $('#ed-op2').value],
        correcta: Number($('#ed-cor').value),
        tema: Number($('#ed-tema').value),
        explicacion: $('#ed-exp').value,
        referencia: $('#ed-ref').value,
        fuente: $('#ed-of').checked ? 'oficial' : 'propia'
      };
      var norm = Importer.normalizar(datos, 0, 0);
      if (!norm) { toast('Faltan el enunciado o alguna opción.'); return; }
      if (p) {
        Store.actualizarPregunta(p.id, {
          enunciado: norm.enunciado, opciones: norm.opciones, correcta: norm.correcta,
          tema: norm.tema, explicacion: norm.explicacion, referencia: norm.referencia,
          fuente: norm.fuente, huella: norm.huella
        });
        toast('Pregunta actualizada');
      } else {
        var r = Store.anadirPreguntas([norm]);
        toast(r.nuevas ? 'Pregunta añadida' : 'Ya tenías esa pregunta');
      }
      cerrarModal();
      pintarBanco();
    };
  }

  /* ================= importar ================= */

  var pendientes = null;

  function rellenarSelectTemas(sel, incluirCero) {
    var h = incluirCero ? '<option value="0">Sin clasificar</option>' : '';
    TEMARIO.forEach(function (t) { h += '<option value="' + t.n + '">' + t.n + '. ' + esc(t.titulo) + '</option>'; });
    sel.innerHTML = h;
  }

  function analizarImportacion() {
    var texto = $('#imp-texto').value;
    if (!texto.trim()) { toast('Pega primero las preguntas.'); return; }
    var temaDef = Number($('#imp-tema').value) || 0;
    var res = Importer.detectarYParsear(texto, temaDef);
    var fuente = $('#imp-fuente').value;
    res.preguntas.forEach(function (p) { p.fuente = fuente; });
    pendientes = res.preguntas;

    var h = '';
    if (!res.preguntas.length) {
      h += '<div class="aviso-caja mal"><strong>No se ha podido leer ninguna pregunta.</strong> ' +
        'Comprueba que cada pregunta tenga sus opciones y su respuesta. Pulsa "Ver formatos admitidos" para ver ejemplos que funcionan.</div>';
    } else {
      h += '<div class="aviso-caja ok"><strong>' + res.preguntas.length + ' preguntas leídas</strong> (formato detectado: ' + res.formato + ').</div>';
      var sinTema = res.preguntas.filter(function (p) { return !p.tema; }).length;
      if (sinTema) h += '<div class="aviso-caja neutro">' + sinTema + ' se quedan sin tema. Elige un tema por defecto arriba y vuelve a analizar, o clasifícalas luego desde <em>Preguntas</em>.</div>';
      h += '<div class="tarjeta" style="background:var(--panel-2);max-height:340px;overflow:auto">';
      res.preguntas.slice(0, 6).forEach(function (p) {
        h += '<div class="revision-item"><div class="enun">' + esc(p.enunciado) + '</div><ul>';
        p.opciones.forEach(function (o, i) { h += '<li class="' + (i === p.correcta ? 'c' : '') + '">' + 'ABCDEF'.charAt(i) + ') ' + esc(o) + '</li>'; });
        h += '</ul><div class="sub" style="margin-top:6px">' + esc(tituloTema(p.tema)) + '</div></div>';
      });
      if (res.preguntas.length > 6) h += '<div class="sub" style="text-align:center">…y ' + (res.preguntas.length - 6) + ' más</div>';
      h += '</div>';
      h += '<button class="btn pri ancho" id="imp-confirmar">Añadir ' + res.preguntas.length + ' preguntas al banco</button>';
    }
    if (res.errores && res.errores.length) {
      h += '<details style="margin-top:12px"><summary style="cursor:pointer;color:var(--mal);font-size:13.5px">' +
        res.errores.length + ' línea(s) no interpretadas</summary><div class="sub" style="margin-top:8px">' +
        res.errores.slice(0, 25).map(esc).join('<br>') + '</div></details>';
    }
    $('#imp-resultado').innerHTML = h;
    var bc = $('#imp-confirmar');
    if (bc) bc.onclick = function () {
      var r = Store.anadirPreguntas(pendientes);
      toast(r.nuevas + ' añadidas' + (r.duplicadas ? ', ' + r.duplicadas + ' ya las tenías' : ''), 4000);
      $('#imp-texto').value = '';
      $('#imp-resultado').innerHTML = '<div class="aviso-caja ok"><strong>Listo.</strong> ' + r.nuevas +
        ' preguntas nuevas en el banco' + (r.duplicadas ? ' (' + r.duplicadas + ' repetidas descartadas)' : '') + '.</div>';
      pendientes = null;
    };
  }

  function ejemplosFormato() {
    var txt = '' +
      '1. ¿Cuántas fases contempla el manual APRAT?\n' +
      'a) Dos\n' +
      'b) Tres\n' +
      'c) Cuatro\n' +
      'Respuesta: b\n\n' +
      '2. El tetraedro del fuego añade al triángulo:\n' +
      'a) El oxígeno\n' +
      '*b) La reacción en cadena\n' +
      'c) El calor\n';
    var csv = 'enunciado,a,b,c,correcta,tema\n"¿Qué clase de fuego es el de metales?","Clase C","Clase D","Clase F",B,6';
    var json = '[{"tema":6,"enunciado":"...","opciones":["...","...","..."],"correcta":1,"explicacion":"..."}]';
    modal('<h3>Formatos que entiende</h3>' +
      '<p class="sub">Pega lo que te den. Si el formato es raro, avísame y lo adapto.</p>' +
      '<p style="font-weight:600;font-size:13px;margin:14px 0 4px">Texto normal de test</p>' +
      '<pre style="background:var(--panel-2);padding:11px;border-radius:8px;font-size:12px;overflow:auto">' + esc(txt) + '</pre>' +
      '<p class="sub">La correcta puede ir como <code>Respuesta: b</code>, con un asterisco delante de la opción, o en una lista final tipo <code>SOLUCIONES: 1-B 2-C</code>. Las líneas <code>TEMA 6</code> cambian el tema de lo que viene detrás.</p>' +
      '<p style="font-weight:600;font-size:13px;margin:14px 0 4px">CSV</p>' +
      '<pre style="background:var(--panel-2);padding:11px;border-radius:8px;font-size:12px;overflow:auto">' + esc(csv) + '</pre>' +
      '<p style="font-weight:600;font-size:13px;margin:14px 0 4px">JSON</p>' +
      '<pre style="background:var(--panel-2);padding:11px;border-radius:8px;font-size:12px;overflow:auto">' + esc(json) + '</pre>' +
      '<div class="btn-fila" style="justify-content:flex-end"><button class="btn" onclick="cerrarModal()">Cerrar</button></div>');
  }

  /* Dentro de un iframe (por ejemplo abierta como pagina publicada) el
     navegador bloquea las descargas sin avisar, asi que ahi se ofrece el
     texto para copiar en vez de un fichero que nunca llegaria. */
  function enIframe() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }

  function copiaManual(nombre, contenido, motivo) {
    modal('<h3>' + esc(nombre) + '</h3>' +
      '<p class="sub">' + esc(motivo) + '</p>' +
      '<textarea id="cm-txt" style="min-height:180px" readonly>' + esc(contenido) + '</textarea>' +
      '<div class="btn-fila" style="justify-content:flex-end;margin-top:10px">' +
      '<button class="btn pri" id="cm-copiar">Copiar al portapapeles</button>' +
      '<button class="btn" onclick="cerrarModal()">Cerrar</button></div>');
    $('#cm-copiar').onclick = function () {
      var ta = $('#cm-txt');
      ta.select(); ta.setSelectionRange(0, ta.value.length);
      var ok = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(ta.value); ok = true;
        } else ok = document.execCommand('copy');
      } catch (e) { ok = false; }
      toast(ok ? 'Copiado. Pégalo en un fichero .json y guárdalo.' : 'Selecciona el texto y cópialo a mano.', 4000);
    };
  }

  function descargar(nombre, contenido) {
    if (enIframe()) {
      copiaManual(nombre, contenido,
        'Abierta dentro de otra página, el navegador no deja descargar ficheros. ' +
        'Copia este texto y guárdalo como ' + nombre + ', o abre la app en su propia pestaña.');
      return;
    }
    try {
      var blob = new Blob([contenido], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
      toast('Fichero generado: ' + nombre);
    } catch (e) {
      copiaManual(nombre, contenido, 'El navegador no ha dejado descargar el fichero. Copia este texto y guárdalo tú:');
    }
  }

  function leerFichero(input, alLeer) {
    var f = input.files && input.files[0];
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () { alLeer(String(fr.result), f.name); };
    fr.readAsText(f, 'utf-8');
    input.value = '';
  }

  /* ================= muestra ================= */

  function cargarMuestra() {
    var muestra = [
      { tema: 6, enunciado: '¿Qué elemento añade el tetraedro del fuego respecto al triángulo del fuego?', opciones: ['El oxígeno', 'La reacción en cadena', 'El calor'], correcta: 1, explicacion: 'El tetraedro suma la reacción en cadena a combustible, comburente y energía de activación.' },
      { tema: 6, enunciado: 'Según la clasificación de fuegos, los fuegos de metales se corresponden con la clase:', opciones: ['Clase C', 'Clase D', 'Clase F'], correcta: 1, explicacion: 'La clase D corresponde a metales combustibles. La C son gases y la F aceites y grasas de cocina.' },
      { tema: 6, enunciado: 'La temperatura es una magnitud que mide:', opciones: ['La cantidad total de energía térmica de un cuerpo', 'El nivel térmico o grado de agitación de las moléculas', 'La velocidad de propagación de la llama'], correcta: 1 },
      { tema: 8, enunciado: 'El mecanismo de extinción principal del agua es:', opciones: ['La inhibición química', 'El enfriamiento', 'La dilución'], correcta: 1, explicacion: 'El agua actúa fundamentalmente por enfriamiento, gracias a su alto calor específico y de vaporización.' },
      { tema: 8, enunciado: 'El polvo polivalente ABC actúa principalmente por:', opciones: ['Sofocación e inhibición', 'Enfriamiento', 'Dilución del combustible'], correcta: 0 },
      { tema: 10, enunciado: 'Según el manual APRAT, la fase 2 de la intervención en accidentes de tráfico se corresponde con:', opciones: ['La atención a la víctima', 'Los planes de excarcelación', 'La extracción'], correcta: 1 },
      { tema: 12, enunciado: 'La norma que regula las reglas de seguridad para ascensores de personas es la:', opciones: ['UNE-EN 81-20', 'UNE-EN 54', 'UNE 23500'], correcta: 0 },
      { tema: 15, enunciado: 'El Reglamento Electrotécnico para Baja Tensión fue aprobado por:', opciones: ['RD 842/2002', 'RD 314/2006', 'RD 513/2017'], correcta: 0 },
      { tema: 19, enunciado: 'La NTP 223 trata sobre:', opciones: ['Trabajos en espacios confinados', 'Equipos de protección respiratoria', 'Señalización de emergencia'], correcta: 0 },
      { tema: 20, enunciado: 'Dentro del CTE, la sección que regula la intervención de los bomberos es:', opciones: ['SI 4', 'SI 5', 'SI 6'], correcta: 1, explicacion: 'DB-SI 5: Intervención de los bomberos. Trata aproximación y accesibilidad por fachada.' },
      { tema: 1, enunciado: 'El Título I de la Constitución Española de 1978 se denomina:', opciones: ['De la Corona', 'De los derechos y deberes fundamentales', 'De las Cortes Generales'], correcta: 1 },
      { tema: 3, enunciado: 'El texto refundido del Estatuto Básico del Empleado Público fue aprobado por:', opciones: ['Real Decreto Legislativo 5/2015', 'Ley 39/2015', 'Real Decreto Legislativo 2/2015'], correcta: 0 }
    ];
    var norm = muestra.map(function (m) { return Importer.normalizar(m, 0, 0); }).filter(Boolean);
    var r = Store.anadirPreguntas(norm);
    toast(r.nuevas + ' preguntas de muestra cargadas');
    pintarInicio();
  }

  /* ================= ajustes ================= */

  function pintarAjustes() {
    var a = Store.ajustes();
    $('#aj-nombre').value = Store.estado().meta.nombre || '';
    $('#aj-tema').value = a.tema;
    $('#aj-texto').value = a.tamanoTexto || 'normal';
    $('#aj-barajar').checked = !!a.barajarOpciones;
    $('#aj-sonido').checked = !!a.sonido;
    var m = Store.modo();
    $('#aj-almacen').innerHTML = 'Banco: <strong>' + Store.preguntas().length + '</strong> preguntas · ' +
      'Historial: <strong>' + Store.intentos().length + '</strong> tests · ' +
      'Guardado en: <strong>' + (m === 'indexeddb' ? 'este navegador (IndexedDB)' : m === 'localstorage' ? 'este navegador (almacenamiento local)' : 'solo memoria — ¡exporta antes de cerrar!') + '</strong>.' +
      (m === 'memoria' ? '<br><span style="color:var(--mal)">Este navegador no deja guardar datos. Ábrela desde una dirección web o con otro navegador.</span>' : '');

    var ins = $('#aj-instalar');
    if (promptInstalar) {
      ins.innerHTML = '<div class="btn-fila" style="margin-top:10px"><button class="btn pri" id="btn-instalar">Instalar en este dispositivo</button></div>';
      $('#btn-instalar').onclick = function () {
        promptInstalar.prompt();
        promptInstalar.userChoice.then(function () { promptInstalar = null; pintarAjustes(); });
      };
    } else ins.innerHTML = '';
  }

  /* ================= eventos ================= */

  function enlazar() {
    $$('#nav button').forEach(function (b) {
      b.onclick = function () {
        if (sesion) { toast('Termina o sal del test antes de cambiar de sección.'); return; }
        irA(b.getAttribute('data-vista'));
      };
    });
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-vista-ir]');
      if (t) { irA(t.getAttribute('data-vista-ir')); return; }
      var l = e.target.closest('[data-lanzar]');
      if (l) {
        var m = l.getAttribute('data-lanzar');
        lanzar(m, m === 'examen' ? {} : { numPreguntas: 20 });
      }
    });

    $('#btn-tema').onclick = function () {
      var orden = ['claro', 'oscuro', 'auto'];
      var i = orden.indexOf(Store.ajustes().tema);
      Store.ponerAjuste('tema', orden[(i + 1) % 3]);
      aplicarTema();
      toast('Tema: ' + Store.ajustes().tema);
    };

    $('#modal-fondo').onclick = function (e) { if (e.target === $('#modal-fondo')) cerrarModal(); };

    // configurador
    $('#cfg-modo').onchange = function () { ajustarCamposModo(); resumenConfig(); };
    ['#cfg-num', '#cfg-oficiales', '#cfg-reserva'].forEach(function (s) {
      $(s).addEventListener('change', resumenConfig);
      $(s).addEventListener('input', resumenConfig);
    });
    function marcarTemas(fn) {
      $$('#cfg-temas input').forEach(function (i) {
        i.checked = fn(Number(i.value));
        i.closest('.tema-chip').classList.toggle('sel', i.checked);
      });
      resumenConfig();
    }
    $('#temas-todos').onclick = function () { marcarTemas(function () { return true; }); };
    $('#temas-ninguno').onclick = function () { marcarTemas(function () { return false; }); };
    $('#temas-comunes').onclick = function () { marcarTemas(function (n) { var t = temaPorNumero(n); return t && t.parte === 'comun'; }); };
    $('#temas-especificos').onclick = function () { marcarTemas(function (n) { var t = temaPorNumero(n); return t && t.parte === 'especifica'; }); };
    $('#temas-flojos').onclick = function () {
      var rb = Stats.resumenBanco();
      marcarTemas(function (n) {
        var d = rb.porTema[n];
        if (!d || !d.total) return false;
        var resp = d.aciertos + d.fallos;
        return !resp || (d.aciertos / resp) < 0.7;
      });
      toast('Seleccionados los temas por debajo del 70%');
    };
    $('#btn-empezar').onclick = function () {
      lanzar($('#cfg-modo').value, {
        temas: temasSeleccionados(),
        numPreguntas: Number($('#cfg-num').value) || 20,
        minutos: Number($('#cfg-min').value) || 0,
        cronometrado: (Number($('#cfg-min').value) || 0) > 0,
        soloOficiales: $('#cfg-oficiales').checked,
        barajarOpciones: $('#cfg-barajar').checked,
        feedbackInmediato: $('#cfg-feedback').checked,
        incluirReserva: $('#cfg-reserva').checked
      });
    };

    // sesion
    $('#btn-siguiente').onclick = siguiente;
    $('#btn-anterior').onclick = anterior;
    $('#btn-terminar').onclick = function () { terminar(false); };
    $('#btn-abandonar').onclick = abandonar;
    $('#btn-dudosa').onclick = function () {
      var it = itemActual();
      it.dudosa = !it.dudosa;
      Store.ponerEnCurso(sesion);
      pintarPregunta();
    };

    document.addEventListener('keydown', function (e) {
      if (!sesion) return;
      if (/input|textarea|select/i.test((e.target.tagName || ''))) return;
      var k = e.key.toLowerCase();
      if ('123'.indexOf(k) >= 0) { responder(Number(k) - 1); e.preventDefault(); }
      else if ('abc'.indexOf(k) >= 0) { responder('abc'.indexOf(k)); e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { siguiente(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { anterior(); e.preventDefault(); }
      else if (k === 'd') { $('#btn-dudosa').click(); }
    });

    // estadisticas
    $('#e-solo-examenes').onchange = pintarEstadisticas;
    $('#calc-aciertos').oninput = calcularNota;
    $('#calc-concurso').oninput = calcularNota;

    // banco
    ['#b-buscar', '#b-tema', '#b-filtro'].forEach(function (s) {
      $(s).addEventListener('input', function () { bancoLimite = 25; pintarBanco(); });
      $(s).addEventListener('change', function () { bancoLimite = 25; pintarBanco(); });
    });
    $('#b-mas').onclick = function () { bancoLimite += 25; pintarBanco(); };
    $('#b-nueva').onclick = function () { editorPregunta(null); };
    $('#b-exportar').onclick = function () {
      descargar('banco_c1_bomberos.json', JSON.stringify(Store.exportarBanco(), null, 1));
    };
    $('#b-borrar-filtro').onclick = function () {
      var lista = filtrarBanco();
      if (!lista.length) return;
      confirmar('Borrar ' + lista.length + ' preguntas', 'Se eliminan las que ves ahora mismo con los filtros puestos. No se puede deshacer.', function () {
        Store.borrarPreguntas(lista.map(function (p) { return p.id; }));
        pintarBanco(); toast('Borradas ' + lista.length);
      }, 'Borrar');
    };

    // importar
    $('#imp-analizar').onclick = analizarImportacion;
    $('#imp-ejemplo').onclick = ejemplosFormato;
    $('#imp-fichero').onchange = function () {
      leerFichero(this, function (txt, nombre) {
        $('#imp-texto').value = txt;
        toast('Cargado ' + nombre);
        analizarImportacion();
      });
    };
    $('#exp-todo').onclick = function () {
      descargar('copia_c1_bomberos_' + new Date().toISOString().slice(0, 10) + '.json',
        JSON.stringify(Store.exportarTodo(), null, 1));
    };
    $('#exp-banco').onclick = function () {
      descargar('banco_c1_bomberos.json', JSON.stringify(Store.exportarBanco(), null, 1));
    };
    $('#imp-copia').onchange = function () {
      leerFichero(this, function (txt) {
        var obj;
        try { obj = JSON.parse(txt); } catch (e) { toast('El fichero no es un JSON válido.'); return; }
        modal('<h3>Restaurar copia</h3><p class="sub">El fichero trae ' +
          ((obj.preguntas || []).length) + ' preguntas' +
          (obj.intentos ? ' y ' + obj.intentos.length + ' tests del historial' : '') + '.</p>' +
          '<div class="btn-fila"><button class="btn" id="rc-fusion">Añadir a lo que ya tengo</button>' +
          '<button class="btn peligro" id="rc-reemplazar">Reemplazar todo</button>' +
          '<button class="btn" onclick="cerrarModal()">Cancelar</button></div>');
        $('#rc-fusion').onclick = function () { hacer(true); };
        $('#rc-reemplazar').onclick = function () { hacer(false); };
        function hacer(fusionar) {
          var r = Store.importarCopia(obj, fusionar);
          cerrarModal();
          toast(r.ok ? (r.nuevas + ' preguntas cargadas') : r.error, 4000);
          irA('inicio');
        }
      });
    };

    // ajustes
    $('#aj-nombre').oninput = function () { Store.estado().meta.nombre = this.value; Store.guardar(); };
    $('#aj-tema').onchange = function () { Store.ponerAjuste('tema', this.value); aplicarTema(); };
    $('#aj-texto').onchange = function () { Store.ponerAjuste('tamanoTexto', this.value); aplicarTema(); };
    $('#aj-barajar').onchange = function () { Store.ponerAjuste('barajarOpciones', this.checked); };
    $('#aj-sonido').onchange = function () { Store.ponerAjuste('sonido', this.checked); };
    $('#aj-reiniciar').onclick = function () {
      confirmar('Reiniciar progreso', 'Se borra el historial de tests y las estadísticas. Las preguntas se quedan.', function () {
        Store.reiniciarProgreso(); toast('Progreso reiniciado'); irA('inicio');
      }, 'Reiniciar');
    };
    $('#aj-borrar').onclick = function () {
      confirmar('Borrar todo', 'Preguntas, progreso e historial. Todo. Exporta antes si no quieres perderlo.', function () {
        Store.borrarTodo(); toast('Todo borrado'); irA('inicio');
      }, 'Borrar todo');
    };

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); promptInstalar = e;
      if ($('#v-ajustes').classList.contains('activa')) pintarAjustes();
    });

    window.addEventListener('beforeunload', function (e) {
      if (sesion) {
        acumularTiempo();
        Store.ponerEnCurso(sesion);
        Store.guardarAhora();
        e.preventDefault(); e.returnValue = '';
      }
    });

    var reajuste;
    window.addEventListener('resize', function () {
      clearTimeout(reajuste);
      reajuste = setTimeout(function () {
        if ($('#v-inicio').classList.contains('activa')) { Stats.graficaProgresion($('#g-inicio'), true); Stats.graficaTemas($('#g-inicio-temas')); }
        if ($('#v-estadisticas').classList.contains('activa')) pintarEstadisticas();
      }, 200);
    });

    if (window.matchMedia) {
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
          if (Store.ajustes().tema === 'auto') aplicarTema();
        });
      } catch (e) {}
    }
  }

  /* ================= arranque ================= */

  Store.cargar().then(function () {
    aplicarTema();
    rellenarSelectTemas($('#imp-tema'), true);
    enlazar();
    irA('inicio');

    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  });

})();
