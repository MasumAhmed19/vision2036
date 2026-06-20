import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI?.trim();
const MONGODB_URI_LOCAL = process.env.MONGODB_URI_LOCAL?.trim();
const DEFAULT_LOCAL_MONGODB_URI = 'mongodb://127.0.0.1:27017/vision2036';
const DB_NAME = process.env.MONGODB_DB_NAME || 'vision2036';

if (!MONGODB_URI && !MONGODB_URI_LOCAL) {
    throw new Error('Please define MONGODB_URI (or MONGODB_URI_LOCAL for local development) in .env.local');
}

interface MongooseCache {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
}

// Use a global variable to cache the connection across hot reloads in development
declare global {
    var mongoose: MongooseCache;
}

const cached: MongooseCache = global.mongoose || { conn: null, promise: null };

if (!global.mongoose) {
    global.mongoose = cached;
}

async function connectDB(): Promise<typeof mongoose> {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
            dbName: DB_NAME,
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
        };

        const connectionUris: string[] = [];

        if (MONGODB_URI) {
            connectionUris.push(MONGODB_URI);
        }

        if (process.env.NODE_ENV !== 'production') {
            if (MONGODB_URI_LOCAL) {
                connectionUris.push(MONGODB_URI_LOCAL);
            } else if (!MONGODB_URI_LOCAL) {
                connectionUris.push(DEFAULT_LOCAL_MONGODB_URI);
            }
        }

        cached.promise = (async () => {
            let lastError: unknown = null;

            for (const uri of connectionUris) {
                try {
                    const connection = await mongoose.connect(uri, opts);
                    return connection;
                } catch (error) {
                    lastError = error;
                }
            }

            throw lastError;
        })();
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    return cached.conn;
}

export default connectDB;
