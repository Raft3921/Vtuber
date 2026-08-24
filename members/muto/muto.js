import {
  blankProfiles,
  catalog,
  defaultLayout,
  layoutControls,
  stateLabels,
} from "../shared/studio-config.js";
import {
  appendLayoutSection,
  appendVisualSection,
} from "../shared/settings-ui.js";

const $ = (id) => document.getElementById(id),
  canvas = $("stage"),
  video = $("camera"),
  displayCtx = canvas.getContext("2d");
let ctx = displayCtx;
const characterCanvas = document.createElement("canvas"),
  characterCtx = characterCanvas.getContext("2d"),
  tintCanvas = document.createElement("canvas"),
  tintCtx = tintCanvas.getContext("2d"),
  hairHitCanvas = document.createElement("canvas"),
  hairHitCtx = hairHitCanvas.getContext("2d", { willReadFrequently: true }),
  adjustCanvas = $("adjustStage"),
  adjustCtx = adjustCanvas.getContext("2d");
characterCanvas.width =
  characterCanvas.height =
  tintCanvas.width =
  tintCanvas.height =
  hairHitCanvas.width =
  hairHitCanvas.height =
    1254;
const query = new URLSearchParams(location.search),
  obs = query.get("obs") === "1",
  member = "5",
  STORE_KEY = "vtuber-expression-map-shared-v1";
document.body.classList.toggle("obs", obs);
document.body.classList.toggle(
  query.get("bg") === "blue" ? "blue" : "green",
  obs && query.get("bg") !== "transparent",
);
document.body.classList.toggle(
  "transparent",
  obs && query.get("bg") === "transparent",
);
document.documentElement.classList.toggle(
  "transparent",
  obs && query.get("bg") === "transparent",
);
const files = [
    "base",
    "hair",
    "hair-upper",
    "hair-back",
    "hair-front-v4",
    "hair-upper-v4",
    "hair-back-v4",
    "hair-back-v5",
    "hair-back-1-v13",
    "hair-back-2-v13",
    "hair-back-3-v13",
    "hair-upper-1-v13",
    "hair-upper-2-v13",
    "hair-upper-3-v13",
    "hair-front-1-v13",
    "hair-front-2-v13",
    "hair-front-3-v13",
    "hair-back-generated-v16",
    "hair-upper-generated-v16",
    "hair-front-generated-v16",
    "eye-whites-v2",
    "irises-v2",
    "eyebrows",
    "mouth",
    "rig-atlas",
    "eye-expressions",
    "mouth-speech-16-v3",
    "eye-shapes-muto-v3",
  ],
  art = {},
  sharedFiles = new Set([
    "eye-whites-v2",
    "eyebrows",
    "mouth",
    "rig-atlas",
    "eye-expressions",
    "mouth-speech-16-v3",
  ]);
for (const name of files) {
  const img = new Image();
  img.src = sharedFiles.has(name)
    ? `/shared/cleaned/${name}.png`
    : `parts/cleaned/${name}.png`;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const r = d.data[i],
      gr = d.data[i + 1],
      b = d.data[i + 2];
    if (gr > 145 && gr > r * 1.55 && gr > b * 1.55) d.data[i + 3] = 0;
    if (
      false && name === "irises-v2" &&
      b > r * 1.08 &&
      b > gr * 0.98 &&
      d.data[i + 3]
    ) {
      const light = (r * 0.18 + gr * 0.28 + b * 0.54) / 255,
        detail = Math.max(0, Math.min(1, (b - r) / 180));
      d.data[i] = Math.round(38 + 160 * light + 18 * detail);
      d.data[i + 1] = Math.round(17 + 82 * light);
      d.data[i + 2] = Math.round(8 + 34 * light);
    } else if (false && name === "eyebrows" && b > r * 1.05 && d.data[i + 3]) {
      const light = (r + gr + b) / 765;
      d.data[i] = Math.round(24 + 38 * light);
      d.data[i + 1] = Math.round(13 + 19 * light);
      d.data[i + 2] = Math.round(10 + 13 * light);
    }
  }
  g.putImageData(d, 0, 0);
  art[name] = c;
}
async function loadRig(name) {
  const img = new Image();
  img.src = `parts/rig-v3/${name}.png`;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d").drawImage(img, 0, 0);
  return c;
}
const hairPieceDefs = [
  {
    id: "back-generated",
    label: "後ろ髪",
    img: art["hair-back-generated-v16"],
    group: "back",
    pivot: [625, 350],
    weight: 0.48,
  },
  {
    id: "upper-generated",
    label: "上の髪",
    img: art["hair-upper-generated-v16"],
    group: "upper",
    pivot: [625, 305],
    weight: 0.78,
  },
  {
    id: "front-generated",
    label: "前髪",
    img: art["hair-front-generated-v16"],
    group: "front",
    pivot: [625, 365],
    weight: 0.9,
  },
];
const hairPieceMotion = hairPieceDefs.map((_, i) => ({
  angle: 0,
  velocity: 0,
  phase: i * 0.83,
}));
const defaultHairAdjustment = () => ({
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  sway: 1,
});
const makeDefaultHairAdjustments = () =>
  Object.fromEntries(hairPieceDefs.map((p) => [p.id, defaultHairAdjustment()]));
let hairAdjustments = makeDefaultHairAdjustments(),
  selectedHairId = "front-center",
  highlightUntil = 0;
const defaultSclera = {
  left: { x: 0, y: 0, scale: 1, rotation: 0 },
  right: { x: 0, y: 0, scale: 1, rotation: 0 },
};
let sclera = JSON.parse(JSON.stringify(defaultSclera));

