# Informe de calidad: ClipLab (27 de octubre de 2026)

## Entrega: WebGL2, comparación y controles tonales

**Veredicto:** listo. Validación local y de preview aprobada. No quedan fallos confirmados dentro del alcance probado.
**Tipo:** SPA React/TypeScript sin backend. **Entorno:** build de producción local,
Chromium de Playwright (escritorio y emulación móvil), Chrome y Edge instalados.
Las secciones inferiores documentan etapas históricas previas a esta entrega.

### Resultado de las comprobaciones

- Typecheck, ESLint, formato y build aprobados.
- **96 pruebas unitarias/de componentes en 10 archivos** y **86 E2E** aprobadas
  (43 de escritorio y 43 en emulación móvil), sin reintentos en la ejecución final.
- Shadows y Highlights: límites −100…100, valores inválidos, neutralidad de presets,
  Reset, un paso de Undo por gesto y Redo. Las pruebas de píxeles verifican ambos
  extremos contra una referencia en CPU y comprueban mayor influencia sobre las
  zonas oscuras o claras correspondientes. Tolerancia: 4 niveles por canal de 8 bits.
- Pérdida y restauración real del contexto WebGL con los cinco controles de grading
  activos; modo CSS conserva valores y permite los cinco efectos originales.
  Cambiar el video libera recursos y restaura los diez parámetros neutros.
- Regresión de comparación, arrastre táctil emulado, scrubbing con fotogramas,
  reproducción, loop, mute, atajos, privacidad y accesibilidad Axe aprobada.
- Chrome 156.0.8078.48 y Edge 156.0.4314.50: WebM horizontal y MP4/H.264 vertical
  generado localmente. Cambios visibles en Shadows/Highlights, Undo/Redo, comparación
  y reproducción aprobados en ambos navegadores.
- Distribución comprobada de 360 × 800 a 1920 × 1080. Capturas revisadas en
  `qa-artifacts/laptop-loaded.png` y `qa-artifacts/mobile-664.png`; preview y timeline
  permanecen visibles y los efectos se desplazan independientemente.
- `npm audit --omit=dev`: cero vulnerabilidades detectadas. Barrido de patrones de
  credenciales en archivos publicables: sin coincidencias. No se añadieron dependencias.
- Build: JavaScript 266.80 KB, 83.34 KB con gzip; CSS 36.99 KB, 8.97 KB con gzip.

### Preview verificada

- Deploy `6ae121f85b2f385825d981c4`: estado `ready`.
- URL: https://6ae121f85b2f385825d981c4--cliplab-playground.netlify.app
- Smoke remoto aprobado: HTTP 200, cabeceras de seguridad, carga por drop,
  reproducción real, loop y mute, ajustes originales y los cinco de grading,
  Undo/Redo, Compare y persistencia de atajos.
- Axe sin infracciones en los estados vacío y cargado con comparación activa.
  Sin errores JavaScript, peticiones de subida ni desbordamiento móvil a 360 × 800.

### Publicación

- Se publicó el mismo directorio `dist` que pasó la regresión local y la preview,
  sin reconstruirlo ni modificar sus archivos entre ambas publicaciones.
- Producción: `6ae1223675a98b19e89de274`, estado `ready`, sin error;
  publicación confirmada por Netlify el 27 de octubre de 2026 a las 22:14:16 UTC.
- Sitio: https://cliplab-playground.netlify.app
- El código, README y documentación de esta entrega se incluyen juntos en GitHub.

### Corregido durante esta entrega

**[S3] Desbordamiento móvil por las descripciones accesibles de los ajustes.**
Al abrir el editor vacío a 390 × 664, el documento medía 724 px aunque el contenido
visible del panel cabía en la ventana. Las descripciones con posición absoluta
quedaban referidas a un ancestro fuera del área desplazable. Añadir
`position: relative` a `.effects-content` las contiene en su panel. La prueba
existente de distribución reprodujo el fallo y ahora pasa tanto vacía como con video.
La animación original del pie de página se conserva.

Una ampliación inicial de la prueba de recuperación gráfica esperaba controles
tonales no configurados en su preparación. Se corrigió la preparación, manteniendo
la tolerancia de píxeles. No era un fallo de la aplicación.

