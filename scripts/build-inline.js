/*
 * detail.html / detail.mobile.html의 <!--@css/@js(...)--> include 3줄을, 카페24
 * 스마트디자인 편집창이 별도 css/js 파일 업로드를 지원하지 않을 때 쓸 수 있도록
 * <style>/<script>로 인라인한 *.cafe24-inline.html을 생성한다.
 *
 * 이 몰은 PC와 모바일 스킨이 분리되어 있어(디자인 보관함에 PC/모바일 탭이 따로
 * 있음, 실제 확인함) product/detail.html도 두 벌이다 — detail.html은 PC 스킨,
 * detail.mobile.html은 모바일 스킨용이다. 두 파일 모두 같은
 * option-picker.css/js/config.js를 그대로 재사용한다(로직 중복 없음).
 *
 * 소스(css/module/product/option-picker.css, js/module/product/option-picker.*)가
 * 실제 배포 파일이다 — 이 스크립트는 그걸 그대로 복사해 넣을 뿐이므로, 소스가
 * 바뀌면 이 스크립트를 다시 돌려 *.cafe24-inline.html을 갱신해야 한다.
 *
 * 실행: node scripts/build-inline.js  (또는 npm run build:inline)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "css/module/product/option-picker.css"), "utf8");
const config = fs.readFileSync(path.join(root, "js/module/product/option-picker.config.js"), "utf8");
const js = fs.readFileSync(path.join(root, "js/module/product/option-picker.js"), "utf8");

const marker = `            <!--@css(/css/module/product/option-picker.css)-->
            <!-- 골라담기 커스텀 옵션 UI: 위 product_option 테이블의 네이티브 select를
                 대신 조작하는 방식으로 동작한다(재구현 아님). 뱃지/설명/추천문구/
                 가격표시는 option-picker.config.js에서 관리한다. -->
            <div class="optionPicker" id="optionPicker"></div>
            <!--@js(/js/module/product/option-picker.config.js)-->
            <!--@js(/js/module/product/option-picker.js)-->`;

const replacement = `            <style>
${css}
            </style>
            <!-- 골라담기 커스텀 옵션 UI: 위 product_option 테이블의 네이티브 select를
                 대신 조작하는 방식으로 동작한다(재구현 아님). 뱃지/설명/추천문구/
                 가격표시는 아래 option-picker.config.js 블록에서 관리한다. -->
            <div class="optionPicker" id="optionPicker"></div>
            <script>
${config}
            </script>
            <script>
${js}
            </script>`;

function buildOne(sourceName, outputName) {
    const sourcePath = path.join(root, sourceName);
    if (!fs.existsSync(sourcePath)) {
        console.log(`(건너뜀) ${sourceName}이 없다.`);
        return;
    }
    const source = fs.readFileSync(sourcePath, "utf8");

    if (!source.includes(marker)) {
        throw new Error(`${sourceName}에서 include 마커를 못 찾았다 — 파일이 바뀌었으면 이 스크립트의 marker도 맞춰 고쳐야 한다.`);
    }

    // replace()에 문자열을 바로 넘기면 $&, $`, $1 같은 특수 치환 패턴이 해석돼
    // replacement 안의 정규식 리터럴("...$/")이나 "`$`" 같은 주석이 깨진다.
    // 함수로 넘기면 완전히 리터럴로 삽입된다.
    const out = source.replace(marker, () => replacement);

    if (out === source) {
        throw new Error(`${sourceName}: 치환이 전혀 일어나지 않았다.`);
    }

    fs.writeFileSync(path.join(root, outputName), out);
    console.log(`${outputName} 생성 완료:`, out.split("\n").length, "줄");
}

buildOne("detail.html", "detail.cafe24-inline.html");
buildOne("detail.mobile.html", "detail.mobile.cafe24-inline.html");
