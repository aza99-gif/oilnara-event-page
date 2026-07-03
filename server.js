const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const QRCode = require("qrcode");

const PORT = Number(process.env.PORT || 4173);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "oilnara2026!";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "oilnara_event_store";
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const SITE_FILE = path.join(DATA_DIR, "site.json");
const STATS_FILE = path.join(DATA_DIR, "stats.json");
const SESSION_COOKIE = "oilnara_admin";
const DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".eps": "application/postscript",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp"
};

const DEFAULT_LINKS = [
  ["customerForm", "네이버 폼 - 고객정보 등록", "성함, 연락처, 차량 정보를 간단히 등록합니다.", "gold", "폼"],
  ["kakaoChannel", "카카오톡 채널 추가", "채널 추가 후 소식과 혜택을 받아보세요.", "kakao", "Talk"],
  ["naverReview", "네이버 지도 리뷰 등록", "방문 리뷰 작성 페이지로 이동합니다.", "naver", "N"],
  ["naverStore", "오일나라TOP 네이버 스토어", "네이버 스마트스토어에서 제품을 확인합니다.", "store", "쇼핑"],
  ["ownMall", "오일나라 자사몰", "자사몰 상품과 이벤트를 확인합니다.", "mall", "몰"]
];
const DEFAULT_LINK_IDS = DEFAULT_LINKS.map(([id]) => id);

const sessions = new Map();

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

