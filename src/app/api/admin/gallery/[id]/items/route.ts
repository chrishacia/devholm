import { NextRequest } from 'next/server';
import { handleGalleryAdminCollectionItems } from '@user/extensions/plugins/gallery/api/handlers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return handleGalleryAdminCollectionItems('GET', request, id);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return handleGalleryAdminCollectionItems('POST', request, id);
}
