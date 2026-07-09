-- Backfill display IDs for Client
-- 1. Ensure counter row exists
INSERT INTO "DocumentCounter" ("prefix", "type", "year", "lastValue")
VALUES ('CLI', 'DISPLAY_ID', EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 0)
ON CONFLICT ("prefix", "type", "year") DO NOTHING;

-- 2. Increment and Update
WITH count_to_backfill AS (
  SELECT COUNT(*)::INTEGER as cnt FROM "Client" WHERE "clientCode" IS NULL
),
increment_counter AS (
  UPDATE "DocumentCounter"
  SET "lastValue" = "lastValue" + (SELECT cnt FROM count_to_backfill)
  WHERE "prefix" = 'CLI' 
    AND "type" = 'DISPLAY_ID' 
    AND "year" = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
  RETURNING "lastValue"
),
ranked_rows AS (
  SELECT id, 
         ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) as rn
  FROM "Client"
  WHERE "clientCode" IS NULL
)
UPDATE "Client" c
SET "clientCode" = 'CLI-' || EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER || '-' || lpad(((ic."lastValue" - (SELECT cnt FROM count_to_backfill)) + rr.rn)::text, 4, '0')
FROM ranked_rows rr, increment_counter ic
WHERE c.id = rr.id AND c."clientCode" IS NULL;

-- 3. Verify
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Client" WHERE "clientCode" IS NULL) THEN
    RAISE EXCEPTION 'Migration verification failed: Client.clientCode contains NULL values after backfill';
  END IF;
END $$;

-- 4. Apply NOT NULL constraint
ALTER TABLE "Client" ALTER COLUMN "clientCode" SET NOT NULL;


-- Backfill display IDs for Project
-- 1. Ensure counter row exists
INSERT INTO "DocumentCounter" ("prefix", "type", "year", "lastValue")
VALUES ('PRJ', 'DISPLAY_ID', EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 0)
ON CONFLICT ("prefix", "type", "year") DO NOTHING;

-- 2. Increment and Update
WITH count_to_backfill AS (
  SELECT COUNT(*)::INTEGER as cnt FROM "Project" WHERE "projectCode" IS NULL
),
increment_counter AS (
  UPDATE "DocumentCounter"
  SET "lastValue" = "lastValue" + (SELECT cnt FROM count_to_backfill)
  WHERE "prefix" = 'PRJ' 
    AND "type" = 'DISPLAY_ID' 
    AND "year" = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
  RETURNING "lastValue"
),
ranked_rows AS (
  SELECT id, 
         ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) as rn
  FROM "Project"
  WHERE "projectCode" IS NULL
)
UPDATE "Project" p
SET "projectCode" = 'PRJ-' || EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER || '-' || lpad(((ic."lastValue" - (SELECT cnt FROM count_to_backfill)) + rr.rn)::text, 4, '0')
FROM ranked_rows rr, increment_counter ic
WHERE p.id = rr.id AND p."projectCode" IS NULL;

-- 3. Verify
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Project" WHERE "projectCode" IS NULL) THEN
    RAISE EXCEPTION 'Migration verification failed: Project.projectCode contains NULL values after backfill';
  END IF;
END $$;

-- 4. Apply NOT NULL constraint
ALTER TABLE "Project" ALTER COLUMN "projectCode" SET NOT NULL;


-- Backfill display IDs for Quotation
-- 1. Ensure counter row exists
INSERT INTO "DocumentCounter" ("prefix", "type", "year", "lastValue")
VALUES ('QUO', 'DISPLAY_ID', EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 0)
ON CONFLICT ("prefix", "type", "year") DO NOTHING;

-- 2. Increment and Update
WITH count_to_backfill AS (
  SELECT COUNT(*)::INTEGER as cnt FROM "Quotation" WHERE "quotationCode" IS NULL
),
increment_counter AS (
  UPDATE "DocumentCounter"
  SET "lastValue" = "lastValue" + (SELECT cnt FROM count_to_backfill)
  WHERE "prefix" = 'QUO' 
    AND "type" = 'DISPLAY_ID' 
    AND "year" = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
  RETURNING "lastValue"
),
ranked_rows AS (
  SELECT id, 
         ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) as rn
  FROM "Quotation"
  WHERE "quotationCode" IS NULL
)
UPDATE "Quotation" q
SET "quotationCode" = 'QUO-' || EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER || '-' || lpad(((ic."lastValue" - (SELECT cnt FROM count_to_backfill)) + rr.rn)::text, 4, '0')
FROM ranked_rows rr, increment_counter ic
WHERE q.id = rr.id AND q."quotationCode" IS NULL;

-- 3. Verify
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Quotation" WHERE "quotationCode" IS NULL) THEN
    RAISE EXCEPTION 'Migration verification failed: Quotation.quotationCode contains NULL values after backfill';
  END IF;
END $$;

-- 4. Apply NOT NULL constraint
ALTER TABLE "Quotation" ALTER COLUMN "quotationCode" SET NOT NULL;


