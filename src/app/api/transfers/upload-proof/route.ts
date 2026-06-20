import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const sanitizeSegment = (value: string) => value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const buildPublicId = (memberName: string, selectMonth: string) => {
    const date = new Date(`${selectMonth}-01T00:00:00.000Z`);
    const monthName = date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
    const year = date.getUTCFullYear();

    return `${sanitizeSegment(memberName)}_${sanitizeSegment(monthName)}_${year}`;
};

export async function POST(request: Request) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const selectMonth = formData.get('selectMonth')?.toString() || '';

        if (!file) {
            return NextResponse.json({ success: false, message: 'Payment proof is required' }, { status: 400 });
        }

        if (!/^\d{4}-\d{2}$/.test(selectMonth)) {
            return NextResponse.json({ success: false, message: 'Invalid contribution month' }, { status: 400 });
        }

        await connectDB();

        const user = await User.findById(session.user.id);

        if (!user) {
            return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const publicId = buildPublicId(user.name, selectMonth);

        const uploadResponse = await new Promise<any>((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'vision2036/payment-proofs',
                    public_id: publicId,
                    overwrite: true,
                    unique_filename: false,
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
