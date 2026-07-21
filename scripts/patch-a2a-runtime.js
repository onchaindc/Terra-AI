const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PATCH_MARKER = "terra-a2a-runtime-fixes-v3";
const EXPECTED_VERSION = "0.1.9";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceIndentedBlock(
  source,
  searchLines,
  replacementLines,
  label
) {
  const firstLinePattern = new RegExp(
    `^(\\s*)${escapeRegExp(searchLines[0])}\\r?$`,
    "gm"
  );
  const candidates = [...source.matchAll(firstLinePattern)];
  const matches = candidates
    .map((candidate) => candidate[1])
    .map((indent) => ({
      indent,
      search: searchLines.map((line) => `${indent}${line}`).join("\n")
    }))
    .filter(({ search }) => source.includes(search));

  if (matches.length === 0) {
    throw new Error(`A2A runtime patch anchor not found: ${label}`);
  }

  if (matches.length !== 1) {
    throw new Error(`A2A runtime patch anchor is not unique: ${label}`);
  }

  const { indent, search } = matches[0];
  const replacement = replacementLines
    .map((line) => `${indent}${line}`)
    .join("\n");
  return source.replace(search, replacement);
}

function replaceIndentedBlockBetween(
  source,
  startMarker,
  endMarker,
  searchLines,
  replacementLines,
  label
) {
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker, startIndex + startMarker.length);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error(`A2A runtime patch scope not found: ${label}`);
  }

  const before = source.slice(0, startIndex);
  const scoped = source.slice(startIndex, endIndex);
  const after = source.slice(endIndex);
  return (
    before +
    replaceIndentedBlock(scoped, searchLines, replacementLines, label) +
    after
  );
}

