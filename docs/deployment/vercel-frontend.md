# APCO Frontend — Vercel Deployment Guide

## Prerequisites
- A [Vercel](https://vercel.com) account
- Your backend API URL from Render (e.g., `https://apco-api.onrender.com`)
- The frontend is a **Vite + React** app

---

## 1. Import the Project

1. In Vercel Dashboard → **Add New** → **Project**
2. Import your GitHub repository
3. Vercel auto-detects Vite — confirm the following settings:

| Setting | Value |
|---|---|
| **Framework Preset** | `Vite` |
| **Root Directory** | `./` (or your frontend subfolder if monorepo) |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

---

## 2. Set Environment Variables

In Vercel → your project → **Settings** → **Environment Variables**:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://apco-api.onrender.com` |

> ℹ️ All Vite env vars must be prefixed with `VITE_` to be exposed to the browser bundle.

Set it for all environments: **Production**, **Preview**, **Development**.

---

## 3. Configure `vercel.json`

Create a `vercel.json` in the frontend root to handle client-side routing (React Router):

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

This prevents 404 errors on page refresh for routes like `/dashboard`, `/gallery`, etc.

---

## 4. Deploy

Click **Deploy**. Vercel will:
1. Install dependencies
2. Run `npm run build`
3. Deploy the `dist/` folder to its global CDN

Your app will be live at:
```
https://apco-<hash>.vercel.app
```

---

## 5. Custom Domain (Optional)

In Vercel → your project → **Settings** → **Domains**:
1. Add your domain (e.g., `app.apco.in`)
2. Update your DNS CNAME to point to `cname.vercel-dns.com`
3. Vercel provisions SSL automatically

After adding the domain, update Render's `CORS_ORIGIN` environment variable to match:
```
CORS_ORIGIN=https://app.apco.in
```

---

## 6. Preview Deployments

Every pull request automatically gets a unique preview URL. Use these to test changes before merging to `main`.

---

## 7. Troubleshooting

| Error | Fix |
|---|---|
| `404` on page refresh | Ensure `vercel.json` with rewrites is committed |
| `CORS blocked` | Ensure backend `CORS_ORIGIN` matches your Vercel domain exactly (no trailing slash) |
| `VITE_API_URL undefined` | Variable must be set in Vercel dashboard, not just in local `.env` |
| API calls return `502` | Check Render service is running — free-tier Render spins down after inactivity |
