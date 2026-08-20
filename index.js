const { Client, GatewayIntentBits } = require("discord.js");
const https = require("https");
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
const T1              = "MTQ4OTI0NDExMTM2MDc1NzgzMQ.GsKrp6.d";
const T2              = "DIGgLq-w29wsNfLDqEindqCFdwmBKxc_0BD78";
const TOKEN           = T1 + T2;
const CHANNEL_ID      = "1490713616813523004";
const KING_CHANNEL_ID = "1515569728851017788";
const ALERT_ROLE      = "<@&1493480046986268803>";
const NTL_URL         = "https://ntl-slither.com/ss/";
const ALERT_INTERVAL  = 20000;

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
  return [
    t, `{${t}}`, `[${t}]`, `(${t})`, `<${t}>`, `|${t}|`,
    `-${t}-`, `.${t}.`, `_${t}_`, `~${t}~`, `«${t}»`,
    `${t}.`, `.${t}`, `${t}_`, `_${t}`, `${t}-`, `-${t}`,
    `${t}/`, `/${t}`, `${t}#`, `#${t}`,
  ];
}

const TEAMS = {
  JSR:  { patterns: buildPatterns("jsr"),  emoji: "🟠" },
  SMT:  { patterns: buildPatterns("smt"),  emoji: "🔵" },
  DINO: { patterns: buildPatterns("dino"), emoji: "🔴" },
  LWK:  { patterns: buildPatterns("lwk"),  emoji: "🟡" },
  IND:  { patterns: buildPatterns("ind"),  emoji: "🟢" },
};

function normalizeName(name) { return name.toLowerCase().replace(/\s+/g, ""); }

function detectTeam(name) {
  const n = normalizeName(name);
  for (const [key, team] of Object.entries(TEAMS)) {
    if (team.patterns.some(p => n.includes(p))) return key;
  }
  return null;
}

function isJSR(name) { return detectTeam(name) === "JSR"; }

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'").replace(/&nbsp;/g, " ");
}

function truncateName(name, max = 22) {
  return name.length <= max ? name : name.slice(0, max - 1) + "…";
}

// ──────────────────────────────────────
// 🌐 FETCH with retry
// ──────────────────────────────────────
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchHTML(res.headers.location).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.on("error", reject);
  });
}

async function fetchWithRetry(url, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try { return await fetchHTML(url); }
    catch (e) {
      console.log(`⚠️ Fetch attempt ${i}/${attempts} failed: ${e.message}`);
      if (i < attempts) await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error("All fetch attempts failed");
}

// ──────────────────────────────────────
// 📊 PARSE PLAYERS
// ──────────────────────────────────────
function extractPlayers(html) {
  // Find 8828 IN server BEFORE stripping tags
  // Look for "8828" in raw HTML (may be inside a span tag)
  // The raw HTML pattern: <span...>8828</span>148.113...IN
  // or just: 8828148.113...IN
  // Find the index of "8828" that is near "IN"
  let idx = -1;
  let searchPos = 0;
  while (true) {
    const i = html.indexOf("8828", searchPos);
    if (i === -1) break;
    // Check if "IN" appears within 500 chars after this "8828"
    if (html.substring(i, i + 500).includes("IN")) {
      idx = i;
      break;
    }
    searchPos = i + 1;
  }

  if (idx === -1) {
    console.log("⚠️ Server 8828 not found");
    return [];
  }

  // Get a chunk of HTML from 8828 onwards (enough for all player data)
  const chunk = html.substring(idx, idx + 4000);

  // Find "1# " inside this chunk - the start of player data
  const playerStart = chunk.indexOf("1# ");
  if (playerStart === -1) {
    console.log(`⚠️ No player data found. HTML length: ${html.length}`);
    return [];
  }

  // Find end of player data - look for "Total Score" or next server block
  let playerEnd = chunk.length;
  for (const marker of ["Total Score", "Updated:"]) {
    const pos = chunk.indexOf(marker, playerStart + 10);
    if (pos !== -1 && pos < playerEnd) playerEnd = pos;
  }

  // Extract just the player data string and clean it up
  let playerData = chunk.substring(playerStart, playerEnd);

  // Remove HTML tags (but do this AFTER locating the section to avoid issues with names like "<")
  playerData = playerData.replace(/<[^>]+>/g, " ");

  // Decode entities
  playerData = decodeEntities(playerData);

  // Collapse whitespace
  playerData = playerData.replace(/\s+/g, " ").trim();

  if (!playerData || !playerData.includes("#")) {
    console.log(`⚠️ Player data empty after cleanup`);
    return [];
  }

  // Parse each player sequentially by rank (1 to 10)
  const players = [];
  let remaining = playerData;

  for (let rank = 1; rank <= 10; rank++) {
    // Strip current rank prefix
    const prefix    = rank + "# ";
    const altPrefix = rank + "#";
    if (remaining.startsWith(prefix))         remaining = remaining.substring(prefix.length);
    else if (remaining.startsWith(altPrefix)) remaining = remaining.substring(altPrefix.length);

    const nextRank = rank + 1;
    let chunkStr;
    if (nextRank <= 10) {
      const pos = remaining.indexOf(nextRank + "#");
      if (pos === -1) { chunkStr = remaining.trim(); remaining = ""; }
      else { chunkStr = remaining.substring(0, pos).trim(); remaining = remaining.substring(pos); }
    } else {
      chunkStr = remaining.trim();
    }

    // Score = trailing digits (3-7 digits)
    const scoreMatch = chunkStr.match(/(\d{3,7})\s*$/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1], 10);
      const name  = chunkStr.substring(0, chunkStr.length - scoreMatch[0].length).trim() || "(no name)";
      if (score > 100) players.push({ name, score });
    }
    if (!remaining) break;
  }

  return players.sort((a, b) => b.score - a.score);
}