const hairHitImages = hairPieceDefs.map((p, index) => {
  const c = document.createElement("canvas");
  c.width = p.img.width;
  c.height = p.img.height;
  const g = c.getContext("2d");
  g.drawImage(p.img, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = `rgb(${index + 1},0,0)`;
  g.fillRect(0, 0, c.width, c.height);
  return c;
});
const crop = (img, x, y, w, h) => {
  const c = document.createElement("canvas");
  c.width = Math.round(w);
  c.height = Math.round(h);
  c.getContext("2d").drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
  return c;
};
const contentBounds = (img) => {
  const d = img.getContext("2d").getImageData(0, 0, img.width, img.height).data;
  let x0 = img.width,
    y0 = img.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (d[(y * img.width + x) * 4 + 3] > 24) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return x1 < 0
    ? { x: 0, y: 0, w: img.width, h: img.height }
    : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
const atlasParts = {};
for (const [name, col, row] of [
  ["mouth0", 0, 0],
  ["mouth1", 1, 0],
  ["mouth2", 2, 0],
  ["mouth3", 0, 1],
  ["sideL", 1, 1],
  ["sideR", 2, 1],
  ["ahoge", 0, 2],
  ["ears", 1, 2],
  ["strings", 2, 2],
])
  atlasParts[name] = crop(art["rig-atlas"], col * 418, row * 418, 418, 418);
const mouthCell = art["mouth-speech-16-v3"].width / 4,
  speechMouths = [];
for (let i = 0; i < 16; i++)
  speechMouths.push(
    crop(
      art["mouth-speech-16-v3"],
      (i % 4) * mouthCell,
      Math.floor(i / 4) * mouthCell,
      mouthCell,
      mouthCell,
    ),
  );
const speechBounds = speechMouths.map(contentBounds);
const shapeAtlas = art["eye-shapes-muto-v3"],
  shapeCellW = shapeAtlas.width / 3,
  shapeCellH = shapeAtlas.height / 2,
  shapePairs = [];
for (let i = 0; i < 6; i++) {
  const cell = crop(
    shapeAtlas,
    (i % 3) * shapeCellW + 6,
    Math.floor(i / 3) * shapeCellH + 6,
    shapeCellW - 12,
    shapeCellH - 12,
  );
  shapePairs.push([
    crop(cell, 0, 0, cell.width / 2, cell.height),
    crop(cell, cell.width / 2, 0, cell.width / 2, cell.height),
  ]);
}
const shapeBounds = shapePairs.map((p) => p.map(contentBounds));
const shapeWhiteMasks = shapePairs.map((pair) =>
    pair.map((src) => {
      const c = crop(src, 0, 0, src.width, src.height),
        g = c.getContext("2d"),
        d = g.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) {
        const white =
          d.data[i] > 185 &&
          d.data[i + 1] > 185 &&
          d.data[i + 2] > 185 &&
          d.data[i + 3] > 20;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
        d.data[i + 3] = white ? 255 : 0;
      }
      g.putImageData(d, 0, 0);
      return c;
    }),
  ),
  irisLayer = document.createElement("canvas"),
  irisCtx = irisLayer.getContext("2d");
// 瞬き素材の白い四角形は描画せず、透過した瞼・瞼線だけを残す。
for (const pair of shapePairs)
  for (const part of pair) {
    const g = part.getContext("2d"),
      pixels = g.getImageData(0, 0, part.width, part.height);
    for (let i = 0; i < pixels.data.length; i += 4)
      if (
        pixels.data[i] > 185 &&
        pixels.data[i + 1] > 185 &&
        pixels.data[i + 2] > 185
      ) pixels.data[i + 3] = 0;
    g.putImageData(pixels, 0, 0);
  }
irisLayer.width = irisLayer.height = 1254;
const whitePairs = [
    crop(
      art["eye-whites-v2"],
      0,
      0,
      art["eye-whites-v2"].width / 2,
      art["eye-whites-v2"].height,
    ),
    crop(
      art["eye-whites-v2"],
      art["eye-whites-v2"].width / 2,
      0,
      art["eye-whites-v2"].width / 2,
      art["eye-whites-v2"].height,
    ),
  ],
  whitePairBounds = whitePairs.map(contentBounds);
const irisPairs = [
    crop(
      art["irises-v2"],
      0,
      0,
      art["irises-v2"].width / 2,
      art["irises-v2"].height,
    ),
    crop(
      art["irises-v2"],
      art["irises-v2"].width / 2,
      0,
      art["irises-v2"].width / 2,
      art["irises-v2"].height,
    ),
  ],
  irisPairBounds = irisPairs.map(contentBounds);
const baseNoNose = crop(art.base, 0, 0, 1254, 1254),
  nosePart = crop(art.base, 602, 665, 50, 60);
{
  const g = baseNoNose.getContext("2d");
  g.fillStyle = "#ffe1cf";
  g.beginPath();
  g.ellipse(627, 695, 18, 28, 0, 0, Math.PI * 2);
  g.fill();
}
const skinMask = crop(baseNoNose, 0, 0, 1254, 1254),
  skinHighlight = document.createElement("canvas"),
  skinShadow = document.createElement("canvas");
skinHighlight.width =
  skinHighlight.height =
  skinShadow.width =
  skinShadow.height =
    1254;
{
  const g = skinMask.getContext("2d"),
    d = g.getImageData(0, 0, 1254, 1254);
  for (let i = 0; i < d.data.length; i += 4) {
    const r = d.data[i],
      gr = d.data[i + 1],
      b = d.data[i + 2],
      skin =
        d.data[i + 3] > 20 &&
        r > 175 &&
        gr > 105 &&
        b > 90 &&
        r > gr * 1.04 &&
        gr > b * 0.93;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
    d.data[i + 3] = skin ? 255 : 0;
  }
  g.putImageData(d, 0, 0);
  for (const [canvas, type] of [
    [skinHighlight, "highlight"],
    [skinShadow, "shadow"],
  ]) {
    const c = canvas.getContext("2d");
    if (type === "highlight") {
      const grad = c.createRadialGradient(440, 480, 15, 470, 540, 470);
      grad.addColorStop(0, "rgba(255,248,237,.24)");
      grad.addColorStop(0.5, "rgba(255,216,196,.07)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = grad;
    } else {
      const grad = c.createLinearGradient(330, 420, 850, 1070);
      grad.addColorStop(0, "rgba(92,57,88,0)");
      grad.addColorStop(0.55, "rgba(111,67,91,.055)");
      grad.addColorStop(1, "rgba(91,52,83,.2)");
      c.fillStyle = grad;
    }
    c.fillRect(0, 0, 1254, 1254);
    c.globalCompositeOperation = "destination-in";
    c.drawImage(skinMask, 0, 0);
    c.globalCompositeOperation = "source-over";
  }
}
const hairStatic = crop(art.hair, 0, 0, 1254, 1254),
  hairTipRegions = [
    [300, 590, 245, 335],
    [709, 590, 245, 335],
  ],
  hairTips = hairTipRegions.map((r) => crop(art.hair, ...r));
{
  const g = hairStatic.getContext("2d");
  for (const r of hairTipRegions) g.clearRect(...r);
}
const assembledHair = [],
  hairSprings = [];
const defaultVisual = {
  outlineLayers: 0,
  outlineWidth: 5,
  outlineColor1: "#172f57",
  outlineColor2: "#63b8ff",
  outlineColor3: "#f3d57b",
  backHairBrightness: 1,
  paintDepth: 0.55,
  hairMotion: 1,
  clothMotion: 1,
  stringMotion: 1,
  earTwitchFrequency: 1,
  earTwitchStrength: 1,
};
const defaultMap = {
    version: 4,
    member: 5,
    eye: ["blink-0", "blink-1", "blink-2", "normal", "blink-4", "blink-5"],
    brow: ["raised", "relaxed", "frown"],
    mouth: Array.from({ length: 16 }, (_, i) => `speech-${i}`),
    profiles: blankProfiles(),
    layout: { ...defaultLayout },
    visual: { ...defaultVisual },
  },
  clone = (o) => JSON.parse(JSON.stringify(o));
function validMap(v) {
  return (
    v &&
    v.version === 4 &&
    v.profiles &&
    v.layout &&
    ["eye", "brow", "mouth"].every(
      (k) => Array.isArray(v[k]) && v[k].length === defaultMap[k].length,
    )
  );
}

async function loadAllSettings() {
  const response = await fetch(`/settings?member=${member}&t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`設定JSONを取得できませんでした (HTTP ${response.status})`);

  const raw = await response.json();
  const next = raw.mapping || raw;

  if (!validMap(next)) throw new Error("設定JSONの mapping 形式が違います");

  const loadedMapping = {
    ...next,
    layout: { ...defaultLayout, ...next.layout },
    visual: { ...defaultVisual, ...next.visual },
  };

  const loadedHair = Object.fromEntries(
    hairPieceDefs.map((p) => [
      p.id,
      {
        ...defaultHairAdjustment(),
        ...(raw.hairAdjustments?.[p.id] || {}),
      },
    ]),
  );

  return {
    mapping: loadedMapping,
    hairAdjustments: loadedHair,
    sclera: {
      left: { ...defaultSclera.left, ...(raw.sclera?.left || {}) },
      right: { ...defaultSclera.right, ...(raw.sclera?.right || {}) },
    },
  };
}

let mapping;
try {
  const loaded = await loadAllSettings();
  mapping = loaded.mapping;
  hairAdjustments = loaded.hairAdjustments;
  sclera = loaded.sclera;
} catch (err) {
  console.error(err);
  mapping = clone(defaultMap);
  hairAdjustments = makeDefaultHairAdjustments();
  alert(
    "設定ファイルを読み込めませんでした。\n" +
      "config/muto-all-settings.json と server.mjs を確認してください。\n\n" +
      err.message,
  );
}

let settingsSaveTimer = 0;
function saveAllSettings() {
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(() => {
    fetch(`/settings?member=${member}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "vtuber-studio-settings",
        version: 1,
        member: 5,
        mapping,
        sclera,
        hairAdjustments,
      }),
    }).catch((err) => console.error("設定JSONの保存に失敗しました", err));
  }, 120);
}
function saveMapping() {
  saveAllSettings();
}
function saveHairAdjustments() {
  saveAllSettings();
}
const target = {
    x: 0,
    y: 0,
    roll: 0,
    depth: 0,
    mouth: 0,
    gazeX: 0,
    gazeY: 0,
    eyeOpen: 1,
    smile: 0,
    smileL: 0,
    smileR: 0,
    frown: 0,
    frownL: 0,
    frownR: 0,
    pucker: 0,
    browUp: 0,
    funnel: 0,
    press: 0,
    upperUp: 0,
    cheekPuff: 0,
    dimple: 0,
    stretch: 0,
    shrug: 0,
    rollLower: 0,
  },
  pose = { ...target };
