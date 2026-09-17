const { Client, GatewayIntentBits } = require("discord.js");
const WebSocket = require("ws");
const http = require("http");
const vm = require("vm");

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
const SERVER_IP       = "148.113.20.151";
const SERVER_PORT     = 444;

// fpsls and fmlts lookup tables from slither.io client (used to calculate score from sct+fam)
const fpsls = [0];
const fmlts = [0];
(function() {
  let r = 1;
  for (let i = 1; i < 21000; i++) {
    fpsls.push(r);
    fmlts.push(1 / (r - 1 + 1));
    r += 1 / (i + 9);
  }
})();

function calcScore(sct, fam) {
  if (sct >= fpsls.length) return 0;
  return Math.floor(15 * (fpsls[sct] + fam / fmlts[sct] - 1) - 5);
}

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
function normalizeName(n) { return n.toLowerCase().replace(/\s+/g, ""); }
function normalizeSpaced(n) {
  return n.toLowerCase().replace(/\b([a-z])\s+(?=[a-z]\b)/g, "$1").replace(/\s+/g, "");
}
function detectTeam(name) {
  const n1 = normalizeName(name), n2 = normalizeSpaced(name);
  for (const [key, team] of Object.entries(TEAMS))
    if (team.patterns.some(p => n1.includes(p) || n2.includes(p))) return key;
  return null;
}
function isJSR(name) { return detectTeam(name) === "JSR"; }
function truncateName(name, max = 22) {
  return name.length <= max ? name : name.slice(0, max - 1) + "…";
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
    board += `${ICONS[i] || `#${i+1}`} ${team ? TEAMS[team].emoji + " " : ""}**${truncateName(p.name)}** — ${p.score.toLocaleString()}\n`;
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
// 📊 PARSE LEADERBOARD PACKET "l"
// Per ClitherProject/Slither.io-Protocol:
// Byte 0-1: time header
// Byte 2: opcode 'l'
// Byte 3: local rank byte
// Byte 4-5: local rank int16
// Byte 6-7: player count int16
// Then for each of 10 players:
//   int16 sct, int24 fam, int8 color, int8 nameLen, string name
// ──────────────────────────────────────
function parseLeaderboard(buf) {
  const players = [];
  try {
    const playerCount = buf.readUInt16BE(6);
    let offset = 8; // start of player entries

    for (let i = 0; i < 10; i++) {
      if (offset + 6 > buf.length) break;
      const sct = buf.readUInt16BE(offset); offset += 2;
      const fam = buf.readUIntBE(offset, 3) / 16777215; offset += 3;
      const color = buf[offset++];
      const nameLen = buf[offset++];
      if (offset + nameLen > buf.length) break;
      const name = buf.toString("utf8", offset, offset + nameLen) || "(no name)";
      offset += nameLen;
      const score = calcScore(sct, fam);
      if (score > 0) players.push({ name, score, sct });
    }

    if (players.length > 0) {
      console.log(`✅ Parsed ${players.length} players, server count: ${playerCount}`);
      return { players: players.sort((a, b) => b.score - a.score), totalPlayers: playerCount };
    }
  } catch(e) {
    console.log("Parse error:", e.message);
  }
  return { players: [], totalPlayers: 0 };
}

// ──────────────────────────────────────
// 🐍 SLITHER.IO CONNECTION
// Correct protocol per ClitherProject docs:
// 1. Connect to /slither
// 2. Send 0x63 ('c') — StartLogin
// 3. Receive packet '6' — challenge JS
// 4. Execute JS, send 24-byte result
// 5. Send SetUsernameAndSkin (0x73='s', proto-1=10, skinId, nameLen, name)
// 6. Send ping 0xfb every 250ms
// 7. Receive leaderboard 'l' packets
// ──────────────────────────────────────
let gameSocket = null;
let pingInterval = null;

function connectToSlither() {
  if (gameSocket) return;
  console.log("🔌 Connecting to slither.io server 8828...");

  const ws = new WebSocket(`ws://${SERVER_IP}:${SERVER_PORT}/slither`, {
    headers: {
      "Origin": "http://slither.io",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
    perMessageDeflate: false,
  });
  gameSocket = ws;

  let msgCount = 0;
  let loginSent = false;

  ws.on("open", () => {
    console.log("✅ Connected! Sending StartLogin (0x63)...");
    // Step 1: Send StartLogin packet
    ws.send(Buffer.from([0x63]));

    // Ping every 250ms
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(Buffer.from([0xfb]));
    }, 250);
  });

  ws.on("message", async (rawData) => {
    const buf = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
    if (buf.length < 3) return;
    msgCount++;

    // Every packet has 2-byte time header + 1 byte opcode
    const opcode = buf[2];
    const opcodeChar = String.fromCharCode(opcode);

    if (msgCount <= 10) {
      console.log(`📦 msg#${msgCount} opcode=0x${opcode.toString(16)}('${opcodeChar}') len=${buf.length} hex=${buf.toString("hex").substring(0, 40)}`);
    }

    // Packet '6' = Pre-init challenge
    if (opcode === 0x36 && !loginSent) { // 0x36 = '6'
      loginSent = true;
      const jsCode = buf.slice(3).toString("utf8").trim();
      console.log(`🔑 Challenge received (len=${jsCode.length}):`, jsCode.substring(0, 60));

      let secret = [];
      try {
        // The JS sets values in an array — execute it safely
        const sandbox = { secret: [] };
        // Also support if it uses different variable names
        vm.createContext(sandbox);
        vm.runInContext(`var secret = []; ${jsCode}`, sandbox, { timeout: 2000 });
        secret = sandbox.secret || [];
        console.log("✅ Secret array length:", secret.length);
      } catch(e) {
        console.log("⚠️ Challenge eval error:", e.message);
      }

      // Decode secret using ClitherProject Java algorithm
      const result = new Array(24).fill(0);
      let globalValue = 0;
      for (let i = 0; i < 24; i++) {
        let v1 = secret[17 + i * 2] || 0;
        if (v1 <= 96) v1 += 32;
        v1 = ((v1 - 98 - i * 34) % 26 + 26) % 26;

        let v2 = secret[18 + i * 2] || 0;
        if (v2 <= 96) v2 += 32;
        v2 = ((v2 - 115 - i * 34) % 26 + 26) % 26;

        let interim = (v1 << 4) | v2;
        const offset2 = interim >= 97 ? 97 : 65;
        interim -= offset2;
        if (i === 0) globalValue = 2 + interim;
        result[i] = (interim + globalValue) % 26 + offset2;
        globalValue += 3 + interim;
      }

      console.log("📤 Sending challenge response:", Buffer.from(result).toString("hex").substring(0, 20));
      ws.send(Buffer.from(result));

      // Step 2: Send SetUsernameAndSkin
      // Format: 0x73 ('s') | proto_version-1 (10) | skin_id | name_len | name
      const nick = Buffer.from("JSR-Observer", "utf8");
      const login = Buffer.alloc(4 + nick.length);
      login[0] = 0x73; // 's'
      login[1] = 10;   // protocol_version - 1
      login[2] = 0;    // skin id
      login[3] = nick.length;
      nick.copy(login, 4);
      ws.send(login);
      console.log("📤 SetUsernameAndSkin sent — waiting for game data...");
    }

    // Packet 'l' = Leaderboard (0x6c)
    if (opcode === 0x6c && buf.length > 8) {
      const { players, totalPlayers } = parseLeaderboard(buf);
      if (!players.length) return;

      console.log(`📊 ${new Date().toLocaleTimeString()} — ${players.length} players, server total: ${totalPlayers}`);
      players.slice(0, 3).forEach((p, i) => console.log(`  #${i+1} ${p.name} — ${p.score}`));

      try {
        const embed = buildLeaderboardEmbed(players);
        if (leaderboardMessage) {
          await leaderboardMessage.edit({ embeds: [embed] });
        } else {
          leaderboardMessage = await kingChannel.send({ embeds: [embed] });
          console.log("🏆 Leaderboard created in Discord!");
        }
      } catch(e) {
        console.log("❌ Discord error:", e.message);
        leaderboardMessage = null;
      }

      await processAlerts(players);
    }
  });

  ws.on("error", (e) => console.log("❌ WS error:", e.message));

  ws.on("close", (code) => {
    console.log(`🔌 Disconnected (${code}) after ${msgCount} msgs — reconnecting in 5s...`);
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    gameSocket = null;
    setTimeout(connectToSlither, 5000);
  });
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

  connectToSlither();
});

client.login(TOKEN);
