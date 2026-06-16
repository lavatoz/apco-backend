-- Phase 6: Production Performance Indexes
-- Migration: 20260613000005_add_performance_indexes

-- Index: File(projectId, category)
-- Optimises GET /api/files/project/:projectId queries filtered by category
CREATE INDEX IF NOT EXISTS "File_projectId_category_idx" ON "File"("projectId", "category");

-- Index: Notification(userId, isRead, createdAt)
-- Optimises notification bell queries (unread count + ordered list per user)
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt" DESC);

-- Index: RefreshToken(tokenHash)
-- Explicit index to ensure fast lookup during token rotation / reuse detection
-- Note: tokenHash already has a @unique constraint which implies an index,
-- but this makes the intent explicit for query planners.
CREATE INDEX IF NOT EXISTS "RefreshToken_tokenHash_idx" ON "RefreshToken"("tokenHash");
