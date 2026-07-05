// Server-only marker module
// This import will fail in browser/non-server contexts because the module doesn't exist
// Import a non-existent server-only runtime marker to enforce build-time boundary
import '__DEVHOLM_SERVER_ONLY_RUNTIME__';

export {};
