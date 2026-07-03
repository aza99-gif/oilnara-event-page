let currentSite = null;
let currentStats = null;

const MAX_ICON_IMAGE_BYTES = 700 * 1024;
const ADMIN_THEME_KEY = "oilnara-admin-theme";
const DEFAULT_ICON_BG = {
  gold: "#f3d77b",
  kakao: "#fee500",
  naver: "#03c75a",
  store: "#03c75a",
  mall: "#1c2028"
};
const loginScreen = document.getElementById("loginScreen");
const adminShell = document.getElementById("adminShell");
const loginForm = document.getElementById("loginForm");
const settingsForm = document.getElementById("settingsForm");
const linkEditor = document.getElementById("linkEditor");
const saveMessage = document.getElementById("saveMessage");
const loginMessage = document.getElementById("loginMessage");
const previewFrame = document.querySelector(".phone-frame iframe");
let previewSyncTimer = null;

function systemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function activeAdminTheme() {
  return document.documentElement.dataset.theme || localStorage.getItem(ADMIN_THEME_KEY) || systemTheme();
}

function updateAdminThemeButton() {
  const toggle = document.getElementById("adminThemeToggle");
  const label = document.getElementById("adminThemeToggleLabel");
  const isDark = activeAdminTheme() === "dark";
  if (toggle) toggle.setAttribute("aria-pressed", String(isDark));
  if (label) label.textContent = isDark ? "화이트" : "다크";
}

function setAdminTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  if (persist) localStorage.setItem(ADMIN_THEME_KEY, theme);
  updateAdminThemeButton();
}

function todayKey() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(new Date());
}

function showLogin() {
  loginScreen.hidden = false;
  adminShell.hidden = true;
}

