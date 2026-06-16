# APCO — Production Deployment Checklist

## Pre-Deployment

### Database
- [ ] Neon PostgreSQL project created
- [ ] Connection string obtained (with `?sslmode=require`)
- [ ] Connection pooler enabled (add `&pgbouncer=true` to pooled URL)
- [ ] `prisma migrate deploy` tested locally against staging DB branch
- [ ] All migrations present in `prisma/migrations/` directory

### Google Drive
- [ ] Google Cloud project created
- [ ] Google Drive API enabled
- [ ] Service account created with Editor role on root folder
- [ ] JSON key downloaded and stored securely (NOT committed to git)
- [ ] Root Drive folder created and its ID noted (`GOOGLE_DRIVE_FOLDER_ID`)
- [ ] Service account granted access to the root folder

### Environment Variables
- [ ] All variables from `docs/deployment/environment-variables.md` documented
- [ ] `JWT_SECRET` generated (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- [ ] `JWT_REFRESH_SECRET` generated (different from `JWT_SECRET`)
- [ ] `NODE_ENV=production` set
- [ ] `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` set (JSON string, NOT file path)
- [ ] `CORS_ORIGIN` matches exact Vercel frontend URL

### Security
- [ ] `.env` file added to `.gitignore`
- [ ] `secrets/` directory added to `.gitignore`
- [ ] No hardcoded credentials in source code
- [ ] Refresh token rotation enabled (verify `parentTokenHash` logic in auth module)
- [ ] Rate limiting configured on auth endpoints

---

## Backend Deployment (Render)

- [ ] Render Web Service created
- [ ] Repository connected to Render
- [ ] Build command set: `npm install && npx prisma generate && npm run build`
- [ ] Start command set: `npm run prisma:deploy && node dist/server.js`
- [ ] All environment variables added in Render dashboard
- [ ] First deploy triggered and build logs checked
- [ ] Health check passes after deploy
- [ ] `prisma migrate deploy` output shows all migrations applied

---

## Frontend Deployment (Vercel)

- [ ] Vercel project created and GitHub repo linked
- [ ] Framework preset: `Vite`
- [ ] `VITE_API_URL` env var set to Render backend URL
- [ ] `vercel.json` with SPA rewrites committed
- [ ] First deploy successful
- [ ] Frontend can reach backend API (no CORS errors)
- [ ] Custom domain configured (if applicable)

---

## Post-Deployment Verification

### API Smoke Tests
- [ ] `POST /api/auth/login` returns JWT
- [ ] `GET /api/files/project/:id` returns paginated results with X-Total-Count header
- [ ] `POST /api/files/upload` successfully uploads to Google Drive
- [ ] `GET /api/files/:id/download` streams file correctly
- [ ] `GET /api/notifications` returns user notifications
- [ ] Clients cannot access files with category `Raw Uploads`

### RBAC Verification
- [ ] Client can only see own project files
- [ ] Client cannot access other clients' files (403)
- [ ] Staff can only access assigned projects (403 for unassigned)
- [ ] Admin/Manager has full access
- [ ] Notification access is scoped to authenticated user

### Performance
- [ ] `GET /api/files/project/:id?page=1&limit=20` returns correct page
- [ ] `X-Total-Pages` header is accurate
- [ ] DB indexes confirmed active (run `EXPLAIN ANALYZE` on Neon)

---

## Ongoing Operations

### Key Rotation (every 90 days)
- [ ] New service account key created in Google Cloud Console
- [ ] `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` updated in Render
- [ ] Old key revoked after verifying new key works
- [ ] See `docs/deployment/google-drive-recovery.md` for full steps

### Database Backup
- [ ] Neon automatic backups verified (7-day retention)
- [ ] Manual export schedule configured (if needed)
- [ ] Recovery procedure tested via Neon branch restore

### Monitoring
- [ ] Render service alerts configured (CPU, memory, crash)
- [ ] Neon dashboard checked for slow queries
- [ ] AuditLog table reviewed periodically for anomalies

---

## Remaining Production Blockers

> Items below should be resolved before a public launch.

| # | Blocker | Severity | Notes |
|---|---|---|---|
| 1 | Email verification flow | Medium | RESEND_API_KEY must be configured; `emailVerified` field not enforced on login yet |
| 2 | File virus scanning | Medium | Files are not scanned before upload to Drive |
| 3 | Render free-tier cold starts | Low | Free Render spins down after inactivity — upgrade to Starter plan for production |
| 4 | Drive storage quota monitoring | Low | No alert if service account approaches Google Drive quota |
| 5 | MFA enforcement | Low | MFA is optional — enforce for admin/manager roles in production |
