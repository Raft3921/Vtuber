VTuber Studio - 修正版

このZIPの階層をプロジェクトのルートにそのまま上書きしてください。

server.mjs
config/
  raft-all-settings.json
  tanutsuna-all-settings.json
members/
  raft/
    raft.js
  tanutsuna/
    tanutsuna.js

前回は raft.js / tanutsuna.js をルート直下に置いてしまっていました。
server.mjs は /raft/ を members/raft/ から、
/tanutsuna/ を members/tanutsuna/ から配信するため、
OBS側が古いJSを読み続ける原因になっていました。
=== インストール版 ===

GitHub ReleasesからMac版のDMGまたはWindows版のEXEをダウンロードしてインストールします。
アプリを起動するとメンバー選択画面が開きます。
出演者の「カメラ」を押すと、そのメンバーの追跡が開始されます。
OBSには表示されている透過・GB・BBのURLをブラウザソースとして登録します。

アプリアイコンは members/icon/icon.png です。
個人設定はアプリ本体ではなくOSのユーザーデータ領域へ保存されるため、再インストールや更新で消えません。

=== アプリの自動更新 ===

開発側はGitとGitHubを使いますが、インストールする側にGitは不要です。
インストール済みアプリは起動3秒後に https://github.com/Raft3921/Vtuber の最新Releaseを確認します。
新しい版はバックグラウンドで取得され、「今すぐ再起動して更新」または「終了時に更新」を選べます。
メニューバー／タスクトレイの「アップデートを確認」から手動確認もできます。
通信できない場合は現在のバージョンをそのまま利用できます。

開発側で更新を公開する方法:
1. GitHubのmainへ更新内容を反映します。
2. GitHub上で Actions → VTuber Studio update → Run workflow を開きます。
3. 1.0.1 のように、現在より大きいバージョンを入力します。
4. GitHubがMac用DMG・ZIPとWindows用EXEをReleaseへ自動公開します。

または v1.0.1 のようなタグをpushしても同じ処理が動きます。
初回インストール後、利用者側はGitHubアカウント、Git、手動更新のいずれも不要です。

=== 画像素材の整理 ===

共通の目・口・眉は members/shared/cleaned/ に1組だけ保存しています。
使用中画像の一覧は assets-manifest.json です。
更新時は node scripts/audit-assets.mjs で欠落・未登録画像を確認できます。

=== OBS・バックグラウンド追従 ===

start.command（Mac）または start.bat（Windows）から起動すると、カメラ追従はChromeではなく常駐デスクトップアプリ内で動きます。
追従ウィンドウを閉じてもバックグラウンドに隠れるだけで、カメラと追従は継続します。完全終了はメニューバー／タスクトレイのアイコンから行います。

OBSは「ブラウザ」ソースに次のURLを入れます。GB/BBより透過が推奨です。
ラフト: http://127.0.0.1:8777/raft/?obs=1&bg=transparent&member=1
たぬつな: http://127.0.0.1:8777/tanutsuna/?obs=1&bg=transparent&member=3

OBS側は描画だけを行い、カメラを直接使いません。Chromeのタブ切り替えや別デスクトップの影響を受けない構成です。