function patchSource(source) {
  if (source.includes(PATCH_MARKER)) {
    return { source, changed: false };
  }

  let patched = source;

  patched = replaceIndentedBlock(
    patched,
    [
      "for await (const message of stream) {",
      "  if (!this.#isListening)",
      "    break;",
      "  try {"
    ],
    [
      "for await (const message of stream) {",
      "  if (!this.#isListening)",
      "    break;",
      '  void this.emit("inbound", message);',
      "  try {"
    ],
    "XMTP inbound event before processing"
  );

  patched = replaceIndentedBlockBetween(
    patched,
    'void this.emit("inbound", message);',
    "XmtpService = class",
    [
      "} catch (error) {",
      "  this.#isListening = false;"
    ],
    [
      "if (this.#isListening) {",
      "  this.#isListening = false;",
      '  void this.emit("stream-end");',
      "}",
      "} catch (error) {",
      "  this.#isListening = false;"
    ],
    "XMTP unexpected stream completion"
  );

  patched = replaceIndentedBlock(
    patched,
    [
      "const MAX_RETRIES = 5;",
      "const BASE_DELAY_MS = 1e3;",
      "const startWithRetry = async (attempt = 0) => {"
    ],
    [
      "const MAX_RETRIES = 5;",
      "const BASE_DELAY_MS = 1e3;",
      'agent.on("inbound", (message) => {',
      '  const messageId = message?.id ?? "(unknown)";',
      '  const conversationId = message?.conversationId ?? "(unknown)";',
      '  const sentAt = message?.sentAtNs ?? message?.sentAt ?? "(unknown)";',
      "  logWithTimestamp(",
      '    `${tag} inbound message received id=${messageId} conversation=${conversationId} sentAt=${String(sentAt)}`',
      "  );",
      "});",
      "const startWithRetry = async (attempt = 0) => {"
    ],
    "XMTP watchdog configuration and inbound logging"
  );

  patched = replaceIndentedBlock(
    patched,
    [
      'agent.on("error", (err2) => {',
      "  logWithTimestamp(`${tag} agent stream error:`, err2);",
      "  logger.error(LogEvent.AGENT_STREAM_ERROR, err2, agentExtras(identity3));",
      "  scheduleRetry(0);",
      "});",
      "void startWithRetry();",
      "logWithTimestamp(`${tag} message listener started`);"
    ],
    [
      'agent.on("error", (err2) => {',
      "  logWithTimestamp(`${tag} agent stream error:`, err2);",
      "  logger.error(LogEvent.AGENT_STREAM_ERROR, err2, agentExtras(identity3));",
      "  scheduleRetry(0);",
      "});",
      'agent.on("stream-end", () => {',
      "  logWithTimestamp(`${tag} message stream ended unexpectedly; reconnecting`);",
      "  scheduleRetry(0);",
      "});",
      "void startWithRetry();",
      "logWithTimestamp(",
      `  \`\${tag} message listener started patch=${PATCH_MARKER}\``,
      ");"
    ],
    "XMTP stream completion recovery"
  );

  patched = replaceIndentedBlock(
    patched,
    [
      "buildRunArgs(provider, request, aiSessionId, cwd = this.resolveAiWorkingDir()) {",
      "  const permissionPreset = this.resolveAiPermissionPresetForRun();",
      "  const prompt = request.prompt;",
      '  if (provider === "claude") {',
      "    return buildAiAdapterCommand({",
      "      provider,",
      "      prompt,",
      "      sessionId: aiSessionId,",
      "      sessionKey: request.sessionKey,",
      "      homeDir: this.homeDir,",
      "      cwd,",
      "      permissionPreset",
      "    }).args;",
      "  }",
      '  if (provider === "codex") {',
      "    const commonPrefix = [...buildCodexPermissionPrefix(this.homeDir, cwd, process.env, permissionPreset), \"exec\"];",
      "    if (aiSessionId) {",
      "      return [",
      "        ...commonPrefix,",
      '        "resume",',
      '        "--json",',
      '        "--skip-git-repo-check",',
      "        aiSessionId,",
      "        prompt",
      "      ];",
      "    }",
      "    return [",
      "      ...commonPrefix,",
      '      "--json",',
      '      "--skip-git-repo-check",',
      "      prompt",
      "    ];",
      "  }",
      "  return buildAiAdapterCommand({",
      "    provider,",
      "    prompt,",
      "    sessionId: aiSessionId,",
      "    sessionKey: request.sessionKey,",
      "    homeDir: this.homeDir,",
      "    cwd,",
      "    permissionPreset",
      "  }).args;",
      "}"
    ],
    [
      "buildRunArgs(provider, request, aiSessionId, cwd = this.resolveAiWorkingDir()) {",
      "  const permissionPreset = this.resolveAiPermissionPresetForRun();",
      "  const prompt = request.prompt;",
      '  if (provider === "claude") {',
      "    return buildAiAdapterCommand({",
      "      provider,",
      "      prompt,",
      "      sessionId: aiSessionId,",
      "      sessionKey: request.sessionKey,",
      "      homeDir: this.homeDir,",
      "      cwd,",
      "      permissionPreset",
      "    }).args;",
      "  }",
      '  if (provider === "codex") {',
      "    return buildAiAdapterCommand({",
      "      provider,",
      "      prompt,",
      "      sessionId: aiSessionId,",
      "      sessionKey: request.sessionKey,",
      "      homeDir: this.homeDir,",
      "      cwd,",
      "      permissionPreset,",
      "      env: process.env",
      "    }).args;",
      "  }",
      "  return buildAiAdapterCommand({",
      "    provider,",
      "    prompt,",
      "    sessionId: aiSessionId,",
      "    sessionKey: request.sessionKey,",
      "    homeDir: this.homeDir,",
      "    cwd,",
      "    permissionPreset",
      "  }).args;",
      "}"
    ],
    "job dispatch custom Codex adapter arguments"
  );

  if (!patched.includes(PATCH_MARKER)) {
    throw new Error("A2A runtime patch marker was not inserted");
  }

  return { source: patched, changed: true };
}

function resolveDefaultTargets() {
  const npmRoot = execFileSync("npm", ["root", "-g"], {
    encoding: "utf8"
  }).trim();
  const packageDir = path.join(npmRoot, "@okxweb3", "a2a-node");
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(packageDir, "package.json"), "utf8")
  );

  if (packageJson.version !== EXPECTED_VERSION) {
    throw new Error(
      `Expected @okxweb3/a2a-node ${EXPECTED_VERSION}, found ${packageJson.version}`
    );
  }

  return [
    path.join(packageDir, "dist", "index.js"),
    path.join(packageDir, "dist", "cli.js")
  ];
}

function patchFile(targetPath) {
  const original = fs.readFileSync(targetPath, "utf8");
  const result = patchSource(original);

  if (result.changed) {
    fs.writeFileSync(targetPath, result.source, "utf8");
  }

  process.stdout.write(
    `[terra-a2a] ${result.changed ? "patched" : "verified"} ${targetPath}\n`
  );
}

if (require.main === module) {
  const targets =
    process.argv.length > 2 ? process.argv.slice(2) : resolveDefaultTargets();
  targets.forEach(patchFile);
}

module.exports = {
  EXPECTED_VERSION,
  PATCH_MARKER,
  patchSource
};
