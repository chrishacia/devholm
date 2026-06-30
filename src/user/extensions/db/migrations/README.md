# Custom Database Migrations

#

# Add your custom table migrations here.

# Naming convention: u_YYYYMMDD_NNN_description.ts

# The 'u\_' prefix marks these as user migrations.

#

# Example: u_20260118_001_add_telemetry_pings.ts

#

# knexfile.js scans both:

# ./src/core/db/migrations (framework tables — never modify)

# ./src/user/extensions/db/migrations (your tables — full ownership)

#

# Run with: pnpm db:migrate

# Or create a new migration with: pnpm devholm new:migration <name>
