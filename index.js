const { Client, GatewayIntentBits } = require("discord.js");
const puppeteer = require("puppeteer");
const http = require("http");
const fs = require("fs"); // Added to check local file paths

process.on("unhandledRejection", err => console.log("Unhandled:", err?.message));
process.on("uncaughtException", err => console.log("Uncaught:", err?.message));

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("JSR BOT IS ALIVE ✅");
}).listen(PORT, "0.0.0.0", () => console.log(`✅ Keep-alive server on port ${PORT}`));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ─────────────────────────────────────
// 🔑 CONFIG
// ─────────────────────────────────────
const T1              = "MTQ4OTI0NDExMTM2MDc1NzgzMQ.Gat3qj.8A6d";
const T2              = "Ga4uurKHZv32mlC5eTToeFCO-3J-OQC6AA";
const TOKEN           = T1 + T2;
const CHANNEL_ID      = "1490713616813523004";
const KING_CHANNEL_ID = "1515569728851017788";
const ALERT_ROLE      = "<@&1493480046986268803>";
const ALERT_INTERVAL  = 15000;

let activePlayers      = new Set();
const alerted30        = new Set();
const alerted80        = new Set();
const jsr20            = new Set();
const jsr50            = new Set();
let leaderboardMessage = null;
let latestPlayers      = [];

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
// 🔍 AUTOMATIC CHROMIUM PATH FINDER
// ──────────────────────────────────────
function findChromiumExecutable() {
  const possiblePaths = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome"
  ];
  for (const path of possiblePaths) {
    if (fs.existsSync(path)) {
      console.log(`✅ Found system Chromium at: ${path}`);
      return path;
    }
  }
  console.log("⚠️ No system Chromium found, falling back to default Puppeteer executable.");
  return null;
}

// ──────────────────────────────────────
// 🌐 NTL SITE CLOUDFLARE SCRAPER
// ──────────────────────────────────────
async function startBrowserSession() {
  console.log("🚀 Launching Stealth Browser for NTL RealTime Leaderboard...");

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: findChromiumExecutable(), // Auto-detect path
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1920,1080"
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");

    // Bypass Cloudflare challenge flags
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(document, "hidden", { value: false, writable: false });
      Object.defineProperty(document, "visibilityState", { value: "visible", writable: false });
    });

    console.log("⏳ Navigating to NTL RealTime Leaderboard (https://ntl-slither.com/ss/)...");
    await page.goto("https://ntl-slither.com/ss/?reg=asia", { waitUntil: "domcontentloaded", timeout: 60000 });

    // Handle Cloudflare challenge check loop
    let title = await page.title();
    let retries = 0;
    while ((title.includes("Just a moment") || title.includes("Cloudflare") || title.includes("Attention Required")) && retries < 20) {
      console.log("⏳ Waiting for Cloudflare verification on NTL site...");
      await new Promise(r => setTimeout(r, 2000));
      title = await page.title();
      retries++;
    }

    console.log(`✅ Cloudflare Verification Passed! Page Title: "${title}"`);

    // Scrape loop: Query NTL page memory and DOM for Server 8828 / 148.113.20.151
    setInterval(async () => {
      try {
        const players = await page.evaluate(() => {
          let list = [];

          // Strategy 1: Read NTL global JavaScript server objects
          const windowObjects = [window.servers, window.serverData, window.slitherServers, window.sList];
          for (let obj of windowObjects) {
            if (obj) {
              const arr = Array.isArray(obj) ? obj : Object.values(obj);
              const target = arr.find(s => s && (String(s.ip).includes("148.113.20.151") || String(s.port) === "444" || String(s.id).includes("8828")));
              if (target && (target.leaderboard || target.lb || target.players)) {
                const lb = target.leaderboard || target.lb || target.players;
                if (Array.isArray(lb)) {
                  return lb.map(p => ({
                    name: String(p.name || p.nick || p.n || "(Anonymouse)").trim(),
                    score: Math.floor(Number(p.score || p.length || p.s || 0))
                  })).filter(p => p.score > 0);
                }
              }
            }
          }

          // Strategy 2: Parse rendered HTML tables on NTL page
          const rows = Array.from(document.querySelectorAll("table tr, .server_box, .server-card, div[id*='8828'], div[id*='148.113.20.151']"));
          for (let row of rows) {
            const text = row.innerText || "";
            if (text.includes("148.113.20.151") || text.includes("8828")) {
              const playerElements = row.querySelectorAll("li, .player, .lb_item, tr");
              playerElements.forEach(el => {
                const raw = el.innerText || "";
                const match = raw.match(/^(?:\d+[\.\s]+)?(.+?)\s+[-–—:]?\s+([\d,]+)$/);
                if (match) {
                  const name = match[1].trim();
                  const score = parseInt(match[2].replace(/,/g, ""), 10);
                  if (name && !isNaN(score) && score > 0) {
                    list.push({ name, score });
                  }
                }
              });
            }
          }

          // Strategy 3: Global document search for all leaderboard elements
          if (list.length === 0) {
            const allLbItems = Array.from(document.querySelectorAll(".lb_name, .nick"));
            allLbItems.forEach(item => {
              const name = item.innerText.trim();
              const scoreEl = item.parentElement ? item.parentElement.querySelector(".lb_score, .score") : null;
              if (name && scoreEl) {
                const score = parseInt(scoreEl.innerText.replace(/,/g, ""), 10);
                if (!isNaN(score) && score > 0) {
                  list.push({ name, score });
                }
              }
            });
          }

          return list;
        });

        if (Array.isArray(players) && players.length > 0) {
          latestPlayers = players;
        }
      } catch (err) {
        // Page evaluation guard
      }
    }, 2000);

    browser.on("disconnected", () => {
      console.log("Browser disconnected. Restarting in 5s...");
      setTimeout(startBrowserSession, 5000);
    });
  } catch (err) {
    console.error("NTL Scraper error:", err.message);
    setTimeout(startBrowserSession, 5000);
  }
}