// ──────────────────────────────────────
// 🏆 LEADERBOARD EMBED
// ──────────────────────────────────────
function buildLeaderboardEmbed(players) {
  const top10      = players.slice(0, 10);
  const totalScore = players.reduce((sum, p) => sum + p.score, 0);
  const now        = new Date();
  const dateStr    = now.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr    = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
  const RANK_ICONS = ["🥇", "🥈", "🥉"];

  let board = "";
  top10.forEach((p, i) => {
    const rankIcon = RANK_ICONS[i] || `#${i + 1}`;
    const team     = detectTeam(p.name);
    const teamTag  = team ? `${TEAMS[team].emoji} ` : "";
    board += `${rankIcon} ${teamTag}**${truncateName(p.name)}** — ${p.score.toLocaleString()}\n`;
  });

  return {
    color: 0x7b2fff,
    author: { name: "🇮🇳 Slither Server 8828" },
    title: "🐍 Leaderboard (Top 10)",
    description: board,
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
// 🚀 BOT READY
// ──────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ Bot ready: ${client.user.tag}`);

  const channel     = await client.channels.fetch(CHANNEL_ID).catch(e => { console.log("❌ CHANNEL_ID error:", e.message); return null; });
  const kingChannel = await client.channels.fetch(KING_CHANNEL_ID).catch(e => { console.log("❌ KING_CHANNEL_ID error:", e.message); return null; });

  if (!channel)     { console.log("❌ Main channel not found!"); return; }
  if (!kingChannel) { console.log("❌ King channel not found!"); return; }

  await channel.send("🟢 **JSR GOD MODE ACTIVATED ⚡**").catch(() => {});
  console.log("✅ Startup message sent!");

  setInterval(() => {
    channel.send("🟢 **BOT ACTIVE (GOD MODE) ⚡**").catch(() => {});
    console.log("💓 Heartbeat sent");
  }, 3 * 60 * 60 * 1000);

  async function runLoop() {
    let html;
    try { html = await fetchWithRetry(NTL_URL); }
    catch (e) { console.log("❌ Fetch failed:", e.message); return; }

    let players;
    try { players = extractPlayers(html); }
    catch (e) { console.log("❌ Parse error:", e.message); return; }

    if (!players.length) return;

    console.log(`📊 ${new Date().toLocaleTimeString()} — ${players.length} players on 8828`);

    // Update leaderboard
    try {
      const embed = buildLeaderboardEmbed(players);
      if (leaderboardMessage) {
        await leaderboardMessage.edit({ embeds: [embed] });
        console.log(`🏆 Leaderboard updated — ${new Date().toLocaleTimeString()}`);
      } else {
        leaderboardMessage = await kingChannel.send({ embeds: [embed] });
        console.log("🏆 Leaderboard created!");
      }
    } catch (e) {
      console.log("❌ Leaderboard error:", e.message);
      leaderboardMessage = null;
    }

    // Clean up left players
    const currentNames = new Set(players.map(p => p.name));
    for (const name of [...activePlayers]) {
      if (!currentNames.has(name)) {
        alerted30.delete(name); alerted80.delete(name);
        jsr20.delete(name);     jsr50.delete(name);
        activePlayers.delete(name);
      }
    }

    // Alerts
    for (const p of players) {
      activePlayers.add(p.name);
      try {
        if (!isJSR(p.name)) {
          if (p.score >= 30000 && !alerted30.has(p.name)) {
            alerted30.add(p.name);
            console.log(`🚨 Enemy: ${p.name} (${p.score})`);
            await channel.send({
              content: ALERT_ROLE,
              embeds: [{
                color: 0xff2d2d, title: "🚨 TARGET ACQUIRED",
                description: "━━━━━━━━━━━━━━━━━━\n🎯 ENEMY LOCKED\n\n" +
                  `🐍 Name   : ${p.name}\n📏 Length : ${p.score.toLocaleString()}\n\n` +
                  "⚔️ MISSION\n• Surround\n• Trap\n• Eliminate\n━━━━━━━━━━━━━━━━━━",
                footer: { text: "⚡ JSR Tactical System" }, timestamp: new Date(),
              }]
            });
          }
          if (p.score >= 80000 && !alerted80.has(p.name)) {
            alerted80.add(p.name);
            console.log(`💀 Ultra threat: ${p.name} (${p.score})`);
            await channel.send({
              content: ALERT_ROLE,
              embeds: [{
                color: 0x990000, title: "💀 ULTRA THREAT",
                description: "━━━━━━━━━━━━━━━━━━\n🔥 EXTREME TARGET\n\n" +
                  `🐍 Name   : ${p.name}\n📏 Length : ${p.score.toLocaleString()}\n\n` +
                  "🚨 GLOBAL ORDER\nALL PLAYERS → ATTACK NOW\n━━━━━━━━━━━━━━━━━━",
                footer: { text: "☠️ JSR War Protocol" }, timestamp: new Date(),
              }]
            });
          }
        } else {
          if (p.score >= 20000 && !jsr20.has(p.name)) {
            jsr20.add(p.name);
            console.log(`🛡️ JSR ally: ${p.name} (${p.score})`);
            await channel.send({
              content: ALERT_ROLE,
              embeds: [{
                color: 0x00ffcc, title: "🛡️ ALLY SUPPORT",
                description: "━━━━━━━━━━━━━━━━━━\n🤝 JSR MEMBER ACTIVE\n\n" +
                  `🐍 Name   : ${p.name}\n📏 Length : ${p.score.toLocaleString()}\n\n` +
                  "🟢 SUPPORT PLAN\n• Stay Close\n• Feed\n• Protect\n━━━━━━━━━━━━━━━━━━",
                footer: { text: "🛡️ JSR Support System" }, timestamp: new Date(),
              }]
            });
          }
          if (p.score >= 50000 && !jsr50.has(p.name)) {
            jsr50.add(p.name);
            console.log(`🚨 Critical JSR: ${p.name} (${p.score})`);
            await channel.send({
              content: ALERT_ROLE,
              embeds: [{
                color: 0x00cc66, title: "🚨 CRITICAL ALLY",
                description: "━━━━━━━━━━━━━━━━━━\n⚠️ HIGH VALUE JSR\n\n" +
                  `🐍 Name   : ${p.name}\n📏 Length : ${p.score.toLocaleString()}\n\n` +
                  "🔥 EMERGENCY ORDER\nDEFEND AT ALL COSTS\n━━━━━━━━━━━━━━━━━━",
                footer: { text: "⚡ JSR Emergency Protocol" }, timestamp: new Date(),
              }]
            });
          }
        }
      } catch (err) { console.log("Send error:", err?.message); }
    }
  }

  await runLoop();
  setInterval(runLoop, ALERT_INTERVAL);
});

client.login(TOKEN);
