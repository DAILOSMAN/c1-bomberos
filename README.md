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

### En Android: aplicación de verdad (APK)

En la carpeta `android` está el proyecto de la app nativa. Es un APK normal: se
instala, sale en el cajón de aplicaciones con su icono, se abre sin barra de
navegador y **no depende de Chrome, Brave ni de ningún navegador**. Todo el
contenido va dentro del propio APK, así que funciona sin cobertura desde el
primer segundo.

No hace falta Android Studio ni compilar nada en tu ordenador: el fichero
`.github/workflows/android.yml` hace que **GitHub compile el APK solo** cada vez
que subes un cambio, y lo deja para descargar en la pestaña *Releases* del
repositorio, con un enlace fijo:

```
https://github.com/USUARIO/c1-bomberos/releases/download/ultima/TestC1Bomberos.apk
```

Ese enlace es el que se reparte por WhatsApp. Cada compañero lo abre en el móvil,
Android le pedirá permiso la primera vez ("Instalar aplicaciones desconocidas") y
listo.

Detalles del proyecto Android:

- No pide **ni un solo permiso**. No accede a internet, ni a contactos, ni a nada.
- La app se sirve dentro del APK con `WebViewAssetLoader`, en un origen `https://`
  interno. Eso es lo que hace que el progreso se guarde de verdad: con `file://`
  Android trata cada arranque como un sitio distinto y tira el almacenamiento.
- El botón físico de atrás está conectado a la app: cierra el diálogo abierto, sale
  del test o vuelve al inicio, y solo cierra la app cuando ya no hay nada más.
- Al exportar una copia de seguridad, el fichero va a la carpeta **Descargas** del
  teléfono, sin pedir permisos.
- Sigue el modo claro/oscuro del sistema.
- Android 7 en adelante.
- Se firma con `android/app/claves/reparto.keystore`, la clave de depuración estándar
  (contraseña `android`, que es pública y no protege nada). Está ahí solo para que
  todas las compilaciones lleven la misma firma y las actualizaciones se instalen
  encima sin desinstalar. **No sirve para publicar en Google Play**: para eso hace
  falta una clave privada de verdad, guardada como secreto del repositorio.

### En Android: alternativa sin APK

Si prefieres no repartir un APK, sube esta carpeta a GitHub Pages y pásales la
dirección. Cada uno la abre en su navegador y usa *Añadir a pantalla de inicio*.
Queda parecido, pero depende del navegador de cada uno.

Lo que **no** conviene: mandar el fichero HTML suelto por WhatsApp para abrirlo en el
móvil. Funciona, pero Android lo copia a una ruta distinta cada vez y se pierde el
progreso. En Windows con doble clic sí va perfecto.

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
| `android/` | Proyecto de la app nativa (WebView sobre los assets del APK) |
| `.github/workflows/` | Compilación automática del APK en GitHub |

`python construir.py` genera `dist/C1_Bomberos.html` (todo en un fichero) y
`dist/artifact_body.html` (para publicar como página web).

`node pruebas.js` comprueba el importador y el cálculo de nota: que 20 aciertos den
exactamente 3,00, que los blancos no resten, que las de reserva no puntúen y que un
banco exportado y vuelto a importar conserve las respuestas correctas.

---

**No es una publicación oficial.** Ante cualquier duda mandan las bases del BOP.
