# 피그마 스타일 토큰 (참고용)

이 파일은 노션 과제에 첨부된 피그마 시안(사용자 복사본 `GBYrKkPlHqi6UPlA0ArOMG`, "골라담기 UI" 캔버스)에서 뽑아낸 색상/타이포/spacing 값이다.
**참고용 스타일 값이지 그대로 베낄 마크업 구조가 아니다.** 실제 예시(닭가슴살 상품, "맛 선택" 서브패널)와 우리 실제 테스트 상품(개입수 suffix 기반, 맛 없음)은 데이터 구조가 다르므로, 여기 있는 건 색/폰트/간격만 가져오고 컴포넌트 구조는 [[하드 룰]](.claude/rules/hard-rules.md)의 실제 요구사항(9개 체크리스트, suffix 규칙)에 맞춘다. 충돌 시 hard-rules.md가 항상 이긴다.

참고한 노드: 모바일 바텀시트 `2:1650`, PC 옵션 카드 `2:2087` (파일 `GBYrKkPlHqi6UPlA0ArOMG`).

## 색상
| 토큰 | 값 | 용도 |
|---|---|---|
| color/text/primary | `#171717` | 기본 텍스트, 선택 안 된 티어명 |
| color/text/secondary | `#525252` | 섹션 헤더 텍스트 ("옵션 선택 (필수)") |
| color/text/tertiary | `#777777` | 할인율, 개당가격 등 보조 텍스트 |
| color/text/disabled | `#a1a1a1` | 품절/비활성 항목 텍스트 |
| color/bg/secondary | `#f4f4f4` | 섹션 헤더 배경 |
| color/bg/tertiary-2 | `#ededed` | 비활성 스테퍼 버튼 배경 |
| color/bg/disabled | `#e5e5e5` | 비활성 버튼(선택완료 등) 배경 |
| color/line/tertiary | `#ededed` | 카드/섹션 구분선 |
| color/line/secondary | `#e5e5e5` | 기본 라디오 테두리 |
| color/line/primary | `#d4d4d4` | 스테퍼 버튼 테두리 |
| color/atem/orange (포인트 색) | `#ff692e` | 선택된 상태(라디오 채움, 텍스트, 배지, 카운트) |
| color/atem/orange-subtle | `#fff1eb` | 선택된 카드 배경, "가장 많이 사요" 배지 배경 |
| 강조 배지(빨강) | 배경 `#ffebeb` / 텍스트 `#eb0004` | "최대할인" 같은 2차 강조 배지 |
| 품절 오버레이 | `rgba(23,23,23,0.5)` | 품절 썸네일 위 반투명 원형 오버레이 |

## 타이포그래피
- 폰트: `Pretendard` (Regular/Medium/SemiBold), 배지 일부는 `SUIT`/`SUIT Variable`
- 티어명(예: "10개입"): SemiBold 16px, tracking -0.48px
- 가격: SemiBold 14px + "원" Regular 14px
- 할인율/개당가격: SemiBold/Regular 12px, color tertiary
- 섹션 헤더: Medium 14px, color secondary
- 배지 텍스트: SemiBold 12px

## 레이아웃 / spacing
- 카드(티어 행) 패딩: `12px`, 행 내부 gap `24px`
- 라디오: 바깥 24px 히트영역 안에 20px 원, 선택 시 안에 10px 점
- 카드 구분선: `border-bottom 1px solid #ededed`
- 섹션 헤더 높이: `44px`, radius `4px`(위쪽 모서리만, 카드 그룹 최상단)
- 배지: padding `4px`, radius `2px`
- 스테퍼(수량 -/개수/+): 3분할, 각 `32x32px`, 좌우 끝만 radius `4px`
- 선택 완료/총 수량 바: 높이 `44px`

## 상태
- **기본**: 흰 배경, 라디오 빈 원(`line/secondary` 테두리), 텍스트 `text/primary`
- **선택됨**: 배경 `orange-subtle`, 라디오 채움(`atem/orange`), 텍스트 `atem/orange`
- **비활성/품절**: 텍스트 `text/disabled`, 배경 `bg/tertiary-2`, 이미지 opacity 50% + 반투명 뱃지 오버레이
- **추천 배지**: "가장 많이 사요"(주황 계열), "최대할인"(빨강 계열) — 우리 구현에서는 요구사항 #8에 따라 이런 배지 문구/색을 설정 JS 값으로 뺀다 (하드코딩 금지)

## 우리 구현에 그대로 가져오는 것
- 티어 카드의 라디오+가격+할인율+개당가격 레이아웃과 선택 상태 색상
- 추천 배지 스타일(색/모양) — 문구·대상 티어는 설정 JS로 분리
- "선택한 옵션" 리스트 아이템의 수량 스테퍼 + 삭제 버튼 스타일
- 색상 팔레트, 폰트, spacing, radius 값

## 우리 구현에서 빼는 것 (우리 상품 데이터와 안 맞음)
- "맛 선택" 서브패널(플레이버 여러 개 고르는 2단계 구조) — 우리 옵션은 개입수 suffix(`_1`,`_2`) 기반 반복 추가 제한이지 맛 종류 선택이 아님
- 목업 속 구체적 상품명/이미지/문구(닭가슴살, 떡볶이맛 등)
