import { drawFaceAccessory } from "../shared/accessory-hotkeys.js";

const $ = (id) => document.getElementById(id);
const canvas = $("stage");
const ctx = canvas.getContext("2d");
const video = $("camera");
const query = new URLSearchParams(location.search);
const obs = query.get("obs") === "1";
const member = "8";
const assetRevision = query.get("v") || "gyoza-current";

document.body.classList.toggle("obs", obs);
document.body.classList.toggle("transparent", obs && query.get("bg") === "transparent");
document.documentElement.classList.toggle("transparent", obs && query.get("bg") === "transparent");
document.body.classList.toggle(query.get("bg") === "blue" ? "blue" : "green", obs && query.get("bg") !== "transparent");
$("openAdjuster").hidden = true;
$("openMapper").hidden = false;
document.querySelector("aside > p").textContent = "餃子の皮・3つの山・目餃子・口餃子を立体追跡";

const target = { x: 0, y: 0, roll: 0, yaw: 0, pitch: 0, depth: 0, mouth: 0, eyeL: 1, eyeR: 1, gazeX: 0, gazeY: 0, smile: 0, brow: 0, armLeft: 0, armRight: 0 };
const pose = { ...target };
let running = false, demo = false, stream, landmarker, poseLandmarker, lastVideo = -1, lastSend = 0;
let pleatSpring = 0, pleatVelocity = 0, bodySpring = 0, bodyVelocity = 0;
const eyeBatons = {
  left: { current: "eye-left-open", to: "eye-left-open", queued: "eye-left-open", p: 1 },
  right: { current: "eye-right-open", to: "eye-right-open", queued: "eye-right-open", p: 1 },
};
const mouthBaton = { current: "mouth-closed", to: "mouth-closed", queued: "mouth-closed", p: 1 };

