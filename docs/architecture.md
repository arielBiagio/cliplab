# Arquitectura de ClipLab

## Límites de la aplicación

ClipLab es una aplicación React de una sola pantalla. Vite prepara los archivos
estáticos para publicar y el plugin de Tailwind para Vite integra los estilos.
Las únicas dependencias necesarias durante la ejecución son React y React DOM.
La interfaz utiliza elementos nativos del navegador: video, controles deslizantes,
selectores y un diálogo modal. Los iconos son pequeños SVG y las ilustraciones
están construidas con CSS.

El MVP no necesita backend, enrutador, cliente de red, guardado de proyectos ni
biblioteca de estado global. Las preferencias de teclado son los únicos datos de
la aplicación que sobreviven a una recarga.

## Quién controla cada dato

En React, el **estado** es la información que puede cambiar y afectar lo que
muestra la pantalla. Separar sus responsabilidades evita que una acción modifique
datos que no le corresponden. Por ejemplo, deshacer un cambio de brillo no debe
retroceder el video.

```text
EditorWorkspace
  ├─ archivo e identificador de sesión
  ├─ historial de edición confirmado y ajuste provisional
  ├─ preferencias de atajos y visibilidad del diálogo
  ├─ VideoPlayer (se vuelve a montar por cada archivo seleccionado)
  │    ├─ VideoDropZone → eventos de arrastre y validación del archivo
  │    ├─ useVideoPlayer → HTMLVideoElement y estado de reproducción
  │    ├─ useVideoRenderer → canvas, fotogramas y recuperación del preview
  │    │    └─ videoRenderer + shaders → texturas y cálculos de color en WebGL2
  │    ├─ ComparisonOverlay → geometría y control del separador antes/después
  │    ├─ useKeyboardShortcuts → comandos de reproducción y acciones del historial
  │    ├─ PlaybackControls
  │    └─ Timeline
  ├─ EffectsPanel → acciones de edición
  │    ├─ AdjustmentSlider
  │    └─ PresetPicker
  └─ ShortcutSettings → cambios de preferencias validados
```

El área de trabajo recibe del reproductor solo los cambios que indican si está
listo. No recibe cada avance del tiempo. Los eventos `timeupdate`, `play`, `pause`,
`ended`, `seeked` y `volumechange` actualizan el estado dentro del reproductor. El elemento de
video es la fuente de verdad; no mantenemos un temporizador paralelo.

Los comandos `toggleLoop` y `toggleMute` modifican las propiedades nativas `loop`
y `muted` del elemento y reflejan su valor en React. `loop` hace que el navegador
repita el video al terminar; `muted` silencia el audio sin cambiar el volumen.
Los botones usan `aria-pressed` para comunicar si están activados, tanto visualmente
como a los lectores de pantalla. Son opciones de reproducción: no generan entradas
de Undo y vuelven a `false` cuando se monta el reproductor para un archivo nuevo.

Los componentes reciben datos y funciones mediante **props**. Como el árbol tiene
pocos niveles, esto permite seguir el recorrido de la información fácilmente.
Podríamos incorporar Context si varias capas comenzaran a transmitir repetidamente
los mismos datos. Añadirlo ahora escondería parte del flujo sin resolver un
problema actual. Una biblioteca externa de estado también añadiría conceptos sin
un beneficio equivalente para este tamaño de aplicación.

## Comparación como estado de vista

`VideoPlayer` mantiene `ComparisonView`: activación y porcentaje del separador.
Estos datos se envían al renderer aparte de `Adjustments`. No se guardan en el
historial ni en localStorage; se reinician al abrir otro video. Mover el separador
redibuja el fotograma actual, incluso con la reproducción pausada.

El fragment shader usa una sola textura: a la izquierda del límite devuelve el
color original y a la derecha ejecuta el procesamiento de edición. Ambas mitades
comparten el mismo fotograma y no necesitan sincronizar dos elementos de video.

`ComparisonOverlay` observa el tamaño disponible y las dimensiones del video para
alinear su control con la imagen ajustada mediante `contain`. Las bandas negras
quedan fuera de esa geometría. El control `range` conserva el acceso por teclado;
los eventos de puntero cubren mouse y tacto y Escape restaura el valor anterior a
un arrastre. La geometría tiene pruebas propias para fuentes horizontales y verticales.

Si se pierde WebGL, el separador se oculta y el botón se deshabilita con un aviso.
Al recuperarlo vuelve la misma vista, con la posición del separador conservada.

## Edición e historial por gestos

`Adjustments` contiene diez valores: brillo, contraste y saturación entre
0 y 200 %, tono (`hue`) entre −180° y 180°, sepia entre 0 y 100 %, exposición
entre −2 y +2 EV con pasos de 0,1, sombras, altas luces, temperatura y tinte entre −100 y +100. Los
primeros tres tienen un valor neutro de 100; los otros siete, de cero. El **reducer** es una
función que recibe el estado actual y una acción, y devuelve el siguiente estado.
Normaliza cada valor con sus propios límites y usa su valor neutro si no es finito.

