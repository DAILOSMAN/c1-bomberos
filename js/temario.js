/* Temario oficial - Anexo III de las bases especificas
   BOP Las Palmas n. 103, de 28/08/2026. 108 plazas Bombero/a Especialista C1,
   promocion interna. Ayuntamiento de Las Palmas de Gran Canaria. */

var TEMARIO = [
  { n: 1, parte: 'comun', titulo: 'La Constitución Española de 1978',
    detalle: 'Título Preliminar. Título I: De los derechos y deberes fundamentales.' },
  { n: 2, parte: 'comun', titulo: 'Estatuto de Autonomía de Canarias',
    detalle: 'LO 1/2018, de 5 de noviembre. Título Preliminar y Título I.' },
  { n: 3, parte: 'comun', titulo: 'Personal al servicio de las Administraciones Públicas',
    detalle: 'RDL 5/2015 (TREBEP). Título II: personal al servicio de las AAPP. Título III: derechos y deberes, código de conducta.' },
  { n: 4, parte: 'comun', titulo: 'Prevención de Riesgos Laborales',
    detalle: 'Ley 31/1995. Cap. I: objeto, ámbito y definiciones. Cap. II: política de prevención. Cap. III: derechos y obligaciones.' },
  { n: 5, parte: 'comun', titulo: 'Políticas públicas de igualdad',
    detalle: 'LO 3/2007. Título Preliminar: objeto y ámbito. Título I: principio de igualdad y tutela contra la discriminación.' },

  { n: 6, parte: 'especifica', titulo: 'Teoría del fuego',
    detalle: 'Triángulo y tetraedro del fuego. Fuentes de ignición. Clases de fuegos. Calor y temperatura.' },
  { n: 7, parte: 'especifica', titulo: 'Extinción de incendios estructurales',
    detalle: 'Incendios sobre rasante y bajo rasante. Principios generales de actuación.' },
  { n: 8, parte: 'especifica', titulo: 'Agentes extintores',
    detalle: 'Agentes sólidos, líquidos y gaseosos. Mecanismos de extinción.' },
  { n: 9, parte: 'especifica', titulo: 'Herramientas de intervención del SEIS',
    detalle: 'SEIS de Las Palmas de Gran Canaria: herramientas manuales, eléctricas, de extinción y de excarcelación.' },
  { n: 10, parte: 'especifica', titulo: 'Rescate en accidentes de tráfico (APRAT)',
    detalle: 'Manual APRAT. Fase 1: atención a la víctima. Fase 2: planes de excarcelación. Fase 3: extracción.' },
  { n: 11, parte: 'especifica', titulo: 'PEMULPA',
    detalle: 'Plan de Emergencias Municipal de Las Palmas de Gran Canaria. Cap. 0: Preámbulo. Cap. 2: Ámbito geográfico, 2.1 Aspectos generales.' },
  { n: 12, parte: 'especifica', titulo: 'Rescate en ascensores',
    detalle: 'UNE-EN 81-20. Punto 1: objeto y ámbito. Punto 3: términos y definiciones.' },
  { n: 13, parte: 'especifica', titulo: 'Vehículos de bomberos del SEIS',
    detalle: 'SEIS de Las Palmas de Gran Canaria. Nomenclatura y especificaciones.' },
  { n: 14, parte: 'especifica', titulo: 'Ventilación',
    detalle: 'Guía táctica visual 2025. Ventilación parte 2: Técnicas.' },
  { n: 15, parte: 'especifica', titulo: 'Riesgo eléctrico',
    detalle: 'RD 842/2002 (REBT). Art. 1: objeto. Art. 2: ámbito de aplicación. Art. 4: clasificación de tensiones y frecuencias.' },
  { n: 16, parte: 'especifica', titulo: 'Soporte vital básico',
    detalle: 'Recomendaciones europeas. Guía ERC 2025.' },
  { n: 17, parte: 'especifica', titulo: 'Puerto de Las Palmas de Gran Canaria',
    detalle: 'Principales instalaciones y callejero.' },
  { n: 18, parte: 'especifica', titulo: 'Ciudad de Las Palmas de Gran Canaria',
    detalle: 'Historia, principales calles y edificios más importantes.' },
  { n: 19, parte: 'especifica', titulo: 'Actuación en espacios confinados',
    detalle: 'Tipos según NTP 223. Formas de desplazarse. Buceo en humo.' },
  { n: 20, parte: 'especifica', titulo: 'CTE DB-SI',
    detalle: 'Seguridad en caso de incendio. SI 5: Intervención de los bomberos.' }
];

/* Parametros oficiales del ejercicio (base 7a) */
var OPOSICION = {
  denominacion: 'Bombero/a Especialista',
  subgrupo: 'C1',
  plazas: 108,
  turno: 'Promoción interna',
  sistema: 'Concurso-oposición',
  boletin: 'BOP Las Palmas n.º 103, de 28/08/2026',
  preguntasExamen: 40,
  preguntasReserva: 5,
  opcionesPorPregunta: 3,
  minutosExamen: 60,
  puntosPorAcierto: 0.15,
  penalizacionFallo: 0,
  puntuacionMaximaOposicion: 6,
  puntuacionMinimaAprobar: 3,
  aciertosMinimos: 20,
  puntuacionMaximaConcurso: 4,
  totalMinimoProceso: 5,
  bateriaPublicada: 200
};

function temaPorNumero(n) {
  for (var i = 0; i < TEMARIO.length; i++) {
    if (TEMARIO[i].n === Number(n)) return TEMARIO[i];
  }
  return null;
}

function tituloTema(n) {
  if (!n || Number(n) === 0) return 'Sin clasificar';
  var t = temaPorNumero(n);
  return t ? ('T' + t.n + '. ' + t.titulo) : ('Tema ' + n);
}
