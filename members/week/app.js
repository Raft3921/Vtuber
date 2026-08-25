import { drawFaceAccessory } from "../shared/accessory-hotkeys.js";

const canvas = document.querySelector("#stage");
const ctx = canvas.getContext("2d");
const video = document.querySelector("#camera");
const $ = (id) => document.getElementById(id);

const imageNames = [
  "body",
  "mouth",
  "!mouth",
  "head",
  "left",
  "right",
  "white_eye",
  "left_eye",
  "right_eye",
];
const images = Object.fromEntries(
  await Promise.all(
    imageNames.map(async (name) => {
      const img = new Image();
      img.src = `${name}.png`;
      await img.decode();
      return [name, img];
    }),
  ),
);

const config = {};
for (const id of [
  "mouthAmount",
  "moveAmount",
  "stretchAmount",
  "smoothAmount",
  "sizeAmount",
]) {
  const input = $(id);
  config[id] = +input.value;
  input.addEventListener("input", () => {
    config[id] = +input.value;
    input.nextElementSibling.value = input.value;
    save();
  });
}
for (const id of ["mirror", "showCamera", "transparent", "bgColor"]) {
  const input = $(id);
  config[id] = input.type === "checkbox" ? input.checked : input.value;
  input.addEventListener("input", () => {
    config[id] = input.type === "checkbox" ? input.checked : input.value;
    applyDisplay();
    save();
  });
}
try {
  Object.assign(config, JSON.parse(localStorage.weekLiveConfig || "{}"));
} catch {}
for (const [id, value] of Object.entries(config)) {
  const input = $(id);
  if (!input) continue;
  if (input.type === "checkbox") input.checked = value;
  else input.value = value;
  if (input.nextElementSibling?.tagName === "OUTPUT")
    input.nextElementSibling.value = value;
}
function save() {
  localStorage.weekLiveConfig = JSON.stringify(config);
}
function applyDisplay() {
  document.body.classList.toggle("transparent", !!config.transparent);
  document.querySelector(".stage-wrap").style.background = config.bgColor;
  video.style.display = config.showCamera ? "block" : "none";
  video.style.transform = config.mirror ? "scaleX(-1)" : "none";
}
applyDisplay();
const obsMode = new URLSearchParams(location.search).get("obs") === "1";
const obsBackground = new URLSearchParams(location.search).get("bg") || "green";
document.body.classList.toggle("obs-mode", obsMode);
document.body.classList.toggle(
  "obs-green",
  obsMode && obsBackground === "green",
);
document.body.classList.toggle("obs-blue", obsMode && obsBackground === "blue");

let faceLandmarker,
  stream,
  running = false,
  demo = false,
  trackingTimer = 0;
const target = {
  x: 0,
  y: 0,
  roll: 0,
  depth: 0,
  voice: 0,
  gazeX: 0,
  gazeY: 0,
  eyeOpen: 1,
};
const pose = {
  x: 0,
  y: 0,
  roll: 0,
  depth: 0,
  voice: 0,
  gazeX: 0,
  gazeY: 0,
  eyeOpen: 1,
  bodyX: 0,
  bodyY: 0,
};
let lastVideoTime = -1;
let surpriseMouth = false;
let lastRawMouth = 0,
  speakingUntil = 0,
  talkingAmount = 0;
let lastPoseSent = 0;

if (obsMode) {
  const events = new EventSource("/events");
  events.onmessage = (event) => {
    try {
      const incoming = JSON.parse(event.data);
      for (const key of [
        "x",
        "y",
        "roll",
        "depth",
        "voice",
        "gazeX",
        "gazeY",
        "eyeOpen",
      ])
        if (Number.isFinite(incoming[key])) target[key] = incoming[key];
      if (incoming.speaking) speakingUntil = performance.now() + 350;
      else if ((incoming.voice ?? 0) < 0.035) {
        speakingUntil = 0;
        talkingAmount = 0;
      }
    } catch {}
  };
}

function setStatus(text, live = false) {
  $("status").classList.toggle("live", live);
  $("status").querySelector("span").textContent = text;
}

