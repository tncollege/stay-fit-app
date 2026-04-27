import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MAX_PROMPT_LENGTH = 12_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

app.use(express.json({ limit: "64kb" }));

app.use((req, res, next) => {
  const allowedOrigins = [
    "https://stayfitinlife.com",
    "https://www.stayfitinlife.com",
  ];

  const origin = req.headers.origin;

  if (typeof origin === "string" && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

interface AiChatRequestBody {
  prompt?: unknown;
  jsonMode?: unknown;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function getClientIp(req: Request) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function aiRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = getClientIp(req);
  const now = Date.now();
  const current = rateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      error: "RATE_LIMITED",
      message: "Too many AI requests. Please try again shortly."
    });
  }

  current.count += 1;
  return next();
}

function validateAiChatBody(body: AiChatRequestBody) {
  if (!body || typeof body !== "object") {
    return "Request body is required.";
  }

  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    return "Prompt is required.";
  }

  if (body.prompt.length > MAX_PROMPT_LENGTH) {
    return `Prompt is too long. Maximum length is ${MAX_PROMPT_LENGTH} characters.`;
  }

  if (body.jsonMode !== undefined && typeof body.jsonMode !== "boolean") {
    return "jsonMode must be a boolean.";
  }

  return null;
}

let openai: OpenAI | null = null;

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is missing from environment. Add it to .env.local or your deployment secrets.");
  }

  if (!openai) {
    openai = new OpenAI({ apiKey: key });
  }
  return openai;
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    openai_configured: Boolean(process.env.OPENAI_API_KEY)
  });
});

app.post("/api/ai/chat", aiRateLimit, async (req: Request<unknown, unknown, AiChatRequestBody>, res) => {
  try {
    const validationError = validateAiChatBody(req.body);
    if (validationError) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: validationError });
    }

    const prompt = req.body.prompt!.trim();
    const jsonMode = req.body.jsonMode === true;
    const client = getOpenAI();

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are STAYFITINLIFE's fitness assistant. Provide practical fitness and nutrition guidance. Do not diagnose, treat medical conditions, or recommend unsafe supplement/diet practices. For medical concerns, tell users to consult a qualified clinician."
        },
        { role: "user", content: prompt }
      ],
      response_format: jsonMode ? { type: "json_object" } : { type: "text" },
      temperature: 0.6
    });

    res.json({ content: response.choices[0]?.message?.content ?? "" });
  } catch (error: unknown) {
    const err = error as { message?: string; status?: number };
    console.error("OpenAI Server Error:", err.message || err);

    if (err.message?.includes("OPENAI_API_KEY")) {
      res.status(401).json({ error: "API_KEY_MISSING", message: err.message });
    } else if (err.status === 401) {
      res.status(401).json({ error: "INVALID_API_KEY", message: "The OpenAI API key is invalid or inactive." });
    } else if (err.status === 429) {
      res.status(429).json({ error: "QUOTA_EXCEEDED", message: "OpenAI quota or rate limit exceeded." });
    } else {
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Unable to complete the AI request right now." });
    }
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
