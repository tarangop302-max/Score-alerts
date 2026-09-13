const { Client, GatewayIntentBits } = require("discord.js");
const https = require("https");
const http = require("http");
const WebSocket = require("ws");

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

// Server 8828 direct IP
const SERVER_IP       = "148.113.20.151";
const SERVER_PORT     = 444;
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

function normalizeSpaced(name) {
  return name.toLowerCase()
    .replace(/\b([a-z])\s+(?=[a-z]\b)/g, "$1")
    .replace(/\s+/g, "");
}

function detectTeam(name) {
  const n1 = normalizeName(name);
  const n2 = normalizeSpaced(name);
  for (const [key, team] of Object.entries(TEAMS)) {
    if (team.patterns.some(p => n1.includes(p) || n2.includes(p))) return key;
  }
  return null;
}

function isJSR(name) { return detectTeam(name) === "JSR"; }

function truncateName(name, max = 22) {
  return name.length <= max ? name : name.slice(0, max - 1) + "…";
}

// ──────────────────────────────────────
// 🐍 FETCH LEADERBOARD VIA SLITHER WEBSOCKET
// ──────────────────────────────────────
function fetchLeaderboard() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error("Timeout waiting for leaderboard"));
    }, 15000);

    const ws = new WebSocket(`ws://${SERVER_IP}:${SERVER_PORT}/slither`, {
      headers: {
        "Origin": "http://slither.io",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      }
    });

    ws.on("open", () => {
      console.log("🔌 Connected to slither.io server 8828");
      // Send init packet - slither.io protocol requires a version handshake
      // Protocol: send a Buffer with the version byte
      const initPacket = Buffer.from([0x73, 0x74, 0x61, 0x72, 0x74]); // "start"
      ws.send(initPacket);
    });

    ws.on("message", (data) => {
      try {
        const buf = Buffer.from(data);
        if (buf.length < 2) return;

        const msgType = buf[0];

        // Type 'l' (0x6c) = leaderboard packet
        if (msgType === 0x6c) {
          const players = [];
          let offset = 1;

          while (offset < buf.length) {
            // Each entry: score (4 bytes) + name length (1 byte) + name (utf8)
            if (offset + 4 >= buf.length) break;
            const score = buf.readUInt32BE(offset);
            offset += 4;
            const nameLen = buf[offset];
            offset += 1;
            if (offset + nameLen > buf.length) break;
            const name = buf.toString("utf8", offset, offset + nameLen) || "(no name)";
            offset += nameLen;
            if (score > 0) players.push({ name, score });
          }

          if (players.length > 0) {
            clearTimeout(timeout);
            ws.terminate();
            resolve(players.sort((a, b) => b.score - a.score));
          }
        }
      } catch (e) {
        // Continue waiting for more packets
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on("close", () => {
      clearTimeout(timeout);
    });
  });
}

async function fetchWithRetry(attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fetchLeaderboard();
    } catch (e) {
      console.log(`⚠️ Attempt ${i}/${attempts} failed: ${e.message}`);
      if (i < attempts) await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error("All attempts failed");
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
    let players;
    try { players = await fetchWithRetry(); }
    catch (e) { console.log("❌ Fetch failed:", e.message); return; }

    if (!players.length) return;

    console.log(`📊 ${new Date().toLocaleTimeString()} — ${players.length} players on 8828`);

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

    const currentNames = new Set(players.map(p => p.name));
    for (const name of [...activePlayers]) {
      if (!currentNames.has(name)) {
        alerted30.delete(name); alerted80.delete(name);
        jsr20.delete(name);     jsr50.delete(name);
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
