import { NextRequest } from 'next/server';
import { handleGalleryAdminCollectionById } from '@user/extensions/plugins/gallery/api/handlers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return handleGalleryAdminCollectionById('GET', request, id);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return handleGalleryAdminCollectionById('PUT', request, id);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return handleGalleryAdminCollectionById('DELETE', request, id);
}
