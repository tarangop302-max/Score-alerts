const { Client, GatewayIntentBits, AttachmentBuilder } = require("discord.js");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");
const https = require("https");
const http = require("http");
const { LB, MAP, drawLeaderboard, drawMap } = require("./render");
const { runProbe } = require("./probe");
const { runMapFind } = require("./findmap");

// Bundled fonts so the images look the same on any host
const fs = require("fs");
for (const f of ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"]) {
  const p = [path.join(__dirname, "fonts", f), path.join(__dirname, f)].find(fs.existsSync);
  if (p) GlobalFonts.registerFromPath(p, "DejaVu Sans"); else console.log("⚠️ Font missing:", f);
}

process.on("unhandledRejection", err => console.log("Unhandled:", err?.message));
process.on("uncaughtException", err => console.log("Uncaught:", err?.message));

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("JSR BOT IS ALIVE ✅");
}).listen(PORT, "0.0.0.0", () => console.log(`✅ Keep-alive server on port ${PORT}`));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // needed for the "!map" prefix command (enable it in the Developer Portal)
  ],
});

// ─────────────────────────────────────
// 🔑 CONFIG
// ─────────────────────────────────────
const T1              = "MTQ4OTI0NDExMTM2MDc1NzgzMQ.Gat3qj.8A6d";
const T2              = "Ga4uurKHZv32mlC5eTToeFCO-3J-OQC6AA";
const TOKEN           = T1 + T2;
const CHANNEL_ID      = "1490713616813523004";
const KING_CHANNEL_ID = "1515569728851017788";
const ALERT_ROLE      = "<@&1493480046986268803>";
const ALERT_INTERVAL  = 20000;
const PREFIX          = process.env.PREFIX || "!";
// Optional: if the Wyrm API has a dedicated map endpoint, put its path here (e.g. "/v1/data/arenas/8828/map")
const MAP_PATH        = process.env.MAP_PATH || "";
const ARENA_RADIUS    = Number(process.env.ARENA_RADIUS) || 21600;

// 🐍 Wyrm API — direct server data, no scraping needed
const WYRM_BASE   = "https://wyrm-api.77-245-76-86.sslip.io";
const WYRM_KEY    = "wyrm_live_jN6USG2YxKOWbiKfvivojZ7__HUKnQwj";
const SERVER_CODE = "8828";

let activePlayers    = new Set();
const alerted30      = new Set();
const alerted80      = new Set();
const jsr20          = new Set();
const jsr50          = new Set();
let leaderboardMessage = null;

// ──────────────────────────────────────
// 🏷️ TEAM DETECTION
// ──────────────────────────────────────
function buildPatterns(tag) {
  const t = tag.toLowerCase();
  return [t,`{${t}}`,`[${t}]`,`(${t})`,`<${t}>`,`|${t}|`,`-${t}-`,`.${t}.`,
    `_${t}_`,`~${t}~`,`«${t}»`,`${t}.`,`.${t}`,`${t}_`,`_${t}`,`${t}-`,
    `-${t}`,`${t}/`,`/${t}`,`${t}#`,`#${t}`];
}
const TEAMS = {
  JSR:  { patterns: buildPatterns("jsr"),  emoji: "🟠" },
  SMT:  { patterns: buildPatterns("smt"),  emoji: "🔵" },
  DINO: { patterns: buildPatterns("dino"), emoji: "🔴" },
  LWK:  { patterns: buildPatterns("lwk"),  emoji: "🟡" },
  IND:  { patterns: buildPatterns("ind"),  emoji: "🟢" },
};
function normalizeName(n) { return n.toLowerCase().replace(/\s+/g,""); }
function normalizeSpaced(n) {
  return n.toLowerCase().replace(/\b([a-z])\s+(?=[a-z]\b)/g,"$1").replace(/\s+/g,"");
}
function detectTeam(name) {
  const n1 = normalizeName(name), n2 = normalizeSpaced(name);
  for (const [key, team] of Object.entries(TEAMS))
    if (team.patterns.some(p => n1.includes(p) || n2.includes(p))) return key;
  return null;
}
function isJSR(name) { return detectTeam(name) === "JSR"; }
function truncateName(name, max = 22) {
  return name.length <= max ? name : name.slice(0, max-1) + "…";
}

