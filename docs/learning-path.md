# Guía de aprendizaje y verificación manual

Trabaja una función por vez. Lee su componente, encuentra el hook o la función
pura que utiliza, intenta predecir qué ocurrirá y compruébalo en el navegador.
No hace falta entender todos los archivos antes de empezar.

## 1. Video local y eventos del navegador

**Concepto:** una referencia de React, o **ref**, permite acceder a un objeto del
navegador sin guardarlo como estado de la pantalla. En este caso, da acceso al
elemento `<video>`. El video controla su reproducción y React escucha sus eventos
para mantener la interfaz actualizada. El **hook** `useVideoPlayer` reúne esa
lógica para que el componente visual sea más sencillo.

**Lee:** [useVideoPlayer.ts](../src/features/video/useVideoPlayer.ts) y
[VideoLoader.tsx](../src/features/video/VideoLoader.tsx).

Los botones Loop y Mute muestran otro uso de la referencia al video: `video.loop`
activa la repetición automática y `video.muted` silencia el audio. El hook refleja
esos valores en React para resaltar el botón activo. Silenciar no modifica el archivo
ni elimina su pista de audio; al desactivarlo, se escucha nuevamente. Loop tampoco
inicia la reproducción por sí solo: activa la repetición para cuando pulses Play.

**Comprueba:** abre un video corto compatible. Debe empezar pausado. Reprodúcelo,
páusalo, avanza cinco segundos y reinícialo. Reemplaza el archivo y después recarga
la página: la sesión debe quedar vacía. Prueba también un archivo dañado y recupera
la aplicación seleccionando uno válido.

**Investiga:** selecciona el elemento `<video>` en la pestaña Elements de DevTools.
En Console, evalúa `$0.currentTime`, `$0.duration`, `$0.paused` y `$0.readyState`.
`$0` representa el elemento que acabas de seleccionar. Coloca un **breakpoint**, o
punto de interrupción, dentro de la función `metadata` y vuelve a cargar un archivo
para observar cuándo aparece su duración. En Network, cargar el video no debe
crear una petición POST; su dirección de origen comienza por `blob:`.

**Ejercicio:** encuentra qué evento actualiza el tiempo mostrado en pantalla.
Explica con tus palabras por qué no hay un temporizador que incremente ese valor
por su cuenta.

## 2. Ajustes y estilos predefinidos

**Concepto:** un **control controlado** muestra un valor que proviene del estado
de React y solicita actualizarlo cuando el usuario interactúa. Una función pura
convierte los cinco efectos originales en una cadena de filtros CSS, que también
sirve de referencia para el shader. Exposición, temperatura y tinte utilizan
ganancias por canal en RGB lineal antes de esos efectos. La etiqueta del
preset se deduce de esos números en lugar de guardarse por separado.

**Exposición, temperatura y tinte:** Exposure mide pasos de luz (EV) de −2 a +2,
con incrementos de 0,1. Temperature mueve el equilibrio entre frío y cálido; Tint,
entre verde y magenta. Ambos usan escalas relativas de −100 a +100. Los tres parten
de cero y necesitan el preview WebGL; si la GPU se pierde, se omiten temporalmente
con un aviso y sus valores se recuperan al restaurarla. Puedes leer el recorrido
de sus cálculos en [la guía de WebGL](webgl-preview.md).

**Sombras y altas luces:** Shadows actúa principalmente sobre lo oscuro y
Highlights sobre lo claro. Los dos van de −100 a +100 y parten de cero. Una
**máscara** es un peso entre cero y uno que indica cuánto debe influir un ajuste
en cada píxel. Aquí ese peso cambia suavemente según su luminosidad; así evitamos
una frontera brusca. El cálculo vive en `shaders.ts` y sus números viajan mediante
uniforms desde `videoRenderer.ts`. También necesitan WebGL.

