#!/bin/zsh

setopt NO_NOMATCH

SCRIPT_DIR="${0:A:h}"

finish() {
  print ""
  read -r "REPLY?確認したら Enter キーで閉じます。"
}

fail() {
  print -u2 ""
  print -u2 "失敗: $1"
  finish
  exit 1
}

command -v git >/dev/null 2>&1 || fail "Git がインストールされていません。"
command -v node >/dev/null 2>&1 || fail "Node.js がインストールされていません。"
command -v npm >/dev/null 2>&1 || fail "npm がインストールされていません。"
cd "$SCRIPT_DIR" || fail "プロジェクトフォルダーに移動できません。"

GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "このフォルダーは Git リポジトリではありません。"
cd "$GIT_ROOT" || fail "Git リポジトリのルートに移動できません。"

git remote get-url origin >/dev/null 2>&1 || fail "origin が設定されていません。"

print "Git ルート: $GIT_ROOT"
print ""
print "現在の変更一覧:"
git status --short
print ""

# GitHub上のタグを取得したうえで、現在の patch 番号を必ず1つ上げる。
git fetch --tags origin || fail "GitHub からバージョン情報を取得できません。認証と通信状態を確認してください。"

APP_VERSION="$(node -p "require('./package.json').version" 2>/dev/null)"
[[ "$APP_VERSION" == <->.<->.<-> ]] || fail "package.json のバージョン形式が正しくありません。"
NEXT_VERSION="$(APP_VERSION="$APP_VERSION" node -p 'const [major, minor, patch] = process.env.APP_VERSION.split(".").map(Number); `${major}.${minor}.${patch + 1}`')"
RELEASE_TAG="v$NEXT_VERSION"
git rev-parse -q --verify "refs/tags/$RELEASE_TAG" >/dev/null && fail "$RELEASE_TAG はすでに存在します。package.json のバージョンを確認してください。"
npm version patch --no-git-tag-version || fail "次のバージョン番号を作成できませんでした。"
APP_VERSION="$(node -p "require('./package.json').version")"
RELEASE_TAG="v$APP_VERSION"
COMMIT_MESSAGE="バージョン${APP_VERSION}です"

APP_VERSION="$APP_VERSION" node -e '
  const fs = require("fs");
  fs.writeFileSync("version.json", JSON.stringify({ version: process.env.APP_VERSION }, null, 2) + "\n");
' || fail "version.json を更新できませんでした。"

print ""
print "公開バージョン: $RELEASE_TAG"
print "コミットメッセージ: $COMMIT_MESSAGE"

git add -A || fail "変更をステージできませんでした。"

if git diff --cached --quiet; then
  print "コミットする変更がありません。"
else
  git commit -m "$COMMIT_MESSAGE" || fail "コミットに失敗しました。Git の表示内容を確認してください。"
fi

BRANCH="$(git branch --show-current)"
[[ -n "$BRANCH" ]] || fail "現在のブランチ名を取得できません。"

PUSH_LOG="$(mktemp -t vtuber-git-push.XXXXXX)" || fail "一時ファイルを作成できません。"
if git push origin "$BRANCH" 2> >(tee "$PUSH_LOG" >&2); then
  rm -f "$PUSH_LOG"
else
  PUSH_ERROR="$(<"$PUSH_LOG")"
  rm -f "$PUSH_LOG"
  if [[ "$PUSH_ERROR" == *"Authentication failed"* || "$PUSH_ERROR" == *"Permission denied"* || "$PUSH_ERROR" == *"could not read Username"* ]]; then
    fail "Git の認証に失敗しました。アカウントやアクセス権を確認してください。"
  elif [[ "$PUSH_ERROR" == *"Could not resolve host"* || "$PUSH_ERROR" == *"Failed to connect"* || "$PUSH_ERROR" == *"Connection timed out"* ]]; then
    fail "通信に失敗しました。インターネット接続を確認してください。"
  else
    fail "push に失敗しました。Git の表示内容を確認してください。"
  fi
fi

git tag -a "$RELEASE_TAG" -m "$COMMIT_MESSAGE" || fail "$RELEASE_TAG のリリースタグを作成できませんでした。"
if ! git push origin "$RELEASE_TAG"; then
  git tag -d "$RELEASE_TAG" >/dev/null 2>&1
  fail "ブランチは送信されましたが、$RELEASE_TAG の送信に失敗しました。認証と通信状態を確認してください。"
fi

print ""
print "成功: $BRANCH と $RELEASE_TAG を origin へ送信しました。"
print "GitHub Actions がMac・Windows用インストーラーの作成を開始します。"
print "作成完了後、旧バージョンのソフトからアップデートできます。"
print "確認: https://github.com/Raft3921/Vtuber/actions"
finish
