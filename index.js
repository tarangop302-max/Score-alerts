const { Client, GatewayIntentBits } = require("discord.js");
const puppeteer = require("puppeteer");
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
// 🌐 HEADLESS BROWSER SLITHER CLIENT
// ──────────────────────────────────────
async function startBrowserSession() {
  console.log("🚀 Launching Headless Browser Interceptor...");

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");

    // Forward browser logs to Node console for full visibility
    page.on("console", msg => console.log("🌐 BROWSER:", msg.text()));
    page.on("pageerror", err => console.log("🌐 BROWSER ERROR:", err.message));

    // Expose Node bridge function
    await page.exposeFunction("onLeaderboardUpdate", (players) => {
      if (players && players.length > 0) {
        latestPlayers = players;
      }
    });

    // Directly load self-contained Slither Client HTML into browser memory
    const clientHTML = `
      <!DOCTYPE html>
      <html>
      <head><title>Slither Client</title></head>
      <body>
      <script>
        console.log("Initializing Direct WebSocket Client to Server 8828...");

        function parseLeaderboard(u) {
          if (u[0] !== 108 || u.length < 5) return null;

          const candidates = [1, 2, 3];
          for (let startOffset of candidates) {
            let curr = startOffset;
            let count = u[curr++];
            if (count < 1 || count > 20) continue;

            let players = [];
            let valid = true;

            for (let i = 0; i < count; i++) {
              if (curr + 3 > u.length) { valid = false; break; }

              let rawScore = (u[curr] << 8) | u[curr + 1];
              curr += 2;

              let nameLen = u[curr++];
              if (curr + nameLen > u.length) { valid = false; break; }

              let nameBytes = u.subarray(curr, curr + nameLen);
              curr += nameLen;

              let name = "";
              try {
                name = new TextDecoder("utf-8").decode(nameBytes);
              } catch(e) {
                for (let b of nameBytes) name += String.fromCharCode(b);
              }
              name = name.trim() || "(Anonymouse)";

              let score = Math.max(0, Math.floor((rawScore - 15) / 10));
              if (score <= 0 && rawScore > 0) score = rawScore;

              players.push({ name, score });
            }

            if (valid && players.length > 0) {
              return players;
            }
          }
          return null;
        }

        function connectWS() {
          const wsUrl = "ws://148.113.20.151:444/slither";
          console.log("Connecting WebSocket to " + wsUrl);

          const ws = new WebSocket(wsUrl);
          ws.binaryType = "arraybuffer";

          let pingInterval = null;
          let spawnInterval = null;

          ws.onopen = () => {
            console.log("✅ WebSocket connected to Slither Server 8828!");

            // Protocol initialization packet
            ws.send(new Uint8Array([1]));

            // Ping keepalive every 250ms
            pingInterval = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(new Uint8Array([251]));
              }
            }, 250);

            // Auto-spawn packet ("s", protocol 10, skin 0, name "JSR-Bot")
            const spawnPacket = new Uint8Array([115, 10, 0, 7, 74, 83, 82, 45, 66, 111, 116]);
            ws.send(spawnPacket);

            spawnInterval = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(spawnPacket);
              }
            }, 4000);
          };

          ws.onmessage = (event) => {
            if (!(event.data instanceof ArrayBuffer)) return;
            const u = new Uint8Array(event.data);
            if (u.length < 3) return;

            const opcode = u[0];

            // Opcode 108 ('l') = Leaderboard Packet
            if (opcode === 108) {
              const players = parseLeaderboard(u);
              if (players && players.length > 0) {
                if (window.onLeaderboardUpdate) {
                  window.onLeaderboardUpdate(players);
                }
              }
            }
          };

          ws.onerror = (err) => {
            console.error("WS Error:", err);
          };

          ws.onclose = (e) => {
            console.log("WS Closed with code " + e.code + ". Reconnecting in 3s...");
            clearInterval(pingInterval);
            clearInterval(spawnInterval);
            setTimeout(connectWS, 3000);
          };
        }

        connectWS();
      </script>
      </body>
      </html>
    `;

    await page.setContent(clientHTML);
    console.log("⚡ Internal Slither Client injected & running.");

    browser.on("disconnected", () => {
      console.log("Browser session disconnected. Restarting in 5s...");
      setTimeout(startBrowserSession, 5000);
    });
  } catch (err) {
    console.error("Browser launch error:", err.message);
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
const readyEvent = client.once ? "clientReady" : "ready";
client.once(readyEvent, async () => {
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

    console.log(`📊 ${new Date().toLocaleTimeString()} — ${players.length} players loaded`);

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
