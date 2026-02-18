import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const handoffDir = path.join(repoRoot, "docs", "handoff");
const preflightFile = path.join(handoffDir, "preflight.json");
const commandTraceFile = path.join(handoffDir, "verify-commands.json");
const manifestFile = path.join(handoffDir, "handoff-manifest.json");

mkdirSync(handoffDir, { recursive: true });

function timestamp() {
  return new Date().toISOString();
}

function runNodeScript(scriptPath, args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function runShellStep(command, required = true) {
  const startedAt = timestamp();
  const result = spawnSync(command, {
    cwd: repoRoot,
    shell: true,
    encoding: "utf8",
    env: process.env,
  });
  const endedAt = timestamp();

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return {
    command,
    required,
    statusCode: result.status ?? 1,
    startedAt,
    endedAt,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
  };
}

function isInfrastructureE2eFailure(output) {
  const patterns = [
    /Executable doesn't exist/i,
    /Please run the following command to download new browsers/i,
    /Missing X server/i,
    /Failed to launch browser/i,
    /browserType\.launch/i,
  ];
  return patterns.some((pattern) => pattern.test(output));
}

function recordCommandTrace(command, status, startedAt, endedAt, message = "") {
  return {
    command,
    status,
    started_at: startedAt,
    ended_at: endedAt,
    message,
  };
}

const commandTraces = [];
const failureHints = [];
let overallPass = true;

process.stdout.write("== verify: preflight ==\n");
const preflightRun = runNodeScript(path.join("scripts", "verify", "preflight.mjs"), ["--json"]);

if (preflightRun.stdout) {
  process.stdout.write(preflightRun.stdout);
}
if (preflightRun.stderr) {
  process.stderr.write(preflightRun.stderr);
}

let preflightData = null;
try {
  preflightData = JSON.parse(preflightRun.stdout || "{}");
} catch {
  preflightData = null;
}

if (!preflightData || preflightRun.status !== 0 || !preflightData.ok) {
  overallPass = false;
  failureHints.push("preflight 실패: 리포지토리 루트/remote/브랜치 상태를 확인하세요.");
}

writeFileSync(preflightFile, `${JSON.stringify(preflightData ?? {}, null, 2)}\n`, "utf8");

const requiredSteps = [
  { command: "npm run lint", hint: "lint 실패: `npm run lint`를 재실행해 타입/문법 문제를 수정하세요." },
  { command: "npm run typecheck", hint: "typecheck 실패: 타입 오류를 수정한 뒤 다시 실행하세요." },
  { command: "npm run test", hint: "test 실패: 실패 테스트를 수정하거나 코드 회귀를 해결하세요." },
  { command: "npm run build", hint: "build 실패: 번들 빌드 오류를 해결하세요." },
];

if (overallPass) {
  for (const step of requiredSteps) {
    process.stdout.write(`== verify: ${step.command} ==\n`);
    const result = runShellStep(step.command, true);
    if (result.statusCode === 0) {
      commandTraces.push(
        recordCommandTrace(step.command, "pass", result.startedAt, result.endedAt),
      );
      continue;
    }

    overallPass = false;
    commandTraces.push(
      recordCommandTrace(step.command, "fail", result.startedAt, result.endedAt, "required step failed"),
    );
    failureHints.push(step.hint);
    break;
  }
}

const skipE2E = process.argv.includes("--skip-e2e") || process.env.VERIFY_SKIP_E2E === "1";
if (!skipE2E && overallPass) {
  const e2eCommand = "npm run test:e2e";
  process.stdout.write(`== verify: ${e2eCommand} ==\n`);
  const e2eResult = runShellStep(e2eCommand, false);

  if (e2eResult.statusCode === 0) {
    commandTraces.push(
      recordCommandTrace(e2eCommand, "pass", e2eResult.startedAt, e2eResult.endedAt),
    );
  } else if (isInfrastructureE2eFailure(e2eResult.output)) {
    commandTraces.push(
      recordCommandTrace(
        e2eCommand,
        "skipped",
        e2eResult.startedAt,
        e2eResult.endedAt,
        "환경 이슈로 e2e를 건너뜀 (예: playwright browser 미설치)",
      ),
    );
    failureHints.push("e2e 환경 이슈: 필요 시 `npx playwright install` 후 다시 실행하세요.");
  } else {
    overallPass = false;
    commandTraces.push(
      recordCommandTrace(e2eCommand, "fail", e2eResult.startedAt, e2eResult.endedAt, "e2e regression"),
    );
    failureHints.push("e2e 실패: UI 회귀 또는 테스트 실패 원인을 확인하세요.");
  }
} else if (skipE2E) {
  const now = timestamp();
  commandTraces.push(
    recordCommandTrace("npm run test:e2e", "skipped", now, now, "VERIFY_SKIP_E2E=1 or --skip-e2e"),
  );
}

writeFileSync(commandTraceFile, `${JSON.stringify(commandTraces, null, 2)}\n`, "utf8");

const manifestArgs = [
  path.join("scripts", "handoff", "generate-manifest.mjs"),
  `--output=${path.relative(repoRoot, manifestFile).replace(/\\/g, "/")}`,
  `--result=${overallPass ? "pass" : "fail"}`,
  `--commands-file=${path.relative(repoRoot, commandTraceFile).replace(/\\/g, "/")}`,
  `--preflight-file=${path.relative(repoRoot, preflightFile).replace(/\\/g, "/")}`,
  `--summary=${overallPass ? "verify pipeline passed" : "verify pipeline failed"}`,
];

if (process.argv.includes("--copy-mnt-data")) {
  manifestArgs.push("--copy-mnt-data");
}

const manifestRun = runNodeScript(manifestArgs[0], manifestArgs.slice(1));
if (manifestRun.stdout) {
  process.stdout.write(manifestRun.stdout);
}
if (manifestRun.stderr) {
  process.stderr.write(manifestRun.stderr);
}

if (failureHints.length > 0) {
  process.stdout.write("== verify: action required ==\n");
  for (const hint of failureHints) {
    process.stdout.write(`- ${hint}\n`);
  }
}

process.stdout.write(`== verify: ${overallPass ? "PASS" : "FAIL"} ==\n`);
process.exit(overallPass ? 0 : 1);
