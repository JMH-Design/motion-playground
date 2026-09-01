export const GROUND_HEX = "#0a0a0a";
export const INK_HEX = "#f3eee6";

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function createGL(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  return gl && !gl.isContextLost() ? gl : null;
}

export function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function link(gl, vertSrc, fragSrc) {
  const vs = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return null;
  }
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i += 1) {
    const info = gl.getActiveUniform(program, i);
    uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }
  return { program, vs, fs, uniforms };
}

export function createQuad(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return { vao, buf };
}

export function resizeCanvas(canvas, gl) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    if (gl) gl.viewport(0, 0, width, height);
    return true;
  }
  return false;
}

export async function bakeType(
  cssWidth,
  cssHeight,
  name,
  verb,
  repeats = 1,
  options = {},
) {
  await document.fonts.ready;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  const pageH = Math.max(1, cssHeight);
  canvas.width = Math.max(1, Math.round(cssWidth * dpr));
  canvas.height = Math.max(1, Math.round(pageH * repeats * dpr));
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const plaque = Boolean(options.plaque);
  if (plaque) {
    ctx.clearRect(0, 0, cssWidth, pageH * repeats);
  } else {
    ctx.fillStyle = GROUND_HEX;
    ctx.fillRect(0, 0, cssWidth, pageH * repeats);
  }
  const size = Math.min(cssWidth, pageH) * 0.17;
  const nameX = cssWidth * 0.14;
  const title = String(name || verb || "").trim();
  const verbLabel = String(verb || "").toUpperCase();
  const showVerb = Boolean(name && verb && name !== verb);
  for (let i = 0; i < repeats; i += 1) {
    const y0 = i * pageH;
    const nameBaseline = y0 + pageH * 0.46;
    const verbBaseline = nameBaseline + size * 0.58;
    ctx.letterSpacing = "0px";
    ctx.font = `350 ${size}px Newsreader, Georgia, serif`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const nameW = ctx.measureText(title).width;
    ctx.font = `500 13px Inter, system-ui, sans-serif`;
    ctx.letterSpacing = "0.28em";
    const verbW = showVerb ? ctx.measureText(verbLabel).width : 0;
    if (options.frame) {
      const pad = size * 0.35;
      const inset = options.fullWidth ? 1.5 : 0;
      const boxX = options.fullWidth ? inset : nameX - pad;
      const boxY = nameBaseline - size * 0.78 - pad;
      const boxW = options.fullWidth
        ? cssWidth - inset * 2
        : Math.max(nameW, verbW) + pad * 2;
      const boxBottom = showVerb
        ? verbBaseline + 13 * 0.28 + pad
        : nameBaseline + size * 0.22 + pad;
      const boxH = boxBottom - boxY;
      if (plaque && !options.fullWidth) {
        ctx.fillStyle = GROUND_HEX;
        ctx.fillRect(boxX, boxY, boxW, boxH);
      }
      ctx.strokeStyle = INK_HEX;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(boxX, boxY, boxW, boxH);
    }
    ctx.fillStyle = INK_HEX;
    ctx.letterSpacing = "0px";
    ctx.font = `350 ${size}px Newsreader, Georgia, serif`;
    ctx.fillText(title, nameX, nameBaseline);
    if (showVerb) {
      ctx.font = `500 13px Inter, system-ui, sans-serif`;
      ctx.letterSpacing = "0.28em";
      ctx.fillText(verbLabel, nameX, verbBaseline);
    }
  }
  return canvas;
}

