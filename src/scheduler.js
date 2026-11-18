const cron = require("node-cron");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("./db/database");
const { submitPost: redditPost, submitImagePost: redditImagePost } = require("./providers/reddit");
const { postVideo: tiktokVideo, postText: tiktokText } = require("./providers/tiktok");
const logger = require("./utils/logger");

const activeJobs = new Map();

function startScheduler() {
  const db = getDb();
  const jobs = db.prepare("SELECT * FROM scheduled_jobs WHERE enabled = 1").all();

  for (const job of jobs) {
    registerCronJob(job);
  }

  cron.schedule("* * * * *", () => processQueue());

  logger.info(`Scheduler started with ${jobs.length} recurring jobs`);
}

function registerCronJob(job) {
  if (activeJobs.has(job.id)) {
    activeJobs.get(job.id).stop();
  }

  const payload = JSON.parse(job.payload);

  const task = cron.schedule(job.cron_expression, async () => {
    logger.info(`Running scheduled job: ${job.id}`);
    const postId = uuidv4();
    const db = getDb();

    db.prepare(
      "INSERT INTO posts (id, platform, status, payload, created_at) VALUES (?, ?, 'pending', ?, datetime('now'))"
    ).run(postId, job.platform, job.payload);

    db.prepare("UPDATE scheduled_jobs SET last_run = datetime('now') WHERE id = ?").run(job.id);

    await executePost(postId, job.platform, payload);
  });

  activeJobs.set(job.id, task);
  logger.info(`Registered cron job ${job.id}: ${job.cron_expression}`);
}

async function processQueue() {
  const db = getDb();
  const pending = db.prepare(
    "SELECT * FROM posts WHERE status = 'scheduled' AND scheduled_at <= datetime('now') ORDER BY scheduled_at ASC LIMIT 10"
  ).all();

  for (const post of pending) {
    db.prepare("UPDATE posts SET status = 'pending', updated_at = datetime('now') WHERE id = ?").run(post.id);
    const payload = JSON.parse(post.payload);
    await executePost(post.id, post.platform, payload);
  }
}

async function executePost(postId, platform, payload) {
  const db = getDb();

  try {
    let result;

    if (platform === "reddit") {
      if (payload.imagePath) {
        result = await redditImagePost(payload);
      } else {
        result = await redditPost(payload);
      }
    } else if (platform === "tiktok") {
      if (payload.videoPath) {
        result = await tiktokVideo(payload);
      } else {
        result = await tiktokText(payload);
      }
    } else {
      throw new Error(`Unknown platform: ${platform}`);
    }

    db.prepare(
      "UPDATE posts SET status = 'posted', result = ?, posted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).run(JSON.stringify(result), postId);

    logger.info(`Post ${postId} published on ${platform}`);
    return result;
  } catch (err) {
    const post = db.prepare("SELECT retry_count FROM posts WHERE id = ?").get(postId);
    const retries = (post?.retry_count || 0) + 1;

    db.prepare(
      "UPDATE posts SET status = 'failed', error = ?, retry_count = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(err.message, retries, postId);

    logger.error(`Post ${postId} failed: ${err.message}`);
    throw err;
  }
}

function addScheduledJob({ platform, cronExpression, payload }) {
  if (!cron.validate(cronExpression)) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }

  const id = uuidv4();
  const db = getDb();

  db.prepare(
    "INSERT INTO scheduled_jobs (id, platform, cron_expression, payload) VALUES (?, ?, ?, ?)"
  ).run(id, platform, cronExpression, JSON.stringify(payload));

  const job = db.prepare("SELECT * FROM scheduled_jobs WHERE id = ?").get(id);
  registerCronJob(job);

  return { id, platform, cronExpression };
}

function removeScheduledJob(id) {
  if (activeJobs.has(id)) {
    activeJobs.get(id).stop();
    activeJobs.delete(id);
  }

  const db = getDb();
  db.prepare("DELETE FROM scheduled_jobs WHERE id = ?").run(id);
  logger.info(`Removed scheduled job: ${id}`);
}

function listScheduledJobs() {
  const db = getDb();
  return db.prepare("SELECT * FROM scheduled_jobs ORDER BY created_at DESC").all();
}

module.exports = { startScheduler, addScheduledJob, removeScheduledJob, listScheduledJobs, executePost };
