const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function sampledSkinColor(data, width, height) {
  const samples = [];
  for (let y = 4; y < height - 4; y++) {
    for (let x = 4; x < width - 4; x++) {
      // The nose drawing is centered. Sample the surrounding face instead.
      if (Math.abs(x - width / 2) < 12 && Math.abs(y - height / 2) < 22) continue;
      const i = (y * width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a > 220 && r > g && g > b && r - b < 105 && r + g + b > 430) samples.push([r, g, b]);
    }
  }
  if (!samples.length) return [255, 225, 207];
  samples.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  const middle = samples.slice(Math.floor(samples.length * .2), Math.ceil(samples.length * .8));
  return middle.reduce((sum, p) => [sum[0] + p[0] / middle.length, sum[1] + p[1] / middle.length, sum[2] + p[2] / middle.length], [0, 0, 0]).map(Math.round);
}

export function extractNoseLayer(base, crop) {
  const { x, y, width, height } = crop;
  const baseWithoutNose = document.createElement("canvas");
  baseWithoutNose.width = base.width; baseWithoutNose.height = base.height;
  const baseCtx = baseWithoutNose.getContext("2d");
  baseCtx.drawImage(base, 0, 0);

  const source = document.createElement("canvas");
  source.width = width; source.height = height;
  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  sourceCtx.drawImage(base, x, y, width, height, 0, 0, width, height);
  const pixels = sourceCtx.getImageData(0, 0, width, height);
  const skin = sampledSkinColor(pixels.data, width, height);

  // Retain only pixels sufficiently different from the local skin. This turns
  // the nose mark into a clean transparent layer instead of a moving rectangle.
  const cutout = new ImageData(width, height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const distance = Math.hypot(pixels.data[i] - skin[0], pixels.data[i + 1] - skin[1], pixels.data[i + 2] - skin[2]);
    const alpha = clamp((distance - 15) / 42, 0, 1) * pixels.data[i + 3];
    cutout.data[i] = pixels.data[i]; cutout.data[i + 1] = pixels.data[i + 1]; cutout.data[i + 2] = pixels.data[i + 2]; cutout.data[i + 3] = alpha;
  }
  const nose = document.createElement("canvas");
  nose.width = width; nose.height = height;
  nose.getContext("2d").putImageData(cutout, 0, 0);

  baseCtx.fillStyle = `rgb(${skin[0]} ${skin[1]} ${skin[2]})`;
  baseCtx.beginPath();
  baseCtx.ellipse(x + width / 2, y + height / 2, width * .37, height * .48, 0, 0, Math.PI * 2);
  baseCtx.fill();
  return { baseWithoutNose, nose, skin };
}