async function start() {
  if (running) return stop();
  setStatus("許可を待っています…");
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    setStatus("顔追跡を読み込み中…");
    const vision = await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm"
    );
    const files = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm",
    );
    faceLandmarker = await vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
    running = true;
    demo = false;
    $("start").textContent = "停止";
    setStatus("追従中", true);
    if (video.requestVideoFrameCallback)
      video.requestVideoFrameCallback(cameraFrameLoop);
    else
      trackingTimer = setInterval(() => cameraFrameLoop(performance.now()), 33);
  } catch (error) {
    console.error(error);
    setStatus(
      location.protocol === "file:"
        ? "start.commandから開いてください"
        : "カメラを開始できません",
    );
  }
}
function stop() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  running = false;
  clearInterval(trackingTimer);
  trackingTimer = 0;
  faceLandmarker?.close();
  faceLandmarker = null;
  $("start").textContent = "カメラを開始";
  setStatus("停止中");
}
$("start").addEventListener("click", start);
$("demo").addEventListener("click", () => {
  demo = !demo;
  if (demo && running) stop();
  $("demo").textContent = demo ? "動きテストを停止" : "動きテスト";
  setStatus(demo ? "テスト動作中" : "待機中", demo);
});
$("panelToggle").addEventListener("click", () =>
  $("panel").classList.toggle("closed"),
);
$("fullscreen").addEventListener("click", async () => {
  if (!document.fullscreenElement)
    await document.documentElement.requestFullscreen();
  else await document.exitFullscreen();
});
$("obsGreen").addEventListener("click", () => {
  location.href = "?obs=1&bg=green";
});
$("obsBlue").addEventListener("click", () => {
  location.href = "?obs=1&bg=blue";
});

function sendPose(now) {
  if (obsMode || now - lastPoseSent <= 45) return;
  lastPoseSent = now;
  fetch("/pose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...target, speaking: demo || now < speakingUntil }),
  }).catch(() => {});
}
function cameraFrameLoop(now) {
  if (!running) return;
  track(now);
  sendPose(now);
  if (video.requestVideoFrameCallback)
    video.requestVideoFrameCallback(cameraFrameLoop);
}

function track(now) {
  const mirrorDirection = config.mirror ? -1 : 1;
  if (demo) {
    target.voice = Math.max(0, Math.sin(now * 0.007));
    target.x = Math.sin(now * 0.0011) * 0.72 * mirrorDirection;
    target.y = Math.sin(now * 0.0017) * 0.3;
    target.roll = Math.sin(now * 0.0013) * 0.12 * mirrorDirection;
    target.depth = Math.sin(now * 0.0008) * 0.7;
    target.gazeX = Math.sin(now * 0.0031) * mirrorDirection;
    target.gazeY = Math.sin(now * 0.0023);
    target.eyeOpen = 0.05 + 1.35 * (0.5 + 0.5 * Math.sin(now * 0.0041));
    return;
  }
  if (!running || video.readyState < 2 || video.currentTime === lastVideoTime)
    return;
  lastVideoTime = video.currentTime;
  const result = faceLandmarker?.detectForVideo(video, now);
  const lm = result?.faceLandmarks?.[0];
  if (!lm) {
    target.voice = 0;
    setStatus("顔を探しています…", true);
    return;
  }
  setStatus("追従中", true);
  const left = lm[234],
    right = lm[454],
    top = lm[10],
    chin = lm[152],
    nose = lm[1];
  const faceW = Math.hypot(right.x - left.x, right.y - left.y);
  const faceH = Math.max(0.001, Math.hypot(chin.x - top.x, chin.y - top.y));
  const mouthGap = Math.hypot(lm[14].x - lm[13].x, lm[14].y - lm[13].y);
  // 顔の大きさに対する唇の開きを0〜1へ正規化する。
  // 最大開口の基準は保ちつつ、唇の小さな離れも口パクとして拾う。
  const rawMouth = mouthGap / faceH;
  target.voice = Math.max(0, Math.min(1, (rawMouth - 0.008) / 0.186));
  // 音を使わず、唇の形が動き続けている間を「会話中」と判定する。
  if (Math.abs(rawMouth - lastRawMouth) > 0.0022) speakingUntil = now + 620;
  if (target.voice < 0.035) {
    speakingUntil = 0;
    talkingAmount = 0;
  }
  lastRawMouth = rawMouth;
  const eyeRatio = (topL, bottomL, cornerA, cornerB) =>
    Math.hypot(topL.x - bottomL.x, topL.y - bottomL.y) /
    Math.max(0.001, Math.hypot(cornerA.x - cornerB.x, cornerA.y - cornerB.y));
  const averageEyeRatio =
    (eyeRatio(lm[159], lm[145], lm[33], lm[133]) +
      eyeRatio(lm[386], lm[374], lm[362], lm[263])) /
    2;
  target.eyeOpen = Math.max(0, Math.min(1.45, (averageEyeRatio - 0.06) / 0.38));
  // 虹彩そのものの位置を両目から取得。首や顔の移動量は視線に使わない。
  if (lm.length > 477) {
    const irisA = lm.slice(468, 473),
      irisB = lm.slice(473, 478);
    const irisCenter = (points) =>
      points.reduce(
        (p, v) => ({
          x: p.x + v.x / points.length,
          y: p.y + v.y / points.length,
        }),
        { x: 0, y: 0 },
      );
    const eyeGaze = (iris, c1, c2) => {
      const center = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
      const width = Math.max(0.001, Math.hypot(c2.x - c1.x, c2.y - c1.y));
      return {
        x: ((iris.x - center.x) / width) * 4,
        y: ((iris.y - center.y) / width) * 5.5,
      };
    };
    const ga = eyeGaze(irisCenter(irisA), lm[33], lm[133]);
    const gb = eyeGaze(irisCenter(irisB), lm[362], lm[263]);
    target.gazeX =
      Math.max(-1, Math.min(1, (ga.x + gb.x) / 2)) * mirrorDirection;
    target.gazeY = Math.max(-1, Math.min(1, (ga.y + gb.y) / 2));
  }
  target.x = (nose.x - 0.5) * 2.6 * mirrorDirection;
  target.y = (nose.y - 0.48) * 2.1;
  target.roll =
    Math.atan2(right.y - left.y, right.x - left.x) * mirrorDirection;
  target.depth = Math.max(-1, Math.min(1, (faceW - 0.29) * 5.5));
}

