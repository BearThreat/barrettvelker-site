const CACHE_NAME = "mary-harrington-charlotte-v9";
const STORAGE_VERSION = "starts-at-zero-v9";

const tracks = [
  {
    id: "part1",
    title: "Part 1: The New Dark Ages",
    duration: "16m36s",
    audio: "audio/part1-charlotte.mp3",
    text: "text/part1.md",
    filename: "mary-harrington-rebuild-monasteries-part1-charlotte.mp3"
  },
  {
    id: "part2",
    title: "Part 2: Burning the Memory Palaces",
    duration: "21m53s",
    audio: "audio/part2-charlotte.mp3",
    text: "text/part2.md",
    filename: "mary-harrington-rebuild-monasteries-part2-charlotte.mp3"
  },
  {
    id: "part3",
    title: "Part 3: The Third Singularity",
    duration: "21m50s",
    audio: "audio/part3-charlotte.mp3",
    text: "text/part3.md",
    filename: "mary-harrington-rebuild-monasteries-part3-charlotte.mp3"
  }
];

const allAssets = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "sw.js",
  "audio/mary-harrington-charlotte-audio.zip",
  ...tracks.flatMap((track) => [track.audio, track.text])
];

for (const key of Object.keys(localStorage)) {
  if (key.startsWith("mh:time:")) {
    localStorage.removeItem(key);
  }
}

if (localStorage.getItem("mh:storage-version") !== STORAGE_VERSION) {
  for (const key of Object.keys(localStorage)) {
    if (key === "mh:index" || key === "mh:progress") {
      localStorage.removeItem(key);
    }
  }
  localStorage.setItem("mh:storage-version", STORAGE_VERSION);
}

const state = {
  index: Number(localStorage.getItem("mh:index") || 0),
  speed: Number(localStorage.getItem("mh:speed") || 1),
  progress: JSON.parse(localStorage.getItem("mh:progress") || "{}"),
  isSeeking: false
};