const PASSAGES = `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.

Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur. Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur. At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.

Similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga. Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus. Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae.

Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat. Cras ultricies ligula sed magna dictum porta. Vestibulum ac diam sit amet quam vehicula elementum sed sit amet dui. Curabitur aliquet quam id dui posuere blandit. Nulla quis lorem ut libero malesuada feugiat. Pellentesque in ipsum id orci porta dapibus. Vivamus magna justo, lacinia eget consectetur sed, convallis at tellus.

Praesent sapien massa, convallis a pellentesque nec, egestas non nisi. Donec rutrum congue leo eget malesuada. Curabitur non nulla sit amet nisl tempus convallis quis ac lectus. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae. Mauris blandit aliquet elit, eget tincidunt nibh pulvinar a. Vivamus suscipit tortor eget felis porttitor volutpat. Proin eget tortor risus. Donec sollicitudin molestie malesuada.

Curabitur arcu erat, accumsan id imperdiet et, porttitor at sem. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Quisque velit nisi, pretium ut lacinia in, elementum id enim. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae. Nulla porttitor accumsan tincidunt. Mauris blandit aliquet elit, eget tincidunt nibh pulvinar a. Sed porttitor lectus nibh.

Donec velit neque, auctor sit amet aliquam vel, ullamcorper sit amet ligula. Proin eget tortor risus. Vestibulum ac diam sit amet quam vehicula elementum sed sit amet dui. Nulla quis lorem ut libero malesuada feugiat. Curabitur aliquet quam id dui posuere blandit. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae donec velit neque.

Lorem ipsum dolor sit amet consectetur adipiscing elit integer nec odio praesent libero sed cursus ante dapibus diam sed nisi nulla quis sem at nibh elementum imperdiet duis sagittis ipsum praesent mauris fusce nec tellus sed augue semper porta mauris massa vestibulum lacinia arcu eget nulla class aptent taciti sociosqu ad litora torquent per conubia nostra per inceptos himenaeos curabitur sodales ligula in libero sed dignissim lacinia nunc. Aliquam erat volutpat nam dui mi tincidunt quis accumsan porttitor facilisis luctus metus. Phasellus ultrices nulla quis nibh. Quisque a lectus donec consectetuer ligula vulputate sem tristique cursus. Nam nulla quam gravida non commodo a sollicitudin vel eros. Fusce convallis metus id felis luctus adipiscing. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Integer vitae libero ac risus egestas placerat. Vestibulum commodo felis quis tortor. Ut aliquam sollicitudin leo. Cras iaculis ultricies nulla. Donec quis dui at dolor tempor interdum.

Aenean sit amet erat nunc egestas pretium aenean tempor ullamcorper leo. Vivamus elementum semper nisi. Aenean vulputate eleifend tellus. Aenean leo ligula porttitor eu consequat vitae eleifend ac enim. Aliquam lorem ante dapibus in viverra quis feugiat a tellus. Phasellus viverra nulla ut metus`;

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  for (const para of text.split(/\n+/)) {
    if (lines.length) lines.push("");
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function bakeCopy(cssWidth, cssHeight, text = PASSAGES) {
  await document.fonts.ready;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pageH = Math.max(1, cssHeight);
  const size = Math.min(22, Math.max(16, Math.min(cssWidth, pageH) * 0.022));
  const lineHeight = size * 1.55;
  const padX = cssWidth * 0.1;
  const padY = pageH * 0.72;
  const maxW = cssWidth - padX * 2;
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = `350 ${size}px Newsreader, Georgia, serif`;
  const lines = wrapLines(measure, text, maxW);
  const contentH = padY + size + lines.length * lineHeight + padY;
  const cssH = Math.max(pageH, contentH);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(cssWidth * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssH);
  ctx.fillStyle = INK_HEX;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "0px";
  ctx.font = `350 ${size}px Newsreader, Georgia, serif`;
  let y = padY + size;
  for (const line of lines) {
    if (line) ctx.fillText(line, padX, y);
    y += lineHeight;
  }
  return { canvas, height: cssH };
}

export function createTexture(gl, source, { mipmaps = false } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
  return tex;
}

export const DEFAULT_PALETTE = {
  accent: [0.72, 0.78, 0.92],
  highlight: [0.95, 0.93, 0.88],
  mean: [0.12, 0.12, 0.12],
};

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`photo failed: ${src}`));
    img.src = src;
  });
}

