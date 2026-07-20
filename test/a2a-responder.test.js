const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  buildReply,
  buildSendArgs,
  checkReplyEligibility,
  decodePaymentChallenge,
  extractMessageContent,
  extractPeerAgentId,
  parseCompareRequest,
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

test("Terra A2A responder extracts a structured Compare request", () => {
  const content = JSON.stringify({
    service: "Compare",
    properties: [
      {
        name: "Maple Court",
        price: 120000,
        currency: "USD",
        sizeSqm: 95,
        location: "Lagos"
      },
      {
        name: "Riverside Flat",
        price: 135000,
        currency: "USD",
        sizeSqm: 110,
        location: "Abuja"
      }
    ],
    userPreferences: {
      purpose: "primary_home"
    }
  });
  const prompt = JSON.stringify({
    msgType: "a2a-agent-chat",
    jobId: "job-compare",
    sender: { role: "USER", agentId: 6782 },
    message: { content }
  });

  assert.equal(extractMessageContent(prompt), content);
  assert.deepEqual(parseCompareRequest(prompt), {
    properties: JSON.parse(content).properties,
    userPreferences: {
      purpose: "primary_home"
    }
  });
});

test("Terra A2A responder decodes the exact x402 challenge", () => {
  const challenge = {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:196",
        asset: "0xtoken",
        amount: "500000",
        payTo: "0xrecipient"
      }
    ]
  };

  assert.deepEqual(
    decodePaymentChallenge(Buffer.from(JSON.stringify(challenge)).toString("base64")),
    challenge
  );
});

test("Terra A2A responder parses the CLI-safe Compare wire format", () => {
  assert.deepEqual(
    parseCompareRequest(
      "Compare|Maple_Court_Apartment|120000|USD|95|Lagos_Nigeria|2;Riverside_Flat|135000|USD|110|Abuja_Nigeria|3"
    ),
    {
      properties: [
        {
          name: "Maple Court Apartment",
          price: 120000,
          currency: "USD",
          sizeSqm: 95,
          location: "Lagos Nigeria",
          bedrooms: 2,
          propertyType: "apartment"
        },
        {
          name: "Riverside Flat",
          price: 135000,
          currency: "USD",
          sizeSqm: 110,
          location: "Abuja Nigeria",
          bedrooms: 3,
          propertyType: "apartment"
        }
      ],
      userPreferences: {
        purpose: "primary_home",
        currency: "USD",
        priorities: {
          price: 5,
          size: 4,
          location: 3
        }
      }
    }
  );
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

test("Terra A2A responder calls Compare and stores a 402 challenge before replying", (t) => {
  const taskHome = fs.mkdtempSync(path.join(os.tmpdir(), "terra-a2a-test-"));
  t.after(() => fs.rmSync(taskHome, { recursive: true, force: true }));
  const challenge = {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:196",
        asset: "0xtoken",
        amount: "500000",
        payTo: "0xrecipient"
      }
    ]
  };
  const rawChallenge = Buffer.from(JSON.stringify(challenge)).toString("base64");
  const calls = [];
  const prompt = JSON.stringify({
    msgType: "a2a-agent-chat",
    jobId: "job-compare",
    groupId: "group-compare",
    sender: { role: "USER", agentId: 6782 },
    message: {
      content: JSON.stringify({
        service: "Compare",
        properties: [
          { name: "Maple Court", price: 120000, sizeSqm: 95, location: "Lagos" },
          { name: "Riverside Flat", price: 135000, sizeSqm: 110, location: "Abuja" }
        ]
      })
    }
  });

  const result = runResponder({
    prompt,
    env: {
      OKX_AGENT_TASK_HOME: taskHome,
      OKX_A2A_CURRENT_SESSION_KEY: "job:job-compare:my:5105:to:6782",
      OKX_A2A_CURRENT_JOB_ID: "job-compare",
      OKX_A2A_CURRENT_AGENT_ID: "5105",
      OKX_A2A_CURRENT_MESSAGE_ID: "message-compare"
    },
    spawn(command, args) {
      calls.push({ command, args });
      if (command === "curl.exe") {
        return {
          status: 0,
          stdout: [
            "HTTP/1.1 402 Payment Required",
            `PAYMENT-REQUIRED: ${rawChallenge}`,
            "content-type: application/json",
            "",
            JSON.stringify({ error: "Payment Required" })
          ].join("\r\n"),
          stderr: ""
        };
      }
      return {
        status: 0,
        stdout: JSON.stringify({ ok: true, messageId: "challenge-reply" }),
        stderr: ""
      };
    }
  });

  assert.deepEqual(
    calls.map((call) => call.command),
    ["curl.exe", "okx-a2a"]
  );
  assert.match(result.reply, /payment is required/i);
  assert.equal(result.payment.status, "challenge");
  assert.equal(result.payment.challenge.amount, "500000");
  assert.equal(
    fs.readdirSync(path.join(taskHome, "terra-compare-payments")).length,
    1
  );
});

