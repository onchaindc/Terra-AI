const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

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

function findMessageContent(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (typeof value.content === "string") {
    return value.content;
  }

  for (const child of Object.values(value)) {
    const found = findMessageContent(child);
    if (found) {
      return found;
    }
  }

  return null;
}

function extractMessageContent(prompt) {
  const parsed = tryParseJson(prompt);
  return findMessageContent(parsed) || String(prompt || "");
}

function findEnvelopeField(value, fieldName) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (value[fieldName] !== undefined && value[fieldName] !== null) {
    return value[fieldName];
  }

  for (const child of Object.values(value)) {
    const found = findEnvelopeField(child, fieldName);
    if (found !== null && found !== undefined) {
      return found;
    }
  }

  return null;
}

function extractJobId(prompt, env = process.env) {
  const parsed = tryParseJson(prompt);
  return String(
    env.OKX_A2A_CURRENT_JOB_ID ||
      env.OKX_AGENT_TASK_CURRENT_JOB_ID ||
      findEnvelopeField(parsed, "jobId") ||
      ""
  );
}

function extractGroupId(prompt) {
  const parsed = tryParseJson(prompt);
  return String(findEnvelopeField(parsed, "groupId") || "");
}

function parseCompareRequest(prompt) {
  const content = extractMessageContent(prompt);
  const parsedContent = tryParseJson(content);
  const candidate =
    parsedContent?.compareRequest ||
    parsedContent?.request ||
    (Array.isArray(parsedContent?.properties) ? parsedContent : null);

  if (
    candidate &&
    Array.isArray(candidate.properties) &&
    candidate.properties.length >= 2
  ) {
    return {
      properties: candidate.properties.slice(0, 5),
      userPreferences: candidate.userPreferences || candidate.preferences || {}
    };
  }

  const delimitedMatch = /^Compare\|(.+)$/i.exec(content.trim());
  if (delimitedMatch) {
    const properties = delimitedMatch[1]
      .split(";")
      .map((item) => item.split("|"))
      .filter((fields) => fields.length >= 6)
      .map(([name, price, currency, sizeSqm, location, bedrooms]) => ({
        name: name.replaceAll("_", " "),
        price: Number(price),
        currency,
        sizeSqm: Number(sizeSqm),
        location: location.replaceAll("_", " "),
        bedrooms: Number(bedrooms),
        propertyType: "apartment"
      }));

    if (
      properties.length >= 2 &&
      properties.every(
        (property) =>
          property.name &&
          Number.isFinite(property.price) &&
          property.currency &&
          Number.isFinite(property.sizeSqm) &&
          property.location
      )
    ) {
      return {
        properties: properties.slice(0, 5),
        userPreferences: {
          purpose: "primary_home",
          currency: properties[0].currency,
          priorities: {
            price: 5,
            size: 4,
            location: 3
          }
        }
      };
    }
  }

  return null;
}

function isPaymentConfirmation(prompt) {
  const normalized = extractMessageContent(prompt)
    .trim()
    .toLowerCase()
    .replaceAll("_", " ");
  return /^(yes|y|confirm|confirmed|proceed|proceed with payment|confirm payment|pay)$/.test(
    normalized
  );
}

function pendingPaymentPath(env, prompt) {
  const taskHome = env.OKX_AGENT_TASK_HOME || path.join(process.cwd(), ".terra-a2a");
  const key = stableId(
    `${extractJobId(prompt, env)}:${env.OKX_A2A_CURRENT_SESSION_KEY || ""}`,
    "pending-payment"
  );
  return path.join(taskHome, "terra-compare-payments", `${key}.json`);
}

function writePendingPayment(env, prompt, pending) {
  const filePath = pendingPaymentPath(env, prompt);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(pending, null, 2), "utf8");
  return filePath;
}

function readPendingPayment(env, prompt) {
  const filePath = pendingPaymentPath(env, prompt);
  try {
    return {
      filePath,
      value: JSON.parse(fs.readFileSync(filePath, "utf8"))
    };
  } catch {
    return { filePath, value: null };
  }
}

function removePendingPayment(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // A stale state file should not prevent the reply from being delivered.
  }
}

function parseHttpResponse(output) {
  const text = String(output || "");
  const blocks = text.split(/\r?\n\r?\n/);
  const headerBlock = blocks.findLast((block) => /^HTTP\/\d(?:\.\d)?\s+\d+/i.test(block));
  if (!headerBlock) {
    throw new Error(`Compare API returned an unparseable response: ${text.slice(0, 500)}`);
  }

  const headerLines = headerBlock.split(/\r?\n/);
  const statusMatch = /^HTTP\/\d(?:\.\d)?\s+(\d+)/i.exec(headerLines.shift());
  const headers = {};
  for (const line of headerLines) {
    const separator = line.indexOf(":");
    if (separator > 0) {
      headers[line.slice(0, separator).trim().toLowerCase()] = line
        .slice(separator + 1)
        .trim();
    }
  }

  const body = blocks[blocks.indexOf(headerBlock) + 1] || "";
  return {
    status: Number(statusMatch?.[1] || 0),
    headers,
    body
  };
}

