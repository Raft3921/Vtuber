#!/bin/zsh
cd "${0:A:h}"
node update.mjs
echo "常駐アプリを準備しています…"
npm install --no-audit --no-fund --prefer-offline
npm run desktop
