export const catalog = {
  eye: [
    { id: "blink-0", label: "超めちゃ開け" },
    { id: "blink-1", label: "めちゃ開け" },
    { id: "blink-2", label: "ちょいめちゃ開け" },
    { id: "normal", label: "開け（瞳追従）" },
    { id: "blink-4", label: "ちょい閉じ" },
    { id: "blink-5", label: "閉じ" },
  ],
  brow: [
    { id: "raised", label: "上げ眉" },
    { id: "relaxed", label: "通常眉" },
    { id: "frown", label: "寄せ眉・不機嫌" },
  ],
  mouth: Array.from({ length: 16 }, (_, i) => ({
    id: `speech-${i}`,
    label: `${["通常", "笑顔", "不機嫌", "丸口"][Math.floor(i / 4)]} ${["最小", "小", "中", "最大"][i % 4]}`,
  })),
};

export const stateLabels = {
  eye: ["超めちゃ開け", "めちゃ開け", "ちょいめちゃ開け", "開け", "ちょい閉じ", "閉じ"],
  brow: ["上げ眉", "通常眉", "寄せ眉・不機嫌"],
  mouth: Array.from(
    { length: 16 },
    (_, i) => `${["通常", "笑顔", "不機嫌", "丸口"][Math.floor(i / 4)]}・${["最小", "小", "中", "最大"][i % 4]}`,
  ),
};

export const blankProfiles = () => ({
  eye: Array(6).fill(null),
  brow: Array(3).fill(null),
  mouth: Array(16).fill(null),
});

export const defaultLayout = {
  eyeGap: 204,
  eyeX: 0,
  eyeY: 614,
  eyeScale: 1,
  eyeRotation: 0,
  browGap: 204,
  browX: 0,
  browY: 5,
  browScale: 1,
  browRotation: 0,
  browTilt: 17,
  irisGap: 204,
  irisY: 0,
  irisSize: 34,
  noseX: 0,
  noseY: 0,
  noseScale: 1,
  noseRotation: 0,
  mouthX: 0,
  mouthY: 0,
  mouthScale: 1.15,
  mouthRotation: 0,
};

export const layoutControls = [
  ["eyeGap", "目と目の間隔", 150, 270, 1],
  ["eyeX", "目全体の左右位置", -80, 80, 1],
  ["eyeY", "目の上下位置", 570, 660, 1],
  ["eyeScale", "目全体の大きさ", 0.65, 1.4, 0.01],
  ["eyeRotation", "目全体の角度", -20, 20, 0.5],
  ["browGap", "眉と眉の間隔", 150, 270, 1],
  ["browX", "眉全体の左右位置", -80, 80, 1],
  ["browY", "眉の上下位置", -40, 40, 1],
  ["browTilt", "眉毛の傾き", -30, 40, 1],
  ["browScale", "眉全体の大きさ", 0.65, 1.4, 0.01],
  ["browRotation", "眉全体の角度", -20, 20, 0.5],
  ["irisGap", "瞳と瞳の間隔", 150, 270, 1],
  ["irisY", "瞳の上下位置", -35, 35, 1],
  ["irisSize", "瞳の大きさ", 20, 55, 1],
  ["noseX", "鼻の左右位置", -60, 60, 1],
  ["noseY", "鼻の上下位置", -40, 40, 1],
  ["noseScale", "鼻の大きさ", 0.5, 1.6, 0.01],
  ["noseRotation", "鼻の角度", -30, 30, 0.5],
  ["mouthX", "口の左右位置", -80, 80, 1],
  ["mouthY", "口の上下位置", -55, 55, 1],
  ["mouthScale", "口全体の大きさ", 0.6, 1.8, 0.05],
  ["mouthRotation", "口の角度", -30, 30, 0.5],
];

export const visualColorControls = [
  ["outlineColor1", "第1アウトライン"],
  ["outlineColor2", "第2アウトライン"],
  ["outlineColor3", "第3アウトライン"],
];

export const visualRangeControls = [
  ["paintDepth", "皮膚の陰影", 0, 1, 0.01],
  ["backHairBrightness", "後ろ髪の明度", 0.5, 1.2, 0.01],
  ["outlineLayers", "アウトラインの層数", 0, 3, 1],
  ["outlineWidth", "1層ごとの太さ", 1, 20, 1],
];
