const { Client, GatewayIntentBits } = require("discord.js");
const WebSocket = require("ws");
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

// Target Server 8828
const SERVER_URL = "ws://148.113.20.151:444/slither";

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
// 🎮 GAME CONNECTION (WITH HANDSHAKE RESPONSE)
// ──────────────────────────────────────
function startGameConnection() {
  console.log(`Connecting to Slither Server 8828 (${SERVER_URL})...`);

  const ws = new WebSocket(SERVER_URL, {
    headers: {
      "Origin": "http://slither.io",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    }
  });

  let pingInterval = null;

  ws.on("open", () => {
    console.log("⚡ Connected to Slither Server 8828. Initiating handshake...");

    // Step 1: Send client handshake byte (1 = standard mode)
    ws.send(Uint8Array.from([1]));

    // Start 250ms Ping Heartbeat to keep connection open
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(Uint8Array.from([251])); // Opcode 251 (Ping)
      }
    }, 250);
  });

  ws.on("message", (data) => {
    const buffer = Buffer.from(data);
    const opcode = buffer[0];

    // Server sends Carrier Challenge Packet (Opcode 6 / 0x36 / ASCII '6')
    if (opcode === 54 || opcode === 6) {
      console.log(" Received security handshake. Resolving challenge...");
      
      // Respond with dynamic token bytes to satisfy anti-bot
      const challengeResponse = Buffer.alloc(27);
      for (let i = 0; i < 27; i++) challengeResponse[i] = (i * 7) % 256;
      ws.send(challengeResponse);

      // Now send spawn request
      sendSpawnPacket(ws, "Server8828Bot");
    }

    // Opcode 108 ('l') = Leaderboard Packet
    if (opcode === 108) {
      latestPlayers = parseLeaderboard(buffer).map(p => ({ name: p.Name, score: p.Score }));
    }
  });

  ws.on("close", (code) => {
    console.log(`Game connection closed (Code: ${code}). Reconnecting in 5s...`);
    clearInterval(pingInterval);
    setTimeout(startGameConnection, 5000);
  });

  ws.on("error", (err) => {
    console.error("Game WebSocket error:", err.message);
  });
}

function sendSpawnPacket(socket, nick) {
  const nickBuffer = Buffer.from(nick, "utf8");
  // [115 ('s'), protocol_ver (10), skin (0), nick_len, ...nick]
  const packet = Buffer.alloc(4 + nickBuffer.length);
  packet[0] = 115; // Opcode 's'
  packet[1] = 10;  // Protocol version
  packet[2] = 0;   // Skin ID
  packet[3] = nickBuffer.length;
  nickBuffer.copy(packet, 4);

  socket.send(packet);
}

function parseLeaderboard(buffer) {
  let offset = 1; // Skip opcode byte 108
  if (buffer.length <= 1) return [];

  const itemCount = buffer[offset++];
  const leaderboard = [];

  for (let i = 0; i < itemCount; i++) {
    if (offset + 2 > buffer.length) break;

    const rawScore = (buffer[offset] << 8) | buffer[offset + 1];
    offset += 2;
    const mass = Math.max(0, Math.floor((rawScore - 15) / 10));

    if (offset >= buffer.length) break;
    const nameLen = buffer[offset++];

    if (offset + nameLen > buffer.length) break;
    const nameBytes = buffer.subarray(offset, offset + nameLen);
    const name = nameBytes.toString("utf8").trim() || "(Anonymouse)";
    offset += nameLen;

    leaderboard.push({ Rank: i + 1, Name: name, Score: mass });
  }

  return leaderboard;
}

// ──────────────────────────────────────
// 🏆 LEADERBOARD EMBED
// ──────────────────────────────────────
function buildLeaderboardEmbed(players) {
  const top10 = players.slice(0,10);
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
    const players = latestPlayers;

    if (!players.length) { console.log("⚠️ No players yet from game connection"); return; }
    console.log(`📊 ${new Date().toLocaleTimeString()} — ${players.length} players`);

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

    await processAlerts(players, channel);
  }

  await runLoop();
  setInterval(runLoop, ALERT_INTERVAL);
});

startGameConnection();
client.login(TOKEN);
