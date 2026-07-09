import { NextRequest } from 'next/server';
import { handleGalleryAdminCollectionRoot } from '@user/extensions/plugins/gallery/api/handlers';

export async function GET(request: NextRequest) {
  return handleGalleryAdminCollectionRoot('GET', request);
}

export async function POST(request: NextRequest) {
  return handleGalleryAdminCollectionRoot('POST', request);
}
