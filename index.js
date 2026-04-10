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

const URL = "https://ntl-slither.com/ss/";
const INTERVAL = 60000;
const JSR_ROLE_ID = "1456546757893947598";

// trackers
const alerted30 = new Set();
const alerted80 = new Set();
const jsr20 = new Set();
const jsr50 = new Set();

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
  if (!channel) return console.log("Channel not found");

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
      console.log("Fetch failed");
      return;
    }

    let players;
    try {
      players = extractPlayers(html);
    } catch {
      console.log("Parse failed");
      return;
    }

    for (const p of players) {
      try {

        // 🔴 RANDOM PLAYERS
        if (!isJSR(p.name)) {

          // 30K
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

          // 80K
          if (p.score >= 80000 && !alerted80.has(p.name)) {
            const embed = {
              color: 0x8b0000,
              title: "💀 EXTREME THREAT 💀",
              description:
                `🐍 **${p.name}**\n` +
                `📏 **${p.score.toLocaleString()} length**\n\n` +
                `🔥 **ALL PLAYERS ATTACK NOW — NO MERCY**`,
              timestamp: new Date(),
            };
            await channel.send({ embeds: [embed] });
            alerted80.add(p.name);
          }

        }

        // 🟢 JSR PLAYERS
        else {

          // 20K
          if (p.score >= 20000 && !jsr20.has(p.name)) {
            const embed = {
              color: 0x00ff99,
              title: "🛡️ JSR NEEDS SUPPORT 🛡️",
              description:
                `🐍 **${p.name}**\n` +
                `📏 **${p.score.toLocaleString()} length**\n\n` +
                `🤝 **PROTECT. FEED. DEFEND.**`,
              timestamp: new Date(),
            };
            await channel.send({
              content: `<@&${JSR_ROLE_ID}>`,
              embeds: [embed],
            });
            jsr20.add(p.name);
          }

          // 50K
          if (p.score >= 50000 && !jsr50.has(p.name)) {
            const embed = {
              color: 0x00cc66,
              title: "🚨 JSR CRITICAL ALERT 🚨",
              description:
                `🐍 **${p.name}**\n` +
                `📏 **${p.score.toLocaleString()} length**\n\n` +
                `⚡ **ALL MEMBERS — IMMEDIATE ASSIST REQUIRED**`,
              timestamp: new Date(),
            };
            await channel.send({
              content: `<@&${JSR_ROLE_ID}>`,
              embeds: [embed],
            });
            jsr50.add(p.name);
          }

        }

      } catch (err) {
        console.log("Send error:", err?.message);
      }
    }

  }, INTERVAL);
});

client.login(TOKEN);