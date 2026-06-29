import { getDb } from './index';

export interface MediaTransform {
  id: string;
  mediaAssetId: string;
  contextType: string;
  contextId: string;
  name: string;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  focusX: number;
  focusY: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaTransformInput {
  mediaAssetId: string;
  contextType: string;
  contextId: string;
  name?: string;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  focusX?: number;
  focusY?: number;
  isActive?: boolean;
}

function mapTransform(row: Record<string, unknown>): MediaTransform {
  return {
    id: row.id as string,
    mediaAssetId: row.media_asset_id as string,
    contextType: row.context_type as string,
    contextId: row.context_id as string,
    name: row.name as string,
    cropX: Number(row.crop_x),
    cropY: Number(row.crop_y),
    cropWidth: Number(row.crop_width),
    cropHeight: Number(row.crop_height),
    focusX: Number(row.focus_x),
    focusY: Number(row.focus_y),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export async function upsertMediaTransform(input: MediaTransformInput) {
  const payload = {
    media_asset_id: input.mediaAssetId,
    context_type: input.contextType,
    context_id: input.contextId,
    name: input.name || 'default',
    crop_x: input.cropX,
    crop_y: input.cropY,
    crop_width: input.cropWidth,
    crop_height: input.cropHeight,
    focus_x: input.focusX ?? 50,
    focus_y: input.focusY ?? 50,
    is_active: input.isActive !== false,
    updated_at: new Date(),
  };

  const [row] = await getDb()('media_transforms')
    .insert(payload)
    .onConflict(['media_asset_id', 'context_type', 'context_id', 'name'])
    .merge(payload)
    .returning('*');

  return mapTransform(row);
}

export async function getMediaTransform(
  mediaAssetId: string,
  contextType: string,
  contextId: string,
  name = 'default'
) {
  const row = await getDb()('media_transforms')
    .where({
      media_asset_id: mediaAssetId,
      context_type: contextType,
      context_id: contextId,
      name,
      is_active: true,
    })
    .first();

  return row ? mapTransform(row) : null;
}

export async function listMediaTransformsByContext(contextType: string, contextId: string) {
  const rows = await getDb()('media_transforms')
    .where({ context_type: contextType, context_id: contextId })
    .orderBy('updated_at', 'desc');

  return rows.map(mapTransform);
}

export async function deleteMediaTransform(id: string) {
  return getDb()('media_transforms').where('id', id).delete();
}