let running = false,
  demo = false,
  stream,
  landmarker,
  lastVideo = -1,
  lastSend = 0,
  lastMouth = 0,
  talkingUntil = 0,
  talk = 0,
  blinkFrame = 3,
  lastBlinkStep = 0,
  sway = {
    hair: 0,
    ahoge: 0,
    ahogeTip: 0,
    cloth: 0,
    neck: 0,
    string: 0,
    ear: 0,
  },
  mouthBaton = { current: 0, to: 0, queued: 0, p: 1 },
  mouthChoice = {
    representative: null,
    score: Infinity,
    pending: null,
    pendingFrames: 0,
  },
  browBaton = { current: 1, to: 1, p: 1 };
function status(t) {
  $("status").textContent = t;
}
function send(now) {
  if (obs || now - lastSend < 45) return;
  lastSend = now;
  fetch(`/pose?member=${member}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...target, talking: demo || now < talkingUntil }),
  }).catch(() => {});
}
if (obs) {
  const events = new EventSource(`/events?member=${member}`);
  events.onmessage = (e) => {
    try {
      const p = JSON.parse(e.data);
      for (const k in target) if (Number.isFinite(p[k])) target[k] = p[k];
      if (p.talking) talkingUntil = performance.now() + 300;
    } catch {}
  };
}
async function start() {
  if (running) return stop();
  status("許可を待っています…");
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    status("顔追跡を読込中…");
    const vision = await import(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm"
      ),
      fs = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm",
      );
    landmarker = await vision.FaceLandmarker.createFromOptions(fs, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.45,
      minTrackingConfidence: 0.45,
      outputFaceBlendshapes: true,
    });
    running = true;
    demo = false;
    $("start").textContent = "停止";
    status("追従中");
    video.requestVideoFrameCallback(frame);
    return true;
  } catch (e) {
    console.error(e);
    status("カメラを開始できません");
    return false;
  }
}
function stop() {
  running = false;
  stream?.getTracks().forEach((t) => t.stop());
  landmarker?.close();
  landmarker = null;
  $("start").textContent = "カメラを開始";
  status("停止中");
}
function frame(now) {
  if (!running) return;
  track(now);
  send(now);
  video.requestVideoFrameCallback(frame);
}
function track(now) {
  if (demo) {
    target.x = Math.sin(now * 0.0012) * 0.65;
    target.y = Math.sin(now * 0.0017) * 0.25;
    target.roll = Math.sin(now * 0.0014) * 0.16;
    target.depth = Math.sin(now * 0.0009) * 0.5;
    target.mouth = Math.max(0, Math.sin(now * 0.006));
    target.gazeX = Math.sin(now * 0.003);
    target.gazeY = Math.sin(now * 0.0022);
    target.eyeOpen = 0.02 + 1.34 * (0.5 + 0.5 * Math.sin(now * 0.0032));
    target.smile = target.smileL = 0.5 + 0.5 * Math.sin(now * 0.0013);
    target.smileR = 0.5 + 0.5 * Math.sin(now * 0.0013 + 0.4);
    target.frown = target.frownL = 0.5 + 0.5 * Math.sin(now * 0.0009 + 2);
    target.frownR = 0.5 + 0.5 * Math.sin(now * 0.0009 + 2.3);
    target.pucker = Math.max(0, Math.sin(now * 0.0011 + 3));
    target.dimple = 0.5 + 0.5 * Math.sin(now * 0.0017 + 1);
    target.stretch = 0.5 + 0.5 * Math.sin(now * 0.0019 + 2);
    target.press = 0.5 + 0.5 * Math.sin(now * 0.0014 + 4);
    target.browUp = 0.5 + 0.5 * Math.sin(now * 0.0015);
    talkingUntil = now + 400;
    return;
  }
  if (!running || video.currentTime === lastVideo) return;
  lastVideo = video.currentTime;
  const result = landmarker?.detectForVideo(video, now),
    lm = result?.faceLandmarks?.[0];
  if (!lm) {
    target.mouth = 0;
    status("顔を探しています…");
    return;
  }
  const shapes = Object.fromEntries(
      (result.faceBlendshapes?.[0]?.categories || []).map((v) => [
        v.categoryName,
        v.score,
      ]),
    ),
    avg = (a, b) => ((shapes[a] || 0) + (shapes[b] || 0)) / 2;
  target.smileL = shapes.mouthSmileLeft || 0;
  target.smileR = shapes.mouthSmileRight || 0;
  target.smile = (target.smileL + target.smileR) / 2;
  target.frownL = shapes.mouthFrownLeft || 0;
  target.frownR = shapes.mouthFrownRight || 0;
  target.frown = (target.frownL + target.frownR) / 2;
  target.pucker = shapes.mouthPucker || 0;
  target.funnel = shapes.mouthFunnel || 0;
  target.press = avg("mouthPressLeft", "mouthPressRight");
  target.upperUp = avg("mouthUpperUpLeft", "mouthUpperUpRight");
  target.cheekPuff = shapes.cheekPuff || 0;
  target.dimple = avg("mouthDimpleLeft", "mouthDimpleRight");
  target.stretch = avg("mouthStretchLeft", "mouthStretchRight");
  target.shrug = avg("mouthShrugUpper", "mouthShrugLower");
  target.rollLower = shapes.mouthRollLower || 0;
  target.browUp =
    ((shapes.browInnerUp || 0) +
      (shapes.browOuterUpLeft || 0) +
      (shapes.browOuterUpRight || 0)) /
    3;
  status("追従中");
  const left = lm[234],
    right = lm[454],
    top = lm[10],
    chin = lm[152],
    nose = lm[1],
    faceH = Math.max(0.001, Math.hypot(chin.x - top.x, chin.y - top.y)),
    faceW = Math.hypot(right.x - left.x, right.y - left.y),
    rawM = Math.hypot(lm[14].x - lm[13].x, lm[14].y - lm[13].y) / faceH;
  target.mouth = Math.max(0, Math.min(1, (rawM - 0.008) / 0.18));
  if (Math.abs(rawM - lastMouth) > 0.0022) talkingUntil = now + 450;
  if (target.mouth < 0.025) talkingUntil = 0;
  lastMouth = rawM;
  const er = (a, b, c, d) =>
    Math.hypot(a.x - b.x, a.y - b.y) /
    Math.max(0.001, Math.hypot(c.x - d.x, c.y - d.y));
  target.eyeOpen = Math.max(
    0,
    Math.min(
      1.4,
      ((er(lm[159], lm[145], lm[33], lm[133]) +
        er(lm[386], lm[374], lm[362], lm[263])) /
        2 -
        0.06) /
        0.38,
    ),
  );
  if (lm.length > 477) {
    const center = (p) =>
        p.reduce(
          (s, v) => ({ x: s.x + v.x / p.length, y: s.y + v.y / p.length }),
          { x: 0, y: 0 },
        ),
      gaze = (iris, a, b) => {
        const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          w = Math.hypot(a.x - b.x, a.y - b.y);
        return { x: ((iris.x - c.x) / w) * 4, y: ((iris.y - c.y) / w) * 5 };
      };
    const a = gaze(center(lm.slice(468, 473)), lm[33], lm[133]),
      b = gaze(center(lm.slice(473, 478)), lm[362], lm[263]);
    target.gazeX = -Math.max(-1, Math.min(1, (a.x + b.x) / 2));
    target.gazeY = Math.max(-1, Math.min(1, (a.y + b.y) / 2));
  }
  target.x = (0.5 - nose.x) * 2.4;
  target.y = (nose.y - 0.48) * 1.9;
  target.roll = -Math.atan2(right.y - left.y, right.x - left.x);
  target.depth = Math.max(-1, Math.min(1, (faceW - 0.29) * 5));
}
function draw(img, x, y, rot = 0, sx = 1, sy = 1) {
  ctx.save();
  ctx.translate(627 + x, 627 + y);
  ctx.rotate(rot);
  ctx.scale(sx, sy);
  ctx.drawImage(img, -627, -627);
  ctx.restore();
}
function eyePiece(img, sourceX, targetX, x, y, gazeX = 0, gazeY = 0) {
  ctx.save();
  ctx.translate(targetX + x, 614 + y);
  ctx.beginPath();
  ctx.ellipse(0, 0, 72, 51, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.scale(0.49, 0.65);
  ctx.drawImage(img, -sourceX + gazeX / 0.49, -614 + gazeY / 0.65);
  ctx.restore();
}
function anchored(img, b, x, y, w, sx = 1, sy = 1) {
  const s = w / b.w;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * sx, s * sy);
  ctx.drawImage(img, b.x, b.y, b.w, b.h, -b.w / 2, -b.h / 2, b.w, b.h);
  ctx.restore();
}
function rigPart(name, x, y, rot = 0, sx = 1, sy = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(sx, sy);
  ctx.drawImage(atlasParts[name], -209, -209);
  ctx.restore();
}
function drawBrows(kind, x, y) {
  const gap = (mapping.layout.browGap - 204) / 2,
    dy =
      y +
      mapping.layout.browY +
      (kind === "raised" ? -10 : kind === "frown" ? 6 : 0),
    baseTilt = Number(mapping.layout.browTilt) || 0,
    slope = baseTilt + (kind === "frown" ? 7 : kind === "raised" ? -7 : 0);
  ctx.save();
  ctx.translate(627 + x + mapping.layout.browX, 526 + dy);
  ctx.rotate((mapping.layout.browRotation * Math.PI) / 180);
  ctx.scale(mapping.layout.browScale, mapping.layout.browScale);
  ctx.strokeStyle = "#17100e";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(445 - gap - 627, 0);
  ctx.lineTo(565 - gap - 627, slope);
  ctx.moveTo(689 + gap - 627, slope);
  ctx.lineTo(809 + gap - 627, 0);
  ctx.stroke();
  ctx.restore();
}
function drawWhitePair(side, x, y) {
  anchored(
    whitePairs[side],
    whitePairBounds[side],
    (side ? 729 : 525) + x,
    614 + y,
    118,
  );
}
function anchoredOn(g, img, b, x, y, w) {
  const s = w / b.w;
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.drawImage(img, b.x, b.y, b.w, b.h, -b.w / 2, -b.h / 2, b.w, b.h);
  g.restore();
}
function drawMutoSclera(side, stage, x, y) {
  if (stage >= 5) return;
  const key = side ? "right" : "left",
    adjustment = sclera[key],
    blink = [1, 0.9, 0.72, 0.5, 0.24, 0][stage],
    cx = 627 + ((side ? 1 : -1) * mapping.layout.eyeGap) / 2 + x + adjustment.x,
    cy = mapping.layout.eyeY + y + adjustment.y,
    width = 62 * adjustment.scale,
    height = Math.max(3, 45 * adjustment.scale * blink);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((adjustment.rotation * Math.PI) / 180);
  ctx.beginPath();
  ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
  ctx.ellipse((side ? -1 : 1) * width * 0.43, 0, width * 0.78, height * 0.82, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill("evenodd");
  ctx.restore();
}
function drawBlinkAsset(assetId, x, y) {
  const stage =
    assetId === "normal"
      ? 3
      : Math.max(0, Math.min(5, Number(assetId.split("-")[1]) || 0));
  ctx.save();
  ctx.translate(627 + x + mapping.layout.eyeX, mapping.layout.eyeY + y);
  ctx.rotate((mapping.layout.eyeRotation * Math.PI) / 180);
  ctx.scale(mapping.layout.eyeScale, mapping.layout.eyeScale);
  ctx.translate(-(627 + x), -(mapping.layout.eyeY + y));
  for (let side = 0; side < 2; side++) drawMutoSclera(side, stage, x, y);
  for (let side = 0; side < 2; side++)
    anchored(
      shapePairs[stage][side],
      shapeBounds[stage][side],
      627 + ((side ? 1 : -1) * mapping.layout.eyeGap) / 2 + x,
      mapping.layout.eyeY + y,
      118,
    );
  ctx.restore();
  if (stage >= 5) return;
  irisCtx.globalCompositeOperation = "source-over";
  irisCtx.clearRect(0, 0, 1254, 1254);
  irisCtx.save();
  irisCtx.translate(627 + x + mapping.layout.eyeX, mapping.layout.eyeY + y);
  irisCtx.rotate((mapping.layout.eyeRotation * Math.PI) / 180);
  irisCtx.scale(mapping.layout.eyeScale, mapping.layout.eyeScale);
  irisCtx.translate(-(627 + x), -(mapping.layout.eyeY + y));
  for (let side = 0; side < 2; side++) {
    const key = side ? "right" : "left",
      adjustment = sclera[key],
      blink = [1, 0.9, 0.72, 0.5, 0.24, 0][stage],
      scleraX = 627 + ((side ? 1 : -1) * mapping.layout.eyeGap) / 2 + x + adjustment.x,
      scleraY = mapping.layout.eyeY + y + adjustment.y,
      width = 62 * adjustment.scale,
      height = Math.max(3, 45 * adjustment.scale * blink),
      cx = 627 + ((side ? 1 : -1) * mapping.layout.irisGap) / 2 + x,
      cy = mapping.layout.eyeY + mapping.layout.irisY + y;
    irisCtx.save();
    irisCtx.translate(scleraX, scleraY);
    irisCtx.rotate((adjustment.rotation * Math.PI) / 180);
    irisCtx.beginPath();
    irisCtx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
    irisCtx.ellipse((side ? -1 : 1) * width * 0.43, 0, width * 0.78, height * 0.82, 0, 0, Math.PI * 2);
    irisCtx.clip("evenodd");
    irisCtx.rotate((-adjustment.rotation * Math.PI) / 180);
    irisCtx.translate(-scleraX, -scleraY);
    anchoredOn(
      irisCtx,
      irisPairs[side],
      irisPairBounds[side],
      cx + pose.gazeX * 11,
      cy + pose.gazeY * 6,
      mapping.layout.irisSize,
    );
    irisCtx.restore();
  }
  irisCtx.globalCompositeOperation = "source-over";
  irisCtx.restore();
  ctx.drawImage(irisLayer, 0, 0);
}
const featureKeys = {
  eye: ["eyeOpen"],
  brow: ["browUp", "frown"],
  mouth: [
    "mouth",
    "smile",
    "smileL",
    "smileR",
    "frown",
    "frownL",
    "frownR",
    "pucker",
    "funnel",
    "press",
    "upperUp",
    "cheekPuff",
    "dimple",
    "stretch",
    "shrug",
    "rollLower",
  ],
};
function snapshot(type) {
  return Object.fromEntries(
    featureKeys[type].map((k) => [k, Number(target[k]) || 0]),
  );
}
function nearest(type, fallback) {
  const list = mapping.profiles[type],
    active = list.map((v, i) => [v, i]).filter(([v]) => v);
  if (!active.length) return fallback;
  let best = active[0][1],
    score = Infinity;
  for (const [sample, i] of active) {
    let d = 0;
    for (const k of featureKeys[type]) {
      const delta = (Number(pose[k]) || 0) - (Number(sample[k]) || 0);
      d += delta * delta;
    }
    if (d < score) {
      score = d;
      best = i;
    }
  }
  return best;
}
const mouthFamilyEnds = [
  [0, 3],
  [4, 7],
  [8, 11],
  [12, 15],
];
function mouthPairFit(family) {
  const [minIndex, maxIndex] = mouthFamilyEnds[family],
    min = mapping.profiles.mouth[minIndex],
    max = mapping.profiles.mouth[maxIndex];
  if (!min || !max) return null;
  const span = Math.max(
      0.035,
      (Number(max.mouth) || 0) - (Number(min.mouth) || 0),
    ),
    t = Math.max(
      0,
      Math.min(
        1,
        ((Number(pose.mouth) || 0) - (Number(min.mouth) || 0)) / span,
      ),
    );
  let score = 0;
  for (const k of featureKeys.mouth) {
    if (k === "mouth") continue;
    const expected =
        (Number(min[k]) || 0) +
        ((Number(max[k]) || 0) - (Number(min[k]) || 0)) * t,
      delta = (Number(pose[k]) || 0) - expected;
    score += delta * delta;
  }
  const wideEye = Math.max(
    0,
    Math.min(1, ((Number(pose.eyeOpen) || 0) - 0.94) / 0.28),
  );
  if (family === 2) score -= wideEye * 0.11;
  else score += wideEye * 0.018;
  return { family, t, score };
}
function nearestMouth() {
  const fits = mouthFamilyEnds
    .map((_, family) => mouthPairFit(family))
    .filter(Boolean);
  if (!fits.length) {
    mouthChoice.representative = null;
    mouthChoice.pending = null;
    mouthChoice.pendingFrames = 0;
    return mouthState();
  }
  fits.sort((a, b) => a.score - b.score);
  const best = fits[0],
    current = fits.find((v) => v.family === mouthChoice.representative);
  if (!current) {
    mouthChoice.representative = best.family;
    mouthChoice.pending = null;
    mouthChoice.pendingFrames = 0;
  } else if (best.family === current.family) {
    mouthChoice.pending = null;
    mouthChoice.pendingFrames = 0;
  } else {
    if (mouthChoice.pending === best.family) mouthChoice.pendingFrames++;
    else {
      mouthChoice.pending = best.family;
      mouthChoice.pendingFrames = 1;
    }
    if (mouthChoice.pendingFrames >= 4 && best.score + 0.03 < current.score) {
      mouthChoice.representative = best.family;
      mouthChoice.pending = null;
      mouthChoice.pendingFrames = 0;
    }
  }
  const selected =
      fits.find((v) => v.family === mouthChoice.representative) || best,
    stage =
      selected.t < 0.16 ? 0 : selected.t < 0.46 ? 1 : selected.t < 0.76 ? 2 : 3;
  mouthChoice.score = selected.score;
  return selected.family * 4 + stage;
}
function eyeTarget(open) {
  return open > 1.18
    ? 0
    : open > 1.02
      ? 1
      : open > 0.82
        ? 2
        : open > 0.52
          ? 3
          : open > 0.16
            ? 4
            : 5;
}
function mouthState() {
  const stage =
      pose.mouth < 0.07 ? 0 : pose.mouth < 0.26 ? 1 : pose.mouth < 0.58 ? 2 : 3,
    wideEyeFrown =
      pose.eyeOpen > 1.05 &&
      pose.smile < 0.5 &&
      pose.funnel < 0.35 &&
      pose.pucker < 0.45,
    family =
      pose.frown > 0.34 || wideEyeFrown
        ? 2
        : pose.funnel > 0.28 || pose.pucker > 0.43
          ? 3
          : pose.smile > 0.34
            ? 1
            : 0;
  return family * 4 + stage;
}
function browState() {
  return pose.browUp > 0.42 ? 0 : pose.frown > 0.32 ? 2 : 1;
}
function updateSecondary(now, rot) {
  const earFrequency = Math.max(
      0,
      Number(mapping.visual.earTwitchFrequency) || 0,
    ),
    earStrength = Math.max(0, Number(mapping.visual.earTwitchStrength) || 0),
    impulse = rot * 1.8 + pose.x * 0.025;
  sway.hair += (impulse - sway.hair) * 0.08;
  const ahogeGoal =
    -pose.roll * 78 -
    pose.x * 15 +
    Math.sin(now * 0.0031) * 8 +
    Math.sin(now * 0.0067) * 3;
  sway.ahoge += (ahogeGoal - sway.ahoge) * 0.085;
  sway.ahogeTip +=
    (sway.ahoge * 1.55 + Math.sin(now * 0.0084) * 6 - sway.ahogeTip) * 0.06;
  sway.cloth += (-rot * 0.45 - sway.cloth) * 0.045;
  sway.neck += (pose.y * 0.018 + rot * 0.16 - sway.neck) * 0.07;
  sway.string +=
    (sway.cloth * 2 + Math.sin(now * 0.004) * 0.018 * talk - sway.string) *
    0.06;
  const twitch = Math.sin(now * (0.0032 + earFrequency * 0.0028));
  sway.ear +=
    (Math.sin(now * 0.0019) * 0.018 * earStrength +
      (twitch > 0.985 - earFrequency * 0.018
        ? twitch * 0.075 * earStrength
        : 0) -
      sway.ear) *
    0.12;
  for (let i = 0; i < hairSprings.length; i++) {
    const spring = hairSprings[i],
      goal =
        i === 0
          ? sway.ahogeTip
          : (-pose.roll * 24 - pose.x * 5) * assembledHair[i].weight +
            Math.sin(now * 0.0015 + i * 0.71) * 0.65;
    spring.velocity +=
      (goal - spring.value) * (i === 0 ? 0.035 : 0.016 + i * 0.0007);
    spring.velocity *= i === 0 ? 0.9 : 0.85;
    spring.value += spring.velocity;
  }
  for (let i = 0; i < hairPieceMotion.length; i++) {
    const m = hairPieceMotion[i],
      p = hairPieceDefs[i],
      goal =
        (-pose.roll * 18 - pose.x * 5) * p.weight +
        Math.sin(now * (0.00115 + i * 0.00006) + m.phase) * (1.4 + i * 0.22) +
        sway.hair * (i < 3 ? 0.45 : 0.25);
    m.velocity += (goal - m.angle) * (0.012 + i * 0.0015);
    m.velocity *= 0.82 + i * 0.012;
    m.angle += m.velocity;
  }
}
function loosePiece(img, region, x, y, angle) {
  const [rx, ry, rw] = region;
  ctx.save();
  ctx.translate(rx + rw / 2 + x, ry + y);
  ctx.rotate(angle);
  ctx.drawImage(img, -rw / 2, 0);
  ctx.restore();
}
function drawFlexSprite(atlas, def, bend, x, y) {
  const [sx, sy, sw, sh] = def.src,
    [dx, dy, dw, dh] = def.dst,
    segments = def.reverse ? 42 : 14,
    overlap = def.reverse ? 4 : 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  for (let i = 0; i < segments; i++) {
    const srcY = Math.floor(sy + (i * sh) / segments),
      srcEnd = Math.ceil(sy + ((i + 1) * sh) / segments),
      srcH = Math.min(sy + sh - srcY, srcEnd - srcY + overlap),
      t = def.reverse ? 1 - (i + 0.5) / segments : (i + 0.5) / segments,
      shift = bend * t * t;
    ctx.drawImage(
      atlas,
      sx,
      srcY,
      sw,
      srcH,
      dx + x + shift,
      dy + y + (i * dh) / segments,
      dw + 1,
      dh / segments + 3,
    );
  }
}
function drawHairGroup(group, x, y, now, hit = false) {
  const groupY = group === "front" ? 28 : 0;
  for (let i = 0; i < hairPieceDefs.length; i++) {
    const p = hairPieceDefs[i];
    if (p.group !== group) continue;
    const m = hairPieceMotion[i],
      a = hairAdjustments[p.id],
      px = p.pivot[0],
      py = p.pivot[1],
      rawSway = Number(a.sway),
      swayAmount = Number.isFinite(rawSway) ? Math.max(0, rawSway) : 1,
      highlight = !hit && p.id === selectedHairId && now < highlightUntil;
    ctx.save();
    if (!hit && group === "back")
      ctx.filter = `brightness(${mapping.visual.backHairBrightness})`;
    if (highlight)
      ctx.filter =
        "brightness(1.2) drop-shadow(0 0 8px #ffe36a) drop-shadow(0 0 14px #ff9d2e)";
    ctx.translate(px + x + a.x, py + y + groupY + a.y);
    ctx.rotate(m.angle * 0.0028 * swayAmount + (a.rotation * Math.PI) / 180);
    ctx.translate(
      Math.sin(m.phase + now * 0.0012) * p.weight * 0.55 * swayAmount,
      0,
    );
    ctx.scale(a.scale, a.scale);
    ctx.drawImage(hit ? hairHitImages[i] : p.img, -px, -py);
    ctx.restore();
  }
}
function drawBackHair(x, y, now) {
  drawHairGroup("back", x, y, now);
}
function drawHairCrown() {}
function advanceBaton(state, wanted) {
  if (wanted !== state.to) {
    state.current = state.p >= 0.5 ? state.to : state.current;
    state.to = wanted;
    state.p = 0;
  }
  if (state.p < 1) state.p = Math.min(1, state.p + 0.14);
  return { index: state.p < 0.5 ? state.current : state.to, sx: 1, sy: 1 };
}
function mouthAssetInfo(index) {
  const id = mapping.mouth[index] || "speech-0",
    n = Number(id.split("-")[1]) || 0;
  return { img: speechMouths[n], b: speechBounds[n], scale: 0.52 };
}
function advanceMouthBaton(wanted) {
  const state = mouthBaton,
    clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  state.queued = wanted;
  if (state.p >= 1 && state.queued !== state.to) {
    state.current = state.to;
    state.to = state.queued;
    state.p = 0;
  }
  if (state.p < 1) state.p = Math.min(1, state.p + 0.16);
  if (state.p >= 1) return { index: state.to, sx: 1, sy: 1 };
  const from = mouthAssetInfo(state.current),
    to = mouthAssetInfo(state.to),
    fromW = Math.max(1, from.b.w * from.scale),
    fromH = Math.max(1, from.b.h * from.scale),
    toW = Math.max(1, to.b.w * to.scale),
    toH = Math.max(1, to.b.h * to.scale),
    ratioX = clamp(toW / fromW, 0.92, 1.08),
    ratioY = clamp(toH / fromH, 0.86, 1.14),
    first = state.p < 0.5,
    t = first ? state.p * 2 : (state.p - 0.5) * 2,
    ease = t * t * (3 - 2 * t);
  if (first)
    return {
      index: state.current,
      sx: 1 + (ratioX - 1) * ease,
      sy: 1 + (ratioY - 1) * ease,
    };
  return {
    index: state.to,
    sx: 1 / ratioX + (1 - 1 / ratioX) * ease,
    sy: 1 / ratioY + (1 - 1 / ratioY) * ease,
  };
}
function drawMouthFixed(info, x, y, sx = 1, sy = 1) {
  const scale = info.scale * mapping.layout.mouthScale;
  ctx.save();
  ctx.translate(x + mapping.layout.mouthX, y);
  ctx.rotate((mapping.layout.mouthRotation * Math.PI) / 180);
  ctx.scale(scale * sx, scale * sy);
  ctx.drawImage(
    info.img,
    info.b.x,
    info.b.y,
    info.b.w,
    info.b.h,
    -info.b.w / 2,
    -info.b.h / 2,
    info.b.w,
    info.b.h,
  );
  ctx.restore();
}
function outlinedLayer(drawLayer) {
  drawLayer();
}
function drawSkinLighting(x, y) {
  const amount = Math.max(
    0,
    Math.min(1, Number(mapping.visual.paintDepth) || 0),
  );
  if (!amount) return;
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.globalCompositeOperation = "screen";
  draw(skinHighlight, x, y);
  ctx.globalCompositeOperation = "multiply";
  draw(skinShadow, x, y);
  ctx.restore();
}
function compositeCharacter() {
  displayCtx.setTransform(1, 0, 0, 1, 0, 0);
  displayCtx.clearRect(0, 0, 1254, 1254);
  const layers = Math.max(
      0,
      Math.min(3, Math.round(mapping.visual.outlineLayers)),
    ),
    width = Math.max(1, Number(mapping.visual.outlineWidth) || 1);
  if (layers) {
    for (let layer = layers; layer >= 1; layer--) {
      tintCtx.setTransform(1, 0, 0, 1, 0, 0);
      tintCtx.clearRect(0, 0, 1254, 1254);
      tintCtx.drawImage(characterCanvas, 0, 0);
      tintCtx.globalCompositeOperation = "source-in";
      tintCtx.fillStyle = mapping.visual[`outlineColor${layer}`];
      tintCtx.fillRect(0, 0, 1254, 1254);
      tintCtx.globalCompositeOperation = "source-over";
      const radius = width * layer,
        samples = Math.max(20, Math.ceil(radius * 2.4));
      for (let i = 0; i < samples; i++) {
        const angle = (i * Math.PI * 2) / samples;
        displayCtx.drawImage(
          tintCanvas,
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
        );
      }
    }
  }
  displayCtx.drawImage(characterCanvas, 0, 0);
}
function drawFacePartHighlight(g, id, x, y, now) {
  if (!id.startsWith("__") || id === "__visual" || now >= highlightUntil)
    return;
  const pulse = 0.72 + 0.18 * Math.sin(now * 0.018),
    ellipse = (cx, cy, rx, ry) => {
      g.beginPath();
      g.ellipse(cx + x, cy + y, rx, ry, 0, 0, Math.PI * 2);
      g.stroke();
    };
  g.save();
  g.globalAlpha = pulse;
  g.strokeStyle = "#ffe36a";
  g.lineWidth = 9;
  g.shadowColor = "#ff9d2e";
  g.shadowBlur = 18;
  if (id === "__eye") {
    ellipse(627 - mapping.layout.eyeGap / 2, mapping.layout.eyeY, 82, 58);
    ellipse(627 + mapping.layout.eyeGap / 2, mapping.layout.eyeY, 82, 58);
  } else if (id === "__scleraLeft" || id === "__scleraRight") {
    const side = id === "__scleraRight" ? 1 : 0,
      adjustment = sclera[side ? "right" : "left"];
    ellipse(
      627 + (side ? 1 : -1) * mapping.layout.eyeGap / 2 + adjustment.x,
      mapping.layout.eyeY + adjustment.y,
      68 * adjustment.scale,
      52 * adjustment.scale,
    );
  } else if (id === "__iris") {
    const r = Math.max(25, mapping.layout.irisSize * 0.9);
    ellipse(
      627 - mapping.layout.irisGap / 2,
      mapping.layout.eyeY + mapping.layout.irisY,
      r,
      r,
    );
    ellipse(
      627 + mapping.layout.irisGap / 2,
      mapping.layout.eyeY + mapping.layout.irisY,
      r,
      r,
    );
  } else if (id === "__brow") {
    ellipse(
      505 - mapping.layout.browGap / 2 + 102,
      526 + mapping.layout.browY,
      78,
      27,
    );
    ellipse(
      749 + mapping.layout.browGap / 2 - 102,
      526 + mapping.layout.browY,
      78,
      27,
    );
  } else if (id === "__nose") ellipse(627, 695 + mapping.layout.noseY, 28, 38);
  else if (id === "__mouth")
    ellipse(
      627,
      756 + mapping.layout.mouthY,
      92 * mapping.layout.mouthScale,
      55 * mapping.layout.mouthScale,
    );
  g.restore();
}
function render(now) {
  if (!running && !obs) track(now);
  if (demo) send(now);
  for (const k in target)
    pose[k] +=
      (target[k] - pose[k]) *
      (k === "mouth"
        ? 0.3
        : k.startsWith("gaze")
          ? 0.22
          : k === "eyeOpen"
            ? 0.3
            : 0.09);
  talk += (Number(now < talkingUntil) - talk) * 0.18;
  const wanted = nearest("eye", eyeTarget(pose.eyeOpen));
  if (wanted !== blinkFrame && now - lastBlinkStep > 30) {
    blinkFrame += Math.sign(wanted - blinkFrame);
    lastBlinkStep = now;
  }
  characterCtx.setTransform(1, 0, 0, 1, 0, 0);
  characterCtx.clearRect(0, 0, 1254, 1254);
  ctx = characterCtx;
  const idleX = Math.sin(now * 0.00073) * 1.8,
    idleY = Math.sin(now * 0.00107) * 2.3,
    breath = Math.sin(now * 0.0021),
    x = pose.x * 48 + idleX,
    y = pose.y * 34 - pose.depth * 8 + idleY,
    rot = pose.roll * 0.48 + Math.sin(now * 0.00061) * 0.004,
    fit = 1 - Math.min(0.12, Math.abs(rot) * 0.18),
    outerScaleX = fit * (1 + breath * 0.0025),
    outerScaleY = fit * (1 + breath * 0.006);
  updateSecondary(now, rot);
  ctx.save();
  ctx.translate(627, 1190);
  ctx.scale(outerScaleX, outerScaleY);
  ctx.rotate(rot * 0.55);
  ctx.translate(-627, -1190);
  outlinedLayer(() => drawBackHair(x, y, now));
  outlinedLayer(() => {
    const bodyY = y + sway.neck * 7;
    draw(baseNoNose, x, bodyY);
    drawSkinLighting(x, bodyY);
  });
  outlinedLayer(() => {
    ctx.save();
    ctx.translate(
      627 + x + mapping.layout.noseX,
      695 + y + mapping.layout.noseY,
    );
    ctx.rotate((mapping.layout.noseRotation * Math.PI) / 180);
    ctx.scale(mapping.layout.noseScale, mapping.layout.noseScale);
    ctx.drawImage(nosePart, -25, -30);
    ctx.restore();
    drawBlinkAsset(mapping.eye[blinkFrame], x, y);
    const browVisual = advanceBaton(browBaton, nearest("brow", browState()));
    drawBrows(mapping.brow[browVisual.index], x, y);
    const mouthVisual = advanceMouthBaton(nearestMouth()),
      mouthInfo = mouthAssetInfo(mouthVisual.index);
    drawMouthFixed(
      mouthInfo,
      627 + x,
      756 + y + mapping.layout.mouthY,
      mouthVisual.sx,
      mouthVisual.sy,
    );
  });
  outlinedLayer(() => {
    drawHairGroup("upper", x, y, now);
    drawHairGroup("front", x, y, now);
  });
  ctx.restore();
  ctx = displayCtx;
  compositeCharacter();
  if ($("adjuster").open) {
    adjustCtx.setTransform(1, 0, 0, 1, 0, 0);
    adjustCtx.clearRect(0, 0, 1254, 1254);
    adjustCtx.drawImage(canvas, 0, 0);
    drawFacePartHighlight(adjustCtx, selectedHairId, x, y, now);
    hairHitCtx.setTransform(1, 0, 0, 1, 0, 0);
    hairHitCtx.clearRect(0, 0, 1254, 1254);
    ctx = hairHitCtx;
    ctx.save();
    ctx.translate(627, 1190);
    ctx.scale(outerScaleX, outerScaleY);
    ctx.rotate(rot * 0.55);
    ctx.translate(-627, -1190);
    drawHairGroup("back", x, y, now, true);
    drawHairGroup("upper", x, y, now, true);
    drawHairGroup("front", x, y, now, true);
    ctx.restore();
    ctx = displayCtx;
  }
  $("mouthValue").textContent = `${Math.round(pose.mouth * 100)}%`;
  $("gazeValue").textContent = pose.gazeX.toFixed(2);
  $("eyeValue").textContent = `${Math.round(pose.eyeOpen * 100)}%`;
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
function previewFor(type, id) {
  const c = document.createElement("canvas");
  c.className = "asset-preview";
  c.width = 192;
  c.height = 116;
  const g = c.getContext("2d");
  if (type === "eye") {
    const n =
        id === "normal"
          ? 3
          : Math.max(0, Math.min(5, Number(id.split("-")[1]) || 0)),
      b = shapeBounds[n][0];
    g.drawImage(shapePairs[n][0], b.x, b.y, b.w, b.h, 20, 15, 152, 86);
  } else if (type === "brow")
    g.drawImage(art.eyebrows, 430, 510, 390, 180, 0, 0, 192, 88);
  else {
    const n = Number(id.split("-")[1]) || 0,
      b = speechBounds[n];
    g.drawImage(speechMouths[n], b.x, b.y, b.w, b.h, 20, 20, 152, 76);
  }
  return c;
}
let captureTarget = null;
async function beginCapture(type, index, label) {
  if (demo) {
    demo = false;
    $("demo").textContent = "動きテスト";
  }
  if (!running && !(await start())) return;
  const preview = $("capturePreview");
  preview.srcObject = stream;
  await preview.play();
  captureTarget = { type, index };
  $("captureTitle").textContent =
    `「${label}」に使う実際の表情を作ってください`;
  $("capturePanel").hidden = false;
  $("capturePanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function closeCapture() {
  captureTarget = null;
  $("capturePanel").hidden = true;
}
function buildMapper() {
  const host = $("mappingTables");
  host.replaceChildren();
  appendVisualSection(host, mapping.visual, saveMapping);
  appendLayoutSection(host, mapping.layout, layoutControls, saveMapping);
  for (const type of ["eye", "brow", "mouth"]) {
    const group = document.createElement("section");
    group.className = "mapping-group";
    group.innerHTML = `<h3>${{ eye: "目（白目・瞼画像）", brow: "眉画像", mouth: "口画像" }[type]}</h3><small>${type === "mouth" ? "通常・笑顔・不機嫌・丸口ごとに、最小と最大の実際の口を登録します。その間の小・中は開き量から自動で選ばれ、形を近づけてから画像を渡すバトン変形で切り替わります。" : "各画像を表示したい実際の顔を、カメラで1枚ずつ登録します。"}</small>`;
    stateLabels[type].forEach((label, index) => {
      if (type === "mouth" && index % 4 !== 0 && index % 4 !== 3) return;
      const shownLabel =
          type === "mouth"
            ? `${["通常", "笑顔", "不機嫌", "丸口"][Math.floor(index / 4)]}（${index % 4 === 0 ? "最小" : "最大"}）`
            : label,
        row = document.createElement("div");
      row.className = "mapping-row";
      const title = document.createElement("div");
      title.innerHTML = `<strong>${shownLabel}</strong><div class="assign-state ${mapping.profiles[type][index] ? "done" : ""}">${mapping.profiles[type][index] ? "登録済み" : "未登録"}</div>`;
      const preview = previewFor(type, mapping[type][index]);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = mapping.profiles[type][index]
        ? "再割り当て"
        : "割り当てる";
      button.onclick = () => beginCapture(type, index, shownLabel);
      row.append(title, preview, button);
      group.append(row);
    });
    host.append(group);
  }
}
function downloadJson() {
  const all = {
      format: "vtuber-studio-settings",
      version: 1,
      member: 5,
      mapping,
      sclera,
      hairAdjustments,
    },
    blob = new Blob([JSON.stringify(all, null, 2)], {
      type: "application/json",
    }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "muto-all-settings.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

const partControlDefs = [
  ["x", "左右位置", -220, 220, 1],
  ["y", "上下位置", -220, 220, 1],
  ["scale", "大きさ", 0.45, 1.65, 0.01],
  ["rotation", "角度", -45, 45, 0.5],
  ["sway", "揺れやすさ", 0, 3, 0.05],
];
const facePartDefs = {
  __scleraLeft: {
    label: "左の白目",
    controls: [
      ["x", "左右位置", -100, 100, 1], ["y", "上下位置", -80, 80, 1],
      ["scale", "大きさ", 0.45, 1.8, 0.01], ["rotation", "角度", -45, 45, 0.5],
    ],
    source: () => sclera.left,
  },
  __scleraRight: {
    label: "右の白目",
    controls: [
      ["x", "左右位置", -100, 100, 1], ["y", "上下位置", -80, 80, 1],
      ["scale", "大きさ", 0.45, 1.8, 0.01], ["rotation", "角度", -45, 45, 0.5],
    ],
    source: () => sclera.right,
  },
  __eye: {
    label: "目（白目）",
    controls: layoutControls.filter((v) =>
      ["eyeGap", "eyeX", "eyeY", "eyeScale", "eyeRotation"].includes(v[0]),
    ),
  },
  __iris: {
    label: "瞳",
    controls: layoutControls.filter((v) =>
      ["irisGap", "irisY", "irisSize"].includes(v[0]),
    ),
  },
  __brow: {
    label: "眉",
    controls: layoutControls.filter((v) =>
      [
        "browGap",
        "browX",
        "browY",
        "browTilt",
        "browScale",
        "browRotation",
      ].includes(v[0]),
    ),
  },
  __nose: {
    label: "鼻",
    controls: layoutControls.filter((v) => v[0].startsWith("nose")),
  },
  __mouth: {
    label: "口",
    controls: layoutControls.filter((v) =>
      ["mouthX", "mouthY", "mouthScale", "mouthRotation"].includes(v[0]),
    ),
  },
  __ears: {
    label: "耳のピクピク",
    controls: [
      ["earTwitchFrequency", "ピクピク頻度", 0, 3, 0.05],
      ["earTwitchStrength", "ピクピク度", 0, 3, 0.05],
    ],
    visual: true,
  },
};
function selectHair(id) {
  if (!hairAdjustments[id]) return;
  selectedHairId = id;
  highlightUntil = performance.now() + 1100;
  buildAdjuster();
}
function selectAdjustPart(id) {
  selectedHairId = id;
  highlightUntil = performance.now() + 1100;
  buildAdjuster();
}
function makeSlider(host, key, label, min, max, step, value, oninput) {
  const wrap = document.createElement("label");
  wrap.className = "part-control";
  const name = document.createElement("span");
  name.textContent = label;
  const output = document.createElement("output");
  output.textContent = String(value);
  const input = document.createElement("input");
  input.type = "range";
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = value;
  input.oninput = () => {
    output.textContent = input.value;
    oninput(Number(input.value));
  };
  wrap.append(name, output, input);
  host.append(wrap);
}
function buildAdjuster() {
  const list = $("partList"),
    controls = $("partSliders");
  list.replaceChildren();
  const faceTitle = document.createElement("h3");
  faceTitle.textContent = "顔・耳";
  list.append(faceTitle);
  for (const [id, def] of Object.entries(facePartDefs)) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = def.label;
    button.classList.toggle("active", id === selectedHairId);
    button.onclick = () => selectAdjustPart(id);
    list.append(button);
  }
  const generalTitle = document.createElement("h3");
  generalTitle.textContent = "全体調整";
  list.append(generalTitle);
  {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "見た目・アウトライン";
    button.classList.toggle("active", selectedHairId === "__visual");
    button.onclick = () => {
      selectedHairId = "__visual";
      buildAdjuster();
    };
    list.append(button);
  }
  for (const group of ["front", "upper", "back"]) {
    const title = document.createElement("h3");
    title.textContent = { front: "前髪", upper: "上の髪", back: "後ろ髪" }[
      group
    ];
    list.append(title);
    for (const p of hairPieceDefs.filter((v) => v.group === group)) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = p.label;
      button.classList.toggle("active", p.id === selectedHairId);
      button.onclick = () => selectHair(p.id);
      list.append(button);
    }
  }
  controls.replaceChildren();
  if (facePartDefs[selectedHairId]) {
    const def = facePartDefs[selectedHairId],
      source = def.source ? def.source() : def.visual ? mapping.visual : mapping.layout;
    $("selectedPartName").textContent = def.label;
    for (const [key, label, min, max, step] of def.controls)
      makeSlider(controls, key, label, min, max, step, source[key], (value) => {
        source[key] = value;
        saveMapping();
      });
    return;
  }
  if (selectedHairId === "__visual") {
    $("selectedPartName").textContent = "見た目・アウトライン";
    for (const [key, label, min, max, step] of [
      ["paintDepth", "皮膚の陰影", 0, 1, 0.01],
      ["backHairBrightness", "後ろ髪の明度", 0.5, 1.2, 0.01],
      ["outlineLayers", "アウトラインの層数", 0, 3, 1],
      ["outlineWidth", "1層ごとの太さ", 1, 20, 1],
    ])
      makeSlider(
        controls,
        key,
        label,
        min,
        max,
        step,
        mapping.visual[key],
        (value) => {
          mapping.visual[key] = value;
          saveMapping();
        },
      );
    return;
  }
  const part =
      hairPieceDefs.find((p) => p.id === selectedHairId) || hairPieceDefs[0],
    values = hairAdjustments[part.id];
  $("selectedPartName").textContent = part.label;
  for (const [key, label, min, max, step] of partControlDefs)
    makeSlider(controls, key, label, min, max, step, values[key], (value) => {
      values[key] = value;
      saveHairAdjustments();
    });
}
adjustCanvas.addEventListener("pointerdown", (event) => {
  const rect = adjustCanvas.getBoundingClientRect(),
    x = Math.max(
      0,
      Math.min(
        1253,
        Math.floor(((event.clientX - rect.left) * 1254) / rect.width),
      ),
    ),
    y = Math.max(
      0,
      Math.min(
        1253,
        Math.floor(((event.clientY - rect.top) * 1254) / rect.height),
      ),
    ),
    index = hairHitCtx.getImageData(x, y, 1, 1).data[0] - 1;
  for (const [side, id] of [[0, "__scleraLeft"], [1, "__scleraRight"]]) {
    const adjustment = sclera[side ? "right" : "left"],
      cx = 627 + (side ? 1 : -1) * mapping.layout.eyeGap / 2 + adjustment.x,
      cy = mapping.layout.eyeY + adjustment.y;
    if (Math.hypot((x - cx) / (68 * adjustment.scale), (y - cy) / (52 * adjustment.scale)) <= 1)
      return selectAdjustPart(id);
  }
  if (index >= 0 && hairPieceDefs[index])
    return selectHair(hairPieceDefs[index].id);
  if (y > 700 && y < 845 && x > 485 && x < 770)
    return selectAdjustPart("__mouth");
  if (y > 650 && y < 735 && x > 580 && x < 675)
    return selectAdjustPart("__nose");
  if (y > 485 && y < 570 && x > 370 && x < 885)
    return selectAdjustPart("__brow");
  if (y > 555 && y < 680 && x > 360 && x < 895) {
    const irisY = mapping.layout.eyeY + mapping.layout.irisY,
      leftX = 627 - mapping.layout.irisGap / 2,
      rightX = 627 + mapping.layout.irisGap / 2,
      r = Math.max(30, mapping.layout.irisSize * 1.15);
    return selectAdjustPart(
      Math.hypot(x - leftX, y - irisY) < r ||
        Math.hypot(x - rightX, y - irisY) < r
        ? "__iris"
        : "__eye",
    );
  }
});
$("start").onclick = start;
$("demo").onclick = () => {
  demo = !demo;
  if (demo && running) stop();
  $("demo").textContent = demo ? "テスト停止" : "動きテスト";
};
$("full").onclick = () =>
  document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
$("openAdjuster").onclick = () => {
  if (
    !hairAdjustments[selectedHairId] &&
    !facePartDefs[selectedHairId] &&
    selectedHairId !== "__visual"
  )
    selectedHairId = "front-center";
  buildAdjuster();
  highlightUntil = performance.now() + 1100;
  $("adjuster").showModal();
};
$("resetPart").onclick = () => {
  if (hairAdjustments[selectedHairId]) {
    hairAdjustments[selectedHairId] = defaultHairAdjustment();
    saveHairAdjustments();
  } else if (facePartDefs[selectedHairId]) {
    const def = facePartDefs[selectedHairId],
      source = def.source ? def.source() : def.visual ? mapping.visual : mapping.layout,
      defaults = def.source
        ? defaultSclera[selectedHairId === "__scleraLeft" ? "left" : "right"]
        : def.visual ? defaultVisual : defaultLayout;
    for (const [key] of def.controls) source[key] = defaults[key];
    saveMapping();
  } else if (selectedHairId === "__visual") {
    mapping.visual = { ...defaultVisual };
    saveMapping();
  } else return;
  highlightUntil = performance.now() + 1100;
  buildAdjuster();
};
$("openMapper").onclick = () => {
  buildMapper();
  $("mapper").showModal();
};
$("commitFace").onclick = () => {
  if (!captureTarget) return;
  const { type, index } = captureTarget;
  mapping.profiles[type][index] = snapshot(type);
  saveMapping();
  closeCapture();
  buildMapper();
  status("実際の表情を登録しました");
};
$("cancelCapture").onclick = closeCapture;
$("mapper").addEventListener("close", closeCapture);
$("exportJson").onclick = downloadJson;
$("exportAll").onclick = downloadJson;
$("resetMapping").onclick = () => {
  mapping = clone(defaultMap);
  saveMapping();
  closeCapture();
  buildMapper();
};
$("importJson").onchange = async (e) => {
  try {
    const raw = JSON.parse(await e.target.files[0].text()),
      next = raw.mapping || raw;
    if (!validMap(next)) throw new Error("形式が違います");
    mapping = {
      ...next,
      layout: { ...defaultLayout, ...next.layout },
      visual: { ...defaultVisual, ...next.visual },
    };
    sclera = {
      left: { ...defaultSclera.left, ...(raw.sclera?.left || {}) },
      right: { ...defaultSclera.right, ...(raw.sclera?.right || {}) },
    };
    if (raw.hairAdjustments) {
      hairAdjustments = Object.fromEntries(
        hairPieceDefs.map((p) => [
          p.id,
          { ...defaultHairAdjustment(), ...(raw.hairAdjustments[p.id] || {}) },
        ]),
      );
      saveHairAdjustments();
    }
    saveMapping();
    closeCapture();
    buildMapper();
    status("全設定JSONを読み込みました");
  } catch (err) {
    alert(`JSONを読み込めません：${err.message}`);
  }
  e.target.value = "";
};
addEventListener("keydown", (e) => {
  if (e.key === "F8") {
    e.preventDefault();
    const hidden = !$("exportAll").hidden;
    $("exportAll").hidden = hidden;
    $("exportJson").hidden = hidden;
  }
});

if (query.get("desktop") === "1") {
  setTimeout(() => {
    if (!running) start();
  }, 350);
}