async function supabaseRequest(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase request failed: ${response.status} ${message}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function readStoredJson(key, filePath, fallback) {
  if (!USE_SUPABASE) return readJson(filePath, fallback);

  const rows = await supabaseRequest(
    `/rest/v1/${SUPABASE_TABLE}?key=eq.${encodeURIComponent(key)}&select=value&limit=1`
  );
  if (Array.isArray(rows) && rows[0]?.value) return rows[0].value;

  const initialValue = readJson(filePath, fallback);
  await writeStoredJson(key, filePath, initialValue);
  return initialValue;
}

async function writeStoredJson(key, filePath, value) {
  if (!USE_SUPABASE) {
    writeJson(filePath, value);
    return;
  }

  await supabaseRequest(`/rest/v1/${SUPABASE_TABLE}?on_conflict=key`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify({ key, value })
  });
}

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function sendJson(res, statusCode, value, headers = {}) {
  send(res, statusCode, JSON.stringify(value), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
}

function notFound(res) {
  send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function cleanText(value, fallback = "", maxLength = 120) {
  if (typeof value !== "string") return fallback;
  return value.replace(/\uFFFD/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanLongText(value, fallback = "", maxLength = 400) {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength);
}

function cleanIconImage(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 950_000) return "";
  return /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(trimmed) ? trimmed : "";
}

function cleanColor(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : fallback;
}

function isValidUrl(value) {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function publicOrigin(req) {
  const proto = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  return `${proto}://${req.headers.host || `localhost:${PORT}`}`;
}

function qrData(req, requestUrl) {
  const requested = requestUrl.searchParams.get("url");
  if (requested && isValidUrl(requested)) return requested;
  return `${publicOrigin(req)}/`;
}

function qrToEps(data) {
  const qr = QRCode.create(data, { errorCorrectionLevel: "H" });
  const moduleCount = qr.modules.size;
  const quiet = 4;
  const total = moduleCount + quiet * 2;
  const canvas = 1000;
  const moduleSize = canvas / total;
  const lines = [
    "%!PS-Adobe-3.0 EPSF-3.0",
    "%%Creator: Oilnara QR Admin",
    "%%Title: Oilnara Customer QR",
    `%%BoundingBox: 0 0 ${canvas} ${canvas}`,
    "%%LanguageLevel: 2",
    "%%EndComments",
    "1 1 1 setrgbcolor",
    `0 0 ${canvas} ${canvas} rectfill`,
    "0 0 0 setrgbcolor"
  ];

  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (!qr.modules.data[row * moduleCount + col]) continue;
      const x = (col + quiet) * moduleSize;
      const y = (total - quiet - row - 1) * moduleSize;
      lines.push(`${x.toFixed(4)} ${y.toFixed(4)} ${moduleSize.toFixed(4)} ${moduleSize.toFixed(4)} rectfill`);
    }
  }

  lines.push("showpage", "%%EOF", "");
  return lines.join("\n");
}

function sanitizeSite(input) {
  const source = input && typeof input === "object" ? input : {};
  const sourceLinks = Array.isArray(source.links) ? source.links : [];
  const linkDefaultsById = new Map(DEFAULT_LINKS.map((link) => [link[0], link]));
  const orderedIds = [];
  const seenIds = new Set();

  for (const link of sourceLinks) {
    if (!linkDefaultsById.has(link?.id) || seenIds.has(link.id)) continue;
    orderedIds.push(link.id);
    seenIds.add(link.id);
  }

  for (const id of DEFAULT_LINK_IDS) {
    if (seenIds.has(id)) continue;
    orderedIds.push(id);
    seenIds.add(id);
  }

  return {
    brandName: cleanText(source.brandName, "오일나라", 40),
    brandSubtitle: cleanText(source.brandSubtitle, "방문해 주셔서 감사합니다. 메뉴를 선택해 주세요.", 100),
    brandLogoImage: cleanIconImage(source.brandLogoImage),
    promotion: {
      eyebrow: cleanText(source.promotion?.eyebrow, "방문 고객 이벤트", 40),
      title: cleanText(source.promotion?.title, "오일나라 고객 등록 이벤트!", 60),
      subtitle: cleanText(source.promotion?.subtitle, "편하신 방법으로 진행 후 현장 직원에게 보여주세요", 100),
      badge: cleanText(source.promotion?.badge, "", 24)
    },
    footerLines: Array.isArray(source.footerLines)
      ? source.footerLines.slice(0, 3).map((line) => cleanText(line, "", 80)).filter(Boolean)
      : ["오일나라 고객 전용 페이지", "문의는 매장 직원에게 말씀해 주세요."],
    links: orderedIds.map((id) => {
      const [, defaultTitle, defaultDescription, defaultTone, defaultIcon] = linkDefaultsById.get(id);
      const found = sourceLinks.find((link) => link && link.id === id) || {};
      const url = cleanLongText(found.url, "", 500);
      return {
        id,
        title: cleanText(found.title, defaultTitle, 60),
        description: cleanText(found.description, defaultDescription, 110),
        url: isValidUrl(url) ? url : "",
        enabled: Boolean(found.enabled && isValidUrl(url) && url),
        tone: defaultTone,
        icon: cleanText(found.icon, defaultIcon, 8),
        iconImage: cleanIconImage(found.iconImage),
        iconBg: cleanColor(found.iconBg)
      };
    })
  };
}

function publicSite(site) {
  return {
    brandName: site.brandName,
    brandSubtitle: site.brandSubtitle,
    brandLogoImage: site.brandLogoImage,
    promotion: site.promotion,
    footerLines: site.footerLines,
    links: site.links.map((link) => ({
      id: link.id,
      title: link.title,
      description: link.description,
      enabled: Boolean(link.enabled && link.url),
      tone: link.tone,
      icon: link.icon,
      iconImage: link.iconImage,
      iconBg: link.iconBg,
      href: `/go/${encodeURIComponent(link.id)}`
    }))
  };
}

function defaultStats() {
  return {
    totalClicks: 0,
    links: Object.fromEntries(DEFAULT_LINKS.map(([id]) => [id, { total: 0, lastClickedAt: null }])),
    days: {}
  };
}

function normalizeStats(stats) {
  const result = stats && typeof stats === "object" ? stats : defaultStats();
  result.totalClicks = Number(result.totalClicks || 0);
  result.links = result.links && typeof result.links === "object" ? result.links : {};
  result.days = result.days && typeof result.days === "object" ? result.days : {};

  for (const [id] of DEFAULT_LINKS) {
    if (!result.links[id]) result.links[id] = { total: 0, lastClickedAt: null };
    result.links[id].total = Number(result.links[id].total || 0);
    result.links[id].lastClickedAt = result.links[id].lastClickedAt || null;
  }

  return result;
}

function dayKey(date) {
  return DAY_FORMATTER.format(date);
}

async function recordClick(linkId) {
  const stats = normalizeStats(await readStoredJson("stats", STATS_FILE, defaultStats()));
  const now = new Date();
  const today = dayKey(now);

  stats.totalClicks += 1;
  stats.links[linkId].total += 1;
  stats.links[linkId].lastClickedAt = now.toISOString();

  if (!stats.days[today]) {
    stats.days[today] = {
      total: 0,
      links: Object.fromEntries(DEFAULT_LINKS.map(([id]) => [id, 0]))
    };
  }
  stats.days[today].total += 1;
  stats.days[today].links[linkId] = Number(stats.days[today].links[linkId] || 0) + 1;

  await writeStoredJson("stats", STATS_FILE, stats);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1
          ? [part, ""]
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function signSession(token) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(token).digest("base64url");
}

function issueSession(res, req) {
  const token = crypto.randomBytes(24).toString("base64url");
  const value = `${token}.${signSession(token)}`;
  const secure = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  sessions.set(token, Date.now() + 1000 * 60 * 60 * 12);
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`
  );
}

function clearSession(res, req) {
  const secure = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`
  );
}

function isAuthenticated(req) {
  const value = parseCookies(req)[SESSION_COOKIE];
  if (!value || !value.includes(".")) return false;
  const [token, signature] = value.split(".");
  if (signature !== signSession(token)) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + 1000 * 60 * 60 * 12);
  return true;
}

function ensureDataFiles() {
  if (USE_SUPABASE) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SITE_FILE)) writeJson(SITE_FILE, sanitizeSite({}));
  if (!fs.existsSync(STATS_FILE)) writeJson(STATS_FILE, defaultStats());
}

