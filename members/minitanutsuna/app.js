const $ = (id) => document.getElementById(id);
const canvas = $("stage");
const ctx = canvas.getContext("2d");
const video = $("camera");
const query = new URLSearchParams(location.search);
const obsMode = query.get("obs") === "1";
const member = "9";

document.body.classList.toggle("obs", obsMode);
document.body.classList.toggle("green", obsMode && query.get("bg") === "green");
document.body.classList.toggle("blue", obsMode && query.get("bg") === "blue");
document.body.classList.toggle("transparent", obsMode && query.get("bg") === "transparent");
document.documentElement.classList.toggle("transparent", obsMode && query.get("bg") === "transparent");

const images = {};
for (const name of ["body", "head", ...Array.from({ length: 10 }, (_, i) => "expressions/expression-" + String(i + 1).padStart(2, "0"))]) {
  const image = new Image();
  image.src = `${name}.png`;
  await image.decode();
  images[name] = image;
}
const expressions = Array.from({ length: 10 }, (_, i) => images["expressions/expression-" + String(i + 1).padStart(2, "0")]);
const featureKeys = ["eyeOpen", "browUp", "browDown", "mouthOpen", "smileL", "smileR", "frownL", "frownR", "pucker", "funnel", "press", "upperUp", "cheekPuff", "dimple", "stretch", "shrug", "rollLower"];
const defaultMapping = { version: 1, member: 9, profiles: Array(10).fill(null) };
let mapping = structuredClone(defaultMapping);
try {
  const response = await fetch("/settings?member=" + member + "&t=" + Date.now(), { cache: "no-store" });
  if (response.ok) {
    const saved = await response.json(), candidate = saved.expressionMapping || saved;
    if (candidate?.version === 1 && Array.isArray(candidate.profiles) && candidate.profiles.length === 10) mapping = candidate;
  }
} catch (error) { console.warn("表情設定を読み込めませんでした", error); }
let saveTimer = 0;
function saveMapping() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fetch("/settings?member=" + member, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expressionMapping: mapping }) }).catch((error) => console.error("表情設定を保存できません", error)), 120);
}

const config = { rotationAmount: 72, smoothAmount: 82, sizeAmount: 94 };
try { Object.assign(config, JSON.parse(localStorage.miniTanutsunaConfig || "{}")); } catch {}
for (const id of Object.keys(config)) {
  const input = $(id);
  input.value = config[id];
  input.nextElementSibling.value = config[id];
  input.addEventListener("input", () => {
    config[id] = +input.value;
    input.nextElementSibling.value = input.value;
    localStorage.miniTanutsunaConfig = JSON.stringify(config);
  });
}

const base = `http://127.0.0.1:8777/minitanutsuna/?obs=1&member=${member}`;
$("obsLinks").innerHTML = `<strong>OBSリンク</strong><a href="${base}&bg=transparent">透過</a><a href="${base}&bg=green">GB</a><a href="${base}&bg=blue">BB</a>`;

let faceLandmarker;
let stream;
let running = false;
let demo = false;
let lastVideoTime = -1;
let lastSent = 0;
const target = { x: 0, y: 0, roll: 0, depth: 0, ...Object.fromEntries(featureKeys.map((key) => [key, key === "eyeOpen" ? 1 : 0])) };
const pose = { ...target, bodyX: 0, bodyY: 0 };

function setStatus(text) { $("status").textContent = text; }

async function start() {
  if (running) return stop();
  setStatus("許可を待っています…");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
    video.srcObject = stream;
    await video.play();
    const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm");
    const files = await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm");
    faceLandmarker = await vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: "GPU" },
      runningMode: "VIDEO", numFaces: 1, minFaceDetectionConfidence: 0.45, minTrackingConfidence: 0.45, outputFaceBlendshapes: true,
    });
    running = true;
    demo = false;
    $("start").textContent = "停止";
    setStatus("追従中");
    requestAnimationFrame(trackCamera);
  } catch (error) {
    console.error(error);
    setStatus("カメラを開始できません");
  }
}

function stop() {
  stream?.getTracks().forEach((track) => track.stop());
  faceLandmarker?.close();
  stream = null;
  faceLandmarker = null;
  running = false;
  $("start").textContent = "カメラを開始";
  setStatus("停止中");
}