function status(text) { $("status").textContent = text; }
function clamp(v, a = 0, b = 1) { return Math.max(a, Math.min(b, v)); }
function mix(a, b, t) { return a + (b - a) * t; }
function send(now) {
  if (obs || now - lastSend < 45) return;
  lastSend = now;
  fetch(`/pose?member=${member}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target) }).catch(() => {});
}
if (obs) {
  const events = new EventSource(`/events?member=${member}`);
  events.onmessage = (event) => {
    try { const incoming = JSON.parse(event.data); for (const key in target) if (Number.isFinite(incoming[key])) target[key] = incoming[key]; } catch {}
  };
}

async function start() {
  if (running) return stop();
  status("許可を待っています…");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
    video.srcObject = stream; await video.play();
    status("顔追跡を読込中…");
    const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm");
    const files = await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm");
    landmarker = await vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: "GPU" }, runningMode: "VIDEO", numFaces: 1, minFaceDetectionConfidence: 0.45, minTrackingConfidence: 0.45, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true });
    poseLandmarker = await vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", delegate: "GPU" }, runningMode: "VIDEO", numPoses: 1, minPoseDetectionConfidence: .4, minPosePresenceConfidence: .4, minTrackingConfidence: .4 });
    running = true; demo = false; $("start").textContent = "停止"; status("追従中");
    video.requestVideoFrameCallback(frame);
    return true;
  } catch (error) { console.error(error); status("カメラを開始できません"); return false; }
}
function stop() { running = false; stream?.getTracks().forEach((track) => track.stop()); stream = null; landmarker?.close(); poseLandmarker?.close(); landmarker = null; poseLandmarker = null; $("start").textContent = "カメラを開始"; status("停止中"); }
function frame(now) { if (!running) return; track(now); send(now); video.requestVideoFrameCallback(frame); }
function shapeMap(result) { return Object.fromEntries((result?.faceBlendshapes?.[0]?.categories || []).map((v) => [v.categoryName, v.score])); }
function track(now) {
  if (demo) {
    target.x = Math.sin(now * .0011) * .65; target.y = Math.sin(now * .0017) * .24;
    target.yaw = Math.sin(now * .00082) * .72; target.pitch = Math.sin(now * .00103) * .28; target.roll = Math.sin(now * .0013) * .14;
    target.depth = Math.sin(now * .0007) * .4; target.mouth = .5 + .5 * Math.sin(now * .0055);
    target.eyeL = target.eyeR = .12 + .88 * Math.abs(Math.sin(now * .00165)); target.gazeX = Math.sin(now * .002); target.gazeY = Math.sin(now * .0016);
    target.smile = .5 + .5 * Math.sin(now * .0011 + 1); target.brow = .5 + .5 * Math.sin(now * .0014);
    target.armLeft=.15+.75*Math.sin(now*.00115); target.armRight=.15+.75*Math.sin(now*.00115+2.1); return;
  }
  if (!running || video.currentTime === lastVideo) return;
  lastVideo = video.currentTime;
  const poseResult=poseLandmarker?.detectForVideo(video,now), body=poseResult?.landmarks?.[0];
  if(body?.length>=17){
    const torso=Math.max(.08,Math.hypot(body[11].x-body[12].x,body[11].y-body[12].y));
    const lift=(shoulder,wrist)=>clamp((shoulder.y-wrist.y)/torso+.58,-1,1);
    // Naming is screen-relative: camera-right biological arm drives the screen-left artwork.
    if((body[12].visibility??1)>.35&&(body[16].visibility??1)>.35) target.armLeft=lift(body[12],body[16]);
    if((body[11].visibility??1)>.35&&(body[15].visibility??1)>.35) target.armRight=lift(body[11],body[15]);
  } else { target.armLeft*=.92; target.armRight*=.92; }
  const result = landmarker?.detectForVideo(video, now), lm = result?.faceLandmarks?.[0];
  if (!lm) { status("顔を探しています…"); return; }
  status("追従中");
  const s = shapeMap(result), avg = (a, b) => ((s[a] || 0) + (s[b] || 0)) / 2;
  target.eyeL = clamp(1 - (s.eyeBlinkLeft || 0) * 1.3);
  target.eyeR = clamp(1 - (s.eyeBlinkRight || 0) * 1.3);
  target.mouth = clamp((s.jawOpen || 0) * 1.12 + (s.mouthFunnel || 0) * .52 + (s.mouthPucker || 0) * .22);
  target.smile = clamp(avg("mouthSmileLeft", "mouthSmileRight") * 1.75);
  target.brow = clamp((s.browInnerUp || 0) * 1.55 - avg("browDownLeft", "browDownRight") * 1.25, -.9, 1);
  const left = lm[234], right = lm[454], top = lm[10], chin = lm[152], nose = lm[1];
  const fw = Math.max(.001, Math.hypot(right.x - left.x, right.y - left.y));
  const fh = Math.max(.001, Math.hypot(chin.x - top.x, chin.y - top.y));
  target.x = (0.5 - nose.x) * 2.4; target.y = (nose.y - .48) * 1.9;
  target.yaw = clamp(-((nose.x - (left.x + right.x) / 2) / fw) * 4.2, -.9, .9);
  target.pitch = clamp(((nose.y - (top.y + chin.y) / 2) / fh) * 3.2, -.65, .65);
  target.roll = -Math.atan2(right.y - left.y, right.x - left.x);
  target.depth = clamp((fw - .28) * 3, -.5, .7);
  if (lm.length > 477) {
    const center = (pts) => pts.reduce((o, p) => ({ x: o.x + p.x / pts.length, y: o.y + p.y / pts.length }), { x: 0, y: 0 });
    const gaze = (iris, a, b) => ({ x: ((iris.x - (a.x + b.x) / 2) / Math.max(.001, Math.abs(a.x - b.x))) * 4, y: ((iris.y - (a.y + b.y) / 2) / Math.max(.001, Math.abs(a.x - b.x))) * 5 });
    const gl = gaze(center(lm.slice(468, 473)), lm[33], lm[133]), gr = gaze(center(lm.slice(473, 478)), lm[362], lm[263]);
    target.gazeX = clamp(-(gl.x + gr.x) / 2, -1, 1); target.gazeY = clamp((gl.y + gr.y) / 2, -1, 1);
  }
}

const assetNames = [
  "leg-left", "leg-right", "arm-left", "arm-right", "hand-left", "hand-right",
  "body-torso", "neck", "head-base", "head-shadow-left", "head-highlight",
  "head-crease-left", "head-crease-right", "eye-left-open", "eye-left-half", "eye-left-closed",
  "eye-left-smile", "eye-right-open", "eye-right-half", "eye-right-closed",
  "eye-right-smile", "mouth-closed", "mouth-small",
  "mouth-medium", "mouth-large", "mouth-smile-closed", "mouth-smile-open",
  "mouth-surprised", "mouth-frown",
];
async function loadArt(name) {
  const image = new Image();
  image.src = `parts/${name}.png?v=${encodeURIComponent(assetRevision)}`;
  try {
    await image.decode();
    return [name, image];
  } catch (error) {
    console.error(`ギョーザ素材を読み込めませんでした: ${name}`, error);
    return [name, null];
  }
}
const art = Object.fromEntries(await Promise.all(assetNames.map(loadArt)));
const missingArt = assetNames.filter((name) => !art[name]);
if (missingArt.length) console.error("読込失敗したギョーザ素材", missingArt);
const bodyShadeCanvas=document.createElement("canvas"), bodyShadeCtx=bodyShadeCanvas.getContext("2d");
bodyShadeCanvas.width=bodyShadeCanvas.height=1254;
function updateBodyShade(yaw,pitch){
  const g=bodyShadeCtx; g.clearRect(0,0,1254,1254);
  if (!art["body-torso"]) return;
  g.globalCompositeOperation="source-over";
  g.drawImage(art["body-torso"],0,0,1254,1254); g.globalCompositeOperation="source-in";
  const from=yaw>=0?430:824,to=yaw>=0?830:424,gradient=g.createLinearGradient(from,760,to,1080);
  gradient.addColorStop(0,"rgba(63,28,17,0)"); gradient.addColorStop(.58,"rgba(63,28,17,.025)");
  gradient.addColorStop(.72,"rgba(63,28,17,.12)"); gradient.addColorStop(1,`rgba(49,22,14,${.2+Math.abs(yaw)*.1+Math.max(0,pitch)*.05})`);
  g.fillStyle=gradient; g.fillRect(0,0,1254,1254); g.globalCompositeOperation="source-over";
}
const expressionAssets = {
  eye: ["open", "half", "closed", "smile"],
  brow: ["raised", "relaxed", "frown"],
  mouth: ["mouth-closed", "mouth-small", "mouth-medium", "mouth-large", "mouth-smile-closed", "mouth-smile-open", "mouth-surprised", "mouth-frown"],
};
const expressionLabels = {
  eye: ["通常", "半目", "閉じ目", "笑顔の目"],
  brow: ["上げた折り線", "通常の折り線", "怒った折り線"],
  mouth: ["閉じ口", "小さく開く", "中くらい", "大きく開く", "笑顔・閉じ", "笑顔・開き", "驚き", "不機嫌"],
};
const featureKeys = {
  eye: ["eyeL", "eyeR", "smile"],
  brow: ["brow"],
  mouth: ["mouth", "smile", "brow", "eyeL", "eyeR"],
};
const blankProfiles = () => ({ eye: Array(4).fill(null), brow: Array(3).fill(null), mouth: Array(8).fill(null) });
const defaultMapping = { version: 1, member: 8, profiles: {
  eye: [
    { eyeL: .6550079822540282, eyeR: .7843623802065849, smile: .000021767131670458184 },
    { eyeL: .3837206453084946, eyeR: .6064257085323334, smile: .0000264844562707367 },
    { eyeL: 0, eyeR: 0, smile: .00039570184890180826 },
    { eyeL: .20761522054672243, eyeR: .3594038605690002, smile: .699968796223402 },
  ],
  brow: [{ brow: 1 }, { brow: .6161292204255006 }, { brow: -.7639740342041478 }],
  mouth: [
    { mouth: .05902488194406033, smile: .0008481515724270139, brow: .513946668652352, eyeL: .45702821016311646, eyeR: .5678330898284911 },
    { mouth: .22444103062152865, smile: .00003082519344843604, brow: .5636327298154357, eyeL: .4523102790117264, eyeR: .4880914330482483 },
    { mouth: .5552794486284256, smile: .00001040781080519082, brow: .7335249791911338, eyeL: .5026603966951371, eyeR: .5316693097352981 },
    { mouth: .32543042002245787, smile: .4425694402307272, brow: .33628478564787656, eyeL: .1015598475933075, eyeR: .23248901367187502 },
    { mouth: .011066957900766283, smile: 1, brow: .37241663358872756, eyeL: .45768579542636867, eyeR: .5431781947612762 },
    { mouth: .1256661238335073, smile: .7464003339409828, brow: .26016459488309923, eyeL: .14502013921737666, eyeR: .30311203598976133 },
    { mouth: .9532111145369709, smile: .03634453588165343, brow: 1, eyeL: .6968004837632179, eyeR: .7724062457680703 },
    { mouth: .6201438972353935, smile: .000007324507748762699, brow: .4427771860093344, eyeL: .5902019530534743, eyeR: .6507758885622024 },
  ],
} };
const clone = (value) => JSON.parse(JSON.stringify(value));
function validMapping(value) {
  return value && value.profiles && Object.keys(expressionAssets).every((type) => Array.isArray(value.profiles[type]) && value.profiles[type].length === expressionAssets[type].length);
}
let mapping = clone(defaultMapping);
try {
  const response = await fetch(`/settings?member=${member}&t=${Date.now()}`, { cache: "no-store" });
  if (response.ok) {
    const raw = await response.json(), next = raw.mapping || raw;
    if (validMapping(next)) mapping = next;
  }
} catch (error) { console.warn("ギョーザの表情設定を読み込めませんでした", error); }
let saveTimer = 0;
function saveMapping() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fetch(`/settings?member=${member}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format: "vtuber-studio-settings", version: 1, member: 8, mapping }),
  }).catch((error) => console.error("表情設定の保存に失敗しました", error)), 120);
}
function snapshot(type) { return Object.fromEntries(featureKeys[type].map((key) => [key, Number(target[key]) || 0])); }
function nearestProfile(type, fallback) {
  const active = mapping.profiles[type].map((profile,index)=>({profile,index})).filter((item)=>item.profile);
  if (!active.length) return fallback;
  let best = fallback, score = Infinity;
  for (const item of active) {
    let distance = 0;
    for (const key of featureKeys[type]) { const delta=(Number(pose[key])||0)-(Number(item.profile[key])||0); distance += delta*delta; }
    if (distance < score) { score=distance; best=item.index; }
  }
  return best;
}
const drawLayer = (name, alpha = 1) => {
  if (alpha <= 0 || !art[name]) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.drawImage(art[name], 0, 0, 1254, 1254); ctx.restore();
};
function around(x, y, rotation, scaleX, scaleY, draw) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(scaleX, scaleY); ctx.translate(-x, -y); draw(); ctx.restore();
}
function advanceImageBaton(state, wanted, speed = .2, pinch = .7) {
  state.queued = wanted;
  if (state.p >= 1 && state.queued !== state.to) {
    state.current = state.to; state.to = state.queued; state.p = 0;
  }
  if (state.p < 1) state.p = Math.min(1, state.p + speed);
  if (state.p >= 1) return { name: state.to, sx: 1, sy: 1 };
  const first = state.p < .5, t = first ? state.p*2 : (state.p-.5)*2;
  const ease = t*t*(3-2*t);
  return first
    ? { name: state.current, sx: 1+(1.06-1)*ease, sy: 1+(pinch-1)*ease }
    : { name: state.to, sx: 1.06+(1-1.06)*ease, sy: pinch+(1-pinch)*ease };
}
function wantedEye(side, openness, smile) {
  const fallback = smile>.42 ? 3 : openness<.24 ? 2 : openness<.66 ? 1 : 0;
  return `eye-${side}-${expressionAssets.eye[nearestProfile("eye",fallback)]}`;
}
function drawEye(side, openness, smile, yaw) {
  const x = side === "left" ? 446 : 808, y = 555;
  const far = side === "left" ? yaw > 0 : yaw < 0;
  const visual = advanceImageBaton(eyeBatons[side], wantedEye(side, openness, smile), .24, .66);
  around(x, y, side === "left" ? pleatSpring*.004 : -pleatSpring*.004, far ? 1-Math.abs(yaw)*.12 : 1, 1, () => {
    around(x,y,0,visual.sx,visual.sy,()=>drawLayer(visual.name));
  });
}
function mouthName() {
  const fallback = pose.smile>.38 ? (pose.mouth>.24?5:4) : pose.brow<-.16&&pose.mouth<.3 ? 7 : pose.mouth>.72&&pose.eyeL>.75&&pose.eyeR>.75 ? 6 : pose.mouth>.54 ? 3 : pose.mouth>.31 ? 2 : pose.mouth>.07 ? 1 : 0;
  return expressionAssets.mouth[nearestProfile("mouth",fallback)];
}
function drawCharacter(now) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const idle = Math.sin(now*.0008), x = pose.x*48, y = pose.y*30-pose.depth*16+idle*2;
  const scale = 1+pose.depth*.05, yaw = pose.yaw, pitch = pose.pitch;
  pleatVelocity += (yaw-pleatSpring)*.045; pleatVelocity *= .82; pleatSpring += pleatVelocity;
  bodyVelocity += (pose.roll*14-bodySpring)*.035; bodyVelocity *= .8; bodySpring += bodyVelocity;
  ctx.save(); ctx.translate(627+x,680+y); ctx.rotate(pose.roll*.4); ctx.scale(scale*(1-Math.abs(yaw)*.04),scale*(1-pitch*.02)); ctx.translate(-627,-680);
  const bodyBob = Math.sin(now*.002)*2+bodySpring*.2;
  ctx.save(); ctx.translate(0,bodyBob);
  const armLeftAngle=clamp(pose.armLeft,-1,1)*.34, armRightAngle=-clamp(pose.armRight,-1,1)*.34;
  // Automatic silhouette shadow is derived from the supplied transparent PNGs.
  ctx.save(); ctx.filter=`drop-shadow(${-yaw*5}px ${7+Math.max(0,pitch)*3}px 4px rgba(45,22,16,.28))`;
  drawLayer("leg-left"); drawLayer("leg-right");
  around(535,790,armLeftAngle,1,1,()=>{ drawLayer("hand-left"); drawLayer("arm-left"); });
  around(719,790,armRightAngle,1,1,()=>{ drawLayer("hand-right"); drawLayer("arm-right"); });
  drawLayer("body-torso"); ctx.restore();
  drawLayer("leg-left"); drawLayer("leg-right");
  // Shoulder pivots stay locked to the torso; each screen-side hand remains behind its sleeve.
  around(535,790,armLeftAngle,1,1,()=>{ drawLayer("hand-left"); drawLayer("arm-left"); });
  around(719,790,armRightAngle,1,1,()=>{ drawLayer("hand-right"); drawLayer("arm-right"); });
  drawLayer("body-torso"); updateBodyShade(yaw,pitch); ctx.drawImage(bodyShadeCanvas,0,0);
  drawLayer("neck"); ctx.restore();
  const headShift = yaw*32;
  ctx.save(); ctx.translate(headShift,pitch*9);
  drawLayer("head-base");
  ctx.save(); if (yaw>0) { ctx.translate(1254,0); ctx.scale(-1,1); } drawLayer("head-shadow-left", .18+Math.abs(yaw)*.56); ctx.restore();
  drawLayer("head-highlight", .42);
  const browFallback=pose.brow>.3?0:pose.brow<-.16?2:1, browIndex=nearestProfile("brow",browFallback), browShape=[-.055,0,.06][browIndex];
  around(485,380,browShape+pleatSpring*.012,1,1,()=>drawLayer("head-crease-left"));
  around(769,380,-browShape-pleatSpring*.012,1,1,()=>drawLayer("head-crease-right"));
  ctx.save(); ctx.translate(pose.gazeX*6,pose.gazeY*4); drawEye("left",pose.eyeL,pose.smile,yaw); drawEye("right",pose.eyeR,pose.smile,yaw); ctx.restore();
  const mouthVisual = advanceImageBaton(mouthBaton,mouthName(),.22,.7);
  around(627,710,0,mouthVisual.sx,mouthVisual.sy,()=>drawLayer(mouthVisual.name));
  drawFaceAccessory(ctx,{centerX:627,centerY:590,rotation:pose.roll*.18});
  ctx.restore(); ctx.restore();
}