Para observarlo, pausa un fotograma con partes claras y oscuras y mueve un control
por vez. Usa Compare y Undo para distinguir el efecto de cambiar el estado de vista.
En DevTools puedes seguir el valor desde `Adjustments` hasta `uniform1f`, sin tener
que entender todas las fórmulas del shader a la vez.

**Tono y sepia:** Hue usa `hue-rotate()` para desplazar los colores por el círculo
cromático. Cero grados conserva el tono; los extremos −180° y 180° representan la
misma media vuelta en sentidos opuestos. Sepia usa `sepia()` para transformar
gradualmente la imagen hacia tonos cálidos de fotografía antigua. Cero conserva
los colores previos y 100 % aplica el efecto completo. Ambos se combinan con los
otros ajustes, y el preset Sepia utiliza un 75 % de intensidad.

Cada control recibe su mínimo, máximo y unidad: por eso la barra de Hue muestra
grados y empieza en el centro, mientras que Sepia muestra porcentajes y empieza
a la izquierda. Los valores nuevos forman parte del mismo historial de edición.

**Lee:** [filters.ts](../src/features/editing/filters.ts),
[presets.ts](../src/features/editing/presets.ts) y
[EffectsPanel.tsx](../src/features/editing/EffectsPanel.tsx).

**Comprueba:** aplica Cinematic. Brightness, Contrast y Saturation deben mostrar
105, 115 y 85, respectivamente. Mueve un control deslizante e inspecciona el canvas en Elements:
`data-renderer="webgl2"` confirma el preview gráfico. En ese modo el video fuente
tiene `filter: none`; los cinco filtros CSS solo se aplican al video en la vista
estándar de respaldo. Prueba ambos límites, aplica Black & White y pulsa
Reset. Todos los controles y la etiqueta del estilo actual deben coincidir.

**Investiga:** coloca un breakpoint en `buildFilter` y compara sus argumentos con
el valor CSS que muestra el navegador. Observa cómo `findPreset` calcula la etiqueta
sin mantener otra copia de ese dato.

**Ejercicio:** añade un preset. Incorpora un identificador nuevo a `PresetId` en
[types.ts](../src/features/editing/types.ts) y una entrada con etiqueta, descripción
y tres valores en `presets.ts`. Ejecuta `npm test`. El componente debe mostrarlo
sin añadir un caso especial a su renderizado.

## 3. Historial y límites de cada gesto

**Concepto:** un **reducer** recibe un estado y una acción, y devuelve el estado
siguiente sin modificar el DOM. Una **transacción** agrupa muchos cambios
provisionales en una única operación significativa para deshacer.

**Lee:** [historyReducer.ts](../src/features/editing/historyReducer.ts),
[useEditHistory.ts](../src/features/editing/useEditHistory.ts) y
[AdjustmentSlider.tsx](../src/features/editing/AdjustmentSlider.tsx).

**Comprueba:** arrastra Brightness desde 100 hasta aproximadamente 150. Un solo
Undo debe restaurar 100; el siguiente debe quedar deshabilitado si no hiciste otras
ediciones. Redo recupera el cambio. Deshaz otra vez, aplica Vintage y comprueba que
Redo deja de estar disponible. Reproducir o desplazarte por el video no debe crear
operaciones de Undo. Mantener una flecha sobre un control de ajuste y soltarla
también debe producir una sola operación. Escape cancela un gesto sin confirmar.

**Investiga:** pausa la ejecución dentro del reducer e inspecciona `past`,
`present`, `future` y `draft`. Durante un arrastre solo cambia `draft`, el borrador.
En React DevTools, comprueba que los avances de reproducción actualizan el área
del reproductor y no el panel de efectos.

**Ejercicio:** añade una prueba en `historyReducer.test.ts` que demuestre que un
borrador que vuelve a los valores iniciales no añade una entrada al confirmarse.
Puedes partir de las pruebas de cancelación y de cambios sin efecto.

## 4. Línea de tiempo y exploración por arrastre

