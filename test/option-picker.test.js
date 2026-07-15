/*
 * option-picker.js의 "순수 로직"(파싱/그룹핑/행 매칭/강제 change 트리거)에 대한
 * 유닛 테스트. 카페24 라이브 서버가 있어야 확인 가능한 부분(실제 select 렌더링
 * 여부, 카페24 자체 담기/삭제 로직 동작)은 대상이 아니다 — README의 "라이브
 * 확인 필요" 항목 참고. Node 내장 test runner만 사용해 별도 설치 없이 실행된다.
 *
 * 실행: node --test test/
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    parseTierAndSuffix,
    parsePriceText,
    parseTiersFromSelect,
    rowMatchesVariant,
    triggerNativeSelect,
    findOptionButtonLink
} = require("../js/module/product/option-picker.js");

function fakeSelect(entries) {
    return {
        options: entries.map(function (e) {
            return { value: e.value, text: e.text, disabled: !!e.disabled };
        })
    };
}

// "텍스트버튼" 스타일이 실제로 렌더링하는 ul.ec-product-button > li[option_value] > a
// 위젯을 흉내낸 가짜 optionTable. clicks 배열로 어떤 a가 클릭됐는지 확인한다.
// (클릭 전 숨김을 잠깐 푸는 건 option-picker.js의 담기/빼기 버튼 핸들러 쪽
// 책임으로 옮겨졌다 — state.pending 생명주기와 얽혀 있어 실제 DOM/타이밍이
// 필요하므로 순수 로직 테스트가 아니라 라이브 QA(cafe24-qa-interaction.js)로
// 검증한다.)
function fakeOptionTableWithButtonList(optionValues) {
    const clicks = [];
    const items = optionValues.map((value) => ({
        getAttribute(name) {
            return name === "option_value" ? value : null;
        },
        querySelector(sel) {
            return sel === "a"
                ? {
                      click() {
                          clicks.push(value);
                      }
                  }
                : null;
        }
    }));
    const buttonList = {
        querySelectorAll(sel) {
            return sel === "li" ? items : [];
        }
    };
    return {
        clicks,
        optionTable: {
            querySelector(sel) {
                return sel.indexOf("ec-product-button") !== -1 ? buttonList : null;
            }
        }
    };
}

test("parseTierAndSuffix: 개입수_순번 형태를 분리한다", () => {
    assert.deepEqual(parseTierAndSuffix("10개입_1"), { tierName: "10개입", suffix: 1 });
    assert.deepEqual(parseTierAndSuffix("100개입_2"), { tierName: "100개입", suffix: 2 });
});

test("parseTierAndSuffix: suffix가 없으면 전체를 단일 티어로 취급한다", () => {
    assert.deepEqual(parseTierAndSuffix("맛보기"), { tierName: "맛보기", suffix: 1 });
});

test("parsePriceText: 옵션 텍스트에서 가격 표기만 뽑아낸다", () => {
    assert.equal(parsePriceText("10개입_1 (+12,000원)"), "+12,000원");
    assert.equal(parsePriceText("10개입_1"), null);
});

test("parseTiersFromSelect: 같은 개입수의 suffix를 하나의 티어로 묶고 순번대로 정렬한다", () => {
    const select = fakeSelect([
        { value: "", text: "옵션을 선택해 주세요" }, // 플레이스홀더는 제외되어야 함
        { value: "v2", text: "10개입_2" },
        { value: "v1", text: "10개입_1" },
        { value: "v3", text: "30개입_1" }
    ]);

    const tiers = parseTiersFromSelect(select);

    assert.equal(tiers.length, 2);
    const ten = tiers.find((t) => t.name === "10개입");
    assert.equal(ten.variants.length, 2); // suffix 2개 → 하드 룰상 최대 2번 추가 가능
    assert.deepEqual(
        ten.variants.map((v) => v.suffix),
        [1, 2] // 등록 순서(2,1)와 무관하게 suffix 오름차순 정렬
    );
});

test('parseTiersFromSelect: 카페24 필수옵션 표준 플레이스홀더(value="*")도 제외한다 (회귀 테스트)', () => {
    // 실제 테스트몰에 배포해 확인해보니, 이 플레이스홀더의 텍스트가 흔히 가정하는
    // "옵션을 선택해 주세요"가 아니라 "empty"로 렌더링됐다. 텍스트만 보고 걸러내면
    // 이 케이스를 놓쳐서 "empty"라는 가짜 티어 카드가 하나 더 생기는 버그가 있었다.
    // value가 카페24 표준 플레이스홀더 값인 "*"이면 텍스트와 무관하게 제외해야 한다.
    const select = fakeSelect([
        { value: "*", text: "empty" },
        { value: "v1", text: "10개입_1" }
    ]);

    const tiers = parseTiersFromSelect(select);

    assert.equal(tiers.length, 1);
    assert.equal(tiers[0].name, "10개입");
});

test("parseTiersFromSelect: 옵션가 표시로 가격이 붙어도 티어 그룹핑이 깨지지 않는다 (회귀 테스트)", () => {
    // 이전 버전은 SUFFIX_PATTERN이 끝 앵커(`$`)를 써서 "10개입_1 (+12,000원)"처럼
    // 가격이 붙으면 매칭에 실패해 옵션값 8개가 전부 별개 티어로 쪼개지는 버그가 있었다.
    const select = fakeSelect([
        { value: "v1", text: "10개입_1 (+12,000원)" },
        { value: "v2", text: "10개입_2 (+12,000원)" },
        { value: "v3", text: "100개입_1 (+80,000원)" }
    ]);

    const tiers = parseTiersFromSelect(select);

    assert.equal(tiers.length, 2);
    const ten = tiers.find((t) => t.name === "10개입");
    const hundred = tiers.find((t) => t.name === "100개입");
    assert.equal(ten.variants.length, 2);
    assert.equal(hundred.variants.length, 1);
    assert.equal(ten.variants[0].priceText, "+12,000원");
});

test("parseTiersFromSelect: select가 없거나 options가 없어도 던지지 않고 빈 배열을 준다", () => {
    // 실제 카페24 DOM이 우리 가정과 다를 때(예: select를 못 찾음) init()이
    // 여기서 죽지 않고 "커스텀 UI를 그리지 않고 네이티브를 그대로 둔다"로
    // 안전하게 빠질 수 있어야 한다.
    assert.deepEqual(parseTiersFromSelect(null), []);
    assert.deepEqual(parseTiersFromSelect(undefined), []);
    assert.deepEqual(parseTiersFromSelect({}), []);
});

test("parseTiersFromSelect: 품절(disabled) 옵션도 variants 개수(=최대 추가 횟수)에는 포함된다", () => {
    const select = fakeSelect([
        { value: "v1", text: "10개입_1" },
        { value: "v2", text: "10개입_2", disabled: true }
    ]);

    const tiers = parseTiersFromSelect(select);
    const ten = tiers[0];
    assert.equal(ten.variants.length, 2); // 하드 룰: 최대 추가 횟수 = suffix 개수
    assert.equal(ten.variants[1].disabled, true);
});

test("rowMatchesVariant: 자릿수가 겹치는 다른 티어를 오매칭하지 않는다", () => {
    // "100개입_1" 안에 "10개입_1"이 부분 문자열로 들어있는 것처럼 보일 수 있어
    // 경계 체크(앞뒤가 숫자가 아님)가 없으면 오매칭될 위험이 있었다.
    assert.equal(rowMatchesVariant("담긴 옵션: 100개입_1 1개", "10개입_1"), false);
    assert.equal(rowMatchesVariant("담긴 옵션: 10개입_1 1개", "10개입_1"), true);
});

test("findOptionButtonLink: option_value가 일치하는 li의 a를 찾는다", () => {
    const { optionTable } = fakeOptionTableWithButtonList(["v1", "v2", "v3"]);
    const link = findOptionButtonLink(optionTable, "v2");
    assert.ok(link, "링크를 찾아야 한다");
});

test("findOptionButtonLink: optionTable이 없거나 위젯이 없으면 null을 준다", () => {
    assert.equal(findOptionButtonLink(null, "v1"), null);
    assert.equal(findOptionButtonLink({ querySelector: () => null }, "v1"), null);
});

test("triggerNativeSelect: 텍스트버튼 위젯(ul.ec-product-button)이 있으면 그 a를 클릭한다 (회귀 테스트)", () => {
    // 실제 테스트몰에 배포해 클릭 QA를 돌려보니, "텍스트버튼" 스타일은 select가
    // 아니라 이 위젯의 a 클릭에 카페24 자체 "선택 상품 목록에 담기" 로직이
    // 붙어 있었다 — select.value만 바꾸면 담기가 실제로 반영되지 않는 버그가 있었다.
    const { optionTable, clicks } = fakeOptionTableWithButtonList(["v1", "v2"]);
    const select = { value: "", dispatchEvent: () => assert.fail("위젯이 있으면 select는 건드리면 안 된다") };

    triggerNativeSelect(select, "v2", optionTable);

    assert.deepEqual(clicks, ["v2"]);
});

test("triggerNativeSelect: 위젯이 없으면(순수 select 스킨) 기존 select 조작 방식으로 폴백한다", () => {
    let changeCount = 0;
    const listeners = [];
    const select = {
        value: "v1",
        addEventListener(type, cb) {
            listeners.push([type, cb]);
        },
        dispatchEvent(evt) {
            listeners.forEach(([type, cb]) => {
                if (type === evt.type) {
                    changeCount += 1;
                    cb(evt);
                }
            });
            return true;
        }
    };

    select.addEventListener("change", () => {});

    triggerNativeSelect(select, "v1"); // optionTable 없이 호출 = 위젯 못 찾는 상황과 동일
    assert.equal(select.value, "v1");
    assert.equal(changeCount, 1); // 브라우저는 값이 안 바뀌면 change를 안 내지만, 강제 리셋 덕분에 우리는 낸다

    triggerNativeSelect(select, "v2");
    assert.equal(select.value, "v2");
    assert.equal(changeCount, 2);
});
