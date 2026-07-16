/*
 * 체크리스트 #2(카페24 기본 옵션과 동기화), #3(반복 클릭/재선택 시 중복 없음),
 * #4(suffix 기준 추가 가능 횟수 제한), #7(선택 상태 명확히 표시)을 실제
 * 테스트몰 스토어프론트에서 카드 버튼을 직접 클릭해 자동으로 검증한다.
 *
 * 로그아웃 상태(시크릿창과 동일 조건)로 접속해서, 담기/빼기 클릭이 실제로
 * 카페24의 "선택 상품 목록"에 반영되는지, suffix 개수(2개)를 넘겨 담으려 하면
 * 막히는지, 빠르게 연속 클릭해도 중복 추가되지 않는지까지 실제 클릭으로 확인한다.
 * 전 과정을 영상으로 녹화해 qa/videos/에 남긴다 (제출용 증빙).
 *
 * 실행: npm run cafe24:qa:interaction
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./lib/env");
const { findProductUrl } = require("./lib/storefront-check");

loadEnv();

const root = path.join(__dirname, "..");
const MALL_ID = process.env.CAFE24_MALL_ID;
const VIDEO_DIR = path.join(root, "qa", "videos");
const SHOT_DIR = path.join(root, "qa", "screenshots");

function fail(message) {
    console.error("✖ " + message);
    process.exit(1);
}

async function countSelectedListRows(page) {
    // option-picker.js의 findSelectedListBody()와 동일한 탐색 로직 — 실제
    // 테스트몰에서 확인한 <tbody class="option_products">를 우선 찾는다.
    return page.evaluate(() => {
        const direct = document.querySelector("tbody.option_products");
        if (direct) return direct.querySelectorAll("tr").length;

        const tables = document.querySelectorAll("table");
        for (const table of tables) {
            const caption = table.querySelector("caption");
            if (caption && caption.textContent.trim() === "상품 목록") {
                const bodies = table.querySelectorAll("tbody");
                if (bodies.length) return bodies[bodies.length - 1].querySelectorAll("tr").length;
            }
        }
        return 0;
    });
}

async function getCardState(page, tier) {
    const card = page.locator(`[data-tier="${tier}"]`);
    return {
        qty: await card.locator(".optionPicker__qty").innerText(),
        addDisabled: await card.locator(".optionPicker__btn--add").isDisabled(),
        removeDisabled: await card.locator(".optionPicker__btn--remove").isDisabled(),
    };
}

async function main() {
    if (!MALL_ID) fail(".env에 CAFE24_MALL_ID가 없다.");
    fs.mkdirSync(VIDEO_DIR, { recursive: true });
    fs.mkdirSync(SHOT_DIR, { recursive: true });

    const { chromium } = require("playwright");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 900 },
        recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 900 } },
    });
    const page = await context.newPage();

    const results = [];
    function check(label, pass, detail) {
        results.push({ label, pass, detail });
        console.log(`  ${pass ? "✔" : "✖"} ${label}${detail ? " — " + detail : ""}`);
    }

    try {
        const url = await findProductUrl(page, MALL_ID, /골라담기/);
        if (!url) fail("상품 링크를 못 찾았다.");
        console.log("대상 페이지:", url);

        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.locator("#optionPicker .optionPicker__card").first().waitFor({ timeout: 10000 });

        const initialRows = await countSelectedListRows(page);
        console.log("초기 선택 상품 목록 행 수:", initialRows);

        // ---- 1) "10개입" 한 번 담기 ----
        await page.locator('[data-tier="10개입"] .optionPicker__btn--add').click();
        await page.waitForTimeout(2500);
        await page.screenshot({ path: path.join(SHOT_DIR, "interaction-01-first-add.png") });

        let rows = await countSelectedListRows(page);
        let state = await getCardState(page, "10개입");
        check("담기 1회 후 선택 상품 목록 행이 1개 늘었다 (#2 동기화)", rows === initialRows + 1, `rows=${rows}`);
        check('카드 담은 개수가 "1"로 표시된다 (#7 활성화 상태 표시)', state.qty.trim() === "1", `qty=${state.qty}`);

        // ---- 2) 같은 티어 한 번 더 담기 (suffix 2개 중 2번째) ----
        await page.locator('[data-tier="10개입"] .optionPicker__btn--add').click();
        await page.waitForTimeout(2500);
        await page.screenshot({ path: path.join(SHOT_DIR, "interaction-02-second-add.png") });

        rows = await countSelectedListRows(page);
        state = await getCardState(page, "10개입");
        check("담기 2회 후 선택 상품 목록 행이 2개 늘었다 (재선택 시 중복/오류 없음, #3)", rows === initialRows + 2, `rows=${rows}`);
        check('추가 가능 횟수(2회) 도달 후 "담기" 버튼이 비활성화된다 (#4 suffix 횟수 제한)', state.addDisabled === true, `addDisabled=${state.addDisabled}`);

        // ---- 3) 횟수 초과 시도 (막혀야 정상) ----
        const beforeExtraRows = rows;
        await page.locator('[data-tier="10개입"] .optionPicker__btn--add').click({ force: true }).catch(() => {});
        await page.waitForTimeout(1500);
        rows = await countSelectedListRows(page);
        check("최대 횟수 초과 클릭이 무시된다 (더 추가되지 않음)", rows === beforeExtraRows, `rows=${rows}`);

        // ---- 4) 반복 클릭(가능한 한 빠르게) — 중복/레이스 컨디션 방어 확인 ----
        const rowsBeforeRapid = await countSelectedListRows(page);
        const rapidAdd = page.locator('[data-tier="30개입"] .optionPicker__btn--add');
        await Promise.all([rapidAdd.click(), rapidAdd.click(), rapidAdd.click()]).catch(() => {});
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(SHOT_DIR, "interaction-03-rapid-click.png") });
        const rowsAfterRapid = await countSelectedListRows(page);
        const added = rowsAfterRapid - rowsBeforeRapid;
        // "30개입"도 suffix 2개라 최대 2번까지만 늘어나야 한다 (3번 연타해도 2 이하).
        check(
            "빠른 연속 클릭에도 suffix 최대 횟수(2회) 이상 중복 추가되지 않는다 (#3)",
            added <= 2,
            `added=${added}`
        );

        // ---- 5) 빼기 ----
        const rowsBeforeRemove = await countSelectedListRows(page);
        await page.locator('[data-tier="10개입"] .optionPicker__btn--remove').click();
        await page.waitForTimeout(2500);
        await page.screenshot({ path: path.join(SHOT_DIR, "interaction-04-remove.png") });
        const rowsAfterRemove = await countSelectedListRows(page);
        const removedState = await getCardState(page, "10개입");
        check("빼기 클릭 후 선택 상품 목록 행이 1개 줄었다", rowsAfterRemove === rowsBeforeRemove - 1, `rows=${rowsAfterRemove}`);
        check('카드 담은 개수가 "1"로 다시 줄어든다 (#7)', removedState.qty.trim() === "1", `qty=${removedState.qty}`);
    } finally {
        await context.close();
        const video = page.video();
        let videoPath = null;
        if (video) {
            videoPath = await video.path().catch(() => null);
        }
        await browser.close();
        if (videoPath && fs.existsSync(videoPath)) {
            const finalPath = path.join(VIDEO_DIR, "interaction-qa.webm");
            fs.renameSync(videoPath, finalPath);
            console.log("영상 저장:", finalPath);
        }
    }

    const failed = results.filter((r) => !r.pass);
    console.log("");
    console.log(`결과: ${results.length - failed.length}/${results.length} 통과`);
    if (failed.length) {
        console.log("실패한 항목:");
        failed.forEach((r) => console.log("  - " + r.label));
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error("자동화 중 오류:", err.message);
    process.exitCode = 1;
});