function applyFace(result) {
  const landmarks = result.faceLandmarks[0];
  const left = landmarks[234], right = landmarks[454], nose = landmarks[1];
  const faceWidth = Math.hypot(right.x - left.x, right.y - left.y);
  target.x = (nose.x - 0.5) * -2.4;
  target.y = (nose.y - 0.48) * 2;
  target.roll = -Math.atan2(right.y - left.y, right.x - left.x);
  target.depth = Math.max(-1, Math.min(1, (faceWidth - 0.29) * 5.5));
  const top = landmarks[10], chin = landmarks[152];
  const faceHeight = Math.max(0.001, Math.hypot(chin.x - top.x, chin.y - top.y));
  const shapes = Object.fromEntries((result.faceBlendshapes?.[0]?.categories || []).map((item) => [item.categoryName, item.score]));
  const average = (leftName, rightName) => ((shapes[leftName] || 0) + (shapes[rightName] || 0)) / 2;
  const eyeRatio = (a, b, c, d) => Math.hypot(a.x - b.x, a.y - b.y) / Math.max(0.001, Math.hypot(c.x - d.x, c.y - d.y));
  target.eyeOpen = Math.max(0, Math.min(1.4, ((eyeRatio(landmarks[159], landmarks[145], landmarks[33], landmarks[133]) + eyeRatio(landmarks[386], landmarks[374], landmarks[362], landmarks[263])) / 2 - 0.06) / 0.38));
  target.mouthOpen = Math.max(0, Math.min(1, (Math.hypot(landmarks[14].x - landmarks[13].x, landmarks[14].y - landmarks[13].y) / faceHeight - 0.008) / 0.18));
  target.browUp = ((shapes.browInnerUp || 0) + (shapes.browOuterUpLeft || 0) + (shapes.browOuterUpRight || 0)) / 3;
  target.browDown = average("browDownLeft", "browDownRight");
  target.smileL = shapes.mouthSmileLeft || 0; target.smileR = shapes.mouthSmileRight || 0;
  target.frownL = shapes.mouthFrownLeft || 0; target.frownR = shapes.mouthFrownRight || 0;
  target.pucker = shapes.mouthPucker || 0; target.funnel = shapes.mouthFunnel || 0;
  target.press = average("mouthPressLeft", "mouthPressRight"); target.upperUp = average("mouthUpperUpLeft", "mouthUpperUpRight");
  target.cheekPuff = shapes.cheekPuff || 0; target.dimple = average("mouthDimpleLeft", "mouthDimpleRight");
  target.stretch = average("mouthStretchLeft", "mouthStretchRight"); target.shrug = average("mouthShrugUpper", "mouthShrugLower"); target.rollLower = shapes.mouthRollLower || 0;
}