El shader y `buildFilter` aplican el mismo orden: brillo, contraste, saturación, sepia
y rotación de tono. El orden afecta el resultado: por ejemplo, cambiar el tono
también desplaza los colores que generó sepia. `AdjustmentSlider` recibe límites
y unidad para calcular su escala y progreso; no interpreta qué efecto representa.
El preset Sepia conserva sus valores de brillo, contraste y saturación y añade
un 75 % de sepia real. Los demás parten de `DEFAULT_ADJUSTMENTS`, de modo que al
aplicarlos también se restablecen los parámetros nuevos.

El preview usa WebGL2; `buildFilter` conserva la representación CSS para las
miniaturas de presets y como alternativa cuando la GPU o los callbacks de
fotogramas no están disponibles. El video sigue controlando audio y tiempo.
El canvas muestra el resultado visual, sin aplicar filtros CSS por segunda vez.
La implementación y sus límites se explican en [el recorrido de WebGL](webgl-preview.md).

El historial almacena los diez valores y `equalAdjustments` compara todos ellos.
Así, modificar solo el tono o sepia cuenta como edición y cambia la etiqueta del
preset cuando corresponde. Reset restaura los diez valores en una sola operación.

Exposición, temperatura y tinte se aplican primero, en RGB lineal. El helper
`colorGradingGains` calcula las ganancias de los tres canales y el renderer las
envía al shader mediante un uniform. Después se calculan máscaras suaves de luminosidad para sombras y altas luces.
Estas ajustan la luz lineal de sus zonas antes de volver a sRGB y aplicar los cinco
efectos anteriores. Los presets existentes dejan los cinco parámetros de grading en cero para conservar su apariencia.

El reproductor comunica al área de trabajo si el preview gráfico está preparado;
solo cambia esa señal al cambiar el modo de renderizado o la disponibilidad del
video. Los avances del tiempo siguen quedando dentro del reproductor. En modo CSS,
los cinco controles de grading se deshabilitan y el aviso informa de que se omiten
temporalmente. Sus valores permanecen en el historial y vuelven a aplicarse al
recuperarse WebGL. Los cinco efectos anteriores siguen disponibles en ese modo.

Los presets son combinaciones inmutables de esos mismos valores. `findPreset`
deduce su etiqueta a partir de los ajustes actuales. No almacenamos por separado
una selección de preset que pueda quedar desactualizada respecto a los controles.

`EditHistory` contiene:

- `past`: estados anteriores disponibles para deshacer.
- `present`: estado de edición confirmado.
- `future`: estados disponibles para rehacer después de deshacer.
- `draft`: ajuste provisional mientras hay un gesto en curso.

Durante un arrastre, `draft` actualiza la vista previa mientras `present` conserva
el estado anterior al gesto. Soltar el puntero, soltar la tecla de ajuste o perder
el foco confirma el cambio una sola vez. Cancelar el puntero o pulsar Escape lo
descarta. Esta agrupación de actualizaciones en una sola operación se llama
**transacción**.

Los cambios que dejan los mismos valores no crean entradas y conservan la opción
de rehacer. Una edición nueva que sí modifica valores descarta los estados de
`future`. El historial conserva como máximo 100 operaciones.

Aplicar un preset o usar Reset confirma todos los valores en una sola operación.
Undo y Redo descartan primero el ajuste provisional y después recorren los estados
confirmados. El historial no incluye archivos, direcciones temporales, posición de
reproducción, preferencias ni visibilidad de controles.

## Ciclo de vida del video

Seleccionar un archivo incrementa el identificador de sesión, reinicia la edición
y vuelve a montar el reproductor. **Montar** significa crear su instancia en la
interfaz; desmontarla permite limpiar los recursos de la anterior.

El hook registra los manejadores de eventos antes de asignar el nuevo origen.
Cada ejecución del efecto crea su propia dirección temporal mediante
`URL.createObjectURL`. Al limpiarse, elimina los manejadores, pausa el video,
retira su origen y libera la dirección con `URL.revokeObjectURL`. Esto también
funciona cuando React Strict Mode repite la preparación y la limpieza durante el
desarrollo para ayudar a detectar errores.

Solo una duración finita y positiva habilita los desplazamientos y la edición.
Las actualizaciones de duración no vuelven a quitarle el foco al usuario. Cada
desplazamiento se limita al intervalo válido y reiniciar conserva el estado de
reproducción o pausa. Pulsar Play después del final vuelve al segundo cero.

Al explorar arrastrando la línea de tiempo, el reproductor recuerda si estaba
reproduciendo, pausa durante el gesto y reanuda al terminar solo si corresponde.
Cancelar el gesto restaura su tiempo inicial.

El indicador sigue inmediatamente la posición solicitada por el puntero. El video
procesa una búsqueda por vez y conserva solo el destino más reciente, sin acumular
saltos intermedios. Después del evento `seeked`, se deja una oportunidad de pintar
el fotograma antes de solicitar la siguiente posición. Al soltar, se completa el
destino final antes de reanudar. Los eventos del video no sobrescriben la posición
del cursor mientras el arrastre está activo. La captura del puntero permite
continuar el gesto aunque el cursor salga de la línea de tiempo.

