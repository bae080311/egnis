/*
 * detail.cafe24-inline.html(PC) 또는 detail.mobile.cafe24-inline.html(모바일)의
 * 최신 내용을 카페24 테스트몰 스마트디자인 편집창의 product/detail.html(상품상세
 * 화면)에 반영하는 Playwright 자동화 스크립트.
 *
 * 아래 로그인/편집창 진입/저장 흐름은 실제 테스트몰에 대해 직접 실행해 검증했다.
 * 몰마다 스킨 구성이 다를 수 있는 지점만 다시 짚어둔다:
 *   - 이 몰은 "베이직"(대표디자인, 클래식 스마트디자인)과 "쇼핑몰 기본디자인"
 *     (skin_no=1, 스마트디자인Easy — 신형 노코드 블록 빌더) 두 스킨을 같이 갖고
 *     있었다. 스마트디자인Easy 쪽은 product/detail.html을 통째로 열어 텍스트로
 *     바꿔치기하는 화면 자체가 없어서 이 스크립트가 쓸 수 없다.
 *   - 그래서 이 스크립트는 스킨 이름을 하드코딩하지 않고, "디자인 보관함"
 *     목록에서 "[대표디자인]" 표시가 붙은 행을 찾아 그 스킨을 연다. 지금 대표로
 *     지정된 스킨이 클래식 엔진이 아니면(예: 나중에 스마트디자인Easy 스킨을
 *     대표로 바꾸면) 이 스크립트는 실패해야 정상이다 — 그럴 땐 대표 디자인을
 *     클래식 스킨으로 바꾸거나 스크립트를 다시 확인해야 한다.
 *   - **이 몰은 PC와 모바일 스킨이 완전히 분리돼 있다** (실제 확인함 — 모바일
 *     UA로 접속하면 /m/product/detail.html로 서버가 리다이렉트하고, 그 페이지엔
 *     PC용으로 배포한 내용이 전혀 없다). "디자인 보관함"에도 PC/모바일 탭이
 *     따로 있다. `--mobile` 플래그를 주면 모바일 탭에서 대표 디자인을 찾아
 *     detail.mobile.cafe24-inline.html을 배포한다 — 플래그가 없으면 PC 탭 기준으로
 *     detail.cafe24-inline.html을 배포한다. 반응형 단일 스킨이 아니므로 둘 다
 *     따로 배포해야 실제 모바일 방문자에게도 반영된다.
 *   - 편집 중인 스킨이 이미 대표 디자인이므로, 저장하면 바로 스토어프론트에
 *     반영된다. 별도의 "대표 디자인 설정" 단계는 필요 없다(그 기능 자체가
 *     Admin API로는 제공되지 않고 관리자 UI 전용이라, 대표가 아닌 스킨을
 *     대상으로 하려면 이 스크립트로는 못 하고 수동으로 처리해야 한다).
 *
 * ## 사전 준비 (최초 1회)
 *   1. npm install
 *   2. npx playwright install chromium
 *   3. .env.example을 .env로 복사하고 테스트몰 계정 정보를 채운다 (절대 커밋 금지)
 *
 * ## 실행
 *   npm run cafe24:deploy:dry-run   # 로그인~상품상세 화면 열기까지만, 저장은 안 함
 *   npm run cafe24:deploy:headed    # 브라우저를 보면서 실제 반영 (처음엔 이걸로 확인 권장)
 *   npm run cafe24:deploy           # 헤드리스로 실제 반영 (PC 스킨)
 *   npm run cafe24:deploy:mobile    # 헤드리스로 실제 반영 (모바일 스킨, --mobile)
 *
 * ## 안전장치
 *   - 하드 룰(운영몰 작업 금지)에 따라, 실행 직후 "이 몰이 테스트몰이 맞는지"
 *     대화형으로 재확인한다. yes가 아니면 즉시 중단한다.
 *   - 카페24 스마트디자인 편집창은 저장 전 "히스토리"로 이전 버전 복구가 가능하다
 *     (완전한 되돌리기 불가 액션이 아니다).
 *   - 실패 시 스크린샷을 scripts/.cafe24-deploy-error.png로 남기고(.gitignore 처리됨)
 *     어느 단계에서 멈췄는지 알 수 있게 한다.
 *   - CAFE24_ADMIN_PW 값은 로그인 폼 입력에만 쓰고, 로그·에러 메시지·스크린샷
 *     파일명 등 어디에도 값 자체를 출력하지 않는다.
 *   - (디버깅 도구) npm run cafe24:record 로 Playwright Codegen을 띄워 카페24
 *     관리자 화면이 바뀌었을 때 새 selector를 눈으로 다시 확인할 수 있다.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { loadEnv } = require("./lib/env");
const { checkOptionPickerRendering } = require("./lib/storefront-check");

loadEnv();

const root = path.join(__dirname, "..");
const ERROR_SCREENSHOT = path.join(__dirname, ".cafe24-deploy-error.png");

const MALL_ID = process.env.CAFE24_MALL_ID;
const ADMIN_ID = process.env.CAFE24_ADMIN_ID;
const ADMIN_PW = process.env.CAFE24_ADMIN_PW;

const args = process.argv.slice(2);
const headed = args.includes("--headed");
const dryRun = args.includes("--dry-run");
// 이 몰은 PC/모바일 스킨이 분리돼 있어(실제 확인함) product/detail.html도 두 벌이다.
const mobile = args.includes("--mobile");
// CI(GitHub Actions)처럼 터미널 입력을 받을 수 없는 환경에서만 쓴다 — 그 대신
// 실제 배포 승인은 GitHub Environment의 "필수 리뷰어" 설정이 대신 담당한다
// (.github/workflows/deploy.yml 참고). 로컬에서 사람이 직접 돌릴 때는 이 플래그
// 없이 실행해 대화형 확인을 그대로 받는 걸 권장한다.
const skipConfirm = args.includes("--yes");
const INLINE_FILE = path.join(root, mobile ? "detail.mobile.cafe24-inline.html" : "detail.cafe24-inline.html");

function fail(message) {
    console.error("✖ " + message);
    process.exit(1);
}

function confirm(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase() === "yes");
        });
    });
}

async function main() {
    if (!MALL_ID || !ADMIN_ID || !ADMIN_PW) {
        fail(
            ".env에 CAFE24_MALL_ID / CAFE24_ADMIN_ID / CAFE24_ADMIN_PW를 모두 채워야 한다. " +
                ".env.example을 .env로 복사해 채워라."
        );
    }
    if (!fs.existsSync(INLINE_FILE)) {
        fail(`${INLINE_FILE}이 없다. 먼저 npm run build:inline을 실행해라.`);
    }

    const html = fs.readFileSync(INLINE_FILE, "utf8");

    if (skipConfirm) {
        console.log(`--yes: "${MALL_ID}" 몰에 대화형 확인 없이 진행한다 (승인은 CI 환경 단계에서 이미 됐다고 가정).`);
    } else {
        const proceed = await confirm(
            `"${MALL_ID}" 몰이 테스트몰이 맞습니까? 운영몰이면 여기서 멈추세요. (진행하려면 yes 입력): `
        );
        if (!proceed) {
            fail("사용자가 진행을 취소했다.");
        }
    }

    // playwright는 devDependency이므로 여기서 늦게 require한다
    // (npm install 전에 이 파일을 읽기만 할 때 에러가 안 나도록).
    const { chromium } = require("playwright");

    const browser = await chromium.launch({ headless: !headed });
    const page = await browser.newPage();
    let editorPage = page;

    try {
        // ---- 1. 로그인 ----
        // networkidle 대기는 로그인 후 대시보드의 광고/통계 스크립트 때문에 자주
        // 타임아웃나서 domcontentloaded + URL 매칭으로 대신한다. 그래도 카페24 쪽
        // 리다이렉트 체인(로그인->eclogin->user.cafe24.com->user_id_check.php->대시보드)이
        // 가끔 30초를 넘겨서, 실패하면 몇 번 재시도한다(로그인 폼 자체는 멱등).
        let loggedIn = false;
        for (let attempt = 1; attempt <= 3 && !loggedIn; attempt++) {
            try {
                await page.goto(`https://${MALL_ID}.cafe24.com/disp/admin/shop1/login`, {
                    waitUntil: "domcontentloaded",
                    timeout: 30000,
                });
                await page.waitForSelector("#mall_id", { timeout: 15000 });
                await page.fill("#mall_id", ADMIN_ID);
                await page.fill("#userpasswd", ADMIN_PW);
                await page.click('button.btnStrong.large:has-text("로그인")');
                await page.waitForURL(/dashboard/, { timeout: 30000 });
                loggedIn = true;
            } catch (loginErr) {
                if (/dashboard/.test(page.url())) {
                    loggedIn = true; // 타임아웃 예외가 났어도 실제로는 도착한 경우
                } else if (attempt === 3) {
                    throw loginErr;
                } else {
                    console.log(`로그인 시도 ${attempt}번째 실패, 재시도... (${loginErr.message.split("\n")[0]})`);
                }
            }
        }

        // ---- 2. 대표 디자인(스킨) 편집창 진입 ----
        await page.goto(`https://${MALL_ID}.cafe24.com/disp/admin/shop1/skin/list`, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
        });
        await page.waitForTimeout(1500);

        if (mobile) {
            // 기본 탭은 PC다 — 모바일 스킨 목록을 보려면 이 탭을 눌러야 한다.
            await page.locator('button.MuiTab-root:has-text("모바일")').click();
            await page.waitForTimeout(1500);
        }

        const representativeRow = page.locator("tr", { hasText: "대표디자인" }).first();
        if (!(await representativeRow.count())) {
            throw new Error('"디자인 보관함"에서 [대표디자인] 표시가 붙은 스킨을 못 찾았다.');
        }
        const editButton = representativeRow.locator("text=디자인 편집").first();

        const popupPromise = page.waitForEvent("popup", { timeout: 8000 }).catch(() => null);
        await editButton.click();
        await page.waitForTimeout(1000);
        const popup = await popupPromise;
        editorPage = popup || page;
        await editorPage.waitForLoadState("domcontentloaded").catch(() => {});
        await editorPage.waitForTimeout(2000);

        if (!/disp\/admin\/editor\//.test(editorPage.url())) {
            throw new Error(`편집창으로 안 들어간 것 같다. 현재 URL: ${editorPage.url()}`);
        }

        // ---- 3. product/detail.html(상품상세) 화면 열기 ----
        const productDetailItem = editorPage.locator("text=상품상세").first();
        if (!(await productDetailItem.count())) {
            throw new Error(
                '편집창 좌측 "주요화면" 목록에서 "상품상세" 항목을 못 찾았다 — ' +
                    "이 스킨이 클래식 스마트디자인이 아닐 수 있다 (스마트디자인Easy는 이 화면 구조가 다르다)."
            );
        }
        await productDetailItem.click();
        await editorPage.waitForTimeout(2000);

        // 열린 탭들 중 실제로 화면에 보이는(=상품상세) CodeMirror 인스턴스를 찾는다.
        // (index.html 등 이전에 열려 있던 탭의 CodeMirror는 DOM에는 남아있지만 숨겨진다.)
        const hasVisibleEditor = await editorPage.evaluate(() => {
            const cms = Array.from(document.querySelectorAll(".CodeMirror")).filter(
                (el) => el.offsetParent !== null && el.CodeMirror
            );
            return cms.length > 0;
        });
        if (!hasVisibleEditor) {
            throw new Error("상품상세 화면의 코드 에디터(CodeMirror)를 찾지 못했다.");
        }

        if (dryRun) {
            console.log("dry-run: 로그인~상품상세 화면 열기까지만 확인했고 저장은 하지 않았다.");
            await browser.close();
            return;
        }

        // ---- 4. 내용 교체 ----
        const setResult = await editorPage.evaluate((newHtml) => {
            const cms = Array.from(document.querySelectorAll(".CodeMirror")).filter(
                (el) => el.offsetParent !== null && el.CodeMirror
            );
            if (!cms.length) return { ok: false };
            const cm = cms[cms.length - 1].CodeMirror;
            cm.setValue(newHtml);
            return { ok: true, newLength: cm.getValue().length };
        }, html);
        if (!setResult.ok) {
            throw new Error("CodeMirror setValue에 실패했다 (에디터를 다시 못 찾음).");
        }

        // ---- 5. 저장 ----
        editorPage.once("dialog", (dialog) => dialog.accept().catch(() => {}));
        const saveButton = editorPage.locator("button, a").filter({ hasText: /^저장$/ }).first();
        await saveButton.click();
        await editorPage.waitForTimeout(2000);

        console.log(
            `✔ product/detail.html(상품상세, ${mobile ? "모바일" : "PC"} 스킨) 반영 완료 —`,
            setResult.newLength,
            "자."
        );
        console.log("  이미 대표 디자인이라 별도 지정 없이 스토어프론트에 바로 반영된다.");

        // ---- 6. 배포 후 스모크테스트 ----
        // 저장 성공 = 텍스트가 편집창에 반영됨일 뿐, 실제 스토어프론트에서 커스텀
        // 옵션 UI가 제대로 그려지는지는 별개다(module 속성이 서버 렌더링 시
        // 사라지는 것처럼, 소스만 봐서는 못 잡는 문제가 실제로 있었다). 그래서
        // 저장 직후 로그아웃 상태로 한 번 더 확인한다.
        console.log("  배포 후 스모크테스트 실행 중 (로그아웃 상태로 스토어프론트 확인)...");
        try {
            const smoke = await checkOptionPickerRendering({ chromium, mallId: MALL_ID, mobile });
            if (smoke.url) console.log("  확인한 페이지:", smoke.url);
            if (smoke.ok) {
                console.log("  ✔ 스모크테스트 통과 — 커스텀 옵션 UI가 정상 렌더링되고 네이티브 행도 올바르게 숨겨짐.");
            } else {
                console.log("  ✖ 스모크테스트 실패 — 아래 내용을 확인하세요:");
                smoke.warnings.forEach((w) => console.log("    - " + w));
                console.log('  저장 자체는 됐으니, 급하면 편집창의 "히스토리"로 직전 버전으로 되돌릴 수 있다.');
            }
        } catch (smokeErr) {
            // 스모크테스트 자체의 실패(네트워크 등)는 배포 성공 여부와 무관하니
            // 전체를 실패로 처리하지 않고 경고만 남긴다.
            console.log("  스모크테스트 실행 중 오류(배포 자체는 이미 완료됨):", smokeErr.message);
        }
        console.log("  그래도 시크릿 창(로그아웃 상태)에서 육안으로 한 번 더 확인하는 걸 권장합니다.");
    } catch (err) {
        try {
            await editorPage.screenshot({ path: ERROR_SCREENSHOT, fullPage: true });
            console.error(`스크린샷 저장: ${ERROR_SCREENSHOT}`);
        } catch (shotErr) {
            // 스크린샷 실패는 무시 — 원래 에러가 더 중요하다.
        }
        console.error("자동화 중 오류:", err.message);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

main();
