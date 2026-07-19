const { runResponder } = require("../src/a2a/responder");

function main() {
  const prompt = process.argv[2] || "";
  const suppliedSessionId = process.argv[3] || "";
  const result = runResponder({
    prompt,
    suppliedSessionId,
    env: process.env
  });

  if (result.delivery.sent) {
    console.error(`[terra-a2a] XMTP reply delivered: ${result.delivery.output}`);
  } else {
    console.error(
      `[terra-a2a] Provider probe completed without XMTP delivery: ${result.delivery.reason}`
    );
  }

  for (const event of result.events) {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  }
}

try {
  main();
} catch (error) {
  console.error(
    `[terra-a2a] Responder failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exitCode = 1;
}
