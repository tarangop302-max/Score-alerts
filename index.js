const { Client, GatewayIntentBits } = require("discord.js");
const https = require("https");

// 🛡️ crash protection
process.on("unhandledRejection", err => console.log("Unhandled:", err?.message));
process.on("uncaughtException", err => console.log("Uncaught:", err?.message));

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const KING_CHANNEL_ID = "1492009160920006666"; // 👑 NEW CHANNEL

const URL = "https://ntl-slither.com/ss/";
const INTERVAL = 60000;
const JSR_ROLE_ID = "1456546757893947598";

// trackers
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
    https.get(url, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

// 🧠 parse ONLY 8828
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

  if (!channel) return console.log("Main channel not found");
  if (!kingChannel) return console.log("King channel not found");

  await channel.send("🟢 **JSR ALERT BOT ONLINE 🚀**").catch(() => {});

  // heartbeat
  setInterval(() => {
    channel.send("🟢 **BOT STILL ONLINE 🚀**").catch(() => {});
  }, 30 * 60 * 1000);

  // main loop
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

    // 👑 KING SYSTEM (separate channel + anti spam)
    let currentTop = null;
    for (const p of players) {
      if (!currentTop || p.score > currentTop.score) {
        currentTop = p;
      }
    }

    if (currentTop) {
      const now = Date.now();

      // ⛔ only send if changed + 2 min gap
      if (
        currentTop.name !== lastTopPlayer &&
        now - lastKingTime > 120000
      ) {
        lastTopPlayer = currentTop.name;
        lastKingTime = now;

        const embed = {
          color: 0xffd700,
          title: "👑 NEW KING 👑",
          description:
            `🐍 **${currentTop.name}**\n` +
            `📏 **${currentTop.score.toLocaleString()} length**\n\n` +
            `🔥 **DOMINATING SERVER 8828**`,
          timestamp: new Date(),
        };

        await kingChannel.send({ embeds: [embed] }).catch(() => {});
      }
    }

    // ⚔️ ALERT SYSTEM
    for (const p of players) {
      try {

        // 🔴 RANDOM
        if (!isJSR(p.name)) {

          if (p.score >= 30000 && !alerted30.has(p.name)) {
            const embed = {
              color: 0xff0000,
              title: "🚨 TARGET LOCKED 🚨",
              description:
                `🐍 **${p.name}**\n` +
                `📏 **${p.score.toLocaleString()} length**\n\n` +
                `⚔️ **HUNT. SURROUND. DESTROY.**`,
              timestamp: new Date(),
            };
            await channel.send({ embeds: [embed] });
            alerted30.add(p.name);
          }

          if (p.score >= 80000 && !alerted80.has(p.name)) {
            const embed = {
              color: 0x8b0000,
              title: "💀 EXTREME THREAT 💀",
              description:
                `🐍 **${p.name}**\n` +
                `📏 **${p.score.toLocaleString()} length**\n\n` +
                `🔥 **ALL PLAYERS ATTACK NOW**`,
              timestamp: new Date(),
            };
            await channel.send({ embeds: [embed] });
            alerted80.add(p.name);
          }

        }

        // 🟢 JSR
        else {

          if (p.score >= 20000 && !jsr20.has(p.name)) {
            const embed = {
              color: 0x00ff99,
              title: "🛡️ JSR NEEDS SUPPORT 🛡️",
              description:
                `🐍 **${p.name}**\n` +
                `📏 **${p.score.toLocaleString()} length**\n\n` +
                `🤝 **PROTECT & SUPPORT**`,
              timestamp: new Date(),
            };
            await channel.send({
              content: `<@&${JSR_ROLE_ID}>`,
              embeds: [embed],
            });
            jsr20.add(p.name);
          }

          if (p.score >= 50000 && !jsr50.has(p.name)) {
            const embed = {
              color: 0x00cc66,
              title: "🚨 JSR CRITICAL 🚨",
              description:
                `🐍 **${p.name}**\n` +
                `📏 **${p.score.toLocaleString()} length**\n\n` +
                `⚡ **ALL MEMBERS ASSIST NOW**`,
              timestamp: new Date(),
            };
            await channel.send({
              content: `<@&${JSR_ROLE_ID}>`,
              embeds: [embed],
            });
            jsr50.add(p.name);
          }

        }

      } catch {}
    }

  }, INTERVAL);
});

client.login(TOKEN);