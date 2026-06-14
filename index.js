const { Client, GatewayIntentBits } = require("discord.js");
const https = require("https");
const http = require("http");

// 🛡️ Protection
process.on("unhandledRejection", err => console.log("Unhandled:", err?.message));
process.on("uncaughtException", err => console.log("Uncaught:", err?.message));

// 🔁 KEEP ALIVE SERVER
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("JSR BOT IS ALIVE ✅");
}).listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Keep-alive server running on port ${PORT}`);
});

console.log("TOKEN LENGTH:", process.env.DISCORD_BOT_TOKEN?.length);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const TOKEN           = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID      = process.env.DISCORD_CHANNEL_ID;
const KING_CHANNEL_ID = "1492009160920006666";
const ALERT_ROLE      = "<@&1493480046986268803>";

const NTL_URL          = "https://ntl-slither.com/ss/";
const ALERT_INTERVAL   = 20000;       // 20 seconds for alerts
const BOARD_INTERVAL   = 20000;       // 20 seconds for freshest data       // 1 minute for leaderboard refresh

// Trackers
let activePlayers = new Set();
const alerted30   = new Set();
const alerted80   = new Set();
const jsr20       = new Set();
const jsr50       = new Set();

// Leaderboard message reference
let leaderboardMessage = null;

function isJSR(name) {
  const n = name.toLowerCase().replace(/\s+/g, "");
  const patterns = [
    "jsr", "{jsr}", "[jsr]", "(jsr)", "<jsr>", "|jsr|",
    "-jsr-", ".jsr.", "_jsr_", "~jsr~", "«jsr»",
    "jsr.", ".jsr", "jsr_", "_jsr", "jsr-", "-jsr",
    "jsr/", "/jsr", "jsr#", "#jsr",
  ];
  return patterns.some(p => n.includes(p));
}

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
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.on("error", reject);
  });
}

function extractPlayers(html) {
  const players = [];
  const tables  = html.split("<table");

  for (const table of tables) {
    if (!table.includes("8828") || !table.includes("- IN")) continue;

    const rows = table.split("<tr");
    for (const row of rows) {
      const cols = row.split("<td");
      if (cols.length >= 4) {
        const nameMatch  = cols[2].match(/>(.*?)</);
        const scoreMatch = cols[3].match(/>(.*?)</);
        if (nameMatch && scoreMatch) {
          const name  = nameMatch[1].trim();
          const score = parseInt(scoreMatch[1].replace(/,/g, ""), 10);
          if (!isNaN(score) && score > 0) {
            players.push({ name: name || "(no name)", score });
          }
        }
      }
    }
  }

  // Sort by score descending
  return players.sort((a, b) => b.score - a.score);
}

// 🏆 Build leaderboard embed
function buildLeaderboardEmbed(players, totalPlayers) {
  const top10 = players.slice(0, 10);

  const totalScore = players.reduce((sum, p) => sum + p.score, 0);
  const now = new Date();

  const dateStr = now.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

  let board = "";
  top10.forEach((p, i) => {
    const jsrTag = isJSR(p.name) ? " 🛡️" : "";
    board += `#${i + 1} **${p.name}**${jsrTag} — ${p.score.toLocaleString()}\n`;
  });

  return {
    color: 0x7b2fff,
    author: {
      name: "🇮🇳 Slither Server 8828",
    },
    title: "🐍 Leaderboard (Top 10)",
    description: board,
    fields: [
      {
        name: "💯 Total Score",
        value: totalScore.toLocaleString(),
        inline: true,
      },
      {
        name: "👥 Players",
        value: String(totalPlayers),
        inline: true,
      },
      {
        name: "🕐 Updated",
        value: "Just now",
        inline: true,
      },
    ],
    footer: { text: `Powered by JSR Gaming  •  Last Refresh | ${dateStr} ${timeStr}` },
  };
}


