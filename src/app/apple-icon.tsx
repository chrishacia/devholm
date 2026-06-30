import { ImageResponse } from 'next/og';

// Image metadata
export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

// Apple touch icon generation
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 100,
          background: 'linear-gradient(135deg, #0D1117 0%, #161B22 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 36,
        }}
      >
        <span
          style={{
            background: 'linear-gradient(135deg, #58A6FF 0%, #0969DA 50%, #8250DF 100%)',
            backgroundClip: 'text',
            color: 'transparent',
            fontWeight: 'bold',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          DH
        </span>
      </div>
    ),
    {
      ...size,
    }
  );
}
