export const vertexShader = `#version 300 es
precision highp float;

out vec2 textureCoordinates;

void main() {
  // One oversized triangle covers the viewport without a seam or vertex buffer.
  vec2 position = vec2(
    gl_VertexID == 1 ? 3.0 : -1.0,
    gl_VertexID == 2 ? 3.0 : -1.0
  );
  textureCoordinates = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const fragmentShader = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D videoFrame;
uniform float brightness;
uniform float contrast;
uniform float saturation;
uniform float sepia;
uniform float hue;
uniform vec3 gradingGains;
uniform float comparisonSplit;
uniform float shadows;
uniform float highlights;
uniform highp sampler3D colorLut;
uniform float lutAmount;
uniform float lutSize;
uniform vec3 lutDomainMin;
uniform vec3 lutDomainMax;
uniform vec3 mixerBands[8];
uniform float mixerEnabled;
uniform float ditherStrength;
uniform float outputBt709;
uniform float inputBt709;

in vec2 textureCoordinates;
out vec4 outputColor;

vec3 toLinear(vec3 color) {
  return mix(
    color / 12.92,
    pow((color + 0.055) / 1.055, vec3(2.4)),
    greaterThan(color, vec3(0.04045))
  );
}

vec3 toSrgb(vec3 color) {
  return mix(
    color * 12.92,
    1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055,
    greaterThan(color, vec3(0.0031308))
  );
}

vec3 mixColorRanges(vec3 color) {
  float maximum = max(color.r, max(color.g, color.b));
  float minimum = min(color.r, min(color.g, color.b));
  float chroma = maximum - minimum;
  if (chroma < 0.00001) return color;
  float lightness = (maximum + minimum) * 0.5;
  float sat = chroma / max(1.0 - abs(2.0 * lightness - 1.0), 0.00001);
  float tone;
  if (maximum == color.r) tone = (color.g - color.b) / chroma;
  else if (maximum == color.g) tone = (color.b - color.r) / chroma + 2.0;
  else tone = (color.r - color.g) / chroma + 4.0;
  tone = fract(tone / 6.0 + 1.0);

  // Smoothly interpolate adjacent ranges, including the magenta/red wrap.
  const float centers[9] = float[9](0.0, 1.0/12.0, 1.0/6.0, 1.0/3.0,
    0.5, 2.0/3.0, 0.75, 5.0/6.0, 1.0);
  vec3 adjustment = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (tone >= centers[i] && tone < centers[i + 1]) {
      float weight = smoothstep(centers[i], centers[i + 1], tone);
      adjustment = mix(mixerBands[i], mixerBands[(i + 1) % 8], weight);
      break;
    }
  }
  // Hue is unstable near gray and black: fade the effect out in those areas.
  float protection = smoothstep(0.02, 0.12, sat) * smoothstep(0.01, 0.06, chroma);
  adjustment *= protection;
  if (all(equal(adjustment, vec3(0.0)))) return color;
  tone = fract(tone + adjustment.x + 1.0);
  sat += adjustment.y * (adjustment.y >= 0.0 ? 1.0 - sat : sat);
  lightness += adjustment.z * (adjustment.z >= 0.0 ? 1.0 - lightness : lightness);
  vec3 wheel = clamp(abs(mod(tone * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return lightness + (wheel - 0.5) * sat * (1.0 - abs(2.0 * lightness - 1.0));
}

uint hashPixel(uint value) {
  value ^= value >> 16u;
  value *= 0x7feb352du;
  value ^= value >> 15u;
  value *= 0x846ca68bu;
  return value ^ (value >> 16u);
}

float outputNoise(uvec2 pixel) {
  uint seed = pixel.x + pixel.y * 65537u;
  float first = float(hashPixel(seed) & 0x00ffffffu) / 16777216.0;
  float second = float(hashPixel(seed ^ 0x9e3779b9u) & 0x00ffffffu) / 16777216.0;
  // Difference of two uniform samples: zero-mean triangular noise, stable across frames.
  return first - second;
}

void main() {
  vec3 color = texture(videoFrame, textureCoordinates).rgb;
  if (inputBt709 > 0.0) {
    color = clamp(color, 0.0, 1.0);
    vec3 linearColor = mix(color / 4.5, pow((color + 0.099) / 1.099, vec3(1.0 / 0.45)),
      greaterThanEqual(color, vec3(0.081)));
    color = toSrgb(linearColor);
  }
  // Both sides sample this exact frame; comparison never changes the edit state.
  if (comparisonSplit >= 0.0 && textureCoordinates.x < comparisonSplit) {
    outputColor = vec4(color, 1.0);
    return;
  }
  // Exposure scales light, rather than the gamma-encoded display values.
  vec3 light = clamp(toLinear(color) * gradingGains, 0.0, 1.0);
  // Select visible tonal ranges smoothly, then adjust their light in exposure stops.
  float luminance = dot(toSrgb(light), vec3(0.2126, 0.7152, 0.0722));
  float shadowMask = 1.0 - smoothstep(0.15, 0.65, luminance);
  float highlightMask = smoothstep(0.35, 0.85, luminance);
  float toneExposure = shadows * shadowMask + highlights * highlightMask;
  color = toSrgb(clamp(light * exp2(toneExposure), 0.0, 1.0));
  // Legacy CSS filter functions operate in sRGB. Preserve their order.
  color = clamp(color * brightness, 0.0, 1.0);
  color = clamp((color - 0.5) * contrast + 0.5, 0.0, 1.0);

  float gray = dot(color, vec3(0.213, 0.715, 0.072));
  color = clamp(mix(vec3(gray), color, saturation), 0.0, 1.0);

  vec3 warm = vec3(
    dot(color, vec3(0.393, 0.769, 0.189)),
    dot(color, vec3(0.349, 0.686, 0.168)),
    dot(color, vec3(0.272, 0.534, 0.131))
  );
  color = clamp(mix(color, warm, sepia), 0.0, 1.0);

  float c = cos(hue);
  float s = sin(hue);
  color = vec3(
    dot(color, vec3(0.213 + 0.787*c - 0.213*s, 0.715 - 0.715*c - 0.715*s, 0.072 - 0.072*c + 0.928*s)),
    dot(color, vec3(0.213 - 0.213*c + 0.143*s, 0.715 + 0.285*c + 0.140*s, 0.072 - 0.072*c - 0.283*s)),
    dot(color, vec3(0.213 - 0.213*c - 0.787*s, 0.715 - 0.715*c + 0.715*s, 0.072 + 0.928*c + 0.072*s))
  );
  color = clamp(color, 0.0, 1.0);
  if (lutAmount > 0.0) {
    vec3 inputColor = clamp((color - lutDomainMin) / (lutDomainMax - lutDomainMin), 0.0, 1.0);
    // Cube data stores red fastest; sample grid points at texel centers, not edges.
    vec3 coordinates = (inputColor * (lutSize - 1.0) + 0.5) / lutSize;
    // LUT entries may be negative or above one. Preserve them through intensity mixing.
    color = mix(color, texture(colorLut, coordinates).rgb, lutAmount);
  }
  color = clamp(color, 0.0, 1.0);
  // Work on the displayed SDR colors, after LUT interpolation and intensity.
  if (mixerEnabled > 0.0) color = mixColorRanges(color);
  if (outputBt709 > 0.0) {
    vec3 linearColor = toLinear(clamp(color, 0.0, 1.0));
    color = mix(linearColor * 4.5, 1.099 * pow(linearColor, vec3(0.45)) - 0.099,
      greaterThanEqual(linearColor, vec3(0.018)));
  }
  if (ditherStrength > 0.0) {
    // Add one shared RGB offset before final 8-bit quantization to avoid colored speckles.
    color += vec3(outputNoise(uvec2(gl_FragCoord.xy)) * ditherStrength / 255.0);
  }
  outputColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
