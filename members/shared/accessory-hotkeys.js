const ACCESSORIES = Object.freeze({
  F1: {
    id: "gaming-sunglasses",
    label: "ゲーミングサングラス",
    src: "/shared/accessories/gaming-sunglasses-handdrawn-v2.png",
    width: 520,
    offsetY: -17,
  },
  F2: {
    id: "mask-white",
    label: "白マスク",
    src: "/shared/accessories/mask-white-handdrawn-v2.png",
    width: 430,
    offsetY: 133,
  },
  F3: {
    id: "mask-black",
    label: "黒マスク",
    src: "/shared/accessories/mask-black-handdrawn-v2.png",
    width: 430,
    offsetY: 133,
  },
  F4: {
    id: "disguise-glasses",
    label: "面白いメガネ",
    src: "/shared/accessories/disguise-glasses-handdrawn-v2.png",
    width: 500,
    offsetY: 38,
  },
});

const accessoryById = Object.fromEntries(
  Object.values(ACCESSORIES).map((accessory) => [accessory.id, accessory]),
);
const memberSlug = location.pathname.split("/").filter(Boolean)[0] || "avatar";
const storageKey = `vtuber-accessory-${memberSlug}-v1`;
const imageCache = new Map();
let selectedId = localStorage.getItem(storageKey) || "";
let notice = null;

function loadAccessory(accessory) {
  if (!accessory || imageCache.has(accessory.id)) return;
  const image = new Image();
  image.decoding = "async";
  image.src = accessory.src;
  imageCache.set(accessory.id, image);
}

function setAccessory(id, showNotice = true) {
  selectedId = accessoryById[id] ? id : "";
  if (selectedId) {
    localStorage.setItem(storageKey, selectedId);
    loadAccessory(accessoryById[selectedId]);
  } else {
    localStorage.removeItem(storageKey);
  }
  if (showNotice && !new URLSearchParams(location.search).has("obs")) {
    const label = selectedId ? accessoryById[selectedId].label : "特殊衣装なし";
    showAccessoryNotice(label);
  }
}

function showAccessoryNotice(label) {
  if (!notice) {
    notice = document.createElement("div");
    Object.assign(notice.style, {
      position: "fixed",
      left: "50%",
      bottom: "24px",
      transform: "translateX(-50%)",
      zIndex: "10000",
      padding: "10px 16px",
      borderRadius: "10px",
      color: "white",
      background: "rgba(10, 16, 22, .88)",
      font: "700 14px system-ui, sans-serif",
      pointerEvents: "none",
      transition: "opacity .18s ease",
    });
    document.body.appendChild(notice);
  }
  notice.textContent = label;
  notice.style.opacity = "1";
  clearTimeout(notice.hideTimer);
  notice.hideTimer = setTimeout(() => {
    notice.style.opacity = "0";
  }, 1100);
}

export function drawFaceAccessory(
  ctx,
  { centerX, centerY, rotation = 0, scale = 1, offsets = null },
) {
  const accessory = accessoryById[selectedId];
  if (!accessory) return;
  loadAccessory(accessory);
  const image = imageCache.get(accessory.id);
  if (!image?.complete || !image.naturalWidth) return;
  const width = accessory.width * scale;
  const height = width * (image.naturalHeight / image.naturalWidth);
  ctx.save();
  const offsetY = offsets?.[accessory.id] ?? accessory.offsetY;
  ctx.translate(centerX, centerY + offsetY * scale);
  ctx.rotate(rotation);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

addEventListener("keydown", (event) => {
  const accessory = ACCESSORIES[event.key];
  if (!accessory || event.metaKey || event.ctrlKey || event.altKey) return;
  event.preventDefault();
  setAccessory(selectedId === accessory.id ? "" : accessory.id);
});

addEventListener("storage", (event) => {
  if (event.key === storageKey) setAccessory(event.newValue || "", false);
});

if (selectedId) loadAccessory(accessoryById[selectedId]);
