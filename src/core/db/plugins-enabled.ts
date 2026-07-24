import { getDb } from './index';

function parseBooleanSetting(value: unknown): boolean {
  if (value === true || value === 1) {
    return true;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === 'true' ||
      normalized === '1' ||
      normalized === 't' ||
      normalized === 'yes' ||
      normalized === 'on'
    );
  }

  return false;
}

export async function isPluginEnabledForRequest(pluginId: string | undefined): Promise<boolean> {
  if (!pluginId) {
    return true;
  }

  const db = getDb();

  const lifecycleRow = await db('devholm_plugins')
    .select('enabled', 'lifecycle_state')
    .where('plugin_id', pluginId)
    .first();

  if (lifecycleRow) {
    const lifecycleState = String(lifecycleRow.lifecycle_state ?? '');
    const installed = lifecycleState === 'installed' || lifecycleState === 'disabled';
    return installed && parseBooleanSetting(lifecycleRow.enabled);
  }

  // Canonical lifecycle row is now the only runtime authority for plugin enablement.
  return false;
}
