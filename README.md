# Test C1 Bomberos

App de estudio para la promoción interna a **Bombero/a Especialista, subgrupo C1** del
Ayuntamiento de Las Palmas de Gran Canaria (108 plazas, BOP n.º 103 de 28/08/2026).

Funciona en Windows 11 y en Android con el mismo código. No necesita instalación,
ni cuenta, ni conexión. Todo lo que respondes se guarda en tu propio dispositivo.

---

## Reglas del examen que lleva metidas

Salen de la base 7.ª de las bases específicas, no de una estimación:

| | |
|---|---|
| Preguntas | 40 + 5 de reserva |
| Opciones | 3, una correcta |
| Tiempo | 60 minutos |
| Acierto | 0,15 puntos |
| Fallo y blanco | Ni suman ni restan |
| Aprobado | 3 puntos sobre 6 = **20 aciertos** |
| Concurso | 4 puntos más (titulaciones, cursos, experiencia, antigüedad) |
| Superar el proceso | 3 en el test **y** 5 puntos en total |

El simulacro reproduce todo eso: reparte las preguntas entre temas, cronometra los
60 minutos con avisos a los 10, 5 y 1 minuto, y al terminar da la nota en la escala
oficial diciendo si es apto.

---

## Qué hace

- **Simulacro de examen** con las reglas de arriba, incluida la opción de añadir las
  5 preguntas de reserva (se presentan 45 y puntúan 40, como en el examen real).
- **Test a medida**: eliges temas, número de preguntas, tiempo y si quieres que
  corrija sobre la marcha.
- **Repaso de falladas**, ordenadas por las que peor llevas.
- **Repaso programado**: cada pregunta va en una de cinco cajas; al acertarla sube y
  tarda más en volver, al fallarla baja a la primera y vuelve enseguida.
- **Curva de progresión** en la escala 0-6, con la línea del 3 de corte y la media de
  los tres últimos simulacros.
- **Desglose por tema**, para ver dónde se pierden los puntos.
- **Calculadora de nota final**: aciertos previstos + méritos del concurso.
- **Ritmo**: segundos por pregunta comparados con los 90 que da el examen.
- Marcar preguntas como dudosas durante la prueba y revisarlas después.
- Importar preguntas, editarlas, y exportar el banco para pasárselo a un compañero.

---

## Cómo se reparte

### En Windows

Copia la carpeta entera y abre `dist\C1_Bomberos.html` con doble clic. Es un solo
fichero con todo dentro: se puede mandar por correo o WhatsApp tal cual.

Para tenerla como una app de verdad, con su icono: ábrela en Edge o Chrome y usa
*Configuración → Aplicaciones → Instalar este sitio como una aplicación*.

### En Android

El móvil necesita una dirección web, no un fichero suelto. Dos formas:

1. **La más rápida**: pasarles el enlace de la app publicada. Cada uno lo abre en
   Chrome y, desde el menú de los tres puntos, *Añadir a pantalla de inicio*. Queda
   con su icono y funciona sin cobertura.
2. **Con dominio propio**: sube esta carpeta a un GitHub Pages (gratis, 5 minutos) y
   reparte esa dirección. Así también se instala como app y además se actualiza sola
   cuando subas preguntas nuevas.

Si a alguien le llega el fichero suelto por WhatsApp y lo abre desde el explorador de
archivos, la app funciona, pero **el progreso puede no guardarse** entre sesiones.
Para el móvil, mejor el enlace.

---

## Cuando lleguen las preguntas

Ve a **Importar**, pega el texto tal como te lo den y pulsa *Analizar*. Entiende:

- El formato normal de test: enunciado numerado, opciones `a) b) c)` y la respuesta
  como `Respuesta: b`, con un asterisco delante de la buena (`*b)`), o en una lista
  final tipo `SOLUCIONES: 1-B 2-C 3-A`.
- Una línea `TEMA 6` cambia el tema de todo lo que viene detrás.
- CSV con cabecera (`enunciado, a, b, c, correcta, tema`).
- JSON.

Antes de añadir nada te enseña lo que ha entendido y cuántas preguntas ha sacado.
Las repetidas se descartan solas.

Marca como **oficiales** las 200 que publique el Ayuntamiento en el Portal de
Transparencia: luego puedes hacer test solo con ellas.

---

## Cómo está hecho

HTML, CSS y JavaScript sin librerías ni compilación. Cinco módulos:

| Fichero | Qué hace |
|---|---|
| `js/temario.js` | Los 20 temas del Anexo III y los parámetros oficiales |
| `js/store.js` | Guardado en IndexedDB, con reserva en almacenamiento local |
| `js/importer.js` | Lectura de preguntas en cualquier formato |
| `js/engine.js` | Selección de preguntas, sesión y corrección oficial |
| `js/stats.js` | Métricas y gráficas en canvas |
| `js/ui.js` | Interfaz |

`python construir.py` genera `dist/C1_Bomberos.html` (todo en un fichero) y
`dist/artifact_body.html` (para publicar como página web).

`node pruebas.js` comprueba el importador y el cálculo de nota: que 20 aciertos den
exactamente 3,00, que los blancos no resten, que las de reserva no puntúen y que un
banco exportado y vuelto a importar conserve las respuestas correctas.

---

**No es una publicación oficial.** Ante cualquier duda mandan las bases del BOP.
