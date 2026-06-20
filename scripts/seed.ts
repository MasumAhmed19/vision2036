/**
 * Seed Script — Vision2036 Group Savings App
 * Creates 11 member accounts + 1 admin account
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/seed.ts
 *   or: npm run seed
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is required to run the seed script. Set it in your environment before running npm run seed.');
}

const REQUIRED_MONGODB_URI = MONGODB_URI;

// Inline schema to avoid Next.js module issues in standalone script
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['member', 'moderator', 'admin'], default: 'member' },
    phoneNumber: { type: String },
    avatar: { type: String },
    isActive: { type: Boolean, default: true },
    joinedAt: { type: Date, default: Date.now },
}, { timestamps: true });

type UserDoc = {
    name: string;
    email: string;
    password: string;
    role: 'member' | 'moderator' | 'admin';
    phoneNumber?: string;
    isActive: boolean;
    joinedAt: Date;
};

const members: UserDoc[] = [
    { name: 'Mamunur Rashid Siam', email: 'siam.khan02000@gmail.com', password: 'admin2036', role: 'admin', isActive: true, joinedAt: new Date('2026-01-01') },
    { name: 'Alamin Ahmed', email: 'fearless.alamin@gmail.com', password: 'vision2036', role: 'member', isActive: true, joinedAt: new Date('2026-01-01') },
    { name: 'Sakib Rayhan', email: 'sakibrayhan001.sr@gmail.com', password: 'vision2036', role: 'member', isActive: true, joinedAt: new Date('2026-01-01') },
    { name: 'Masum Ahmed Shanto', email: 'masum.ahmed1328@gmail.com', password: 'vision2036', role: 'member', isActive: true, joinedAt: new Date('2026-01-01') },
    { name: 'Amdadul Haque Shanto', email: 'amdad.shanto003217@gmail.com', password: 'vision2036', role: 'member', isActive: true, joinedAt: new Date('2026-01-01') },
    { name: 'Sayeef Mahmud Tonmoy', email: 'smahmud2866@gmail.com', password: 'vision2036', role: 'member', isActive: true, joinedAt: new Date('2026-01-01') },
    { name: 'Ariful Islam', email: 'ai2925751@gmail.com', password: 'vision2036', role: 'member', isActive: true, joinedAt: new Date('2026-01-01') },
    { name: 'Mostafizur Rahman Badhon', email: 'mrbadhon93@gmail.com', password: 'vision2036', role: 'member', isActive: true, joinedAt: new Date('2026-01-01') },
    { name: 'Rozain Rahman Rohan', email: 'Rozainrahman1@gmail.com', password: 'vision2036', role: 'member', isActive: true, joinedAt: new Date('2026-01-01') },
    { name: 'Mehedi Hasan Shawon', email: 'Mehedi201002255@gmail.com', password: 'vision2036', role: 'member', isActive: true, joinedAt: new Date('2026-01-01') },
    { name: 'Rakibal Imran Omi', email: 'rakibalimran2@gmail.com', password: 'vision2036', role: 'member', isActive: true, joinedAt: new Date('2026-01-01') },
];

const admin: UserDoc = {
    name: 'Admin',
    email: 'admin@vision2036.com',
    password: 'admin2036',
    role: 'admin',
    isActive: true,
    joinedAt: new Date('2026-01-01'),
};

async function seed() {
    console.log('Starting seed...\n');

    try {
        await mongoose.connect(REQUIRED_MONGODB_URI, { dbName: 'vision2036' });
        console.log('✓ Connected to MongoDB\n');

        // Prevent model re-registration
        const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);

        const allUsers = [...members, admin];
        let created = 0;
        let skipped = 0;

        for (const userData of allUsers) {
            const exists = await UserModel.findOne({ email: userData.email });
            if (exists) {
                console.log(`  ⚠  Skipped (already exists): ${userData.email}`);
                skipped++;
                continue;
            }

            const salt = await bcrypt.genSalt(12);
            const hashed = await bcrypt.hash(userData.password, salt);

            await UserModel.create({ ...userData, password: hashed });
            console.log(`  ✓ Created [${userData.role.padEnd(9)}]: ${userData.name} <${userData.email}>`);
            created++;
        }

        console.log(`\nSeeding complete!`);
        console.log(`   Created: ${created}`);
        console.log(`   Skipped: ${skipped}`);
        console.log(`   Total:   ${allUsers.length}`);

        // Print credentials summary
        console.log('\nLogin Credentials:');
        console.log('   Admin:   admin@vision2036.com  /  admin2036');
        console.log('   Members: <name>@vision2036.com /  vision2036');
        console.log('   Example: mamun@vision2036.com  /  vision2036');

    } catch (error) {
        console.error('\nSeed failed:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\n✓ Disconnected from MongoDB');
    }
}

seed();
