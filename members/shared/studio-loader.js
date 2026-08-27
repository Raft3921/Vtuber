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

const base = `http://127.0.0.1:8777/${slug}/?obs=1&member=${avatar.member}`;
document.querySelector("#obsLinks").innerHTML = [
  ["OBS 透過（推奨）", `${base}&bg=transparent`],
  [
    avatar.greenClothes ? "OBS GB（緑の服には非推奨）" : "OBS GB",
    `${base}&bg=green`,
  ],
  ["OBS BB", `${base}&bg=blue`],
]
  .map(([label, url]) => `${label}<br><code>${url}</code>`)
  .join("<br><br>");

await import(avatar.module);
