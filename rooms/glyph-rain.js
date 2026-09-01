import {
  DEFAULT_PALETTE,
  attachRuntime,
  bakePhoto,
  bakeType,
  buildGlyphAtlas,
  createQuad,
  createTexture,
  link,
  setColor3,
} from "./shared.js";

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uAtlas;
uniform vec2 uRes;
uniform float uTime;
uniform float uCount;
uniform vec2 uAtlasGrid;
uniform vec3 uAccent;
uniform vec3 uHighlight;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  return fract(p * p);
}

float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

void main () {
  float cell = 30.0;
  float col = floor(vUv.x * uRes.x / cell);
  float yn = vUv.y;
  float sp = 0.38 * mix(0.85, 1.25, hash11(col + 3.1));
  float T = uTime * sp + hash11(col) * 4.0;
  float phase = fract(yn + T);
  float cyc = floor(yn + T);
  float trail = clamp(0.7 / (phase * 18.0), 0.0, 1.2) - 0.05;
  float gate = step(hash21(vec2(col, cyc)), 0.72);
  vec2 local = fract(vec2(vUv.x, 1.0 - vUv.y) * uRes / cell);
  float idx = floor(hash21(vec2(col, cyc)) * uCount);
  vec2 atlas = vec2(mod(idx, uAtlasGrid.x), floor(idx / uAtlasGrid.x));
  float mask = texture(uAtlas, (atlas + local) / uAtlasGrid).a;
  float g = max(trail * gate * mask, 0.0);
  float head = (1.0 - smoothstep(0.0, 0.06, phase)) * gate * mask;

  vec3 content = texture(uContent, vUv).rgb;
  float lum = dot(content, vec3(0.299, 0.587, 0.114));
  vec3 rain = mix(uAccent, uHighlight, head);
  vec3 dim = content * 0.45;
  vec3 lit = content * mix(0.45, 1.15, clamp(g * 1.4 + head, 0.0, 1.0));
  vec3 colOut = mix(dim, lit, clamp(lum * 2.0, 0.0, 1.0));
  colOut = mix(colOut, rain, clamp(g, 0.0, 1.0));
  outColor = vec4(colOut, 1.0);
}`;

export function create(canvas, { name, verb, photo }) {
  return attachRuntime(canvas, {
    async setup(gl, el) {
      const photoBake = await bakePhoto(photo, el.clientWidth, el.clientHeight);
      const baked =
        photoBake?.canvas ??
        (await bakeType(el.clientWidth, el.clientHeight, name || "", verb || ""));
      const atlas = buildGlyphAtlas();
      return {
        linked: link(gl, VERT, FRAG),
        quad: createQuad(gl),
        content: createTexture(gl, baked),
        atlasTex: createTexture(gl, atlas.canvas),
        atlas,
        palette: photoBake?.palette ?? DEFAULT_PALETTE,
      };
    },
    frame(state, { gl, canvas, t }) {
      const { linked, quad, content, atlasTex, atlas, palette } = state;
      gl.useProgram(linked.program);
      gl.bindVertexArray(quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, content);
      gl.uniform1i(linked.uniforms.uContent, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(linked.uniforms.uAtlas, 1);
      gl.uniform2f(linked.uniforms.uRes, canvas.clientWidth, canvas.clientHeight);
      gl.uniform1f(linked.uniforms.uTime, t);
      gl.uniform1f(linked.uniforms.uCount, atlas.count);
      gl.uniform2f(linked.uniforms.uAtlasGrid, atlas.cols, atlas.rows);
      setColor3(gl, linked.uniforms.uAccent, palette.accent);
      setColor3(gl, linked.uniforms.uHighlight, palette.highlight);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose(state, gl) {
      gl.deleteTexture(state.content);
      gl.deleteTexture(state.atlasTex);
      gl.deleteProgram(state.linked.program);
      gl.deleteShader(state.linked.vs);
      gl.deleteShader(state.linked.fs);
      gl.deleteBuffer(state.quad.buf);
      gl.deleteVertexArray(state.quad.vao);
    },
  });
}