### Alcance y límites

Pruebas funcionales limitadas a local y preview; la publicación usa el mismo artefacto
y se comprueba mediante el estado del deploy. No se evalúan HDR, calibración
profesional, reproducción sostenida en 4K ni dispositivos táctiles físicos. Los
controles tonales modifican luz existente y no recuperan detalle ausente del archivo.
Las fixtures son propias/sintéticas y no se cargan archivos personales.

### Pruebas y documentación

Las pruebas de grading están en `colorGrading.test.ts`, `EffectsPanel.test.tsx` y
`e2e/rendering.spec.ts`; las de comparación en `comparison.test.ts`,
`useVideoRenderer.test.tsx` y `e2e/comparison.spec.ts`. Se ejecutan con `npm test`
y `npm run test:e2e` sobre un build previo; `CLIPLAB_E2E_PORT=4277` aísla el servidor
de pruebas del editor local. README en inglés centrado en el producto; explicaciones
en español en `docs/webgl-preview.md`, `docs/architecture.md` y `docs/learning-path.md`.

## Actualización local: comparación antes y después

**Veredicto:** lista para revisión local. Esta etapa no se publicó ni se subió a
GitHub. El usuario ya había revisado los controles de grading de la etapa anterior.

- **91 pruebas unitarias/de componentes aprobadas en 10 archivos.** Se añadieron
  casos de geometría horizontal y vertical, bandas negras, redimensionamiento,
  valores inválidos del separador y actualización del renderer sin recrear recursos.
- **82 E2E aprobadas**, 41 de escritorio y 41 en emulación móvil. La comparación
  tiene seis escenarios por proyecto de navegador. Se amplió después un escenario
  de edición activa y Redo, y sus dos ejecuciones también pasaron.
- Se compararon píxeles de cada mitad con la imagen original y una referencia
  editada del navegador, con tolerancia máxima de 4 niveles por canal. Incluye
  imagen dividida, original completo, edición completa, reproducción y scrubbing.
- El arrastre se probó con mouse y con eventos táctiles reales del protocolo de
  Chromium en emulación móvil; no se usó un dispositivo móvil físico. Escape,
  flechas, Home y End conservan su comportamiento esperado.
- Se comprobó que mover o alternar la comparación no añade entradas de Undo,
  conserva la rama de Redo y mantiene intacta la mitad original al editar.
- Pasaron la alineación tras redimensionar, Axe con la comparación activa, la
  recuperación del contexto gráfico y el reemplazo mediante drop sobre el control.
- Chrome 156.0.8078.48 y Edge 156.0.4314.50: comparación comprobada con WebM
  horizontal y MP4/H.264 vertical de 180 × 320 generado localmente.
- TypeScript, ESLint, formato y build aprobados. El JavaScript del build pesa
  83.01 KB con gzip; no se añadieron dependencias.

Las pruebas están en `comparison.test.ts`, `useVideoRenderer.test.tsx` y
`e2e/comparison.spec.ts`. Las capturas locales actualizadas son
`qa-artifacts/laptop-loaded.png`, `qa-artifacts/mobile-800.png` y
`qa-artifacts/comparison-portrait-chrome.png`. No se confirmaron bugs funcionales
pendientes dentro del alcance revisado. Se mantienen los límites anteriores sobre
HDR, video 4K sostenido y diferencias entre equipos.

## Actualización local: exposición, temperatura y tinte

**Veredicto:** lista para revisión local, sin publicación ni push de esta etapa.
La etapa anterior tenía 65 pruebas unitarias y 62 E2E aprobadas y fue revisada
manualmente por el usuario antes de continuar.

- TypeScript, ESLint y build: aprobados.
- **79 pruebas unitarias/de componentes aprobadas en 9 archivos.** Incluyen
  ganancias por canal, límites independientes, valores no finitos, redondeo por
  décimas, gestos de exposición, presets, Reset y Undo/Redo de los ocho parámetros.