const el = {
  audio: document.querySelector("#audio"),
  queue: document.querySelector("#queue"),
  trackTitle: document.querySelector("#trackTitle"),
  textTitle: document.querySelector("#textTitle"),
  textView: document.querySelector("#textView"),
  timeReadout: document.querySelector("#timeReadout"),
  speedSelect: document.querySelector("#speedSelect"),
  playBtn: document.querySelector("#playBtn"),
  prevBtn: document.querySelector("#prevBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  downloadAllBtn: document.querySelector("#downloadAllBtn"),
  downloadSheet: document.querySelector("#downloadSheet"),
  saveBrowserBtn: document.querySelector("#saveBrowserBtn"),
  saveDeviceLink: document.querySelector("#saveDeviceLink"),
  closeSheetBtn: document.querySelector("#closeSheetBtn"),
  offlineStatus: document.querySelector("#offlineStatus")
};

function clampIndex(index) {
  return Math.max(0, Math.min(tracks.length - 1, index));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, "0");
  return `${minutes}:${secs}`;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").trim();
    if (text) html.push(`<p>${escapeHtml(text)}</p>`);
    paragraph = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    if (line.startsWith("### ")) {
      flushParagraph();
      html.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph();
      html.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("# ")) {
      flushParagraph();
      html.push(`<h2>${escapeHtml(line.slice(2))}</h2>`);
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return html.join("");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function saveState() {
  localStorage.setItem("mh:index", String(state.index));
  localStorage.setItem("mh:speed", String(state.speed));
  localStorage.setItem("mh:progress", JSON.stringify(state.progress));
}

function renderQueue() {
  el.queue.innerHTML = tracks.map((track, index) => {
    const saved = state.progress[track.id] || 0;
    const percent = Math.max(0, Math.min(100, saved * 100));
    const active = index === state.index ? " active" : "";
    return `
      <div class="queue-item${active}" data-index="${index}">
        <button class="queue-main" type="button" data-action="select" data-index="${index}">
          <span class="queue-copy">
            <strong>${escapeHtml(track.title)}</strong>
            <small>${track.duration}</small>
          </span>
          <span class="progress" aria-hidden="true"><i data-progress="${track.id}" style="width:${percent}%"></i></span>
        </button>
      </div>
    `;
  }).join("");
}

function updateQueueProgress() {
  for (const track of tracks) {
    const bar = document.querySelector(`[data-progress="${track.id}"]`);
    if (!bar) continue;
    const saved = state.progress[track.id] || 0;
    bar.style.width = `${Math.max(0, Math.min(100, saved * 100))}%`;
  }
}

function setActiveQueueItem() {
  document.querySelectorAll(".queue-item").forEach((item) => {
    item.classList.toggle("active", Number(item.dataset.index) === state.index);
  });
}

async function loadTrack(index, autoplay = false) {
  state.index = clampIndex(index);
  const track = tracks[state.index];

  el.trackTitle.textContent = track.title;
  el.textTitle.textContent = track.title;
  el.audio.src = track.audio;
  el.audio.playbackRate = state.speed;
  el.textView.innerHTML = '<p class="loading">Loading text...</p>';
  renderQueue();
  saveState();

  try {
    const response = await fetch(track.text);
    const markdown = await response.text();
    el.textView.innerHTML = markdownToHtml(markdown);
  } catch (error) {
    el.textView.innerHTML = '<p class="loading">Text unavailable.</p>';
  }

  el.audio.addEventListener("loadedmetadata", () => {
    el.audio.currentTime = 0;
    updateTime();
  }, { once: true });

  if (autoplay) {
    await el.audio.play();
  }
}

function updateTime() {
  const duration = el.audio.duration || 0;
  const current = el.audio.currentTime || 0;
  el.timeReadout.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  const track = tracks[state.index];
  if (track && duration) {
    state.progress[track.id] = current / duration;
    saveState();
    updateQueueProgress();
  }
}

async function cacheUrls(urls) {
  if (!("caches" in window)) {
    el.offlineStatus.textContent = "Offline cache is not supported in this browser.";
    return;
  }
  setCacheButtons(true);
  try {
    const cache = await caches.open(CACHE_NAME);
    for (const url of urls) {
      el.offlineStatus.textContent = `Caching ${url}...`;
      const response = await fetch(url, { cache: "reload" });
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      await cache.put(url, response);
    }
    await updateCacheStatus();
  } catch (error) {
    el.offlineStatus.textContent = `Cache failed: ${error.message}`;
  } finally {
    setCacheButtons(false);
  }
}

function setCacheButtons(disabled) {
  el.downloadAllBtn.disabled = disabled;
  el.saveBrowserBtn.disabled = disabled;
}

async function updateCacheStatus() {
  if (!("caches" in window)) {
    el.offlineStatus.textContent = "Offline cache unavailable.";
    return;
  }
  const cache = await caches.open(CACHE_NAME);
  const cached = await Promise.all(allAssets.map((url) => cache.match(url)));
  const count = cached.filter(Boolean).length;
  el.offlineStatus.textContent = count === allAssets.length
    ? "Offline ready: all audio and text cached."
    : `Offline cache: ${count}/${allAssets.length} files ready.`;
}

el.queue.addEventListener("click", (event) => {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;
  const index = Number(actionEl.dataset.index);
  const action = actionEl.dataset.action;
  loadTrack(index, action === "play" || action === "select");
});

el.playBtn.addEventListener("click", async () => {
  if (el.audio.paused) {
    await el.audio.play();
  } else {
    el.audio.pause();
  }
});

el.prevBtn.addEventListener("click", () => loadTrack(state.index - 1, true));
el.nextBtn.addEventListener("click", () => loadTrack(state.index + 1, true));

el.speedSelect.addEventListener("change", () => {
  state.speed = Number(el.speedSelect.value);
  el.audio.playbackRate = state.speed;
  saveState();
});

el.audio.addEventListener("timeupdate", updateTime);
el.audio.addEventListener("durationchange", updateTime);
el.audio.addEventListener("play", () => { el.playBtn.textContent = "Pause"; });
el.audio.addEventListener("pause", () => { el.playBtn.textContent = "Play"; });
el.audio.addEventListener("ended", () => {
  if (state.index < tracks.length - 1) loadTrack(state.index + 1, true);
});

el.downloadAllBtn.addEventListener("click", () => {
  el.downloadSheet.hidden = false;
});

el.saveBrowserBtn.addEventListener("click", () => cacheUrls(allAssets));

el.closeSheetBtn.addEventListener("click", () => {
  el.downloadSheet.hidden = true;
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

el.speedSelect.value = String(state.speed);
loadTrack(state.index);
updateCacheStatus();