`play()` devuelve una **promesa**, que representa una operación cuyo resultado
llegará después. Si se rechaza, aparece un mensaje que permite reintentar. Un
resultado tardío de un reproductor desmontado no puede actualizar la sesión que
lo reemplazó. Los errores de decodificación deshabilitan la edición y ofrecen
seleccionar otro archivo.

La línea de tiempo es un `input` nativo de tipo `range` con estilos. La regla y
la franja del clip son ayudas visuales, no miniaturas extraídas del video. Así
evitamos añadir procesamiento de fotogramas y otra cadena de trabajo multimedia.

## Carga por arrastre y distribución de la pantalla

`VideoDropZone` recibe los eventos nativos `dragenter`, `dragover`, `dragleave` y
`drop`. Lleva una cuenta de las entradas y salidas para mantener el resaltado al
pasar por elementos hijos del preview. `preventDefault()` permite recibir el
archivo y evita que el navegador lo abra reemplazando la página. También se
protegen los archivos soltados fuera del preview.

El componente comprueba que se haya soltado exactamente un video, por su tipo o
por una extensión conocida cuando el sistema no informa el tipo. Después llama al
mismo `onLoad` que utiliza el selector: se reinician la edición y la reproducción,
y se libera la URL anterior. Una selección inválida conserva el estado existente.
La decodificación definitiva sigue siendo responsabilidad de `<video>`.

El layout usa el alto dinámico de la ventana, `100dvh`, y filas flexibles con
`minmax(0, 1fr)`. Permitir que los paneles se reduzcan con `min-height: 0` evita
que sus contenidos empujen toda la página. Solo el contenido de efectos tiene
`overflow-y: auto`; el preview y la timeline permanecen visibles.

Las consultas de contenedor adaptan el estado vacío al alto real del preview.
En ventanas muy bajas se permite el scroll normal para no recortar controles.
El panel desplazable tiene nombre accesible y `tabIndex={0}`. La marca
`data-shortcuts-ignore` permite usar el teclado para recorrerlo sin que esos
eventos se interpreten como órdenes de reproducción.

## Teclado y almacenamiento

El manejador de teclado escucha eventos del documento, pero actúa únicamente
dentro del editor. Se elimina al limpiar el hook. Ignora campos, selectores,
botones, enlaces, contenido editable, eventos de composición de texto y el diálogo
de preferencias.

Solo llama a `preventDefault()` cuando realmente procesa una acción. Alternar
reproducción y pausa ignora la repetición de una tecla mantenida; avanzar o
retroceder sí admite esa repetición. Las combinaciones del navegador siguen
disponibles salvo los atajos de edición admitidos cuando hay algo que deshacer
o rehacer.

Las preferencias usan `KeyboardEvent.code`, que identifica la posición física de
la tecla. La lista permitida incluye `Space`, `ArrowLeft`, `ArrowRight` y `KeyA`
hasta `KeyZ`. La validación rechaza acciones ausentes, versiones desconocidas,
teclas no admitidas y duplicados.

La capa de almacenamiento captura errores tanto de lectura como de escritura.
Si los datos guardados son inválidos, recupera los valores predeterminados. Si
falla una escritura, conserva las preferencias elegidas en memoria y muestra un
aviso. Los tipos de TypeScript no sustituyen esta validación: un usuario puede
modificar manualmente el JSON guardado.

El diálogo nativo aporta semántica modal y desactiva la interacción con el fondo.
El recorrido explícito de Tab mantiene la navegación entre sus controles. Escape
lo cierra y la limpieza devuelve el foco al botón que lo abrió.

## Cómo se comprueba la arquitectura

Vitest prueba directamente las funciones puras: aquellas cuyo resultado depende
de sus argumentos y que no modifican el navegador. Testing Library comprueba el
comportamiento visible de los componentes.

En las pruebas del controlador con jsdom se simulan los métodos multimedia del
navegador mediante **mocks**. Playwright complementa esas simulaciones: ejecuta
el build de producción en un navegador real y comprueba decodificación, puntero,
foco, almacenamiento y reproducción.

Axe revisa los estados vacío y de preferencias en tamaños de escritorio y móvil.
Estas comprobaciones complementan la inspección visual y de teclado; no certifican
todo el contenido que cargue un usuario ni todas las tecnologías de asistencia.

## Decisiones de alcance

- Solo persisten los atajos; recargar inicia una sesión vacía.
- WebGL2 y los filtros CSS modifican la presentación, no el archivo de origen.
- Una extensión o un tipo MIME válido no garantizan la compatibilidad del códec.
- `timeupdate` es suficiente para mostrar progreso básico; el MVP no requiere
  navegación precisa por fotogramas.
- No añadimos memoización ni otro almacén de estado sin haber medido antes un
  problema de renderizado que lo justifique.
