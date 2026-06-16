# Google Drive — Recovery & Key Rotation Guide

## 1. Backup Strategy

### What is stored in Google Drive?
All uploaded files (Gallery, Deliverables, Agreements, Invoices, Quotations, Raw Uploads) are stored in Google Drive under a structured hierarchy:
```
Root Folder (GOOGLE_DRIVE_FOLDER_ID)
  └── Client Name
       └── Project Name
            ├── Gallery/
            ├── Deliverables/
            ├── Agreements/
            ├── Invoices/
            ├── Quotations/
            └── Raw Uploads/
```

### Database ↔ Drive relationship
- Each file has a `googleDriveFileId` stored in the `File` table.
- Files are **soft-deleted** in the database (`deletedAt`), then hard-deleted from Drive.
- To recover a deleted file, it must be restored from **Google Drive Trash** AND the database `deletedAt` cleared.

---

## 2. Recovering Deleted Files

### Step 1: Restore from Google Drive Trash
1. Go to [drive.google.com](https://drive.google.com)
2. Left sidebar → **Trash**
3. Find the deleted file and click **Restore**

### Step 2: Un-delete in the Database
```sql
-- Find the soft-deleted file record
SELECT id, "originalName", "googleDriveFileId", "deletedAt"
FROM "File"
WHERE "googleDriveFileId" = '<restored-drive-file-id>'
  AND "deletedAt" IS NOT NULL;

-- Restore it
UPDATE "File"
SET "deletedAt" = NULL, "updatedAt" = NOW()
WHERE "googleDriveFileId" = '<restored-drive-file-id>';
```

> ⚠️ Google Drive Trash is permanently cleared after **30 days**. Files deleted more than 30 days ago cannot be recovered from Drive.

---

## 3. Service Account Key Rotation

Service account keys should be rotated regularly (every 90 days recommended) or immediately if a key is compromised.

### Step 1: Create a New Key
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **IAM & Admin** → **Service Accounts**
3. Select your APCO service account
4. **Keys** tab → **Add Key** → **Create new key** → **JSON**
5. Download the new JSON key file

### Step 2: Update Environment Variables

**Production (Render):**
1. Render Dashboard → your service → **Environment**
2. Update `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` with the new JSON key contents
3. Click **Save** — Render will redeploy automatically

**Local Development:**
1. Replace `./secrets/service-account.json` with the new key file
2. Restart the dev server: `npm run dev`

### Step 3: Verify the New Credentials
```bash
# Call the health check endpoint (or any Drive operation)
curl https://apco-api.onrender.com/health
```
Look for `"googleDrive": "ok"` in the response.

### Step 4: Revoke the Old Key
1. Return to Google Cloud Console → Service Accounts → your account → **Keys**
2. Find the old key (by its key ID) → click the three-dot menu → **Delete**

> ⚠️ Only revoke the old key AFTER confirming the new key works in production.

---

## 4. Root Folder Recovery

If the root Drive folder (`GOOGLE_DRIVE_FOLDER_ID`) is deleted:

1. Restore it from Google Drive Trash (if within 30 days)
2. If the folder ID changes, update `GOOGLE_DRIVE_FOLDER_ID` in all environments
3. Sub-folder IDs stored in the `Project` table (`driveFolderId`, `galleryFolderId`, etc.) also need verification

### Audit orphaned files after recovery:
```sql
-- Files that have a Drive ID but no project folder configured
SELECT f.id, f."originalName", f."googleDriveFileId", p.name AS project,
       p."driveFolderId"
FROM "File" f
JOIN "Project" p ON f."projectId" = p.id
WHERE p."driveFolderId" IS NULL AND f."deletedAt" IS NULL;
```

---

## 5. Service Account Permissions

The service account must have the following Google Drive permission:
- **Role**: `Editor` on the root folder (inherited by all sub-folders)

To verify or re-grant permissions:
1. In Google Drive, right-click the root folder → **Share**
2. Add the service account email (format: `name@project.iam.gserviceaccount.com`)
3. Set role to **Editor**
4. Uncheck "Notify people" → **Share**

---

## 6. Emergency Contacts / Escalation

| Issue | Action |
|---|---|
| Drive API quota exceeded | Check [Google Cloud Quotas](https://console.cloud.google.com/quotas) → request increase |
| Service account suspended | Re-create in Google Cloud Console with same permissions |
| Root folder permanently deleted | Restore from Neon DB backup, re-create Drive structure, update project folder IDs |
