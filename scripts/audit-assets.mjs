import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(
  await readFile(join(root, "assets-manifest.json"), "utf8"),
);
const expected = new Set(Object.values(manifest).flat());
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
console.log(`登録: ${expected.size} / 実在: ${actual.length}`);
if (missing.length) console.log("欠落:\n" + missing.join("\n"));
if (unlisted.length) console.log("未登録:\n" + unlisted.join("\n"));
if (missing.length || unlisted.length) process.exitCode = 1;
