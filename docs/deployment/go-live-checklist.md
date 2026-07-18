# APCO — Go-Live Checklist

## Pre-Launch Checklist

### Infrastructure
- [ ] Neon PostgreSQL project created and `DATABASE_URL` tested
- [ ] Neon connection pooler enabled (`?pgbouncer=true` in URL)
- [ ] All Prisma migrations applied via `npm run prisma:deploy` on staging DB
- [ ] Render Web Service created with correct build/start commands
- [ ] Vercel project created, `VITE_API_URL` pointing to Render URL
- [ ] `vercel.json` with SPA rewrites committed and deployed
- [ ] Custom domain configured on Vercel (if applicable)
- [ ] SSL certificates active on both Render and Vercel

### Security
- [ ] `JWT_SECRET` — generated with `crypto.randomBytes(32)`, minimum 32 chars
- [ ] `JWT_REFRESH_SECRET` — different from `JWT_SECRET`, minimum 32 chars
- [ ] `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` — set as env var (NOT file path) on Render
- [ ] `.env` and `secrets/` directories confirmed in `.gitignore`
- [ ] No hardcoded credentials anywhere in source code
- [ ] Rate limiters active on `/auth/login`, `/auth/email-verification/resend`, `/auth/password-reset/request`
- [ ] CORS origin locked to production Vercel URL (no wildcards)
- [ ] Helmet middleware active (check `app.use(helmet())` in `app.ts`)

### Email
- [ ] `RESEND_API_KEY` configured and verified
- [ ] Test email sent to a real inbox from Resend dashboard
- [ ] From address (`security@apco.local`) updated to a verified Resend sender domain
- [ ] Email verification flow tested end-to-end (register → email → click link → login works)
- [ ] Password reset email flow tested end-to-end

### Authentication & RBAC
- [ ] Email verification enforced: unverified login returns `{ emailNotVerified: true }`
- [ ] MFA enforcement: SystemAdmin/Manager without MFA returns `{ mfaSetupRequired: true }`
- [ ] MFA setup flow tested for at least one Admin account
- [ ] Refresh token rotation verified (old token invalidated after refresh)
- [ ] Token reuse attack detection verified (whole family revoked on reuse)

### Google Drive
- [ ] Root Drive folder accessible by service account
- [ ] Test project created — subfolders (Gallery, Deliverables, etc.) auto-created
- [ ] File upload to each category tested
- [ ] File download via signed stream tested
- [ ] Client `Raw Uploads` restriction verified (403 on access attempt)

### Client Portal
- [ ] Client login works with verified email
- [ ] Client can view Gallery, Deliverables, Agreements, Invoices, Quotations
- [ ] Client cannot see Raw Uploads
- [ ] Client cannot access another client's project files
- [ ] Pagination headers (`X-Total-Count`, `X-Total-Pages`) correct

### Notifications
- [ ] Notification bell shows unread count
- [ ] Upload triggers client notification
- [ ] Mark as read and delete work
- [ ] Notification isolation: users only see their own notifications

### Database
- [ ] Performance indexes confirmed active (run `EXPLAIN ANALYZE` on Neon)
- [ ] `File_projectId_category_idx` in use for gallery queries
- [ ] `Notification_userId_isRead_createdAt_idx` in use for notification queries
- [ ] No N+1 queries identified in API responses

---

## Post-Launch Monitoring Checklist

Run these checks daily for the first week, then weekly thereafter.

### Health Checks
- [ ] Render dashboard → service status is **Live**
- [ ] Health endpoint responds: `GET <API_URL>/health` → 200
- [ ] No crash restarts in Render logs
- [ ] Neon dashboard → DB CPU and connections within normal range

### Security Monitoring
- [ ] Review `SecurityEvent` table for unusual patterns:
  ```sql
  SELECT "eventType", COUNT(*) as count, DATE("createdAt") as day
  FROM "SecurityEvent"
  WHERE "createdAt" > NOW() - INTERVAL '7 days'
  GROUP BY "eventType", day
  ORDER BY day DESC, count DESC;
  ```
