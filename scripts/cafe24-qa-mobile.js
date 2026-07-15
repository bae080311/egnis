/*
 * 체크리스트 #9(PC/모바일 반응형)와 하드 룰("모바일에서 터치 영역과 구매 버튼
 * 영역이 겹치면 안 된다")을 실제 테스트몰 스토어프론트에서 자동으로 확인한다.
 *
 * Playwright의 기기 에뮬레이션(iPhone 12 뷰포트)으로 로그아웃 상태에서 상품상세
 * 페이지를 열어 스크린샷을 남기고, 커스텀 옵션 UI(#optionPicker)와 구매 버튼
 * 영역의 bounding box가 겹치지 않는지, 가로 스크롤이 생기지 않는지를 계산으로
 * 검증한다. 결과 스크린샷은 qa/screenshots/에 남아 제출용 증빙으로 쓸 수 있다.
 *
 * 실행: npm run cafe24:qa:mobile
 */
"use strict";

const path = require("path");
const { loadEnv } = require("./lib/env");
const { findProductUrl } = require("./lib/storefront-check");

loadEnv();

const root = path.join(__dirname, "..");
const MALL_ID = process.env.CAFE24_MALL_ID;

function fail(message) {
    console.error("✖ " + message);
    process.exit(1);
}

async function main() {
    if (!MALL_ID) {
        fail(".env에 CAFE24_MALL_ID가 없다. .env.example을 .env로 복사해 채워라.");
    }

    const { chromium, devices } = require("playwright");
    const iphone = devices["iPhone 12"];

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ ...iphone });
    const page = await context.newPage();

    try {
        const url = await findProductUrl(page, MALL_ID, /골라담기/);
        if (!url) {
            fail("스토어프론트에서 상품 링크를 못 찾았다.");
        }
        console.log("확인 페이지:", url);

        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(2000);

        const shotPath = path.join(root, "qa", "screenshots", "mobile-product-detail.png");
        await page.screenshot({ path: shotPath, fullPage: true });
        console.log("스크린샷 저장:", shotPath);

        const check = await page.evaluate(() => {
            const picker = document.getElementById("optionPicker");
            const buyBtn = document.querySelector(".btnSubmit, .btnNormal");
            const html = document.documentElement;

            function rectOf(el) {
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
            }

            const pickerRect = rectOf(picker);
            const buyRect = rectOf(buyBtn);

            let overlap = false;
            if (pickerRect && buyRect) {
                overlap = !(
                    pickerRect.right <= buyRect.left ||
                    pickerRect.left >= buyRect.right ||
                    pickerRect.bottom <= buyRect.top ||
                    pickerRect.top >= buyRect.bottom
                );
            }

            return {
                pickerFound: !!picker,
                buyBtnFound: !!buyBtn,
                pickerRect,
                buyRect,
                overlap,
                horizontalOverflow: html.scrollWidth - html.clientWidth,
                viewportWidth: window.innerWidth,
            };
        });

        console.log("검사 결과:", JSON.stringify(check, null, 2));

        const problems = [];
        if (!check.pickerFound) problems.push("#optionPicker를 못 찾았다.");
        if (!check.buyBtnFound) problems.push("구매 버튼(.btnSubmit/.btnNormal)을 못 찾았다.");
        if (check.overlap) problems.push("옵션 UI와 구매 버튼 영역이 겹친다 (하드 룰 위반).");
        if (check.horizontalOverflow > 5) {
            problems.push(`가로 스크롤 발생 가능 (scrollWidth - clientWidth = ${check.horizontalOverflow}px).`);
        }

        if (problems.length) {
            console.log("✖ 모바일 QA 문제 발견:");
            problems.forEach((p) => console.log("  - " + p));
            process.exitCode = 1;
        } else {
            console.log("✔ 모바일 QA 통과 — 옵션 UI/구매 버튼 겹침 없음, 가로 스크롤 없음.");
        }
    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error("자동화 중 오류:", err.message);
    process.exitCode = 1;
});
