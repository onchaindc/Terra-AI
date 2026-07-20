const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildReply,
  buildSendArgs,
  checkReplyEligibility,
  extractPeerAgentId,
  providerHealth,
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

test("Terra A2A responder ignores messages dispatched for another local agent", () => {
  assert.deepEqual(
    checkReplyEligibility(
      {
        OKX_A2A_CURRENT_SESSION_KEY: "job:job-123:my:6782:to:5105",
        OKX_A2A_CURRENT_AGENT_ID: "6782"
      },
      JSON.stringify({
        sender: {
          agentId: "5105"
        }
      })
    ),
    {
      eligible: false,
      reason: "current_agent_is_not_terra:6782"
    }
  );
});

test("Terra A2A responder does not answer messages sent by Terra itself", () => {
  assert.deepEqual(
    checkReplyEligibility(
      {
        OKX_A2A_CURRENT_SESSION_KEY: "job:job-123:my:5105:to:5105",
        OKX_A2A_CURRENT_AGENT_ID: "5105"
      },
      JSON.stringify({
        sender: {
          agentId: "5105"
        }
      })
    ),
    {
      eligible: false,
      reason: "sender_is_terra"
    }
  );
});

test("Terra A2A responder skips XMTP delivery when the current agent is tester", () => {
  let spawned = false;
  const result = runResponder({
    prompt: JSON.stringify({
      sender: {
        agentId: "5105"
      }
    }),
    env: {
      OKX_A2A_CURRENT_SESSION_KEY: "job:job-123:my:6782:to:5105",
      OKX_A2A_CURRENT_AGENT_ID: "6782"
    },
    spawn() {
      spawned = true;
      throw new Error("spawn should not run");
    }
  });

  assert.equal(spawned, false);
  assert.deepEqual(result.delivery, {
    sent: false,
    reason: "current_agent_is_not_terra:6782"
  });
});

test("Terra A2A provider health confirms the custom adapter configuration", () => {
  assert.deepEqual(
    providerHealth({
      OKX_A2A_AI_CODEX_COMMAND: "/usr/local/bin/node",
      OKX_A2A_AI_CODEX_EXEC_ARGS_JSON: "[configured]",
      OKX_A2A_AI_CODEX_RESUME_ARGS_JSON: "[configured]",
      OKX_AGENT_TASK_HOME: "/data/okx-agent-task"
    }),
    {
      ok: true,
      service: "Terra AI A2A responder",
      agentId: "5105",
      providerCommand: "/usr/local/bin/node",
      execArgsConfigured: true,
      resumeArgsConfigured: true,
      taskHome: "/data/okx-agent-task"
    }
  );
});
