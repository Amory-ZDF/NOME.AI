-- A bank exercise session has no task. Drop the NOT NULL constraint so
-- taskId becomes nullable (PostgreSQL).
ALTER TABLE "Session" ALTER COLUMN "taskId" DROP NOT NULL;
