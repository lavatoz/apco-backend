# APCO Backend — Neon PostgreSQL Setup Guide

## What is Neon?
[Neon](https://neon.tech) is a serverless PostgreSQL platform — it provides free-tier branching-based Postgres with automatic scaling and connection pooling, ideal for this stack.

---

## 1. Create a Neon Project

1. Go to [neon.tech](https://neon.tech) → **Sign up / Log in**
2. Click **New Project**
3. Choose:
   - **Name**: `apco`
   - **Region**: Closest to your Render region
   - **PostgreSQL version**: `16` (recommended)
4. Click **Create Project**

---

## 2. Get Your Connection String

1. In the Neon dashboard → your project → **Connection Details**
2. Select **Prisma** from the connection string dropdown
3. Copy the connection string — it looks like:
   ```
   postgresql://username:password@ep-xxx-xxx.us-east-2.aws.neon.tech/apco?sslmode=require
   ```
4. Set this as `DATABASE_URL` in your `.env` (local) and Render environment variables (production)

> ⚠️ Always use `?sslmode=require` — Neon requires SSL connections.

---

## 3. Run Migrations

### Local Development
```bash
# Apply existing migrations
npx prisma migrate deploy

# Or create and apply new migrations during development
npx prisma migrate dev --name <migration-name>
```

### Production (Render)
Migrations are applied automatically on startup via the start command:
```bash
npm run prisma:deploy && node dist/server.js
```

---

## 4. Connection Pooling (Production)

For production, use Neon's **connection pooler** to handle many concurrent connections efficiently:

1. In Neon dashboard → your project → **Connection Details**
2. Toggle **Connection pooling** → **ON**
3. Copy the **pooled connection string** (uses port `5432` via PgBouncer)
4. Use this pooled URL as `DATABASE_URL` in production

```
postgresql://username:password@ep-xxx-xxx-pooler.us-east-2.aws.neon.tech/apco?sslmode=require&pgbouncer=true
```

> ℹ️ Add `&pgbouncer=true` to the connection string when using pooling to disable Prisma's prepared statements (required for PgBouncer compatibility).

---

## 5. Branching Strategy

Neon supports database **branches** (like Git branches). Use this to safely test migrations:

| Branch | Purpose |
|---|---|
| `main` | Production database |
| `dev` | Development and migration testing |
| `staging` | Pre-production verification |

### Creating a branch:
1. Neon Dashboard → **Branches** → **New Branch**
2. Branch from `main` (inherits all data)
3. Test migrations safely without touching production

---

## 6. Backup Strategy

| Strategy | Details |
|---|---|
| **Automatic Backups** | Neon retains 7-day point-in-time recovery on all plans |
| **Manual Export** | `pg_dump postgresql://... > backup.sql` |
| **Branch Snapshots** | Create a Neon branch before major migrations — serves as an instant snapshot |

### Recommended backup schedule:
```bash
# Daily export (run via cron or CI)
pg_dump "$DATABASE_URL" --no-owner --no-acl -Fc > backup-$(date +%Y%m%d).dump
```

---

## 7. Point-in-Time Recovery

If data is accidentally lost or corrupted:

1. Neon Dashboard → **Branches** → **Restore**
2. Select a restore point (up to 7 days back on free tier, 30 days on paid)
3. Restore to a new branch first to verify, then promote to `main`

---

## 8. Monitoring

- Neon Dashboard → **Monitoring** → View query performance, CPU, connections
- Use `EXPLAIN ANALYZE` in Neon's SQL Editor to verify indexes are used:

```sql
EXPLAIN ANALYZE
SELECT * FROM "File"
WHERE "projectId" = 'some-id' AND "category" = 'Gallery'
ORDER BY "createdAt" DESC
LIMIT 20;
```

Expected: `Index Scan using File_projectId_category_idx`
