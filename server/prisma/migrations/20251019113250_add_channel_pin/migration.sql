-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "topic" TEXT,
    "kind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pinnedMessageId" TEXT,
    "pinnedById" TEXT,
    "pinnedByName" TEXT,
    "pinnedAt" DATETIME,
    CONSTRAINT "Channel_pinnedMessageId_fkey" FOREIGN KEY ("pinnedMessageId") REFERENCES "Message" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Channel" ("createdAt", "id", "kind", "name", "topic") SELECT "createdAt", "id", "kind", "name", "topic" FROM "Channel";
DROP TABLE "Channel";
ALTER TABLE "new_Channel" RENAME TO "Channel";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
