#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}"

cd "${REPO_ROOT}"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "错误: 未找到 pnpm，请先安装 pnpm。" >&2
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
PACKAGE_VERSION="$(node -p "require('./package.json').version")"
DEFAULT_REGISTRY="https://registry.npmjs.org/"
DEFAULT_PROXY="http://127.0.0.1:7890"
DEFAULT_PUBLISH_ARGS=(
  "--access"
  "public"
  "--registry=${DEFAULT_REGISTRY}"
)

PRE_PUBLISH_COMMIT_MESSAGE="${1:-release: prepare v${PACKAGE_VERSION}}"
POST_PUBLISH_COMMIT_MESSAGE=""

if [[ $# -gt 0 ]]; then
  shift
fi

if [[ $# -gt 0 ]]; then
  POST_PUBLISH_COMMIT_MESSAGE="$1"
  shift
fi

PUBLISH_ARGS=("${DEFAULT_PUBLISH_ARGS[@]}" "$@")

export HTTPS_PROXY="${HTTPS_PROXY:-${https_proxy:-${HTTP_PROXY:-${http_proxy:-${DEFAULT_PROXY}}}}}"
export HTTP_PROXY="${HTTP_PROXY:-${http_proxy:-${HTTPS_PROXY}}}"
export https_proxy="${https_proxy:-${HTTPS_PROXY}}"
export http_proxy="${http_proxy:-${HTTP_PROXY}}"

echo "==> 当前分支: ${CURRENT_BRANCH}"
echo "==> npm registry: ${DEFAULT_REGISTRY}"
echo "==> 使用代理: HTTPS_PROXY=${HTTPS_PROXY} HTTP_PROXY=${HTTP_PROXY}"
echo "==> 执行发布前校验"
pnpm typecheck
pnpm build

echo "==> 提交发布前变更"
git add -A

if git diff --cached --quiet; then
  echo "==> 没有可提交的变更，跳过 git commit"
else
  git commit -m "${PRE_PUBLISH_COMMIT_MESSAGE}"
fi

echo "==> 执行 npm publish ${PUBLISH_ARGS[*]}"
if ! NPM_USER="$(npm whoami --registry="${DEFAULT_REGISTRY}" 2>/dev/null)"; then
  echo "错误: 未登录官方 npm 源 (${DEFAULT_REGISTRY})。" >&2
  echo "      镜像源无法发布，请先执行以下命令登录官方源后重试：" >&2
  echo "      npm login --registry=${DEFAULT_REGISTRY}" >&2
  exit 1
fi
echo "==> 官方源登录用户: ${NPM_USER}"
npm publish "${PUBLISH_ARGS[@]}"

UPDATED_PACKAGE_VERSION="$(node -p "require('./package.json').version")"
FINAL_COMMIT_MESSAGE="${POST_PUBLISH_COMMIT_MESSAGE:-release: v${UPDATED_PACKAGE_VERSION}}"

echo "==> 提交发布后的版本变更"
git add package.json pnpm-lock.yaml

if git diff --cached --quiet; then
  echo "==> 没有发布后版本变更，跳过版本提交"
else
  git commit -m "${FINAL_COMMIT_MESSAGE}"
fi

echo "==> 推送到 origin/${CURRENT_BRANCH}"
git push origin "${CURRENT_BRANCH}"

echo "==> 完成"
