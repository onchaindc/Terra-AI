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
        } catch (error) {}
      }
    } catch (error) {}
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
`;

test("runtime patch adds pre-processing inbound logging and watchdog recovery", () => {
  const result = patchSource(RUNTIME_FIXTURE);

  assert.equal(result.changed, true);
  assert.match(result.source, /emit\("inbound", message\)/);
  assert.match(result.source, /inbound message received/);
  assert.match(result.source, /OKX_A2A_XMTP_WATCHDOG_INTERVAL_MS/);
  assert.match(result.source, /OKX_A2A_XMTP_WATCHDOG_STALE_MS/);
  assert.match(result.source, /watchdog detected stale XMTP listener/);
  assert.match(result.source, /await this\.recycleXmtpClients\(\)/);
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
