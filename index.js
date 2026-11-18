require("dotenv").config();

const app = require("./src/app");
const { startScheduler } = require("./src/scheduler");
const { getDb } = require("./src/db/database");
const logger = require("./src/utils/logger");

const PORT = process.env.PORT || 4000;

getDb();

startScheduler();

app.listen(PORT, () => {
  logger.info(`Autoposter service running on port ${PORT}`);
  logger.info("API docs:");
  logger.info("  POST   /api/posts          — create & publish a post");
  logger.info("  GET    /api/posts           — list posts");
  logger.info("  GET    /api/posts/:id       — get a post");
  logger.info("  DELETE /api/posts/:id       — delete a pending post");
  logger.info("  POST   /api/schedules       — add a recurring schedule");
  logger.info("  GET    /api/schedules       — list schedules");
  logger.info("  DELETE /api/schedules/:id   — remove a schedule");
  logger.info("  GET    /api/health          — service health");
});
