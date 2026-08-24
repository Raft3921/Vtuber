import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  powerSaveBlocker,
  session,
  Tray,
} from "electron";
import updater from "electron-updater";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const { autoUpdater } = updater;

app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const baseUrl = "http://127.0.0.1:8777";
let mainWindow,
  tray,
  manualUpdateCheck = false,
  quitting = false;
const trackers = new Map();
const appIcon = nativeImage.createFromPath(
  fileURLToPath(new URL("./members/icon/icon.png", import.meta.url)),
);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

function windowOptions(width = 1180, height = 820) {
  return {
    width,
    height,
    minWidth: 780,
    minHeight: 620,
    backgroundColor: "#101d23",
    icon: appIcon,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: true,
    },
  };
}

function openTracker(pathname, title) {
  let win = trackers.get(pathname);
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return win;
  }
  win = new BrowserWindow({ ...windowOptions(1120, 800), title });
  trackers.set(pathname, win);
  win.loadURL(`${baseUrl}${pathname}?desktop=1`);
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });
  return win;
}

function showMain() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.focus();
}

function makeTray() {
  tray = new Tray(appIcon.resize({ width: 22, height: 22 }));
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
  try {
    manualUpdateCheck = showResult;
    await autoUpdater.checkForUpdates();
  } catch (error) {
    if (showResult)
      await dialog.showMessageBox({
        type: "warning",
        message: "アップデートを確認できませんでした。",
        detail: String(error?.message || error),
      });
  }
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
powerSaveBlocker.start("prevent-app-suspension");

mainWindow = new BrowserWindow({
  ...windowOptions(),
  title: "RAFT Vtuber",
});
await mainWindow.loadURL(baseUrl);
mainWindow.on("close", (event) => {
  if (quitting) return;
  event.preventDefault();
  mainWindow.hide();
});
mainWindow.webContents.on("will-navigate", (event, url) => {
  const target = new URL(url);
  if (
    target.origin !== baseUrl ||
    target.searchParams.get("obs") === "1" ||
    !["/raft/", "/mai/", "/tanutsuna/", "/yansan/", "/muto/", "/moron/", "/week/"].includes(target.pathname)
  )
    return;
  event.preventDefault();
  const trackerTitles = {
    "/raft/": "ラフト追従", "/mai/": "まい追従",
    "/tanutsuna/": "たぬつな追従", "/yansan/": "やんさん追従",
    "/muto/": "ムート追従", "/moron/": "もろん追従", "/week/": "ウィーク追従",
  };
  openTracker(target.pathname, trackerTitles[target.pathname]);
});
makeTray();
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on("update-not-available", async () => {
  if (!manualUpdateCheck) return;
  manualUpdateCheck = false;
  await dialog.showMessageBox(mainWindow, {
    type: "info",
    message: "現在のバージョンは最新版です。",
  });
});
autoUpdater.on("update-available", () => {
  manualUpdateCheck = false;
});
autoUpdater.on("update-downloaded", async () => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: "info",
    buttons: ["今すぐ再起動して更新", "終了時に更新"],
    defaultId: 0,
    cancelId: 1,
    message: "新しいバージョンをダウンロードしました。",
  });
  if (result.response === 0) {
    quitting = true;
    autoUpdater.quitAndInstall();
  }
});
setTimeout(() => checkForUpdates(false), 3000);

app.on("activate", showMain);
app.on("window-all-closed", () => {});
app.on("before-quit", () => {
  quitting = true;
});
