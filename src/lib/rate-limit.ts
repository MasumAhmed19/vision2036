import connectDB from '@/lib/mongoose';
import RateLimitEntry from '@/models/RateLimitEntry';

type RateLimitOptions = {
  windowMs: number;
  max: number;
};

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  resetAt: number;
};

// Backed by a Mongo collection (with a TTL index) rather than an in-process
// Map — a Map's counts don't survive across serverless instances/restarts,
// which made rate limiting largely decorative in production. The update
// uses an aggregation pipeline so the "start a new window vs increment the
// current one" decision is made atomically in the DB, not via a separate
// read-then-write that could race across concurrent requests.
//
// Fails open: if the limiter's own DB access errors, every caller (login,
// forgot-password, reset-password, ...) should allow the attempt rather than
// block or misreport a legitimate request. That policy lives here, once,
// rather than as copy-pasted try/catch at every call site — a future
// rate-limited route gets it automatically instead of risking fail-closed
// (locking out all users) if someone forgets to wrap the call themselves.
export async function consumeRateLimit(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
  try {
    await connectDB();

    const now = new Date();
    const freshResetAt = new Date(now.getTime() + options.windowMs);

    const doc = await RateLimitEntry.findOneAndUpdate(
      { key },
      [
        {
          $set: {
            count: {
              $cond: [
                { $or: [{ $eq: ['$resetAt', null] }, { $lte: ['$resetAt', now] }] },
                1,
                { $add: ['$count', 1] },
              ],
            },
            resetAt: {
              $cond: [
                { $or: [{ $eq: ['$resetAt', null] }, { $lte: ['$resetAt', now] }] },
                freshResetAt,
                '$resetAt',
              ],
            },
          },
        },
      ],
      { upsert: true, new: true }
    );

    return {
      success: doc.count <= options.max,
      remaining: Math.max(options.max - doc.count, 0),
      resetAt: doc.resetAt.getTime(),
    };
  } catch (error) {
    console.error(`Rate limit check failed for key "${key}", allowing request:`, error);
    return { success: true, remaining: options.max, resetAt: Date.now() + options.windowMs };
  }
}
