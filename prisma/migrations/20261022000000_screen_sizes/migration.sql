CREATE TABLE "screen_size_daily" (
    "day" DATE NOT NULL,
    "page" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "device" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "screen_size_daily_pkey" PRIMARY KEY ("day", "page", "width", "height", "device", "browser", "os"),
    CONSTRAINT "screen_size_daily_dimensions_check" CHECK ("width" BETWEEN 100 AND 10000 AND "height" BETWEEN 100 AND 10000),
    CONSTRAINT "screen_size_daily_views_check" CHECK ("views" > 0)
);
