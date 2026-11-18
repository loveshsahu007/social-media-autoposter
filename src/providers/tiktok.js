const axios = require("axios");
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

const BASE_URL = "https://open.tiktokapis.com/v2";

function isDryRun() {
  return process.env.DRY_RUN === "true";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function withRetry(fn, context) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      logger.warn(`${context}: attempt ${attempt} failed — ${err.message}`);
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
}

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
    "Content-Type": "application/json; charset=UTF-8",
  };
}

async function postVideo({ title, videoPath, tags = [], privacyLevel = "PUBLIC_TO_EVERYONE" }) {
  if (isDryRun()) {
    const result = {
      dryRun: true,
      publishId: `dry_run_tt_${Date.now()}`,
      title,
      videoPath,
      tags,
      privacyLevel,
      status: "PUBLISH_COMPLETE",
    };
    logger.info(`[DRY RUN] TikTok video → "${title}" (${videoPath})`);
    return result;
  }

  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("TIKTOK_ACCESS_TOKEN not configured. Apply at https://developers.tiktok.com/ for Content Posting API");
  }

  const resolvedPath = path.resolve(videoPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Video file not found: ${resolvedPath}`);
  }

  const stats = fs.statSync(resolvedPath);
  if (stats.size > 500 * 1024 * 1024) {
    throw new Error("Video exceeds 500MB limit");
  }

  return withRetry(async () => {
    const initRes = await axios.post(
      `${BASE_URL}/post/publish/inbox/video/init/`,
      {
        post_info: {
          title,
          privacy_level: privacyLevel,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: stats.size,
          chunk_size: stats.size,
          total_chunk_count: 1,
        },
      },
      { headers: getHeaders() }
    );

    const { publish_id, upload_url } = initRes.data.data;
    logger.info(`TikTok upload initialized: ${publish_id}`);

    const fileBuffer = fs.readFileSync(resolvedPath);
    await axios.put(upload_url, fileBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": fileBuffer.length,
        "Content-Range": `bytes 0-${fileBuffer.length - 1}/${fileBuffer.length}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    logger.info("TikTok video uploaded, checking publish status...");

    let status;
    for (let i = 0; i < 10; i++) {
      await sleep(3000);
      const statusRes = await axios.post(
        `${BASE_URL}/post/publish/status/fetch/`,
        { publish_id },
        { headers: getHeaders() }
      );
      status = statusRes.data.data;

      if (status.status === "PUBLISH_COMPLETE") {
        logger.info("TikTok video published successfully");
        return { publishId: publish_id, ...status };
      }
      if (status.status === "FAILED") {
        throw new Error(`TikTok publish failed: ${status.fail_reason}`);
      }
    }

    logger.info("TikTok publish still processing");
    return { publishId: publish_id, ...status };
  }, "TikTok postVideo");
}

async function postText({ text, tags = [] }) {
  if (isDryRun()) {
    const result = {
      dryRun: true,
      id: `dry_run_tt_text_${Date.now()}`,
      text: text.substring(0, 100),
      tags,
      status: "PUBLISH_COMPLETE",
    };
    logger.info(`[DRY RUN] TikTok text → "${text.substring(0, 50)}..."`);
    return result;
  }

  throw new Error("TikTok text-only posts require a video. Use postVideo instead.");
}

module.exports = { postVideo, postText };