- **70 E2E aprobadas** sobre el build de producción: 35 de escritorio y 35 en
  emulación móvil. Se comprobaron ambos extremos de los tres controles contra una
  referencia de conversión sRGB/RGB lineal y ganancias esperadas independientes.
  La diferencia máxima permitida sigue siendo de 4 niveles por canal RGB de 8 bits.
- Los presets existentes dejan los tres parámetros nuevos en cero y conservan su
  apariencia. Los cambios pausados actualizan el canvas y la etiqueta Custom.
- Se probó la pérdida real del contexto gráfico con grading activo: los tres
  controles se deshabilitan, el aviso indica que se omiten temporalmente y la
  restauración aplica los valores conservados junto a los efectos anteriores.
- Reemplazar el archivo reinicia el grading; las regresiones de reproducción,
  atajos, accesibilidad, privacidad y distribución responsive siguen aprobadas.
- Chrome 156.0.8078.48 y Edge 156.0.4314.50: controles nuevos y cambio visible del
  canvas comprobados con WebM y MP4/H.264. Las capturas de escritorio y móvil
  conservan preview y timeline visibles; el documento mide lo mismo que la ventana.
- Formato y diferencias de whitespace: aprobados. El JavaScript del build pesa
  81.91 KB con gzip; no se añadieron dependencias.

Los tests nuevos están en `colorGrading.test.ts`, `EffectsPanel.test.tsx` y
`e2e/rendering.spec.ts`. No se confirmaron bugs funcionales pendientes dentro de
este alcance. La exposición se procesa en luz lineal; temperatura y tinte son
controles creativos relativos. No se evaluó calibración profesional, material
HDR ni reproducción prolongada en 4K.

El README permanece en inglés y centrado en uso y funciones. Las explicaciones
de los cálculos y sus decisiones están en español en `docs/webgl-preview.md`.

## Actualización local: primera etapa WebGL2

**Veredicto de esta etapa:** lista para revisión local. No se publicó en Netlify
ni se subió a GitHub. El resto de este informe conserva la evidencia de la entrega
anterior, que utiliza el preview con CSS.

- TypeScript estricto, ESLint, build y formato: aprobados.
- Vitest / Testing Library: **65 pruebas aprobadas en 8 archivos**, incluidas cinco
  pruebas nuevas del ciclo de vida del renderer.
- Playwright contra el build de producción: **62 pruebas aprobadas**, 31 de
  escritorio y 31 con emulación móvil. El puerto aislado 4277 evita interferir con
  el editor local en 4276.
- Las pruebas de píxeles comparan cada preset con la salida de filtros CSS del
  navegador y comprueban orientación y ajustes extremos. La tolerancia máxima es
  de 4 niveles por canal RGB de 8 bits; los presets exigen además una diferencia
  media inferior a 1.5. No se relajaron esos umbrales después de ejecutar la prueba.
- Se verificaron cambios del canvas durante reproducción y scrubbing, edición
  con pausa, Undo/Redo, modo CSS sin WebGL2 y recuperación real mediante la
  extensión de prueba `WEBGL_lose_context`. Al reemplazar el archivo, el programa
  anterior deja de ser un recurso válido de WebGL.
- Las regresiones de accesibilidad, timeline, privacidad, controles y tamaños de
  pantalla de la suite anterior permanecen aprobadas.
- Chrome 156.0.8078.48 y Edge 156.0.4314.50: preview WebGL2 confirmado con WebM y
  MP4/H.264 generado localmente; carga, reproducción, pausa, preset y Undo aprobados.
- El build añade aproximadamente 2.3 KB de JavaScript comprimido con gzip respecto
  a la entrega anterior (81.10 KB frente a 78.84 KB), sin dependencias nuevas.

**S2 corregido durante el desarrollo:** en la ruta inicial sin
`requestVideoFrameCallback`, el tiempo avanzaba pero el canvas permanecía
congelado. Se reprodujo con una prueba de reproducción que comparaba capturas del
canvas. Esta etapa usa el preview estándar si falta esa API; se verifica que la
reproducción y los ajustes siguen disponibles y que cambiar el archivo reinicia
la sesión. El alcance objetivo conserva Chrome y Edge de escritorio actuales.

