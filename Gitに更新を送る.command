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
cd "$SCRIPT_DIR" || fail "プロジェクトフォルダーに移動できません。"

GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "このフォルダーは Git リポジトリではありません。"
cd "$GIT_ROOT" || fail "Git リポジトリのルートに移動できません。"

git remote get-url origin >/dev/null 2>&1 || fail "origin が設定されていません。"

print "Git ルート: $GIT_ROOT"
print ""
print "現在の変更一覧:"
git status --short
print ""

read -r "COMMIT_MESSAGE?コミットメッセージ: "
if [[ -z "${COMMIT_MESSAGE//[[:space:]]/}" ]]; then
  COMMIT_MESSAGE="更新 $(date '+%Y-%m-%d %H:%M:%S')"
fi

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
  print ""
  print "成功: $BRANCH ブランチを origin へ送信しました。"
  finish
  exit 0
fi

PUSH_ERROR="$(<"$PUSH_LOG")"
rm -f "$PUSH_LOG"
if [[ "$PUSH_ERROR" == *"Authentication failed"* || "$PUSH_ERROR" == *"Permission denied"* || "$PUSH_ERROR" == *"could not read Username"* ]]; then
  fail "Git の認証に失敗しました。アカウントやアクセス権を確認してください。"
elif [[ "$PUSH_ERROR" == *"Could not resolve host"* || "$PUSH_ERROR" == *"Failed to connect"* || "$PUSH_ERROR" == *"Connection timed out"* ]]; then
  fail "通信に失敗しました。インターネット接続を確認してください。"
else
  fail "push に失敗しました。Git の表示内容を確認してください。"
fi
