import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongoose';
import LedgerEntry from '@/models/LedgerEntry';
import { withAuth } from '@/lib/with-auth';
import { mapEntry } from '@/lib/entry-mapper';

// Open to any authenticated member — see the note in ../route.ts's GET.
export const GET = withAuth<{ params: Promise<{ id: string }> }>({}, async ({ context }) => {
    const { id } = await context.params;
    await connectDB();

    const entry = await LedgerEntry.findById(id);
    if (!entry) {
        return NextResponse.json({ success: false, message: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: mapEntry(entry), message: 'Entry fetched successfully' });
});
