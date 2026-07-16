/*
 * cafe24-deploy.js의 로그인/편집창 진입/저장 selector는 실제 카페24 관리자
 * 화면을 직접 보지 못한 상태로는 정확히 알 수 없다(관리자 UI는 공식 문서에
 * DOM 구조가 나와 있지 않다). 그래서 자동 추측 대신, Playwright Codegen으로
 * 한 번 수동 조작을 기록해 그 결과를 cafe24-deploy.js에 옮기는 방식을 쓴다.
 *
 * 실행: npm run cafe24:record
 *
 * 브라우저가 열리면 아래 순서를 그대로 한 번 수행한다:
 *   1. 테스트몰 관리자 로그인
 *   2. 디자인 관리 > 스마트디자인 편집(HTML 편집기) 진입
 *   3. product/detail.html 파일 열기
 *   4. 내용 전체 선택 후 삭제 (실제 교체는 하지 않아도 됨 — selector만 필요)
 *   5. 저장 버튼 위치까지 확인
 *   6. (있다면) 대표 디자인 지정 화면까지 이동
 *
 * 각 동작이 Playwright Inspector 창에 코드로 기록된다. 그 코드를
 * scripts/cafe24-deploy.js 안의 "TODO(record)" 표시된 자리에 옮겨 붙이면 된다.
 * 이 스크립트 자체는 아무 것도 저장하지 않는다 — 읽기 전용 기록 보조 도구다.
 */
"use strict";

const { spawnSync } = require("child_process");
const { loadEnv } = require("./lib/env");

loadEnv();

const mallId = process.env.CAFE24_MALL_ID;
if (!mallId) {
    console.error("CAFE24_MALL_ID가 .env에 없습니다. .env.example을 .env로 복사해 채워주세요.");
    process.exit(1);
}

const loginUrl = `https://${mallId}.cafe24.com/disp/admin/shop1/login`;

console.log("Playwright Codegen을 실행합니다.");
console.log(`대상: ${loginUrl}`);
console.log("");
console.log("브라우저가 열리면 로그인 -> 디자인 관리 -> 스마트디자인 편집 -> ");
console.log("product/detail.html 열기 -> 내용 전체 선택 -> 저장 버튼 확인 -> ");
console.log("(있다면) 대표 디자인 지정까지 수동으로 한 번 수행하세요.");
console.log("우측 Inspector 창에 기록된 코드를 cafe24-deploy.js의 TODO(record) 자리로 옮기면 됩니다.");
console.log("");

const result = spawnSync("npx", ["playwright", "codegen", loginUrl], { stdio: "inherit" });
process.exit(result.status || 0);
