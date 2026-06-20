import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { auth } from '@/lib/auth';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const sanitizeSegment = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const label = formData.get('label')?.toString() || 'cost_receipt';

    if (!file) {
      return NextResponse.json({ success: false, message: 'Receipt image is required' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const publicId = `${sanitizeSegment(label)}_${Date.now()}`;

    const uploadResponse = await new Promise<any>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'vision2036/cost-receipts',
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
      data: { url: uploadResponse.secure_url, publicId: uploadResponse.public_id },
      message: 'Receipt uploaded successfully',
    });
  } catch (error: any) {
    console.error('Upload cost receipt error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to upload receipt' }, { status: 500 });
  }
}
