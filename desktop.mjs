import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  nativeImage,
  powerSaveBlocker,
  session,
  Tray,
} from "electron";
import updater from "electron-updater";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { autoUpdater } = updater;

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const baseUrl = "http://127.0.0.1:8777";
let mainWindow,
  tray,
  updateProgressWindow,
  updateCheckInProgress = false,
  updateDownloadActive = false,
  updateOperationStartedAt = 0,
  updateCheckStage = "開始前",
  serverCloseQuestionOpen = false,
  manualUpdateCheck = false,
  macUpdateOnQuit = null,
  macUpdateStarted = false,
  powerSaveBlockerId = null,
  quitting = false;
const trackers = new Map();
const trackerTitles = {
  "/raft/": "ラフト追従",
  "/mai/": "まい追従",
  "/tanutsuna/": "たぬつな追従",
  "/yansan/": "やんさん追従",
  "/muto/": "ムート追従",
  "/moron/": "もろん追従",
  "/week/": "ウィーク追従",
};
const appIcon = nativeImage.createFromPath(
  fileURLToPath(new URL("./members/icon/icon.png", import.meta.url)),
);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

function windowOptions(width = 1180, height = 820, keepActive = false) {
  return {
    width,
    height,
    minWidth: 780,
    minHeight: 620,
    backgroundColor: "#101d23",
    icon: appIcon,
    webPreferences: {
      backgroundThrottling: !keepActive,
      contextIsolation: true,
      sandbox: true,
    },
  };
}

function updatePowerSaveBlocker() {
  const needsRealtimeTracking = [...trackers.values()].some(
    (win) => win && !win.isDestroyed(),
  );
  if (needsRealtimeTracking && powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension");
  } else if (!needsRealtimeTracking && powerSaveBlockerId !== null) {
    if (powerSaveBlocker.isStarted(powerSaveBlockerId))
      powerSaveBlocker.stop(powerSaveBlockerId);
    powerSaveBlockerId = null;
  }
}

function releaseUnusedVideoCaptureProcess() {
  if (trackers.size > 0 || quitting) return;
  setTimeout(() => {
    if (trackers.size > 0 || quitting) return;
    for (const metric of app.getAppMetrics()) {
      const description = JSON.stringify(metric).toLowerCase();
      if (
        metric.type === "Utility" &&
        (description.includes("video_capture") || description.includes("video capture"))
      ) {
        try {
          process.kill(metric.pid, "SIGTERM");
        } catch {}
      }
    }
  }, 1200);
}

function openTracker(pathname, title) {
  let win = trackers.get(pathname);
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return win;
  }
  win = new BrowserWindow({ ...windowOptions(1120, 800, true), title });
  trackers.set(pathname, win);
  updatePowerSaveBlocker();
  win.loadURL(`${baseUrl}${pathname}?desktop=1`);
  win.on("closed", () => {
    if (trackers.get(pathname) === win) trackers.delete(pathname);
    updatePowerSaveBlocker();
    releaseUnusedVideoCaptureProcess();
  });
  return win;
}

async function showMain() {
  if (!mainWindow || mainWindow.isDestroyed()) await createMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.focus();
}

async function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  const win = new BrowserWindow({
    ...windowOptions(),
    title: "RAFT Vtuber",
  });
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.on("close", async (event) => {
    if (quitting) return;
    event.preventDefault();
    if (serverCloseQuestionOpen) return;
    const activeTrackers = [...trackers.values()].filter(
      (tracker) => tracker && !tracker.isDestroyed(),
    );
    if (activeTrackers.length === 0) {
      win.destroy();
      releaseUnusedVideoCaptureProcess();
      return;
    }
    serverCloseQuestionOpen = true;
    const result = await dialog.showMessageBox(win, {
      type: "question",
      buttons: ["はい", "いいえ"],
      defaultId: 1,
      cancelId: 1,
      message: "サーバーを閉じますか？",
      detail:
        "「はい」を選ぶと、起動中のメンバーカメラとサーバーを終了します。\n「いいえ」を選ぶと、サーバーを残してこのウインドウだけ閉じます。",
      noLink: true,
    });
    serverCloseQuestionOpen = false;
    if (result.response === 0) {
      quitting = true;
      app.quit();
      return;
    }
    win.destroy();
  });
  win.webContents.on("will-navigate", (event, url) => {
    const target = new URL(url);
    if (target.origin !== baseUrl || !trackerTitles[target.pathname]) return;
    event.preventDefault();
    if (target.searchParams.get("obs") === "1") {
      clipboard.writeText(url);
      dialog.showMessageBox(win, {
        type: "info",
        message: "OBS用URLをコピーしました。",
        detail:
          "OBSのブラウザソースへ貼り付けてください。ランチャーでは重いアバター描画を開きません。",
      });
      return;
    }
    openTracker(target.pathname, trackerTitles[target.pathname]);
  });
  await win.loadURL(baseUrl);
  return win;
}

