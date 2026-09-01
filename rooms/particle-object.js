import {
  DEFAULT_PALETTE,
  bakePhoto,
  createGL,
  createQuad,
  createTexture,
  link,
  prefersReducedMotion,
  resizeCanvas,
  setColor3,
} from "./shared.js";

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aSeed;
uniform mat4 uViewProj;
uniform float uSize;
uniform float uDpr;
uniform float uTime;
uniform float uDrift;
out float vSeed;
void main () {
  float t = uTime + aSeed * 39.0;
  vec3 p = aPos + uDrift * 0.005 * vec3(
    sin(t * 1.7 + aSeed * 61.0),
    cos(t * 1.3 + aSeed * 23.0),
    sin(t * 2.3 + aSeed * 47.0));
  vec4 clip = uViewProj * vec4(p, 1.0);
  gl_Position = clip;
  gl_PointSize = clamp(uSize * uDpr / max(clip.w, 0.2), 1.0, 56.0);
  vSeed = aSeed;
}`;

const FRAG = `#version 300 es
precision highp float;
in float vSeed;
uniform vec3 uAccent;
uniform vec3 uHighlight;
out vec4 outColor;
void main () {
  vec2 c = gl_PointCoord - 0.5;
  float a = 1.0 - smoothstep(0.16, 0.46, dot(c, c) * 4.0);
  if (a < 0.08) discard;
  vec3 col = mix(uAccent, uHighlight, fract(vSeed * 7.13));
  outColor = vec4(col, a);
}`;

const QUAD_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const BG_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPhoto;
out vec4 outColor;
void main () {
  outColor = vec4(texture(uPhoto, vUv).rgb, 1.0);
}`;

const CAM_DIST = 2.15;
const FOV = 18;
const TOUCH_LIFT_PX = 44;
const DESKTOP = {
  radius: 400,
  strength: 2,
  swirl: 1.4,
  spring: 0.85,
  drift: 1.6,
  size: 9.2,
  count: 54000,
};
const TOUCH = {
  radius: 220,
  strength: 2.1,
  swirl: 1.1,
  spring: 0.4,
  drift: 1.6,
  size: 11.5,
  count: 10000,
};

function isCoarsePointer() {
  return window.matchMedia("(pointer: coarse)").matches;
}

function icosahedronFaces() {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const verts = raw.map((v) => {
    const len = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / len, v[1] / len, v[2] / len];
  });
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  return { verts, faces };
}

function sampleCloud(count) {
  const { verts, faces } = icosahedronFaces();
  const homes = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const face = faces[i % faces.length];
    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;
    const a = verts[face[0]];
    const b = verts[face[1]];
    const c = verts[face[2]];
    let x = a[0] * w + b[0] * u + c[0] * v;
    let y = a[1] * w + b[1] * u + c[1] * v;
    let z = a[2] * w + b[2] * u + c[2] * v;
    const len = Math.hypot(x, y, z) || 1;
    homes[i * 3] = x / len;
    homes[i * 3 + 1] = y / len;
    homes[i * 3 + 2] = z / len;
    seeds[i] = Math.random();
  }
  return { homes, seeds };
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan((fov * Math.PI) / 360);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

