const { Client, GatewayIntentBits } = require("discord.js");
const https = require("https");
const http = require("http");

// 🛡️ protection
process.on("unhandledRejection", err => console.log("Unhandled:", err?.message));
process.on("uncaughtException", err => console.log("Uncaught:", err?.message));

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ✅ KEEP ALIVE
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("JSR BOT RUNNING");
}).listen(process.env.PORT || 3000);

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const KING_CHANNEL_ID = "1492009160920006666";
const ROLE_ID = "1493480046986268803";

const URL = "https://ntl-slither.com/ss/";
const INTERVAL = 20000;

// tracking
let activePlayers = new Set();
const lastScores = new Map();

const alerted30 = new Set();
const alerted80 = new Set();
const jsr20 = new Set();
const jsr50 = new Set();

let lastTopPlayer = null;
let lastKingTime = 0;

// 🧠 restart-proof memory (temporary)
let firstRun = true;

function normalizeName(name) {
  return name.replace(/\s+/g, "").toLowerCase();
}

function isJSR(name) {
  const patterns = [
    "{ J S R }", "{JSR}", "{ JSR }",
    "( J S R )", "(JSR)", "( JSR )",
    "JSR"
  ];
  const lower = name.toLowerCase();
  return patterns.some(p => lower.includes(p.toLowerCase()));
}

// fetch
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

// parse
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

let isRunning = false;

async function runBot(channel, kingChannel) {
  if (isRunning) return;
  isRunning = true;

  try {
    console.log("BOT LOOP ACTIVE", new Date().toLocaleTimeString());

    let html = await fetchHTML(URL).catch(() => null);
    if (!html) return;

    let players = extractPlayers(html);
    console.log("Players found:", players.length);

    if (!players || players.length === 0) return;

    const currentNames = new Set(players.map(p => normalizeName(p.name)));

    for (const name of [...activePlayers]) {
      if (!currentNames.has(name)) {
        alerted30.delete(name);
        alerted80.delete(name);
        jsr20.delete(name);
        jsr50.delete(name);
        lastScores.delete(name);
        activePlayers.delete(name);
      }
    }

    // 👑 KING (JSR-aware)
    let currentTop = players.reduce((a, b) => !a || b.score > a.score ? b : a, null);

    if (currentTop) {
      const now = Date.now();

      if (currentTop.name !== lastTopPlayer && now - lastKingTime > 120000) {
        lastTopPlayer = currentTop.name;
        lastKingTime = now;

        const isAlly = isJSR(currentTop.name);

        await kingChannel.send({
          embeds: [{
            color: isAlly ? 0x00ffcc : 0xffd700,
            title: isAlly ? "🛡️ JSR KING 👑" : "👑 KING OF THE SERVER 👑",
            description:
              "━━━━━━━━━━━━━━━━━━\n" +
              `${isAlly ? "🤝 **OUR PLAYER DOMINATING**" : "🔥 **DOMINATING PLAYER**"}\n\n` +
              `🐍 **Name**   : ${currentTop.name}\n` +
              `📏 **Length** : ${currentTop.score.toLocaleString()}\n\n` +
              "⚔️ **STATUS**\n" +
              `${isAlly ? "ALL PLAYERS HELP OUR PLAYER" : "ALL PLAYERS TARGET THIS KING"}\n` +
              "━━━━━━━━━━━━━━━━━━",
            footer: { text: "👑 JSR King Monitor" },
            timestamp: new Date(),
          }]
        }).catch(() => {});
      }
    }

    // ⚔️ ALERTS (RESTART SAFE)
    for (const p of players) {
      const id = normalizeName(p.name);
      activePlayers.add(id);

      const curr = p.score;

      // 🧠 On first run → store scores but DON'T alert
      if (firstRun) {
        lastScores.set(id, curr);
        continue;
      }

      try {

        if (!isJSR(p.name)) {

          if (curr >= 30000 && !alerted30.has(id)) {
            alerted30.add(id);

            await channel.send({
              content: `<@&${ROLE_ID}>`,
              embeds: [{
                color: 0xff2d2d,
                title: "🚨 TARGET ACQUIRED",
                description:
                  "━━━━━━━━━━━━━━━━━━\n" +
                  `🎯 ENEMY LOCKED\n\n` +
                  `🐍 Name   : ${p.name}\n` +
                  `📏 Length : ${curr.toLocaleString()}\n\n` +
                  "⚔️ MISSION\n• Surround\n• Trap\n• Eliminate\n" +
                  "━━━━━━━━━━━━━━━━━━",
                footer: { text: "⚡ JSR Tactical System" },
                timestamp: new Date(),
              }]
            });
          }

          if (curr >= 80000 && !alerted80.has(id)) {
            alerted80.add(id);

            await channel.send({
              content: `<@&${ROLE_ID}>`,
              embeds: [{
                color: 0x990000,
                title: "💀 ULTRA THREAT",
                description:
                  "━━━━━━━━━━━━━━━━━━\n" +
                  `🔥 EXTREME TARGET\n\n` +
                  `🐍 Name   : ${p.name}\n` +
                  `📏 Length : ${curr.toLocaleString()}\n\n` +
                  "🚨 GLOBAL ORDER\nALL PLAYERS → ATTACK NOW\n" +
                  "━━━━━━━━━━━━━━━━━━",
                footer: { text: "☠️ JSR War Protocol" },
                timestamp: new Date(),
              }]
            });
          }

        } else {

          if (curr >= 20000 && !jsr20.has(id)) {
            jsr20.add(id);

            await channel.send({
              content: `<@&${ROLE_ID}>`,
              embeds: [{
                color: 0x00ffaa,
                title: "🛡️ ALLY SUPPORT",
                description:
                  "━━━━━━━━━━━━━━━━━━\n" +
                  `🤝 JSR MEMBER ACTIVE\n\n` +
                  `🐍 Name   : ${p.name}\n` +
                  `📏 Length : ${curr.toLocaleString()}\n\n` +
                  "🟢 SUPPORT PLAN\n• Stay Close\n• Feed\n• Protect\n" +
                  "━━━━━━━━━━━━━━━━━━",
                footer: { text: "🛡️ JSR Support System" },
                timestamp: new Date(),
              }]
            });
          }

          if (curr >= 50000 && !jsr50.has(id)) {
            jsr50.add(id);

            await channel.send({
              content: `<@&${ROLE_ID}>`,
              embeds: [{
                color: 0x00cc66,
                title: "🚨 CRITICAL ALLY",
                description:
                  "━━━━━━━━━━━━━━━━━━\n" +
                  `⚠️ HIGH VALUE JSR\n\n` +
                  `🐍 Name   : ${p.name}\n` +
                  `📏 Length : ${curr.toLocaleString()}\n\n` +
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

      lastScores.set(id, curr);
    }

    // ✅ after first loop
    if (firstRun) {
      console.log("First scan complete (no alerts sent)");
      firstRun = false;
    }

  } catch (err) {
    console.log("ERROR:", err?.message);
  }

  isRunning = false;
}

client.once("clientReady", async () => {
  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  const kingChannel = await client.channels.fetch(KING_CHANNEL_ID).catch(() => null);

  if (!channel || !kingChannel) return;

  await channel.send("THE BOT IS ONLINE |").catch(() => {});

  setInterval(() => {
    runBot(channel, kingChannel);
  }, INTERVAL);
});

client.login(TOKEN);