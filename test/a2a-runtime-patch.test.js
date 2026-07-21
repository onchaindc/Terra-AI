const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PATCH_MARKER,
  patchSource
} = require("../scripts/patch-a2a-runtime");

const RUNTIME_FIXTURE = `
var Agent = class _Agent {
  async start() {
    try {
      const stream = await this.#client.conversations.streamAllMessages();
      for await (const message of stream) {
        if (!this.#isListening)
          break;
        try {
          await this.#processMessage(message);
        } catch (error) {
          this.#throwError(error);
        }
      }
    } catch (error) {
      this.#isListening = false;
      this.#throwError(error);
    }
  }
};
var XmtpService = class {
  syncByAddress = /* @__PURE__ */ new Map();
  async startListeningForAddresses(addresses) {
      const MAX_RETRIES = 5;
      const BASE_DELAY_MS = 1e3;
      const startWithRetry = async (attempt = 0) => {
      };
      const scheduleRetry = (attempt) => {
      };
      agent.on("error", (err2) => {
        logWithTimestamp(\`\${tag} agent stream error:\`, err2);
        logger.error(LogEvent.AGENT_STREAM_ERROR, err2, agentExtras(identity3));
        scheduleRetry(0);
      });
      void startWithRetry();
      logWithTimestamp(\`\${tag} message listener started\`);
  }
};
var SessionMessageDispatcher = class {
  buildRunArgs(provider, request, aiSessionId, cwd = this.resolveAiWorkingDir()) {
    const permissionPreset = this.resolveAiPermissionPresetForRun();
    const prompt = request.prompt;
    if (provider === "claude") {
      return buildAiAdapterCommand({
        provider,
        prompt,
        sessionId: aiSessionId,
        sessionKey: request.sessionKey,
        homeDir: this.homeDir,
        cwd,
        permissionPreset
      }).args;
    }
    if (provider === "codex") {
      const commonPrefix = [...buildCodexPermissionPrefix(this.homeDir, cwd, process.env, permissionPreset), "exec"];
      if (aiSessionId) {
        return [
          ...commonPrefix,
          "resume",
          "--json",
          "--skip-git-repo-check",
          aiSessionId,
          prompt
        ];
      }
      return [
        ...commonPrefix,
        "--json",
        "--skip-git-repo-check",
        prompt
      ];
    }
    return buildAiAdapterCommand({
      provider,
      prompt,
      sessionId: aiSessionId,
      sessionKey: request.sessionKey,
      homeDir: this.homeDir,
      cwd,
      permissionPreset
    }).args;
  }
};
`;

test("runtime patch reconnects completed streams and honors custom Codex adapter args", () => {
  const result = patchSource(RUNTIME_FIXTURE);

  assert.equal(result.changed, true);
  assert.match(result.source, /emit\("inbound", message\)/);
  assert.match(result.source, /inbound message received/);
  assert.match(result.source, /emit\("stream-end"\)/);
  assert.match(result.source, /agent\.on\("stream-end"/);
  assert.match(result.source, /message stream ended unexpectedly; reconnecting/);
  assert.doesNotMatch(result.source, /WATCHDOG_STALE_MS/);
  assert.doesNotMatch(result.source, /watchdog detected stale XMTP listener/);
  assert.doesNotMatch(result.source, /recycleXmtpClients/);
  assert.match(
    result.source,
    /return buildAiAdapterCommand\(\{[\s\S]*env: process\.env[\s\S]*\}\)\.args;/
  );
  assert.doesNotMatch(
    result.source,
    /const commonPrefix = \[\.\.\.buildCodexPermissionPrefix/
  );
  assert.match(result.source, new RegExp(PATCH_MARKER));
});

test("runtime patch is idempotent", () => {
  const first = patchSource(RUNTIME_FIXTURE);
  const second = patchSource(first.source);

  assert.equal(second.changed, false);
  assert.equal(second.source, first.source);
});

test("runtime patch fails closed when the pinned bundle layout changes", () => {
  assert.throws(
    () => patchSource("unrecognized runtime"),
    /patch anchor not found/
  );
});