// ──────────────────────────────────────
// 🏆 LEADERBOARD EMBED
// ──────────────────────────────────────
function buildLeaderboardEmbed(players) {
  const top10 = players.slice(0, 10);
  const totalScore = players.reduce((s, p) => s + p.score, 0);
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
  const ICONS = ["🥇", "🥈", "🥉"];
  let board = "";
  top10.forEach((p, i) => {
    const team = detectTeam(p.name);
    board += `${ICONS[i] || `#${i + 1}`} ${team ? TEAMS[team].emoji + " " : ""}**${truncateName(p.name)}** — ${p.score.toLocaleString()}\n`;
  });

  return {
    color: 0x7b2fff,
    author: { name: "🇮🇳 Slither Server 8828 (via NTL)" },
    title: "🐍 Leaderboard (Top 10)",
    description: board || "Waiting for data...",
    fields: [
      { name: "💯 Total Score", value: totalScore.toLocaleString(), inline: true },
      { name: "👥 Players",     value: String(players.length),      inline: true },
      { name: "🕐 Updated",     value: "Just now",                  inline: true },
      { name: "🏷️ Teams", value: "🟠 JSR  🔵 SMT  🔴 DINO  🟡 LWK  🟢 IND", inline: false },
    ],
    footer: { text: `Powered by JSR Gaming  •  Last Refresh | ${dateStr} ${timeStr}` },
  };
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
// 🚀 BOT READY
// ──────────────────────────────────────
client.once("clientReady", async () => {
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
    const players = latestPlayers;

    if (!players.length) { 
      console.log("⚠️ Waiting for leaderboard array from Slither session..."); 
      return; 
    }

    console.log(`📊 ${new Date().toLocaleTimeString()} — ${players.length} players loaded from NTL`);

    try {
      const embed = buildLeaderboardEmbed(players);
      if (leaderboardMessage) {
        await leaderboardMessage.edit({ embeds: [embed] });
      } else {
        leaderboardMessage = await kingChannel.send({ embeds: [embed] });
        console.log("🏆 Leaderboard message posted!");
      }
    } catch(e) {
      console.log("❌ Discord edit error:", e.message);
      leaderboardMessage = null;
    }

    await processAlerts(players, channel);
  }

  await runLoop();
  setInterval(runLoop, ALERT_INTERVAL);
});

startBrowserSession();
client.login(TOKEN);
