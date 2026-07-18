import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const runApiExtension = vi.hoisted(() => vi.fn());

vi.mock('@core/lib/extensions.server', () => ({
  runApiExtension,
}));

import { GET as getGalleryBySlug } from './[slug]/route';

describe('gallery phase 6 api route delegation regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runApiExtension.mockImplementation(async () => Response.json({ ok: true }));
  });

  it('delegates the public gallery route to plugin extension runtime path', async () => {
    const response = await getGalleryBySlug(
      new NextRequest('http://localhost:3000/api/gallery/demo'),
      {
        params: Promise.resolve({ slug: 'demo' }),
      }
    );

    expect(runApiExtension).toHaveBeenCalledTimes(1);
    expect(runApiExtension).toHaveBeenCalledWith('GET', expect.any(NextRequest), [
      'gallery',
      'demo',
    ]);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('returns plugin-disabled fallback response when no extension is available', async () => {
    runApiExtension.mockResolvedValueOnce(null);

    const response = await getGalleryBySlug(
      new NextRequest('http://localhost:3000/api/gallery/demo'),
      {
        params: Promise.resolve({ slug: 'demo' }),
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Gallery plugin is disabled' });
  });
});