function showAdmin() {
  loginScreen.hidden = true;
  adminShell.hidden = false;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setMessage(element, text, tone = "") {
  element.textContent = text;
  element.dataset.tone = tone;
}

function iconBgFor(link) {
  return link.iconBg || DEFAULT_ICON_BG[link.tone] || "#ffffff";
}

function iconMarkup(link) {
  const iconStyle = ` style="background-color: ${escapeHtml(iconBgFor(link))}"`;
  if (link.iconImage) {
    return `<span class="link-icon has-image" aria-hidden="true"${iconStyle}><img src="${escapeHtml(link.iconImage)}" alt=""></span>`;
  }
  return `<span class="link-icon" aria-hidden="true"${iconStyle}>${escapeHtml(link.icon)}</span>`;
}

function updateIconPreview(row) {
  const preview = row.querySelector("[data-icon-preview]");
  const iconText = row.dataset.icon || "";
  const iconImage = row.dataset.iconImage || "";
  const iconBg = row.dataset.iconBg || "#ffffff";

  if (iconImage) {
    preview.className = "link-icon has-image";
    preview.innerHTML = `<img src="${escapeHtml(iconImage)}" alt="">`;
  } else {
    preview.className = "link-icon";
    preview.textContent = iconText;
  }
  preview.style.backgroundColor = iconBg;
}

function refreshOrderControls() {
  const rows = [...linkEditor.querySelectorAll(".link-row")];
  rows.forEach((row, index) => {
    const upButton = row.querySelector('[data-action="moveLinkUp"]');
    const downButton = row.querySelector('[data-action="moveLinkDown"]');
    if (upButton) upButton.disabled = index === 0;
    if (downButton) downButton.disabled = index === rows.length - 1;
  });
}

function moveLinkRow(row, direction) {
  if (!row) return;
  if (direction === "up" && row.previousElementSibling) {
    linkEditor.insertBefore(row, row.previousElementSibling);
  }
  if (direction === "down" && row.nextElementSibling) {
    linkEditor.insertBefore(row.nextElementSibling, row);
  }
  refreshOrderControls();
  schedulePreviewSync();
  setMessage(saveMessage, "순서를 변경했습니다. 저장 버튼을 눌러 반영하세요.");
}

function refreshPreview() {
  if (!previewFrame) return;
  previewFrame.addEventListener("load", () => schedulePreviewSync(), { once: true });
  previewFrame.src = `/?preview=${Date.now()}`;
}

function schedulePreviewSync() {
  window.clearTimeout(previewSyncTimer);
  previewSyncTimer = window.setTimeout(() => {
    if (!currentSite || !previewFrame?.contentWindow) return;
    previewFrame.contentWindow.postMessage(
      { type: "oilnara-preview", site: formToSite() },
      window.location.origin
    );
  }, 120);
}

function fillForm(site) {
  settingsForm.elements["promotion.eyebrow"].value = site.promotion?.eyebrow || "";
  settingsForm.elements["promotion.title"].value = site.promotion?.title || "";
  settingsForm.elements["promotion.subtitle"].value = site.promotion?.subtitle || "";
  settingsForm.elements["promotion.badge"].value = site.promotion?.badge || "";
  settingsForm.elements["footerLines"].value = (site.footerLines || []).join("\n");

  linkEditor.innerHTML = "";
  for (const link of site.links || []) {
    const row = document.createElement("article");
    const iconBg = iconBgFor(link);
    row.className = `link-row tone-${link.tone}`;
    row.dataset.id = link.id;
    row.dataset.icon = link.icon || "";
    row.dataset.iconImage = link.iconImage || "";
    row.dataset.iconBg = iconBg;
    row.innerHTML = `
      <div class="link-row-head">
        <span data-icon-preview>${iconMarkup(link)}</span>
        <strong>${escapeHtml(link.title)}</strong>
        <div class="link-order-actions" aria-label="링크 순서 변경">
          <button class="icon-button" data-action="moveLinkUp" type="button" aria-label="위로 이동" title="위로 이동">↑</button>
          <button class="icon-button" data-action="moveLinkDown" type="button" aria-label="아래로 이동" title="아래로 이동">↓</button>
        </div>
        <label class="switch">
          <input data-field="enabled" type="checkbox" ${link.enabled ? "checked" : ""}>
          <span></span>
        </label>
      </div>
      <div class="field-grid">
        <label>
          버튼 제목
          <input data-field="title" type="text" maxlength="60" value="${escapeHtml(link.title)}">
        </label>
      </div>
      <div class="icon-tools">
        <label class="file-field">
          로고 이미지
          <input data-field="iconImageFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
        </label>
        <button class="secondary-button compact-button" data-action="clearIconImage" type="button">이미지 삭제</button>
        <small>정사각형 PNG/JPG/WebP 권장, 700KB 이하</small>
      </div>
      <label>
        설명
        <input data-field="description" type="text" maxlength="110" value="${escapeHtml(link.description)}">
      </label>
      <label>
        연결 주소
        <input data-field="url" type="url" placeholder="https://..." value="${escapeHtml(link.url)}">
      </label>
    `;
    linkEditor.appendChild(row);
    updateIconPreview(row);
  }
  refreshOrderControls();
}

function renderStats(site, stats) {
  const totalClicks = Number(stats?.totalClicks || 0);
  const today = stats?.days?.[todayKey()] || { total: 0, links: {} };

  document.getElementById("totalClicks").textContent = totalClicks.toLocaleString("ko-KR");
  document.getElementById("todayClicks").textContent = Number(today.total || 0).toLocaleString("ko-KR");

  const statsList = document.getElementById("statsList");
  statsList.innerHTML = "";

  for (const link of site.links || []) {
    const row = document.createElement("div");
    row.className = "stats-row";
    row.innerHTML = `
      <span>${escapeHtml(link.title)}</span>
      <strong>${Number(stats?.links?.[link.id]?.total || 0).toLocaleString("ko-KR")}</strong>
    `;
    statsList.appendChild(row);
  }
}

function renderLandingTools() {
  const landing = `${window.location.origin}/`;
  document.getElementById("landingUrl").textContent = landing;
  document.getElementById("qrSvgButton").href = `/qr.svg?url=${encodeURIComponent(landing)}`;
  document.getElementById("qrEpsButton").href = `/qr.eps?url=${encodeURIComponent(landing)}`;
}

function formToSite() {
  const linkRows = [...linkEditor.querySelectorAll(".link-row")];
  const existingById = Object.fromEntries((currentSite.links || []).map((link) => [link.id, link]));

  return {
    brandName: currentSite?.brandName || "오일나라",
    brandSubtitle: currentSite?.brandSubtitle || "방문해 주셔서 감사합니다. 메뉴를 선택해 주세요.",
    brandLogoImage: "",
    promotion: {
      eyebrow: settingsForm.elements["promotion.eyebrow"].value,
      title: settingsForm.elements["promotion.title"].value,
      subtitle: settingsForm.elements["promotion.subtitle"].value,
      badge: settingsForm.elements["promotion.badge"].value
    },
    footerLines: settingsForm.elements["footerLines"].value.split("\n").map((line) => line.trim()).filter(Boolean),
    links: linkRows.map((row) => {
      const existing = existingById[row.dataset.id] || {};
      return {
        id: row.dataset.id,
        title: row.querySelector('[data-field="title"]').value,
        description: row.querySelector('[data-field="description"]').value,
        url: row.querySelector('[data-field="url"]').value.trim(),
        enabled: row.querySelector('[data-field="enabled"]').checked,
        tone: existing.tone,
        icon: existing.icon,
        iconBg: row.dataset.iconBg || existing.iconBg || "",
        iconImage: row.dataset.iconImage || ""
      };
    })
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("이미지를 읽지 못했습니다.")));
    reader.readAsDataURL(file);
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "요청을 처리하지 못했습니다.");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function loadAdminData() {
  try {
    const data = await api("/api/admin/site");
    currentSite = data.site;
    currentStats = data.stats;
    fillForm(currentSite);
    renderStats(currentSite, currentStats);
    renderLandingTools();
    showAdmin();
    refreshPreview();
    setMessage(saveMessage, "");
  } catch (error) {
    if (error.status === 401) showLogin();
    else setMessage(loginMessage, error.message, "error");
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage, "");

  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password: loginForm.elements.password.value })
    });
    loginForm.reset();
    await loadAdminData();
  } catch (error) {
    setMessage(loginMessage, error.message, "error");
  }
});

