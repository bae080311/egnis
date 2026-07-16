#!/bin/bash
# PreToolUse hook (Edit): detail.html에서 옵션 영역/옵션 동작이 아닌
# 금지 구역을 편집하려는 시도를 차단한다.
# 과제 규칙: "작업 범위는 PC/MO 모두 옵션 영역과 옵션 동작에 한정.
#            그 외 상품 상세 영역 디자인 변경은 과제 대상 아님"
set -euo pipefail

input="$(cat)"

file_path="$(echo "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
old_string="$(echo "$input" | jq -r '.tool_input.old_string // empty' 2>/dev/null || true)"

# detail.html이 아니거나 old_string이 없으면(=Edit이 아니면) 검사 대상 아님.
if [ -z "$file_path" ] || [[ "$file_path" != *detail.html ]] || [ -z "$old_string" ]; then
    exit 0
fi

forbidden_markers=(
    'module="product_image"'
    'module="product_addimage"'
    'module="product_Colorchip"'
    'module="product_detaildesign"'
    'module="product_rental"'
    'module="product_regularDiscount"'
    'module="product_review"'
    'module="product_qna"'
    'module="product_relation"'
    'module="product_additional"'
    'module="myshop_asyncbenefit"'
    'class="supplyInfo'
    'class="eventArea'
)

hit=()
for marker in "${forbidden_markers[@]}"; do
    if printf '%s\n' "$old_string" | grep -qF -- "$marker"; then
        hit+=("$marker")
    fi
done

if [ "${#hit[@]}" -gt 0 ]; then
    {
        echo "차단됨: '$file_path'에서 옵션 영역과 무관한 구역을 수정하려 합니다."
        echo "감지된 금지 구역 마커:"
        for m in "${hit[@]}"; do
            echo "  - $m"
        done
        echo "작업 범위는 PC/모바일 '옵션 영역'과 '옵션 동작'에 한정됩니다 (상품 이미지/상세설명/배너/리뷰·QnA/구매버튼 외형 등 수정 금지)."
        echo "정말 이 구역을 건드려야 한다면 사용자에게 먼저 이유를 확인받으세요."
    } >&2
    exit 2
fi

exit 0