test("Terra A2A responder does not call Compare when dispatched for tester", () => {
  const calls = [];
  const result = runResponder({
    prompt: JSON.stringify({
      jobId: "job-compare",
      sender: { agentId: "5105" },
      message: {
        content: JSON.stringify({
          properties: [{ name: "A" }, { name: "B" }]
        })
      }
    }),
    env: {
      OKX_A2A_CURRENT_SESSION_KEY: "job:job-compare:my:6782:to:5105",
      OKX_A2A_CURRENT_AGENT_ID: "6782"
    },
    spawn(command) {
      calls.push(command);
      throw new Error("spawn should not run");
    }
  });

  assert.deepEqual(calls, []);
  assert.equal(result.delivery.sent, false);
});

test("Terra A2A responder reports a failed confirmed payment without replaying Compare", (t) => {
  const taskHome = fs.mkdtempSync(path.join(os.tmpdir(), "terra-a2a-payment-"));
  t.after(() => fs.rmSync(taskHome, { recursive: true, force: true }));
  const rawChallenge = Buffer.from(
    JSON.stringify({
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:196",
          asset: "0xtoken",
          amount: "500000",
          payTo: "0xrecipient"
        }
      ]
    })
  ).toString("base64");
  const env = {
    OKX_AGENT_TASK_HOME: taskHome,
    OKX_A2A_CURRENT_SESSION_KEY: "job:job-payment:my:5105:to:6782",
    OKX_A2A_CURRENT_JOB_ID: "job-payment",
    OKX_A2A_CURRENT_AGENT_ID: "5105",
    OKX_A2A_CURRENT_MESSAGE_ID: "message-request"
  };
  const requestPrompt = JSON.stringify({
    jobId: "job-payment",
    sender: { agentId: 6782 },
    message: {
      content: JSON.stringify({
        properties: [
          { name: "Maple Court", price: 120000, sizeSqm: 95, location: "Lagos" },
          { name: "Riverside Flat", price: 135000, sizeSqm: 110, location: "Abuja" }
        ]
      })
    }
  });

  runResponder({
    prompt: requestPrompt,
    env,
    spawn(command) {
      if (command === "curl.exe") {
        return {
          status: 0,
          stdout: [
            "HTTP/1.1 402 Payment Required",
            `PAYMENT-REQUIRED: ${rawChallenge}`,
            "",
            ""
          ].join("\r\n"),
          stderr: ""
        };
      }
      return {
        status: 0,
        stdout: JSON.stringify({ ok: true, messageId: "challenge-reply" }),
        stderr: ""
      };
    }
  });

  const commands = [];
  const confirmation = runResponder({
    prompt: JSON.stringify({
      jobId: "job-payment",
      sender: { agentId: 6782 },
      message: { content: "confirm payment" }
    }),
    env: {
      ...env,
      OKX_A2A_CURRENT_MESSAGE_ID: "message-confirm"
    },
    spawn(command) {
      commands.push(command);
      if (command === "onchainos") {
        return {
          status: 1,
          stdout: "",
          stderr: "insufficient USDT balance"
        };
      }
      return {
        status: 0,
        stdout: JSON.stringify({ ok: true, messageId: "failure-reply" }),
        stderr: ""
      };
    }
  });

  assert.deepEqual(commands, ["onchainos", "okx-a2a"]);
  assert.equal(confirmation.payment.status, "failed");
  assert.match(confirmation.reply, /insufficient USDT balance/);
  assert.equal(
    fs.readdirSync(path.join(taskHome, "terra-compare-payments")).length,
    0
  );
});

