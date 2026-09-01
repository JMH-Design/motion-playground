import {
  attachRuntime,
  bakePhoto,
  bakeType,
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

const TILE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTrail;
uniform int uTrailCount;
uniform float uWorldPerTile;
uniform float uWaveSpeed;
uniform float uFrequency;
uniform float uWaveWidth;
uniform float uFadeTime;
uniform float uAmplitude;
uniform float uJitter;
uniform float uMaxLift;

vec2 hash2 (vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123) - 0.5;
}

void main () {
  vec2 tile = floor(gl_FragCoord.xy);
  vec2 world = (tile + 0.5) * uWorldPerTile + hash2(tile) * uJitter * 0.12;

  float waveHeight = 0.0;
  float totalWeight = 0.0;

  for (int i = 0; i < 64; i++) {
    if (i >= uTrailCount) break;
    vec4 td = texelFetch(uTrail, ivec2(i, 0), 0);
    vec2 delta = world - td.xy;
    float dist = length(delta);
    float relDist = dist - uWaveSpeed * td.z;
    float window = exp(-(relDist * relDist) / (uWaveWidth * uWaveWidth));
    float fade = exp(-td.z / uFadeTime);
    float atten = 1.0 / (1.0 + dist * 3.0);
    float weight = fade * window * atten * td.w;
    waveHeight += weight * cos(uFrequency * relDist);
    totalWeight += weight;
  }

  float lift = clamp(
    waveHeight / max(totalWeight, 1.0) * uAmplitude, -uMaxLift, uMaxLift
  );
  outColor = vec4(lift * 0.5 + 0.5, 0.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uTiles;
uniform vec2 uResolution;
uniform ivec2 uGridTiles;
uniform float uTilePx;
uniform float uGapPx;
uniform float uCornerPx;
uniform float uLiftPx;
uniform float uPersp;
uniform vec2 uVanish;
uniform float uShading;
uniform vec3 uTint;
uniform float uTintStrength;

float tileLift (ivec2 idx) {
  idx = clamp(idx, ivec2(0), uGridTiles - 1);
  return texelFetch(uTiles, idx, 0).r * 2.0 - 1.0;
}

float roundedBox (vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float tileSd (vec2 w, ivec2 idx, float halfSize) {
  vec2 center = (vec2(idx) + 0.5) * uTilePx;
  return roundedBox(w - center, vec2(halfSize), min(uCornerPx, halfSize));
}

vec2 unproject (vec2 p, float z) {
  return uVanish + (p - uVanish) * (uPersp - z) / uPersp;
}

void main () {
  vec2 pos = vUv * uResolution;
  float halfSize = uTilePx * 0.5 - uGapPx * 0.5;

  float bestZ = -1e6;
  float edgeSd = 1.0;
  ivec2 bestIdx = ivec2(-1);
  vec2 bestW = pos;
  float bestLift = 0.0;
  bool bestIsWall = false;
  vec2 wallN = vec2(0.0);
  ivec2 lastIdx = ivec2(-9999);

  for (int k = 0; k < 8; k++) {
    float probeZ = (float(k) / 3.5 - 1.0) * uLiftPx;
    ivec2 idx = clamp(
      ivec2(floor(unproject(pos, probeZ) / uTilePx)),
      ivec2(0), uGridTiles - 1
    );
    if (all(equal(idx, lastIdx))) continue;
    lastIdx = idx;

    float lift = tileLift(idx);
    float h = lift * uLiftPx;
    if (h <= bestZ) continue;

    vec2 wh = unproject(pos, h);
    float sdTop = tileSd(wh, idx, halfSize);

    if (sdTop < 0.75) {
      bestZ = h;
      edgeSd = sdTop;
      bestIdx = idx;
      bestW = wh;
      bestLift = lift;
      bestIsWall = false;
    } else if (h > 0.0) {
      float sd0 = tileSd(pos, idx, halfSize);
      if (sd0 < 0.75) {
        float za = 0.0;
        float zb = h;
        for (int r = 0; r < 3; r++) {
          float zm = (za + zb) * 0.5;
          float sm = tileSd(unproject(pos, zm), idx, halfSize);
          if (sm < 0.0) { za = zm; } else { zb = zm; }
        }
        float zStar = (za + zb) * 0.5;
        if (zStar > bestZ) {
          vec2 wz = unproject(pos, zStar);
          vec2 e = vec2(0.75, 0.0);
          wallN = normalize(vec2(
            tileSd(wz + e.xy, idx, halfSize) - tileSd(wz - e.xy, idx, halfSize),
            tileSd(wz + e.yx, idx, halfSize) - tileSd(wz - e.yx, idx, halfSize)
          ) + 1e-5);
          bestZ = zStar;
          edgeSd = sd0;
          bestIdx = idx;
          bestW = wz;
          bestLift = lift;
          bestIsWall = true;
        }
      }
    }
  }

  if (bestIdx.x < 0) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float mask = 1.0 - smoothstep(-0.75, 0.75, edgeSd);
  if (mask <= 0.0) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec2 tileOrigin = vec2(bestIdx) * uTilePx;
  vec2 samplePos = clamp(bestW, tileOrigin + 0.5, tileOrigin + uTilePx - 0.5);
  vec2 sampleUv = samplePos / uResolution;
  vec3 content = texture(uContent, clamp(sampleUv, 0.001, 0.999)).rgb;

  float t = clamp(bestLift, 0.0, 1.0) * uTintStrength;
  vec3 col;
  if (bestIsWall) {
    vec2 lightDir = normalize(vec2(-0.55, 0.8));
    float facing = dot(wallN, lightDir);
    float shade = 1.0 - (0.5 - 0.32 * facing) * uShading;
    col = content * shade;
  } else {
    float gx = tileLift(bestIdx + ivec2(1, 0)) - tileLift(bestIdx - ivec2(1, 0));
    float gy = tileLift(bestIdx + ivec2(0, 1)) - tileLift(bestIdx - ivec2(0, 1));
    float shade = (gy - gx) * 0.25 * uShading;
    shade += clamp(bestLift, -1.0, 1.0) * 0.1 * uShading;
    col = content * (1.0 + shade * 0.85) + shade * 0.12;
  }
  col = mix(col, uTint, t);
  outColor = vec4(col * mask, 1.0);
}`;

const TILE_SIZE = 150;
const GAP = 0;
const CORNER_RADIUS = 16;
const AMPLITUDE = 4.2;
const WAVE_SPEED = 0.22;
const FREQUENCY = 12;
const WAVE_WIDTH = 0.14;
const FADE_TIME = 0.2;
const MAX_LIFT = 1;
const JITTER = 0;
const LIFT_HEIGHT = 60;
const PERSPECTIVE = 700;
const TILT = 1;
const SHADING = 0.05;
const TINT_STRENGTH = 0.2;
const TINT = [198 / 255, 165 / 255, 133 / 255];
const MAX_TRAIL = 64;
const TRAIL_SPACING = 0.03;

function createTrailTexture(gl) {
  const data = new Float32Array(MAX_TRAIL * 4);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    MAX_TRAIL,
    1,
    0,
    gl.RGBA,
    gl.FLOAT,
    data,
  );
  return { tex, data };
}

function ensureTileTarget(gl, state, width, height, tilePx) {
  const nx = Math.max(1, Math.ceil(width / tilePx));
  const ny = Math.max(1, Math.ceil(height / tilePx));
  if (state.tileTex && nx === state.tilesX && ny === state.tilesY) return;
  if (state.tileTex) gl.deleteTexture(state.tileTex);
  if (state.tileFbo) gl.deleteFramebuffer(state.tileFbo);
  state.tilesX = nx;
  state.tilesY = ny;
  state.tileTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, state.tileTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nx, ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  state.tileFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, state.tileFbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    state.tileTex,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

export function create(canvas, { name, verb, photo }) {
  return attachRuntime(canvas, {
    async setup(gl, el) {
      const photoBake = await bakePhoto(photo, el.clientWidth, el.clientHeight);
      const baked =
        photoBake?.canvas ??
        (await bakeType(el.clientWidth, el.clientHeight, name || "", verb || ""));
      const trail = createTrailTexture(gl);
      return {
        tiles: link(gl, VERT, TILE_FRAG),
        main: link(gl, VERT, FRAG),
        quad: createQuad(gl),
        content: createTexture(gl, baked),
        trailTex: trail.tex,
        trailData: trail.data,
        trail: [],
        lastPoint: null,
        vanishX: 0.5,
        vanishY: 0.5,
        vanishTargetX: 0.5,
        vanishTargetY: 0.5,
        tileTex: null,
        tileFbo: null,
        tilesX: 0,
        tilesY: 0,
        tint: TINT,
      };
    },
    frame(state, { gl, canvas, dt, pointer }) {
      const cssW = Math.max(canvas.clientWidth, 1);
      const cssH = Math.max(canvas.clientHeight, 1);
      const width = canvas.width;
      const height = canvas.height;
      const scale = width / cssW;
      const tilePx = Math.max(TILE_SIZE, 8) * scale;
      ensureTileTarget(gl, state, width, height, tilePx);

      const aspect = cssW / cssH;
      const x = pointer.x * aspect;
      const y = 1 - pointer.y;
      if (pointer.active > 0.05) {
        state.vanishTargetX = pointer.x;
        state.vanishTargetY = pointer.y;
        let distDelta = 0.2;
        if (state.lastPoint) {
          distDelta = Math.hypot(x - state.lastPoint.x, y - state.lastPoint.y);
        }
        if (!state.lastPoint || distDelta >= TRAIL_SPACING) {
          if (state.trail.length >= MAX_TRAIL) state.trail.shift();
          state.trail.push({
            x,
            y,
            age: 0,
            strength: Math.min(Math.max(distDelta * 6, 0.25), 1.2),
          });
          state.lastPoint = { x, y };
        }
      } else {
        state.vanishTargetX = 0.5;
        state.vanishTargetY = 0.5;
        state.lastPoint = null;
      }

      const expiry = Math.max(FADE_TIME, 0.1) * 4;
      for (let i = state.trail.length - 1; i >= 0; i -= 1) {
        state.trail[i].age += dt;
        if (state.trail[i].age > expiry) state.trail.splice(i, 1);
      }
      state.trailData.fill(0);
      const trailCount = Math.min(state.trail.length, MAX_TRAIL);
      for (let i = 0; i < trailCount; i += 1) {
        const o = i * 4;
        state.trailData[o] = state.trail[i].x;
        state.trailData[o + 1] = state.trail[i].y;
        state.trailData[o + 2] = state.trail[i].age;
        state.trailData[o + 3] = state.trail[i].strength;
      }
      gl.bindTexture(gl.TEXTURE_2D, state.trailTex);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        MAX_TRAIL,
        1,
        gl.RGBA,
        gl.FLOAT,
        state.trailData,
      );

      const ease = 1 - Math.exp(-dt * 4);
      state.vanishX += (state.vanishTargetX - state.vanishX) * ease;
      state.vanishY += (state.vanishTargetY - state.vanishY) * ease;

      gl.bindVertexArray(state.quad.vao);
      gl.useProgram(state.tiles.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, state.trailTex);
      gl.uniform1i(state.tiles.uniforms.uTrail, 0);
      gl.uniform1i(state.tiles.uniforms.uTrailCount, trailCount);
      gl.uniform1f(state.tiles.uniforms.uWorldPerTile, tilePx / height);
      gl.uniform1f(state.tiles.uniforms.uWaveSpeed, WAVE_SPEED);
      gl.uniform1f(state.tiles.uniforms.uFrequency, FREQUENCY);
      gl.uniform1f(state.tiles.uniforms.uWaveWidth, WAVE_WIDTH);
      gl.uniform1f(state.tiles.uniforms.uFadeTime, FADE_TIME);
      gl.uniform1f(state.tiles.uniforms.uAmplitude, AMPLITUDE);
      gl.uniform1f(state.tiles.uniforms.uJitter, JITTER);
      gl.uniform1f(state.tiles.uniforms.uMaxLift, MAX_LIFT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, state.tileFbo);
      gl.viewport(0, 0, state.tilesX, state.tilesY);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.useProgram(state.main.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, state.content);
      gl.uniform1i(state.main.uniforms.uContent, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, state.tileTex);
      gl.uniform1i(state.main.uniforms.uTiles, 1);
      gl.uniform2f(state.main.uniforms.uResolution, width, height);
      gl.uniform2i(state.main.uniforms.uGridTiles, state.tilesX, state.tilesY);
      gl.uniform1f(state.main.uniforms.uTilePx, tilePx);
      gl.uniform1f(state.main.uniforms.uGapPx, GAP * scale);
      gl.uniform1f(state.main.uniforms.uCornerPx, CORNER_RADIUS * scale);
      gl.uniform1f(state.main.uniforms.uLiftPx, LIFT_HEIGHT * scale);
      gl.uniform1f(state.main.uniforms.uPersp, PERSPECTIVE * scale);
      gl.uniform2f(
        state.main.uniforms.uVanish,
        (0.5 + (state.vanishX - 0.5) * TILT) * width,
        (0.5 + (0.5 - state.vanishY) * TILT) * height,
      );
      gl.uniform1f(state.main.uniforms.uShading, SHADING);
      setColor3(gl, state.main.uniforms.uTint, state.tint);
      gl.uniform1f(state.main.uniforms.uTintStrength, TINT_STRENGTH);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose(state, gl) {
      gl.deleteTexture(state.content);
      gl.deleteTexture(state.trailTex);
      if (state.tileTex) gl.deleteTexture(state.tileTex);
      if (state.tileFbo) gl.deleteFramebuffer(state.tileFbo);
      for (const pass of [state.tiles, state.main]) {
        gl.deleteProgram(pass.program);
        gl.deleteShader(pass.vs);
        gl.deleteShader(pass.fs);
      }
      gl.deleteBuffer(state.quad.buf);
      gl.deleteVertexArray(state.quad.vao);
    },
  });
}
