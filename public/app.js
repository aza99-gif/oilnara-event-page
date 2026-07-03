const fallbackSite = {
  promotion: {
    eyebrow: "방문 고객 이벤트",
    title: "오일나라 고객 등록 이벤트!",
    subtitle: "편하신 방법으로 진행 후 현장 직원에게 보여주세요",
    badge: ""
  },
  footerLines: ["오일나라 고객 전용 페이지", "문의는 매장 직원에게 말씀해 주세요."],
  links: []
};
const THEME_KEY = "oilnara-theme";

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value || "";
}

function themeFromSystem() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function activeTheme() {
  return document.documentElement.dataset.theme || localStorage.getItem(THEME_KEY) || themeFromSystem();
}

function updateThemeButton() {
  const toggle = document.getElementById("themeToggle");
  const label = document.getElementById("themeToggleLabel");
  const isDark = activeTheme() === "dark";
  if (toggle) toggle.setAttribute("aria-pressed", String(isDark));
  if (label) label.textContent = isDark ? "화이트" : "다크";
}

function setTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  if (persist) localStorage.setItem(THEME_KEY, theme);
  updateThemeButton();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderIcon(link) {
  const iconStyle = link.iconBg ? ` style="background-color: ${escapeHtml(link.iconBg)}"` : "";
  if (link.iconImage) {
    return `<span class="link-icon has-image" aria-hidden="true"${iconStyle}><img src="${escapeHtml(link.iconImage)}" alt=""></span>`;
  }
  return `<span class="link-icon" aria-hidden="true"${iconStyle}>${escapeHtml(link.icon || "")}</span>`;
}

function createLinkButton(link) {
  const element = document.createElement(link.enabled ? "a" : "button");
  element.className = `customer-link tone-${link.tone}${link.enabled ? "" : " is-disabled"}`;

  if (link.enabled) {
    element.href = link.href;
  } else {
    element.type = "button";
    element.addEventListener("click", () => {
      const message = document.getElementById("notReadyMessage");
      message.hidden = false;
      window.setTimeout(() => {
        message.hidden = true;
      }, 2000);
    });
  }

  element.innerHTML = `
    ${renderIcon(link)}
    <span class="link-copy">
      <strong>${escapeHtml(link.title)}</strong>
      <small>${escapeHtml(link.description)}</small>
    </span>
    <span class="link-arrow" aria-hidden="true">›</span>
  `;
  return element;
}

function renderSite(site) {
  setText("promoEyebrow", site.promotion?.eyebrow);
  setText("promoTitle", site.promotion?.title);
  setText("promoSubtitle", site.promotion?.subtitle);

  const links = document.getElementById("customerLinks");
  links.innerHTML = "";
  for (const link of site.links || []) {
    links.appendChild(createLinkButton(link));
  }

  const footer = document.getElementById("customerFooter");
  footer.innerHTML = (site.footerLines || []).map((line) => `<span>${escapeHtml(line)}</span>`).join("");

  document.getElementById("customerShell")?.classList.remove("is-loading");
}

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type !== "oilnara-preview") return;
  renderSite(event.data.site || fallbackSite);
});

async function loadSite() {
  try {
    const response = await fetch("/api/site", { cache: "no-store" });
    if (!response.ok) throw new Error("Failed to load site data.");
    return await response.json();
  } catch (error) {
    return fallbackSite;
  }
}

const params = new URLSearchParams(window.location.search);
if (params.get("status") === "not-ready") {
  const message = document.getElementById("notReadyMessage");
  message.hidden = false;
}

document.getElementById("themeToggle")?.addEventListener("click", () => {
  setTheme(activeTheme() === "dark" ? "light" : "dark", true);
});

window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
  if (localStorage.getItem(THEME_KEY)) return;
  setTheme(event.matches ? "dark" : "light");
});

updateThemeButton();
loadSite().then(renderSite);
