const { Client, GatewayIntentBits } = require("discord.js");
const { chromium } = require("playwright");
const http = require("http");

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
const ALERT_INTERVAL  = 20000;
const SERVER_IP       = "148.113.20.151";
const SERVER_PORT     = 444;

let activePlayers    = new Set();
const alerted30      = new Set();
const alerted80      = new Set();
const jsr20          = new Set();
const jsr50          = new Set();
let leaderboardMessage = null;
let channel, kingChannel;
let browser = null;
let page = null;

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
// ⚔️ ALERTS
// ──────────────────────────────────────
async function processAlerts(players) {
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
    } catch (err) { console.log("Alert error:", err?.message); }
  }
}

// ──────────────────────────────────────
// 🌐 PLAYWRIGHT BROWSER
// ──────────────────────────────────────
async function startBrowser() {
  console.log("🌐 Launching headless Chrome...");
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
  });

  page = await context.newPage();

  page.on("console", msg => {
    const text = msg.text();
    if (text.includes("DEBUG") || text.includes("Server set") || text.includes("gla")) {
      console.log("🌐 Browser:", text.substring(0, 400));
    }
  });

  console.log("🐍 Opening slither.io...");
  await page.goto("https://slither.io", { waitUntil: "networkidle", timeout: 30000 });
  console.log("✅ Page loaded!");

  await page.waitForTimeout(2000);

  // Set server via bso BEFORE clicking play — confirmed working method
  try {
    await page.evaluate((ip, port) => {
      if (typeof bso !== "undefined") {
        bso.ip = ip;
        bso.po = port;
        console.log("Server set to:", ip, port);
      } else if (window.bso) {
        window.bso.ip = ip;
        window.bso.po = port;
        console.log("Server set to (window.bso):", ip, port);
      } else {
        console.log("bso not found!");
      }
    }, SERVER_IP, SERVER_PORT);
  } catch(e) {
    console.log("⚠️ Server override error:", e.message);
  }

  // Click play
  try {
    await page.click(".btnt.sadg1", { timeout: 5000 });
    console.log("✅ Clicked Play!");
  } catch(e) {
    try {
      await page.click("#play-btn", { timeout: 3000 });
      console.log("✅ Clicked alt Play button!");
    } catch(e2) {
      console.log("⚠️ Could not click play button, trying Enter key...");
      await page.keyboard.press("Enter");
    }
  }

  await page.waitForTimeout(4000);

  // Verify we connected to the right server
  const actualServer = await page.evaluate(() => {
    return {
      bsoIp: typeof bso !== "undefined" ? bso.ip : (window.bso ? window.bso.ip : "unknown"),
      connected: typeof ws !== "undefined" && ws && ws.readyState === 1,
    };
  }).catch(() => ({ bsoIp: "error", connected: false }));

  console.log("🔍 Server check:", JSON.stringify(actualServer));
  console.log("✅ Game should be running!");
}

async function readLeaderboard() {
  if (!page) return [];
  try {
    const result = await page.evaluate(() => {
      const fpsls = [0];
      let r = 1;
      for (let i = 1; i < 21000; i++) { fpsls.push(r); r += 1/(i+9); }
      function calcScore(sct, fam) {
        if (!sct || sct >= fpsls.length) return Math.round((fam||0)*15);
        return Math.floor(15*(fpsls[sct] + fam/(sct-fpsls[sct]+1) - 1) - 5);
      }

      // gla = global leaderboard array — the TOP 10 shown in game UI
      if (typeof gla !== "undefined" && Array.isArray(gla) && gla.length > 0) {
        const snakes = gla.map(s => {
          if (!s) return null;
          const score = calcScore(s.sct, s.fam);
          return { name: s.nk || "(no name)", score };
        }).filter(Boolean);
        if (snakes.length > 0) return { source: "gla", snakes };
      }

      // window.gla fallback
      if (window.gla && Array.isArray(window.gla) && window.gla.length > 0) {
        const snakes = window.gla.map(s => {
          if (!s) return null;
          const score = calcScore(s.sct, s.fam);
          return { name: s.nk || "(no name)", score };
        }).filter(Boolean);
        if (snakes.length > 0) return { source: "window.gla", snakes };
      }

      // Debug dump
      const debug = {};
      for (const k of ["gla", "top_scores", "leaderboard", "lb"]) {
        try {
          const v = eval(k);
          if (v !== undefined) debug[k] = Array.isArray(v) ? `Array(${v.length})` : typeof v;
        } catch(e) { debug[k] = "undefined"; }
      }
      console.log("DEBUG gla-scan:", JSON.stringify(debug));

      return { source: "none", snakes: [] };
    });

    if (result.source !== "none") console.log(`📋 Source: ${result.source}`);
    return result.snakes.filter(p => p.score > 0).sort((a,b) => b.score - a.score);
  } catch(e) {
    console.log("⚠️ Read error:", e.message);
    return [];
  }
}

async function runLoop() {
  try {
    const isDead = await page.evaluate(() => {
      return typeof slither === "undefined" || slither === null;
    }).catch(() => true);

    if (isDead) {
      console.log("🔄 Snake died, respawning...");
      await page.evaluate((ip, port) => {
        if (typeof bso !== "undefined") { bso.ip = ip; bso.po = port; }
      }, SERVER_IP, SERVER_PORT).catch(() => {});
      await page.click(".btnt.sadg1", { timeout: 3000 }).catch(async () => {
        await page.keyboard.press("Enter").catch(() => {});
      });
      await page.waitForTimeout(3000);
    }
  } catch(e) {}

  const players = await readLeaderboard();

  if (!players.length) {
    console.log(`⚠️ ${new Date().toLocaleTimeString()} — No players read`);
    return;
  }

  console.log(`📊 ${new Date().toLocaleTimeString()} — ${players.length} players`);
  players.slice(0, 5).forEach((p, i) => console.log(`  #${i+1} ${p.name} — ${p.score}`));

  try {
    const embed = buildLeaderboardEmbed(players);
    if (leaderboardMessage) {
      await leaderboardMessage.edit({ embeds: [embed] });
    } else {
      leaderboardMessage = await kingChannel.send({ embeds: [embed] });
      console.log("🏆 Leaderboard created!");
    }
  } catch(e) {
    console.log("❌ Discord error:", e.message);
    leaderboardMessage = null;
  }

  await processAlerts(players);
}

// ──────────────────────────────────────
// 🚀 BOT READY
// ──────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ Discord bot ready: ${client.user.tag}`);

  channel     = await client.channels.fetch(CHANNEL_ID).catch(e => { console.log("❌ CHANNEL_ID:", e.message); return null; });
  kingChannel = await client.channels.fetch(KING_CHANNEL_ID).catch(e => { console.log("❌ KING_CHANNEL_ID:", e.message); return null; });

  if (!channel || !kingChannel) { console.log("❌ Channels not found!"); return; }

  await channel.send("🟢 **JSR GOD MODE ACTIVATED ⚡**").catch(() => {});
  console.log("✅ Startup message sent!");

  setInterval(() => {
    channel.send("🟢 **BOT ACTIVE (GOD MODE) ⚡**").catch(() => {});
    console.log("💓 Heartbeat sent");
  }, 3 * 60 * 60 * 1000);

  try {
    await startBrowser();
  } catch(e) {
    console.log("❌ Browser error:", e.message);
    return;
  }

  setInterval(runLoop, ALERT_INTERVAL);
  await runLoop();
});

client.login(TOKEN);
