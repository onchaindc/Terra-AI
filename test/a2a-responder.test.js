const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildReply,
  buildSendArgs,
  extractPeerAgentId,
  runResponder
} = require("../src/a2a/responder");

test("Terra A2A responder advertises all four services", () => {
  const reply = buildReply(
    "I would like to use the services of agent ID 5105"
  );

  assert.match(reply, /Terra Compare/);
  assert.match(reply, /Hidden Costs/);
  assert.match(reply, /Investment Check/);
  assert.match(reply, /Buyer Fit/);
  assert.match(reply, /online and ready/i);
});

test("Terra A2A responder extracts a peer agent from an inbound envelope", () => {
  const prompt = JSON.stringify({
    msgType: "a2a-agent-chat",
    jobId: "job-123",
    sender: {
      role: "USER",
      agentId: 7001
    }
  });

  assert.equal(extractPeerAgentId(prompt), "7001");
});

test("Terra A2A responder targets the current canonical XMTP session", () => {
  const args = buildSendArgs(
    {
      OKX_A2A_CURRENT_SESSION_KEY: "job:job-123:my:5105:to:7001",
      OKX_A2A_CURRENT_MESSAGE_ID: "message-456"
    },
    "compare two properties",
    "Terra reply"
  );

  assert.deepEqual(args, [
    "xmtp-send",
    "--session-key",
    "job:job-123:my:5105:to:7001",
    "--message",
    "Terra reply",
    "--reply-to",
    "message-456",
    "--json"
  ]);
});

test("Terra A2A responder sends before emitting a valid Codex session", () => {
  const calls = [];
  const result = runResponder({
    prompt: JSON.stringify({
      sender: {
        agentId: "7001"
      }
    }),
    env: {
      OKX_A2A_CURRENT_JOB_ID: "job-123",
      OKX_A2A_CURRENT_AGENT_ID: "5105",
      OKX_A2A_CURRENT_MESSAGE_ID: "message-456"
    },
    spawn(command, args) {
      calls.push({ command, args });
      return {
        status: 0,
        stdout: JSON.stringify({
          ok: true,
          messageId: "outbound-789"
        }),
        stderr: ""
      };
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "okx-a2a");
  assert.deepEqual(calls[0].args.slice(0, 6), [
    "xmtp-send",
    "--job-id",
    "job-123",
    "--to-agent-id",
    "7001",
    "--message"
  ]);
  assert.equal(result.delivery.sent, true);
  assert.equal(result.events[0].type, "thread.started");
  assert.equal(result.events[1].item.type, "agent_message");
});
