# APCO Database Backup Strategy (Production)

To ensure high availability, data integrity, and disaster recovery readiness, APCO implements a multi-tiered database backup strategy.

## 1. Daily Automated Backups

- **Frequency**: Every 24 hours at 02:00 UTC (off-peak hours).
- **Type**: Logical backup (`pg_dump`) to capture schema and data structure.
- **Storage**: Uploaded automatically to a dedicated Cloudflare R2 backup bucket with AES-256 server-side encryption enabled.
- **Validation**: Post-backup automation spins up a temporary PostgreSQL Docker container daily, restores the backup, and verifies schema integrity.

## 2. Weekly Snapshots

- **Frequency**: Every Sunday at 03:00 UTC.
- **Type**: Physical block-level volume snapshots of the production database storage volumes.
- **Storage**: Multi-region replicated storage bucket.
- **Purpose**: Fast full-machine recovery in case of primary database cluster failures.

## 3. Retention Policy

- **Daily Backups**: Retained for exactly **30 days**. Automated lifecycle policies in R2 expire and delete backups older than 30 days.
- **Weekly Snapshots**: Retained for **12 weeks**.
- **Monthly Backups**: The first backup of each month is tagged as "Historical" and retained for **1 year** to meet compliance requirements.

## 4. Disaster Recovery Procedure (DR)

### Verification of Backups
To restore the latest backup:
1. Fetch the encrypted dump file from the backup bucket.
2. Decrypt the dump file.
3. Run target restore:
   ```bash
   pg_restore --clean --no-owner -h <DB_HOST> -U <DB_USER> -d <DB_NAME> backup_file.dump
   ```
4. Verify application connectivity and execute the health check `/api/health`.
