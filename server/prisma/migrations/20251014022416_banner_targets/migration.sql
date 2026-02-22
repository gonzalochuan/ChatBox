-- CreateTable
CREATE TABLE "BannerTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bannerId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetValue" TEXT,
    CONSTRAINT "BannerTarget_bannerId_fkey" FOREIGN KEY ("bannerId") REFERENCES "Banner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BannerUserTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bannerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "BannerUserTarget_bannerId_fkey" FOREIGN KEY ("bannerId") REFERENCES "Banner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BannerUserTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
