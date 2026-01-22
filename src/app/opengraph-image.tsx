import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'DevHolm - Personal Website Template';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0D1117',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
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
              'linear-gradient(135deg, rgba(9, 105, 218, 0.15) 0%, rgba(130, 80, 223, 0.1) 50%, rgba(88, 166, 255, 0.15) 100%)',
          }}
        />

        {/* Accent border at top - GitHub style */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(90deg, #58A6FF 0%, #0969DA 50%, #8250DF 100%)',
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            padding: '60px 80px',
          }}
        >
          {/* Logo/Name */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '30px',
            }}
          >
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #161B22 0%, #0D1117 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '24px',
                border: '2px solid rgba(48, 54, 61, 0.8)',
              }}
            >
              <span
                style={{
                  fontSize: '36px',
                  fontWeight: 'bold',
                  background: 'linear-gradient(135deg, #58A6FF 0%, #8250DF 100%)',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                DH
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <span
                style={{
                  fontSize: '48px',
                  fontWeight: 'bold',
                  color: '#E6EDF3',
                  letterSpacing: '-0.02em',
                }}
              >
                DevHolm
              </span>
              <span
                style={{
                  fontSize: '24px',
                  color: '#58A6FF',
                  fontWeight: 500,
                }}
              >
                Personal Website Template
              </span>
            </div>
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: '28px',
              color: 'rgba(230, 237, 243, 0.7)',
              textAlign: 'center',
              maxWidth: '800px',
              lineHeight: 1.4,
              marginBottom: '40px',
            }}
          >
            A modern, feature-rich personal website template built with Next.js, TypeScript, and Material UI
          </div>

          {/* Tech stack pills - GitHub style */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            {['Next.js 16', 'React 19', 'TypeScript', 'PostgreSQL', 'Material UI'].map((tech) => (
              <div
                key={tech}
                style={{
                  padding: '8px 20px',
                  backgroundColor: 'rgba(9, 105, 218, 0.15)',
                  borderRadius: '20px',
                  fontSize: '18px',
                  color: '#58A6FF',
                  fontWeight: 500,
                  border: '1px solid rgba(48, 54, 61, 0.8)',
                }}
              >
                {tech}
              </div>
            ))}
          </div>
        </div>

        {/* URL at bottom */}
        <div
          style={{
            position: 'absolute',
            bottom: '30px',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize: '20px',
              color: 'rgba(230, 237, 243, 0.5)',
              letterSpacing: '0.05em',
            }}
          >
            github.com/chrishacia/devholm
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
