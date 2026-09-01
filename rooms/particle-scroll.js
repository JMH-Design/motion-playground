import {
  attachRuntime,
  bakePhoto,
  bakeCopy,
  createQuad,
  createTexture,
  link,
} from "./shared.js";

const QUAD_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const HASH = `
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}`;

const PHOTO_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPhoto;
out vec4 outColor;
void main () {
  outColor = vec4(texture(uPhoto, vUv).rgb, 1.0);
}`;

const BASE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uRowTex;
uniform vec2 uRes;
uniform float uDensity;
uniform float uRowCount;
uniform float uStagger;
uniform float uScroll;
uniform float uWinStart;
uniform float uDocH;
${HASH}
void main () {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  vec2 cell = floor(vec2(px.x, px.y + uScroll) / uDensity);
  float h1 = hash(cell);
  float d = h1 * uStagger;
  int row = int(clamp(cell.y - uWinStart, 0.0, uRowCount - 1.0));
  float p = texelFetch(uRowTex, ivec2(row, 0), 0).r;
  float t = clamp((p - d) / max(1.0 - d, 1e-3), 0.0, 1.0);
  float docY = px.y + uScroll;
  float texV = 1.0 - docY / max(uDocH, uRes.y);
  if (texV < 0.0 || texV > 1.0) discard;
  vec4 tex = texture(uContent, vec2(vUv.x, clamp(texV, 0.001, 0.999)));
  float vis = step(0.9995, t) * step(0.08, tex.a);
  if (vis < 0.5) discard;
  outColor = vec4(tex.rgb, 1.0);
}`;

const POINT_VERT = `#version 300 es
precision highp float;
uniform sampler2D uContent;
uniform sampler2D uRowTex;
uniform vec2 uRes;
uniform vec2 uGrid;
uniform float uDensity;
uniform float uStagger;
uniform float uSpread;
uniform float uGravity;
uniform float uDrift;
uniform float uSwirl;
uniform float uTime;
uniform float uFade;
uniform float uSize;
uniform float uDpr;
uniform float uLag;
uniform float uScroll;
uniform float uWinStart;
uniform float uDocH;
out vec2 vCenter;
out float vSize;
out float vAlpha;
out float vLod;
out float vMerge;
${HASH}
void main () {
  float fid = float(gl_VertexID);
  vec2 local = vec2(mod(fid, uGrid.x), floor(fid / uGrid.x));
  vec2 cell = vec2(local.x, local.y + uWinStart);
  float h1 = hash(cell);
  float h2 = hash(cell + vec2(1.7, 9.1));
  float h3 = hash(cell + vec2(5.5, 2.9));
  float h4 = hash(cell + vec2(8.4, 4.2));
  float d = h1 * uStagger;
  vec2 home = vec2(
    (cell.x + 0.5) * uDensity,
    (cell.y + 0.5) * uDensity - uScroll
  );
  int row = int(clamp(local.y, 0.0, uGrid.y - 1.0));
  float p = texelFetch(uRowTex, ivec2(row, 0), 0).r;
  float t = clamp((p - d) / max(1.0 - d, 1e-3), 0.0, 1.0);
  float e = 1.0 - pow(1.0 - t, 3.0);
  vec2 homeUv = vec2(
    clamp(home.x / uRes.x, 0.001, 0.999),
    1.0 - (home.y + uScroll) / max(uDocH, uRes.y)
  );
  float ink = homeUv.y > 0.0 && homeUv.y < 1.0
    ? texture(uContent, vec2(homeUv.x, clamp(homeUv.y, 0.001, 0.999))).a
    : 0.0;
  float vis = (1.0 - step(0.9995, t))
    * step(0.08, ink)
    * step(home.x, uRes.x)
    * step(home.y, uRes.y)
    * step(-uDensity, home.y);
  if (vis < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vCenter = vec2(0.0);
    vSize = 0.0;
    vAlpha = 0.0;
    vLod = 0.0;
    vMerge = 0.0;
    return;
  }
  vec2 dir = normalize(vec2(h2 - 0.5, h3 - 0.5) + vec2(1e-4, 0.0));
  float reach = 0.08 + 0.92 * pow(h4, 2.4);
  vec2 off = dir * uSpread * reach;
  off.y += uGravity * uSpread * (0.25 + 0.75 * h4);
  vec2 scat = home + off;
  vec2 pos = mix(scat, home, e);
  vec2 perp = vec2(-dir.y, dir.x);
  pos += perp * (h2 - 0.5) * 2.0 * uSwirl * sin(e * 3.14159);
  float tt = uTime * uDrift;
  float amp = (1.0 - e) * (uSpread * 0.05 + 2.5);
  pos += vec2(
    sin(tt * (4.0 + 5.0 * h2) + h3 * 40.0),
    cos(tt * (3.5 + 5.5 * h3) + h2 * 40.0)
  ) * amp;
  pos.y += uLag * (1.0 - e) * (0.5 + 0.5 * h4);
  pos += vec2(h4 - 0.5, h1 - 0.5) * uDensity * 3.0
    * (1.0 - smoothstep(0.5, 0.85, t));
  float grow = smoothstep(0.55, 1.0, e);
  float sizeCss = mix(uSize, uDensity * 1.3, grow);
  vCenter = home;
  vSize = sizeCss;
  vAlpha = mix(uFade, 1.0, e);
  vLod = (1.0 - e) * 1.5;
  vMerge = smoothstep(0.75, 0.97, t);
  gl_Position = vec4(
    pos.x / uRes.x * 2.0 - 1.0,
    1.0 - pos.y / uRes.y * 2.0,
    0.0,
    1.0
  );
  gl_PointSize = max(sizeCss * uDpr, 1.0);
}`;