function sendPose(now) {
  if (obsMode || now - lastSent < 45) return;
  lastSent = now;
  fetch(`/pose?member=${member}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target) }).catch(() => {});
}

function trackCamera(now) {
  if (!running) return;
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = faceLandmarker?.detectForVideo(video, now);
    if (result?.faceLandmarks?.[0]) { applyFace(result); setStatus("追従中"); }
    else setStatus("顔を探しています…");
    sendPose(now);
  }
  requestAnimationFrame(trackCamera);
}

if (obsMode) {
  const events = new EventSource(`/events?member=${member}`);
  events.onmessage = (event) => {
    try {
      const incoming = JSON.parse(event.data);
      for (const key of ["x", "y", "roll", "depth", ...featureKeys]) if (Number.isFinite(incoming[key])) target[key] = incoming[key];
    } catch {}
  };
}

$("start").addEventListener("click", start);
$("demo").addEventListener("click", () => {
  demo = !demo;
  if (demo && running) stop();
  $("demo").textContent = demo ? "動きテストを停止" : "動きテスト";
  setStatus(demo ? "テスト動作中" : "待機中");
});
$("full").addEventListener("click", async () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());

let captureIndex = null;
function snapshotFace() { return Object.fromEntries(featureKeys.map((key) => [key, Number(target[key]) || 0])); }
function distance(profile) {
  let score = 0;
  for (const key of featureKeys) {
    const weight = key === "eyeOpen" || key === "mouthOpen" ? 1.8 : 1;
    const delta = (Number(pose[key]) || 0) - (Number(profile[key]) || 0);
    score += delta * delta * weight;
  }
  return score;
}
function nearestExpression(fallback = 0) {
  const registered = mapping.profiles.map((profile, index) => ({ profile, index })).filter((item) => item.profile);
  if (!registered.length) return fallback;
  registered.sort((a, b) => distance(a.profile) - distance(b.profile));
  return registered[0].index;
}
function buildMapper() {
  $("expressionState").textContent = mapping.profiles.filter(Boolean).length + "/10表情の顔を登録済み";
  const host = $("mappingTables"); host.replaceChildren();
  expressions.forEach((image, index) => {
    const row = document.createElement("article"); row.className = "mapping-row";
    const preview = document.createElement("img"); preview.src = image.src; preview.alt = "表情" + (index + 1);
    const info = document.createElement("div");
    info.innerHTML = "<strong>表情 " + (index + 1) + "</strong><div class=\"assign-state " + (mapping.profiles[index] ? "done" : "") + "\">" + (mapping.profiles[index] ? "顔を登録済み" : "未登録") + "</div>";
    const button = document.createElement("button"); button.type = "button"; button.textContent = mapping.profiles[index] ? "顔を再登録" : "この顔を登録";
    button.onclick = () => beginCapture(index);
    row.append(preview, info, button); host.append(row);
  });
}
async function beginCapture(index) {
  if (demo) { demo = false; $("demo").textContent = "動きテスト"; }
  if (!running) await start();
  if (!running) return;
  captureIndex = index;
  $("capturePreview").srcObject = stream;
  await $("capturePreview").play();
  $("captureTitle").textContent = "表情 " + (index + 1) + " に使う顔を作ってください";
  $("capturePanel").hidden = false;
}
function closeCapture() { captureIndex = null; $("capturePanel").hidden = true; }
$("openMapper").onclick = () => { buildMapper(); $("mapper").showModal(); };
$("commitFace").onclick = () => { if (captureIndex === null) return; mapping.profiles[captureIndex] = snapshotFace(); saveMapping(); closeCapture(); buildMapper(); setStatus("表情の顔を登録しました"); };
$("cancelCapture").onclick = closeCapture;
$("mapper").addEventListener("close", closeCapture);
$("resetMapping").onclick = () => { mapping = structuredClone(defaultMapping); activeExpression = 0; pendingExpression = 0; saveMapping(); closeCapture(); buildMapper(); };

function drawFull(image) { ctx.drawImage(image, -500, -500, 1000, 1000); }

function render(now) {
  if (demo) {
    target.x = Math.sin(now * 0.0011) * 0.55;
    target.y = Math.sin(now * 0.0017) * 0.2;
    target.roll = Math.sin(now * 0.0013) * 0.19;
    target.depth = Math.sin(now * 0.0008) * 0.35;
    target.eyeOpen = 0.7 + Math.sin(now * 0.0032) * 0.65;
    target.mouthOpen = Math.max(0, Math.sin(now * 0.006));
    target.smileL = target.smileR = 0.5 + Math.sin(now * 0.0013) * 0.5;
    sendPose(now);
  }
  const follow = 0.025 + (1 - config.smoothAmount / 100) * 0.16;
  for (const key of ["x", "y", "roll", "depth", ...featureKeys]) pose[key] += (target[key] - pose[key]) * (featureKeys.includes(key) ? 0.22 : follow);
  pose.bodyX += (pose.x - pose.bodyX) * 0.02;
  pose.bodyY += (pose.y - pose.bodyY) * 0.02;

  ctx.clearRect(0, 0, 1000, 1000);
  const scale = config.sizeAmount / 100;
  const bodyX = pose.bodyX * 10;
  const bodyY = pose.bodyY * 7 + pose.depth * 4;
  const headX = pose.x * 24;
  const headY = pose.y * 14 - pose.depth * 8;
  const headRotation = pose.roll * (config.rotationAmount / 100);
  const wantedExpression = demo ? Math.floor(now / 900) % expressions.length : nearestExpression(0);
  if (wantedExpression === pendingExpression) pendingFrames++;
  else { pendingExpression = wantedExpression; pendingFrames = 1; }
  if (pendingFrames >= 5) activeExpression = pendingExpression;

  ctx.save();
  ctx.translate(500 + bodyX, 500 + bodyY);
  ctx.scale(scale, scale);
  drawFull(images.body);
  ctx.restore();

  // 4096px原画の首中心(2048, 1900)を、1000pxキャンバスの回転軸に変換。
  const neckX = 500;
  const neckY = 464;
  ctx.save();
  ctx.translate(500 + headX, 500 + headY);
  ctx.scale(scale, scale);
  ctx.translate(neckX - 500, neckY - 500);
  ctx.rotate(headRotation);
  ctx.translate(-(neckX - 500), -(neckY - 500));
  drawFull(images.head);
  drawFull(expressions[activeExpression]);
  ctx.restore();

  requestAnimationFrame(render);
}
let activeExpression = mapping.profiles.findIndex(Boolean);
if (activeExpression < 0) activeExpression = 0;
let pendingExpression = activeExpression, pendingFrames = 0;
$("expressionState").textContent = mapping.profiles.filter(Boolean).length + "/10表情の顔を登録済み";
requestAnimationFrame(render);
