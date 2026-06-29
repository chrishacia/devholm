'use client';

// Opt out of static prerendering — the global error boundary must
// render on-demand. Statically prerendering this page causes React's
// context APIs to be called before React is initialised in the SSG worker,
// which throws "Cannot read properties of null (reading 'useContext')".
export const dynamic = 'force-dynamic';

// global-error.tsx — Root error boundary for Next.js App Router.
//
// This file replaces the root layout when an unrecoverable error occurs.
// It must be self-contained (no MUI providers, no context dependencies)
// because it renders in place of the root layout.
//
// It also prevents Next.js from auto-generating /_global-error, which
// breaks prerendering by trying to call useContext before React initialises.

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to your error reporting service here if needed
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0D1117',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
          color: '#E6EDF3',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            padding: '48px 32px',
            maxWidth: 480,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundColor: 'rgba(207, 34, 46, 0.12)',
              border: '1px solid rgba(207, 34, 46, 0.3)',
              marginBottom: 24,
              fontSize: 28,
            }}
            aria-hidden="true"
          >
            ⚠
          </div>
          <h1
            style={{
              margin: '0 0 12px',
              fontSize: '1.5rem',
              fontWeight: 600,
              color: '#E6EDF3',
              letterSpacing: '-0.01em',
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              margin: '0 0 32px',
              fontSize: '0.9375rem',
              color: '#8D96A0',
              lineHeight: 1.6,
            }}
          >
            An unexpected error occurred. You can try refreshing the page or click below to attempt
            recovery.
          </p>
          {error?.digest && (
            <p
              style={{
                margin: '0 0 24px',
                fontSize: '0.75rem',
                color: '#6E7681',
                fontFamily: 'monospace',
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 24px',
              backgroundColor: '#238636',
              color: '#FFFFFF',
              border: '1px solid rgba(240,246,252,0.1)',
              borderRadius: 6,
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.12s ease',
            }}
            onMouseOver={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#2ea043';
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#238636';
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
