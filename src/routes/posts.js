const { Router } = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db/database");
const { executePost } = require("../scheduler");

const router = Router();

router.post("/", async (req, res, next) => {
  try {
    const { platform, payload, scheduledAt } = req.body;

    if (!platform || !payload) {
      return res.status(400).json({ error: "platform and payload are required" });
    }

    if (!["reddit", "tiktok"].includes(platform)) {
      return res.status(400).json({ error: "platform must be reddit or tiktok" });
    }

    if (platform === "reddit" && (!payload.subreddit || !payload.title)) {
      return res.status(400).json({ error: "Reddit posts need subreddit and title" });
    }

    if (platform === "tiktok" && !payload.videoPath && !payload.text) {
      return res.status(400).json({ error: "TikTok posts need videoPath or text" });
    }

    const id = uuidv4();
    const db = getDb();
    const status = scheduledAt ? "scheduled" : "pending";

    db.prepare(
      "INSERT INTO posts (id, platform, status, payload, scheduled_at, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
    ).run(id, platform, status, JSON.stringify(payload), scheduledAt || null);

    if (!scheduledAt) {
      try {
        const result = await executePost(id, platform, payload);
        return res.status(201).json({ id, status: "posted", result });
      } catch (err) {
        return res.status(201).json({ id, status: "failed", error: err.message });
      }
    }

    res.status(201).json({ id, status: "scheduled", scheduledAt });
  } catch (err) {
    next(err);
  }
});

router.get("/", (req, res) => {
  const { platform, status, limit = 50, offset = 0 } = req.query;
  const db = getDb();

  let sql = "SELECT * FROM posts WHERE 1=1";
  const params = [];

  if (platform) {
    sql += " AND platform = ?";
    params.push(platform);
  }
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }

  sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(Number(limit), Number(offset));

  const posts = db.prepare(sql).all(...params);
  const total = db.prepare("SELECT COUNT(*) as count FROM posts").get().count;

  res.json({ posts, total, limit: Number(limit), offset: Number(offset) });
});

router.get("/:id", (req, res) => {
  const db = getDb();
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(req.params.id);

  if (!post) return res.status(404).json({ error: "Post not found" });
  res.json(post);
});

router.delete("/:id", (req, res) => {
  const db = getDb();
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(req.params.id);

  if (!post) return res.status(404).json({ error: "Post not found" });
  if (post.status === "posted") return res.status(400).json({ error: "Cannot delete an already posted item" });

  db.prepare("DELETE FROM posts WHERE id = ?").run(req.params.id);
  res.json({ message: "Post deleted" });
});

module.exports = router;
