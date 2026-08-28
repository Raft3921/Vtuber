const avatars = {
  raft: { member: "1", number: 1, name: "ラフト", module: "/raft/raft.js" },
  mai: {
    member: "2",
    number: 2,
    name: "まい",
    module: "/mai/mai.js",
    greenClothes: true,
  },
  tanutsuna: {
    member: "3",
    number: 3,
    name: "たぬつな",
    module: "/tanutsuna/tanutsuna.js",
  },
  yansan: { member: "4", number: 4, name: "やんさん", module: "/yansan/yansan.js" },
  muto: { member: "5", number: 5, name: "ムート", module: "/muto/muto.js" },
  moron: { member: "6", number: 6, name: "もろん", module: "/moron/moron.js" },
  gyoza: { member: "8", number: 8, name: "ギョーザ", module: "/gyoza/gyoza.js" },
};

const slug = location.pathname.split("/").filter(Boolean)[0],
  avatar = avatars[slug];

if (!avatar) throw new Error(`未登録のアバターです: ${slug}`);

document.title = `${avatar.name}・ライブ`;
document.querySelector("#memberName").textContent =
  `No.${avatar.number} ${avatar.name}`;

// A changing revision prevents OBS Browser Source from retaining an older failed page.
const obsRevision = Date.now();
const base = `http://127.0.0.1:8777/${slug}/?obs=1&member=${avatar.member}&v=${obsRevision}`;
const obsLinks = document.querySelector("#obsLinks");
obsLinks.innerHTML = [
  ["OBS 透過（推奨）", `${base}&bg=transparent`],
  [
    avatar.greenClothes ? "OBS GB（緑の服には非推奨）" : "OBS GB",
    `${base}&bg=green`,
  ],
  ["OBS BB", `${base}&bg=blue`],
]
  .map(
    ([label, url]) => `<section class="obs-copy-row">
      <strong>${label}</strong>
      <code>${url}</code>
      <button type="button" data-obs-url="${url}">URLをコピー</button>
    </section>`,
  )
  .join("");

async function copyObsUrl(button) {
  const url = button.dataset.obsUrl;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const area = document.createElement("textarea");
    area.value = url;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  button.textContent = "コピーしました";
  setTimeout(() => (button.textContent = "URLをコピー"), 1800);
}
obsLinks.addEventListener("click", (event) => {
  const button = event.target.closest("[data-obs-url]");
  if (button) copyObsUrl(button);
});

await import(avatar.module);