// ──────────────────────────────────────
// 🌐 WYRM API FETCH
// ──────────────────────────────────────
function wyrmFetch(path) {
  return new Promise((resolve, reject) => {
    const url = WYRM_BASE + path;
    const req = https.get(url, {
      headers: { accept: "application/json", "X-Wyrm-Key": WYRM_KEY }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error("Invalid JSON response")); }
      });
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.on("error", reject);
  });
}

// ──────────────────────────────────────
// 🏆 FETCH LEADERBOARD (via master /arenas?include=leaderboard endpoint)
// ──────────────────────────────────────
let loggedShapeOnce = false;

async function fetchArena(include = "leaderboard") {
  const data = await wyrmFetch(`/v1/data/arenas?include=${include}`);
  const arenas = data.arenas || [];
  const target = arenas.find(a =>
    String(a.code) === SERVER_CODE ||
    String(a.server_code) === SERVER_CODE ||
    String(a.id) === SERVER_CODE ||
    a.address === SERVER_CODE ||
    a.ip === SERVER_CODE
  );
  if (!target) {
    console.log(`⚠️ Server ${SERVER_CODE} not found. Available:`,
      arenas.map(a => a.code || a.server_code || a.id || a.address).join(", "));
  }
  return target || null;
}

function arenaToPlayers(target) {
  if (!target) return [];
  const entries = Array.isArray(target.topTen) ? target.topTen
    : Array.isArray(target.leaderboard) ? target.leaderboard
    : Array.isArray(target.top) ? target.top
    : [];
  if (!loggedShapeOnce) {
    console.log("SAMPLE ARENA KEYS:", Object.keys(target));
    console.log(`ENTRIES COUNT for ${SERVER_CODE}: ${entries.length}`);
    if (entries.length) console.log("SAMPLE ENTRY:", JSON.stringify(entries[0]));
    loggedShapeOnce = true;
  }
  const players = entries.map(e => ({
    name: e.name || e.nick || e.nk || e.username || e.player || "(no name)",
    score: e.score ?? e.length ?? e.len ?? e.sc ?? e.points ?? 0,
  })).filter(p => p.score > 0);
  return players.sort((a, b) => b.score - a.score);
}

async function fetchLeaderboard() {
  return arenaToPlayers(await fetchArena("leaderboard"));
}

// ──────────────────────────────────────
// 🏆 LEADERBOARD EMBED
// ──────────────────────────────────────
function buildLeaderboardEmbed(players) {
  const top10 = players.slice(0, 10);
  const totalScore = players.reduce((s,p) => s+p.score, 0);
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", { timeZone:"Asia/Kolkata", day:"2-digit", month:"2-digit", year:"numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { timeZone:"Asia/Kolkata", hour:"2-digit", minute:"2-digit", hour12:true });
  const ICONS = ["🥇","🥈","🥉"];
  let board = "";
  top10.forEach((p,i) => {
    const team = detectTeam(p.name);
    board += `${ICONS[i]||`#${i+1}`} ${team?TEAMS[team].emoji+" ":""}**${truncateName(p.name)}** — ${p.score.toLocaleString()}\n`;
  });
  return {
    color: 0x7b2fff,
    author: { name: "🇮🇳 Slither Server 8828" },
    title: "🐍 Leaderboard (Top 10)",
    description: board || "Waiting for data...",
    fields: [
      { name: "💯 Total Score", value: totalScore.toLocaleString(), inline: true },
      { name: "👥 Players", value: String(players.length), inline: true },
      { name: "🕐 Updated", value: "Just now", inline: true },
      { name: "🏷️ Teams", value: "🟠 JSR  🔵 SMT  🔴 DINO  🟡 LWK  🟢 IND", inline: false },
    ],
    footer: { text: `Powered by JSR Gaming  •  Last Refresh | ${dateStr} ${timeStr}` },
  };
}

// ──────────────────────────────────────
// 🖼️ IMAGE BUILDERS
// ──────────────────────────────────────
function istTimeText() {
  const now = new Date();
  const d = now.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" });
  const t = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
  return `${d} ${t}`;
}

function renderLeaderboardPng(players) {
  const canvas = createCanvas(LB.W, LB.H);
  drawLeaderboard(canvas.getContext("2d"), players, { detectTeam, serverCode: SERVER_CODE, timeText: istTimeText() });
  return canvas.toBuffer("image/png");
}

