import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import { getDb } from '@/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/projects/[id] - Get a single project
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const db = getDb();

    const project = await db('projects').where('id', id).first();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const technologies = await db('project_technologies')
      .where('project_id', id)
      .orderBy('sort_order', 'asc')
      .select('technology');

    return NextResponse.json({
      project: {
        id: project.id,
        title: project.title,
        slug: project.slug,
        description: project.description,
        imageUrl: project.image_url,
        githubUrl: project.github_url,
        liveUrl: project.live_url,
        isFeatured: project.is_featured,
        isPrivate: project.is_private,
        sortOrder: project.sort_order,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        technologies: technologies.map((t: { technology: string }) => t.technology),
      },
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/projects/[id] - Update a project
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const db = getDb();
    const body = await request.json();
    const {
      title,
      slug,
      description,
      imageUrl,
      githubUrl,
      liveUrl,
      isFeatured,
      isPrivate,
      sortOrder,
      technologies,
    } = body;

    // Check if project exists
    const existingProject = await db('projects').where('id', id).first();
    if (!existingProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Check if slug is unique (if changing)
    if (slug && slug !== existingProject.slug) {
      const slugExists = await db('projects').where('slug', slug).first();
      if (slugExists) {
        return NextResponse.json(
          { error: 'A project with this slug already exists' },
          { status: 400 }
        );
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };
    if (title !== undefined) updateData.title = title;
    if (slug !== undefined) updateData.slug = slug;
    if (description !== undefined) updateData.description = description;
    if (imageUrl !== undefined) updateData.image_url = imageUrl || null;
    if (githubUrl !== undefined) updateData.github_url = githubUrl || null;
    if (liveUrl !== undefined) updateData.live_url = liveUrl || null;
    if (isFeatured !== undefined) updateData.is_featured = isFeatured;
    if (isPrivate !== undefined) updateData.is_private = isPrivate;
    if (sortOrder !== undefined) updateData.sort_order = sortOrder;

    // Update project
    const [project] = await db('projects').where('id', id).update(updateData).returning('*');

    // Update technologies if provided
    if (technologies !== undefined) {
      await db('project_technologies').where('project_id', id).delete();
      if (technologies.length > 0) {
        await db('project_technologies').insert(
          technologies.map((tech: string, index: number) => ({
            project_id: id,
            technology: tech,
            sort_order: index,
          }))
        );
      }
    }

    // Fetch updated technologies
    const techs = await db('project_technologies')
      .where('project_id', id)
      .orderBy('sort_order', 'asc')
      .select('technology');

    return NextResponse.json({
      project: {
        id: project.id,
        title: project.title,
        slug: project.slug,
        description: project.description,
        imageUrl: project.image_url,
        githubUrl: project.github_url,
        liveUrl: project.live_url,
        isFeatured: project.is_featured,
        isPrivate: project.is_private,
        sortOrder: project.sort_order,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        technologies: techs.map((t: { technology: string }) => t.technology),
      },
    });
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/projects/[id] - Delete a project
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const db = getDb();

    const deleted = await db('projects').where('id', id).delete();

    if (!deleted) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
