# Custom API Routes

#

# Register custom API endpoints in src/user/extensions/api/index.ts.

# DevHolm's catch-all /api route dispatches to those handlers.

#

# Example structure:

# src/user/extensions/api/index.ts ← route registry

# src/user/extensions/api/telemetry/public.ts ← handler implementation

# src/user/extensions/api/telemetry/admin.ts ← handler implementation

#

# Example registry entry:

# {

# path: '/api/telemetry',

# handlers: { GET, POST },

# }

#

# The framework never modifies this directory.
