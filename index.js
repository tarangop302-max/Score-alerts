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

// Fixed cpw bytes from slither.io client (game1107241958.js)
const CPW = Buffer.from([
  0x36, 0xce, 0xcc, 0xa9, 0x61, 0xb2, 0x4a, 0x88,
  0x7c, 0x75, 0x0e, 0xd2, 0x6a, 0xec, 0x08, 0xd0,
  0x88, 0xd5, 0x8c, 0x6f
]);

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

function normalizeName(name) { return name.toLowerCase().replace(/\s+/g, ""); }
function normalizeSpaced(name) {
  return name.toLowerCase().replace(/\b([a-z])\s+(?=[a-z]\b)/g, "$1").replace(/\s+/g, "");
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
  const top10      = players.slice(0, 10);
  const totalScore = players.reduce((sum, p) => sum + p.score, 0);
  const now        = new Date();
  const dateStr    = now.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr    = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
  const RANK_ICONS = ["🥇", "🥈", "🥉"];
  let board = "";
  top10.forEach((p, i) => {
    const rankIcon = RANK_ICONS[i] || `#${i + 1}`;
    const team = detectTeam(p.name);
    const teamTag = team ? `${TEAMS[team].emoji} ` : "";
    board += `${rankIcon} ${teamTag}**${truncateName(p.name)}** — ${p.score.toLocaleString()}\n`;
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
            description: "━━━━━━━━━━━━━━━━━━\n🎯 ENEMY LOCKED\n\n" +
              `🐍 Name   : ${p.name}\n📏 Length : ${p.score.toLocaleString()}\n\n` +
              "⚔️ MISSION\n• Surround\n• Trap\n• Eliminate\n━━━━━━━━━━━━━━━━━━",
            footer: { text: "⚡ JSR Tactical System" }, timestamp: new Date() }] });
        }
        if (p.score >= 80000 && !alerted80.has(p.name)) {
          alerted80.add(p.name);
          await channel.send({ content: ALERT_ROLE, embeds: [{ color: 0x990000, title: "💀 ULTRA THREAT",
            description: "━━━━━━━━━━━━━━━━━━\n🔥 EXTREME TARGET\n\n" +
              `🐍 Name   : ${p.name}\n📏 Length : ${p.score.toLocaleString()}\n\n` +
              "🚨 GLOBAL ORDER\nALL PLAYERS → ATTACK NOW\n━━━━━━━━━━━━━━━━━━",
            footer: { text: "☠️ JSR War Protocol" }, timestamp: new Date() }] });
        }
      } else {
        if (p.score >= 20000 && !jsr20.has(p.name)) {
          jsr20.add(p.name);
          await channel.send({ content: ALERT_ROLE, embeds: [{ color: 0x00ffcc, title: "🛡️ ALLY SUPPORT",
            description: "━━━━━━━━━━━━━━━━━━\n🤝 JSR MEMBER ACTIVE\n\n" +
              `🐍 Name   : ${p.name}\n📏 Length : ${p.score.toLocaleString()}\n\n` +
              "🟢 SUPPORT PLAN\n• Stay Close\n• Feed\n• Protect\n━━━━━━━━━━━━━━━━━━",
            footer: { text: "🛡️ JSR Support System" }, timestamp: new Date() }] });
        }
        if (p.score >= 50000 && !jsr50.has(p.name)) {
          jsr50.add(p.name);
          await channel.send({ content: ALERT_ROLE, embeds: [{ color: 0x00cc66, title: "🚨 CRITICAL ALLY",
            description: "━━━━━━━━━━━━━━━━━━\n⚠️ HIGH VALUE JSR\n\n" +
              `🐍 Name   : ${p.name}\n📏 Length : ${p.score.toLocaleString()}\n\n` +
              "🔥 EMERGENCY ORDER\nDEFEND AT ALL COSTS\n━━━━━━━━━━━━━━━━━━",
            footer: { text: "⚡ JSR Emergency Protocol" }, timestamp: new Date() }] });
        }
      }
    } catch (err) { console.log("Send error:", err?.message); }
  }
}

// ──────────────────────────────────────
// 🐍 SLITHER.IO DIRECT CONNECTION
// ──────────────────────────────────────
function parseLeaderboard(buf, offset) {
  // Packet 'l' format (from ClitherProject docs):
  // byte 0: 'l' opcode
  // bytes 1-4: unused/rank info
  // Then groups of: 2 bytes score(BE) + 1 byte name_len + name_bytes
  const players = [];
  try {
    let i = offset + 1; // skip opcode

    // Skip first 5 bytes of header
    i += 5;

    while (i < buf.length) {
      if (i + 2 >= buf.length) break;
      // Score is stored as fam value — multiply to get approximate length
      const score = buf.readUInt16BE(i) * 10;
      i += 2;
      if (i >= buf.length) break;
      const nameLen = buf[i++];
      if (nameLen === 0 || i + nameLen > buf.length) {
        if (nameLen === 0) players.push({ name: "(no name)", score });
        break;
      }
      const name = buf.toString("utf8", i, i + nameLen);
      i += nameLen;
      if (score > 0) players.push({ name: name || "(no name)", score });
    }
  } catch(e) {}
  return players.sort((a, b) => b.score - a.score);
}

