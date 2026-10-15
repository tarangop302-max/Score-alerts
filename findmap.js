// Finds where the Wyrm website gets its minimap data. Used by the "!mapfind" command.
const https = require("https");

const SITE = "https://wyrmarenas.web.app/";
const redact = (s) => String(s).replace(/wyrm_live_[A-Za-z0-9_\-]+/g, "wyrm_live_***");

function getRaw(url, headers = {}, redirects = 3) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0", ...headers } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(getRaw(new URL(res.headers.location, url).toString(), headers, redirects - 1));
      }
      const chunks = []; let size = 0;
      res.on("data", (c) => { size += c.length; if (size < 3e6) chunks.push(c); });
      res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"] || "", size, buf: Buffer.concat(chunks) }));
    });
    req.setTimeout(8000, () => { req.destroy(); resolve({ status: "timeout", type: "", size: 0, buf: Buffer.alloc(0) }); });
    req.on("error", (e) => resolve({ status: "error " + e.message, type: "", size: 0, buf: Buffer.alloc(0) }));
  });
}

function shape(v, depth = 0) {
  if (Array.isArray(v)) return `array(${v.length})` + (v.length && depth < 2 ? ` of ${shape(v[0], depth + 1)}` : "");
  if (v && typeof v === "object") {
    if (depth >= 2) return "object";
    return "{ " + Object.entries(v).map(([k, x]) => `${k}: ${shape(x, depth + 1)}`).join(", ") + " }";
  }
  return typeof v;
}

async function runMapFind({ base, key, code, arenaKeys }) {
  const out = [];
  const seen = new Set();

  // ── 1) Read the Wyrm website code ──
  out.push("##### 1. WYRM WEBSITE CODE #####");
  const home = await getRaw(SITE);
  out.push(`GET ${SITE} -> ${home.status} (${home.size} bytes)`);
  const html = home.buf.toString("utf8");
  const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => new URL(m[1], SITE).toString());
  out.push("scripts: " + (srcs.join(", ") || "none (inline only)"));
  const texts = [["index.html", html]];
  for (const u of srcs.slice(0, 8)) {
    const r = await getRaw(u);
    out.push(`GET ${u} -> ${r.status} (${r.size} bytes)`);
    if (r.status === 200) texts.push([u, r.buf.toString("utf8")]);
  }
  const apiPaths = new Set(), hosts = new Set(), snippets = [];
  for (const [name, t] of texts) {
    for (const m of t.matchAll(/["'`](\/v1\/[^"'`\s]{1,140})["'`]/g)) apiPaths.add(m[1]);
    for (const m of t.matchAll(/https?:\/\/[a-z0-9.\-]+\.(?:sslip\.io|web\.app|firebaseio\.com|cloudfunctions\.net|run\.app|workers\.dev)[^"'`\s)]{0,100}/gi)) hosts.add(m[0]);
    for (const m of t.matchAll(/mini[_-]?map|radar|bitmap/gi)) {
      if (snippets.length >= 8) break;
      snippets.push(`[${name.split("/").pop()}] ...` + t.slice(Math.max(0, m.index - 120), m.index + 160).replace(/\s+/g, " ") + "...");
    }
  }
  out.push("\nAPI paths found in site code:\n" + ([...apiPaths].slice(0, 60).join("\n") || "(none)"));
  out.push("\nHosts found in site code:\n" + ([...hosts].slice(0, 30).join("\n") || "(none)"));
  out.push("\nMinimap-related snippets:\n" + (snippets.join("\n\n") || "(none)"));

  // ── 2) Try likely API requests ──
  out.push("\n\n##### 2. API REQUESTS #####");
  const H = { accept: "application/json", "X-Wyrm-Key": key };
  const paths = [
    "/openapi.json", "/docs", "/v1", "/v1/openapi.json", "/v1/data",
    `/v1/data/arenas/${code}`, `/v1/data/arenas/${code}/minimap`, `/v1/data/arenas/${code}/map`,
    `/v1/data/arenas/${code}/snapshot`, `/v1/data/arenas/${code}/snakes`, `/v1/data/arenas/${code}/radar`,
    `/v1/data/minimap/${code}`, `/v1/data/map/${code}`,
    ...[...apiPaths].filter(p => /map|radar|snap|bitmap/i.test(p)).slice(0, 10).map(p => p.replace(/\$\{[^}]*\}/g, code)),
  ];
  for (const p of paths) {
    if (seen.has(p)) continue; seen.add(p);
    const r = await getRaw(base + p, H);
    let desc = "";
    if (r.status === 200) {
      if (/json/.test(r.type)) { try { desc = shape(JSON.parse(r.buf.toString("utf8"))).slice(0, 400); } catch { desc = "invalid json"; } }
      else desc = r.type;
    }
    out.push(`GET ${p} -> ${r.status} ${r.type.split(";")[0]} ${r.size}b ${desc}`);
  }

  out.push("\n-- ?include= options (new keys on arena " + code + ") --");
  const known = new Set(arenaKeys || []);
  for (const inc of ["minimap", "map", "mini_map", "miniMap", "snakes", "snapshot", "radar", "bitmap", "grid", "density", "players", "all"]) {
    const r = await getRaw(`${base}/v1/data/arenas?include=${inc}`, H);
    let note = "";
    if (r.status === 200) {
      try {
        const a = (JSON.parse(r.buf.toString("utf8")).arenas || []).find(x => String(x.code) === String(code));
        const added = a ? Object.keys(a).filter(k => !known.has(k)) : [];
        note = a ? "new keys: " + (added.join(", ") || "none") : "arena not in list";
      } catch { note = "invalid json"; }
    }
    out.push(`include=${inc} -> ${r.status} ${note}`);
  }
  out.push("\nDONE");
  return redact(out.join("\n"));
}

module.exports = { runMapFind };
