import '@testing-library/jest-dom';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: () => new Headers(),
}));

// Mock database with stateful site_settings
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__mockSiteSettings = new Map<
  string,
  { key: string; value: string; type: string }
>();

class QueryBuilder {
  private whereColumn: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private whereValue: any = null;
  private selectCols: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  where(column: string, op: string | any = '=', value?: any): this {
    if (arguments.length === 2) {
      // where('key', value) format
      this.whereColumn = column;
      this.whereValue = op;
    } else {
      // where('key', '=', value) format (we only support '=' for now)
      this.whereColumn = column;
      this.whereValue = value;
    }
    return this;
  }

  select(cols: string | string[]): this {
    this.selectCols = Array.isArray(cols) ? cols : [cols];
    return this;
  }

  async first() {
    if (this.whereColumn === null || this.whereValue === null) return null;
    // For 'key' column, look up directly since we index by key
    if (this.whereColumn === 'key') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (globalThis as any).__mockSiteSettings.get(this.whereValue);
      return result || null;
    }
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async insert(data: any) {
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__mockSiteSettings.set(item.key, item);
    }
    return this;
  }

  async del() {
    if (this.whereColumn === null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__mockSiteSettings.clear();
    } else if (this.whereColumn === 'key') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__mockSiteSettings.delete(this.whereValue);
    }
    return this;
  }
}

vi.mock('@/db', () => ({
  getDb: vi.fn(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (_tableName: any) => new QueryBuilder();
  }),
}));

// Global test utilities
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock matchMedia
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: vi.fn().mockImplementation((query: any) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
