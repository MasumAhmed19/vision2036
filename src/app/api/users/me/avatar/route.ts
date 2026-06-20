import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongoose';
import User from '@/models/User';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function PATCH(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const avatarFile = formData.get('avatar') as File | null;

        if (!avatarFile) {
            return NextResponse.json({ success: false, message: 'Avatar image is required' }, { status: 400 });
        }

        // Convert the File to a Buffer for Cloudinary
        const arrayBuffer = await avatarFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload to Cloudinary using a Promise wrapper
        const uploadResponse = await new Promise<any>((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { folder: 'vision2036/avatars', overwrite: true },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );
            uploadStream.end(buffer);
        });

        await connectDB();

        const user = await User.findById(session.user.id);
        if (!user) {
            return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
        }

        user.avatar = uploadResponse.secure_url;
        await user.save();

        return NextResponse.json({
            success: true,
            data: {
                id: (user._id as { toString(): string }).toString(),
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                phoneNumber: user.phoneNumber,
                isActive: user.isActive,
            },
            message: 'Avatar updated successfully',
        });
    } catch (error: any) {
        console.error('Avatar update error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Failed to update avatar' },
            { status: 500 }
        );
    }
}
