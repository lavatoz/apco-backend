-- CreateTable
CREATE TABLE "PersonnelEventAssignment" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "PersonnelEventAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonnelEventAssignment_personnelId_eventId_key" ON "PersonnelEventAssignment"("personnelId", "eventId");

-- AddForeignKey
ALTER TABLE "PersonnelEventAssignment" ADD CONSTRAINT "PersonnelEventAssignment_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonnelEventAssignment" ADD CONSTRAINT "PersonnelEventAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing eventId column from Personnel to PersonnelEventAssignment if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'Personnel' AND column_name = 'eventId'
    ) THEN
        INSERT INTO "PersonnelEventAssignment" ("id", "personnelId", "eventId", "assignedAt", "assignedBy", "notes")
        SELECT 
            gen_random_uuid()::text, 
            "id", 
            "eventId", 
            NOW(), 
            'system', 
            'Migrated from legacy single event assignment'
        FROM "Personnel"
        WHERE "eventId" IS NOT NULL;
        
        -- Drop the old column
        ALTER TABLE "Personnel" DROP COLUMN "eventId";
    END IF;
END $$;

-- Migrate existing personnelId column from Event to PersonnelEventAssignment if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'Event' AND column_name = 'personnelId'
    ) THEN
        INSERT INTO "PersonnelEventAssignment" ("id", "personnelId", "eventId", "assignedAt", "assignedBy", "notes")
        SELECT 
            gen_random_uuid()::text, 
            "personnelId", 
            "id", 
            NOW(), 
            'system', 
            'Migrated from legacy single event assignment'
        FROM "Event"
        WHERE "personnelId" IS NOT NULL;
        
        -- Drop the old column
        ALTER TABLE "Event" DROP COLUMN "personnelId";
    END IF;
END $$;