client.once("ready", async () => {
  console.log(`✅ Bot ready: ${client.user.tag}`);

  const channel     = await client.channels.fetch(CHANNEL_ID).catch(e => {
    console.log("❌ CHANNEL_ID error:", e.message);
    return null;
  });
  const kingChannel = await client.channels.fetch(KING_CHANNEL_ID).catch(e => {
    console.log("❌ KING_CHANNEL_ID error:", e.message);
    return null;
  });

  if (!channel)     { console.log("❌ Main channel not found!"); return; }
  if (!kingChannel) { console.log("❌ King channel not found!"); return; }

  await channel.send("🟢 **JSR GOD MODE ACTIVATED ⚡**").catch(() => {});
  console.log("✅ Startup message sent!");

  // Heartbeat every 3 hours
  setInterval(() => {
    channel.send("🟢 **BOT ACTIVE (GOD MODE) ⚡**").catch(() => {});
    console.log("💓 Heartbeat sent");
  }, 3 * 60 * 60 * 1000);

  // ──────────────────────────────────────
  // 🏆 LEADERBOARD — updates every 1 min
  // ──────────────────────────────────────
  async function updateLeaderboard() {
    try {
      const html    = await fetchHTML(NTL_URL);
      const players = extractPlayers(html);
      if (!players.length) return;

      const embed = buildLeaderboardEmbed(players, players.length);

      if (leaderboardMessage) {
        // Edit existing message
        await leaderboardMessage.edit({ embeds: [embed] });
        console.log(`🏆 Leaderboard updated — ${new Date().toLocaleTimeString()}`);
      } else {
        // Send fresh message and save reference
        leaderboardMessage = await kingChannel.send({ embeds: [embed] });
        console.log("🏆 Leaderboard message created!");
      }
    } catch (e) {
      console.log("❌ Leaderboard error:", e.message);
      leaderboardMessage = null; // reset so it tries to send again
    }
  }

  // Run immediately then every 1 minute
  await updateLeaderboard();
  setInterval(updateLeaderboard, BOARD_INTERVAL);

  // ──────────────────────────────────────
  // ⚔️ ALERTS — checks every 20 seconds
  // ──────────────────────────────────────
  setInterval(async () => {

    let html;
    try { html = await fetchHTML(NTL_URL); }
    catch (e) { console.log("❌ Fetch error:", e.message); return; }

    let players;
    try { players = extractPlayers(html); }
    catch (e) { console.log("❌ Parse error:", e.message); return; }

    if (!players.length) { console.log("⚠️ No players found."); return; }

    console.log(`📊 ${new Date().toLocaleTimeString()} — Found ${players.length} players on 8828`);

    // Clean up players who left
    const currentNames = new Set(players.map(p => p.name));
    for (const name of [...activePlayers]) {
      if (!currentNames.has(name)) {
        alerted30.delete(name);
        alerted80.delete(name);
        jsr20.delete(name);
        jsr50.delete(name);
        activePlayers.delete(name);
      }
    }

    // ⚔️ Player alerts
    for (const p of players) {
      activePlayers.add(p.name);

      try {
        if (!isJSR(p.name)) {

          if (p.score >= 30000 && !alerted30.has(p.name)) {
            alerted30.add(p.name);
            console.log(`🚨 Enemy alert: ${p.name} (${p.score})`);
            await channel.send({
              content: ALERT_ROLE,
              embeds: [{
                color: 0xff2d2d,
                title: "🚨 TARGET ACQUIRED",
                description:
                  "━━━━━━━━━━━━━━━━━━\n" +
                  `🎯 ENEMY LOCKED\n\n` +
                  `🐍 Name   : ${p.name}\n` +
                  `📏 Length : ${p.score.toLocaleString()}\n\n` +
                  "⚔️ MISSION\n• Surround\n• Trap\n• Eliminate\n" +
                  "━━━━━━━━━━━━━━━━━━",
                footer: { text: "⚡ JSR Tactical System" },
                timestamp: new Date(),
              }]
            });
          }

          if (p.score >= 80000 && !alerted80.has(p.name)) {
            alerted80.add(p.name);
            console.log(`💀 Ultra threat: ${p.name} (${p.score})`);
            await channel.send({
              content: ALERT_ROLE,
              embeds: [{
                color: 0x990000,
                title: "💀 ULTRA THREAT",
                description:
                  "━━━━━━━━━━━━━━━━━━\n" +
                  `🔥 EXTREME TARGET\n\n` +
                  `🐍 Name   : ${p.name}\n` +
                  `📏 Length : ${p.score.toLocaleString()}\n\n` +
                  "🚨 GLOBAL ORDER\nALL PLAYERS → ATTACK NOW\n" +
                  "━━━━━━━━━━━━━━━━━━",
                footer: { text: "☠️ JSR War Protocol" },
                timestamp: new Date(),
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
                color: 0x00ffcc,
                title: "🛡️ ALLY SUPPORT",
                description:
                  "━━━━━━━━━━━━━━━━━━\n" +
                  `🤝 JSR MEMBER ACTIVE\n\n` +
                  `🐍 Name   : ${p.name}\n` +
                  `📏 Length : ${p.score.toLocaleString()}\n\n` +
                  "🟢 SUPPORT PLAN\n• Stay Close\n• Feed\n• Protect\n" +
                  "━━━━━━━━━━━━━━━━━━",
                footer: { text: "🛡️ JSR Support System" },
                timestamp: new Date(),
              }]
            });
          }

          if (p.score >= 50000 && !jsr50.has(p.name)) {
            jsr50.add(p.name);
            console.log(`🚨 Critical JSR: ${p.name} (${p.score})`);
            await channel.send({
              content: ALERT_ROLE,
              embeds: [{
                color: 0x00cc66,
                title: "🚨 CRITICAL ALLY",
                description:
                  "━━━━━━━━━━━━━━━━━━\n" +
                  `⚠️ HIGH VALUE JSR\n\n` +
                  `🐍 Name   : ${p.name}\n` +
                  `📏 Length : ${p.score.toLocaleString()}\n\n` +
                  "🔥 EMERGENCY ORDER\nDEFEND AT ALL COSTS\n" +
                  "━━━━━━━━━━━━━━━━━━",
                footer: { text: "⚡ JSR Emergency Protocol" },
                timestamp: new Date(),
              }]
            });
          }

        }
      } catch (err) {
        console.log("Send error:", err?.message);
      }
    }

  }, ALERT_INTERVAL);
});

client.login(TOKEN);