const POINT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uContent;
uniform vec2 uRes;
uniform float uScroll;
uniform float uDocH;
in vec2 vCenter;
in float vSize;
in float vAlpha;
in float vLod;
in float vMerge;
out vec4 outColor;
void main () {
  vec2 o = gl_PointCoord - 0.5;
  vec2 sampleCss = vCenter + o * vSize;
  float texV = 1.0 - (sampleCss.y + uScroll) / max(uDocH, uRes.y);
  if (texV < 0.0 || texV > 1.0) discard;
  vec2 uv = vec2(
    clamp(sampleCss.x / uRes.x, 0.001, 0.999),
    clamp(texV, 0.001, 0.999)
  );
  vec4 tex = textureLod(uContent, uv, vLod);
  if (tex.a < 0.08) discard;
  float circle = 1.0 - smoothstep(0.25, 0.5, length(o));
  float mask = mix(circle, 1.0, vMerge);
  float a = vAlpha * mask;
  if (a < 0.01) discard;
  outColor = vec4(tex.rgb, a);
}`;

function createRowTexture(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([255, 0, 0, 255]),
  );
  return tex;
}

export function create(canvas, { photo, scrollport }) {
  const POINT = 0.68;
  const BAND = 420;
  const DENSITY = 2;
  const SIZE = 1.25;
  const SPREAD = 220;
  const GRAVITY = 0.35;
  const DRIFT = 0.7;
  const SWIRL = 60;
  const STAGGER = 0.7;
  const FADE = 0.85;
  const SETTLE = 1.2;
  const SMOOTHING = 0.6;
  return attachRuntime(canvas, {
    async setup(gl, el) {
      const photoBake = await bakePhoto(photo, el.clientWidth, el.clientHeight);
      const baked = await bakeCopy(el.clientWidth, el.clientHeight);
      return {
        photoProg: photoBake ? link(gl, QUAD_VERT, PHOTO_FRAG) : null,
        photoTex: photoBake ? createTexture(gl, photoBake.canvas) : null,
        base: link(gl, QUAD_VERT, BASE_FRAG),
        points: link(gl, POINT_VERT, POINT_FRAG),
        quad: createQuad(gl),
        pointVao: gl.createVertexArray(),
        content: createTexture(gl, baked.canvas, { mipmaps: true }),
        rowTex: createRowTexture(gl),
        docH: baked.height,
        scrollport,
        scrollSmooth: 0,
        lastScrollTop: 0,
        lag: 0,
        rowProgress: new Float32Array(0),
        rowBytes: new Uint8Array(0),
      };
    },
    frame(state, { gl, canvas, t, dt }) {
      const w = Math.max(canvas.clientWidth, 1);
      const h = Math.max(canvas.clientHeight, 1);
      const scrollTop = state.scrollport.scrollTop;
      const k = 1 - Math.exp(-dt / SMOOTHING);
      state.scrollSmooth += (scrollTop - state.scrollSmooth) * k;
      if (Math.abs(scrollTop - state.scrollSmooth) < 0.5) {
        state.scrollSmooth = scrollTop;
      }
      state.lag += scrollTop - state.lastScrollTop;
      state.lag *= Math.exp(-dt / 0.22);
      state.lag = Math.min(Math.max(state.lag, -400), 400);
      state.lastScrollTop = scrollTop;

      const density = Math.max(Math.max(DENSITY, 1), Math.sqrt((w * h) / 800000));
      const stagger = STAGGER;
      const scroll = state.scrollSmooth;
      const maxScroll = Math.max(
        state.scrollport.scrollHeight - state.scrollport.clientHeight,
        1,
      );
      const docH = Math.max(state.scrollport.scrollHeight, h);
      const docRows = Math.max(1, Math.ceil(docH / density));
      const winStart = Math.floor(scroll / density);
      const winLen = Math.ceil(h / density) + 2;
      const gridX = Math.ceil(w / density);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      function rowTarget(docRowY) {
        let line = POINT * h;
        if (maxScroll <= 1) {
          line = h + BAND;
        } else {
          const endP = Math.min(
            Math.max((scroll - (maxScroll - h * 0.5)) / (h * 0.5), 0),
            1,
          );
          line += (h + BAND - line) * endP * endP;
        }
        const vy = docRowY - scroll;
        return Math.min(Math.max((line + BAND - vy) / BAND, 0), 1);
      }

      if (state.rowProgress.length !== docRows) {
        const next = new Float32Array(docRows);
        for (let i = 0; i < docRows; i += 1) {
          next[i] = rowTarget((i + 0.5) * density);
        }
        state.rowProgress = next;
      }
      const settle = Math.max(SETTLE, 0.05);
      for (let i = 0; i < docRows; i += 1) {
        const target = rowTarget((i + 0.5) * density);
        let p = state.rowProgress[i];
        const inWin = i >= winStart - 4 && i < winStart + winLen + 4;
        if (p !== target) {
          if (!inWin) {
            p = target;
          } else if (p < target) {
            p = Math.min(p + dt / settle, target);
          } else {
            p = Math.max(p - dt / (settle * 0.6), target);
          }
          state.rowProgress[i] = p;
        }
      }

      if (state.rowBytes.length !== winLen * 4) {
        state.rowBytes = new Uint8Array(winLen * 4);
      }
      state.rowBytes.fill(255);
      const from = Math.min(Math.max(winStart, 0), docRows);
      const to = Math.min(winStart + winLen, docRows);
      for (let i = from; i < to; i += 1) {
        const o = (i - winStart) * 4;
        const v = Math.round(state.rowProgress[i] * 255);
        state.rowBytes[o] = v;
        state.rowBytes[o + 1] = v;
        state.rowBytes[o + 2] = v;
        state.rowBytes[o + 3] = 255;
      }
      gl.bindTexture(gl.TEXTURE_2D, state.rowTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        winLen,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        state.rowBytes,
      );

      gl.disable(gl.BLEND);
      gl.bindVertexArray(state.quad.vao);
      if (state.photoProg && state.photoTex) {
        gl.useProgram(state.photoProg.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, state.photoTex);
        gl.uniform1i(state.photoProg.uniforms.uPhoto, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.useProgram(state.base.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, state.content);
      gl.uniform1i(state.base.uniforms.uContent, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, state.rowTex);
      gl.uniform1i(state.base.uniforms.uRowTex, 1);
      gl.uniform2f(state.base.uniforms.uRes, w, h);
      gl.uniform1f(state.base.uniforms.uDensity, density);
      gl.uniform1f(state.base.uniforms.uRowCount, winLen);
      gl.uniform1f(state.base.uniforms.uStagger, stagger);
      gl.uniform1f(state.base.uniforms.uScroll, scroll);
      gl.uniform1f(state.base.uniforms.uWinStart, winStart);
      gl.uniform1f(state.base.uniforms.uDocH, state.docH);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(state.points.program);
      gl.bindVertexArray(state.pointVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, state.content);
      gl.uniform1i(state.points.uniforms.uContent, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, state.rowTex);
      gl.uniform1i(state.points.uniforms.uRowTex, 1);
      gl.uniform2f(state.points.uniforms.uRes, w, h);
      gl.uniform2f(state.points.uniforms.uGrid, gridX, winLen);
      gl.uniform1f(state.points.uniforms.uDensity, density);
      gl.uniform1f(state.points.uniforms.uStagger, stagger);
      gl.uniform1f(state.points.uniforms.uSpread, SPREAD);
      gl.uniform1f(state.points.uniforms.uGravity, GRAVITY);
      gl.uniform1f(state.points.uniforms.uDrift, DRIFT);
      gl.uniform1f(state.points.uniforms.uSwirl, SWIRL);
      gl.uniform1f(state.points.uniforms.uTime, t);
      gl.uniform1f(state.points.uniforms.uFade, FADE);
      gl.uniform1f(state.points.uniforms.uSize, SIZE);
      gl.uniform1f(state.points.uniforms.uDpr, dpr);
      gl.uniform1f(state.points.uniforms.uLag, state.lag);
      gl.uniform1f(state.points.uniforms.uScroll, scroll);
      gl.uniform1f(state.points.uniforms.uWinStart, winStart);
      gl.uniform1f(state.points.uniforms.uDocH, state.docH);
      gl.drawArrays(gl.POINTS, 0, gridX * winLen);
      gl.disable(gl.BLEND);
    },
    dispose(state, gl) {
      gl.deleteTexture(state.content);
      gl.deleteTexture(state.rowTex);
      if (state.photoTex) gl.deleteTexture(state.photoTex);
      if (state.photoProg) {
        gl.deleteProgram(state.photoProg.program);
        gl.deleteShader(state.photoProg.vs);
        gl.deleteShader(state.photoProg.fs);
      }
      gl.deleteProgram(state.base.program);
      gl.deleteShader(state.base.vs);
      gl.deleteShader(state.base.fs);
      gl.deleteProgram(state.points.program);
      gl.deleteShader(state.points.vs);
      gl.deleteShader(state.points.fs);
      gl.deleteBuffer(state.quad.buf);
      gl.deleteVertexArray(state.quad.vao);
      gl.deleteVertexArray(state.pointVao);
    },
  });
}
