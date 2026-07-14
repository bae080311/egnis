#!/bin/bash
# PreToolUse hook (Write|Edit): 계정 정보/API 키 등 민감정보가 파일에 쓰이는 것을 차단한다.
# 과제 규칙: "계정 정보, API 키 등 민감정보는 제출물에 포함 금지"
set -euo pipefail

input="$(cat)"

content="$(echo "$input" | jq -r '(.tool_input.content // .tool_input.new_string // empty)' 2>/dev/null || true)"
file_path="$(echo "$input" | jq -r '.tool_input.file_path // "unknown"' 2>/dev/null || echo unknown)"

# 파싱 실패나 내용 없음은 안전하게 통과시킨다 (오탐으로 정상 작업을 막지 않기 위함).
if [ -z "$content" ]; then
    exit 0
fi

pattern='password[[:space:]]*[:=]|api[_-]?key|secret[_-]?key|access[_-]?token|authorization:[[:space:]]*bearer|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----'

if echo "$content" | grep -Eiq "$pattern"; then
    {
        echo "차단됨: '$file_path'에 민감정보로 의심되는 문자열이 포함되어 있습니다."
        echo "과제 규칙상 계정 정보/API 키 등은 어떤 산출물에도 포함할 수 없습니다."
        echo "감지된 패턴 예시:"
        echo "$content" | grep -Ei "$pattern" | head -3
    } >&2
    exit 2
fi

exit 0