- [ ] Watch for spikes in `FAILED_LOGIN` and `ACCOUNT_LOCKED` events
- [ ] Check `REFRESH_TOKEN_REUSE` events (indicates stolen tokens)
- [ ] Review `AuditLog` for unexpected `FILE_DELETE` actions

### Performance
- [ ] P95 API response time < 500ms (check Render metrics)
- [ ] Neon query time < 100ms for indexed queries
- [ ] File upload time < 30s for files up to 50MB
- [ ] No memory leaks in Render (RAM stable over 24 hours)

### Business Metrics
- [ ] New user registrations working
- [ ] New project creation triggers Drive folder structure
- [ ] Invoice and quotation PDFs generating correctly
- [ ] Notification delivery rate > 99%

---

## Rollback Procedure

Use these steps if a critical issue is discovered after deployment.

### Step 1: Identify the Issue
- Check Render logs for error messages
- Check Neon query logs for failing queries
- Identify which deploy introduced the regression

### Step 2: Rollback Backend (Render)
1. Render Dashboard → your service → **Deploys**
2. Find the last known-good deploy
3. Click **Redeploy** on that commit
4. Render rebuilds and restarts from the previous version

**If a migration caused the issue:**
```sql
-- Connect to Neon and inspect recent migrations
SELECT * FROM "_prisma_migrations" ORDER BY "finished_at" DESC LIMIT 5;
```
> ⚠️ Prisma does NOT automatically reverse migrations. If data was altered, restore from a Neon branch snapshot.

**Restore from Neon branch (safe data recovery):**
1. Neon Dashboard → **Branches** → **Restore**
2. Select a point-in-time before the bad deploy
3. Restore to a **new branch** — verify data integrity
4. Promote the restored branch to `main` if confirmed safe

### Step 3: Rollback Frontend (Vercel)
1. Vercel Dashboard → your project → **Deployments**
2. Find the last stable deployment
3. Click **...** → **Promote to Production**
4. Vercel instantly switches traffic back

### Step 4: Notify Users
- Post a maintenance notice on the app (or via email)
- Update status page if applicable

### Step 5: Post-Incident Review
After restoring service:
1. Document the root cause
2. Write a regression test covering the scenario
3. Update deployment checklist with the new check
4. Review whether the issue was caught by `npm run test` — if not, add a test

---

## Emergency Contacts

| Role | Responsibility |
|---|---|
| Backend Engineer | Render service, API, Prisma migrations |
| Frontend Engineer | Vercel deployment, React portal |
| DevOps / Cloud | Neon DB, Google Drive service account |

---

## Launch Readiness Assessment

| Area | Status | Notes |
|---|---|---|
| ✅ TypeScript build | **PASS** | Zero errors |
| ✅ Email verification enforcement | **COMPLETE** | Blocks login until verified |
| ✅ MFA enforcement (Admin/Manager) | **COMPLETE** | Returns `mfaSetupRequired: true` |
| ✅ Public verification resend | **COMPLETE** | Rate-limited, enum-safe |
| ✅ ACCOUNT_LOCKED security event | **COMPLETE** | Distinct from ACCOUNT_LOCK |
| ✅ Pagination on file listing | **COMPLETE** | X-Total-Count headers |
| ✅ DB performance indexes | **COMPLETE** | Migration 000005 |
| ✅ Google Drive JSON credentials | **COMPLETE** | Production env var support |
| ✅ Deployment guides | **COMPLETE** | Render, Neon, Vercel, Drive |
| ⚠️ Email from address | **BLOCKER** | Must use verified Resend sender domain |
| ⚠️ Virus scanning | **OPEN** | Files not scanned on upload |
| ⚠️ Render free-tier cold starts | **LOW** | Upgrade to Starter plan for production |
| ⚠️ Drive quota alerts | **LOW** | No automated quota monitoring |
