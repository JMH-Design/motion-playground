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
uniform vec2 uPointer;
uniform float uActive;
uniform float uTime;
uniform float uCount;
uniform vec2 uAtlasGrid;
uniform vec3 uAccent;
uniform vec3 uHighlight;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main () {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec2 pointer = uPointer * uRes;
  float dist = length(px - pointer);
  float radius = min(uRes.x, uRes.y) * 0.78;
  float reveal = (1.0 - smoothstep(radius * 0.35, radius, dist)) * uActive;
  float ring = exp(-pow((dist - radius * 0.72) / (radius * 0.16), 2.0)) * uActive;

  vec2 cellPx = vec2(10.0 * 0.75, 10.0);
  vec2 cell = floor(px / cellPx);
  vec2 local = fract(px / cellPx);
  float tick = floor(uTime * (6.0 + ring * 10.0));
  float pick = hash(cell + vec2(tick * 0.17, tick * 0.31));
  float glyph = floor(pick * uCount);

  vec2 atlas = vec2(mod(glyph, uAtlasGrid.x), floor(glyph / uAtlasGrid.x));
  vec2 atlasUv = (atlas + local) / uAtlasGrid;
  float mask = texture(uAtlas, vec2(atlasUv.x, 1.0 - atlasUv.y)).a;

  vec3 content = texture(uContent, vUv).rgb;
  vec3 cipher = uAccent * (0.35 + mask * 0.9);
  cipher += uHighlight * ring * mask * 1.4;
  vec3 encrypted = mix(content * 0.18, cipher, mask);
  vec3 col = mix(encrypted, content, reveal);
  outColor = vec4(col, 1.0);
}`;

export function create(canvas, { name, verb, photo }) {
  return attachRuntime(canvas, {
    async setup(gl, el) {
      const photoBake = await bakePhoto(photo, el.clientWidth, el.clientHeight);
      const baked =
        photoBake?.canvas ??
        (await bakeType(el.clientWidth, el.clientHeight, name || "", verb || ""));
      const atlas = buildGlyphAtlas();
      const linked = link(gl, VERT, FRAG);
      const quad = createQuad(gl);
      const content = createTexture(gl, baked);
      const atlasTex = createTexture(gl, atlas.canvas);
      return {
        linked,
        quad,
        content,
        atlasTex,
        atlas,
        palette: photoBake?.palette ?? DEFAULT_PALETTE,
      };
    },
    frame(state, { gl, canvas, t, pointer }) {
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
      gl.uniform2f(linked.uniforms.uPointer, pointer.x, pointer.y);
      gl.uniform1f(linked.uniforms.uActive, pointer.active);
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
