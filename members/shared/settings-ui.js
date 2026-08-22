import { visualColorControls, visualRangeControls } from "./studio-config.js";

export function makeSlider([key, label, min, max, step], source, save) {
  const wrap = document.createElement("label");
  wrap.className = "layout-control";
  const name = document.createElement("span");
  name.textContent = label;
  const output = document.createElement("output");
  output.value = String(source[key]);
  output.textContent = String(source[key]);
  const input = document.createElement("input");
  input.type = "range";
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = source[key];
  input.oninput = () => {
    source[key] = Number(input.value);
    output.value = input.value;
    output.textContent = input.value;
    save();
  };
  wrap.append(name, output, input);
  return wrap;
}

export function appendLayoutSection(host, layout, controls, save) {
  const section = document.createElement("section");
  section.className = "mapping-group";
  section.innerHTML = "<h3>顔パーツの基準位置</h3>";
  const grid = document.createElement("div");
  grid.className = "layout-grid";
  for (const control of controls) grid.append(makeSlider(control, layout, save));
  section.append(grid);
  host.append(section);
}

export function appendVisualSection(host, visual, save) {
  const section = document.createElement("section");
  section.className = "mapping-group";
  section.innerHTML = "<h3>見た目・アウトライン</h3><small>皮膚の陰影は顔・首などの肌色部分だけに微妙なグラデーションを加えます。背景や白目には適用されません。</small>";
  const grid = document.createElement("div");
  grid.className = "visual-grid";
  for (const control of visualRangeControls) grid.append(makeSlider(control, visual, save));
  for (const [key, label] of visualColorControls) {
    const wrap = document.createElement("label");
    wrap.className = "color-control";
    const name = document.createElement("span");
    name.textContent = label;
    const input = document.createElement("input");
    input.type = "color";
    input.value = visual[key];
    input.oninput = () => {
      visual[key] = input.value;
      save();
    };
    wrap.append(name, input);
    grid.append(wrap);
  }
  section.append(grid);
  host.append(section);
}
