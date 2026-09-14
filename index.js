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

// Fixed cpw bytes from slither.io game client
const CPW = Buffer.from([
  0x36, 0xce, 0xcc, 0xa9, 0x61, 0xb2, 0x4a, 0x88,
  0x7c, 0x75, 0x0e, 0xd2, 0x6a, 0xec, 0x08, 0xd0,
  0x88, 0xd5, 0x8c, 0x6f
]);

// Browser-like WebSocket headers that the server expects
const WS_HEADERS = {
  "Origin": "http://slither.io",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};

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
// 📊 PARSE LEADERBOARD PACKET
// ──────────────────────────────────────
function parseLeaderboard(buf, startOffset) {
  // Log raw hex for debugging
  console.log("🔬 Leaderboard raw:", buf.slice(startOffset, startOffset + 60).toString("hex"));

  const players = [];
  try {
    // Skip opcode byte, then try multiple parse strategies
    let i = startOffset + 1;

    // Strategy: read pairs of (fam_value, name_len, name)
    // fam is fractional mass — 2 bytes BE, multiply by ~30 for approximate score
    // Try reading from various offsets to find valid data
    for (let skip = 0; skip <= 10; skip++) {
      const players2 = [];
      let j = startOffset + 1 + skip;
      let valid = true;

      for (let rank = 0; rank < 10; rank++) {
        if (j + 3 > buf.length) { valid = false; break; }
        const fam = buf.readUInt16BE(j); j += 2;
        const score = Math.round(fam * 4.9); // approximate conversion
        const nameLen = buf[j++];
        if (nameLen > 50 || j + nameLen > buf.length) { valid = false; break; }
        const name = buf.toString("utf8", j, j + nameLen);
        j += nameLen;
        players2.push({ name: name || "(no name)", score });
      }

      if (valid && players2.length >= 3 && players2[0].score > 100) {
        console.log(`✅ Parse strategy worked with skip=${skip}`);
        return players2.sort((a, b) => b.score - a.score);
      }
    }
  } catch(e) {
    console.log("Parse error:", e.message);
  }
  return players;
}

// ──────────────────────────────────────
// 🐍 SLITHER.IO CONNECTION
// ──────────────────────────────────────
let gameSocket = null;
let pingInterval = null;
let ptcDone = false;

function connectToSlither() {
  ptcDone = false;
  gameSocket = null;
  console.log("🔌 Probing /ptc...");

  const ptc = new WebSocket(`ws://${SERVER_IP}:${SERVER_PORT}/ptc`, {
    headers: WS_HEADERS
  });

  ptc.on("open", () => {
    console.log("✅ /ptc open");
    ptc.send(Buffer.from([0x70]));
  });

  ptc.on("message", (data) => {
    console.log("📦 /ptc msg:", Buffer.from(data).toString("hex").substring(0, 30));
  });

  ptc.on("error", (e) => console.log("⚠️ /ptc:", e.message));

  ptc.on("close", (code) => {
    console.log(`/ptc closed (${code})`);
    if (!ptcDone) { ptcDone = true; openGameSocket(); }
  });

  setTimeout(() => {
    if (!ptcDone) {
      ptcDone = true;
      try { ptc.terminate(); } catch(e) {}
      openGameSocket();
    }
  }, 3000);
}

function openGameSocket() {
  if (gameSocket) return;

  console.log("🔌 Opening /slither...");

  const ws = new WebSocket(`ws://${SERVER_IP}:${SERVER_PORT}/slither`, {
    headers: WS_HEADERS,
    perMessageDeflate: false,
  });
  gameSocket = ws;

  let idba = new Array(27).fill(0);
  let loginSent = false;
  let msgCount = 0;

  ws.on("open", () => {
    console.log("✅ /slither open — sending handshake...");
    // Send exactly as the browser does: 01, then 6300
    ws.send(Buffer.from([0x01]));
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(Buffer.from([0x63, 0x00]));
      }
    }, 100);

    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(Buffer.from([0xfb]));
    }, 2500);
  });

  ws.on("message", async (rawData) => {
    const buf = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
    if (buf.length === 0) return;
    msgCount++;

    // Log all early messages for debugging
    if (msgCount <= 5) {
      console.log(`📦 msg#${msgCount} len=${buf.length} hex=${buf.toString("hex").substring(0, 60)}`);
    }

    // Handle framing: packets can be wrapped with a 2-byte header if first byte < 32
    let offset = 0;
    if (buf[0] < 32) offset = 2;
    if (offset >= buf.length) return;

    const opcode = buf[offset];

    // Opcode 6 = server challenge
    if (opcode === 0x06 && !loginSent) {
      loginSent = true;
      const payload = buf.slice(offset + 1).toString("utf8").trim();
      console.log(`🔑 Challenge (len=${payload.length}):`, payload.substring(0, 80));

      try {
        const sandbox = { idba: new Array(27).fill(0) };
        vm.createContext(sandbox);
        vm.runInContext(payload, sandbox, { timeout: 2000 });
        idba = Array.from(sandbox.idba);
        console.log("✅ idba generated:", Buffer.from(idba).toString("hex").substring(0, 20));
      } catch(e) {
        console.log("⚠️ Challenge eval:", e.message);
        // Use zeros if eval fails
      }

      // Send idba
      ws.send(Buffer.from(idba));

      // Send login packet after short delay
      await new Promise(r => setTimeout(r, 100));

      const nick = Buffer.from("JSR-Observer", "utf8");
      const login = Buffer.alloc(4 + CPW.length + 2 + nick.length + 2);
      let idx = 0;
      login[idx++] = 0x73;
      login[idx++] = 0x1e;
      login[idx++] = 0x01;
      login[idx++] = 0x23;
      CPW.copy(login, idx); idx += CPW.length;
      login[idx++] = 0x05;
      login[idx++] = nick.length;
      nick.copy(login, idx); idx += nick.length;
      login[idx++] = 0x00;
      login[idx++] = 0xff;

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(login);
        console.log("📤 Login sent — waiting for game data...");
      }
    }

    // Opcode 'l' (0x6c) = leaderboard
    if (opcode === 0x6c) {
      console.log("🏆 LEADERBOARD packet received!");
      const players = parseLeaderboard(buf, offset);

      if (!players.length) {
        console.log("⚠️ Could not parse leaderboard");
        return;
      }

      console.log(`📊 ${new Date().toLocaleTimeString()} — ${players.length} players`);
      players.slice(0, 3).forEach((p, i) => console.log(`  #${i+1} ${p.name} — ${p.score}`));

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
  });

  ws.on("error", (e) => console.log("❌ WS error:", e.message));

  ws.on("close", (code, reason) => {
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
