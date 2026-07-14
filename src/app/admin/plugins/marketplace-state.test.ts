import { describe, expect, it } from 'vitest';
import {
  deriveMarketplaceUiState,
  getMarketplaceUiStateDefinition,
  MARKETPLACE_UI_STATE_DEFINITIONS,
} from './marketplace-state';

describe('marketplace state model', () => {
  it('returns not_installed for default uninstalled plugin', () => {
    const state = deriveMarketplaceUiState({
      installed: false,
      enabled: false,
      trustOutcome: 'allow',
      signatureDecision: 'trusted',
    });

    expect(state).toBe('not_installed');
    expect(getMarketplaceUiStateDefinition(state).label).toBe('Not Installed');
  });

  it('fails safely to unsupported definition for unknown state', () => {
    const definition = getMarketplaceUiStateDefinition('totally-unknown-state');
    expect(definition.label).toBe('Unsupported');
    expect(definition.disabledActions).toContain('install');
  });

  it('derives blocked trust states correctly', () => {
    expect(
      deriveMarketplaceUiState({
        installed: false,
        enabled: false,
        signatureDecision: 'untrusted',
        trustOutcome: 'unknown',
      })
    ).toBe('untrusted');

    expect(
      deriveMarketplaceUiState({
        installed: false,
        enabled: false,
        signatureDecision: 'trusted',
        trustOutcome: 'deny',
        trustReasonCode: 'publisher-revoked',
      })
    ).toBe('revoked');
  });

  it('maps operation and recovery states before healthy states', () => {
    expect(
      deriveMarketplaceUiState({
        installed: true,
        enabled: true,
        operationStatus: 'in_progress',
      })
    ).toBe('updating');

    expect(
      deriveMarketplaceUiState({
        installed: true,
        enabled: true,
        recoveryRequired: true,
      })
    ).toBe('recovery_required');
  });

  it('provides complete definitions for required states', () => {
    expect(MARKETPLACE_UI_STATE_DEFINITIONS.enabled.allowedActions).toContain('disable');
    expect(MARKETPLACE_UI_STATE_DEFINITIONS.blocked.disabledActions).toContain('install');
    expect(MARKETPLACE_UI_STATE_DEFINITIONS.rollback_available.allowedActions).toContain(
      'rollback'
    );
  });
});
