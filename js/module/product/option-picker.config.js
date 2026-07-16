/*
 * 골라담기 옵션 UI 설정값
 *
 * 이 파일은 "표시용" 값만 담는다 (뱃지 문구, 설명, 추천 문구, 안내 문구 포맷).
 * 실제 개입수별 추가 가능 횟수는 카페24 옵션값의 suffix(_1, _2 ...) 개수로
 * option-picker.js가 자동 계산한다 — 이 파일에서 그 숫자를 바꿀 수 없다.
 * (하드 룰: 같은 개입수 옵션값이 n개면 그 개입수는 최대 n번까지만 추가 가능)
 *
 * 실제 가격도 이 파일에 넣지 않는다 — 카페24 옵션값에 설정된 실제 가격을
 * option-picker.js가 그대로 읽어와 표시하므로, 관리자에서 가격을 바꾸면
 * 이 파일을 건드리지 않아도 화면에 자동 반영된다.
 *
 * 다른 작업자가 값만 바꿔 쓰는 방법:
 * - tiers 객체의 key는 옵션값에서 suffix(_1, _2 ...)를 뗀 이름과 정확히 일치해야 한다.
 *   예) 옵션값 "10개입_1" → key는 "10개입"
 * - tiers에 없는 개입수가 나오면 defaultTier 값으로 대체된다 (에러 없이 동작).
 */
window.OptionPickerConfig = {
    ui: {
        title: "골라담기",
        subtitle: "개입 수를 골라 담아보세요",
        addButtonLabel: "담기",
        removeButtonLabel: "빼기",
        emptyListText: "옵션 정보를 불러오지 못했습니다. 아래 기본 옵션에서 선택해주세요.",
        limitLabel: function (max) {
            return "최대 " + max + "개까지 추가 가능";
        },
        limitReachedLabel: "추가 가능 횟수를 모두 담았어요",
        soldOutLabel: "품절",
        unitPriceLabel: function (unitPrice) {
            return "개당 " + unitPrice.toLocaleString() + "원";
        },
        totalCountLabel: function (count) {
            return count + "개";
        }
    },

    tiers: {
        "10개입": {
            badge: null,
            description: "가볍게 시작하기 좋아요"
        },
        "30개입": {
            badge: "가장 많이 담아요",
            badgeStrong: false,
            description: "2주 분량으로 넉넉해요"
        },
        "50개입": {
            badge: null,
            description: "한 달 분량, 든든하게"
        },
        "100개입": {
            badge: "최대 할인",
            badgeStrong: true,
            description: "가장 알뜰한 구성이에요"
        }
    },

    defaultTier: {
        badge: null,
        badgeStrong: false,
        description: ""
    }
};
