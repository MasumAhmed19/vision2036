import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import crypto from 'crypto';
import { withAuth } from '@/lib/with-auth';
import { sanitizeSegment, validateImageUpload } from '@/lib/upload-validation';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Optional proof for a ledger entry (bank charge, operational cost, interest,
// investment return/principal back, ...) — same upload pattern as
// /api/costs/upload-receipt, just scoped to its own Cloudinary folder.
export const POST = withAuth({}, async ({ member, request }) => {
    try {
        const formData = await request.formData();
        const file = formData.get('file');
        const label = formData.get('label')?.toString() || 'entry_proof';

        const validation = validateImageUpload(file);
        if (!validation.ok) {
            return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
        }

        const arrayBuffer = await validation.file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const publicId = `${member.id}_${sanitizeSegment(label)}_${Date.now()}_${crypto.randomUUID()}`;

        const uploadResponse = await new Promise<any>((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'vision2036/entry-proofs',
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
            data: { url: uploadResponse.secure_url, publicId: uploadResponse.public_id },
            message: 'Proof uploaded successfully',
        });
    } catch (error: any) {
        console.error('Upload entry proof error:', error);
        return NextResponse.json({ success: false, message: error.message || 'Failed to upload proof' }, { status: 500 });
    }
});
