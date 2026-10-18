import "server-only";
import { timingSafeEqual } from "node:crypto";

// Access code + per-IP rate limit for every API route.
// The limiter lives in memory, so each server instance counts separately.
// Pair it with a monthly spend limit in the Anthropic Console.

const hits = new Map<string, number[]>();

const LIMIT = Number(process.env.RATE_LIMIT_REQUESTS || 60);
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MINUTES || 60) * 60_000;

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "local";
}

function codeMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function jsonError(status: number, error: string, code?: string): Response {
  return Response.json({ error, code }, { status });
}

/** Returns an error Response when the request should be rejected, otherwise null. */
export function guard(req: Request, { cost = 1 }: { cost?: number } = {}): Response | null {
  const expected = process.env.ACCESS_CODE;
  if (expected) {
    const given = req.headers.get("x-access-code") || "";
    if (!codeMatches(given, expected)) {
      return jsonError(401, "Enter the access code to use this tool.", "access_code_required");
    }
  }

  if (LIMIT > 0) {
    const ip = clientIp(req);
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
    if (recent.length + cost > LIMIT) {
      const retryMin = Math.ceil((WINDOW_MS - (now - recent[0])) / 60_000);
      return jsonError(
        429,
        `You've hit the usage limit. Try again in about ${retryMin} minute${retryMin === 1 ? "" : "s"}.`,
        "rate_limited",
      );
    }
    for (let i = 0; i < cost; i++) recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 10_000) {
      for (const [key, times] of hits) {
        if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
      }
    }
  }
  return null;
}

export function requireApiKey(): Response | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    return jsonError(
      500,
      "The server has no ANTHROPIC_API_KEY set. Add it to your environment variables and redeploy.",
      "missing_api_key",
    );
  }
  return null;
}
