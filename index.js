const { Client, GatewayIntentBits } = require("discord.js");
const http = require("http");
const { SlitherSource } = require("./slither-source");

process.on("unhandledRejection", err => console.log("Unhandled:", err?.message));
process.on("uncaughtException", err => console.log("Uncaught:", err?.message));

// ─────────────────────────────────────
// 🔑 CONFIG
// ─────────────────────────────────────
// ▼▼▼  PASTE YOUR VALUES HERE  ▼▼▼
const T1         = "MTQ4OTI0NDExMTM2MDc1NzgzMQ.Gat3qj.8A6d";   // first half of the bot token
const T2         = "Ga4uurKHZv32mlC5eTToeFCO-3J-OQC6AA";  // second half of the bot token
const CHANNEL_ID = "1490713616813523004"; // channel for the alerts
// ▲▲▲  (a Railway variable with the same purpose, if set, wins over these)  ▲▲▲

const TOKEN           = process.env.DISCORD_TOKEN || (T1 + T2);
const ALERT_CHANNEL   = process.env.CHANNEL_ID || CHANNEL_ID;
const KING_CHANNEL_ID = process.env.KING_CHANNEL_ID || "1515569728851017788";
const ALERT_ROLE      = process.env.ALERT_ROLE      || "<@&1493480046986268803>";
const ALERT_INTERVAL  = Number(process.env.ALERT_INTERVAL_MS) || 20000;
const SERVER_IP       = process.env.SERVER_IP || "148.113.20.151";
const SERVER_PORT     = Number(process.env.SERVER_PORT) || 444;
const BOT_NICK        = process.env.BOT_NICK || "JSR.bot";
const SLITHER_SECURE  = process.env.SLITHER_SECURE !== "false"; // wss:// for real servers

// Fail loudly (and clearly) if the values were never filled in, instead of a silent "invalid token".
{
  const missing = [];
  if (!TOKEN || TOKEN.includes("PASTE")) missing.push("the bot token (T1 + T2 at the top of index.js)");
  if (!ALERT_CHANNEL || ALERT_CHANNEL.includes("PASTE")) missing.push("CHANNEL_ID at the top of index.js");
  if (missing.length) {
    console.log("❌ Not configured yet. Still missing: " + missing.join(" and ") + ".");
    process.exit(1);
  }
}

// ─────────────────────────────────────
// 📡 LEADERBOARD SOURCE  (direct connection to the game server -- no browser)
// ─────────────────────────────────────
const source = new SlitherSource({ ip: SERVER_IP, port: SERVER_PORT, secure: SLITHER_SECURE, nick: BOT_NICK });
source.on("status", s => console.log(`🔌 Source: ${s.state}${s.retryInMs ? ` (retry in ${Math.round(s.retryInMs / 1000)}s)` : ""}`));
source.on("died", () => console.log("💀 Bot snake died — the source will reconnect by itself"));
source.on("error-log", msg => console.log("⚠️ Source:", msg));

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  if (req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(source.getStatus(), null, 2));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("JSR BOT IS ALIVE ✅");
}).listen(PORT, "0.0.0.0", () => console.log(`✅ Keep-alive server on port ${PORT}`));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

let activePlayers    = new Set();
const alerted30      = new Set();
const alerted80      = new Set();
const jsr20          = new Set();
const jsr50          = new Set();
let leaderboardMessage = null;
let channel, kingChannel;

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
function buildLeaderboardEmbed(players, meta = {}) {
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
      // real number of players on the server (from the game), not just the 10 listed
      { name: "👥 Players", value: String(meta.totalPlayers || players.length), inline: true },
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
// 🔁 MAIN LOOP  (data comes from the source; this part is unchanged)
// ──────────────────────────────────────
async function runLoop() {
  const snap = source.getSnapshot();

  // never alert from stale data (e.g. while the source is reconnecting)
  if (!snap.players.length || snap.ageMs > 60000) {
    console.log(`⚠️ ${new Date().toLocaleTimeString()} — No fresh leaderboard yet (source: ${source.state})`);
    return;
  }

  // our own observer snake is not part of the board
  const players = snap.players
    .filter(p => !p.isSelf && p.score > 0)
    .map(p => ({ name: p.name, score: p.score }))
    .sort((a,b) => b.score - a.score);

  if (!players.length) {
    console.log(`⚠️ ${new Date().toLocaleTimeString()} — No players read`);
    return;
  }

  console.log(`📊 ${new Date().toLocaleTimeString()} — ${players.length} players (server has ${snap.totalPlayers})`);
  players.slice(0, 5).forEach((p, i) => console.log(`  #${i+1} ${p.name} — ${p.score}`));

  try {
    const embed = buildLeaderboardEmbed(players, { totalPlayers: snap.totalPlayers });
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

  channel     = await client.channels.fetch(ALERT_CHANNEL).catch(e => { console.log("❌ CHANNEL_ID (alerts):", e.message); return null; });
  kingChannel = await client.channels.fetch(KING_CHANNEL_ID).catch(e => { console.log("❌ KING_CHANNEL_ID:", e.message); return null; });

  if (!channel || !kingChannel) { console.log("❌ Channels not found!"); return; }

  await channel.send("🟢 **JSR GOD MODE ACTIVATED ⚡**").catch(() => {});
  console.log("✅ Startup message sent!");

  setInterval(() => {
    channel.send("🟢 **BOT ACTIVE (GOD MODE) ⚡**").catch(() => {});
    console.log("💓 Heartbeat sent");
  }, 3 * 60 * 60 * 1000);

  console.log(`📡 Connecting to slither server ${SERVER_IP}:${SERVER_PORT} as "${BOT_NICK}"...`);
  source.start();

  setInterval(runLoop, ALERT_INTERVAL);
  await runLoop();
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => { console.log(`${sig} received, shutting down`); source.stop(); process.exit(0); });
}

client.login(TOKEN);
