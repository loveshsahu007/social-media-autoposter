const { Router } = require("express");
const { getDb } = require("../db/database");

const router = Router();

router.get("/", (req, res) => {
  try {
    const db = getDb();
    const postCount = db.prepare("SELECT COUNT(*) as count FROM posts").get().count;
    const jobCount = db.prepare("SELECT COUNT(*) as count FROM scheduled_jobs WHERE enabled = 1").get().count;

    res.json({
      status: "ok",
      dryRun: process.env.DRY_RUN === "true",
      uptime: process.uptime(),
      posts: postCount,
      activeJobs: jobCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

module.exports = router;
