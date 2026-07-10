import { NextRequest } from 'next/server';
import { handleGalleryAdminItemById } from '@user/extensions/plugins/gallery/api/handlers';

interface RouteParams {
  params: Promise<{ itemId: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { itemId } = await params;
  return handleGalleryAdminItemById('PUT', request, itemId);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { itemId } = await params;
  return handleGalleryAdminItemById('DELETE', request, itemId);
}
