const members = [
  { no: 1, name: "ラフト", slug: "raft" }, { no: 2, name: "まい", slug: "mai" },
  { no: 3, name: "たぬつな", slug: "tanutsuna" }, { no: 4, name: "やんさん", slug: "yansan" },
  { no: 5, name: "ムート", slug: "muto" }, { no: 6, name: "もろん", slug: "moron" },
  { no: 7, name: "ウィーク", slug: "week" }, { no: 8, name: "ギョーザ", slug: "gyoza" },
];
const $ = (id) => document.getElementById(id);
const canvas = $("recordingCanvas"), ctx = canvas.getContext("2d", { alpha: false });
const screenVideo = $("screenVideo"), stageShell = $("stageShell"), transformLayer = $("transformLayer");
const states = new Map();
let screenStream = null, recorder = null, recordingStarted = 0, timer = 0, chunks = [], selected = null, audioContext = null, micStream = null;
let trackingRunning = false, trackingAnimation = 0;
const localTrackers = new Map(), lanEvents = new Map();
let cameraDevices = [], lanPeers = [];

function createMembers() {
  for (const [index, member] of members.entries()) {
    const row = document.createElement("div"); row.className = "member-row";
    row.innerHTML = `<input id="member-${member.no}" type="checkbox"><label for="member-${member.no}">${member.name}<span>MEMBER ${String(member.no).padStart(2,"0")}</span></label><span class="ready-mark" id="source-status-${member.no}">未接続</span><select class="member-source" id="source-${member.no}" aria-label="${member.name}の追従元"><option value="">カメラを選択</option></select>`;
    $("memberList").append(row);
    row.querySelector("input").addEventListener("change", (event) => event.target.checked ? addMember(member, index) : removeMember(member.slug));
    row.querySelector("select").addEventListener("change",()=>{if(trackingRunning) startTracking(true);});
  }
}

function addMember(member, index) {
  const iframe = document.createElement("iframe");
  iframe.src = `/${member.slug}/?obs=1&bg=transparent&member=${member.no}&recording=1&v=${Date.now()}`;
  $("avatarFrames").append(iframe);
  const state = { member, iframe, x: .5 + (index % 3 - 1) * .16, y: .61, w: .28, h: .50, rotation: 0 };
  const box = document.createElement("div"); box.className = "transform-box";
  box.innerHTML = `<span class="name">${member.name}</span><i class="handle nw" data-mode="resize"></i><i class="handle ne" data-mode="resize"></i><i class="handle sw" data-mode="resize"></i><i class="handle se" data-mode="resize"></i><i class="handle rotate" data-mode="rotate"></i>`;
  transformLayer.append(box); state.box = box; states.set(member.slug, state); bindTransform(state); selectState(state); updateBox(state);
  box.closest(".stage-shell"); document.querySelector(`#member-${member.no}`).closest(".member-row").classList.add("active");
  if(trackingRunning) startTracking(true);
}
function removeMember(slug) { const state=states.get(slug); if(!state)return; state.iframe.remove(); state.box.remove(); states.delete(slug); if(selected===state) selectState(null); document.querySelector(`#member-${state.member.no}`).closest(".member-row").classList.remove("active"); if(trackingRunning) startTracking(true); }
function selectState(state) { selected=state; for(const item of states.values()) item.box.classList.toggle("selected",item===state); $("fitSelected").disabled=!state; }
function updateBox(state) { state.box.style.left=`${(state.x-state.w/2)*100}%`; state.box.style.top=`${(state.y-state.h/2)*100}%`; state.box.style.width=`${state.w*100}%`; state.box.style.height=`${state.h*100}%`; state.box.style.transform=`rotate(${state.rotation}rad)`; }
function bindTransform(state) {
  state.box.addEventListener("pointerdown", (event) => {
    event.preventDefault(); event.stopPropagation(); selectState(state); state.box.setPointerCapture(event.pointerId);
    const rect=stageShell.getBoundingClientRect(), start={x:event.clientX,y:event.clientY,sx:state.x,sy:state.y,sw:state.w,sh:state.h,sr:state.rotation};
    const mode=event.target.dataset.mode||"move";
    const move=(e)=>{ const dx=(e.clientX-start.x)/rect.width,dy=(e.clientY-start.y)/rect.height;
      if(mode==="move"){state.x=Math.max(0,Math.min(1,start.sx+dx));state.y=Math.max(0,Math.min(1,start.sy+dy));}
      else if(mode==="resize"){const amount=Math.max(dx,dy*(rect.height/rect.width));state.w=Math.max(.08,Math.min(1.4,start.sw+amount*2));state.h=state.w*(start.sh/start.sw);}
      else {const cx=rect.left+state.x*rect.width,cy=rect.top+state.y*rect.height;state.rotation=Math.atan2(e.clientY-cy,e.clientX-cx)+Math.PI/2;}
      updateBox(state);
    };
    const up=()=>{state.box.removeEventListener("pointermove",move);state.box.removeEventListener("pointerup",up);};
    state.box.addEventListener("pointermove",move); state.box.addEventListener("pointerup",up);
  });
}
stageShell.addEventListener("pointerdown",()=>selectState(null));
$("fitSelected").addEventListener("click",()=>{if(!selected)return;Object.assign(selected,{x:.5,y:.58,w:.32,h:.56,rotation:0});updateBox(selected);});