export function drawCover(ctx, img, x, y, w, h) {
  const ir = img.width / Math.max(img.height, 1);
  const tr = w / Math.max(h, 1);
  let dw;
  let dh;
  if (ir > tr) {
    dh = h;
    dw = h * ir;
  } else {
    dw = w;
    dh = w / ir;
  }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export function samplePalette(source) {
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  let bestSat = -1;
  let accent = DEFAULT_PALETTE.accent.slice();
  let highlight = DEFAULT_PALETTE.highlight.slice();
  let bestLum = -1;
  const sum = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = max - min;
    if (lum > 0.08 && lum < 0.94) {
      sum[0] += r;
      sum[1] += g;
      sum[2] += b;
      n += 1;
      if (sat * (0.35 + lum) > bestSat) {
        bestSat = sat * (0.35 + lum);
        accent = [r, g, b];
      }
    }
    if (lum > 0.22 && lum > bestLum && sat > 0.06) {
      bestLum = lum;
      highlight = [r, g, b];
    }
  }
  const mean = n
    ? [sum[0] / n, sum[1] / n, sum[2] / n]
    : DEFAULT_PALETTE.mean.slice();
  return { accent, highlight, mean };
}

export async function bakePhoto(src, cssWidth, cssHeight) {
  if (!src) return null;
  try {
    const img = await loadImage(src);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.min(1600, Math.max(1, Math.round(cssWidth * dpr)));
    const height = Math.min(1600, Math.max(1, Math.round(cssHeight * dpr)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    drawCover(ctx, img, 0, 0, width, height);
    return { canvas, palette: samplePalette(img), img };
  } catch {
    return null;
  }
}

export function setColor3(gl, location, rgb) {
  if (location) gl.uniform3f(location, rgb[0], rgb[1], rgb[2]);
}

export function buildGlyphAtlas() {
  const glyphs = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#*+=<>/|");
  const cell = 64;
  const cols = 8;
  const rows = Math.ceil(glyphs.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(cell * 0.62)}px ui-monospace, Menlo, monospace`;
  glyphs.forEach((ch, i) => {
    const x = (i % cols) * cell + cell / 2;
    const y = Math.floor(i / cols) * cell + cell / 2;
    ctx.fillText(ch, x, y);
  });
  return { canvas, count: glyphs.length, cols, rows };
}

export function attachRuntime(canvas, { setup, frame, dispose }) {
  if (prefersReducedMotion()) {
    return { destroy() {}, still: true };
  }

  const gl = createGL(canvas);
  if (!gl) {
    return { destroy() {}, noWebGL: true };
  }
  gl.disable(gl.BLEND);
  gl.clearColor(0.039, 0.039, 0.039, 1);

  const host = canvas.parentElement ?? canvas;
  const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, target: 0 };
  let state = null;
  let raf = 0;
  let running = false;
  let destroyed = false;
  let visible = document.visibilityState === "visible";
  let last = performance.now();

  function start() {
    if (destroyed || running || !visible || !state) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    if (destroyed || !visible) {
      running = false;
      return;
    }
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const k = 1 - Math.exp(-dt / 0.12);
    pointer.x += (pointer.tx - pointer.x) * k;
    pointer.y += (pointer.ty - pointer.y) * k;
    pointer.active += (pointer.target - pointer.active) * k;
    resizeCanvas(canvas, gl);
    gl.clear(gl.COLOR_BUFFER_BIT);
    frame(state, {
      gl,
      canvas,
      t: now / 1000,
      dt,
      pointer,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    });
    raf = requestAnimationFrame(tick);
  }

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (pointer.target === 0 && pointer.active < 1e-3) {
      pointer.x = x;
      pointer.y = y;
    }
    pointer.tx = x;
    pointer.ty = y;
    pointer.target = 1;
    start();
  }

  function onPointerLeave() {
    pointer.target = 0;
    start();
  }

  function onVisibility() {
    visible = document.visibilityState === "visible";
    if (visible) start();
  }

  const observer = new ResizeObserver(() => start());
  observer.observe(canvas);
  host.addEventListener("pointermove", onPointerMove, { passive: true });
  host.addEventListener("pointerleave", onPointerLeave, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);

  Promise.resolve(setup(gl, canvas)).then((next) => {
    if (destroyed) {
      if (next) dispose?.(next, gl);
      return;
    }
    state = next;
    resizeCanvas(canvas, gl);
    start();
  });

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      if (state) dispose?.(state, gl);
    },
  };
}
