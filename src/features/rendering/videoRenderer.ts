import { normalizeAdjustments } from '../editing/filters';
import { colorGradingGains } from '../editing/colorGrading';
import type { Adjustments } from '../editing/types';
import { fragmentShader, vertexShader } from './shaders';
import { DEFAULT_COMPARISON, normalizeComparisonSplit, type ComparisonView } from './comparison';

export interface VideoRenderer {
  render: (
    video: HTMLVideoElement,
    adjustments: Readonly<Adjustments>,
    comparison?: Readonly<ComparisonView>,
  ) => boolean;
  dispose: () => void;
}

export function createVideoRenderer(canvas: HTMLCanvasElement): VideoRenderer {
  const context = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });
  if (!context) throw new Error('WebGL2 is unavailable.');
  const gl = context;

  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let texture: WebGLTexture | null = null;
  let vertices: WebGLVertexArrayObject | null = null;
  let disposed = false;

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (!gl.isContextLost()) {
      gl.useProgram(null);
      gl.bindVertexArray(null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    if (texture) gl.deleteTexture(texture);
    if (vertices) gl.deleteVertexArray(vertices);
    if (program) gl.deleteProgram(program);
  }

  function compile(type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Unable to allocate a shader.');
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  try {
    const vertex = compile(gl.VERTEX_SHADER, vertexShader);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentShader);
    program = gl.createProgram();
    if (!program) throw new Error('Unable to allocate the video program.');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? 'Unable to link the video program.');

    texture = gl.createTexture();
    vertices = gl.createVertexArray();
    if (!texture || !vertices) throw new Error('Unable to allocate video resources.');

    gl.useProgram(program);
    gl.bindVertexArray(vertices);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.DITHER);
    gl.uniform1i(gl.getUniformLocation(program, 'videoFrame'), 0);

    const locations = {
      brightness: gl.getUniformLocation(program, 'brightness'),
      contrast: gl.getUniformLocation(program, 'contrast'),
      saturation: gl.getUniformLocation(program, 'saturation'),
      sepia: gl.getUniformLocation(program, 'sepia'),
      hue: gl.getUniformLocation(program, 'hue'),
      gradingGains: gl.getUniformLocation(program, 'gradingGains'),
      comparisonSplit: gl.getUniformLocation(program, 'comparisonSplit'),
      shadows: gl.getUniformLocation(program, 'shadows'),
      highlights: gl.getUniformLocation(program, 'highlights'),
    };
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    let textureWidth = 0;
    let textureHeight = 0;

    return {
      render(video, adjustments, comparison = DEFAULT_COMPARISON) {
        if (disposed || gl.isContextLost()) return false;
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !width || !height)
          return false;
        if (width > maxTextureSize || height > maxTextureSize)
          throw new Error('Video exceeds the graphics texture limit.');

        // Limit the drawing buffer to 1080p. This does not change source decoding.
        const scale = Math.min(1, 1920 / width, 1080 / height);
        const outputWidth = Math.max(1, Math.round(width * scale));
        const outputHeight = Math.max(1, Math.round(height * scale));
        if (canvas.width !== outputWidth || canvas.height !== outputHeight) {
          canvas.width = outputWidth;
          canvas.height = outputHeight;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(program);
        gl.bindVertexArray(vertices);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        if (textureWidth !== width || textureHeight !== height) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
          textureWidth = width;
          textureHeight = height;
        } else {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
        }

        const values = normalizeAdjustments(adjustments);
        const gains = colorGradingGains(values);
        gl.uniform3f(locations.gradingGains, gains[0], gains[1], gains[2]);
        gl.uniform1f(locations.shadows, values.shadows / 100);
        gl.uniform1f(locations.highlights, values.highlights / 100);
        gl.uniform1f(locations.brightness, values.brightness / 100);
        gl.uniform1f(locations.contrast, values.contrast / 100);
        gl.uniform1f(locations.saturation, values.saturation / 100);
        gl.uniform1f(locations.sepia, values.sepia / 100);
        gl.uniform1f(locations.hue, (values.hue * Math.PI) / 180);
        gl.uniform1f(
          locations.comparisonSplit,
          comparison.enabled ? normalizeComparisonSplit(comparison.split) / 100 : -1,
        );
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return true;
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  } finally {
    shaders.forEach((shader) => gl.deleteShader(shader));
  }
}
