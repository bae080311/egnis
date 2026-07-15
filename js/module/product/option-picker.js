/*
 * 골라담기 커스텀 옵션 UI — 로직
 *
 * 이 스크립트는 카페24 기본 텍스트버튼 옵션(select)의 값을 대신 세팅하고
 * change 이벤트를 dispatch하는 방식으로만 동작한다. 상품 담기/가격 계산/
 * 목록 append/삭제는 전부 카페24 자체 스크립트가 처리하며, 이 파일은
 * 그 결과(선택 상품 목록 테이블)를 읽어 카드 UI 상태만 갱신한다.
 * → 구매 로직을 재구현하지 않는다 (하드 룰).
 *
 * 표시용 문구/뱃지는 option-picker.config.js에서 가져온다.
 * 개입수별 추가 가능 횟수는 옵션값의 suffix(_1, _2 ...) 개수를 세어 계산한다
 * (하드 룰: 같은 개입수 옵션값이 n개면 최대 n번까지만 추가 가능).
 */
(function () {
    "use strict";

    var DEFAULT_CONFIG = {
        ui: {},
        tiers: {},
        defaultTier: { badge: null, description: "" }
    };

    // config를 한 번만 읽어 캐싱하지 않고 쓸 때마다 조회한다 — 카페24가 스크립트를
    // defer/async로 불러오는 등의 이유로 option-picker.config.js가 이 파일보다
    // 늦게 실행되더라도(둘 다 detail.html에 순서대로 있지만 보장된 것은 아니다),
    // 실제 렌더링 시점엔 config가 이미 로드돼 있으면 정상 값을 읽는다.
    function getConfig() {
        return (typeof window !== "undefined" && window.OptionPickerConfig) || DEFAULT_CONFIG;
    }

    var SUFFIX_PATTERN = /^(.*)_(\d+)$/;
    var PRICE_PATTERN = /([+\-]?\s?[\d,]+)\s*원/;
    // "옵션가 표시"가 켜져 있으면 옵션 텍스트 끝에 "10개입_1 (+12,000원)"처럼
    // 가격이 붙는다. suffix를 파싱하기 전에 이 꼬리표를 먼저 떼어낸다 —
    // 안 떼면 SUFFIX_PATTERN이 끝 앵커(`$`) 때문에 매칭에 실패해 티어 그룹핑이 깨진다.
    var TRAILING_PRICE_PATTERN = /\s*\(?\s*[+\-]?\s?[\d,]+\s*원\s*\)?\s*$/;
    var LEADING_NUMBER_PATTERN = /^(\d+)/;

    var state = {
        optionTable: null,
        select: null,
        listBody: null,
        root: null,
        tiers: [], // [{ name, variants: [{value, text, suffix, priceText, disabled}] }]
        observer: null,
        pending: {} // { [tierName]: true } — 담기/빼기 클릭 후 카페24가 목록을 갱신할 때까지의 잠금
    };

    // 담기/빼기를 누른 뒤 MutationObserver가 실제 변경을 감지하기 전까지 같은 티어를
    // 다시 누르면 어떤 variant가 비어있는지 판단하는 기준(state.tiers[].variants[].inUse)이
    // 아직 갱신 전이라 중복 선택될 수 있다. 티어별로 잠가서 막는다.
    var PENDING_TIMEOUT_MS = 4000; // 카페24가 선택을 거부(품절 등)해도 버튼이 영구히 잠기지 않도록 하는 안전장치

    function isPending(tierName) {
        return !!state.pending[tierName];
    }

    function setPending(tierName) {
        state.pending[tierName] = window.setTimeout(function () {
            delete state.pending[tierName];
            safeRender();
        }, PENDING_TIMEOUT_MS);
    }

    function clearPending(tierName) {
        var timeoutId = state.pending[tierName];
        if (timeoutId) window.clearTimeout(timeoutId);
        delete state.pending[tierName];
    }

    function clearAllPending() {
        Object.keys(state.pending).forEach(clearPending);
    }

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
        } else {
            fn();
        }
    }

    // 카페24 템플릿 소스의 module="product_option" 속성은 서버 렌더링 과정에서
    // 사라지고, 실제로 브라우저에 도착하는 HTML에는 대신 xans-product-option
    // 클래스가 붙는다(실제 테스트몰에서 확인). module 속성 selector는 스킨에 따라
    // 남아있을 가능성을 대비한 1차 시도로만 남겨두고, 실제로 작동하는 클래스
    // selector를 폴백으로 둔다.
    function findOptionTable() {
        return (
            document.querySelector('table[module="product_option"]') ||
            document.querySelector("table.xans-product-option")
        );
    }

    function findNativeSelect(optionTable) {
        if (!optionTable) return null;
        return optionTable.querySelector("select");
    }

    // 카페24가 append하는 "선택 상품 목록" 테이블의 마지막 tbody.
    // {$total.total_id}는 서버 렌더링 시 실제 id로 치환되므로 id로는 찾지 않고
    // caption 텍스트("상품 목록")로 구조 기반 탐색한다.
    function findSelectedListBody() {
        // 실제 테스트몰에서 확인한 진짜 마크업: <tbody class="option_products">.
        // 처음엔 ".detailArea table" 범위 안에서 caption 텍스트("상품 목록")로만
        // 찾았는데, 실제로 이 테이블이 .detailArea 바깥에 있어서 항상 못 찾고
        // 있었다(그래서 역방향 동기화가 전혀 동작하지 않던 버그) — 클래스로 먼저
        // 찾고, 스킨/버전이 달라 클래스명이 다를 경우를 대비해 caption 텍스트
        // 기반 탐색을 범위 제한 없이 폴백으로 남겨둔다.
        var direct = document.querySelector("tbody.option_products");
        if (direct) return direct;

        var tables = document.querySelectorAll("table");
        for (var i = 0; i < tables.length; i++) {
            var caption = tables[i].querySelector("caption");
            if (caption && caption.textContent.trim() === "상품 목록") {
                var bodies = tables[i].querySelectorAll("tbody");
                if (bodies.length) {
                    return bodies[bodies.length - 1];
                }
            }
        }
        return null;
    }

    function parsePriceText(rawText) {
        var m = rawText.match(PRICE_PATTERN);
        return m ? m[0].replace(/\s/g, "") : null;
    }

    // 가격 꼬리표를 뗀 순수 옵션 라벨에서 "{개입수}_{순번}"을 분리한다.
    // 매칭 실패 시(suffix 없는 옵션값) 전체 라벨을 그 자체로 단일 variant 티어로 취급한다.
    function parseTierAndSuffix(labelText) {
        var m = labelText.match(SUFFIX_PATTERN);
        if (m) {
            return { tierName: m[1], suffix: parseInt(m[2], 10) };
        }
        return { tierName: labelText, suffix: 1 };
    }

    function parseTiersFromSelect(select) {
        if (!select || !select.options) return []; // 예상과 다른 DOM이 들어와도 던지지 않고 빈 배열로

        var order = [];
        var map = {};

        var options = Array.prototype.slice.call(select.options);
        options.forEach(function (opt) {
            var value = opt.value;
            var text = opt.text.trim();
            // "*"는 카페24가 필수옵션 미선택 상태에 쓰는 표준 플레이스홀더 값이다
            // (실제 테스트몰에서 텍스트가 "선택해주세요"가 아니라 "empty"로 나오는
            // 경우까지 확인했다 — 그래도 value="*"는 그대로라 이 값으로 걸러낸다).
            if (!value || value === "*" || !text) return;

            var labelText = text.replace(TRAILING_PRICE_PATTERN, "").trim();
            var parsed = parseTierAndSuffix(labelText);
            var tierName = parsed.tierName;
            var suffix = parsed.suffix;

            if (!map[tierName]) {
                map[tierName] = { name: tierName, variants: [] };
                order.push(tierName);
            }

            map[tierName].variants.push({
                value: value,
                // "선택 상품 목록"에 append되는 행은 가격 없이 옵션명만 보여주는 것이
                // 일반적이므로, 행 매칭(rowMatchesVariant)에는 가격 꼬리표를 뗀
                // labelText를 쓴다. 가격은 priceText로 별도 보관해 카드 표시에만 쓴다.
                text: labelText,
                suffix: suffix,
                priceText: parsePriceText(text),
                disabled: !!opt.disabled
            });
        });

        return order.map(function (name) {
            var tier = map[name];
            tier.variants.sort(function (a, b) {
                return a.suffix - b.suffix;
            });
            return tier;
        });
    }

    // "옵션 스타일: 텍스트버튼"은 실제로는 <select>가 아니라 그 옆에 카페24가
    // 같이 렌더링하는 ul.ec-product-button(li[option_value]/a) 클릭형 위젯이
    // 진짜 UI다(실제 테스트몰에서 확인) — 카페24 자체 "선택 상품 목록에 담기"
    // 로직이 이 <a> 클릭에 붙어 있어서, select.value만 바꾸고 change 이벤트를
    // 보내는 것만으로는 담기가 실제로 반영되지 않는다(라이브 배포 후 클릭 QA로
    // 발견한 버그). 그래서 이 위젯을 찾으면 해당 <a>를 직접 클릭하고, 위젯이
    // 없는 스킨/스타일(순수 select 드롭다운)이면 기존 방식으로 폴백한다.
    function findOptionButtonLink(optionTable, optionValue) {
        if (!optionTable) return null;
        var buttonList = optionTable.querySelector('ul.ec-product-button, ul[option_style="button"]');
        if (!buttonList) return null;
        var items = Array.prototype.slice.call(buttonList.querySelectorAll("li"));
        for (var i = 0; i < items.length; i++) {
            if (items[i].getAttribute("option_value") === optionValue) {
                return items[i].querySelector("a");
            }
        }
        return null;
    }

    // select의 값이 바뀌지 않으면(같은 옵션을 연속으로 다시 선택) change 이벤트가
    // 발생하지 않아 카페24 담기 로직이 실행되지 않는다. 매번 실제 값 전환이
    // 일어나도록 빈 값으로 리셋한 뒤 목표 값으로 세팅한다(폴백 경로에서만 쓰임).
    //
    // 카페24의 클릭 핸들러는 요소가 실제로 노출된 상태인지 확인하는 것으로
    // 보인다(실제 테스트몰에서 확인 — display:none이면 클릭이 씹힘). 처음엔
    // 클릭 전후로 숨김을 껐다 켰다 했는데, 그 사이 화면이 그려지면 사용자
    // 눈에 깜빡임으로 보이는 문제가 있었다. 지금은 CSS(option-picker.css의
    // .optionPickerNativeRow)가 display:none 대신 치수는 남기고 화면에서만
    // 잘라내는("sr-only") 방식이라, 이 함수는 숨김을 건드릴 필요 없이 그냥
    // 클릭만 하면 된다 — 카페24 쪽에서는 항상 "노출된" 상태로 보이기 때문이다.
    function triggerNativeSelect(select, optionValue, optionTable) {
        var link = findOptionButtonLink(optionTable, optionValue);
        if (link) {
            link.click();
            return;
        }

        select.value = "";
        select.value = optionValue;
        var evt = new Event("change", { bubbles: true });
        select.dispatchEvent(evt);
    }

    function rowMatchesVariant(rowText, variantText) {
        var idx = rowText.indexOf(variantText);
        if (idx === -1) return false;
        var before = rowText.charAt(idx - 1);
        var after = rowText.charAt(idx + variantText.length);
        var beforeOk = !before || !/[0-9]/.test(before);
        var afterOk = !after || !/[0-9_]/.test(after);
        return beforeOk && afterOk;
    }

    function findRowForVariant(listBody, variantText) {
        if (!listBody) return null;
        var rows = listBody.querySelectorAll("tr");
        for (var i = 0; i < rows.length; i++) {
            if (rowMatchesVariant(rows[i].textContent, variantText)) {
                return rows[i];
            }
        }
        return null;
    }

    function clickRowDeleteControl(row) {
        if (!row) return;
        var deleteEl =
            row.querySelector(".option_box_del") ||
            row.querySelector('a[href="#none"]:last-of-type img') ||
            row.querySelector('a[href="#none"]');
        var clickable = deleteEl ? deleteEl.closest("a") || deleteEl : null;
        if (clickable && typeof clickable.click === "function") {
            clickable.click();
        }
    }

    function recomputeUsage() {
        var listBody = findSelectedListBody();
        state.listBody = listBody;

        state.tiers.forEach(function (tier) {
            tier.variants.forEach(function (variant) {
                variant.inUse = !!findRowForVariant(listBody, variant.text);
            });
        });
    }

    function nextAvailableVariant(tier) {
        for (var i = 0; i < tier.variants.length; i++) {
            var v = tier.variants[i];
            if (!v.inUse && !v.disabled) return v;
        }
        return null;
    }

    function lastUsedVariant(tier) {
        for (var i = tier.variants.length - 1; i >= 0; i--) {
            if (tier.variants[i].inUse) return tier.variants[i];
        }
        return null;
    }

    function tierConfig(name) {
        var config = getConfig();
        var tiers = (config && config.tiers) || {};
        return tiers[name] || config.defaultTier || {};
    }

    function formatUnitPrice(tierName, priceText) {
        if (!priceText) return null;
        var numMatch = priceText.match(/[\d,]+/);
        var countMatch = tierName.match(LEADING_NUMBER_PATTERN);
        if (!numMatch || !countMatch) return null;
        var amount = parseInt(numMatch[0].replace(/,/g, ""), 10);
        var count = parseInt(countMatch[1], 10);
        if (!amount || !count) return null;
        var unit = Math.round(amount / count);
        var ui = getConfig().ui;
        var fn = ui && ui.unitPriceLabel;
        return typeof fn === "function" ? fn(unit) : "개당 " + unit.toLocaleString() + "원";
    }

    function buildCard(tier) {
        var used = tier.variants.filter(function (v) {
            return v.inUse;
        }).length;
        var maxAdd = tier.variants.length;
        var allDisabled = tier.variants.every(function (v) {
            return v.disabled;
        });
        var limitReached = used >= maxAdd;
        var cfg = tierConfig(tier.name);
        var ui = getConfig().ui || {};

        var card = document.createElement("div");
        card.className = "optionPicker__card";
        card.setAttribute("data-tier", tier.name);
        if (used > 0) card.classList.add("optionPicker__card--selected");
        if (allDisabled) card.classList.add("optionPicker__card--disabled");

        var main = document.createElement("div");
        main.className = "optionPicker__cardMain";

        var countEl = document.createElement("span");
        countEl.className = "optionPicker__count";
        countEl.textContent = String(used);

        var info = document.createElement("div");
        info.className = "optionPicker__info";

        var labelRow = document.createElement("div");
        labelRow.className = "optionPicker__labelRow";

        var label = document.createElement("strong");
        label.className = "optionPicker__label";
        label.textContent = tier.name;
        labelRow.appendChild(label);

        if (cfg.badge) {
            var badge = document.createElement("span");
            badge.className = "optionPicker__badge" + (cfg.badgeStrong ? " optionPicker__badge--strong" : "");
            badge.textContent = cfg.badge;
            labelRow.appendChild(badge);
        }

        info.appendChild(labelRow);

        if (cfg.description) {
            var desc = document.createElement("p");
            desc.className = "optionPicker__desc";
            desc.textContent = cfg.description;
            info.appendChild(desc);
        }

        var firstVariantPrice = tier.variants[0] && tier.variants[0].priceText;
        if (firstVariantPrice) {
            var price = document.createElement("p");
            price.className = "optionPicker__price";
            // 피그마 시안처럼 숫자는 SemiBold(부모 기본 스타일), "원"은 Regular로
            // 분리해서 표시한다("+15,000" SemiBold + "원" Regular).
            if (firstVariantPrice.charAt(firstVariantPrice.length - 1) === "원") {
                price.appendChild(document.createTextNode(firstVariantPrice.slice(0, -1)));
                var wonSpan = document.createElement("span");
                wonSpan.className = "optionPicker__priceWon";
                wonSpan.textContent = "원";
                price.appendChild(wonSpan);
            } else {
                price.textContent = firstVariantPrice;
            }
            var unitText = formatUnitPrice(tier.name, firstVariantPrice);
            if (unitText) {
                var unitSpan = document.createElement("span");
                unitSpan.className = "optionPicker__unitPrice";
                unitSpan.textContent = unitText;
                price.appendChild(unitSpan);
            }
            info.appendChild(price);
        }

        var limit = document.createElement("p");
        limit.className = "optionPicker__limit" + (limitReached ? " optionPicker__limit--reached" : "");
        limit.textContent = allDisabled
            ? ui.soldOutLabel || "품절"
            : limitReached
            ? ui.limitReachedLabel || "추가 가능 횟수를 모두 담았어요"
            : typeof ui.limitLabel === "function"
            ? ui.limitLabel(maxAdd)
            : "최대 " + maxAdd + "개까지 추가 가능";
        info.appendChild(limit);

        main.appendChild(countEl);
        main.appendChild(info);

        var stepper = document.createElement("div");
        stepper.className = "optionPicker__stepper";

        var busy = isPending(tier.name);

        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "optionPicker__btn optionPicker__btn--remove";
        removeBtn.setAttribute("aria-label", ui.removeButtonLabel || "빼기");
        removeBtn.textContent = "−";
        removeBtn.disabled = used === 0 || busy;
        removeBtn.addEventListener("click", function () {
            if (isPending(tier.name)) return;
            var target = lastUsedVariant(tier);
            if (!target) return;
            var row = findRowForVariant(state.listBody, target.text);
            if (!row) return;
            setPending(tier.name);
            safeRender();
            clickRowDeleteControl(row);
        });

        var qtyEl = document.createElement("span");
        qtyEl.className = "optionPicker__qty";
        qtyEl.textContent = String(used);

        var addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "optionPicker__btn optionPicker__btn--add";
        addBtn.setAttribute("aria-label", ui.addButtonLabel || "담기");
        addBtn.textContent = "+";
        addBtn.disabled = limitReached || allDisabled || busy;
        addBtn.addEventListener("click", function () {
            if (isPending(tier.name)) return;
            var next = nextAvailableVariant(tier);
            if (!next || !state.select) return;
            setPending(tier.name);
            safeRender();
            triggerNativeSelect(state.select, next.value, state.optionTable);
        });

        stepper.appendChild(removeBtn);
        stepper.appendChild(qtyEl);
        stepper.appendChild(addBtn);

        card.appendChild(main);
        card.appendChild(stepper);
        return card;
    }

    function render() {
        if (!state.root) return;
        recomputeUsage();

        state.root.innerHTML = "";

        var ui = getConfig().ui || {};
        var header = document.createElement("div");
        header.className = "optionPicker__header";
        var title = document.createElement("span");
        title.className = "optionPicker__title";
        title.textContent = ui.title || "골라담기";
        header.appendChild(title);
        if (ui.subtitle) {
            var subtitle = document.createElement("span");
            subtitle.className = "optionPicker__subtitle";
            subtitle.textContent = ui.subtitle;
            header.appendChild(subtitle);
        }
        state.root.appendChild(header);

        var list = document.createElement("div");
        list.className = "optionPicker__list";

        if (!state.tiers.length) {
            var empty = document.createElement("p");
            empty.className = "optionPicker__empty";
            empty.textContent = ui.emptyListText || "옵션 정보를 불러오지 못했습니다.";
            list.appendChild(empty);
        } else {
            state.tiers.forEach(function (tier) {
                list.appendChild(buildCard(tier));
            });
        }

        state.root.appendChild(list);

        // 피그마 시안의 "총 수량" 요약 바 — 개입수 카드가 여러 개일 때 전체
        // 담은 개수를 한눈에 보여준다(#7 활성화 상태 표시를 카드 단위뿐 아니라
        // 전체 합계로도 보강). "선택완료" 버튼은 가져오지 않는다 — 카페24의
        // 바로구매/장바구니가 이미 그 역할을 하므로 중복이다.
        if (state.tiers.length) {
            var totalUsed = state.tiers.reduce(function (sum, tier) {
                return (
                    sum +
                    tier.variants.filter(function (v) {
                        return v.inUse;
                    }).length
                );
            }, 0);
            var footer = document.createElement("div");
            footer.className = "optionPicker__footer";
            var totalLabel = document.createElement("span");
            totalLabel.className = "optionPicker__footerLabel";
            totalLabel.textContent = "총 담은 개수";
            var totalCount = document.createElement("span");
            totalCount.className = "optionPicker__footerCount";
            totalCount.textContent =
                typeof ui.totalCountLabel === "function" ? ui.totalCountLabel(totalUsed) : totalUsed + "개";
            footer.appendChild(totalLabel);
            footer.appendChild(totalCount);
            state.root.appendChild(footer);
        }
    }

    function logError(message, err) {
        if (typeof console !== "undefined" && console.error) {
            console.error("[option-picker] " + message, err);
        }
    }

    // 네이티브 옵션 행을 숨긴 상태였다면 다시 보이게 하고 커스텀 UI를 비운다.
    // render() 도중 예상 못 한 예외가 나도 손님이 옵션을 아예 못 고르는 상태가
    // 되지 않도록 하는 최후의 안전장치 — 실패하면 그냥 네이티브 UI로 돌아간다.
    var brokenBeyondRecovery = false;
    function revertToNative() {
        brokenBeyondRecovery = true;
        if (state.observer) {
            state.observer.disconnect();
            state.observer = null;
        }
        if (state.optionTable) {
            var row = state.optionTable.querySelector(".optionPickerNativeRow");
            if (row) row.classList.remove("optionPickerNativeRow");
        }
        if (state.root) state.root.innerHTML = "";
    }

    // render()는 실제 DOM(선택 상품 목록 등)을 읽어 동작하므로, 이 스크립트가
    // 세운 가정과 다른 마크업을 만나면 언제든 예외가 날 수 있다. 항상 이 래퍼를
    // 통해서만 호출해 실패 시 조용히 네이티브 UI로 폴백하게 한다.
    function safeRender() {
        if (brokenBeyondRecovery) return;
        try {
            render();
        } catch (err) {
            logError("렌더링 중 오류가 발생해 네이티브 옵션으로 되돌립니다.", err);
            revertToNative();
        }
    }

    var renderScheduled = false;
    function scheduleRender() {
        if (renderScheduled) return;
        renderScheduled = true;
        (window.requestAnimationFrame || window.setTimeout)(function () {
            renderScheduled = false;
            safeRender();
        }, 0);
    }

    function observeSelectedList() {
        if (typeof MutationObserver === "undefined") return; // 아주 오래된 브라우저: 초기 렌더만 유지, 역방향 동기화는 생략

        var listBody = findSelectedListBody();
        if (!listBody) return;

        if (state.observer) {
            state.observer.disconnect();
        }

        state.observer = new MutationObserver(function () {
            // 실제 목록이 바뀌었다는 확인이므로, 그 변화를 유발한 담기/빼기 클릭의
            // 잠금을 여기서 해제한다(락은 render()가 아니라 여기서만 풀린다).
            clearAllPending();
            scheduleRender();
        });

        // tbody 자체가 매 렌더링마다 교체될 수 있어, 목록 상위(테이블)까지 관찰한다.
        var table = listBody.closest("table") || listBody;
        state.observer.observe(table, { childList: true, subtree: true });
    }

    var initialized = false;
    function init() {
        if (initialized) return; // 스크립트가 실수로 두 번 포함되는 경우 등 중복 초기화 방지
        initialized = true;

        try {
            var optionTable = findOptionTable();
            if (!optionTable) return;

            var select = findNativeSelect(optionTable);
            if (!select) {
                // 카페24가 select가 아닌 다른 마크업으로 렌더링하는 경우: 커스텀 UI를 그리지
                // 않고 기본 옵션 UI를 그대로 노출한다 (구매 흐름을 막지 않는 것이 최우선).
                return;
            }

            var root = document.getElementById("optionPicker");
            if (!root) return;

            state.optionTable = optionTable;
            state.select = select;
            state.root = root;
            state.tiers = parseTiersFromSelect(select);

            safeRender();
            if (brokenBeyondRecovery) return; // 첫 렌더부터 실패하면 네이티브 행을 숨기지 않고 종료

            // 첫 렌더가 성공적으로 끝난 뒤에만 네이티브 옵션 행을 숨긴다 — 순서를
            // 바꾸면(먼저 숨기고 나중에 렌더) render()가 실패했을 때 손님이 옵션을
            // 아예 고를 수 없는 상태로 남는다. 필수 DOM/이벤트는 삭제하지 않는다.
            // "테이블의 첫 tr"이 아니라 select를 직접 감싼 tr을 찾는다 — 모바일
            // 스킨은 옵션 테이블 앞에 배송(국내/해외) 선택 행이 하나 더 있어서,
            // 위치 기반으로 찾으면 엉뚱한 행을 숨기게 된다(실제 모바일 스킨
            // 템플릿 확인으로 발견).
            var optionRow = select.closest("tr");
            if (optionRow) optionRow.classList.add("optionPickerNativeRow");

            observeSelectedList();
        } catch (err) {
            logError("초기화 중 오류가 발생해 네이티브 옵션을 그대로 사용합니다.", err);
            revertToNative();
        }
    }

    // 순수 로직(파싱/매칭)만 Node 테스트(test/option-picker.test.js)에서 실행할 수 있도록
    // 노출한다. 브라우저에서는 module이 없으므로 이 블록은 실행되지 않는다.
    if (typeof module !== "undefined" && module.exports) {
        module.exports = {
            parseTierAndSuffix: parseTierAndSuffix,
            parsePriceText: parsePriceText,
            parseTiersFromSelect: parseTiersFromSelect,
            rowMatchesVariant: rowMatchesVariant,
            triggerNativeSelect: triggerNativeSelect,
            findOptionButtonLink: findOptionButtonLink
        };
    }

    // document가 없는 환경(Node 테스트)에서는 초기화를 실행하지 않는다.
    if (typeof document !== "undefined") {
        ready(init);
    }
})();
