-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "joinedDays" INTEGER NOT NULL,
    "gradeInfo" TEXT NOT NULL,
    "greeting" JSONB NOT NULL,
    "moduleStats" JSONB NOT NULL,
    "learningSummary" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dueAt" DATETIME,
    "payload" JSONB NOT NULL,

    PRIMARY KEY ("studentId", "id"),
    CONSTRAINT "Task_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskAdjustment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "payload" JSONB NOT NULL,

    PRIMARY KEY ("studentId", "id"),
    CONSTRAINT "TaskAdjustment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskAdjustment_studentId_taskId_fkey" FOREIGN KEY ("studentId", "taskId") REFERENCES "Task" ("studentId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExerciseSet" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "taskId" TEXT,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    PRIMARY KEY ("studentId", "id"),
    CONSTRAINT "ExerciseSet_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL,
    "payload" JSONB NOT NULL,

    PRIMARY KEY ("studentId", "id"),
    CONSTRAINT "Session_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_studentId_taskId_fkey" FOREIGN KEY ("studentId", "taskId") REFERENCES "Task" ("studentId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ErrorItem" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastOccurredAt" DATETIME NOT NULL,
    "payload" JSONB NOT NULL,

    PRIMARY KEY ("studentId", "id"),
    CONSTRAINT "ErrorItem_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "updatedAtValue" DATETIME NOT NULL,
    "payload" JSONB NOT NULL,

    PRIMARY KEY ("studentId", "id"),
    CONSTRAINT "Note_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NoteFolder" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentId" TEXT,
    "payload" JSONB NOT NULL,

    PRIMARY KEY ("studentId", "id"),
    CONSTRAINT "NoteFolder_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialUploadJob" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAtValue" DATETIME NOT NULL,
    "payload" JSONB NOT NULL,

    PRIMARY KEY ("studentId", "id"),
    CONSTRAINT "MaterialUploadJob_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudentSettings" (
    "studentId" TEXT NOT NULL PRIMARY KEY,
    "payload" JSONB NOT NULL,
    CONSTRAINT "StudentSettings_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Student_Task_status_due_idx" ON "Task"("studentId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Student_Task_type_status_idx" ON "Task"("studentId", "type", "status");

-- CreateIndex
CREATE INDEX "Student_TaskAdjustment_task_status_idx" ON "TaskAdjustment"("studentId", "taskId", "status");

-- CreateIndex
CREATE INDEX "Student_TaskAdjustment_status_created_idx" ON "TaskAdjustment"("studentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Student_Exercise_kind_idx" ON "ExerciseSet"("studentId", "kind");

-- CreateIndex
CREATE INDEX "Student_Exercise_task_idx" ON "ExerciseSet"("studentId", "taskId");

-- CreateIndex
CREATE INDEX "Student_Session_task_submitted_idx" ON "Session"("studentId", "taskId", "submittedAt");

-- CreateIndex
CREATE INDEX "Student_Error_status_last_idx" ON "ErrorItem"("studentId", "status", "lastOccurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Student_Error_question_key" ON "ErrorItem"("studentId", "questionId");

-- CreateIndex
CREATE INDEX "Student_Note_updated_idx" ON "Note"("studentId", "updatedAtValue");

-- CreateIndex
CREATE INDEX "Student_NoteFolder_parent_idx" ON "NoteFolder"("studentId", "parentId");

-- CreateIndex
CREATE INDEX "Student_Material_status_created_idx" ON "MaterialUploadJob"("studentId", "status", "createdAtValue");