function previewFor(type,index) {
  const canvas=document.createElement("canvas"), g=canvas.getContext("2d");
  canvas.className="asset-preview"; canvas.width=192; canvas.height=116;
  if(type==="eye") {
    const name=`eye-left-${expressionAssets.eye[index]}`;
    g.drawImage(art[name],300,510,650,500,0,0,192,116);
  } else if(type==="brow") {
    g.save(); g.translate(96,58); g.rotate([-.055,0,.06][index]); g.translate(-96,-58);
    g.drawImage(art["head-crease-left"],220,160,900,650,0,0,192,116); g.restore();
  } else g.drawImage(art[expressionAssets.mouth[index]],520,700,1050,700,0,0,192,116);
  return canvas;
}
let captureTarget=null;
async function beginCapture(type,index,label) {
  if(demo){ demo=false; $("demo").textContent="動きテスト"; }
  if(!running && !(await start())) return;
  const preview=$("capturePreview"); preview.srcObject=stream; await preview.play();
  captureTarget={type,index}; $("captureTitle").textContent=`「${label}」に使う実際の表情を作ってください`;
  $("capturePanel").hidden=false; $("capturePanel").scrollIntoView({behavior:"smooth",block:"nearest"});
}
function closeCapture(){ captureTarget=null; $("capturePanel").hidden=true; }
function buildMapper(){
  const host=$("mappingTables"); host.replaceChildren();
  for(const type of ["eye","brow","mouth"]){
    const group=document.createElement("section"); group.className="mapping-group";
    group.innerHTML=`<h3>${{eye:"目餃子",brow:"3つの山・眉兼用の折り線",mouth:"口餃子"}[type]}</h3><small>各画像を表示したい実際の表情をカメラで登録します。登録後は現在の顔に最も近い画像へバトン変形で切り替わります。</small>`;
    expressionLabels[type].forEach((label,index)=>{
      const row=document.createElement("div"); row.className="mapping-row";
      const registered=!!mapping.profiles[type][index], title=document.createElement("div");
      title.innerHTML=`<strong>${label}</strong><div class="assign-state ${registered?"done":""}">${registered?"登録済み":"未登録"}</div>`;
      const button=document.createElement("button"); button.type="button"; button.textContent=registered?"再割り当て":"割り当てる";
      button.onclick=()=>beginCapture(type,index,label); row.append(title,previewFor(type,index),button); group.append(row);
    }); host.append(group);
  }
}
function downloadJson(){
  const blob=new Blob([JSON.stringify({format:"vtuber-studio-settings",version:1,member:8,mapping},null,2)],{type:"application/json"});
  const anchor=document.createElement("a"); anchor.href=URL.createObjectURL(blob); anchor.download="gyoza-all-settings.json"; anchor.click();
  setTimeout(()=>URL.revokeObjectURL(anchor.href),500);
}

