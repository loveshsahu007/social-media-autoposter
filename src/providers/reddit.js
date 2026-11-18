const axios = require("axios");
const logger = require("../utils/logger");

const USER_AGENT = "social-media-autoposter/1.0.0";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

let cachedToken = null;
let tokenExpiresAt = 0;

function isDryRun() {
  return process.env.DRY_RUN === "true";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry(fn, context) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      const status = err.response?.status;

      if (status === 401) {
        cachedToken = null;
        tokenExpiresAt = 0;
        logger.warn(`${context}: Auth expired, refreshing token (attempt ${attempt})`);
      } else if (status === 429) {
        const retryAfter = parseInt(err.response?.headers?.["retry-after"] || "5", 10);
        logger.warn(`${context}: Rate limited, waiting ${retryAfter}s`);
        await sleep(retryAfter * 1000);
      } else if (isLast) {
        throw err;
      }

      if (!isLast) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }
}

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const { REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD } = process.env;

  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) {
    throw new Error("Reddit credentials not configured. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in .env");
  }

  const auth = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString("base64");

  const res = await axios.post(
    "https://www.reddit.com/api/v1/access_token",
    new URLSearchParams({
      grant_type: "password",
      username: REDDIT_USERNAME,
      password: REDDIT_PASSWORD,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
    }
  );

  cachedToken = res.data.access_token;
  tokenExpiresAt = Date.now() + (res.data.expires_in - 60) * 1000;
  logger.info("Reddit access token refreshed");
  return cachedToken;
}

async function submitPost({ subreddit, title, text, url, flairId }) {
  if (isDryRun()) {
    const result = {
      dryRun: true,
      postUrl: `https://reddit.com/r/${subreddit}/comments/dry_run_id`,
      id: `dry_run_${Date.now()}`,
      subreddit,
      title,
      text: text?.substring(0, 100),
    };
    logger.info(`[DRY RUN] Reddit post → r/${subreddit}: "${title}"`);
    return result;
  }

  return withRetry(async () => {
    const token = await getAccessToken();

    const params = {
      sr: subreddit,
      title,
      kind: url ? "link" : "self",
      resubmit: "true",
      send_replies: "true",
    };

    if (url) params.url = url;
    else if (text) params.text = text;
    if (flairId) params.flair_id = flairId;

    const res = await axios.post(
      "https://oauth.reddit.com/api/submit",
      new URLSearchParams(params).toString(),
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
      }
    );

    const data = res.data.json;
    if (data.errors && data.errors.length > 0) {
      throw new Error(`Reddit API errors: ${JSON.stringify(data.errors)}`);
    }

    const postUrl = data.data?.url;
    logger.info(`Posted to r/${subreddit}: ${postUrl}`);
    return { postUrl, id: data.data?.id, name: data.data?.name };
  }, "Reddit submitPost");
}

async function submitImagePost({ subreddit, title, imagePath, flairId }) {
  if (isDryRun()) {
    const result = {
      dryRun: true,
      postUrl: `https://reddit.com/r/${subreddit}/comments/dry_run_img`,
      id: `dry_run_img_${Date.now()}`,
      subreddit,
      title,
      imagePath,
    };
    logger.info(`[DRY RUN] Reddit image post → r/${subreddit}: "${title}" (${imagePath})`);
    return result;
  }

  return withRetry(async () => {
    const token = await getAccessToken();
    const fs = require("fs");
    const FormData = require("form-data");
    const path = require("path");

    const leaseRes = await axios.post(
      "https://oauth.reddit.com/api/media/asset.json",
      new URLSearchParams({
        filepath: path.basename(imagePath),
        mimetype: "image/" + path.extname(imagePath).slice(1).replace("jpg", "jpeg"),
      }).toString(),
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
      }
    );

    const { args, asset } = leaseRes.data;
    const uploadUrl = `https:${args.action}`;
    const form = new FormData();
    for (const field of args.fields) {
      form.append(field.name, field.value);
    }
    form.append("file", fs.createReadStream(imagePath));

    await axios.post(uploadUrl, form, { headers: form.getHeaders() });

    const imageUrl = `${uploadUrl}/${asset.asset_id}`;
    return submitPost({ subreddit, title, url: imageUrl, flairId });
  }, "Reddit submitImagePost");
}

module.exports = { submitPost, submitImagePost, getAccessToken };
