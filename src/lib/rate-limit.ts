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
export async function consumeRateLimit(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
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
}