test("Terra A2A responder preserves an insufficient-balance rejection from paid replay", (t) => {
  const taskHome = fs.mkdtempSync(path.join(os.tmpdir(), "terra-a2a-replay-"));
  t.after(() => fs.rmSync(taskHome, { recursive: true, force: true }));
  const challenge = {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:196",
        asset: "0xtoken",
        amount: "500000",
        payTo: "0xrecipient"
      }
    ]
  };
  const rawChallenge = Buffer.from(JSON.stringify(challenge)).toString("base64");
  const rejectedChallenge = Buffer.from(
    JSON.stringify({
      ...challenge,
      error: "invalid_exact_evm_insufficient_balance"
    })
  ).toString("base64");
  const env = {
    OKX_AGENT_TASK_HOME: taskHome,
    OKX_A2A_CURRENT_SESSION_KEY: "job:job-replay:my:5105:to:6782",
    OKX_A2A_CURRENT_JOB_ID: "job-replay",
    OKX_A2A_CURRENT_AGENT_ID: "5105",
    OKX_A2A_CURRENT_MESSAGE_ID: "message-request"
  };
  const requestPrompt = JSON.stringify({
    jobId: "job-replay",
    sender: { agentId: 6782 },
    message: {
      content: JSON.stringify({
        properties: [
          { name: "Maple Court", price: 120000, sizeSqm: 95, location: "Lagos" },
          { name: "Riverside Flat", price: 135000, sizeSqm: 110, location: "Abuja" }
        ]
      })
    }
  });

  runResponder({
    prompt: requestPrompt,
    env,
    spawn(command) {
      if (command === "curl.exe") {
        return {
          status: 0,
          stdout: [
            "HTTP/1.1 402 Payment Required",
            `PAYMENT-REQUIRED: ${rawChallenge}`,
            "",
            "{}"
          ].join("\r\n"),
          stderr: ""
        };
      }
      return {
        status: 0,
        stdout: JSON.stringify({ ok: true, messageId: "challenge-reply" }),
        stderr: ""
      };
    }
  });

  let curlCount = 0;
  const confirmation = runResponder({
    prompt: JSON.stringify({
      jobId: "job-replay",
      sender: { agentId: 6782 },
      message: { content: "confirm_payment" }
    }),
    env: {
      ...env,
      OKX_A2A_CURRENT_MESSAGE_ID: "message-confirm"
    },
    spawn(command) {
      if (command === "onchainos") {
        return {
          status: 0,
          stdout: JSON.stringify({
            ok: true,
            data: {
              header_name: "PAYMENT-SIGNATURE",
              authorization_header: "signed-payment"
            }
          }),
          stderr: ""
        };
      }
      if (command === "curl.exe") {
        curlCount += 1;
        return {
          status: 0,
          stdout: [
            "HTTP/1.1 402 Payment Required",
            `PAYMENT-REQUIRED: ${rejectedChallenge}`,
            "",
            "{}"
          ].join("\r\n"),
          stderr: ""
        };
      }
      return {
        status: 0,
        stdout: JSON.stringify({ ok: true, messageId: "failure-reply" }),
        stderr: ""
      };
    }
  });

  assert.equal(curlCount, 1);
  assert.equal(confirmation.payment.status, "replay_failed");
  assert.match(confirmation.reply, /Insufficient token balance/);
  assert.doesNotMatch(confirmation.reply, /Payment result: \{\}/);
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
