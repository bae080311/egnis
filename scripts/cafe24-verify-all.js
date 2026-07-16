/*
 * PC/모바일 스토어프론트를 병렬로 한 번에 훑어서, 지금까지 고친 것들이 전부
 * 살아있는지 확인하는 통합 회귀 검증 스크립트. 매번 새 진단 스크립트를 만들어
 * 순차적으로 로그인부터 다시 하던 이전 방식 대신, (1) 스토어프론트 확인은
 * 로그인이 필요 없으므로 (2) PC 컨텍스트와 모바일 컨텍스트를 별도 브라우저
 * 컨텍스트로 동시에 띄워 병렬 실행한다.
 *
 * 실행: node scripts/cafe24-verify-all.js
 */
"use strict";

const path = require("path");
const { loadEnv } = require("./lib/env");
const { findProductUrl } = require("./lib/storefront-check");

loadEnv();

const MALL_ID = process.env.CAFE24_MALL_ID;

const DESKTOP_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MOBILE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function checkOne(chromium, label, userAgent, viewport) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent, viewport });
    const page = await context.newPage();
    const result = { label, ok: false, checks: {} };

    try {
        const url = await findProductUrl(page, MALL_ID, /골라담기/);
        result.url = url;
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(2000);

        // ---- 정적 구조 한 번에 전부 덤프 ----
        const structure = await page.evaluate(() => {
            const picker = document.getElementById("optionPicker");
            const nativeRow = document.querySelector(".optionPickerNativeRow");
            const select = document.querySelector("select");
            const buttonList = document.querySelector("ul.ec-product-button");
            const selectedListBody = document.querySelector("tbody.option_products");
            return {
                pickerRendered: !!picker && picker.innerHTML.length > 0,
                cardCount: picker ? picker.querySelectorAll(".optionPicker__card").length : 0,
                // .optionPickerNativeRow는 display:none이 아니라 sr-only 기법(치수
                // 1px 이하로 화면에서만 잘라냄)으로 숨긴다 — 카페24 담기 클릭
                // 핸들러가 노출 여부(치수)를 확인해서 display:none이면 클릭을
                // 무시하는 걸 실제 테스트몰에서 확인했기 때문이다.
                nativeRowHidden: nativeRow
                    ? (() => {
                          const r = nativeRow.getBoundingClientRect();
                          return r.width <= 1 && r.height <= 1;
                      })()
                    : false,
                selectFound: !!select,
                selectOptionCount: select ? select.options.length : 0,
                buttonWidgetFound: !!buttonList,
                buttonWidgetItemCount: buttonList ? buttonList.querySelectorAll("li").length : 0,
                selectedListFound: !!selectedListBody,
                selectedListRowsInitial: selectedListBody ? selectedListBody.querySelectorAll("tr").length : 0
            };
        });
        result.checks.structure = structure;

        // ---- 실제 담기 1회 + 빼기 1회로 상호작용까지 한 번에 확인 ----
        const tierCard = page.locator('[data-tier="10개입"]').first();
        if ((await tierCard.count()) && structure.pickerRendered) {
            await page.locator('[data-tier="10개입"] .optionPicker__btn--add').click();
            await page.waitForTimeout(2500);
            const afterAdd = await page.evaluate(() => {
                const body = document.querySelector("tbody.option_products");
                return body ? body.querySelectorAll("tr").length : 0;
            });

            await page.locator('[data-tier="10개입"] .optionPicker__btn--remove').click();
            await page.waitForTimeout(2500);
            const afterRemove = await page.evaluate(() => {
                const body = document.querySelector("tbody.option_products");
                return body ? body.querySelectorAll("tr").length : 0;
            });

            result.checks.interaction = {
                rowsBefore: structure.selectedListRowsInitial,
                rowsAfterAdd: afterAdd,
                rowsAfterRemove: afterRemove,
                addWorked: afterAdd === structure.selectedListRowsInitial + 1,
                removeWorked: afterRemove === structure.selectedListRowsInitial
            };
        } else {
            result.checks.interaction = { skipped: true, reason: "picker not rendered or tier card missing" };
        }

        // selectedListFound(tbody.option_products)는 첫 담기 전에는 DOM에 아예
        // 없는 게 정상이다(담아야 생기는 요소) — 그래서 초기 구조 체크가 아니라
        // 상호작용 결과(addWorked/removeWorked)로만 이 부분을 판단한다.
        result.ok =
            structure.pickerRendered &&
            structure.nativeRowHidden &&
            structure.selectFound &&
            structure.buttonWidgetFound &&
            !!(result.checks.interaction && result.checks.interaction.addWorked && result.checks.interaction.removeWorked);
    } catch (err) {
        result.error = err.message;
    } finally {
        await browser.close();
    }

    return result;
}

async function main() {
    if (!MALL_ID) {
        console.error("✖ .env에 CAFE24_MALL_ID가 없다.");
        process.exit(1);
    }

    const { chromium } = require("playwright");

    const [pc, mobile] = await Promise.all([
        checkOne(chromium, "PC", DESKTOP_UA, { width: 1280, height: 900 }),
        checkOne(chromium, "모바일", MOBILE_UA, { width: 390, height: 844 })
    ]);

    [pc, mobile].forEach((r) => {
        console.log(`\n=== ${r.label} (${r.url || "URL 못 찾음"}) ===`);
        if (r.error) {
            console.log("  ✖ 오류:", r.error);
            return;
        }
        console.log("  구조:", JSON.stringify(r.checks.structure));
        console.log("  상호작용:", JSON.stringify(r.checks.interaction));
        console.log(r.ok ? "  ✔ 전체 통과" : "  ✖ 일부 실패");
    });

    const allOk = pc.ok && mobile.ok;
    console.log("\n" + (allOk ? "✔ PC/모바일 전부 정상" : "✖ 문제 있음 — 위 로그 확인"));
    process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
    console.error("자동화 중 오류:", err.message);
    process.exitCode = 1;
});
