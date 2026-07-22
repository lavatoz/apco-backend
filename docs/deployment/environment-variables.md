# APCO Backend — Environment Variable Reference

## Required Variables (All Environments)

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `JWT_SECRET` | HS256 signing secret (min 16 chars) | `a-very-long-random-secret-string` |
| `JWT_REFRESH_SECRET` | Separate secret for refresh tokens (min 16 chars) | `another-very-long-random-secret` |
| `APP_URL` | Public base URL of the backend API | `https://apco-api.onrender.com` |
| `BACKEND_URL` | Deployed backend API base URL | `https://apco-backend-production.up.railway.app` |
| `FRONTEND_URL` | Deployed frontend single page application URL | `https://your-vercel-app.vercel.app` |
| `CORS_ORIGIN` | Allowed frontend origin for CORS | `https://apco.vercel.app` |
| `GOOGLE_DRIVE_FOLDER_ID` | Root Google Drive folder ID for file storage | `1ABC...xyz` |

---

## Google Drive Credentials

### Production (Render / CI/CD)
Use the JSON environment variable. Paste the full contents of your service account key file:

```
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"..."}
```

> ⚠️ Do NOT commit this value to source control. Always set it via your hosting provider's secret manager or environment variable UI.

### Local Development
Use the key file path instead:

```
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./secrets/service-account.json
```

---

## Optional Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Environment (`development`, `production`, `test`) | `development` |
| `RESEND_API_KEY` | Resend email API key for transactional email | *(email disabled if blank)* |
| `VERIFICATION_BASE_URL` | Public base URL for document verification endpoint | `https://apco-backend-production.up.railway.app/api/verify` |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID | *(R2 disabled if blank)* |
| `R2_ACCESS_KEY` | Cloudflare R2 access key | *(R2 disabled if blank)* |
| `R2_SECRET_KEY` | Cloudflare R2 secret key | *(R2 disabled if blank)* |
| `R2_BUCKET` | Cloudflare R2 bucket name | *(R2 disabled if blank)* |

---

## Local Development `.env` Template

```dotenv
# Server
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000
BACKEND_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://username:password@ep-xxx.neon.tech/apco?sslmode=require

# JWT Secrets (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=
JWT_REFRESH_SECRET=

# Google Drive
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./secrets/service-account.json

# Email (optional)
RESEND_API_KEY=
```

---

## Production `.env` Template (Render/Railway)

```dotenv
# Server
PORT=3000
NODE_ENV=production
APP_URL=https://apco-backend-production.up.railway.app
BACKEND_URL=https://apco-backend-production.up.railway.app
FRONTEND_URL=https://your-vercel-app.vercel.app
CORS_ORIGIN=https://your-vercel-app.vercel.app

# Database
DATABASE_URL=postgresql://username:password@ep-xxx.neon.tech/apco?sslmode=require

# JWT Secrets
JWT_SECRET=
JWT_REFRESH_SECRET=

# Google Drive (JSON credentials, NOT file path)
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# Email (optional)
RESEND_API_KEY=
```
