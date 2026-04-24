const { Client, GatewayIntentBits } = require("discord.js");
const https = require("https");
const http = require("http");

// 🛡️ protection
process.on("unhandledRejection", err => console.log("Unhandled:", err?.message));
process.on("uncaughtException", err => console.log("Uncaught:", err?.message));

// 🔁 KEEP ALIVE (for Railway)
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("BOT RUNNING");
}).listen(process.env.PORT || 3000);

// 🔍 DEBUG (IMPORTANT)
console.log("TOKEN LENGTH:", process.env.DISCORD_BOT_TOKEN?.length);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const KING_CHANNEL_ID = "1492009160920006666";

const URL = "https://ntl-slither.com/ss/";
const INTERVAL = 20000; // ⚡ stable (20 sec)
const JSR_ROLE_ID = "1456546757893947598";

// trackers
let activePlayers = new Set();
const alerted30 = new Set();
const alerted80 = new Set();
const jsr20 = new Set();
const jsr50 = new Set();

let lastTopPlayer = null;
let lastKingTime = 0;

// 🔍 detect JSR
function isJSR(name) {
  return name.includes("JSR");
}

// 🌐 fetch
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });

    req.on("error", reject);
  });
}

// 🧠 parse
function extractPlayers(html) {
  const players = [];
  const tables = html.split("<table");

  for (const table of tables) {
    if (!table.includes("8828") || !table.includes("- IN")) continue;

    const rows = table.split("<tr");

    for (const row of rows) {
      const cols = row.split("<td");

      if (cols.length >= 4) {
        const nameMatch = cols[2].match(/>(.*?)</);
        const scoreMatch = cols[3].match(/>(.*?)</);

        if (nameMatch && scoreMatch) {
          const name = nameMatch[1].trim();
          const score = parseInt(scoreMatch[1].replace(/,/g, ""), 10);

          if (!isNaN(score)) {
            players.push({ name, score });
          }
        }
      }
    }
  }

  return players;
}

// 🚀 READY
client.once("clientReady", async () => {
  console.log("Bot ready");

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  const kingChannel = await client.channels.fetch(KING_CHANNEL_ID).catch(() => null);

  if (!channel || !kingChannel) return console.log("Channel error");

  await channel.send("🟢 **JSR GOD MODE ACTIVATED ⚡**").catch(() => {});

  // heartbeat
  setInterval(() => {
    channel.send("🟢 **BOT ACTIVE (GOD MODE) ⚡**").catch(() => {});
  }, 3 * 60 * 60 * 1000);

  // 🔁 main loop
  setInterval(async () => {

    let html;
    try {
      html = await fetchHTML(URL);
    } catch {
      return;
    }

    let players;
    try {
      players = extractPlayers(html);
    } catch {
      return;
    }

    if (!players.length) return;

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

    // 👑 KING
    let currentTop = null;
    for (const p of players) {
      if (!currentTop || p.score > currentTop.score) currentTop = p;
    }

    if (currentTop) {
      const now = Date.now();

      if (currentTop.name !== lastTopPlayer && now - lastKingTime > 120000) {
        lastTopPlayer = currentTop.name;
        lastKingTime = now;

        await kingChannel.send({
          embeds: [{
            color: 0xffd700,
            title: "👑 KING OF THE SERVER 👑",
            description:
              "━━━━━━━━━━━━━━━━━━\n" +
              `🔥 **DOMINATING PLAYER**\n\n` +
              `🐍 **Name**   : ${currentTop.name}\n` +
              `📏 **Length** : ${currentTop.score.toLocaleString()}\n\n` +
              "⚔️ **STATUS**\n" +
              "ALL PLAYERS TARGET THIS KING\n" +
              "━━━━━━━━━━━━━━━━━━",
            footer: { text: "👑 JSR King Monitor" },
            timestamp: new Date(),
          }]
        }).catch(() => {});
      }
    }

    // ⚔️ ALERTS
    for (const p of players) {
      activePlayers.add(p.name);

      try {

        if (!isJSR(p.name)) {

          if (p.score >= 30000 && !alerted30.has(p.name)) {
            alerted30.add(p.name);

            await channel.send({
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

            await channel.send({
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

            await channel.send({
              content: `<@&${JSR_ROLE_ID}>`,
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

            await channel.send({
              content: `<@&${JSR_ROLE_ID}>`,
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

  }, INTERVAL);
});
console.log("TOKEN VALUE:", process.env.DISCORD_BOT_TOKEN);
client.login(TOKEN);