Las pruebas nuevas están en `src/features/rendering/useVideoRenderer.test.tsx` y
`e2e/rendering.spec.ts`. Se actualizaron dos expectativas E2E: el filtro CSS del
video fuente ahora es `none` cuando el canvas aplica los efectos. El resultado
visual se verifica mediante píxeles y no solo por una cadena de estilos.

**Límites de esta revisión:** no se midió reproducción prolongada en 4K, HDR,
memoria de GPU en todos los equipos ni rendimiento en móviles físicos. El buffer
del preview se limita a 1080p conservando la proporción, pero el video sigue
decodificándose a su resolución original. Esta etapa no añade controles de color
nuevos, exportación ni procesamiento de audio. La guía de implementación está en
`docs/webgl-preview.md`.

## Entrega publicada anterior

**Veredicto:** listo y publicado. Pasaron las comprobaciones locales y la
validación de la preview de Netlify. No se confirmaron problemas funcionales
bloqueantes dentro del alcance revisado.

**Tipo:** aplicación React de una sola pantalla con estado local, sin backend.
El detector heurístico la clasificó como sitio estático; la revisión del código
confirmó el perfil de aplicación web por su reproducción, preferencias e historial.

**Entorno:** Windows, Node 24.14.1, npm 11.11.0, build de producción de Vite,
Chromium de escritorio y emulación móvil de 360 × 800. Se comprobaron además
Chrome 156.0.8078.48 y Edge 156.0.4314.50 instalados.

## Resumen de resultados

| Comprobación                                         | Resultado                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| TypeScript estricto                                  | Aprobada                                                                  |
| ESLint sin advertencias                              | Aprobada                                                                  |
| Build de producción                                  | Aprobado                                                                  |
| Vitest y Testing Library                             | 60 pruebas aprobadas en 7 archivos                                        |
| Playwright sobre el build de producción              | 48 pruebas aprobadas: 24 de escritorio y 24 en emulación móvil            |
| Prettier                                             | Aprobado                                                                  |
| Axe, reglas WCAG 2 A/AA y 2.1 AA                     | Sin infracciones en los estados vacío, edición y preferencias comprobados |
| Auditoría npm de dependencias de producción          | 0 vulnerabilidades informadas                                             |
| Patrones comunes de secretos en archivos publicables | Sin coincidencias                                                         |
| WebM y MP4/H.264 en Chrome y Edge                    | Carga, reproducción, pausa, preset y Undo aprobados                       |
| Preview de Netlify                                   | HTTP 200; controles, accesibilidad y cabeceras aprobados                  |
| Red durante la carga y edición del video             | Sin solicitudes de subida del archivo                                     |

El JavaScript de producción pesa aproximadamente 253 KB, o 78.84 KB con gzip;
el CSS, 34.97 KB, o 8.56 KB con gzip. Son tamaños de build, no una medición de
rendimiento en dispositivos de gama baja.

## Línea base y correcciones

Antes de actualizar las pruebas, TypeScript, ESLint y build pasaban. Vitest tenía
53 de 54 pruebas aprobadas y Playwright, 32 de 36. Los fallos correspondían a
expectativas desactualizadas respecto a los cambios ya revisados por el usuario:

- La prueba de scrubbing esperaba reanudación inmediata. Ahora espera a que termine
  el seek final antes de comprobar que se reproduce nuevamente.
- Dos casos E2E por navegador buscaban el título eliminado o la cadena antigua
  de tres filtros. Se actualizaron al encabezado accesible y los cinco filtros.
- Prettier detectó tres archivos con formato pendiente; se normalizaron.
- En una prueba nueva del footer se corrigió su nombre accesible y se verificó
  la llegada real con Tab desde el panel de efectos.

No fue necesario cambiar el comportamiento de la aplicación durante este QA.
No quedan bugs confirmados pendientes de esta revisión. Una suite aprobada cubre
los escenarios descritos; no demuestra ausencia de errores en cualquier archivo,
navegador o equipo.

## Qué se probó

- Carga local mediante selector y drag and drop; rechazo de archivos incorrectos
  o múltiples sin perder la edición; recuperación de un archivo dañado.
