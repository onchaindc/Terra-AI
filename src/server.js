require("dotenv").config();

const createApp = require("./app");
const x402Middleware = require("./middleware/x402");

const app = createApp();
const PORT = Number(process.env.PORT) || 3000;
let server;

async function start() {
  await x402Middleware.initializeX402();

  server = app.listen(PORT, () => {
    console.log(`Terra Compare is running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Compare endpoint: http://localhost:${PORT}/api/v1/compare`);
    console.log(
      `x402 readiness: ${JSON.stringify(x402Middleware.getX402Status())}`
    );
  });
}

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
  if (!server) process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

start().catch((error) => {
  console.error("Terra Compare startup failed:", error);
  process.exit(1);
});