// ──────────────────────────────────────
// 🗺️ MAP DATA (tolerant parser — the Wyrm response shape is auto-detected)
// ──────────────────────────────────────
function pickXY(o) {
  if (!o) return null;
  if (Array.isArray(o) && o.length >= 2 && typeof o[0] === "number") return [o[0], o[1]];
  for (const [kx, ky] of [["x","y"],["xx","yy"],["px","py"],["posX","posY"]])
    if (typeof o[kx] === "number" && typeof o[ky] === "number") return [o[kx], o[ky]];
  for (const k of ["head","pos","position","xy","coords"]) if (o[k]) { const r = pickXY(o[k]); if (r) return r; }
  return null;
}
function pickBody(o) {
  for (const k of ["body","segments","pts","parts","tail","trail"])
    if (Array.isArray(o[k])) return o[k].map(pickXY).filter(Boolean);
  return [];
}

function extractMapData(arena) {
  if (!arena) return null;

  // 1) bitmap minimap: flat array (0/1) whose length is a perfect square
  for (const k of ["minimap","miniMap","map","mm"]) {
    const m = arena[k];
    if (Array.isArray(m) && m.length && typeof m[0] !== "object") {
      const n = Math.round(Math.sqrt(m.length));
      if (n * n === m.length) return { radius: ARENA_RADIUS, cells: { size: n, data: m }, snakes: [] };
    }
    if (m && typeof m === "object" && !Array.isArray(m)) {
      const data = m.data || m.cells || m.pixels;
      const size = m.size || m.width || m.w;
      if (Array.isArray(data) && size) return { radius: ARENA_RADIUS, cells: { size, data }, snakes: [] };
    }
  }

  // 2) coordinate lists: snakes / players / entities
  for (const k of ["snakes","players","entities","sn","snake_list","minimap","map"]) {
    const list = arena[k];
    if (!Array.isArray(list) || !list.length) continue;
    const snakes = list.map(o => {
      const xy = pickXY(o);
      return xy ? { name: o.name || o.nick || o.nk || "", x: xy[0], y: xy[1], body: pickBody(o), score: o.score ?? o.length ?? 0 } : null;
    }).filter(Boolean);
    if (snakes.length) {
      snakes.sort((a, b) => (b.score || 0) - (a.score || 0));
      return { radius: ARENA_RADIUS, snakes };
    }
  }
  return null;
}

// Decide where world (0,0) sits: centre of the arena (negative coords) or its corner (all positive)
function normaliseMapData(md) {
  const pts = [];
  (md.snakes || []).forEach(s => { pts.push([s.x, s.y]); (s.body || []).forEach(b => pts.push(b)); });
  let minX = Infinity, minY = Infinity;
  pts.forEach(([x, y]) => { if (x < minX) minX = x; if (y < minY) minY = y; });
  const centred = minX < 0 || minY < 0;
  md.ox = centred ? 0 : md.radius;
  md.oy = centred ? 0 : md.radius;
  let far = 0;
  pts.forEach(([x, y]) => { far = Math.max(far, Math.hypot(x - md.ox, y - md.oy)); });
  if (far > md.radius) md.radius = far * 1.02;
  return md;
}

async function fetchMapData() {
  let arena;
  if (MAP_PATH) {
    const raw = await wyrmFetch(MAP_PATH);
    arena = raw.arena || raw.arenas?.find?.(a => String(a.code) === SERVER_CODE) || raw;
  } else {
    arena = await fetchArena("leaderboard,snakes,minimap,map");
  }
  const md = extractMapData(arena);
  return { md: md ? normaliseMapData(md) : null, arena };
}

function renderMapPng(md) {
  const canvas = createCanvas(MAP.W, MAP.H);
  drawMap(canvas.getContext("2d"), md, { detectTeam, serverCode: SERVER_CODE, timeText: istTimeText() });
  return canvas.toBuffer("image/png");
}

// Describes the response structure (no values of secrets) so the map parser can be tuned
function describeShape(v, depth = 0) {
  if (Array.isArray(v)) return `array(${v.length})` + (v.length && depth < 2 ? ` of ${describeShape(v[0], depth + 1)}` : "");
  if (v && typeof v === "object") {
    if (depth >= 2) return "object";
    return "{ " + Object.entries(v).map(([k, x]) => `${k}: ${describeShape(x, depth + 1)}`).join(", ") + " }";
  }
  return typeof v;
}