- Play, pausa, restart, límites de seek y liberación de URL al reemplazar el archivo.
- Scrubbing hacia adelante y atrás con fotogramas presentados durante el arrastre.
  Se observó `requestVideoFrameCallback`, además de la posición del elemento,
  para comprobar que no cambia únicamente el indicador.
- Serialización de seeks: conservar el último destino, esperar al seek pendiente
  y reanudar solo al finalizar. Escape restaura la posición inicial.
- Loop: el video cruza su final y vuelve al principio sin crear historial.
- Mute: estado nativo, botón activado, desactivación del silencio y conservación del
  volumen. Cambiar de archivo reinicia Loop y Mute.
- Límites, valores neutros y entradas no finitas de Hue y Sepia; presets, filtros,
  etiqueta Custom, Reset y Undo/Redo de los cinco ajustes.
- Agrupación de gestos, historial limitado y separación de edición y reproducción.
- Conflictos y persistencia de atajos, foco del diálogo y respeto a controles nativos.
- Preview y timeline visibles sin scroll de página en 1366 × 768, 1280 × 720,
  1024 × 600, 1920 × 1080, 360 × 800 y 390 × 664, con y sin video.
- Scroll independiente de efectos; footer por puntero y teclado sin mover la timeline.
- Seguridad básica: archivos ignorados, patrones comunes de secretos y políticas
  de contenido en Netlify. No es una auditoría exhaustiva de seguridad.

## Evidencia y cómo repetir las comprobaciones

Las pruebas permanentes están junto a cada módulo y en `e2e/`.
Se añadieron seis casos unitarios y doce ejecuciones E2E para los cambios recientes.

```sh
npm ci
npm run check
npm run format:check
npx playwright install chromium
npm run test:e2e
```

Los E2E utilizan `dist`; `npm run check` lo genera. El puerto 4276 debe estar
libre para que Playwright inicie su servidor de preview de producción. Si tienes
Vite en ese puerto, detén ese servidor antes de ejecutar la suite.

Capturas locales: `qa-artifacts/laptop-loaded.png`, `qa-artifacts/mobile-800.png`,
`qa-artifacts/mobile-664.png` y `qa-artifacts/drop-overlay.png`. Los informes,
capturas y trazas de ejecución se ignoran en Git. La captura ilustrativa del
README está en `docs/images/workspace.png` y usa la fixture original CC0.

La preview validada es
[6ae0f1683851dfadaa736dcd](https://6ae0f1683851dfadaa736dcd--cliplab-playground.netlify.app).
Su comprobación remota terminó sin errores de JavaScript, infracciones de Axe
ni solicitudes de subida, e incluyó controles nuevos, presets, Undo, atajos,
persistencia, cabeceras y tamaño móvil.

Se publicó el mismo build en [ClipLab](https://cliplab-playground.netlify.app),
deploy `6ae0f1db6966bf8eeb8fe5bb`. Netlify confirmó estado `ready` y publicación
el 27 de octubre de 2026 a las 18:47:57 UTC. El código está en el repositorio
público [arielBiagio/cliplab](https://github.com/arielBiagio/cliplab).

## Qué no se probó

- Dispositivos móviles físicos, Safari y Firefox: los objetivos son Chrome y Edge;
  la prueba móvil es una emulación.
- Escucha manual del audio mediante altavoces. La fixture automatizada es muda;
  se comprueban las propiedades multimedia de silencio y volumen.
- Reproducción sostenida de videos 4K, archivos enormes, todos los códecs ni
  precisión de color entre distintos equipos.
- Exportación, backend, autenticación, bases de datos y APIs: no existen en el MVP.
- QA funcional en producción: las interacciones remotas se ejecutaron en la preview.
- Integración continua en GitHub: las comprobaciones de esta entrega son locales;
  no se añadió un workflow sin que el usuario lo solicitara.

## Próximos pasos opcionales

Incorporar GitHub Actions para ejecutar tipos, lint, pruebas y build en cada push.
Revisar rendimiento con material de mayor resolución antes de ampliar el motor
de color o prometer reproducción fluida en equipos de menos recursos.
