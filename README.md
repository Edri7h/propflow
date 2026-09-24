# PROPFlow

PROPFlow is a property maintenance management system with server-enforced role access for tenants, owners, technicians, and administrators. It uses React/Vite, Tailwind CSS, Express, PostgreSQL, Drizzle ORM, JWTs in HTTP-only cookies, and bcrypt.

## Quick start

1. Create a PostgreSQL database: `createdb propflow`
2. Copy `server/.env.example` to `server/.env`, set `DATABASE_URL` and a strong `JWT_SECRET`.
3. Copy `client/.env.example` to `client/.env`.
4. Install packages: `npm run install:all`
5. Apply database schema: `npm run db:migrate --prefix server`
6. Add demo records: `npm run db:seed --prefix server`
7. Start both apps: `npm run dev`

### Render demo deployment

For a demonstration deployment without shell access, set the Render **Start Command** to `npm run start:deploy`. It applies migrations and runs the idempotent demo seed before starting the API. This creates the documented demo accounts only when they do not already exist; remove this command in a real production deployment after creating managed user accounts.

Client: http://localhost:5173. API: http://localhost:5000.

For schema maintenance: `npm run db:generate --prefix server`, then `npm run db:migrate --prefix server`. The generated initial migration is included under `server/drizzle/`.

## Demo credentials (development only)

| Role | Username | Password |
|---|---|---|
| Admin | admin | Admin@123 |
| Tenant | alice.tenant | Tenant@123 |
| Owner | bob.owner | Owner@123 |
| Technician | carlos.technician | Tech@123 |

Change these credentials and `JWT_SECRET` before deployment.

## Architecture and access rules

`client/` contains the Vite React interface, authentication context, protected routing, dashboard, and role-aware navigation. `server/` provides modular Express middleware/routes, Drizzle schema/migrations/seed data, centralized errors, validation, and cookie JWT auth.

Database tables: `users`, `properties`, `units`, and `maintenance_requests`; all relationship fields have foreign keys and query indexes. APIs use `{ success, data }` responses and enforce restrictions on the server: tenants see only their assigned unit and requests, owners see only their properties, technicians see only assigned work, and admins can administer all records. Technician transitions are limited to Assigned → In Progress → Resolved.

Endpoints: `/api/auth/{login,logout,me}`, `/api/dashboard/stats`, and CRUD resources at `/api/{properties,units,maintenance,users}`. Maintenance additionally supports `PATCH /:id/status` and `PATCH /:id/resolution`.