function cameraBasis(eye, target = [0, 0, 0]) {
  const zx = eye[0] - target[0];
  const zy = eye[1] - target[1];
  const zz = eye[2] - target[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  const back = [zx / zl, zy / zl, zz / zl];
  let xx = back[2];
  let xy = 0;
  let xz = -back[0];
  const xl = Math.hypot(xx, xy, xz) || 1;
  const right = [xx / xl, xy / xl, xz / xl];
  const up = [
    back[1] * right[2] - back[2] * right[1],
    back[2] * right[0] - back[0] * right[2],
    back[0] * right[1] - back[1] * right[0],
  ];
  return {
    back,
    right,
    up,
    forward: [-back[0], -back[1], -back[2]],
  };
}

function lookAt(eye, target) {
  const { back, right, up } = cameraBasis(eye, target);
  const m = new Float32Array(16);
  m[0] = right[0];
  m[4] = right[1];
  m[8] = right[2];
  m[12] = -(right[0] * eye[0] + right[1] * eye[1] + right[2] * eye[2]);
  m[1] = up[0];
  m[5] = up[1];
  m[9] = up[2];
  m[13] = -(up[0] * eye[0] + up[1] * eye[1] + up[2] * eye[2]);
  m[2] = back[0];
  m[6] = back[1];
  m[10] = back[2];
  m[14] = -(back[0] * eye[0] + back[1] * eye[1] + back[2] * eye[2]);
  m[15] = 1;
  return m;
}

function liftColor(rgb, minLum = 0.62) {
  const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  if (lum >= minLum) return rgb;
  if (lum < 1e-4) return [0.93, 0.91, 0.86];
  const k = minLum / lum;
  return [Math.min(rgb[0] * k, 1), Math.min(rgb[1] * k, 1), Math.min(rgb[2] * k, 1)];
}

function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function visiblePalette(palette) {
  const ink = [0.95, 0.93, 0.88];
  return {
    accent: liftColor(mixRgb(palette.accent, ink, 0.45), 0.68),
    highlight: liftColor(mixRgb(palette.highlight, [1, 1, 1], 0.35), 0.82),
  };
}

function mul4(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

export function create(canvas, { photo } = {}) {
  const reduced = prefersReducedMotion();
  const cfg = isCoarsePointer() ? TOUCH : DESKTOP;
  const gl = createGL(canvas);
  if (!gl) return { destroy() {}, noWebGL: true };

  const count = cfg.count;
  const { homes, seeds } = sampleCloud(count);
  const positions = homes.slice();
  const velocities = new Float32Array(count * 3);

  const linked = link(gl, VERT, FRAG);
  if (!linked) return { destroy() {}, noWebGL: true };
  const { program, vs, fs } = linked;
  const uViewProj = linked.uniforms.uViewProj;
  const uSize = linked.uniforms.uSize;
  const uDpr = linked.uniforms.uDpr;
  const uTime = linked.uniforms.uTime;
  const uDrift = linked.uniforms.uDrift;
  const uAccent = linked.uniforms.uAccent;
  const uHighlight = linked.uniforms.uHighlight;

  const bg = link(gl, QUAD_VERT, BG_FRAG);
  const quad = createQuad(gl);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const seedBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

  const host = canvas.parentElement ?? canvas;
  const pointer = { x: 0.5, y: 0.5, active: false, type: "mouse" };
  let pointerSpeed = 0;
  let shoveX = 0;
  let shoveY = 0;
  let lastPointerTime = 0;
  let elapsed = 0;
  let raf = 0;
  let last = performance.now();
  let destroyed = false;
  let visible = document.visibilityState === "visible";
  let photoTex = null;
  let palette = visiblePalette(DEFAULT_PALETTE);
  const prevTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = "none";

  const ring = document.createElement("div");
  ring.className = "touch-ring";
  ring.hidden = true;
  host.appendChild(ring);

  function isChrome(event) {
    return Boolean(event.target?.closest?.(".room-close, .controls"));
  }

  function hideRing() {
    ring.hidden = true;
  }

  function placeRing(clientX, clientY) {
    const rect = host.getBoundingClientRect();
    ring.style.left = `${clientX - rect.left}px`;
    ring.style.top = `${clientY - rect.top}px`;
    ring.hidden = false;
  }

  function readPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    let px = event.clientX - rect.left;
    let py = event.clientY - rect.top;
    if (event.pointerType === "touch") py -= TOUCH_LIFT_PX;
    return {
      x: px / width,
      y: py / height,
      width,
      height,
    };
  }

  function onPointerDown(event) {
    if (reduced || isChrome(event)) return;
    if (event.pointerType === "mouse") return;
    const next = readPointer(event);
    pointer.x = next.x;
    pointer.y = next.y;
    pointer.type = event.pointerType;
    pointer.active = true;
    lastPointerTime = performance.now();
    pointerSpeed = 0;
    shoveX = 0;
    shoveY = 0;
    placeRing(event.clientX, event.clientY - TOUCH_LIFT_PX);
    try {
      navigator.vibrate?.(10);
    } catch {
      /* ignore */
    }
  }

  function onMove(event) {
    if (reduced || isChrome(event)) return;
    if (event.pointerType !== "mouse" && !pointer.active) return;
    const next = readPointer(event);
    const now = performance.now();
    if (pointer.active && lastPointerTime) {
      const moveDt = Math.max((now - lastPointerTime) / 1000, 1e-4);
      const dx = (next.x - pointer.x) * next.width;
      const dy = (next.y - pointer.y) * next.height;
      const speed = Math.hypot(dx, dy) / moveDt;
      pointerSpeed += (speed - pointerSpeed) * 0.35;
      shoveX = dx / moveDt;
      shoveY = dy / moveDt;
    }
    pointer.x = next.x;
    pointer.y = next.y;
    pointer.type = event.pointerType;
    lastPointerTime = now;
    pointer.active = true;
    if (event.pointerType === "touch" || event.pointerType === "pen") {
      placeRing(event.clientX, event.clientY - (event.pointerType === "touch" ? TOUCH_LIFT_PX : 0));
    } else {
      hideRing();
    }
  }

  function onPointerUp(event) {
    if (event.pointerType === "mouse") return;
    pointer.active = false;
    pointerSpeed = 0;
    shoveX = 0;
    shoveY = 0;
    lastPointerTime = 0;
    hideRing();
  }

  function onLeave() {
    pointer.active = false;
    pointerSpeed = 0;
    shoveX = 0;
    shoveY = 0;
    hideRing();
  }

  function onVisibility() {
    visible = document.visibilityState === "visible";
    if (visible) loop();
  }

  if (!reduced) {
    host.addEventListener("pointerdown", onPointerDown, { passive: true });
    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerup", onPointerUp, { passive: true });
    host.addEventListener("pointerleave", onLeave, { passive: true });
    host.addEventListener("pointercancel", onPointerUp, { passive: true });
  }
  document.addEventListener("visibilitychange", onVisibility);
  const observer = new ResizeObserver(() => {});
  observer.observe(canvas);

  function simulate(dt, width, height, eye) {
    pointerSpeed *= Math.exp(-3 * dt);
    const tanHalf = Math.tan((FOV * Math.PI) / 360);
    const aspect = width / Math.max(height, 1);
    const { right, up, forward } = cameraBasis(eye);
    const camDist = Math.hypot(eye[0], eye[1], eye[2]) || CAM_DIST;
    const worldPerPx = (2 * camDist * tanHalf) / Math.max(height, 1);
    const localRadius = cfg.radius * worldPerPx;
    const r2max = localRadius * localRadius;
    const ox = eye[0];
    const oy = eye[1];
    const oz = eye[2];
    const ndcX = pointer.x * 2 - 1;
    const ndcY = 1 - pointer.y * 2;
    let dx = right[0] * (ndcX * aspect * tanHalf) + up[0] * (ndcY * tanHalf) + forward[0];
    let dy = right[1] * (ndcX * aspect * tanHalf) + up[1] * (ndcY * tanHalf) + forward[1];
    let dz = right[2] * (ndcX * aspect * tanHalf) + up[2] * (ndcY * tanHalf) + forward[2];
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl;
    dy /= dl;
    dz /= dl;
    const pushAccel = 26 * cfg.strength;
    const shove = Math.min(pointerSpeed / 900, 2) * 14 * cfg.strength;
    const sl = Math.hypot(shoveX, shoveY) || 1;
    const sRight = (shoveX / sl) * shove;
    const sUp = (-shoveY / sl) * shove;
    const sx = right[0] * sRight + up[0] * sUp;
    const sy = right[1] * sRight + up[1] * sUp;
    const sz = right[2] * sRight + up[2] * sUp;
    const stiff = 60 * cfg.spring;
    const damp = Math.exp(-7.2 * dt);

    for (let i = 0; i < count; i += 1) {
      const ix = i * 3;
      let x = positions[ix];
      let y = positions[ix + 1];
      let z = positions[ix + 2];
      let vx = velocities[ix];
      let vy = velocities[ix + 1];
      let vz = velocities[ix + 2];
      if (pointer.active && cfg.strength > 0) {
        const wx = x - ox;
        const wy = y - oy;
        const wz = z - oz;
        const t = Math.max(wx * dx + wy * dy + wz * dz, 0);
        let rx = wx - dx * t;
        let ry = wy - dy * t;
        let rz = wz - dz * t;
        const dist2 = rx * rx + ry * ry + rz * rz;
        if (dist2 < r2max) {
          const dist = Math.sqrt(dist2);
          const inv = 1 / Math.max(dist, 1e-5);
          rx *= inv;
          ry *= inv;
          rz *= inv;
          const fall = 1 - dist / localRadius;
          const f = fall * fall * dt;
          const tx = dy * rz - dz * ry;
          const ty = dz * rx - dx * rz;
          const tz = dx * ry - dy * rx;
          vx += (rx + tx * cfg.swirl) * pushAccel * f + sx * f;
          vy += (ry + ty * cfg.swirl) * pushAccel * f + sy * f;
          vz += (rz + tz * cfg.swirl) * pushAccel * f + sz * f;
        }
      }
      vx += (homes[ix] - x) * stiff * dt;
      vy += (homes[ix + 1] - y) * stiff * dt;
      vz += (homes[ix + 2] - z) * stiff * dt;
      vx *= damp;
      vy *= damp;
      vz *= damp;
      positions[ix] = x + vx * dt;
      positions[ix + 1] = y + vy * dt;
      positions[ix + 2] = z + vz * dt;
      velocities[ix] = vx;
      velocities[ix + 1] = vy;
      velocities[ix + 2] = vz;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
  }

  function loop(now = performance.now()) {
    if (destroyed || !visible) return;
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    elapsed += dt;
    resizeCanvas(canvas, gl);
    const width = canvas.clientWidth;
    const height = Math.max(canvas.clientHeight, 1);
    const eye = [0, 0, CAM_DIST];
    if (!reduced) simulate(dt, width, height, eye);
    const aspect = width / height;
    const proj = perspective(FOV, aspect, 0.1, 20);
    const view = lookAt(eye, [0, 0, 0]);
    const vp = mul4(proj, view);
    gl.clearColor(0.039, 0.039, 0.039, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (photoTex && bg) {
      gl.disable(gl.BLEND);
      gl.useProgram(bg.program);
      gl.bindVertexArray(quad.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, photoTex);
      gl.uniform1i(bg.uniforms.uPhoto, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniformMatrix4fv(uViewProj, false, vp);
    gl.uniform1f(uSize, cfg.size);
    gl.uniform1f(uDpr, Math.min(window.devicePixelRatio || 1, 2));
    gl.uniform1f(uTime, elapsed);
    gl.uniform1f(uDrift, reduced ? 0 : cfg.drift);
    setColor3(gl, uAccent, palette.accent);
    setColor3(gl, uHighlight, palette.highlight);
    gl.drawArrays(gl.POINTS, 0, count);
    raf = requestAnimationFrame(loop);
  }

  bakePhoto(photo, canvas.clientWidth || 960, canvas.clientHeight || 720).then((baked) => {
    if (destroyed || !baked) return;
    photoTex = createTexture(gl, baked.canvas);
    palette = visiblePalette(baked.palette);
  });

  loop();

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      ring.remove();
      canvas.style.touchAction = prevTouchAction;
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("visibilitychange", onVisibility);
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(seedBuf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (photoTex) gl.deleteTexture(photoTex);
      if (bg) {
        gl.deleteProgram(bg.program);
        gl.deleteShader(bg.vs);
        gl.deleteShader(bg.fs);
      }
      gl.deleteBuffer(quad.buf);
      gl.deleteVertexArray(quad.vao);
    },
  };
}
