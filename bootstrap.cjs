const { app, dialog } = require("electron");
const { appendFileSync } = require("node:fs");
const { join } = require("node:path");

const logFile = join(app.getPath("userData"), "startup.log");
const log = (value) => {
  try {
    appendFileSync(logFile, `${new Date().toISOString()} ${value}\n`);
  } catch {}
};

log("bootstrap start");

import("./desktop.mjs").catch(async (error) => {
  log(error?.stack || String(error));
  await app.whenReady();
  await dialog.showMessageBox({
    type: "error",
    message: "RAFT Vtuberの起動に失敗しました。",
    detail: String(error?.stack || error),
  });
  app.quit();
});