// ──────────────────────────────────────
// ⚔️ ALERTS
// ──────────────────────────────────────
async function processAlerts(players, channel) {
  const currentNames = new Set(players.map(p => p.name));
  for (const name of [...activePlayers]) {
    if (!currentNames.has(name)) {
      alerted30.delete(name); alerted80.delete(name);
      jsr20.delete(name); jsr50.delete(name);
      activePlayers.delete(name);
    }
  }
  for (const p of players) {
    activePlayers.add(p.name);
    try {
      if (p.name === "(no name)") continue;
      if (!isJSR(p.name)) {
        if (p.score >= 30000 && !alerted30.has(p.name)) {
          alerted30.add(p.name);
          console.log(`🚨 Enemy: ${p.name} (${p.score})`);
          await channel.send({ content: ALERT_ROLE, embeds: [{ color: 0xff2d2d, title: "🚨 TARGET ACQUIRED",
            description: `━━━━━━━━━━━━━━━━━━\n🎯 ENEMY LOCKED\n\n🐍 Name   : ${p.name}\n📏 Length : ${p.score.toLocaleString()}\n\n⚔️ MISSION\n• Surround\n• Trap\n• Eliminate\n━━━━━━━━━━━━━━━━━━`,
            footer: { text: "⚡ JSR Tactical System" }, timestamp: new Date() }] });
        }
        if (p.score >= 80000 && !alerted80.has(p.name)) {
          alerted80.add(p.name);
          await channel.send({ content: ALERT_ROLE, embeds: [{ color: 0x990000, title: "💀 ULTRA THREAT",
            description: `━━━━━━━━━━━━━━━━━━\n🔥 EXTREME TARGET\n\n🐍 Name   : ${p.name}\n📏 Length : ${p.score.toLocaleString()}\n\n🚨 GLOBAL ORDER\nALL PLAYERS → ATTACK NOW\n━━━━━━━━━━━━━━━━━━`,
            footer: { text: "☠️ JSR War Protocol" }, timestamp: new Date() }] });
        }
      } else {
        if (p.score >= 20000 && !jsr20.has(p.name)) {
          jsr20.add(p.name);
          await channel.send({ content: ALERT_ROLE, embeds: [{ color: 0x00ffcc, title: "🛡️ ALLY SUPPORT",
            description: `━━━━━━━━━━━━━━━━━━\n🤝 JSR MEMBER ACTIVE\n\n🐍 Name   : ${p.name}\n📏 Length : ${p.score.toLocaleString()}\n\n🟢 SUPPORT PLAN\n• Stay Close\n• Feed\n• Protect\n━━━━━━━━━━━━━━━━━━`,
            footer: { text: "🛡️ JSR Support System" }, timestamp: new Date() }] });
        }
        if (p.score >= 50000 && !jsr50.has(p.name)) {
          jsr50.add(p.name);
          await channel.send({ content: ALERT_ROLE, embeds: [{ color: 0x00cc66, title: "🚨 CRITICAL ALLY",
            description: `━━━━━━━━━━━━━━━━━━\n⚠️ HIGH VALUE JSR\n\n🐍 Name   : ${p.name}\n📏 Length : ${p.score.toLocaleString()}\n\n🔥 EMERGENCY ORDER\nDEFEND AT ALL COSTS\n━━━━━━━━━━━━━━━━━━`,
            footer: { text: "⚡ JSR Emergency Protocol" }, timestamp: new Date() }] });
        }
      }
    } catch(err) { console.log("Alert error:", err?.message); }
  }
}


// ──────────────────────────────────────
// 💬 COMMANDS:  "!map" / "!show map"   or   "@Bot show map"
// ──────────────────────────────────────
const lastMapUse = new Map();

