# Informe de calidad: ClipLab (27 de octubre de 2026)

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
