/*
 * .env 파일을 process.env로 로드하는 최소 구현. 이 프로젝트는 별도 의존성을
 * 늘리지 않는 원칙(package.json 설명 참고)을 배포 스크립트에도 그대로 적용한다.
 * dotenv 같은 패키지를 추가하는 대신 KEY=VALUE 파싱만 직접 한다.
 */
"use strict";

const fs = require("fs");
const path = require("path");

function loadEnv(envPath) {
    const target = envPath || path.join(__dirname, "..", "..", ".env");
    if (!fs.existsSync(target)) {
        return;
    }

    const lines = fs.readFileSync(target, "utf8").split("\n");
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }
        const eq = line.indexOf("=");
        if (eq === -1) {
            continue;
        }
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (key && !(key in process.env)) {
            process.env[key] = value;
        }
    }
}

module.exports = { loadEnv };
