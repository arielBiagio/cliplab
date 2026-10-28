import { normalizeAdjustments } from '../editing/filters';
import { colorGradingGains } from '../editing/colorGrading';
import type { Adjustments } from '../editing/types';
import { fragmentShader, vertexShader } from './shaders';
import { DEFAULT_COMPARISON, normalizeComparisonSplit, type ComparisonView } from './comparison';
import { DEFAULT_LUT_STATE, type CubeLut, type LutState } from '../luts/types';
import {
  colorMixerUniforms,
  DEFAULT_COLOR_MIXER,
  type ColorMixerState,
} from '../editing/colorMixer';

const identityLut = new Float32Array([
  0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1,
]);

export interface VideoRenderer {
  render: (
    video: HTMLVideoElement,
    adjustments: Readonly<Adjustments>,
    comparison?: Readonly<ComparisonView>,
    lut?: LutState,
    colorMixer?: ColorMixerState,
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
  let lutTexture: WebGLTexture | null = null;
  let vertices: WebGLVertexArrayObject | null = null;
  let disposed = false;

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (!gl.isContextLost()) {
      gl.useProgram(null);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    if (texture) gl.deleteTexture(texture);
    if (lutTexture) gl.deleteTexture(lutTexture);
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
    lutTexture = gl.createTexture();
    vertices = gl.createVertexArray();
    if (!texture || !lutTexture || !vertices)
      throw new Error('Unable to allocate video resources.');

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
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, lutTexture);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, 'colorLut'), 1);

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
      lutAmount: gl.getUniformLocation(program, 'lutAmount'),
      lutSize: gl.getUniformLocation(program, 'lutSize'),
      lutDomainMin: gl.getUniformLocation(program, 'lutDomainMin'),
      lutDomainMax: gl.getUniformLocation(program, 'lutDomainMax'),
      mixerBands: gl.getUniformLocation(program, 'mixerBands[0]'),
      mixerEnabled: gl.getUniformLocation(program, 'mixerEnabled'),
    };
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const maxLutSize = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) as number;
    let uploadedLut: CubeLut | null | undefined;
    let uploadedMixer: ColorMixerState | undefined;
    let textureWidth = 0;
    let textureHeight = 0;

    return {
      render(
        video,
        adjustments,
        comparison = DEFAULT_COMPARISON,
        lut = DEFAULT_LUT_STATE,
        colorMixer = DEFAULT_COLOR_MIXER,
      ) {
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
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        if (textureWidth !== width || textureHeight !== height) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
          textureWidth = width;
          textureHeight = height;
        } else {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
        }

        if (uploadedLut !== lut.source) {
          const source = lut.source;
          const size = source?.size ?? 2;
          if (size > maxLutSize) throw new Error('LUT exceeds the graphics texture limit.');
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_3D, lutTexture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          // Half-float textures retain decimal LUT entries and support trilinear filtering.
          gl.texImage3D(
            gl.TEXTURE_3D,
            0,
            gl.RGB16F,
            size,
            size,
            size,
            0,
            gl.RGB,
            gl.FLOAT,
            source?.data ?? identityLut,
          );
          if (gl.getError() !== gl.NO_ERROR) throw new Error('Unable to upload the color LUT.');
          uploadedLut = source;
        }
        const minimum = lut.source?.domainMin ?? [0, 0, 0];
        const maximum = lut.source?.domainMax ?? [1, 1, 1];
        gl.uniform3f(locations.lutDomainMin, minimum[0], minimum[1], minimum[2]);
        gl.uniform3f(locations.lutDomainMax, maximum[0], maximum[1], maximum[2]);
        gl.uniform1f(locations.lutSize, lut.source?.size ?? 2);
        gl.uniform1f(locations.lutAmount, lut.source && lut.enabled ? lut.intensity / 100 : 0);

        if (uploadedMixer !== colorMixer) {
          const bands = colorMixerUniforms(colorMixer);
          gl.uniform3fv(locations.mixerBands, bands);
          gl.uniform1f(locations.mixerEnabled, bands.some((value) => value !== 0) ? 1 : 0);
          uploadedMixer = colorMixer;
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
