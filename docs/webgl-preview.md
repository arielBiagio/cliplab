# El preview y la edición de color con WebGL

La primera etapa cambió cómo se dibuja el video, conservando los cinco ajustes
existentes, presets, historial y reproducción. La segunda incorpora exposición,
temperatura y tinte; después se añaden sombras y altas luces. La exportación queda como un incremento posterior.

## El recorrido de un fotograma

El elemento `<video>` sigue abriendo el archivo local, decodificando imágenes y
reproduciendo audio. El navegador también administra su tiempo, pausa y seek.
WebGL recibe la imagen decodificada y la dibuja en un `<canvas>`.

```text
Archivo local → <video> → textura → shader → canvas visible
                    └── audio y posición de reproducción
```

Una **textura** es una imagen accesible para la GPU. Un **shader** es un programa
pequeño que se ejecuta en ella. Aquí usamos dos:

- El vertex shader dibuja un triángulo que cubre el área de salida y determina
  qué coordenada de la imagen corresponde a cada punto.
- El fragment shader lee los colores de la textura y calcula los colores finales.

Los parámetros que enviamos desde JavaScript al shader se llaman **uniforms**.
El brillo de 100 % llega como `1.0`; el tono se convierte de grados a radianes.
Modificar un slider cambia estos parámetros sin compilar otra vez el programa.

## Qué hace cada archivo

- [shaders.ts](../src/features/rendering/shaders.ts): programas GLSL para posición
  y color. Conservan el orden de brillo, contraste, saturación, sepia y tono.
- [videoRenderer.ts](../src/features/rendering/videoRenderer.ts): crea el programa,
  la textura y los recursos de WebGL2; actualiza fotogramas y dibuja. No depende
  de React y ofrece `render` y `dispose`.
- [useVideoRenderer.ts](../src/features/rendering/useVideoRenderer.ts): conecta ese
  renderer con el ciclo de vida de React, los eventos del video y los ajustes.
- [VideoPlayer.tsx](../src/features/video/VideoPlayer.tsx): compone video y canvas,
  muestra la superficie activa y comunica si se está usando el preview estándar.

## Actualización sin otro reloj de reproducción

`requestVideoFrameCallback` avisa cuando hay un fotograma disponible para presentar.
El hook mantiene una sola solicitud pendiente. Durante una pausa, esa solicitud
espera a la siguiente imagen: no crea un bucle de dibujos continuos.

Cambiar un ajuste vuelve a dibujar la imagen actual aunque el video esté pausado.
Los eventos `loadeddata` y `seeked` permiten mostrar el primer fotograma y la
posición elegida en la timeline. El tiempo y la reanudación después del scrubbing
siguen siendo responsabilidad de `useVideoPlayer`.

Las referencias guardan la textura, el programa y el callback de dibujo. Estos
recursos no entran en el historial y no provocan una actualización de React por
cada fotograma. React cambia de modo al disponer del primer dibujo o al producirse
un fallo; los ajustes siguen almacenándose como números en el reducer existente.

## Mantener la apariencia anterior

Las funciones de filtro CSS trabajan en sRGB. El shader usa sus mismas fórmulas
y orden, limita los resultados al rango permitido después de cada operación y
corrige la orientación vertical de la textura al cargarla.

Las pruebas comparan píxeles de la salida WebGL con una referencia independiente
dibujada mediante los filtros del navegador. Admiten diferencias pequeñas de
redondeo. También comprueban que Original conserva los colores y la orientación,
y que los cambios con el video pausado y Undo/Redo actualizan el resultado.

Esta primera versión se centra en video SDR. No incorpora gestión profesional de
HDR, perfiles de color ni garantías de coincidencia entre equipos diferentes.

## Si la GPU falla

Mientras se prepara el primer dibujo, se conserva la vista nativa del video.
Si WebGL2 no está disponible, no puede inicializarse o falla al dibujar, el hook
utiliza ese mismo video con filtros CSS y muestra un aviso breve. Los cinco
controles originales siguen funcionando y el historial no se borra.

