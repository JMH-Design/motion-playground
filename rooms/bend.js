import {
  DEFAULT_PALETTE,
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

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform float uScroll;
uniform float uZone;
uniform float uAngle;
uniform float uPersp;
uniform float uDir;
uniform float uTopAmt;
uniform float uBotAmt;
uniform float uMaxX;
uniform float uPxY;
uniform float uPxX;
uniform vec3 uBg;
uniform vec3 uAccent;
uniform float uTiltX;
uniform float uTiltY;
uniform float uPhi;
uniform float uRound;

vec3 foldEdge (float sy, float amt) {
  float yf = 1.0 - uZone;
  if (amt < 1e-4) return vec3(sy, 0.0, 1.0);
  float theta = uAngle * amt;
  if (uRound < 1e-4) {
    float s = sin(theta) * uDir;
    float c = cos(theta);
    float denom = max(c * uPersp + s * (0.5 - sy), 1e-5);
    float tRaw = uPersp * (sy - yf) / denom;
    float t = clamp(tRaw, 0.0, uZone);
    float z = max(t * s, -0.85 * uPersp);
    float alpha = 1.0 - smoothstep(uZone, uZone + 2.0 * uPxY, tRaw);
    return vec3(yf + t, z, alpha);
  }
  if (sy <= yf) return vec3(sy, 0.0, 1.0);
  float R = min(uRound, uZone);
  float r = R / theta;
  float ca = cos(theta);
  float sa = sin(theta);
  float yA = r * sa;
  float zA = r * (1.0 - ca);
  float prevSy = yf;
  float prevZ = 0.0;
  float prevU = 0.0;
  float bestU = -1.0;
  float bestZ = 0.0;
  float maxSy = yf;
  float du = uZone / 40.0;
  for (int i = 1; i <= 40; i++) {
    float u = du * float(i);
    float Y;
    float Zm;
    if (u <= R) {
      float a = u / r;
      Y = r * sin(a);
      Zm = r * (1.0 - cos(a));
    } else {
      Y = yA + (u - R) * ca;
      Zm = zA + (u - R) * sa;
    }
    Y += yf;
    float Z = max(Zm * uDir, -0.85 * uPersp);
    float scr = 0.5 + (Y - 0.5) * uPersp / (uPersp + Z);
    if ((prevSy - sy) * (scr - sy) <= 0.0 && abs(scr - prevSy) > 1e-7) {
      float f = clamp((sy - prevSy) / (scr - prevSy), 0.0, 1.0);
      bestU = mix(prevU, u, f);
      bestZ = mix(prevZ, Z, f);
      if (uDir > 0.0) break;
    }
    maxSy = max(maxSy, scr);
    prevSy = scr;
    prevZ = Z;
    prevU = u;
  }
  if (bestU < 0.0) {
    float alpha = 1.0 - smoothstep(maxSy - uPxY, maxSy + uPxY, sy);
    return vec3(1.0, prevZ, alpha);
  }
  return vec3(yf + bestU, bestZ, 1.0);
}

vec2 tipPlane (float sy, float phi) {
  float s = sin(phi);
  float c = cos(phi);
  float denom = max(c * uPersp + s * (sy - 0.5), 1e-4);
  float t = uPersp * (1.0 - sy) / denom;
  return vec2(1.0 - t, t * s);
}

void main () {
  vec2 uv = vUv;
  float cx = uMaxX * 0.5;
  float zSum = 0.0;

  if (abs(uPhi) > 1e-4) {
    if (uPhi > 0.0) {
      vec2 r = tipPlane(uv.y, uPhi);
      uv.y = r.x;
      zSum += r.y;
    } else {
      vec2 r = tipPlane(1.0 - uv.y, -uPhi);
      uv.y = 1.0 - r.x;
      zSum += r.y;
    }
  }

  float zG = uTiltX * (uv.x - cx) + uTiltY * (uv.y - 0.5);
  zSum += zG;
  uv.y = 0.5 + (uv.y - 0.5) * (uPersp + zG) / uPersp;

  float inTop = step(1.0 - uZone, uv.y);
  float inBot = step(uv.y, uZone);

  vec3 top = foldEdge(uv.y, uTopAmt);
  vec3 bot = foldEdge(1.0 - uv.y, uBotAmt);

  float srcY = uv.y;
  srcY = mix(srcY, top.x, inTop);
  srcY = mix(srcY, 1.0 - bot.x, inBot);

  zSum += inTop * top.y + inBot * bot.y;
  float alpha = mix(1.0, top.z, inTop) * mix(1.0, bot.z, inBot);

  float srcX = cx + (uv.x - cx) * (uPersp + zSum) / uPersp;

  alpha *= smoothstep(-2.0 * uPxX, 0.0, srcX);
  alpha *= 1.0 - smoothstep(uMaxX, uMaxX + 2.0 * uPxX, srcX);
  alpha *= smoothstep(-2.0 * uPxY, 0.0, srcY);
  alpha *= 1.0 - smoothstep(1.0, 1.0 + 2.0 * uPxY, srcY);

  float viewFromTop = 1.0 - clamp(srcY, 0.0, 1.0);
  float docFromTop = uScroll + viewFromTop;
  float texV = fract(1.0 - docFromTop);
  vec3 bg = uBg;
  if (srcX < 0.0 || srcX > 1.0) {
    outColor = vec4(bg, 1.0);
    return;
  }
  vec3 col = texture(uContent, vec2(clamp(srcX, 0.001, 0.999), clamp(texV, 0.001, 0.999))).rgb;
  float crease = smoothstep(0.0, 0.12, abs(zSum));
  col = mix(col, mix(col, uAccent, 0.28), crease);
  outColor = vec4(mix(bg, col, alpha), 1.0);
}`;

const ZONE = 360;
const ANGLE = 70;
const ROUNDING = 320;
const PERSPECTIVE = 700;
const EASE = 240;
const SMOOTHING = 0.4;
const TUMBLE = 1.5;
const TILT = 0.5;

export function create(canvas, { name, verb, photo, scrollport }) {
  const pages = 5;
  return attachRuntime(canvas, {
    async setup(gl, el) {
      const photoBake = await bakePhoto(photo, el.clientWidth, el.clientHeight);
      const baked =
        photoBake?.canvas ??
        (await bakeType(el.clientWidth, el.clientHeight, name || "", verb || "", pages, {
          frame: true,
        }));
      const over = { value: 0 };
      const onWheel = (event) => {
        const max = Math.max(scrollport.scrollHeight - scrollport.clientHeight, 1);
        const st = scrollport.scrollTop;
        if (event.deltaY > 0 && st >= max - 1) {
          over.value = Math.min(over.value + event.deltaY, 900);
        } else if (event.deltaY < 0 && st <= 1) {
          over.value = Math.max(over.value + event.deltaY, -900);
        }
      };
      scrollport.addEventListener("wheel", onWheel, { passive: true });
      return {
        linked: link(gl, VERT, FRAG),
        quad: createQuad(gl),
        content: createTexture(gl, baked),
        pages,
        scrollport,
        palette: photoBake?.palette ?? DEFAULT_PALETTE,
        photo: Boolean(photoBake),
        botCurrent: 0,
        phiCurrent: 0,
        tiltX: 0,
        tiltY: 0,
        over,
        onWheel,
      };
    },
    frame(state, { gl, canvas, dt, pointer }) {
      const h = Math.max(canvas.clientHeight, 1);
      const w = Math.max(canvas.clientWidth, 1);
      const max = Math.max(state.scrollport.scrollHeight - state.scrollport.clientHeight, 1);
      const scrollTop = state.scrollport.scrollTop;
      const ramp = (v) => {
        const x = Math.min(Math.max(v / EASE, 0), 1);
        return x * x * (3 - 2 * x);
      };
      const botTarget = max > 1 ? ramp(max - scrollTop) : 0;
      const k = 1 - Math.exp(-dt / Math.max(SMOOTHING, 1e-4));
      state.botCurrent += (botTarget - state.botCurrent) * k;
      if (Math.abs(botTarget - state.botCurrent) < 0.001) state.botCurrent = botTarget;

      state.over.value *= Math.exp(-dt / 0.22);
      if (Math.abs(state.over.value) < 0.5) state.over.value = 0;
      const phiTarget = Math.tanh(state.over.value / 500) * 0.4 * TUMBLE;
      state.phiCurrent += (phiTarget - state.phiCurrent) * Math.min(dt / 0.09, 1);
      if (phiTarget === 0 && Math.abs(state.phiCurrent) < 1e-4) state.phiCurrent = 0;

      const amp = TILT * 0.14;
      const tiltXTarget = -(pointer.x - 0.5) * amp * pointer.active;
      const tiltYTarget = -(0.5 - pointer.y) * amp * pointer.active;
      const kT = Math.min(dt / 0.15, 1);
      state.tiltX += (tiltXTarget - state.tiltX) * kT;
      state.tiltY += (tiltYTarget - state.tiltY) * kT;

      const zoneFrac = Math.min(Math.max(ZONE, 8) / h, 0.78);
      gl.useProgram(state.linked.program);
      gl.bindVertexArray(state.quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, state.content);
      gl.uniform1i(state.linked.uniforms.uContent, 0);
      gl.uniform1f(state.linked.uniforms.uScroll, scrollTop / h);
      setColor3(gl, state.linked.uniforms.uAccent, state.palette.accent);
      setColor3(
        gl,
        state.linked.uniforms.uBg,
        state.photo ? state.palette.mean : [0.039, 0.039, 0.039],
      );
      gl.uniform1f(state.linked.uniforms.uZone, zoneFrac);
      gl.uniform1f(state.linked.uniforms.uAngle, Math.min(Math.max(ANGLE, 1), 160) * (Math.PI / 180));
      gl.uniform1f(state.linked.uniforms.uPersp, Math.max(PERSPECTIVE, 50) / h);
      gl.uniform1f(state.linked.uniforms.uDir, -1);
      gl.uniform1f(state.linked.uniforms.uTopAmt, 0);
      gl.uniform1f(state.linked.uniforms.uBotAmt, state.botCurrent);
      gl.uniform1f(state.linked.uniforms.uMaxX, 1);
      gl.uniform1f(state.linked.uniforms.uPxY, 1.5 / h);
      gl.uniform1f(state.linked.uniforms.uPxX, 1.5 / w);
      gl.uniform1f(state.linked.uniforms.uTiltX, state.tiltX);
      gl.uniform1f(state.linked.uniforms.uTiltY, state.tiltY);
      gl.uniform1f(state.linked.uniforms.uPhi, state.phiCurrent);
      gl.uniform1f(
        state.linked.uniforms.uRound,
        Math.min(Math.max(ROUNDING, 0) / h, zoneFrac),
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose(state, gl) {
      state.scrollport.removeEventListener("wheel", state.onWheel);
      gl.deleteTexture(state.content);
      gl.deleteProgram(state.linked.program);
      gl.deleteShader(state.linked.vs);
      gl.deleteShader(state.linked.fs);
      gl.deleteBuffer(state.quad.buf);
      gl.deleteVertexArray(state.quad.vao);
    },
  });
}
