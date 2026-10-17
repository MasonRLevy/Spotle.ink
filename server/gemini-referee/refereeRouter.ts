import { Router } from "express";
import {
  getAllObjects,
  getRandomTargetObject,
} from "./objectPool.js";
import { verifyObjectPhotoDetailed } from "./geminiReferee.js";

/**
 * Mount on the main Express app later with:
 *   import { refereeRouter } from "./gemini-referee/index.js";
 *   app.use(refereeRouter);
 */
export const refereeRouter = Router();

refereeRouter.get("/api/referee/objects", (_req, res) => {
  const objects = getAllObjects();
  res.json({
    count: objects.length,
    objects,
  });
});

refereeRouter.get("/api/referee/random-object", (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const difficulty =
    typeof req.query.difficulty === "string" ? req.query.difficulty : undefined;
  const excludeRaw = typeof req.query.exclude === "string" ? req.query.exclude : "";
  const excludeIds = excludeRaw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const object = getRandomTargetObject({ category, difficulty, excludeIds });
  if (!object) {
    res.status(404).json({
      error: "No objects matched the given category/difficulty/exclude filters.",
    });
    return;
  }

  res.json(object);
});

refereeRouter.post("/api/referee/verify", async (req, res) => {
  const { targetObject, imageBase64, playerName } = req.body ?? {};
  const started = Date.now();

  try {
    const { verdict, model, skipped } = await verifyObjectPhotoDetailed({
      targetObject,
      imageBase64,
      playerName,
    });
    res.json({
      ...verdict,
      latencyMs: Date.now() - started,
      model,
      ...(skipped.length ? { skippedModels: skipped } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed";
    res.status(400).json({
      error: message,
      latencyMs: Date.now() - started,
    });
  }
});