client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot || !msg.guild) return;
    const mentioned = msg.mentions.users.has(client.user.id);
    let text = msg.content.replace(new RegExp(`<@!?${client.user.id}>`, "g"), "").trim().toLowerCase();

    let isCmd = mentioned;
    if (text.startsWith(PREFIX)) { isCmd = true; text = text.slice(PREFIX.length).trim(); }
    if (!isCmd) return;

    // "!probe" — admin-only: test connection to the game server and post what it replies
    if (text === "probe") {
      if (!msg.member?.permissions.has("ManageGuild")) return;
      await msg.reply("🔎 Probing the game server, this takes up to ~1 minute...");
      const report = await runProbe(await fetchArena("leaderboard"));
      return void msg.reply({ files: [new AttachmentBuilder(Buffer.from(report, "utf8"), { name: "probe-output.txt" })] });
    }

    // "!mapfind" — admin-only: searches the Wyrm website/API for where the minimap data comes from
    if (text === "mapfind") {
      if (!msg.member?.permissions.has("ManageGuild")) return;
      await msg.reply("🔎 Searching for the map data source, this takes up to ~1 minute...");
      const arena = await fetchArena("leaderboard");
      const report = await runMapFind({ base: WYRM_BASE, key: WYRM_KEY, code: SERVER_CODE, arenaKeys: arena ? Object.keys(arena) : [] });
      return void msg.reply({ files: [new AttachmentBuilder(Buffer.from(report, "utf8"), { name: "mapfind-output.txt" })] });
    }

    const wantsDebug = text === "mapdebug";
    const wantsMap = wantsDebug || /^(show\s*)?map$/.test(text) || /^show\s+(the\s+)?(live\s+)?map$/.test(text);
    if (!wantsMap) return;

    const now = Date.now();
    if (now - (lastMapUse.get(msg.channel.id) || 0) < 5000) return; // 5s cooldown per channel
    lastMapUse.set(msg.channel.id, now);

    await msg.channel.sendTyping().catch(() => {});
    const { md, arena } = await fetchMapData();

    if (wantsDebug) {
      const shape = arena ? describeShape(arena) : "arena not found";
      return void msg.reply("```\n" + shape.slice(0, 1800) + "\n```");
    }
    if (!md) {
      console.log("MAP: no map data found. Arena shape:", arena ? describeShape(arena) : "none");
      return void msg.reply("⚠️ Couldn't find live map data from the API right now. Run `" + PREFIX + "mapdebug` and send the output to the developer.");
    }

    const file = new AttachmentBuilder(renderMapPng(md), { name: "map.png" });
    await msg.reply({
      content: `🗺️ **Live map • Server ${SERVER_CODE}** — ${md.snakes?.length || 0} snakes`,
      files: [file],
      allowedMentions: { repliedUser: false },
    });
  } catch (e) {
    console.log("❌ Map command error:", e.message);
    msg.reply("❌ Couldn't build the map: " + e.message).catch(() => {});
  }
});

// ──────────────────────────────────────
// 🚀 BOT READY
// ──────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ Discord bot ready: ${client.user.tag}`);

  const channel     = await client.channels.fetch(CHANNEL_ID).catch(e => { console.log("❌ CHANNEL_ID:", e.message); return null; });
  const kingChannel = await client.channels.fetch(KING_CHANNEL_ID).catch(e => { console.log("❌ KING_CHANNEL_ID:", e.message); return null; });

  if (!channel || !kingChannel) { console.log("❌ Channels not found!"); return; }

  await channel.send("🟢 **JSR GOD MODE ACTIVATED ⚡**").catch(() => {});
  console.log("✅ Startup message sent!");

  setInterval(() => {
    channel.send("🟢 **BOT ACTIVE (GOD MODE) ⚡**").catch(() => {});
    console.log("💓 Heartbeat sent");
  }, 3 * 60 * 60 * 1000);

  async function runLoop() {
    let players;
    try {
      players = await fetchLeaderboard();
    } catch(e) {
      console.log("❌ Wyrm API error:", e.message);
      return;
    }

    if (!players.length) {
      console.log(`⚠️ ${new Date().toLocaleTimeString()} — No players`);
      return;
    }

    console.log(`📊 ${new Date().toLocaleTimeString()} — ${players.length} players`);
    players.slice(0,3).forEach((p,i) => console.log(`  #${i+1} ${p.name} — ${p.score}`));

    try {
      let payload;
      try {
        const file = new AttachmentBuilder(renderLeaderboardPng(players), { name: `leaderboard-${Date.now()}.png` });
        payload = { content: "", embeds: [], files: [file], attachments: [] };
      } catch (e) {
        console.log("⚠️ Image render failed, using embed:", e.message);
        payload = { content: "", embeds: [buildLeaderboardEmbed(players)], attachments: [] };
      }
      if (leaderboardMessage) {
        await leaderboardMessage.edit(payload);
      } else {
        leaderboardMessage = await kingChannel.send(payload);
        console.log("🏆 Leaderboard created!");
      }
    } catch(e) {
      console.log("❌ Discord error:", e.message);
      leaderboardMessage = null;
    }

    await processAlerts(players, channel);
  }

  await runLoop();
  setInterval(runLoop, ALERT_INTERVAL);
});

client.login(TOKEN);