function updateProgressHtml(message, detail = "", percent = null, stage = -1, steps = []) {
  const safe = (text) => String(text).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
  const progress = Number.isFinite(percent)
    ? `<div class="bar"><i style="width:${Math.max(0, Math.min(100, percent))}%"></i></div>`
    : "";
  const checklist = steps.length
    ? `<ol>${steps.map((step, index) => `<li class="${index < stage ? "done" : index === stage ? "current" : ""}"><b>${index < stage ? "✓" : index === stage ? "●" : "○"}</b>${safe(step)}</li>`).join("")}</ol>`
    : "";
  const startedAt = updateOperationStartedAt || Date.now();
  return `<!doctype html><meta charset="utf-8"><style>
    :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#101d23;color:#f5fafb;font:14px -apple-system,BlinkMacSystemFont,sans-serif;display:grid;place-items:center;height:100vh}
    main{width:100%;padding:22px 24px}.head{display:grid;grid-template-columns:32px 1fr;gap:14px;align-items:center}.spinner{width:28px;height:28px;border:3px solid #37515b;border-top-color:#f5f7f8;border-radius:50%;animation:spin .8s linear infinite}h1{font-size:15px;margin:0 0 7px}p{color:#a9bbc1;margin:0;font-size:12px;line-height:1.5}.elapsed{color:#f0ad38;font-variant-numeric:tabular-nums}.bar{height:5px;background:#263b44;border-radius:5px;overflow:hidden;margin-top:12px}.bar i{display:block;height:100%;background:#f0ad38;border-radius:5px;transition:width .2s}ol{list-style:none;padding:12px 0 0 46px;margin:0;display:grid;gap:6px;color:#71878f;font-size:12px}li b{display:inline-block;width:20px}.done{color:#74c99a}.current{color:#f5fafb;font-weight:600}@keyframes spin{to{transform:rotate(360deg)}}</style>
    <main><div class="head"><div class="spinner"></div><div><h1>${safe(message)}</h1><p>${safe(detail)}　<span class="elapsed" id="elapsed">0秒経過</span></p>${progress}</div></div>${checklist}</main>
    <script>const startedAt=${startedAt};const tick=()=>{const seconds=Math.max(0,Math.floor((Date.now()-startedAt)/1000));document.getElementById("elapsed").textContent=seconds+"秒経過"};tick();setInterval(tick,250)</script>`;
}

