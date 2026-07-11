import { describe, expect, it, vi } from 'vitest';
import {
  normalizeGitHubRepoUrl,
  normalizeMarketplaceInstallSourceDescriptor,
  parseMarketplaceInstallSourceDescriptor,
  validateMarketplaceInstallSourceDescriptor,
} from '@core/lib/plugin-install-source-descriptor.server';
import {
  invalidMarketplaceInstallSourceDescriptors,
  validMarketplaceInstallSourceDescriptor,
} from './fixtures/plugin-install-source-descriptor-fixtures';

describe('plugin-install-source-descriptor: parsing and normalization', () => {
  it('parses a valid marketplace descriptor successfully', () => {
    const parsed = parseMarketplaceInstallSourceDescriptor(validMarketplaceInstallSourceDescriptor);
    expect(parsed.errors).toEqual([]);
    expect(parsed.descriptor).not.toBeNull();
    expect(parsed.descriptor?.sourceType).toBe('marketplace');
    expect(parsed.descriptor?.expectedPluginId).toBe('calendar');
    expect(parsed.descriptor?.expectedVersion).toBe('0.1.0');
  });

  it('normalizes GitHub repository URL deterministically', () => {
    const normalized = normalizeGitHubRepoUrl('https://github.com/chrishacia/devholm-plugins.git');
    expect(normalized).toBe('https://github.com/chrishacia/devholm-plugins');
  });

  it('normalizes descriptor string values by trimming whitespace', () => {
    const normalized = normalizeMarketplaceInstallSourceDescriptor({
      ...validMarketplaceInstallSourceDescriptor,
      repoUrl: '  https://github.com/chrishacia/devholm-plugins.git  ',
      ref: '  refs/tags/calendar-v0.1.0  ',
      expectedPluginId: '  calendar  ',
    });

    expect(normalized.repoUrl).toBe('https://github.com/chrishacia/devholm-plugins.git');
    expect(normalized.ref).toBe('refs/tags/calendar-v0.1.0');
    expect(normalized.expectedPluginId).toBe('calendar');
  });
});

describe('plugin-install-source-descriptor: validation', () => {
  it('fails invalid repo URLs', () => {
    const errors = validateMarketplaceInstallSourceDescriptor(
      invalidMarketplaceInstallSourceDescriptors[0]
    );
    expect(errors.some((error) => error.includes('repoUrl'))).toBe(true);
  });

  it('enforces explicit ref policy', () => {
    const errors = validateMarketplaceInstallSourceDescriptor(
      invalidMarketplaceInstallSourceDescriptors[1]
    );
    expect(errors).toContain('ref is required; no implicit default is allowed');
  });

  it('fails unsafe ref values', () => {
    const errors = validateMarketplaceInstallSourceDescriptor(
      invalidMarketplaceInstallSourceDescriptors[2]
    );
    expect(errors.some((error) => error.includes('unsafe'))).toBe(true);
  });

  it('rejects plugin subdirectory traversal', () => {
    const errors = validateMarketplaceInstallSourceDescriptor(
      invalidMarketplaceInstallSourceDescriptors[3]
    );
    expect(errors.some((error) => error.includes('pluginSubdirectory'))).toBe(true);
  });

  it('rejects manifest path traversal', () => {
    const errors = validateMarketplaceInstallSourceDescriptor(
      invalidMarketplaceInstallSourceDescriptors[4]
    );
    expect(errors.some((error) => error.includes('manifestPath'))).toBe(true);
  });

  it('validates expected pluginId shape', () => {
    const errors = validateMarketplaceInstallSourceDescriptor(
      invalidMarketplaceInstallSourceDescriptors[5]
    );
    expect(errors.some((error) => error.includes('expectedPluginId'))).toBe(true);
  });

  it('validates expected version shape', () => {
    const errors = validateMarketplaceInstallSourceDescriptor(
      invalidMarketplaceInstallSourceDescriptors[6]
    );
    expect(errors.some((error) => error.includes('expectedVersion'))).toBe(true);
  });

  it('accepts integrity metadata placeholders without runtime enforcement', () => {
    const parsed = parseMarketplaceInstallSourceDescriptor(validMarketplaceInstallSourceDescriptor);
    expect(parsed.errors).toEqual([]);
    expect(parsed.descriptor?.integrity?.packageChecksum).toBe('sha256-placeholder');
  });
});

describe('plugin-install-source-descriptor: safety guardrails', () => {
  it('performs no network calls while parsing/validating descriptors', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('network call should not happen');
    });

    const parsed = parseMarketplaceInstallSourceDescriptor(validMarketplaceInstallSourceDescriptor);
    const errors = validateMarketplaceInstallSourceDescriptor(
      validMarketplaceInstallSourceDescriptor
    );

    expect(parsed.errors).toEqual([]);
    expect(errors).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
