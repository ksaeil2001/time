import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const args = {
    output: "docs/handoff/handoff-manifest.json",
    result: "fail",
    commandsFile: "",
    preflightFile: "",
    summary: "",
    identityHash: "",
    copyMntData: false,
  };

  for (const token of argv) {
    if (token.startsWith("--output=")) {
      args.output = token.slice("--output=".length);
      continue;
    }
    if (token.startsWith("--result=")) {
      args.result = token.slice("--result=".length);
      continue;
    }
    if (token.startsWith("--commands-file=")) {
      args.commandsFile = token.slice("--commands-file=".length);
      continue;
    }
    if (token.startsWith("--preflight-file=")) {
      args.preflightFile = token.slice("--preflight-file=".length);
      continue;
    }
    if (token.startsWith("--summary=")) {
      args.summary = token.slice("--summary=".length);
      continue;
    }
    if (token.startsWith("--identity-hash=")) {
      args.identityHash = token.slice("--identity-hash=".length);
      continue;
    }
    if (token === "--copy-mnt-data") {
      args.copyMntData = true;
    }
  }

  return args;
}

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

function readJsonArray(filePath) {
  if (!filePath) {
    return [];
  }
  if (!existsSync(filePath)) {
    return [];
  }
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function readJsonObject(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return null;
  }
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

const args = parseArgs(process.argv.slice(2));
const repoRoot = runGit(["rev-parse", "--show-toplevel"]) || process.cwd();
const originUrl = runGit(["remote", "get-url", "origin"]);
const branch = runGit(["branch", "--show-current"]);
const headSha = runGit(["rev-parse", "HEAD"]);
const remoteRef = branch ? `origin/${branch}` : "";
const baseSha =
  (remoteRef && runGit(["merge-base", "HEAD", remoteRef])) ||
  runGit(["rev-parse", "HEAD^"]) ||
  headSha;

const preflightObject = readJsonObject(args.preflightFile);
const preflightChecks =
  preflightObject && Array.isArray(preflightObject.checks)
    ? preflightObject.checks
    : [];

const manifest = {
  schema_version: "1.0.0",
  generated_at: new Date().toISOString(),
  repo_root: repoRoot,
  origin_url: originUrl || "unknown",
  branch: branch || "unknown",
  base_sha: baseSha || "unknown",
  head_sha: headSha || "unknown",
  result: args.result === "pass" ? "pass" : "fail",
  summary: args.summary || "",
  identity_hash: args.identityHash || preflightObject?.identity_hash || "",
  preflight: preflightChecks,
  verification_commands: readJsonArray(args.commandsFile),
};

const outputPath = path.resolve(repoRoot, args.output);
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`manifest generated: ${outputPath}`);

if (args.copyMntData && existsSync("/mnt/data")) {
  const mirrorPath = path.join("/mnt/data", path.basename(outputPath));
  copyFileSync(outputPath, mirrorPath);
  console.log(`manifest copied: ${mirrorPath}`);
}