function showUpdateProgress(message, detail = "", percent = null, stage = -1, steps = []) {
  if (!updateProgressWindow || updateProgressWindow.isDestroyed()) {
    updateProgressWindow = new BrowserWindow({
      width: 410,
      height: steps.length ? 270 : 190,
      title: "アップデート",
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: "#101d23",
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    updateProgressWindow.setMenuBarVisibility(false);
    updateProgressWindow.on("closed", () => {
      updateProgressWindow = null;
    });
  }
  updateProgressWindow.setSize(410, steps.length ? 270 : 190, true);
  updateProgressWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(updateProgressHtml(message, detail, percent, stage, steps))}`,
  );
  updateProgressWindow.show();
  updateProgressWindow.focus();
}

function closeUpdateProgress() {
  if (updateProgressWindow && !updateProgressWindow.isDestroyed())
    updateProgressWindow.close();
  updateProgressWindow = null;
}

function makeTray() {
  tray = new Tray(
    process.platform === "darwin"
      ? nativeImage.createEmpty()
      : appIcon.resize({ width: 22, height: 22 }),
  );
  if (process.platform === "darwin") tray.setTitle("V");
  tray.setToolTip("RAFT Vtuber");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "スタジオを開く", click: showMain },
      {
        label: "No.1 ラフト追従を開く",
        click: () => openTracker("/raft/", "ラフト追従"),
      },
      { label: "No.2 まい追従を開く", click: () => openTracker("/mai/", "まい追従") },
      {
        label: "No.3 たぬつな追従を開く",
        click: () => openTracker("/tanutsuna/", "たぬつな追従"),
      },
      { label: "No.4 やんさん追従を開く", click: () => openTracker("/yansan/", "やんさん追従") },
      { label: "No.5 ムート追従を開く", click: () => openTracker("/muto/", "ムート追従") },
      { label: "No.6 もろん追従を開く", click: () => openTracker("/moron/", "もろん追従") },
      {
        label: "No.7 ウィーク追従を開く",
        click: () => openTracker("/week/", "ウィーク追従"),
      },
      { type: "separator" },
      { label: `現在のバージョン ${app.getVersion()}`, enabled: false },
      { label: "アップデートを確認", click: checkForUpdates },
      { type: "separator" },
      {
        label: "完全に終了",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", showMain);
}

async function checkForUpdates(showResult = true) {
  if (!app.isPackaged) {
    if (showResult)
      await dialog.showMessageBox({
        type: "info",
        message: "開発版ではインストーラー更新を確認しません。",
      });
    return;
  }
  if (updateCheckInProgress || updateDownloadActive) {
    if (showResult)
      showUpdateProgress(
        updateDownloadActive
          ? "アップデートをダウンロードしています…"
          : "更新バージョンがあるか確認しています…",
        "そのままお待ちください。",
      );
    return;
  }
  try {
    updateCheckInProgress = true;
    manualUpdateCheck = showResult;
    updateOperationStartedAt = Date.now();
    const steps = [
      "現在のバージョンを確認",
      "GitHubへ接続",
      "公開中のバージョンを比較",
      "インストーラー情報を検証",
    ];
    if (showResult)
      showUpdateProgress(
        "更新バージョンがあるか確認しています…",
        `現在: ${app.getVersion()}`,
        null,
        0,
        steps,
      );
    updateCheckStage = "GitHubへの接続";
    if (showResult)
      showUpdateProgress(
        "GitHubへ接続しています…",
        "通常は数秒で完了します。",
        null,
        1,
        steps,
      );
    const metadataName = process.platform === "darwin" ? "latest-mac.yml" : "latest.yml",
      metadataUrl = `https://github.com/Raft3921/Vtuber/releases/latest/download/${metadataName}`,
      metadataResponse = await fetch(metadataUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
    if (!metadataResponse.ok)
      throw new Error(`GitHubが更新情報を返しませんでした（HTTP ${metadataResponse.status}）`);
    const metadata = await metadataResponse.text(),
      publishedVersion = metadata.match(/^version:\s*["']?([^\s"']+)/m)?.[1];
    if (!publishedVersion) throw new Error("公開中のバージョン番号を読み取れませんでした。");
    updateCheckStage = "バージョンの比較";
    if (showResult)
      showUpdateProgress(
        "公開中のバージョンを比較しています…",
        `現在 ${app.getVersion()} ／ 公開 ${publishedVersion}`,
        null,
        2,
        steps,
      );
    const normalizeVersion = (version) =>
      String(version).replace(/^v/, "").split(".").map((part) => Number(part) || 0),
      currentParts = normalizeVersion(app.getVersion()),
      publishedParts = normalizeVersion(publishedVersion),
      versionComparison = [0, 1, 2, 3].reduce(
        (result, index) =>
          result || Math.sign((publishedParts[index] || 0) - (currentParts[index] || 0)),
        0,
      ),
      hasNewerVersion = versionComparison > 0;
    if (!hasNewerVersion) {
      updateCheckInProgress = false;
      manualUpdateCheck = false;
      closeUpdateProgress();
      if (showResult)
        await dialog.showMessageBox(mainWindow, {
          type: "info",
          message: "現在のバージョンは最新版です。",
          detail: `現在: ${app.getVersion()}\n公開中: ${publishedVersion}\n確認時間: ${((Date.now() - updateOperationStartedAt) / 1000).toFixed(1)}秒\n確認日時: ${new Date().toLocaleString("ja-JP")}`,
        });
      return;
    }
    updateCheckStage = "インストーラー情報の検証";
    if (showResult)
      showUpdateProgress(
        "インストーラー情報を検証しています…",
        `新しいバージョン ${publishedVersion} が見つかりました。`,
        null,
        3,
        steps,
      );
    await Promise.race([
      autoUpdater.checkForUpdates(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("インストーラー情報の検証が30秒でタイムアウトしました。")), 30000),
      ),
    ]);
  } catch (error) {
    const shouldShowError = showResult && manualUpdateCheck;
    updateCheckInProgress = false;
    manualUpdateCheck = false;
    closeUpdateProgress();
    if (shouldShowError)
      await dialog.showMessageBox({
        type: "warning",
        message: "アップデートを確認できませんでした。",
        detail: `停止した工程: ${updateCheckStage}\n経過時間: ${((Date.now() - updateOperationStartedAt) / 1000).toFixed(1)}秒\n\n${String(error?.message || error)}\n\n通信状態を確認して、もう一度「アップデートを確認」を押してください。`,
      });
  }
}

function startMacUpdateInstaller(downloadedFile) {
  if (process.platform !== "darwin" || macUpdateStarted) return false;
  macUpdateStarted = true;
  const executable = app.getPath("exe"),
    appBundle = dirname(dirname(dirname(executable))),
    logFile = join(app.getPath("userData"), "updater-install.log"),
    script = `
pid="$1"
archive="$2"
app_path="$3"
log_file="$4"
exec >>"$log_file" 2>&1
echo "$(date '+%Y-%m-%d %H:%M:%S') update start: $archive"
while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done
work_dir="$(mktemp -d -t raft-vtuber-update.XXXXXX)" || exit 20
backup_path="\${app_path}.update-backup"
cleanup() { rm -rf "$work_dir"; }
trap cleanup EXIT
/usr/bin/ditto -x -k "$archive" "$work_dir" || exit 21
new_app="$work_dir/$(basename "$app_path")"
[[ -d "$new_app" ]] || exit 22
rm -rf "$backup_path"
mv "$app_path" "$backup_path" || exit 23
if mv "$new_app" "$app_path"; then
  /usr/bin/xattr -dr com.apple.quarantine "$app_path" 2>/dev/null || true
  /usr/bin/open "$app_path"
  open_status=$?
  if [[ $open_status -eq 0 ]]; then
    rm -rf "$backup_path"
    echo "$(date '+%Y-%m-%d %H:%M:%S') update success"
    exit 0
  fi
fi
rm -rf "$app_path"
mv "$backup_path" "$app_path"
/usr/bin/open "$app_path"
echo "$(date '+%Y-%m-%d %H:%M:%S') update failed and rolled back"
exit 24
`;
  const child = spawn(
    "/bin/zsh",
    ["-c", script, "raft-vtuber-updater", String(process.pid), downloadedFile, appBundle, logFile],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  return true;
}

app.on("second-instance", showMain);

await app.whenReady();
process.env.VTUBER_CONFIG_ROOT = join(app.getPath("userData"), "config");
try {
  const response = await fetch(baseUrl);
  const body = response.ok ? await response.text() : "";
  if (!body.includes("VTuberスタジオ")) throw new Error("unexpected server");
} catch {
  try {
    await import("./server.mjs");
  } catch (error) {
    await dialog.showMessageBox({
      type: "error",
      message: "RAFT Vtuberを起動できませんでした。",
      detail: `ローカルサーバー（127.0.0.1:8777）を開始できません。\n${String(error?.message || error)}`,
    });
    app.quit();
    process.exit(1);
  }
}
session.defaultSession.setPermissionRequestHandler(
  (_webContents, permission, callback) => {
    callback(permission === "media");
  },
);
session.defaultSession.setPermissionCheckHandler(
  (_webContents, permission) => permission === "media",
);
await createMainWindow();
makeTray();
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on("update-not-available", async () => {
  if (!updateCheckInProgress) return;
  updateCheckInProgress = false;
  if (!manualUpdateCheck) return;
  manualUpdateCheck = false;
  closeUpdateProgress();
  await dialog.showMessageBox(mainWindow, {
    type: "info",
    message: "現在のバージョンは最新版です。",
    detail: `バージョン ${app.getVersion()}\n確認日時: ${new Date().toLocaleString("ja-JP")}`,
  });
});
autoUpdater.on("update-available", async (info) => {
  if (!updateCheckInProgress) return;
  updateCheckInProgress = false;
  closeUpdateProgress();
  const releaseNotes = Array.isArray(info?.releaseNotes)
    ? info.releaseNotes
        .map((entry) => entry?.note || entry?.version || "")
        .filter(Boolean)
        .join("\n")
    : String(info?.releaseNotes || "更新内容はダウンロードページで確認できます。")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
  const result = await dialog.showMessageBox(mainWindow, {
    type: "info",
    buttons: ["ダウンロード", "後で"],
    defaultId: 0,
    cancelId: 1,
    message: `新しいバージョン ${info?.version || ""} があります。`,
    detail: `現在のバージョン: ${app.getVersion()}\n新しいバージョン: ${info?.version || "不明"}\n\n更新内容\n${releaseNotes || "更新内容はありません。"}`,
    noLink: true,
  });
  manualUpdateCheck = false;
  if (result.response !== 0) return;
  updateDownloadActive = true;
  updateOperationStartedAt = Date.now();
  showUpdateProgress(
    `バージョン ${info?.version || "最新版"} をダウンロードしています…`,
    "完了するまでアプリを終了しないでください。",
    0,
  );
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    if (!updateDownloadActive) return;
    updateDownloadActive = false;
    closeUpdateProgress();
    await dialog.showMessageBox(mainWindow, {
      type: "warning",
      message: "アップデートをダウンロードできませんでした。",
      detail: String(error?.message || error),
    });
  }
});
autoUpdater.on("download-progress", (progress) => {
  if (!updateDownloadActive) return;
  const percent = Number(progress?.percent) || 0;
  showUpdateProgress(
    "アップデートをダウンロードしています…",
    `${Math.round(percent)}% 完了`,
    percent,
  );
});
autoUpdater.on("error", async (error) => {
  const shouldShowError = manualUpdateCheck || updateDownloadActive;
  updateCheckInProgress = false;
  updateDownloadActive = false;
  manualUpdateCheck = false;
  closeUpdateProgress();
  if (!shouldShowError || !mainWindow || mainWindow.isDestroyed()) return;
  await dialog.showMessageBox(mainWindow, {
    type: "warning",
    message: "アップデート処理でエラーが発生しました。",
    detail: String(error?.message || error),
  });
});
autoUpdater.on("update-downloaded", async (event) => {
  updateCheckInProgress = false;
  updateDownloadActive = false;
  manualUpdateCheck = false;
  closeUpdateProgress();
  const result = await dialog.showMessageBox(mainWindow, {
    type: "info",
    buttons: ["今すぐ再起動して更新", "終了時に更新"],
    defaultId: 0,
    cancelId: 1,
    message: "新しいバージョンをダウンロードしました。",
  });
  if (result.response === 0) {
    quitting = true;
    if (process.platform === "darwin") {
      if (!startMacUpdateInstaller(event.downloadedFile)) quitting = false;
      else app.quit();
    } else autoUpdater.quitAndInstall(false, true);
  } else if (process.platform === "darwin") {
    macUpdateOnQuit = event.downloadedFile;
  }
});
setTimeout(() => checkForUpdates(false), 3000);

app.on("activate", showMain);
app.on("window-all-closed", () => {});
app.on("before-quit", () => {
  quitting = true;
  if (macUpdateOnQuit && !macUpdateStarted)
    startMacUpdateInstaller(macUpdateOnQuit);
});
