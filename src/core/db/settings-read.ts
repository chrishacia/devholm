import { getDb } from './index';

function parseValue(value: string | null, type: string): unknown {
  if (value === null || value === '') {
    return null;
  }

  switch (type) {
    case 'number':
      return Number(value);
    case 'boolean':
      return value === 'true' || value === '1';
    case 'json':
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    default:
      return value;
  }
}

export async function getSettingForRequest(key: string): Promise<unknown> {
  const row = await getDb()('site_settings').select('value', 'type').where('key', key).first();
  if (!row) {
    return null;
  }

  return parseValue(row.value as string | null, String(row.type ?? 'string'));
}

export async function getSettingsForRequest(keys: string[]): Promise<Record<string, unknown>> {
  if (keys.length === 0) {
    return {};
  }

  const rows = await getDb()('site_settings').select('key', 'value', 'type').whereIn('key', keys);

  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[String(row.key)] = parseValue(row.value as string | null, String(row.type ?? 'string'));
  }

  return result;
}
