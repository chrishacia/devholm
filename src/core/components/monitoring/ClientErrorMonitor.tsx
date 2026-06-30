'use client';

import { useEffect } from 'react';

interface ErrorPayload {
  message: string;
  source?: string;
  stack?: string;
  pathname?: string;
  kind: 'error' | 'unhandledrejection';
  userAgent?: string;
  timestamp: string;
}

function sendError(payload: ErrorPayload) {
  const body = JSON.stringify(payload);

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon('/api/monitoring/client-errors', blob);
    return;
  }

  void fetch('/api/monitoring/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Ignore network failures.
  });
}

export default function ClientErrorMonitor() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      sendError({
        kind: 'error',
        message: event.message || 'Unknown error',
        source: event.filename,
        stack: event.error?.stack,
        pathname: window.location.pathname,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'Unhandled promise rejection';

      sendError({
        kind: 'unhandledrejection',
        message,
        stack: reason instanceof Error ? reason.stack : undefined,
        pathname: window.location.pathname,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