function decodePaymentChallenge(rawChallenge) {
  if (!rawChallenge) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(rawChallenge, "base64").toString("utf8"));
  } catch {
    try {
      return JSON.parse(Buffer.from(rawChallenge, "base64url").toString("utf8"));
    } catch {
      return null;
    }
  }
}

function formatChallenge(challenge) {
  const option = challenge?.accepts?.[0] || {};
  return {
    x402Version: challenge?.x402Version || null,
    error: challenge?.error || null,
    network: option.network || null,
    asset: option.asset || null,
    amount: option.amount || option.maxAmountRequired || null,
    payTo: option.payTo || null,
    scheme: option.scheme || null
  };
}

function paymentRejectionMessage(response) {
  const rejectedChallenge = decodePaymentChallenge(
    response.headers["payment-required"]
  );
  const reason = rejectedChallenge?.error;

  if (reason === "invalid_exact_evm_insufficient_balance") {
    return "Insufficient token balance for the requested payment.";
  }
  if (reason === "permit2_insufficient_balance") {
    return "Insufficient token balance for the requested Permit2 payment.";
  }
  if (reason === "erc20_approval_insufficient_eth_for_gas") {
    return "Insufficient native-token balance to pay gas for token approval.";
  }
  if (reason) {
    return reason;
  }

  const body = String(response.body || "").trim();
  return body && body !== "{}"
    ? body
    : `Payment verification was rejected with HTTP ${response.status}.`;
}