function connectToSlither() {
  console.log("🔌 Probing /ptc...");

  const ptc = new WebSocket(`ws://${SERVER_IP}:${SERVER_PORT}/ptc`, {
    headers: { "Origin": "http://slither.io" }
  });

  ptc.on("open", () => { ptc.send(Buffer.from([0x70])); });
  ptc.on("message", () => { ptc.close(); });
  ptc.on("error", () => {});
  ptc.on("close", () => {
    console.log("🔌 Connecting to /slither...");
    openGameSocket();
  });

  // If ptc doesn't close within 3s, proceed anyway
  setTimeout(() => {
    if (ptc.readyState !== WebSocket.CLOSED) ptc.terminate();
    openGameSocket();
  }, 3000);
}

let gameSocket = null;
let pingInterval = null;
let reconnectTimeout = null;

function openGameSocket() {
  if (gameSocket) return; // already connecting

  const ws = new WebSocket(`ws://${SERVER_IP}:${SERVER_PORT}/slither`, {
    headers: { "Origin": "http://slither.io" }
  });
  gameSocket = ws;

  let idba = new Array(27).fill(0);
  let loginSent = false;

  ws.on("open", () => {
    console.log("✅ Connected to slither.io server 8828!");
    ws.send(Buffer.from([0x01]));
    ws.send(Buffer.from([0x63, 0x00]));

    // Keep alive with pings
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(Buffer.from([0xfb]));
    }, 2000);
  });

  ws.on("message", async (data) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (buf.length === 0) return;

    // Determine offset (framing)
    let offset = 0;
    if (buf[0] < 32) offset = 2;

    if (offset >= buf.length) return;
    const opcode = buf[offset];

    // Opcode 6 = server challenge
    if (opcode === 0x06 && !loginSent) {
      const payload = buf.slice(offset + 1).toString("utf8").trim();
      console.log("🔑 Challenge received, length:", payload.length);

      try {
        // Execute the server's JS snippet which sets idba values
        const sandbox = { idba: Array(27).fill(0) };
        vm.createContext(sandbox);
        vm.runInContext(payload, sandbox, { timeout: 1000 });
        idba = sandbox.idba;
      } catch(e) {
        console.log("⚠️ Challenge eval error:", e.message);
      }

      // Send idba response
      ws.send(Buffer.from(idba));
      console.log("📤 Sent idba challenge response");

      // Build and send login packet
      const nick = Buffer.from("JSR-Observer", "utf8");
      const login = Buffer.alloc(4 + CPW.length + 2 + nick.length + 2);
      let i = 0;
      login[i++] = 0x73;       // login opcode
      login[i++] = 0x1e;       // fixed byte
      login[i++] = 0x01;       // version high
      login[i++] = 0x23;       // version low
      CPW.copy(login, i); i += CPW.length;
      login[i++] = 0x05;       // color
      login[i++] = nick.length;
      nick.copy(login, i); i += nick.length;
      login[i++] = 0x00;
      login[i++] = 0xff;

      ws.send(login);
      console.log("📤 Sent login packet — waiting for leaderboard...");
      loginSent = true;
    }

    // Opcode 'l' (0x6c) = leaderboard
    if (opcode === 0x6c) {
      const players = parseLeaderboard(buf, offset);
      if (!players.length) return;

      console.log(`📊 ${new Date().toLocaleTimeString()} — Leaderboard received: ${players.length} players`);
      players.slice(0, 5).forEach((p, i) => console.log(`  #${i+1} ${p.name} — ${p.score}`));

      // Update Discord leaderboard
      try {
        const embed = buildLeaderboardEmbed(players);
        if (leaderboardMessage) {
          await leaderboardMessage.edit({ embeds: [embed] });
        } else {
          leaderboardMessage = await kingChannel.send({ embeds: [embed] });
          console.log("🏆 Leaderboard created!");
        }
      } catch(e) {
        console.log("❌ Leaderboard error:", e.message);
        leaderboardMessage = null;
      }

      await processAlerts(players);
    }
  });

  ws.on("error", (e) => {
    console.log("❌ WebSocket error:", e.message);
  });

  ws.on("close", (code) => {
    console.log(`🔌 Disconnected (${code}) — reconnecting in 5s...`);
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    gameSocket = null;
    reconnectTimeout = setTimeout(connectToSlither, 5000);
  });
}

// ──────────────────────────────────────
// 🚀 BOT READY
// ──────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ Discord bot ready: ${client.user.tag}`);

  channel     = await client.channels.fetch(CHANNEL_ID).catch(e => { console.log("❌ CHANNEL_ID error:", e.message); return null; });
  kingChannel = await client.channels.fetch(KING_CHANNEL_ID).catch(e => { console.log("❌ KING_CHANNEL_ID error:", e.message); return null; });

  if (!channel || !kingChannel) { console.log("❌ Channels not found!"); return; }

  await channel.send("🟢 **JSR GOD MODE ACTIVATED ⚡**").catch(() => {});
  console.log("✅ Startup message sent!");

  setInterval(() => {
    channel.send("🟢 **BOT ACTIVE (GOD MODE) ⚡**").catch(() => {});
    console.log("💓 Heartbeat sent");
  }, 3 * 60 * 60 * 1000);

  // Start slither.io connection
  connectToSlither();
});

client.login(TOKEN);
