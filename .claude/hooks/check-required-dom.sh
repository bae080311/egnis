#!/bin/bash
# PostToolUse hook (Write|Edit): detail.html 저장 직후 카페24 필수 DOM/이벤트가
# 삭제되지 않았는지 검증한다.
# 과제 규칙: "기본 옵션 영역은 숨겨도 되지만 필요한 DOM·이벤트는 삭제 금지"
set -euo pipefail

input="$(cat)"

file_path="$(echo "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"

# detail.html이 아니면 검사 대상 아님.
if [ -z "$file_path" ] || [[ "$file_path" != *detail.html ]]; then
    exit 0
fi

if [ ! -f "$file_path" ]; then
    exit 0
fi

required_tokens=(
    'module="product_action"'
    '{$action_buy}'
    '{$action_basket}'
    '{$form.option}'
    '{$form.quantity}'
    'module="product_option"'
)

missing=()
for token in "${required_tokens[@]}"; do
    if ! grep -qF -- "$token" "$file_path"; then
        missing+=("$token")
    fi
done

if [ "${#missing[@]}" -gt 0 ]; then
    {
        echo "경고: '$file_path'에서 카페24 필수 DOM/이벤트 토큰이 사라졌습니다:"
        for m in "${missing[@]}"; do
            echo "  - $m"
        done
        echo "기본 구매/장바구니 로직에 필요한 DOM·이벤트는 삭제하지 말고, 숨기려면 CSS(display:none) 등으로 처리하세요."
    } >&2
    exit 2
fi

exit 0
