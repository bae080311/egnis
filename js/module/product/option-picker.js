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

    var config = window.OptionPickerConfig || {
        ui: {},
        tiers: {},
        defaultTier: { badge: null, description: "", recommend: false }
    };

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
            render();
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

    function findOptionTable() {
        return document.querySelector('table[module="product_option"]');
    }

    function findNativeSelect(optionTable) {
        if (!optionTable) return null;
        return optionTable.querySelector("select");
    }

    // 카페24가 append하는 "선택 상품 목록" 테이블의 마지막 tbody.
    // {$total.total_id}는 서버 렌더링 시 실제 id로 치환되므로 id로는 찾지 않고
    // caption 텍스트("상품 목록")로 구조 기반 탐색한다.
    function findSelectedListBody() {
        var tables = document.querySelectorAll(".detailArea table");
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

    function parseTiersFromSelect(select) {
        var order = [];
        var map = {};

        var options = Array.prototype.slice.call(select.options);
        options.forEach(function (opt) {
            var value = opt.value;
            var text = opt.text.trim();
            if (!value || !text) return; // 플레이스홀더("선택해주세요" 등) 제외

            var labelText = text.replace(TRAILING_PRICE_PATTERN, "").trim();

            var tierName = labelText;
            var suffix = 1;
            var m = labelText.match(SUFFIX_PATTERN);
            if (m) {
                tierName = m[1];
                suffix = parseInt(m[2], 10);
            }

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

    // select의 값이 바뀌지 않으면(같은 옵션을 연속으로 다시 선택) change 이벤트가
    // 발생하지 않아 카페24 담기 로직이 실행되지 않는다. 매번 실제 값 전환이
    // 일어나도록 빈 값으로 리셋한 뒤 목표 값으로 세팅한다.
    function triggerNativeSelect(select, optionValue) {
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
        var fn = config.ui && config.ui.unitPriceLabel;
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
        var ui = config.ui || {};

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
            price.textContent = firstVariantPrice;
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
            render();
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
            render();
            triggerNativeSelect(state.select, next.value);
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

        var ui = config.ui || {};
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
    }

    var renderScheduled = false;
    function scheduleRender() {
        if (renderScheduled) return;
        renderScheduled = true;
        (window.requestAnimationFrame || window.setTimeout)(function () {
            renderScheduled = false;
            render();
        }, 0);
    }

    function observeSelectedList() {
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

    function init() {
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

        // 첫 tr(옵션 select 행)만 시각적으로 숨긴다. 필수 DOM/이벤트는 삭제하지 않는다.
        var firstRow = optionTable.querySelector("tbody tr");
        if (firstRow) firstRow.classList.add("optionPickerNativeRow");

        state.optionTable = optionTable;
        state.select = select;
        state.root = root;
        state.tiers = parseTiersFromSelect(select);

        render();
        observeSelectedList();
    }

    ready(init);
})();
