/*
 * 배포 직후 실제 스토어프론트(로그아웃 상태)에서 골라담기 커스텀 옵션 UI가
 * 제대로 렌더링됐는지 자동으로 확인하는 스모크테스트.
 *
 * 카페24는 module="product_option" 같은 템플릿 속성을 서버 렌더링 시 제거해버리는
 * 등 실제 렌더링 결과가 템플릿 소스만 봐서는 예측하기 어려운 부분이 있어서
 * (실제로 이것 때문에 커스텀 UI가 계속 빈 채로 배포되던 버그가 있었다), 저장만
 * 하고 끝내지 않고 매번 이 확인을 거친다.
 *
 * 헤드리스 기본 UA("HeadlessChrome")로 스토어프론트에 접속하면 간헐적으로
 * ERR_CONNECTION_RESET이 나는 걸 확인해서, 일반 브라우저 UA를 명시적으로 쓴다.
 */
"use strict";

const DESKTOP_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
// 실제 모바일 UA로 접속하면 카페24가 서버단에서 완전히 별도의 모바일 스킨
// (/m/product/detail.html...)으로 리다이렉트한다는 걸 실제 테스트몰에서 확인했다.
const MOBILE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function findProductUrl(page, mallId, preferredNamePattern) {
    await page.goto(`https://${mallId}.cafe24.com/`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1000);

    const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/product/"]'));
        return anchors
            .map((a) => ({ text: (a.textContent || "").trim(), href: a.getAttribute("href") }))
            .filter((l) => l.href && /\/product\/.+\/\d+\//.test(l.href));
    });

    const preferred = preferredNamePattern
        ? links.find((l) => preferredNamePattern.test(l.text))
        : null;
    const target = preferred || links[0];
    if (!target) return null;

    return new URL(target.href, `https://${mallId}.cafe24.com/`).toString();
}

async function checkOptionPickerRendering({ chromium, mallId, productUrl, preferredNamePattern, mobile }) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: mobile ? MOBILE_UA : DESKTOP_UA });
    const page = await context.newPage();

    const result = { ok: false, url: productUrl || null, warnings: [], details: {} };

    try {
        if (!result.url) {
            result.url = await findProductUrl(page, mallId, preferredNamePattern || /골라담기/);
        }
        if (!result.url) {
            result.warnings.push("스토어프론트 메인에서 상품 링크를 하나도 못 찾았다.");
            return result;
        }

        await page.goto(result.url, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(2500);

        const check = await page.evaluate(() => {
            const picker = document.getElementById("optionPicker");
            const nativeRow = document.querySelector(".optionPickerNativeRow");
            const select = document.querySelector("select");
            // .optionPickerNativeRow는 display:none이 아니라 "sr-only" 기법(치수는
            // 남기고 화면에서만 잘라냄)으로 숨긴다 — 카페24의 담기 클릭 핸들러가
            // 노출 여부(치수)를 확인해서 display:none이면 클릭이 씹히는 걸 실제
            // 테스트몰에서 확인했기 때문이다. 그래서 "숨겨졌는지"는 computed
            // display가 아니라 실제 렌더링 크기(1px 이하)로 판단한다.
            const rect = nativeRow ? nativeRow.getBoundingClientRect() : null;
            return {
                pickerExists: !!picker,
                pickerHtmlLength: picker ? picker.innerHTML.length : 0,
                nativeSelectFound: !!select,
                nativeSelectOptionCount: select ? select.options.length : 0,
                nativeRowVisuallyHidden: rect ? rect.width <= 1 && rect.height <= 1 : null,
            };
        });
        result.details = check;

        if (!check.pickerExists) {
            result.warnings.push('페이지에 "#optionPicker" 컨테이너 자체가 없다 — detail.html 배포가 안 됐을 수 있다.');
        } else if (check.pickerHtmlLength === 0) {
            result.warnings.push(
                "#optionPicker가 비어있다 (렌더링 실패). findOptionTable()/findNativeSelect()가 실제 마크업과 안 맞을 가능성이 있다."
            );
            // 안전장치가 제대로 작동했다면, 렌더링 실패 시 네이티브 행은 숨겨지면 안 된다.
            if (check.nativeRowVisuallyHidden) {
                result.warnings.push(
                    "위험: 렌더링도 실패했는데 네이티브 옵션 행까지 숨겨져 있다 — 손님이 옵션을 아예 못 고르는 상태다."
                );
            }
        } else if (!check.nativeRowVisuallyHidden) {
            result.warnings.push("커스텀 카드는 렌더링됐는데 네이티브 옵션 행이 숨겨지지 않았다 — 두 UI가 같이 노출될 수 있다.");
        }

        if (!check.nativeSelectFound) {
            result.warnings.push("네이티브 select를 찾지 못했다.");
        }

        result.ok = check.pickerExists && check.pickerHtmlLength > 0 && !!check.nativeRowVisuallyHidden;
    } finally {
        await browser.close();
    }

    return result;
}

module.exports = { checkOptionPickerRendering, findProductUrl };
