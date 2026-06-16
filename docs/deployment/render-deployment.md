# APCO Backend — Render Deployment Guide

## Prerequisites
- A [Render](https://render.com) account
- Your PostgreSQL `DATABASE_URL` from Neon (see `neon-postgresql.md`)
- Your Google Drive service account JSON (see `environment-variables.md`)

---

## 1. Create a Web Service

1. In Render Dashboard → **New** → **Web Service**
2. Connect your GitHub repository (or use **Deploy from Git URL**)
3. Set the following options:

| Setting | Value |
|---|---|
| **Name** | `apco-backend` |
| **Region** | Choose closest to your users |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install && npx prisma generate && npm run build` |
| **Start Command** | `npm run prisma:deploy && node dist/server.js` |
| **Instance Type** | `Starter` (512 MB RAM) or higher |

> ⚠️ The Start Command runs `prisma migrate deploy` automatically on every deploy — this is safe for production (it only applies pending migrations, never drops data).

---

## 2. Set Environment Variables

In Render → your service → **Environment** tab, add all variables from `environment-variables.md`.

Critical variables:

```
NODE_ENV=production
DATABASE_URL=<your Neon connection string>
JWT_SECRET=<generated secret>
JWT_REFRESH_SECRET=<generated secret>
APP_URL=https://<your-service>.onrender.com
CORS_ORIGIN=https://<your-vercel-app>.vercel.app
GOOGLE_DRIVE_FOLDER_ID=<root folder ID>
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON=<full JSON string>
```

---

## 3. Health Check

Configure Render's health check to verify the service is running:

- **Health Check Path**: `/health` (or `/` if not implemented)
- **Health Check Timeout**: `30s`

---

## 4. Deploy

Click **Save** → **Manual Deploy** → **Deploy latest commit**.

Watch the build logs — look for:
```
✔ Generated Prisma Client
[prisma migrate deploy] All migrations applied
Server running on port 3000
Google Drive: authenticated ✔
```

---

## 5. Custom Domain (Optional)

In Render → your service → **Settings** → **Custom Domains**:
- Add your domain (e.g., `api.apco.app`)
- Render provides a free SSL certificate automatically

---

## 6. Render `render.yaml` (Infrastructure as Code)

Optionally, add this file to your repository root to automate Render provisioning:

```yaml
services:
  - type: web
    name: apco-backend
    runtime: node
    plan: starter
    buildCommand: npm install && npx prisma generate && npm run build
    startCommand: npm run prisma:deploy && node dist/server.js
    healthCheckPath: /
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        sync: false
      - key: JWT_SECRET
        generateValue: true
      - key: JWT_REFRESH_SECRET
        generateValue: true
      - key: APP_URL
        sync: false
      - key: CORS_ORIGIN
        sync: false
      - key: GOOGLE_DRIVE_FOLDER_ID
        sync: false
      - key: GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON
        sync: false
```

---

## Troubleshooting

| Error | Fix |
|---|---|
| `PrismaClientInitializationError` | Check `DATABASE_URL` is set and Neon allows connections from Render IPs |
| `Google Drive credentials are not configured` | Verify `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` is valid JSON (not truncated) |
| `Port already in use` | Render assigns the port automatically via `$PORT` — ensure `env.PORT` reads from env |
| `CORS blocked` | Ensure `CORS_ORIGIN` matches your exact Vercel URL, no trailing slash |