function serveStatic(req, res, requestUrl) {
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === "/admin") pathname = "/admin.html";
  if (pathname === "/") pathname = "/index.html";

  const publicRoot = path.resolve(PUBLIC_DIR);
  const requestedPath = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (requestedPath !== publicRoot && !requestedPath.startsWith(`${publicRoot}${path.sep}`)) {
    send(res, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  fs.readFile(requestedPath, (error, buffer) => {
    if (error) {
      notFound(res);
      return;
    }
    const contentType = CONTENT_TYPES[path.extname(requestedPath).toLowerCase()] || "application/octet-stream";
    send(res, 200, buffer, {
      "Content-Type": contentType,
      "Cache-Control": contentType.includes("html") ? "no-store" : "public, max-age=3600"
    });
  });
}

async function handleApi(req, res, requestUrl) {
  if (req.method === "GET" && requestUrl.pathname === "/api/site") {
    const site = sanitizeSite(await readStoredJson("site", SITE_FILE, {}));
    sendJson(res, 200, publicSite(site));
    return true;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/login") {
    try {
      const body = await readBody(req);
      if (body.password === ADMIN_PASSWORD) {
        issueSession(res, req);
        sendJson(res, 200, { ok: true });
      } else {
        sendJson(res, 401, { ok: false, message: "비밀번호가 맞지 않습니다." });
      }
    } catch (error) {
      sendJson(res, 400, { ok: false, message: error.message });
    }
    return true;
  }

  if (requestUrl.pathname.startsWith("/api/admin")) {
    if (!isAuthenticated(req)) {
      sendJson(res, 401, { ok: false, message: "로그인이 필요합니다." });
      return true;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/admin/site") {
      sendJson(res, 200, {
        ok: true,
        site: sanitizeSite(await readStoredJson("site", SITE_FILE, {})),
        stats: normalizeStats(await readStoredJson("stats", STATS_FILE, defaultStats()))
      });
      return true;
    }

    if (req.method === "PUT" && requestUrl.pathname === "/api/admin/site") {
      try {
        const body = await readBody(req);
        const site = sanitizeSite(body.site);
        await writeStoredJson("site", SITE_FILE, site);
        sendJson(res, 200, {
          ok: true,
          site,
          stats: normalizeStats(await readStoredJson("stats", STATS_FILE, defaultStats()))
        });
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error.message });
      }
      return true;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/admin/logout") {
      clearSession(res, req);
      sendJson(res, 200, { ok: true });
      return true;
    }
  }

  return false;
}

async function handleQr(req, res, requestUrl) {
  if (req.method !== "GET") return false;

  if (requestUrl.pathname === "/qr.svg") {
    const data = qrData(req, requestUrl);
    const svg = await QRCode.toString(data, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 4,
      color: {
        dark: "#111111",
        light: "#ffffff"
      }
    });
    send(res, 200, svg, {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="oilnara-customer-qr.svg"',
      "Cache-Control": "no-store"
    });
    return true;
  }

  if (requestUrl.pathname === "/qr.eps") {
    const eps = qrToEps(qrData(req, requestUrl));
    send(res, 200, eps, {
      "Content-Type": "application/postscript; charset=utf-8",
      "Content-Disposition": 'attachment; filename="oilnara-customer-qr.eps"',
      "Cache-Control": "no-store"
    });
    return true;
  }

  return false;
}

async function handleGo(req, res, requestUrl) {
  const match = requestUrl.pathname.match(/^\/go\/([^/]+)$/);
  if (!match) return false;

  const linkId = decodeURIComponent(match[1]);
  const site = sanitizeSite(await readStoredJson("site", SITE_FILE, {}));
  const link = site.links.find((item) => item.id === linkId);
  if (!link || !link.enabled || !link.url) {
    send(res, 302, "", { Location: "/?status=not-ready" });
    return true;
  }

  await recordClick(link.id);
  send(res, 302, "", {
    Location: link.url,
    "Cache-Control": "no-store"
  });
  return true;
}

async function handleRequest(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  try {
    if (await handleQr(req, res, requestUrl)) return;
    if (await handleApi(req, res, requestUrl)) return;
    if (await handleGo(req, res, requestUrl)) return;
    serveStatic(req, res, requestUrl);
  } catch (error) {
    sendJson(res, 500, { ok: false, message: "서버 오류가 발생했습니다." });
    console.error(error);
  }
}

ensureDataFiles();

if (require.main === module) {
  http.createServer(handleRequest).listen(PORT, () => {
    console.log(`Oilnara QR server running at http://localhost:${PORT}`);
    console.log(`Admin page: http://localhost:${PORT}/admin`);
    console.log(`Default admin password: ${ADMIN_PASSWORD}`);
    if (USE_SUPABASE) console.log("Storage: Supabase");
  });
}

module.exports = { handleRequest };
