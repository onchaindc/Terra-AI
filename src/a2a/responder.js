const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");

const SERVICE_MENU = [
  "Terra AI is online and ready.",
  "",
  "Choose one of these property decision services:",
  "1. Terra Compare - compare two or more properties and rank the tradeoffs.",
  "2. Hidden Costs - estimate commonly overlooked acquisition and ownership costs.",
  "3. Investment Check - evaluate yield assumptions, recurring costs, and investment risks.",
  "4. Buyer Fit - score how well a property matches a buyer's budget, needs, and priorities.",
  "",
  "Reply with the service name or number and the property details you already have."
].join("\n");

const TERRA_AGENT_ID = "5105";

function stableId(value, prefix) {
  const digest = createHash("sha256")
    .update(String(value || "terra-ai"))
    .digest("hex")
    .slice(0, 24);
  return `${prefix}-${digest}`;
}

function tryParseJson(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function findPeerAgentId(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (
    value.sender &&
    typeof value.sender === "object" &&
    value.sender.agentId !== undefined
  ) {
    return String(value.sender.agentId);
  }

  for (const child of Object.values(value)) {
    const found = findPeerAgentId(child);
    if (found) {
      return found;
    }
  }

  return null;
}

function extractPeerAgentId(prompt) {
  const parsed = tryParseJson(prompt);
  const parsedAgentId = findPeerAgentId(parsed);
  if (parsedAgentId) {
    return parsedAgentId;
  }

  const senderMatch =
    /"sender"\s*:\s*\{[\s\S]{0,500}?"agentId"\s*:\s*"?(\d+)"?/i.exec(
      String(prompt || "")
    );
  return senderMatch?.[1] || null;
}

function buildReply(prompt) {
  const normalized = String(prompt || "").toLowerCase();

  if (
    normalized.includes("investment") ||
    normalized.includes("yield") ||
    normalized.includes("rental")
  ) {
    return [
      "Terra AI is online. I can run an Investment Check.",
      "Please provide the property location, purchase price, expected rent, recurring costs, expected occupancy, financing details if any, and investment horizon. I will evaluate the assumptions, returns, and main risks."
    ].join("\n");
  }

  if (
    normalized.includes("hidden cost") ||
    normalized.includes("closing cost") ||
    normalized.includes("extra cost")
  ) {
    return [
      "Terra AI is online. I can estimate Hidden Costs.",
      "Please provide the property location, purchase price, property type, whether it is new or resale, and whether financing is involved. I will identify likely acquisition, transaction, financing, maintenance, and ownership costs without inventing local figures."
    ].join("\n");
  }

  if (
    normalized.includes("buyer fit") ||
    normalized.includes("suitable") ||
    normalized.includes("match my needs")
  ) {
    return [
      "Terra AI is online. I can run a Buyer Fit assessment.",
      "Please provide your total budget, preferred location, intended use, property requirements, timeline, and top priorities. I will score the fit and explain the tradeoffs."
    ].join("\n");
  }

  if (
    normalized.includes("compare") ||
    normalized.includes("versus") ||
    normalized.includes(" vs ")
  ) {
    return [
      "Terra AI is online. I can compare the properties.",
      "Please provide at least two options with location, purchase price, property type, size if known, intended use, and your priorities. I will rank them and explain the tradeoffs."
    ].join("\n");
  }

  return SERVICE_MENU;
}

function parseCanonicalSessionKey(sessionKey) {
  const match = /^job:([^:]+):my:([^:]*):to:(.+)$/.exec(
    String(sessionKey || "")
  );
  if (!match) {
    return null;
  }

  return {
    jobId: decodeURIComponent(match[1]),
    myAgentId: decodeURIComponent(match[2]),
    toAgentId: decodeURIComponent(match[3])
  };
}

function buildSendArgs(env, prompt, reply) {
  const sessionKey = env.OKX_A2A_CURRENT_SESSION_KEY || "";
  const canonicalSession = parseCanonicalSessionKey(sessionKey);
  const jobId =
    env.OKX_A2A_CURRENT_JOB_ID ||
    env.OKX_AGENT_TASK_CURRENT_JOB_ID ||
    canonicalSession?.jobId ||
    "";
  const peerAgentId =
    canonicalSession?.toAgentId || extractPeerAgentId(prompt) || "";

  if (!jobId) {
    return null;
  }

  const args = ["xmtp-send"];
  if (canonicalSession) {
    args.push("--session-key", sessionKey);
  } else if (peerAgentId) {
    args.push("--job-id", jobId, "--to-agent-id", peerAgentId);
  } else {
    throw new Error(
      "Terra A2A responder could not determine the peer agent for the current job."
    );
  }

  args.push("--message", reply);

  const messageId =
    env.OKX_A2A_CURRENT_MESSAGE_ID ||
    env.OKX_AGENT_TASK_CURRENT_MESSAGE_ID ||
    "";
  if (messageId) {
    args.push("--reply-to", messageId);
  }

  const sessionAgentId = env.OKX_AGENT_TASK_CURRENT_SESSION_AGENT_ID || "";
  if (sessionAgentId) {
    args.push("--session-agent-id", sessionAgentId);
  }

  args.push("--json");
  return args;
}

function checkReplyEligibility(env, prompt) {
  const canonicalSession = parseCanonicalSessionKey(
    env.OKX_A2A_CURRENT_SESSION_KEY || ""
  );
  const currentAgentId =
    env.OKX_A2A_CURRENT_AGENT_ID ||
    env.OKX_AGENT_TASK_CURRENT_SESSION_AGENT_ID ||
    canonicalSession?.myAgentId ||
    "";
  const senderAgentId = extractPeerAgentId(prompt);

  if (String(currentAgentId) !== TERRA_AGENT_ID) {
    return {
      eligible: false,
      reason: `current_agent_is_not_terra:${currentAgentId || "unknown"}`
    };
  }

  if (String(senderAgentId || "") === TERRA_AGENT_ID) {
    return {
      eligible: false,
      reason: "sender_is_terra"
    };
  }

  return { eligible: true };
}

function sendReply({ env, prompt, reply, spawn = spawnSync }) {
  const eligibility = checkReplyEligibility(env, prompt);
  if (!eligibility.eligible) {
    return { sent: false, reason: eligibility.reason };
  }

  const args = buildSendArgs(env, prompt, reply);
  if (!args) {
    return { sent: false, reason: "no_active_a2a_job" };
  }

  const timeoutMs = Number(env.TERRA_A2A_SEND_TIMEOUT_MS) || 45000;
  const result = spawn("okx-a2a", args, {
    encoding: "utf8",
    env,
    timeout: timeoutMs,
    windowsHide: true
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `okx-a2a xmtp-send failed with exit code ${result.status}: ${String(
        result.stderr || result.stdout || ""
      ).trim()}`
    );
  }

  const parsed = tryParseJson(result.stdout);
  if (parsed && parsed.ok === false) {
    throw new Error(
      `okx-a2a xmtp-send did not deliver the reply: ${
        parsed.error || result.stdout
      }`
    );
  }

  return {
    sent: true,
    output: String(result.stdout || "").trim()
  };
}

function runResponder({
  prompt,
  suppliedSessionId,
  env = process.env,
  spawn = spawnSync
}) {
  const sessionSeed =
    suppliedSessionId ||
    env.OKX_AGENT_TASK_AI_SESSION_ID ||
    env.OKX_A2A_CURRENT_SESSION_KEY ||
    prompt;
  const sessionId =
    suppliedSessionId ||
    env.OKX_AGENT_TASK_AI_SESSION_ID ||
    stableId(sessionSeed, "terra-thread");
  const reply = buildReply(prompt);
  const delivery = sendReply({ env, prompt, reply, spawn });
  const itemId = stableId(
    `${sessionId}:${env.OKX_A2A_CURRENT_MESSAGE_ID || prompt}`,
    "terra-message"
  );

  return {
    sessionId,
    reply,
    delivery,
    events: [
      {
        type: "thread.started",
        thread_id: sessionId
      },
      {
        type: "item.completed",
        item: {
          id: itemId,
          type: "agent_message",
          text: reply
        }
      },
      {
        type: "turn.completed",
        usage: {
          input_tokens: 0,
          cached_input_tokens: 0,
          output_tokens: 0
        }
      }
    ]
  };
}

function providerHealth(env = process.env) {
  return {
    ok: true,
    service: "Terra AI A2A responder",
    agentId: "5105",
    providerCommand: env.OKX_A2A_AI_CODEX_COMMAND || null,
    execArgsConfigured: Boolean(env.OKX_A2A_AI_CODEX_EXEC_ARGS_JSON),
    resumeArgsConfigured: Boolean(env.OKX_A2A_AI_CODEX_RESUME_ARGS_JSON),
    taskHome: env.OKX_AGENT_TASK_HOME || null
  };
}

module.exports = {
  SERVICE_MENU,
  buildReply,
  buildSendArgs,
  checkReplyEligibility,
  extractPeerAgentId,
  parseCanonicalSessionKey,
  providerHealth,
  runResponder,
  sendReply,
  stableId
};
