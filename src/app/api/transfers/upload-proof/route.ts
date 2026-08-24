import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import crypto from 'crypto';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';
import { sanitizeSegment, validateImageUpload } from '@/lib/upload-validation';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Includes the authenticated user's id and a random component so two
// members (or two proofs from the same member, e.g. monthly + flex for the
// same month) never collide on the same Cloudinary asset.
const buildPublicId = (userId: string, selectMonth: string) => {
    const date = new Date(`${selectMonth}-01T00:00:00.000Z`);
    const monthName = date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
    const year = date.getUTCFullYear();

    return `${userId}_${sanitizeSegment(monthName)}_${year}_${crypto.randomUUID()}`;
};

export async function POST(request: Request) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file');
        const selectMonth = formData.get('selectMonth')?.toString() || '';

        const validation = validateImageUpload(file);
        if (!validation.ok) {
            return NextResponse.json({ success: false, message: validation.message.replace('File', 'Payment proof') }, { status: 400 });
        }

        if (!/^\d{4}-\d{2}$/.test(selectMonth)) {
            return NextResponse.json({ success: false, message: 'Invalid contribution month' }, { status: 400 });
        }

        await connectDB();

        const user = await User.findById(session.user.id);

        if (!user) {
            return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
        }

        const arrayBuffer = await validation.file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const publicId = buildPublicId(session.user.id, selectMonth);

        const uploadResponse = await new Promise<any>((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'vision2036/payment-proofs',
                    public_id: publicId,
                    overwrite: false,
                    resource_type: 'image',
                },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );

            uploadStream.end(buffer);
        });

        return NextResponse.json({
            success: true,
            data: {
                url: uploadResponse.secure_url,
                publicId: uploadResponse.public_id,
            },
            message: 'Payment proof uploaded successfully',
        });
    } catch (error: any) {
        console.error('Upload payment proof error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Failed to upload payment proof' },
            { status: 500 }
        );
    }
}