$("start").addEventListener("click", start);
$("demo").addEventListener("click", () => { demo = !demo; if (demo && running) stop(); $("demo").textContent = demo ? "動きテストを停止" : "動きテスト"; status(demo ? "テスト動作中" : "待機中"); });
$("full").addEventListener("click", () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
$("openMapper").onclick=()=>{ buildMapper(); $("mapper").showModal(); };
$("commitFace").onclick=()=>{ if(!captureTarget)return; const {type,index}=captureTarget; mapping.profiles[type][index]=snapshot(type); saveMapping(); closeCapture(); buildMapper(); status("実際の表情を登録しました"); };
$("cancelCapture").onclick=closeCapture;
$("mapper").addEventListener("close",closeCapture);
$("resetMapping").onclick=()=>{ mapping=clone(defaultMapping); saveMapping(); closeCapture(); buildMapper(); };
$("exportJson").onclick=downloadJson; $("exportAll").onclick=downloadJson;
$("importJson").onchange=async(event)=>{ try { const raw=JSON.parse(await event.target.files[0].text()), next=raw.mapping||raw; if(!validMapping(next))throw new Error("形式が違います"); mapping=next; saveMapping(); closeCapture(); buildMapper(); status("全設定JSONを読み込みました"); } catch(error){ alert(`JSONを読み込めません：${error.message}`); } event.target.value=""; };
addEventListener("keydown",(event)=>{ if(event.key==="F8"){ event.preventDefault(); const hidden=!$("exportAll").hidden; $("exportAll").hidden=hidden; $("exportJson").hidden=hidden; } });
let last = -Infinity;
function render(now) {
  if (now-last > (document.hidden ? 100 : 0)) { last=now; if (!running && !obs) track(now); if (demo) send(now); for (const key in pose) pose[key] += (target[key]-pose[key]) * (key.startsWith("eye")||key==="mouth" ? .38 : key.startsWith("arm") ? .18 : key==="smile"||key==="brow" ? .24 : key.startsWith("gaze") ? .28 : .12); drawCharacter(now); $("mouthValue").textContent=`${Math.round(pose.mouth*100)}%`; $("gazeValue").textContent=pose.gazeX.toFixed(2); $("eyeValue").textContent=`${Math.round((pose.eyeL+pose.eyeR)*50)}%`; }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
addEventListener("pagehide", () => { if (running || stream) stop(); }, { once: true });
