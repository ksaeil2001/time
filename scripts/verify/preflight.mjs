import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import process from "node:process";

function runGit(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function checkResult(name, status, detail) {
  return { name, status, detail };
}

const checks = [];
let hasHardFailure = false;

const repoRoot = runGit(["rev-parse", "--show-toplevel"]);
if (!repoRoot) {
  checks.push(
    checkResult(
      "repo_root",
      "fail",
      "현재 디렉터리가 git 리포지토리가 아닙니다. 올바른 프로젝트 루트에서 실행하세요.",
    ),
  );
  hasHardFailure = true;
}

const originUrl = runGit(["remote", "get-url", "origin"]);
if (!originUrl) {
  checks.push(
    checkResult(
      "origin_url",
      "fail",
      "origin remote URL을 찾지 못했습니다. git remote 설정을 확인하세요.",
    ),
  );
  hasHardFailure = true;
} else {
  checks.push(checkResult("origin_url", "pass", originUrl));
}

const branch = runGit(["branch", "--show-current"]);
if (!branch) {
  checks.push(
    checkResult(
      "branch",
      "fail",
      "현재 브랜치를 확인할 수 없습니다(detached HEAD 포함).",
    ),
  );
  hasHardFailure = true;
} else {
  checks.push(checkResult("branch", "pass", branch));
}

const dirty = runGit(["status", "--porcelain"]);
if (dirty) {
  const dirtyCount = dirty.split("\n").filter(Boolean).length;
  checks.push(
    checkResult(
      "git_dirty",
      "warn",
      `작업 트리가 dirty 상태입니다. 변경 파일 ${dirtyCount}개`,
    ),
  );
} else {
  checks.push(checkResult("git_dirty", "pass", "작업 트리가 clean 상태입니다."));
}

if (originUrl && branch) {
  const remoteHead = runGit(["ls-remote", "--heads", "origin", branch]);
  if (remoteHead) {
    checks.push(
      checkResult(
        "remote_branch",
        "pass",
        `origin/${branch} 브랜치가 존재합니다.`,
      ),
    );
  } else {
    checks.push(
      checkResult(
        "remote_branch",
        "warn",
        `origin/${branch} 브랜치를 찾지 못했습니다(로컬 전용 브랜치 가능).`,
      ),
    );
  }
}

const identitySeed = [
  process.env.GITHUB_ACTOR || "",
  process.env.OPENAI_ORG_ID || "",
  process.env.CODEX_ORG_ID || "",
  process.env.USERDOMAIN || "",
  process.env.USERNAME || "",
]
  .filter(Boolean)
  .join("|");

const identityHash = identitySeed
  ? crypto.createHash("sha256").update(identitySeed).digest("hex")
  : "";

if (identityHash) {
  checks.push(
    checkResult(
      "identity_hash",
      "pass",
      "조직/토큰/환경 식별자 해시를 생성했습니다.",
    ),
  );
} else {
  checks.push(
    checkResult(
      "identity_hash",
      "warn",
      "식별자 후보 환경변수가 없어 identity hash를 생성하지 못했습니다.",
    ),
  );
}

const payload = {
  ok: !hasHardFailure,
  generated_at: new Date().toISOString(),
  repo_root: repoRoot || "",
  origin_url: originUrl || "",
  branch: branch || "",
  identity_hash: identityHash,
  checks,
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  for (const check of checks) {
    process.stdout.write(`[${check.status}] ${check.name}: ${check.detail}\n`);
  }
}

process.exit(payload.ok ? 0 : 1);
