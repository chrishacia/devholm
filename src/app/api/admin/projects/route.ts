import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth-helpers';
import { getDb } from '@/db';

/**
 * GET /api/admin/projects - List all projects (including private ones for admin)
 */
export async function GET(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const search = searchParams.get('search') || undefined;

  const offset = (page - 1) * limit;

  try {
    const db = getDb();

    let query = db('projects')
      .select('*')
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'desc');

    if (search) {
      query = query.where(function () {
        this.whereILike('title', `%${search}%`).orWhereILike('description', `%${search}%`);
      });
    }

    // Get total count
    const countQuery = db('projects').count('* as count');
    if (search) {
      countQuery.where(function () {
        this.whereILike('title', `%${search}%`).orWhereILike('description', `%${search}%`);
      });
    }
    const [{ count: totalCount }] = await countQuery;
    const total = Number(totalCount);

    // Get paginated projects
    const projects = await query.limit(limit).offset(offset);

    // Get technologies for each project
    const projectsWithTech = await Promise.all(
      projects.map(async (project: Record<string, unknown>) => {
        const technologies = await db('project_technologies')
          .where('project_id', project.id as string)
          .orderBy('sort_order', 'asc')
          .select('technology');

        return {
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
        };
      })
    );

    return NextResponse.json({
      projects: projectsWithTech,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

/**
 * POST /api/admin/projects - Create a new project
 */
export async function POST(request: NextRequest) {
  const token = await verifyAdmin(request);

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
      isFeatured = false,
      isPrivate = false,
      sortOrder = 0,
      technologies = [],
    } = body;

    // Validate required fields
    if (!title || !slug || !description) {
      return NextResponse.json(
        { error: 'Title, slug, and description are required' },
        { status: 400 }
      );
    }

    // Check if slug is unique
    const existingProject = await db('projects').where('slug', slug).first();
    if (existingProject) {
      return NextResponse.json(
        { error: 'A project with this slug already exists' },
        { status: 400 }
      );
    }

    // Insert project
    const [project] = await db('projects')
      .insert({
        title,
        slug,
        description,
        image_url: imageUrl || null,
        github_url: githubUrl || null,
        live_url: liveUrl || null,
        is_featured: isFeatured,
        is_private: isPrivate,
        sort_order: sortOrder,
      })
      .returning('*');

    // Insert technologies
    if (technologies.length > 0) {
      await db('project_technologies').insert(
        technologies.map((tech: string, index: number) => ({
          project_id: project.id,
          technology: tech,
          sort_order: index,
        }))
      );
    }

    return NextResponse.json(
      {
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
          technologies,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