linkEditor.addEventListener("input", (event) => {
  const row = event.target.closest(".link-row");
  if (!row) return;
  schedulePreviewSync();
});

linkEditor.addEventListener("click", (event) => {
  const moveButton = event.target.closest('[data-action="moveLinkUp"], [data-action="moveLinkDown"]');
  if (moveButton) {
    const direction = moveButton.dataset.action === "moveLinkUp" ? "up" : "down";
    moveLinkRow(moveButton.closest(".link-row"), direction);
    return;
  }

  const button = event.target.closest('[data-action="clearIconImage"]');
  if (!button) return;
  const row = button.closest(".link-row");
  row.dataset.iconImage = "";
  const fileInput = row.querySelector('[data-field="iconImageFile"]');
  if (fileInput) fileInput.value = "";
  updateIconPreview(row);
  schedulePreviewSync();
  setMessage(saveMessage, "이미지를 삭제했습니다. 저장 버튼을 눌러 반영하세요.");
});

linkEditor.addEventListener("change", async (event) => {
  if (event.target?.dataset?.field !== "iconImageFile") {
    schedulePreviewSync();
    return;
  }
  const file = event.target.files?.[0];
  const row = event.target.closest(".link-row");
  if (!file || !row) return;

  if (!file.type.startsWith("image/")) {
    setMessage(saveMessage, "이미지 파일만 선택할 수 있습니다.", "error");
    event.target.value = "";
    return;
  }

  if (file.size > MAX_ICON_IMAGE_BYTES) {
    setMessage(saveMessage, "이미지는 700KB 이하로 올려주세요.", "error");
    event.target.value = "";
    return;
  }

  try {
    row.dataset.iconImage = await readFileAsDataUrl(file);
    updateIconPreview(row);
    schedulePreviewSync();
    setMessage(saveMessage, "이미지를 선택했습니다. 저장 버튼을 눌러 반영하세요.");
  } catch (error) {
    setMessage(saveMessage, error.message, "error");
  }
});

settingsForm.addEventListener("input", (event) => {
  if (event.target.closest("#linkEditor")) return;
  schedulePreviewSync();
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(saveMessage, "저장 중입니다.");

  try {
    const data = await api("/api/admin/site", {
      method: "PUT",
      body: JSON.stringify({ site: formToSite() })
    });
    currentSite = data.site;
    currentStats = data.stats;
    fillForm(currentSite);
    renderStats(currentSite, currentStats);
    refreshPreview();
    setMessage(saveMessage, "저장되었습니다.", "success");
  } catch (error) {
    setMessage(saveMessage, error.message, "error");
  }
});

document.getElementById("refreshButton").addEventListener("click", loadAdminData);

document.getElementById("copyUrlButton").addEventListener("click", async () => {
  const landing = `${window.location.origin}/`;
  await navigator.clipboard.writeText(landing);
});

document.getElementById("adminThemeToggle").addEventListener("click", () => {
  setAdminTheme(activeAdminTheme() === "dark" ? "light" : "dark", true);
});

window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
  if (localStorage.getItem(ADMIN_THEME_KEY)) return;
  setAdminTheme(event.matches ? "dark" : "light");
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST", body: "{}" });
  } finally {
    showLogin();
  }
});

updateAdminThemeButton();
loadAdminData();