Exposición, sombras, altas luces, temperatura y tinte requieren el shader: en el preview estándar se
omiten temporalmente y sus sliders quedan deshabilitados. Un aviso explica esa
situación. Sus números se conservan para aplicarlos otra vez al recuperarse la GPU;
Reset, los presets y el historial siguen modificando el estado completo de edición.

También se utiliza CSS si falta `requestVideoFrameCallback`. Durante el desarrollo
se detectó una imagen congelada en una ruta alternativa basada en animación; esta
etapa exige callbacks de video para el preview WebGL y evita esa ruta.

El navegador puede perder temporalmente el contexto gráfico, por ejemplo al
cambiar de GPU. El evento `webglcontextlost` cancela callbacks y activa el preview
estándar. Al recibir `webglcontextrestored`, el hook reconstruye los recursos y
vuelve a dibujar con los ajustes más recientes, sin cambiar el tiempo del video.

Al reemplazar el archivo o desmontar el reproductor se cancelan callbacks, se
eliminan listeners y se liberan programa, textura y geometría. La preparación se
encola para que React Strict Mode pueda limpiar una instancia antes de inicializarla.

## Resolución y alcance

El buffer de salida mantiene la proporción del video y se limita a 1920 × 1080.
En un video vertical, ambos límites se aplican conservando su proporción. CSS
ajusta esa imagen al espacio disponible mediante `object-fit: contain`.

Este límite reduce el trabajo de dibujado, pero el navegador sigue decodificando
el archivo original y la textura recibe su resolución original. No equivale a
generar un proxy ni garantiza reproducción fluida de material 4K. Si una dimensión
supera el máximo de textura de la GPU, se utiliza la vista estándar.

## Exposición, temperatura y tinte

Estos ajustes se procesan antes de brillo, contraste, saturación, sepia y tono.
El shader convierte los valores sRGB de la imagen a RGB lineal, multiplica los
canales por sus ganancias, limita la salida al rango SDR y vuelve a sRGB.

La **exposición** usa pasos de luz llamados EV: +1 multiplica la luz lineal por
dos; −1 la divide por dos. El control abarca de −2 a +2 EV y avanza de 0,1 en 0,1.
La normalización redondea por décimas para evitar valores como 0,30000000000004.
Brightness conserva su cálculo anterior sobre sRGB, por lo que los dos controles
tienen respuestas distintas.

**Temperatura** mueve el equilibrio entre frío y cálido. **Tinte** modifica el
equilibrio entre verde y magenta. Ambos son controles creativos con escalas
relativas de −100 a +100. El modelo usa ganancias por canal:

```text
T = temperature / 100
M = tint / 100
gainR = 2 ^ (exposure + 0.5*T + 0.25*M)
gainG = 2 ^ (exposure - 0.5*M)
gainB = 2 ^ (exposure - 0.5*T + 0.25*M)
```

[colorGrading.ts](../src/features/editing/colorGrading.ts) contiene ese cálculo
puro. El renderer envía las tres ganancias juntas con `uniform3f`, sin reconstruir
el programa gráfico cuando mueves un slider. En cero, las tres ganancias son uno.

Los presets actuales establecen los cinco controles de grading en cero. Aplicar
uno después de una edición manual restablece también estos controles. Un solo
Undo recupera el look completo anterior. Una nueva sesión vuelve a los diez
valores neutros.

## Sombras y altas luces

**Shadows** modifica principalmente las zonas oscuras y **Highlights**, las claras.
Ambos van de −100 a +100: cero conserva la imagen, un valor negativo oscurece y
uno positivo aclara. No son controles de contraste global ni recuperación de HDR.

Después de la exposición y el balance por canal, el shader calcula una luminosidad
relativa sobre los valores sRGB resultantes. `smoothstep` construye máscaras que
cambian gradualmente entre zonas, evitando un corte visible. La máscara de sombras
se desvanece entre 0,15 y 0,65; la de altas luces crece entre 0,35 y 0,85. Las dos
pueden influir suavemente sobre los tonos medios.

