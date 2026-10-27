# ClipLab

**Tu video, una nueva perspectiva.** Un espacio de edición de video que funciona
en el navegador, construido con React, TypeScript, Vite y Tailwind CSS.

[Abrir ClipLab](https://cliplab-playground.netlify.app) ·
[Código en GitHub](https://github.com/arielBiagio/cliplab)

![Editor de ClipLab con una muestra original de prueba](docs/images/workspace.png)

Puedes abrir un video de tu computadora, experimentar con brillo, contraste,
saturación, tono y sepia, probar estilos predefinidos y deshacer tus cambios. ClipLab
modifica la vista previa; no genera ni exporta un archivo de video nuevo.

## Ejecutar el proyecto en tu computadora

Necesitas Node.js 24 y npm. El archivo `package-lock.json` fija las versiones de
las dependencias para que las instalaciones sean reproducibles.

```sh
npm ci
npm run dev
```

Abre la dirección local que muestra Vite en la terminal. No necesitas variables
de entorno, claves de API ni servicios de backend.

## Qué puedes hacer

- Abrir o reemplazar un video local con el selector o arrastrándolo sobre el preview.
  Al cargarlo, la reproducción comienza pausada.
- Reproducir, pausar, reiniciar y desplazarte por la línea de tiempo con el mouse,
  la pantalla táctil o el teclado.
- Activar la repetición automática con Loop y silenciar o recuperar el audio con
  el botón del altavoz. Ambos botones resaltan cuando están activados y vuelven
  a su estado inicial al reemplazar el video.
- Recorrer visualmente el video al arrastrar por la línea de tiempo. El preview
  cambia durante el gesto y termina en la posición elegida; si estaba reproduciendo,
  reanuda después de completar ese desplazamiento.
- Ajustar brillo, contraste y saturación entre 0 y 200 %. El valor neutro es 100 %.
- Desplazar los colores con Hue entre −180° y 180° y añadir un efecto cálido con
  Sepia entre 0 y 100 %. Ambos parten de cero y se pueden deshacer o restablecer.
- Aplicar Original, Cinematic, Vintage, Black & White o Sepia. Si modificas los valores
  manualmente, la etiqueta pasa a Custom, salvo que coincidan con otro preset.
  El preset Sepia aplica un 75 % de sepia además de sus ajustes de brillo,
  contraste y saturación. Los demás presets restablecen Hue y Sepia a cero.
- Restablecer los ajustes, deshacer y rehacer. Un arrastre completo de un control
  deslizante cuenta como una sola operación del historial.
- Personalizar tres atajos de reproducción y recuperar los predeterminados desde
  el botón con el icono de teclado.

La interfaz conserva sus etiquetas en inglés para el portfolio. Aquí encontrarás
las explicaciones y los materiales de aprendizaje en español.

El preview resalta al arrastrar archivos sobre él. Se acepta un video por vez;
soltar varios archivos o uno de otro tipo muestra un aviso y conserva la sesión
actual. El navegador sigue comprobando si puede decodificar el video seleccionado.

En escritorio, el editor se ajusta al alto de la ventana para que el video, sus
controles y la línea de tiempo permanezcan visibles. El panel de efectos tiene
su propio scroll y se puede recorrer con teclado. En móvil, el video y la timeline
quedan arriba y los efectos se desplazan dentro del panel inferior. Las ventanas
muy bajas o con mucho zoom conservan el scroll de la página para mantener el acceso
a los controles.

| Acción                              | Atajo predeterminado             |
| ----------------------------------- | -------------------------------- |
| Reproducir o pausar                 | Barra espaciadora                |
| Retroceder o avanzar cinco segundos | Flechas izquierda y derecha      |
| Deshacer                            | Ctrl / Cmd + Z                   |
| Rehacer                             | Ctrl / Cmd + Shift + Z; Ctrl + Y |

Los atajos de reproducción pueden usar la barra espaciadora, las flechas izquierda
y derecha o las posiciones físicas de las letras A–Z. No se admiten asignaciones
duplicadas ni combinaciones con teclas modificadoras como Ctrl.

Los atajos generales funcionan cuando el área de trabajo tiene el foco: es decir,
cuando recibe las pulsaciones del teclado. No interfieren con campos o botones y
se suspenden mientras está abierto el diálogo de preferencias. Puedes hacer clic
en el fondo del área de trabajo para devolverle el foco. Los controles deslizantes
conservan su comportamiento nativo con flechas, Home y End.

## Privacidad y duración de la sesión

Los videos se leen mediante direcciones temporales `blob:`. La aplicación no envía
su contenido ni su nombre a un servidor, ni los guarda en el almacenamiento del
navegador. Reemplazar un video libera su dirección temporal y reinicia la edición.

Solo las preferencias de teclado se guardan en `localStorage`, con la clave
`cliplab.shortcuts.v1`. Al recargar la página se borran el video seleccionado, los
ajustes, el historial y la posición de reproducción. Si el almacenamiento falla,
los atajos siguen funcionando en memoria durante esa sesión y aparece un aviso.
No se cargan herramientas de analítica ni fuentes externas.

## Verificar la calidad

```sh
npm run check
npx playwright install chromium
npm run test:e2e
npm run format:check
```

`check` ejecuta la comprobación de tipos de TypeScript, ESLint, Vitest y el build
de producción. Un **build** es la versión de archivos preparada para publicar.
Las pruebas **E2E** recorren la aplicación completa en un navegador y sirven el
directorio `dist` en el puerto 4276. Después de modificar el código, vuelve a
ejecutar `npm run build` antes de lanzar las pruebas E2E.

Para inspeccionar por tu cuenta la versión de producción:

```sh
npm run preview -- --port 4276
```

Las pruebas cubren transformaciones, límites, restablecimiento, historial por
gestos, foco, conflictos de atajos, persistencia, errores de reproducción, limpieza
de recursos y flujos con video real en escritorio y una vista móvil de 360 px.
La entrega del 27 de octubre de 2026 pasó 60 pruebas unitarias/de componentes y
48 E2E, incluidas repetición, silencio, tono, sepia y fotogramas durante el arrastre.
Cuando una prueba falla, Playwright conserva capturas y trazas en `test-results/`.
Una **traza** permite revisar las acciones y el estado del navegador durante la
prueba. Abre el informe HTML con:

```sh
npx playwright show-report
```

El pequeño video de prueba VP9, sin sonido, es material original con licencia CC0.
No se incluye en la aplicación publicada. Consulta [su licencia](e2e/fixtures/LICENSE.md).
Puedes regenerarlo con `node scripts/create-fixture.mjs` si tienes instalados
Chromium y ffmpeg. Configura `FFMPEG_PATH` si ffmpeg no está en el PATH del sistema.

## Arquitectura y aprendizaje

Orden de lectura recomendado:

1. [Guía de aprendizaje, verificación y ejercicios](docs/learning-path.md): recorre
   cada función con pasos para probarla e investigarla.
2. [Arquitectura y responsabilidades del estado](docs/architecture.md): explica
   cómo se conectan los componentes y por qué separamos sus datos.
3. [Informe de calidad y limitaciones](qa-report.md): muestra qué se comprobó,
   qué se corrigió y qué queda fuera de las verificaciones.

No usamos una biblioteca adicional para gestionar el estado. Un reducer controla
el historial de edición, los hooks se comunican con las APIs del navegador y los
componentes intercambian datos mediante props. Los eventos de reproducción se
gestionan dentro del reproductor para evitar actualizar también el panel de efectos.

## Estructura del código

```text
src/app/                 Pantalla principal y conexión entre funciones
src/features/video/      Archivo local, reproducción, audio y repetición
src/features/editing/    Ajustes, presets e historial de edición
src/features/timeline/   Exploración del video por tiempo
src/features/shortcuts/  Atajos y preferencias persistentes
src/shared/              Iconos y utilidades compartidas
src/styles/              Estilos y distribución responsive
e2e/                     Flujos de navegador y video de prueba
docs/                    Arquitectura y materiales de aprendizaje en español
```

## Publicar en Netlify

La configuración está en `netlify.toml`: Node 24, comando `npm run build` y
directorio publicado `dist`. La aplicación utiliza una sola dirección y no necesita
reglas especiales de navegación. Las cabeceras de seguridad permiten reproducir
videos locales Blob y restringen conexiones externas, la inclusión en marcos de
otras páginas y el uso de APIs privilegiadas del dispositivo.

Para publicar manualmente, utiliza la CLI de Netlify e inicia sesión:

```sh
npx netlify-cli login
npx netlify-cli deploy --dir=dist --no-build
# Comprueba la dirección de la preview antes de publicar en producción:
npx netlify-cli deploy --dir=dist --no-build --prod
```

La asociación local con el sitio está en `.netlify/state.json`. Git ignora esa
carpeta y no debes incluirla en un commit. Una copia nueva del repositorio debe
vincularse con su proyecto de Netlify antes de publicar. Los controles de calidad
se ejecutan localmente antes de entregar; todavía no hay un flujo de integración
continua, o **CI**, que los ejecute automáticamente en GitHub.

## Compatibilidad y límites

Chrome y Edge de escritorio son los navegadores objetivo. En pantallas pequeñas,
la interfaz apila sus paneles. El contenedor del archivo no garantiza que el
navegador soporte su códec, que es el formato de codificación de su contenido.
MP4/H.264 y WebM son opciones iniciales útiles, pero la reproducción depende del
archivo concreto y del navegador. Los archivos incompatibles o dañados muestran
un error y permiten seleccionar otro. Solo una duración finita y positiva habilita
los controles.

Los filtros CSS afectan la vista previa y su resultado puede variar según la
decodificación, la gestión del color y el hardware. Los desplazamientos se realizan
por tiempo, sin precisión de fotograma. Los videos muy grandes o de alta resolución
pueden ser costosos de reproducir. El MVP no incluye recorte, composición multipista,
almacenamiento en la nube, autenticación, procesamiento de salida ni exportación.
