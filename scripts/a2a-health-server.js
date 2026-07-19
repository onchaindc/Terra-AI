const http = require("node:http");
const { buildReply, providerHealth } = require("../src/a2a/responder");

const port = Number(process.env.PORT) || 8080;

const server = http.createServer((request, response) => {
  response.setHeader("content-type", "application/json; charset=utf-8");

  if (request.method === "GET" && request.url === "/health") {
    response.end(
      JSON.stringify({
        ...providerHealth(process.env),
        timestamp: new Date().toISOString()
      })
    );
    return;
  }

  if (request.method === "POST" && request.url === "/probe") {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      let prompt = "I would like to use the services of agent ID 5105";
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        if (typeof body.prompt === "string" && body.prompt.trim()) {
          prompt = body.prompt;
        }
      } catch {
        response.statusCode = 400;
        response.end(JSON.stringify({ ok: false, error: "Invalid JSON body" }));
        return;
      }

      response.end(
        JSON.stringify({
          ok: true,
          reply: buildReply(prompt)
        })
      );
    });
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ ok: false, error: "Not found" }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[terra-a2a] Health server listening on port ${port}`);
});
