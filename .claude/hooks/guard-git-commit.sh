#!/bin/bash
# PreToolUse hook (Bash): git commit 직전에 민감정보/필수 DOM 규칙을
# 한 번 더 검사한다. Bash로 파일을 직접 써서(cat/sed 등) Write/Edit
# 훅(guard-secrets.sh, check-required-dom.sh)을 우회한 경우를 잡기 위한
# 마지막 안전망이다. git commit이 아닌 명령은 즉시 통과시킨다.
set -euo pipefail

input="$(cat)"

command="$(echo "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"

if [ -z "$command" ] || ! echo "$command" | grep -Eiq '(^|[;&|]|[[:space:]])git[[:space:]]+commit([[:space:]]|$)'; then
    exit 0
fi

# 이 저장소가 아직 git repo가 아니거나 스테이징된 변경이 없으면 검사할 게 없다.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    exit 0
fi

staged_files="$(git diff --cached --name-only 2>/dev/null || true)"
if [ -z "$staged_files" ]; then
    exit 0
fi

problems=()

secret_pattern='password[[:space:]]*[:=]|api[_-]?key|secret[_-]?key|access[_-]?token|authorization:[[:space:]]*bearer|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----'
if git diff --cached 2>/dev/null | grep -Eiq "$secret_pattern"; then
    problems+=("스테이징된 변경분에 민감정보로 의심되는 문자열이 있습니다.")
fi

if echo "$staged_files" | grep -q 'detail\.html$'; then
    required_tokens=(
        'module="product_action"'
        '{$action_buy}'
        '{$action_basket}'
        '{$form.option}'
        '{$form.quantity}'
        'module="product_option"'
    )
    detail_path="$(echo "$staged_files" | grep 'detail\.html$' | head -1)"
    staged_content="$(git show ":${detail_path}" 2>/dev/null || true)"
    if [ -n "$staged_content" ]; then
        for token in "${required_tokens[@]}"; do
            if ! printf '%s\n' "$staged_content" | grep -qF -- "$token"; then
                problems+=("스테이징된 '$detail_path'에서 필수 토큰 '$token'이 사라졌습니다.")
            fi
        done
    fi
fi

if [ "${#problems[@]}" -gt 0 ]; then
    {
        echo "차단됨: git commit 직전 규칙 검사에 실패했습니다."
        for p in "${problems[@]}"; do
            echo "  - $p"
        done
        echo "커밋하기 전에 /cafe24-review로 다시 점검하세요."
    } >&2
    exit 2
fi

exit 0
