-- A bank exercise session has no task. Rebuild the SQLite table so existing
-- task-linked sessions are preserved while taskId becomes nullable.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "taskId" TEXT,
    "submittedAt" DATETIME NOT NULL,
    "payload" JSONB NOT NULL,

    PRIMARY KEY ("studentId", "id"),
    CONSTRAINT "Session_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_studentId_taskId_fkey" FOREIGN KEY ("studentId", "taskId") REFERENCES "Task" ("studentId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Session" ("id", "studentId", "taskId", "submittedAt", "payload")
SELECT "id", "studentId", "taskId", "submittedAt", "payload" FROM "Session";

DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";

CREATE INDEX "Student_Session_task_submitted_idx" ON "Session"("studentId", "taskId", "submittedAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
