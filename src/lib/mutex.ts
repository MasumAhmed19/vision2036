import mongoose from 'mongoose';

// A lock document per named mutex. Not a data model in its own right — just
// a shared resource for withMutex() below to contend on.
const MutexLockSchema = new mongoose.Schema(
    { _id: String, version: { type: Number, default: 0 } },
    { versionKey: false }
);

const MutexLock =
    (mongoose.models.MutexLock as mongoose.Model<{ _id: string; version: number }>) ||
    mongoose.model('MutexLock', MutexLockSchema, 'mutex_locks');

/**
 * Runs `fn` inside a MongoDB transaction that also increments a shared lock
 * document named `name`. A plain "read a count, then write" check (e.g.
 * "are there at least 2 active admins before demoting one") is racy under
 * concurrent requests touching *different* documents, because MongoDB
 * doesn't otherwise treat those writes as conflicting. Two transactions
 * both incrementing the *same* lock document, though, genuinely conflict at
 * the storage-engine level — MongoDB aborts the loser, and `withTransaction`
 * automatically retries it, by which point the winner's changes are already
 * committed and visible. That gives `fn` true mutual exclusion for whatever
 * invariant it checks, without needing a lock per document being touched.
 *
 * Requires a replica set (MongoDB Atlas always is, including the free tier).
 */
export async function withMutex<T>(
    name: string,
    fn: (session: mongoose.ClientSession) => Promise<T>
): Promise<T> {
    const session = await mongoose.startSession();
    try {
        let result: T | undefined;
        await session.withTransaction(async () => {
            await MutexLock.findOneAndUpdate(
                { _id: name },
                { $inc: { version: 1 } },
                { upsert: true, session }
            );
            // fn must perform its reads/writes using this same session
            // (e.g. `Model.find(...).session(session)`, `doc.save({ session })`)
            // for them to actually be part of this atomic unit.
            result = await fn(session);
        });
        return result as T;
    } finally {
        await session.endSession();
    }
}
