import fs from "node:fs";
import { PNG } from "pngjs";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("input and output are required");

const png = PNG.sync.read(fs.readFileSync(input));
const { width, height, data } = png;
const seen = new Uint8Array(width * height);
const queue = new Int32Array(width * height);
let head = 0;
let tail = 0;

const isOutside = (p) => {
  const i = p * 4;
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  return data[i + 3] > 0 && r > 188 && g > 188 && b > 188 && Math.max(r, g, b) - Math.min(r, g, b) < 24;
};
const add = (p) => {
  if (seen[p] || !isOutside(p)) return;
  seen[p] = 1;
  queue[tail++] = p;
};
for (let x = 0; x < width; x++) {
  add(x);
  add((height - 1) * width + x);
}
for (let y = 0; y < height; y++) {
  add(y * width);
  add(y * width + width - 1);
}
while (head < tail) {
  const p = queue[head++];
  const x = p % width;
  const y = Math.floor(p / width);
  data[p * 4 + 3] = 0;
  if (x) add(p - 1);
  if (x + 1 < width) add(p + 1);
  if (y) add(p - width);
  if (y + 1 < height) add(p + width);
}
fs.writeFileSync(output, PNG.sync.write(png));