function layer(img, x, y, rotation = 0, sx = 1, sy = 1, scale = 1) {
  ctx.save();
  ctx.translate(500 + x, 500 + y);
  ctx.rotate(rotation);
  ctx.scale(scale * sx, scale * sy);
  ctx.drawImage(img, -500, -500);
  ctx.restore();
}
function eyeLayer(img, x, y, rotation, eyeScaleY = 1, scale = 1) {
  ctx.save();
  ctx.translate(500 + x, 500 + y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.translate(0, 140);
  ctx.scale(1, eyeScaleY);
  ctx.drawImage(img, -500, -640);
  ctx.restore();
}
function mouthLayer(img, x, y, rotation, mouthScaleY = 1, scale = 1) {
  ctx.save();
  ctx.translate(500 + x, 500 + y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.translate(0, 290);
  ctx.scale(1, mouthScaleY);
  ctx.drawImage(img, -500, -790);
  ctx.restore();
}
function pupilLayer(
  img,
  x,
  y,
  rotation,
  gazeX,
  gazeY,
  eyeScaleY = 1,
  scale = 1,
) {
  ctx.save();
  ctx.translate(500 + x, 500 + y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.translate(0, 140);
  ctx.scale(1, eyeScaleY);
  ctx.translate(0, -140);
  // 白目の内側だけを表示領域にして、黒目が輪郭の外へ出ないようにする。
  ctx.beginPath();
  ctx.ellipse(-123, 141, 56, 27, 0, 0, Math.PI * 2);
  ctx.ellipse(115, 139, 56, 27, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, -500 + gazeX, -500 + gazeY);
  ctx.restore();
}
let lastRenderedAt = -Infinity;
function render(now) {
  const frameInterval = document.hidden || (!running && !demo && !obsMode) ? 100 : 0;
  if (now - lastRenderedAt < frameInterval) {
    requestAnimationFrame(render);
    return;
  }
  lastRenderedAt = now;
  // カメラ追跡は映像フレーム側で継続。ここではテスト動作だけ生成する。
  if (!running) track(now);
  if (demo) sendPose(now);
  if (demo) speakingUntil = now + 620;
  if (target.voice < 0.035) {
    speakingUntil = 0;
    talkingAmount = 0;
  }
  talkingAmount += (Number(now < speakingUntil) - talkingAmount) * 0.18;
  const talkPulse = 0.5 + 0.5 * Math.sin(now * 0.023);
  const follow = 0.035 + (1 - config.smoothAmount / 100) * 0.16;
  for (const k of [
    "x",
    "y",
    "roll",
    "depth",
    "voice",
    "gazeX",
    "gazeY",
    "eyeOpen",
  ])
    pose[k] +=
      (target[k] - pose[k]) *
      (k === "voice"
        ? 0.3
        : k === "eyeOpen"
          ? 0.32
          : k.startsWith("gaze")
            ? 0.22
            : follow);
  pose.bodyX += (pose.x - pose.bodyX) * 0.025;
  pose.bodyY += (pose.y - pose.bodyY) * 0.02;
  ctx.clearRect(0, 0, 1000, 1000);
  const move = config.moveAmount / 100,
    stretch = config.stretchAmount / 100,
    scale = config.sizeAmount / 100;
  const headX = pose.x * 54 * move,
    headY = pose.y * 42 * move - pose.depth * 18 * stretch;
  const bodyX = pose.bodyX * 20 * move,
    bodyY = pose.bodyY * 12 * move + pose.depth * 10 * stretch;
  const gap = (pose.depth * 0.55 + Math.abs(pose.y) * 0.35) * 24 * stretch;
  const headRot = pose.roll * 0.42 * move;
  const gazeX = pose.gazeX * 40;
  const gazeY = pose.gazeY * 14;
  const closedEyeScale = Math.max(0.04, Math.min(1, pose.eyeOpen / 0.82));
  const wideWhiteScale =
    closedEyeScale * (1 + Math.max(0, pose.eyeOpen - 1) * 1.35);
  const bodyRotation = Math.max(
    -0.52,
    Math.min(0.52, (pose.roll * 1.35 + pose.x * 0.2) * move),
  );
  const tiltFit = 1 - Math.min(1, Math.abs(bodyRotation) / 0.52) * 0.24;
  // 小さな開きは見やすく増幅し、最後の25%だけ「ぐーん」と大きく上げる。
  const normalLift =
    pose.voice <= 0 ? 0 : 42 * Math.pow(Math.min(1, pose.voice / 0.75), 0.62);
  const extreme = Math.max(0, (pose.voice - 0.75) / 0.25);
  const mouthLift =
    (normalLift + 83 * Math.pow(extreme, 2.6)) * (config.mouthAmount / 22);
  // 通常口が両目を完全に覆う高さで!mouthへ切り替える。戻り側に幅を持たせてちらつきを防ぐ。
  if (!surpriseMouth && mouthLift >= 100) surpriseMouth = true;
  else if (surpriseMouth && mouthLift < 88) surpriseMouth = false;
  // 胴体の最下部中央を回転軸にして、全パーツを一緒に傾ける。
  const bodyBottomX = 500 + bodyX;
  const bodyBottomY = 500 + 500 * scale + bodyY;
  ctx.save();
  ctx.translate(bodyBottomX, bodyBottomY);
  ctx.scale(tiltFit, tiltFit);
  ctx.rotate(bodyRotation);
  ctx.translate(-bodyBottomX, -bodyBottomY);
  // 奥から順に、耳 → 胴体 → 顔 → 白目 → 左右の黒目 → 口。
  layer(
    images.left,
    headX + gap,
    headY - gap * 0.72,
    headRot + pose.x * 0.035,
    1,
    1,
    scale,
  );
  layer(
    images.right,
    headX - gap,
    headY - gap * 0.72,
    headRot + pose.x * 0.035,
    1,
    1,
    scale,
  );
  layer(images.body, bodyX, bodyY, 0, 1, 1, scale);
  layer(images.head, headX, headY, headRot, 1, 1, scale);
  eyeLayer(images.white_eye, headX, headY, headRot, wideWhiteScale, scale);
  pupilLayer(
    images.left_eye,
    headX,
    headY,
    headRot,
    gazeX,
    gazeY,
    closedEyeScale,
    scale,
  );
  pupilLayer(
    images.right_eye,
    headX,
    headY,
    headRot,
    gazeX,
    gazeY,
    closedEyeScale,
    scale,
  );
  const mouthScaleY = 1 + talkingAmount * (talkPulse - 0.5) * 0.46;
  mouthLayer(
    surpriseMouth ? images["!mouth"] : images.mouth,
    headX,
    headY - mouthLift,
    headRot,
    mouthScaleY,
    scale,
  );
  drawFaceAccessory(ctx, {
    centerX: 500 + headX,
    centerY: 500 + headY,
    rotation: headRot,
    scale,
    offsets: {
      "gaming-sunglasses": 140,
      "mask-white": 290,
      "mask-black": 290,
      "disguise-glasses": 175,
    },
  });
  ctx.restore();
  $("voiceMeter").value = pose.voice;
  $("voiceValue").value = `${Math.round(pose.voice * 100)}%`;
  $("moveMeter").value = pose.gazeX;
  $("moveValue").value = (pose.gazeX >= 0 ? "+" : "") + pose.gazeX.toFixed(2);
  $("depthMeter").value = pose.depth;
  $("depthValue").value = (pose.depth >= 0 ? "+" : "") + pose.depth.toFixed(2);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
addEventListener("pagehide", () => {
  if (running || stream) stop();
}, { once: true });

if (new URLSearchParams(location.search).get("desktop") === "1") {
  setTimeout(() => {
    if (!running) start();
  }, 350);
}
