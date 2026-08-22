# RAFT Vtuber

## メンバー追加の構成

画面・レイアウト・共通設定は `members/shared/` に1つだけ置きます。

- `studio.html`: 全メンバー共通の画面
- `studio.css`: 全メンバー共通のレイアウト
- `studio-config.js`: 目・眉・鼻・口の共通設定項目
- `settings-ui.js`: 共通スライダー・見た目設定UI
- `studio-loader.js`: URLからメンバー固有モジュールを選択

各 `members/<member>/` に置くのは、そのメンバー固有の画像、髪・耳などの部位定義、描画モジュールだけです。新しいメンバーは `studio-loader.js` の一覧と `server.mjs` のURLルートへ追加し、共通HTML/CSSを複製しません。
