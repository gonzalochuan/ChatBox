/*
  Warnings:

  - You are about to drop the column `pinnedAt` on the `Channel` table. All the data in the column will be lost.
  - You are about to drop the column `pinnedById` on the `Channel` table. All the data in the column will be lost.
  - You are about to drop the column `pinnedByName` on the `Channel` table. All the data in the column will be lost.
  - You are about to drop the column `pinnedMessageId` on the `Channel` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "ChannelPin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "pinnedById" TEXT,
    "pinnedByName" TEXT,
    "pinnedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelPin_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChannelPin_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "topic" TEXT,
    "kind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Channel" ("createdAt", "id", "kind", "name", "topic") SELECT "createdAt", "id", "kind", "name", "topic" FROM "Channel";
DROP TABLE "Channel";
ALTER TABLE "new_Channel" RENAME TO "Channel";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ChannelPin_channelId_messageId_key" ON "ChannelPin"("channelId", "messageId");