Cada máscara pondera su control, dividido por 100. La suma da una variación de
exposición: la luz lineal se multiplica por `2 ^ variación` antes de volver a sRGB.
En las zonas donde una máscara vale uno, el extremo del control representa un paso
de luz. Los negros puros siguen siendo negros y la salida se limita al rango SDR.
Oscurecer un blanco recortado no recupera textura que el archivo no contiene.

Los valores se almacenan junto a los otros ocho ajustes. Un gesto genera un solo
paso de Undo; presets y Reset ponen ambos en cero. La comparación original evita
este procesamiento y la pérdida de GPU conserva los valores para restaurarlos.

Para comprobarlo, pausa una imagen con zonas claras y oscuras. Mueve Shadows:
las partes oscuras deben responder más. Restáuralo y mueve Highlights: observa las
claras. Compare permite revisar el resultado sin cambiar el historial. Las pruebas
de píxeles contrastan una referencia calculada en CPU y verifican esta selectividad.

## Comparación antes y después

El botón **Compare** activa una división: imagen original a la izquierda y edición
a la derecha. El fragment shader lee una sola textura de video. Según la coordenada
horizontal, devuelve el color original o aplica el procesamiento. El uniform
`comparisonSplit` indica dónde cambia de una salida a la otra; un valor negativo
desactiva la comparación y muestra toda la edición.

Esto permite evaluar el mismo fotograma en pausa, reproducción y scrubbing, sin
crear otro reproductor ni sincronizar relojes. Mover el separador tampoco modifica
los diez ajustes: activación y posición pertenecen al estado de vista de `VideoPlayer`.
Undo/Redo siguen recorriendo solo la edición.

El separador se ajusta al rectángulo de la imagen, excluyendo las bandas negras.
`ResizeObserver` actualiza sus límites al cambiar el tamaño de la ventana. La función
`getContainBounds` también contempla video vertical. En móvil se puede arrastrar con
el dedo; con teclado, las flechas cambian el límite, Home muestra toda la edición y
End todo el original. Escape cancela un arrastre y restaura su posición inicial.

Al desactivar y activar Compare se conserva la posición dentro de la sesión. Abrir
otro archivo o recargar reinicia esta vista. Si falla la GPU, la comparación se
suspende con un aviso; al volver WebGL se recupera la posición conservada.

## Cómo verlo e investigarlo

Abre un video, aplica Sepia y mueve Hue con la reproducción pausada. La imagen
debe responder de inmediato. Deshaz el cambio y después arrastra la timeline en
ambos sentidos. Los controles y tiempos conservan su comportamiento anterior.

Aplica Black & White y activa Compare para distinguir claramente ambas mitades.
Mueve el separador y luego deshaz una edición: el separador conserva su posición
y Undo restaura el ajuste, sin recorrer los movimientos de la comparación.

En Elements de DevTools encontrarás el `<video>` y el canvas. El canvas indica
`data-renderer="webgl2"` cuando dibuja la GPU y `css` al usar la vista estándar.
El video continúa en el DOM porque suministra fotogramas y audio.

Puedes colocar un breakpoint en `render` para ver los valores que recibe. Para
estudiar el recorrido completo, sigue primero `refresh` en el hook y después los
uniforms del renderer. No hace falta conocer todas las instrucciones GLSL a la vez.

Las pruebas E2E pueden usar un puerto independiente del editor local. Por ejemplo,
en PowerShell establece `$env:CLIPLAB_E2E_PORT = '4277'` antes de ejecutarlas.

## Referencias

- [Video como textura en WebGL, MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Animating_textures_in_WebGL).
- [Callbacks de fotogramas, MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback).
- [Fórmulas de filtros, W3C](https://www.w3.org/TR/filter-effects-1/).
- [Conversión entre sRGB y RGB lineal, W3C](https://www.w3.org/TR/css-color-4/#color-conversion-code).
