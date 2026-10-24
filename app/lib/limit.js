// Best-effort per-IP rate limiting. In-memory, so it resets when a function instance recycles.
import { HttpError } from "./http.js";

const hits = new Map();

export function rateLimit(req, bucket, max, windowMs) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    throw new HttpError(429, "Too many requests from this network. Wait a few minutes and try again.");
  }
  hits.set(key, [...recent, now]);
}