-- Backfill display IDs for Invoice
-- 1. Ensure counter row exists
INSERT INTO "DocumentCounter" ("prefix", "type", "year", "lastValue")
VALUES ('INV', 'DISPLAY_ID', EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 0)
ON CONFLICT ("prefix", "type", "year") DO NOTHING;

-- 2. Increment and Update
WITH count_to_backfill AS (
  SELECT COUNT(*)::INTEGER as cnt FROM "Invoice" WHERE "invoiceCode" IS NULL
),
increment_counter AS (
  UPDATE "DocumentCounter"
  SET "lastValue" = "lastValue" + (SELECT cnt FROM count_to_backfill)
  WHERE "prefix" = 'INV' 
    AND "type" = 'DISPLAY_ID' 
    AND "year" = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
  RETURNING "lastValue"
),
ranked_rows AS (
  SELECT id, 
         ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) as rn
  FROM "Invoice"
  WHERE "invoiceCode" IS NULL
)
UPDATE "Invoice" i
SET "invoiceCode" = 'INV-' || EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER || '-' || lpad(((ic."lastValue" - (SELECT cnt FROM count_to_backfill)) + rr.rn)::text, 4, '0')
FROM ranked_rows rr, increment_counter ic
WHERE i.id = rr.id AND i."invoiceCode" IS NULL;

-- 3. Verify
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Invoice" WHERE "invoiceCode" IS NULL) THEN
    RAISE EXCEPTION 'Migration verification failed: Invoice.invoiceCode contains NULL values after backfill';
  END IF;
END $$;

-- 4. Apply NOT NULL constraint
ALTER TABLE "Invoice" ALTER COLUMN "invoiceCode" SET NOT NULL;


-- Backfill display IDs for StandaloneAgreement
-- 1. Ensure counter row exists
INSERT INTO "DocumentCounter" ("prefix", "type", "year", "lastValue")
VALUES ('AGR', 'DISPLAY_ID', EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 0)
ON CONFLICT ("prefix", "type", "year") DO NOTHING;

-- 2. Increment and Update
WITH count_to_backfill AS (
  SELECT COUNT(*)::INTEGER as cnt FROM "StandaloneAgreement" WHERE "agreementCode" IS NULL
),
increment_counter AS (
  UPDATE "DocumentCounter"
  SET "lastValue" = "lastValue" + (SELECT cnt FROM count_to_backfill)
  WHERE "prefix" = 'AGR' 
    AND "type" = 'DISPLAY_ID' 
    AND "year" = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
  RETURNING "lastValue"
),
ranked_rows AS (
  SELECT id, 
         ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) as rn
  FROM "StandaloneAgreement"
  WHERE "agreementCode" IS NULL
)
UPDATE "StandaloneAgreement" sa
SET "agreementCode" = 'AGR-' || EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER || '-' || lpad(((ic."lastValue" - (SELECT cnt FROM count_to_backfill)) + rr.rn)::text, 4, '0')
FROM ranked_rows rr, increment_counter ic
WHERE sa.id = rr.id AND sa."agreementCode" IS NULL;

-- 3. Verify
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "StandaloneAgreement" WHERE "agreementCode" IS NULL) THEN
    RAISE EXCEPTION 'Migration verification failed: StandaloneAgreement.agreementCode contains NULL values after backfill';
  END IF;
END $$;

-- 4. Apply NOT NULL constraint
ALTER TABLE "StandaloneAgreement" ALTER COLUMN "agreementCode" SET NOT NULL;


-- Backfill display IDs for Event
-- 1. Ensure counter row exists
INSERT INTO "DocumentCounter" ("prefix", "type", "year", "lastValue")
VALUES ('EVT', 'DISPLAY_ID', EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 0)
ON CONFLICT ("prefix", "type", "year") DO NOTHING;

-- 2. Increment and Update
WITH count_to_backfill AS (
  SELECT COUNT(*)::INTEGER as cnt FROM "Event" WHERE "eventCode" IS NULL
),
increment_counter AS (
  UPDATE "DocumentCounter"
  SET "lastValue" = "lastValue" + (SELECT cnt FROM count_to_backfill)
  WHERE "prefix" = 'EVT' 
    AND "type" = 'DISPLAY_ID' 
    AND "year" = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
  RETURNING "lastValue"
),
ranked_rows AS (
  SELECT id, 
         ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) as rn
  FROM "Event"
  WHERE "eventCode" IS NULL
)
UPDATE "Event" e
SET "eventCode" = 'EVT-' || EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER || '-' || lpad(((ic."lastValue" - (SELECT cnt FROM count_to_backfill)) + rr.rn)::text, 4, '0')
FROM ranked_rows rr, increment_counter ic
WHERE e.id = rr.id AND e."eventCode" IS NULL;

-- 3. Verify
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Event" WHERE "eventCode" IS NULL) THEN
    RAISE EXCEPTION 'Migration verification failed: Event.eventCode contains NULL values after backfill';
  END IF;
END $$;

-- 4. Apply NOT NULL constraint
ALTER TABLE "Event" ALTER COLUMN "eventCode" SET NOT NULL;
