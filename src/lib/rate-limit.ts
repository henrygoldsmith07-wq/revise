// A small in-process token bucket. This protects a single server instance
// from one client hammering the AI route; it is not a distributed limiter and
// does not pretend to be. Behind several instances, put a real limiter in
// front — the interface here is deliberately the same shape.

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Sustained requests per minute. */
  ratePerMinute: number;
  /** Maximum burst above the sustained rate. */
  burst: number;
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

export function rateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const refillPerMs = options.ratePerMinute / 60_000;
  const bucket = buckets.get(key) ?? { tokens: options.burst, updatedAt: now };

  bucket.tokens = Math.min(options.burst, bucket.tokens + (now - bucket.updatedAt) * refillPerMs);
  bucket.updatedAt = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((1 - bucket.tokens) / refillPerMs / 1000),
      remaining: 0,
    };
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);

  // Opportunistic eviction so idle keys don't accumulate forever.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) {
      if (now - b.updatedAt > 600_000) buckets.delete(k);
    }
  }

  return { ok: true, retryAfterSeconds: 0, remaining: Math.floor(bucket.tokens) };
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous";
}
