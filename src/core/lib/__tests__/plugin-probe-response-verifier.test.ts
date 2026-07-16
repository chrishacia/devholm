import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { verifyPluginProbeResponse } from '../../../../scripts/verify-plugin-probe-response.mjs';

describe('plugin probe strict 503 contract verification', () => {
  it('passes exact valid fail-closed JSON for 503', () => {
    const ok = verifyPluginProbeResponse({
      status: 503,
      contentType: 'application/json',
      bodyRaw: JSON.stringify({
        error: 'Service Unavailable',
        message: 'Route resolution service temporarily unavailable',
      }),
    });

    expect(ok).toBe(true);
  });

  it('passes JSON content type with charset', () => {
    const ok = verifyPluginProbeResponse({
      status: 503,
      contentType: 'application/json; charset=utf-8',
      bodyRaw: JSON.stringify({
        error: 'Service Unavailable',
        message: 'Route resolution service temporarily unavailable',
      }),
    });

    expect(ok).toBe(true);
  });

  it('rejects HTML lookalike response', () => {
    const ok = verifyPluginProbeResponse({
      status: 503,
      contentType: 'text/html; charset=utf-8',
      bodyRaw:
        '<html><body>Service Unavailable Route resolution service temporarily unavailable</body></html>',
    });

    expect(ok).toBe(false);
  });

  it('rejects plain text lookalike response', () => {
    const ok = verifyPluginProbeResponse({
      status: 503,
      contentType: 'text/plain',
      bodyRaw: 'Service Unavailable Route resolution service temporarily unavailable',
    });

    expect(ok).toBe(false);
  });

  it('rejects malformed JSON', () => {
    const ok = verifyPluginProbeResponse({
      status: 503,
      contentType: 'application/json',
      bodyRaw: '{"error":"Service Unavailable",',
    });

    expect(ok).toBe(false);
  });

  it('rejects wrong error field', () => {
    const ok = verifyPluginProbeResponse({
      status: 503,
      contentType: 'application/json',
      bodyRaw: JSON.stringify({
        error: 'Temporarily Unavailable',
        message: 'Route resolution service temporarily unavailable',
      }),
    });

    expect(ok).toBe(false);
  });

  it('rejects wrong message field', () => {
    const ok = verifyPluginProbeResponse({
      status: 503,
      contentType: 'application/json',
      bodyRaw: JSON.stringify({
        error: 'Service Unavailable',
        message: 'Upstream unavailable',
      }),
    });

    expect(ok).toBe(false);
  });

  it('rejects missing required fields', () => {
    const missingError = verifyPluginProbeResponse({
      status: 503,
      contentType: 'application/json',
      bodyRaw: JSON.stringify({ message: 'Route resolution service temporarily unavailable' }),
    });

    const missingMessage = verifyPluginProbeResponse({
      status: 503,
      contentType: 'application/json',
      bodyRaw: JSON.stringify({ error: 'Service Unavailable' }),
    });

    expect(missingError).toBe(false);
    expect(missingMessage).toBe(false);
  });

  it('rejects JSON arrays for 503', () => {
    const ok = verifyPluginProbeResponse({
      status: 503,
      contentType: 'application/json',
      bodyRaw: JSON.stringify([
        {
          error: 'Service Unavailable',
          message: 'Route resolution service temporarily unavailable',
        },
      ]),
    });

    expect(ok).toBe(false);
  });

  it('rejects JSON objects wrapped with extra text', () => {
    const ok = verifyPluginProbeResponse({
      status: 503,
      contentType: 'application/json',
      bodyRaw:
        'prefix {"error":"Service Unavailable","message":"Route resolution service temporarily unavailable"} suffix',
    });

    expect(ok).toBe(false);
  });

  it('keeps allowed non-503 statuses', () => {
    expect(verifyPluginProbeResponse({ status: 200, contentType: '', bodyRaw: '' })).toBe(true);
    expect(verifyPluginProbeResponse({ status: 301, contentType: '', bodyRaw: '' })).toBe(true);
    expect(verifyPluginProbeResponse({ status: 302, contentType: '', bodyRaw: '' })).toBe(true);
    expect(verifyPluginProbeResponse({ status: 307, contentType: '', bodyRaw: '' })).toBe(true);
    expect(verifyPluginProbeResponse({ status: 308, contentType: '', bodyRaw: '' })).toBe(true);
    expect(verifyPluginProbeResponse({ status: 404, contentType: '', bodyRaw: '' })).toBe(true);
  });

  it('fails unexpected statuses', () => {
    expect(
      verifyPluginProbeResponse({ status: 500, contentType: 'application/json', bodyRaw: '{}' })
    ).toBe(false);
    expect(
      verifyPluginProbeResponse({ status: 418, contentType: 'application/json', bodyRaw: '{}' })
    ).toBe(false);
  });

  it('does not crash on missing body file in CLI mode', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/verify-plugin-probe-response.mjs',
        '--status',
        '503',
        '--content-type',
        'application/json',
        '--body-file',
        '/tmp/devholm-nonexistent-plugin-body.json',
      ],
      { encoding: 'utf8' }
    );

    expect(result.status).toBe(1);
  });
});

describe('deployment verification guardrails remain strict', () => {
  const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8') as string;

  it('keeps homepage strict 200 html checks and dispatcher-marker rejection', () => {
    expect(workflow).toContain('verify_homepage()');
    expect(workflow).toContain('if [ "$status" != "200" ]; then');
    expect(workflow).toContain("grep -qi 'text/html'");
    expect(workflow).toContain(
      "grep -q 'Route resolution service temporarily unavailable' /tmp/home-body.txt"
    );
  });

  it('keeps unknown-route strict 404 checks', () => {
    expect(workflow).toContain('verify_unknown_route()');
    expect(workflow).toContain('if [ "$status" != "404" ]; then');
    expect(workflow).toContain("grep -Eqi 'text/html|text/plain'");
  });
});