function setResolution() { const [w,h]=$("resolution").value.split("x").map(Number); canvas.width=w;canvas.height=h; stageShell.style.aspectRatio=`${w}/${h}`; }
$("resolution").addEventListener("change",setResolution); setResolution();

async function chooseScreen() {
  try {
    screenStream?.getTracks().forEach(t=>t.stop());
    screenStream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30,max:60}},audio:true});
    screenVideo.srcObject=screenStream; await screenVideo.play(); $("emptyState").classList.add("hidden"); $("screenState").classList.add("live"); $("screenState").lastChild.textContent=" 画面共有中";
    screenStream.getVideoTracks()[0].addEventListener("ended",()=>{screenStream=null;$("screenState").classList.remove("live");$("screenState").lastChild.textContent=" 画面未選択";});
    note("画面を表示しています。キャラクターを選び、配置を調整してください。");
  } catch (error) { if(error.name!=="NotAllowedError") note(`画面を開始できません: ${error.message}`,true); }
}
$("shareScreen").addEventListener("click",chooseScreen);

function drawCover(source) { const sw=source.videoWidth||source.width,sh=source.videoHeight||source.height;if(!sw||!sh)return;const scale=Math.max(canvas.width/sw,canvas.height/sh),dw=sw*scale,dh=sh*scale;ctx.drawImage(source,(canvas.width-dw)/2,(canvas.height-dh)/2,dw,dh); }
function render() {
  ctx.fillStyle="#070b0d";ctx.fillRect(0,0,canvas.width,canvas.height);if(screenVideo.readyState>=2)drawCover(screenVideo);
  for(const state of states.values()) { try { const source=state.iframe.contentDocument?.querySelector("#stage"); if(!source||!source.width)continue; const w=state.w*canvas.width,h=state.h*canvas.height;ctx.save();ctx.translate(state.x*canvas.width,state.y*canvas.height);ctx.rotate(state.rotation);ctx.drawImage(source,-w/2,-h/2,w,h);ctx.restore(); } catch {} }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

function note(message,error=false){$("notice").textContent=message;$("notice").style.color=error?"#ff8991":"";}
function bestMime(){return["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(type=>MediaRecorder.isTypeSupported(type))||"";}
async function startRecording(){
  if(!screenStream){await chooseScreen();if(!screenStream)return;}
  try {
    const output=canvas.captureStream(30), destinationTracks=[];
    audioContext=new AudioContext();const destination=audioContext.createMediaStreamDestination();
    if($("screenAudio").checked&&screenStream.getAudioTracks().length){audioContext.createMediaStreamSource(new MediaStream(screenStream.getAudioTracks())).connect(destination);}
    if($("micAudio").checked){micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});audioContext.createMediaStreamSource(micStream).connect(destination);}
    destinationTracks.push(...destination.stream.getAudioTracks());const combined=new MediaStream([...output.getVideoTracks(),...destinationTracks]);
    chunks=[];const mimeType=bestMime();recorder=new MediaRecorder(combined,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:canvas.width>=3840?24000000:canvas.width>=2560?14000000:8000000});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=saveRecording;recorder.start(1000);recordingStarted=Date.now();timer=setInterval(updateTime,250);setRecordingUi(true);note("収録中です。キャラクターは収録中も自由に移動・変形・回転できます。");
  } catch(error){micStream?.getTracks().forEach(t=>t.stop());note(`録画を開始できません: ${error.message}`,true);}
}
function stopRecording(){if(recorder?.state!=="inactive")recorder.stop();clearInterval(timer);setRecordingUi(false);}
function setRecordingUi(live){$("recordButton").classList.toggle("stop",live);$("recordButton").querySelector("span").textContent=live?"録画停止":"録画開始";$("recordDot").classList.toggle("live",live);$("recordState").textContent=live?"収録中":"収録準備";$("resolution").disabled=live;$("recordingFormat").disabled=live;}
function updateTime(){const seconds=Math.floor((Date.now()-recordingStarted)/1000),h=String(Math.floor(seconds/3600)).padStart(2,"0"),m=String(Math.floor(seconds%3600/60)).padStart(2,"0"),s=String(seconds%60).padStart(2,"0");$("recordTime").textContent=`${h}:${m}:${s}`;}
function downloadWebm(blob){const url=URL.createObjectURL(blob),a=document.createElement("a"),stamp=new Date().toISOString().replace(/[:.]/g,"-");a.href=url;a.download=`RAFT-Vtuber-${stamp}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function saveRecording(){
  const blob=new Blob(chunks,{type:recorder.mimeType||"video/webm"}),format=$("recordingFormat").value;
  micStream?.getTracks().forEach(t=>t.stop());micStream=null;audioContext?.close();audioContext=null;
  if(format==="webm"){downloadWebm(blob);note(`WebM録画を保存しました（${(blob.size/1024/1024).toFixed(1)} MB）`);return;}
  try{
    $("recordState").textContent=`${format.toUpperCase()}へ変換中`;$("recordButton").disabled=true;note(`録画を${format.toUpperCase()}へ変換しています。長い4K録画では少し時間がかかります。`);
    const response=await fetch(`/recording/export?format=${format}`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:blob});const result=await response.json();if(!response.ok)throw new Error(result.error||"変換に失敗しました");
    note(`${format.toUpperCase()}録画を保存しました：${result.path}（${(result.size/1024/1024).toFixed(1)} MB）`);
  }catch(error){downloadWebm(blob);note(`${format.toUpperCase()}変換に失敗したためWebMで保存しました：${error.message}`,true);}
  finally{$("recordState").textContent="収録準備";$("recordButton").disabled=false;}
}
$("recordButton").addEventListener("click",()=>recorder?.state==="recording"?stopRecording():startRecording());
window.addEventListener("beforeunload",()=>{screenStream?.getTracks().forEach(t=>t.stop());micStream?.getTracks().forEach(t=>t.stop());stopTracking();});
createMembers();

async function refreshCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  cameraDevices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "videoinput");
  refreshSourceOptions();
}

async function createFaceTracker() {
  const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm");
  const files = await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm");
  return vision.FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: "GPU" },
    runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true,
    minFaceDetectionConfidence: .45, minTrackingConfidence: .45,
  });
}

function sourceLabel(peer) { return `${peer.name}・${peer.host}`; }
function refreshSourceOptions() {
  for (const member of members) {
    const select=$(`source-${member.no}`), current=select.value;
    const local=cameraDevices.map((device,index)=>`<option value="camera:${device.deviceId}">このPC：${device.label||`カメラ ${index+1}`}</option>`);
    const remote=lanPeers.filter(peer=>peer.activeMembers.includes(String(member.no))).map(peer=>`<option value="lan:${peer.instanceId}">LAN：${sourceLabel(peer)}（追従済み）</option>`);
    select.innerHTML=`<option value="">追従元を選択</option>${local.join("")}${remote.join("")}`;
    if(current&&[...select.options].some(option=>option.value===current)) select.value=current;
    else if(remote.length) select.value=`lan:${lanPeers.find(peer=>peer.activeMembers.includes(String(member.no))).instanceId}`;
    else if(cameraDevices.length) select.value=`camera:${cameraDevices[0].deviceId}`;
    const status=$(`source-status-${member.no}`), peerAvailable=remote.length>0;
    if(!trackingRunning){status.textContent=peerAvailable?"サーバーあり":"未接続";status.classList.toggle("online",peerAvailable);}
  }
}

async function refreshLanPeers() {
  try { const response=await fetch("/lan/peers",{cache:"no-store"}),data=await response.json();lanPeers=data.peers||[];refreshSourceOptions(); } catch {}
}

async function startTracking(restart=false) {
  if (trackingRunning && !restart) return stopTracking();
  if (trackingRunning) stopTracking();
  try {
    $("trackingButton").disabled=true; $("trackingButton").textContent="準備中…";
    const assignments=[...states.values()].map(state=>({state,source:$(`source-${state.member.no}`).value})).filter(item=>item.source);
    const localGroups=new Map();
    for(const assignment of assignments){
      if(assignment.source.startsWith("camera:")){const deviceId=assignment.source.slice(7);if(!localGroups.has(deviceId))localGroups.set(deviceId,[]);localGroups.get(deviceId).push(assignment.state.member.no);}
      if(assignment.source.startsWith("lan:")) connectLanSource(assignment.state.member,assignment.source.slice(4));
    }
    for(const [deviceId,memberNumbers] of localGroups) await openLocalTracker(deviceId,memberNumbers);
    if(!localGroups.size&&!lanEvents.size) throw new Error("表示するキャラの追従元を選択してください");
    trackingRunning=true; $("trackingButton").disabled=false; $("trackingButton").textContent="追従停止"; $("trackingState").classList.add("live"); $("trackingState").lastChild.textContent=" 追従中";
    note("キャラ別追従中です。各キャラは選択したカメラまたはLAN上のPCから動きを受け取ります。");
    trackingAnimation=requestAnimationFrame(trackFrames);
  } catch(error) { stopTracking();$("trackingButton").disabled=false;note(`追従を開始できません: ${error.message}`,true); }
}
function stopTracking() {
  trackingRunning=false;cancelAnimationFrame(trackingAnimation);for(const tracker of localTrackers.values()){tracker.stream.getTracks().forEach(track=>track.stop());tracker.landmarker?.close();tracker.video.remove();}localTrackers.clear();for(const event of lanEvents.values())event.close();lanEvents.clear();$("trackingButton").textContent="キャラ別追従を開始";$("trackingState").classList.remove("live");$("trackingState").lastChild.textContent=" 追従停止中";for(const member of members){const status=$(`source-status-${member.no}`);status.textContent="未接続";status.classList.remove("online");}refreshSourceOptions();
}
async function openLocalTracker(deviceId,memberNumbers){
  const stream=await navigator.mediaDevices.getUserMedia({video:{...(deviceId?{deviceId:{exact:deviceId}}:{}),width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:false}),video=document.createElement("video");video.autoplay=true;video.muted=true;video.playsInline=true;video.srcObject=stream;$("trackingVideos").append(video);await video.play();const landmarker=await createFaceTracker();localTrackers.set(deviceId,{stream,video,landmarker,memberNumbers,lastVideoTime:-1,lastSent:0});for(const no of memberNumbers){const status=$(`source-status-${no}`);status.textContent="カメラ追従中";status.classList.add("online");}await refreshCameras();
}
function connectLanSource(member,instanceId){
  const peer=lanPeers.find(item=>item.instanceId===instanceId);if(!peer)return;const event=new EventSource(`http://${peer.host}:${peer.port}/events?member=${member.no}`);event.onmessage=message=>fetch(`/pose?member=${member.no}`,{method:"POST",headers:{"Content-Type":"application/json"},body:message.data}).catch(()=>{});event.onopen=()=>{const status=$(`source-status-${member.no}`);status.textContent="追従済み";status.classList.add("online");};event.onerror=()=>{const status=$(`source-status-${member.no}`);status.textContent="再接続中";status.classList.remove("online");};lanEvents.set(member.no,event);
}
function blendshapeMap(result) { return Object.fromEntries((result.faceBlendshapes?.[0]?.categories||[]).map(item=>[item.categoryName,item.score])); }
function makePose(result) {
  const lm=result.faceLandmarks?.[0]; if(!lm)return null;
  const left=lm[234],right=lm[454],top=lm[10],chin=lm[152],nose=lm[1],faceH=Math.max(.001,Math.hypot(chin.x-top.x,chin.y-top.y));
  const mouthGap=Math.hypot(lm[14].x-lm[13].x,lm[14].y-lm[13].y), shapes=blendshapeMap(result), mouth=Math.max(0,Math.min(1,(mouthGap/faceH-.008)/.186));
  const eyeL=1-(shapes.eyeBlinkLeft||0),eyeR=1-(shapes.eyeBlinkRight||0);
  return {x:(nose.x-.5)*-2.6,y:(nose.y-.48)*2.1,roll:Math.atan2(right.y-left.y,right.x-left.x)*-1,depth:Math.max(-1,Math.min(1,(Math.hypot(right.x-left.x,right.y-left.y)-.29)*5)),voice:mouth,mouth,gazeX:((shapes.eyeLookOutLeft||0)-(shapes.eyeLookInLeft||0)+(shapes.eyeLookInRight||0)-(shapes.eyeLookOutRight||0))/2,gazeY:((shapes.eyeLookDownLeft||0)+(shapes.eyeLookDownRight||0)-(shapes.eyeLookUpLeft||0)-(shapes.eyeLookUpRight||0))/2,eyeOpen:(eyeL+eyeR)/2,eyeL,eyeR,smile:((shapes.mouthSmileLeft||0)+(shapes.mouthSmileRight||0))/2,brow:(shapes.browInnerUp||0)-((shapes.browDownLeft||0)+(shapes.browDownRight||0))/2,speaking:mouth>.06};
}
function trackFrames(now) {
  if(!trackingRunning)return;
  for(const tracker of localTrackers.values())if(tracker.video.readyState>=2&&tracker.video.currentTime!==tracker.lastVideoTime&&now-tracker.lastSent>32){tracker.lastVideoTime=tracker.video.currentTime;tracker.lastSent=now;const pose=makePose(tracker.landmarker.detectForVideo(tracker.video,now));if(pose)for(const no of tracker.memberNumbers)fetch(`/pose?member=${no}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(pose)}).catch(()=>{});}
  trackingAnimation=requestAnimationFrame(trackFrames);
}
$("trackingButton").addEventListener("click",startTracking);
navigator.mediaDevices?.addEventListener?.("devicechange",refreshCameras);
refreshCameras();
refreshLanPeers();setInterval(refreshLanPeers,2000);
