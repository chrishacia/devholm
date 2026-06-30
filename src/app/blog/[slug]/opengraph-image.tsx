import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Blog Post Preview';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

// Mock function to get post - will be replaced with real API call
async function getPost(slug: string) {
  const mockPosts: Record<string, { title: string; tags: string[] }> = {
    'building-modern-personal-website-nextjs': {
      title: 'Building a Modern Personal Website with Next.js',
      tags: ['Next.js', 'React', 'TypeScript'],
    },
    'art-of-writing-clean-typescript': {
      title: 'The Art of Writing Clean TypeScript',
      tags: ['TypeScript', 'Best Practices'],
    },
    'devops-for-developers': {
      title: 'DevOps for Developers: A Practical Guide',
      tags: ['DevOps', 'Docker', 'CI/CD'],
    },
  };

  return mockPosts[slug] || { title: 'Blog Post', tags: [] };
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0a0c14',
          padding: '60px 80px',
          fontFamily: '"Segoe UI", "Roboto", "Helvetica Neue", sans-serif',
        }}
      >
        {/* Background gradient overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              'linear-gradient(135deg, rgba(196, 160, 82, 0.1) 0%, rgba(107, 91, 149, 0.1) 50%, rgba(46, 134, 171, 0.1) 100%)',
          }}
        />

        {/* Accent border at top */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(90deg, #C4A052 0%, #6B5B95 50%, #2E86AB 100%)',
          }}
        />

        {/* Site name */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              fontSize: '28px',
              fontWeight: 600,
              color: '#C4A052',
              letterSpacing: '0.05em',
            }}
          >
            CHRIS HACIA
          </div>
          <div
            style={{
              marginLeft: '20px',
              padding: '6px 16px',
              backgroundColor: 'rgba(196, 160, 82, 0.2)',
              borderRadius: '20px',
              fontSize: '14px',
              color: '#C4A052',
              fontWeight: 500,
            }}
          >
            BLOG
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <h1
            style={{
              fontSize: post.title.length > 50 ? '48px' : '56px',
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.2,
              margin: 0,
              maxWidth: '90%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {post.title}
          </h1>

          {/* Tags */}
          {post.tags.length > 0 && (
            <div
              style={{
                display: 'flex',
                marginTop: '30px',
                gap: '12px',
              }}
            >
              {post.tags.slice(0, 4).map((tag) => (
                <div
                  key={tag}
                  style={{
                    padding: '8px 20px',
                    backgroundColor: 'rgba(107, 91, 149, 0.3)',
                    borderRadius: '6px',
                    fontSize: '18px',
                    color: '#B8A8D3',
                    fontWeight: 500,
                  }}
                >
                  {tag}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '30px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div
            style={{
              fontSize: '20px',
              color: '#8892b0',
            }}
          >
            devholm.com/blog/{slug}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#2E86AB',
              }}
            />
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#6B5B95',
              }}
            />
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#C4A052',
              }}
            />
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
