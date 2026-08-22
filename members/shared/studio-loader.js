const avatars = {
  raft: { member: "1", number: 1, name: "ラフト", module: "/raft/raft.js" },
  tanutsuna: {
    member: "3",
    number: 3,
    name: "たぬつな",
    module: "/tanutsuna/tanutsuna.js",
  },
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
  ["OBS GB", `${base}&bg=green`],
  ["OBS BB", `${base}&bg=blue`],
]
  .map(([label, url]) => `${label}<br><code>${url}</code>`)
  .join("<br><br>");

await import(avatar.module);
