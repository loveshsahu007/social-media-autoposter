const DEFAULT_API = "http://localhost:4000";

let apiUrl = DEFAULT_API;
let currentPlatform = "reddit";

document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.local.get("apiUrl");
  apiUrl = stored.apiUrl || DEFAULT_API;
  document.getElementById("api-url").value = apiUrl;

  checkServer();
  setupTabs();
  setupPlatformToggle();
  setupSubmit();
  setupSettings();
});

async function checkServer() {
  const dot = document.getElementById("status-dot");
  const offlineBanner = document.getElementById("server-offline");
  const dryBanner = document.getElementById("dry-run-banner");
  try {
    const res = await fetch(`${apiUrl}/api/health`);
    const data = await res.json();
    dot.className = "status-dot online";
    dot.title = "Server connected";
    offlineBanner.style.display = "none";
    dryBanner.style.display = data.dryRun ? "block" : "none";
  } catch {
    dot.className = "status-dot offline";
    dot.title = "Server offline";
    offlineBanner.style.display = "block";
    dryBanner.style.display = "none";
  }
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
      if (tab.dataset.tab === "history") loadHistory();
    });
  });
}

function setupPlatformToggle() {
  document.querySelectorAll(".toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".toggle").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentPlatform = btn.dataset.platform;
      document.getElementById("reddit-fields").style.display = currentPlatform === "reddit" ? "block" : "none";
      document.getElementById("tiktok-fields").style.display = currentPlatform === "tiktok" ? "block" : "none";
    });
  });
}

function setupSubmit() {
  const btn = document.getElementById("submit-btn");
  const result = document.getElementById("result");
  const schedule = document.getElementById("schedule");

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Posting...";
    result.style.display = "none";

    try {
      let payload;
      if (currentPlatform === "reddit") {
        const subreddit = document.getElementById("subreddit").value.trim();
        const title = document.getElementById("title").value.trim();
        if (!subreddit || !title) throw new Error("Subreddit and title are required");
        payload = {
          subreddit,
          title,
          text: document.getElementById("text").value.trim() || undefined,
          url: document.getElementById("url").value.trim() || undefined,
        };
      } else {
        const title = document.getElementById("tt-title").value.trim();
        const videoPath = document.getElementById("tt-video").value.trim();
        const tagsRaw = document.getElementById("tt-tags").value.trim();
        if (!title) throw new Error("Title is required");
        payload = {
          title,
          videoPath: videoPath || undefined,
          text: title,
          tags: tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [],
        };
      }

      const body = {
        platform: currentPlatform,
        payload,
      };

      if (schedule.value) {
        body.scheduledAt = schedule.value;
      }

      const res = await fetch(`${apiUrl}/api/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Post failed");

      result.className = "result success";
      result.textContent = data.post.status === "posted"
        ? `Posted! (${data.post.result?.dryRun ? "dry run" : "live"})`
        : `Scheduled for ${schedule.value}`;
      result.style.display = "block";
      clearForm();
    } catch (err) {
      result.className = "result error";
      result.textContent = err.message;
      result.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.textContent = schedule.value ? "Schedule" : "Post Now";
    }
  });

  schedule.addEventListener("input", () => {
    btn.textContent = schedule.value ? "Schedule" : "Post Now";
  });
}

function clearForm() {
  document.getElementById("subreddit").value = "";
  document.getElementById("title").value = "";
  document.getElementById("text").value = "";
  document.getElementById("url").value = "";
  document.getElementById("tt-title").value = "";
  document.getElementById("tt-video").value = "";
  document.getElementById("tt-tags").value = "";
  document.getElementById("schedule").value = "";
  document.getElementById("submit-btn").textContent = "Post Now";
}

async function loadHistory() {
  const list = document.getElementById("history-list");
  try {
    const res = await fetch(`${apiUrl}/api/posts?limit=20`);
    const data = await res.json();
    if (!data.posts.length) {
      list.innerHTML = '<p class="empty">No posts yet</p>';
      return;
    }
    list.innerHTML = data.posts.map((p) => {
      const payload = JSON.parse(p.payload);
      const title = payload.title || payload.subreddit || payload.text || "Untitled";
      const time = p.posted_at || p.scheduled_at || p.created_at;
      return `<div class="history-item">
        <div class="meta">
          <span class="platform ${p.platform}">${p.platform}</span>
          <span class="status-badge ${p.status}">${p.status}</span>
        </div>
        <div class="item-title">${escapeHtml(title)}</div>
        <div class="item-time">${time ? new Date(time).toLocaleString() : ""}</div>
      </div>`;
    }).join("");
  } catch {
    list.innerHTML = '<p class="empty">Cannot reach server</p>';
  }
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function setupSettings() {
  document.getElementById("save-settings").addEventListener("click", async () => {
    const url = document.getElementById("api-url").value.trim().replace(/\/+$/, "");
    const result = document.getElementById("settings-result");
    if (!url) {
      result.className = "result error";
      result.textContent = "URL is required";
      result.style.display = "block";
      return;
    }
    apiUrl = url;
    await chrome.storage.local.set({ apiUrl: url });
    result.className = "result success";
    result.textContent = "Saved!";
    result.style.display = "block";
    checkServer();
    setTimeout(() => { result.style.display = "none"; }, 2000);
  });
}