La vista **Compare** muestra original y edición en el mismo fotograma. Su
separador se puede arrastrar o mover con las flechas; Home muestra toda la edición
y End todo el original. Moverlo no crea pasos de Undo: es estado de vista y los
ajustes de edición siguen siendo los mismos. La guía de WebGL explica cómo ambas
mitades se obtienen de una sola textura.

**Concepto:** la línea de tiempo representa la posición del video y envía órdenes
para cambiarla. Esta exploración se suele llamar **scrubbing**. El reproductor
pausa durante el gesto y después recupera el estado previo de reproducción.

**Lee:** [Timeline.tsx](../src/features/timeline/Timeline.tsx) y los métodos
`startScrub` y `endScrub` de `useVideoPlayer.ts`.

**Comprueba:** arrastra mientras el video se reproduce: debe pausar durante el
gesto y reanudar al soltar. Arrastra mientras está pausado: debe seguir pausado.
Usa Tab para llegar a la línea de tiempo y prueba Home, End y las flechas.
Escape cancela una exploración activa.

**Ejercicio:** explica por qué `seekTo` limita la posición al intervalo válido,
aunque el control de la línea de tiempo ya tenga los atributos `min` y `max`.
Pista: busca otros lugares desde los que se puede solicitar un desplazamiento.

## 5. Atajos, foco y preferencias

**Concepto:** el **foco** determina qué elemento recibe las pulsaciones del teclado.
Un manejador general necesita límites claros para respetar el comportamiento de
los controles nativos. Además, los datos leídos del almacenamiento requieren
validación durante la ejecución, aunque el proyecto esté escrito en TypeScript.

**Lee:** [useKeyboardShortcuts.ts](../src/features/shortcuts/useKeyboardShortcuts.ts),
[shortcutStorage.ts](../src/features/shortcuts/shortcutStorage.ts) y
[ShortcutSettings.tsx](../src/features/shortcuts/ShortcutSettings.tsx).

**Comprueba:** reasigna Play / pause a K, cierra las preferencias, da el foco al
área de trabajo y pulsa K. Recarga y vuelve a abrir las preferencias: K debe seguir
seleccionada, pero el video y sus ajustes deben haberse borrado. Intenta asignar
una tecla ya utilizada: debe conservarse la configuración anterior. Recorre el
diálogo con Tab y Shift+Tab, y ciérralo con Escape; el foco debe regresar al botón
que lo abrió. La barra espaciadora y las flechas sobre un control enfocado deben
conservar su comportamiento nativo.

**Investiga:** en Application → Local Storage, inspecciona
`cliplab.shortcuts.v1`. Sustituye su valor por JSON inválido y recarga para observar
la recuperación. Puedes usar un punto de interrupción de eventos de teclado para
inspeccionar `event.target`, `code`, `key` y `repeat`.

**Ejercicio:** añade una prueba para un atajo con una letra admitida. Como
alternativa, explica por qué declarar un tipo de TypeScript no vuelve confiable
un objeto JSON guardado previamente en el navegador.

## 6. Calidad y entrega

Ejecuta `npm run check` y después `npm run test:e2e`. Cuando falle una prueba E2E,
lee primero la aserción que falló, su captura y su traza antes de modificar el
código de la aplicación. Una **aserción** expresa lo que la prueba espera observar.
Distingue si el origen es un error del producto, una prueba incorrecta o el entorno
local. Espera condiciones observables en lugar de añadir pausas de duración fija.

Prueba un MP4/H.264 real en Chrome y Edge de escritorio y revisa la interfaz a
360 px de ancho. Axe y la emulación móvil de Chromium no reemplazan esas pruebas
de compatibilidad ni la comprobación en un dispositivo táctil real.

**Ejercicio:** utiliza una traza guardada por Playwright para identificar la acción
inmediatamente anterior a una aserción fallida. Escribe en una frase qué esperabas
que ocurriera y qué observaste realmente.
