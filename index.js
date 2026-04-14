const { Client, GatewayIntentBits } = require("discord.js");
const https = require("https");

// 🛡️ protection
process.on("unhandledRejection", err => console.log("Unhandled:", err?.message));
process.on("uncaughtException", err => console.log("Uncaught:", err?.message));

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const KING_CHANNEL_ID = "1492009160920006666";

// ✅ YOUR ROLE ID
const ROLE_ID = "1493480046986268803";

const URL = "https://ntl-slither.com/ss/";
const INTERVAL = 5000;

// 🧠 tracking
let activePlayers = new Set();
const lastScores = new Map();

const alerted30 = new Set();
const alerted80 = new Set();
const jsr20 = new Set();
const jsr50 = new Set();

let lastTopPlayer = null;
let lastKingTime = 0;

// 🧼 normalize
function normalizeName(name) {
  return name.replace(/\s+/g, "").toLowerCase();
}

// 🔍 JSR detect
function isJSR(name) {
  const patterns = [
    "{JSR}", "{ JSR }", "{ J S R }",
    "(JSR)", "( JSR )", "( J S R )",
    "JSR"
  ];
  const lower = name.toLowerCase();
  return patterns.some(p => lower.includes(p.toLowerCase()));
}

// 🌐 fetch
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

// 🎯 parse only 8828
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

client.once("ready", async () => {
  console.log("Bot ready");

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  const kingChannel = await client.channels.fetch(KING_CHANNEL_ID).catch(() => null);

  if (!channel || !kingChannel) return console.log("Channel error");

  await channel.send("THE BOT IS ONLINE |").catch(() => {});

  setInterval(() => {
    channel.send("🟢 BOT ACTIVE").catch(() => {});
  }, 3 * 60 * 60 * 1000);

  setInterval(async () => {

    let html;
    try { html = await fetchHTML(URL); } catch { return; }

    let players;
    try { players = extractPlayers(html); } catch { return; }

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

    // 👑 KING UI
    let currentTop = players.reduce((a, b) => !a || b.score > a.score ? b : a, null);

    if (currentTop) {
      const now = Date.now();

      if (currentTop.name !== lastTopPlayer && now - lastKingTime > 120000) {
        lastTopPlayer = currentTop.name;
        lastKingTime = now;

        await kingChannel.send({
          embeds: [{
            color: 0xffd700,
            title: "👑 KING OF THE SERVER",
            description:
              "━━━━━━━━━━━━━━━━━━━━\n" +
              `🏆 **TOP PLAYER**\n\n` +
              `🐍 ${currentTop.name}\n` +
              `📏 ${currentTop.score.toLocaleString()}\n\n` +
              "⚔️ ALL PLAYERS TARGET THIS KING\n" +
              "━━━━━━━━━━━━━━━━━━━━",
            footer: { text: "👑 JSR King Monitor" },
            timestamp: new Date(),
          }]
        }).catch(() => {});
      }
    }

    // ⚔️ ALERT SYSTEM
    for (const p of players) {

      const id = normalizeName(p.name);
      activePlayers.add(id);

      const prev = lastScores.get(id) || 0;
      const curr = p.score;

      try {

        // 🔴 ENEMY
        if (!isJSR(p.name)) {

          if (prev < 30000 && curr >= 30000 && !alerted30.has(id)) {
            alerted30.add(id);

            await channel.send({
              content: `<@&${ROLE_ID}>`,
              embeds: [{
                color: 0xff2d2d,
                title: "🚨 TARGET LOCKED 🚨",
                description:
                  "━━━━━━━━━━━━━━━━━━━━\n" +
                  `🐍 **Enemy** : ${p.name}\n` +
                  `📏 **Size**  : ${curr.toLocaleString()}\n\n` +
                  "⚔️ **MISSION**\n• Surround\n• Trap\n• Eliminate\n" +
                  "━━━━━━━━━━━━━━━━━━━━",
                footer: { text: "⚡ JSR Strike System" },
                timestamp: new Date(),
              }]
            });
          }

          if (prev < 80000 && curr >= 80000 && !alerted80.has(id)) {
            alerted80.add(id);

            await channel.send({
              content: `<@&${ROLE_ID}>`,
              embeds: [{
                color: 0x8b0000,
                title: "💀 ULTRA THREAT DETECTED",
                description:
                  "━━━━━━━━━━━━━━━━━━━━\n" +
                  `🔥 ${p.name}\n📏 ${curr.toLocaleString()}\n\n` +
                  "🚨 ALL UNITS ATTACK NOW\n" +
                  "━━━━━━━━━━━━━━━━━━━━",
                footer: { text: "☠️ JSR War Protocol" },
                timestamp: new Date(),
              }]
            });
          }

        }

        // 🟢 JSR
        else {

          if (prev < 20000 && curr >= 20000 && !jsr20.has(id)) {
            jsr20.add(id);

            await channel.send({
              content: `<@&${ROLE_ID}>`,
              embeds: [{
                color: 0x00ffaa,
                title: "🛡️ ALLY NEEDS SUPPORT",
                description:
                  "━━━━━━━━━━━━━━━━━━━━\n" +
                  `🐍 ${p.name}\n📏 ${curr.toLocaleString()}\n\n` +
                  "🟢 SUPPORT IMMEDIATELY\n" +
                  "━━━━━━━━━━━━━━━━━━━━",
                footer: { text: "🛡️ JSR Support System" },
                timestamp: new Date(),
              }]
            });
          }

          if (prev < 50000 && curr >= 50000 && !jsr50.has(id)) {
            jsr50.add(id);

            await channel.send({
              content: `<@&${ROLE_ID}>`,
              embeds: [{
                color: 0x00cc66,
                title: "🚨 CRITICAL ALLY",
                description:
                  "━━━━━━━━━━━━━━━━━━━━\n" +
                  `🐍 ${p.name}\n📏 ${curr.toLocaleString()}\n\n` +
                  "🔥 DEFEND AT ALL COSTS\n" +
                  "━━━━━━━━━━━━━━━━━━━━",
                footer: { text: "⚡ JSR Emergency System" },
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

  }, INTERVAL);
});

client.login(TOKEN);