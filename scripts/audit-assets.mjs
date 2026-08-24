import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(
  await readFile(join(root, "assets-manifest.json"), "utf8"),
);
const expected = new Set(Object.values(manifest).flat());
const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const packagedFiles = new Set(packageJson.build?.files || []);
const actual = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (extname(entry.name).toLowerCase() === ".png")
      actual.push(relative(root, file));
  }
}
await walk(join(root, "members"));
const missing = [...expected].filter((file) => !actual.includes(file));
const unlisted = actual.filter((file) => !expected.has(file));
const notPackaged = [...expected].filter((file) => !packagedFiles.has(file));
const sizeOf = async (files) => {
  let bytes = 0;
  for (const file of files) bytes += (await stat(join(root, file))).size;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
console.log(
  `実行用: ${expected.size}ファイル / ${await sizeOf([...expected])}`,
);
console.log(
  `開発・旧版（配布対象外）: ${unlisted.length}ファイル / ${await sizeOf(unlisted)}`,
);
if (missing.length) console.log("欠落:\n" + missing.join("\n"));
if (notPackaged.length)
  console.log("package.jsonへの登録漏れ:\n" + notPackaged.join("\n"));
if (missing.length || notPackaged.length) process.exitCode = 1;
