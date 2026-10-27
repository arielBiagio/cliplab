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

void main() {
  vec3 color = texture(videoFrame, textureCoordinates).rgb;
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
  outputColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
