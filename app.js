import { create as createDecrypt } from "./rooms/decrypt.js";
import { create as createGlyphRain } from "./rooms/glyph-rain.js";
import { create as createGrid } from "./rooms/grid.js";
import { create as createParticleObject } from "./rooms/particle-object.js";
import { create as createBend } from "./rooms/bend.js";
import { create as createParticleScroll } from "./rooms/particle-scroll.js";

export const PIECES = [
  { id: "sweep", verb: "sweep", photo: "./assets/photos/sweep.jpg?v=2", create: createParticleObject, scroll: false },
  { id: "move-2", verb: "move", photo: "./assets/photos/move-2.jpg?v=4", create: createGrid, scroll: false },
  { id: "move", verb: "move", photo: "./assets/photos/move.jpg?v=3", create: createDecrypt, scroll: false },
  { id: "scroll-2", verb: "scroll", photo: "./assets/photos/scroll-2.jpg?v=3", create: createParticleScroll, scroll: true },
  { id: "stir", verb: "stir", photo: "./assets/photos/stir.jpg", create: createGlyphRain, scroll: false },
  { id: "scroll", verb: "scroll", photo: "./assets/photos/scroll.jpg?v=3", create: createBend, scroll: true },
];

const HASH_ALIASES = {
  decrypt: "move",
  "glyph-rain": "stir",
  grid: "move-2",
  "particle-object": "sweep",
  bend: "scroll",
  "particle-scroll": "scroll-2",
};

export function parseHash(hash) {
  let id = String(hash || "").replace(/^#/, "");
  if (HASH_ALIASES[id]) id = HASH_ALIASES[id];
  if (!id) return { mode: "landing" };
  const index = PIECES.findIndex((piece) => piece.id === id);
  if (index < 0) return { mode: "landing" };
  return { mode: "room", index };
}

const landing = document.getElementById("landing");
const roomEl = document.getElementById("room");
const stage = document.getElementById("stage");
const scrollport = document.getElementById("scrollport");
const roomType = document.getElementById("room-type");
const roomName = document.getElementById("room-name");
const roomVerb = document.getElementById("room-verb");
const nowebgl = document.getElementById("nowebgl");
const indexEl = document.getElementById("index");

let live = null;

function setMode(next) {
  const current = parseHash(location.hash);
  if (next.mode === "landing") {
    if (current.mode !== "landing") history.pushState(null, "", "#");
    sync();
    return;
  }
  const piece = PIECES[next.index];
  if (!piece) return;
  if (current.mode !== "room" || current.index !== next.index) {
    history.pushState(null, "", `#${piece.id}`);
  }
  sync();
}

function teardown() {
  live?.destroy();
  live = null;
  scrollport.hidden = true;
  scrollport.scrollTop = 0;
  nowebgl.hidden = true;
  roomType.classList.remove("is-live");
}

function mount(index) {
  const piece = PIECES[index];
  roomName.textContent = "";
  roomVerb.textContent = piece.verb;
  indexEl.textContent = `${index + 1} / ${PIECES.length}`;
  scrollport.hidden = !piece.scroll;
  roomEl.style.setProperty("--piece-photo", `url("${piece.photo}")`);
  const instance = piece.create(stage, {
    verb: piece.verb,
    photo: piece.photo,
    scrollport,
  });
  live = instance;
  if (instance.noWebGL) nowebgl.hidden = false;
  if (!instance.still && !instance.noWebGL) roomType.classList.add("is-live");
}

function sync() {
  const state = parseHash(location.hash);
  teardown();
  document.body.classList.toggle("is-room", state.mode === "room");
  if (state.mode === "landing") {
    landing.hidden = false;
    roomEl.hidden = true;
    roomEl.style.removeProperty("--piece-photo");
    return;
  }
  landing.hidden = true;
  roomEl.hidden = false;
  mount(state.index);
}

document.getElementById("close").addEventListener("click", () => {
  setMode({ mode: "landing" });
});

document.getElementById("prev").addEventListener("click", () => {
  const state = parseHash(location.hash);
  if (state.mode !== "room") return;
  setMode({ mode: "room", index: (state.index + PIECES.length - 1) % PIECES.length });
});

document.getElementById("next").addEventListener("click", () => {
  const state = parseHash(location.hash);
  if (state.mode !== "room") return;
  setMode({ mode: "room", index: (state.index + 1) % PIECES.length });
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMode({ mode: "landing" });
  if (event.key === "ArrowLeft") document.getElementById("prev").click();
  if (event.key === "ArrowRight") document.getElementById("next").click();
});

function trackView() {
  window.va?.("event", {
    type: "pageview",
    url: `${location.pathname}${location.hash || "#"}`,
  });
}

window.addEventListener("hashchange", () => {
  sync();
  trackView();
});
window.addEventListener("popstate", sync);

sync();
