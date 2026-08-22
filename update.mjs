import { createHash } from "node:crypto";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const compareVersions = (a, b) => {
  const aa = String(a).split(".").map(Number),
    bb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    const delta = (aa[i] || 0) - (bb[i] || 0);
    if (delta) return delta;
  }
  return 0;
};

async function download(url, file) {
  const response = await fetch(url, {
    headers: { "User-Agent": "VTuber-Studio-Updater" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
}

function extract(zip, destination) {
  const result =
    process.platform === "win32"
      ? spawnSync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            `Expand-Archive -LiteralPath '${zip.replaceAll("'", "''")}' -DestinationPath '${destination.replaceAll("'", "''")}' -Force`,
          ],
          { stdio: "inherit" },
        )
      : spawnSync("/usr/bin/ditto", ["-x", "-k", zip, destination], {
          stdio: "inherit",
        });
  if (result.status !== 0) throw new Error("ZIPの展開に失敗しました");
}

async function payloadRoot(extracted) {
  const entries = await readdir(extracted, { withFileTypes: true });
  if (entries.length === 1 && entries[0].isDirectory())
    return join(extracted, entries[0].name);
  return extracted;
}

const preserved = new Set(["config", "update-config.json"]);
async function install(source) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (preserved.has(entry.name) || entry.name.startsWith(".update-"))
      continue;
    const from = join(source, entry.name),
      to = join(root, entry.name),
      backup = join(root, ".update-backup", entry.name);
    try {
      await stat(to);
      await rm(backup, { recursive: true, force: true });
      await cp(to, backup, { recursive: true });
    } catch {}
    await rm(to, { recursive: true, force: true });
    await cp(from, to, { recursive: true });
  }
}

try {
  const config = await readJson(join(root, "update-config.json"));
  if (!config.enabled || !config.manifestUrl) process.exit(0);
  const local = await readJson(join(root, "version.json"));
  const response = await fetch(config.manifestUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`更新情報 HTTP ${response.status}`);
  const manifest = await response.json();
  if (compareVersions(manifest.version, local.version) <= 0) {
    console.log(`更新確認: ${local.version} は最新版です。`);
    process.exit(0);
  }
  if (!manifest.archiveUrl || !manifest.sha256)
    throw new Error("更新情報が不完全です");
  const temp = await mkdtemp(join(tmpdir(), "vtuber-studio-update-"));
  const zip = join(temp, "update.zip"),
    extracted = join(temp, "extracted");
  console.log(
    `VTuberスタジオを ${local.version} → ${manifest.version} に更新します…`,
  );
  await download(manifest.archiveUrl, zip);
  const digest = createHash("sha256")
    .update(await readFile(zip))
    .digest("hex");
  if (digest.toLowerCase() !== String(manifest.sha256).toLowerCase())
    throw new Error("ZIPのSHA-256が一致しません");
  await import("node:fs/promises").then(({ mkdir }) =>
    mkdir(extracted, { recursive: true }),
  );
  extract(zip, extracted);
  await install(await payloadRoot(extracted));
  await rm(temp, { recursive: true, force: true });
  console.log("更新が完了しました。個人設定は保持されています。");
} catch (error) {
  console.warn(`自動更新をスキップしました: ${error.message}`);
}