function invokeCompareApi({ env, prompt, requestBody, paymentHeader, spawn }) {
  const apiUrl =
    env.TERRA_COMPARE_API_URL ||
    "https://terra-ai.up.railway.app/api/v1/compare";
  const curlCommand =
    env.TERRA_COMPARE_CURL_COMMAND ||
    (process.platform === "win32" ? "curl.exe" : "curl");
  const args = [
    "-sS",
    "-i",
    "-X",
    "POST",
    apiUrl,
    "-H",
    "Content-Type: application/json"
  ];

  if (paymentHeader) {
    args.push("-H", paymentHeader);
  }
  args.push("--data-binary", JSON.stringify(requestBody));

  console.error(
    `[terra-a2a] compare API request jobId=${extractJobId(prompt, env)} groupId=${extractGroupId(prompt)} url=${apiUrl} paymentHeader=${Boolean(paymentHeader)}`
  );
  const result = spawn(curlCommand, args, {
    encoding: "utf8",
    env,
    timeout: Number(env.TERRA_A2A_API_TIMEOUT_MS) || 45000,
    windowsHide: true
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Terra Compare API request failed with exit code ${result.status}: ${String(
        result.stderr || result.stdout || ""
      ).trim()}`
    );
  }

  const response = parseHttpResponse(result.stdout);
  console.error(
    `[terra-a2a] compare API response jobId=${extractJobId(prompt, env)} status=${response.status} paymentRequired=${Boolean(response.headers["payment-required"])}`
  );
  return {
    ...response,
    apiUrl,
    requestBody
  };
}

function parseCompareAnalysis(response) {
  let payload = null;
  try {
    payload = JSON.parse(response.body);
  } catch {
    return null;
  }

  const data = payload?.data;
  if (!data) {
    return null;
  }

  const ranking = (data.ranking || [])
    .map(
      (item) =>
        `#${item.rank} ${item.propertyName} (${item.overallScore}/100): ${item.keyReason}`
    )
    .join("\n");
  const recommendation = data.recommendation;

  return [
    "Terra Compare analysis:",
    data.summary?.recommendationHeadline || "The comparison is complete.",
    ranking,
    recommendation
      ? `Recommendation: ${recommendation.recommendedPropertyName} (${recommendation.score}/100). ${recommendation.reasoning?.[0] || ""}`
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCompareChallengeReply(challenge) {
  const details = formatChallenge(challenge);
  return [
    "Terra Compare reached the paid comparison endpoint, and payment is required before analysis can run.",
    `Network: ${details.network || "unknown"}`,
    `Token/asset: ${details.asset || "unknown"}`,
    `Amount (atomic units): ${details.amount || "unknown"}`,
    `Pay to: ${details.payTo || "unknown"}`,
    'Reply "confirm payment" in this job to continue.'
  ].join("\n");
}

function buildPaymentFailureReply(errorText) {
  return [
    "Terra Compare could not complete payment, so no property analysis was generated.",
    `Payment result: ${errorText || "insufficient funds or payment unavailable"}`,
    "No comparison charge was confirmed as settled."
  ].join("\n");
}

function runCompareFlow({ env, prompt, spawn }) {
  if (isPaymentConfirmation(prompt)) {
    const pending = readPendingPayment(env, prompt);
    if (!pending.value) {
      return null;
    }

    console.error(
      `[terra-a2a] payment confirmation received jobId=${extractJobId(prompt, env)} challengeFile=${pending.filePath}`
    );
    const paymentCommand =
      env.TERRA_A2A_PAYMENT_COMMAND || "onchainos";
    const paymentArgs = [
      "payment",
      "pay",
      "--payload",
      pending.value.rawChallenge
    ];
    const paymentResult = spawn(paymentCommand, paymentArgs, {
      encoding: "utf8",
      env,
      timeout: Number(env.TERRA_A2A_PAYMENT_TIMEOUT_MS) || 90000,
      windowsHide: true
    });

    if (
      paymentResult.error ||
      paymentResult.status !== 0 ||
      !String(paymentResult.stdout || "").trim()
    ) {
      const failure = String(
        paymentResult.stderr || paymentResult.stdout || paymentResult.error || "payment command failed"
      ).trim();
      console.error(
        `[terra-a2a] payment command failed jobId=${extractJobId(prompt, env)} result=${failure}`
      );
      removePendingPayment(pending.filePath);
      return {
        reply: buildPaymentFailureReply(failure),
        payment: { status: "failed", error: failure }
      };
    }

    let paymentOutput;
    try {
      paymentOutput = JSON.parse(paymentResult.stdout);
    } catch {
      paymentOutput = null;
    }

    const authorization = paymentOutput?.data || paymentOutput;
    const authorizationHeader = authorization?.authorization_header;
    const headerName = authorization?.header_name || "PAYMENT-SIGNATURE";
    if (!authorizationHeader) {
      const failure = String(
        paymentOutput?.error ||
          authorization?.error ||
          paymentResult.stderr ||
          "payment authorization was not returned"
      ).trim();
      console.error(
        `[terra-a2a] payment authorization missing jobId=${extractJobId(prompt, env)} result=${failure}`
      );
      removePendingPayment(pending.filePath);
      return {
        reply: buildPaymentFailureReply(failure),
        payment: { status: "failed", error: failure }
      };
    }

    const replay = invokeCompareApi({
      env,
      prompt,
      requestBody: pending.value.requestBody,
      paymentHeader: `${headerName}: ${authorizationHeader}`,
      spawn
    });
    const analysis = parseCompareAnalysis(replay);
    const rejection = replay.status === 200 ? null : paymentRejectionMessage(replay);
    console.error(
      `[terra-a2a] compare replay jobId=${extractJobId(prompt, env)} status=${replay.status} analysis=${Boolean(analysis)} rejection=${JSON.stringify(rejection)} transactionReference=${authorization.transaction_hash || authorization.payment_id || "none"}`
    );
    removePendingPayment(pending.filePath);

    if (replay.status !== 200 || !analysis) {
      return {
        reply: buildPaymentFailureReply(rejection),
        payment: {
          status: "replay_failed",
          authorization
        }
      };
    }

    return {
      reply: analysis,
      payment: {
        status: "settled_or_accepted",
        authorization
      }
    };
  }

  const requestBody = parseCompareRequest(prompt);
  if (!requestBody) {
    return null;
  }

  const response = invokeCompareApi({
    env,
    prompt,
    requestBody,
    spawn
  });

  if (response.status === 402 && response.headers["payment-required"]) {
    const challenge = decodePaymentChallenge(response.headers["payment-required"]);
    const pending = {
      jobId: extractJobId(prompt, env),
      groupId: extractGroupId(prompt),
      rawChallenge: response.headers["payment-required"],
      challenge: formatChallenge(challenge),
      requestBody,
      apiUrl: response.apiUrl,
      receivedAt: new Date().toISOString()
    };
    const filePath = writePendingPayment(env, prompt, pending);
    console.error(
      `[terra-a2a] payment challenge stored jobId=${pending.jobId} groupId=${pending.groupId} file=${filePath} challenge=${JSON.stringify(pending.challenge)}`
    );
    return {
      reply: buildCompareChallengeReply(challenge),
      payment: { status: "challenge", challenge: pending.challenge }
    };
  }

  const analysis = parseCompareAnalysis(response);
  return {
    reply:
      analysis ||
      `Terra Compare returned HTTP ${response.status}: ${response.body || "no response body"}`,
    payment: { status: response.status === 200 ? "not_required" : "request_failed" }
  };
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
  const eligibility = checkReplyEligibility(env, prompt);
  const compareFlow = eligibility.eligible
    ? runCompareFlow({ env, prompt, spawn })
    : null;
  const reply = compareFlow?.reply || buildReply(prompt);
  const delivery = sendReply({ env, prompt, reply, spawn });
  const itemId = stableId(
    `${sessionId}:${env.OKX_A2A_CURRENT_MESSAGE_ID || prompt}`,
    "terra-message"
  );

  return {
    sessionId,
    reply,
    payment: compareFlow?.payment || null,
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
  decodePaymentChallenge,
  extractJobId,
  extractMessageContent,
  extractPeerAgentId,
  formatChallenge,
  parseCompareRequest,
  parseCanonicalSessionKey,
  parseHttpResponse,
  providerHealth,
  runCompareFlow,
  runResponder,
  sendReply,
  stableId
};
