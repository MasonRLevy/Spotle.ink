import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { checkGeminiApiKey, getModelChain } from "./geminiReferee.js";
import { refereeRouter } from "./refereeRouter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serverRoot, "..");

dotenv.config({ path: path.join(serverRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env") });

const PORT = Number(process.env.REFEREE_TEST_PORT) || 4005;
const publicDir = path.join(__dirname, "public");

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(refereeRouter);
app.use(express.static(publicDir));

// Dev convenience: expose the test fixtures so the workbench can be driven
// without a webcam. The folder is gitignored — run `npm run test:referee:fixtures`
// to populate it. Missing folder is fine, these routes just 404.
app.use("/testdata", express.static(path.join(__dirname, "testdata")));

app.get("/api/referee/health", (_req, res) => {
  const chain = getModelChain();
  res.json({
    ok: Boolean(process.env.GEMINI_API_KEY),
    model: chain[0],
    modelChain: chain,
    objectsEndpoint: "/api/referee/objects",
  });
});

const server = app.listen(PORT, async () => {
  console.log("");
  console.log("  Spotle Gemini Referee Workbench");
  console.log(`  Dashboard:  http://localhost:${PORT}`);
  console.log("  API:        GET  /api/referee/objects");
  console.log("              GET  /api/referee/random-object?category=&exclude=");
  console.log("              POST /api/referee/verify");
  console.log("");

  const health = await checkGeminiApiKey();
  if (health.ok) {
    console.log(`  ${health.message}`);
  } else {
    console.error(`  ${health.message}`);
    console.error("  Object-pool browsing still works; Gemini verify will fail until the key is fixed.");
  }
  console.log("");
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`[gemini-referee] Port ${PORT} is already in use. Stop the other process or set REFEREE_TEST_PORT.`);
  } else {
    console.error("[gemini-referee] Failed to start test server:", error);
  }
  process.exit(1);
});
