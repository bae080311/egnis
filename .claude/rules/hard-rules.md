# 하드 룰 (반드시 지킬 것 — 위반 시 작업 무효)

이 파일은 이 저장소의 **rule 레이어**다. 카페24 골라담기 옵션 UI 과제에서 절대 어겨서는 안 되는 제약만 담는다.
일반 배경 정보(테스트 설정값, 체크리스트, 제출물 형식 등)는 `CLAUDE.md`를 본다. `.claude/hooks/`의 `guard-secrets.sh`, `check-required-dom.sh`가 이 중 일부(민감정보, 필수 DOM)를 기계적으로 강제한다 — 그 외 규칙은 강제 수단이 없으므로 Read/Edit/Write/커밋 전에 매번 이 파일을 다시 확인한다.

## ⛔ 절대 금지
- **운영몰 작업 금지.** 테스트몰에서만 작업한다.
- **카페24 기본 구매/장바구니 로직 재구현 금지.** 있는 그대로 활용한다.
- **필수 DOM·이벤트 삭제 금지.** 최소한 다음은 항상 남아있어야 한다:
  `module="product_action"`, `{$action_buy}`, `{$action_basket}`, `{$form.option}`, `{$form.quantity}`, `module="product_option"`
  (숨기고 싶으면 삭제 대신 `display:none` 등 CSS로 처리)
- **옵션과 무관한 영역 수정 금지.** 상품 이미지, 상세설명, 배너, 구매버튼 외형 등은 과제 대상이 아니다. 작업 범위는 PC/모바일 "옵션 영역"과 "옵션 동작"에 한정.
- **외부 설정 JS를 구매 로직 대체 용도로 쓰지 않는다.** 옵션 UI 구성값(뱃지·설명·추천문구·추가가능횟수·가격표시) 관리 전용으로만 쓴다.
- **민감정보(계정 정보, API 키, 비밀번호, 토큰 등)를 어떤 파일·커밋·산출물에도 남기지 않는다.**
- **모바일에서 터치 영역과 구매 버튼 영역이 겹치면 안 된다.**

## ✅ 반드시 지킬 것
- 옵션값 suffix(`_1`, `_2`, ...) 규칙: 같은 개입수 옵션값이 n개면 그 개입수는 최대 n번까지만 추가 가능하도록 구현한다.
- PC 개발자도구의 모바일 뷰로 확인했을 때 화면 폭이 좁아져도 옵션 UI 레이아웃이 깨지지 않아야 한다.
- 골라담기 UI에서의 선택은 카페24 기본 텍스트버튼 옵션의 선택 상태·구매 흐름과 항상 함께 갱신되어야 한다(동기화, 재구현 아님).

## 🎨 피그마 시안 관련
- 피그마는 **스타일 참고용**이다 (카드 간격, 색상, 선택 상태 표시, 모바일 배치 등). 시안을 최대한 재현하려는 시도가 위 절대 금지 항목(스코프, DOM 보존 등)을 어기는 근거가 될 수 없다 — 충돌하면 항상 하드 룰이 이긴다.
- 시안에서 가져온 색상·간격·문구 등은 하드코딩하지 말고 요구사항 #8에 맞춰 설정 JS 값으로 분리한다.

## 이 규칙을 참조해야 하는 시점
- `detail.html` 또는 옵션 설정 JS/CSS를 Edit/Write 하기 전
- `git commit`/`git push` 하기 전 (`/cafe24-review`, `/cafe24-commit` 스킬이 이 파일을 기준으로 검사한다)
- `/cafe24-qa`로 체크리스트 점검할 때
- `cafe24-option-picker` 에이전트가 구현/리뷰 작업을 시작할 때
- `cafe24-rule-auditor` 에이전트가 독립적으로 감사할 때

## 강제 수단 요약
| 규칙 | 강제 수단 |
|---|---|
| 민감정보 금지 | `.claude/hooks/guard-secrets.sh` (Write/Edit 시), `guard-git-commit.sh` (git commit 시) |
| 필수 DOM 보존 | `.claude/hooks/check-required-dom.sh` (detail.html Write/Edit 후), `guard-git-commit.sh` (git commit 시) |
| 옵션 외 영역 수정 금지 | `.claude/hooks/guard-scope.sh` (detail.html Edit 시, 금지 구역 old_string 감지) |
| 나머지 (재구현 금지, suffix 규칙, 모바일 겹침 등) | 강제 hook 없음 — `/cafe24-qa`, `/cafe24-review`, `cafe24-rule-auditor`로 사람/에이전트가 매번 재확인 |
