const Discord = require("discord.js");
const cheerio = require("cheerio");
const https = require("https");

const client = new Discord.Client({
  intents: [Discord.GatewayIntentBits.Guilds],
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

// JSR detect
function isJSR(name) {
  return name.includes("JSR");
}

// 🔥 SAFE FETCH (NO CRASH)
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";

      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

// 🔥 ONLY 8828 SERVER
async function getPlayers() {
  const html = await fetchHTML(URL);
  const $ = cheerio.load(html);

  const players = [];

  $("table").each((_, table) => {
    const rows = $(table).find("tr");

    const header = rows.first().text().trim();
    const idMatch = header.match(/^(\d+)/);
    const serverId = idMatch ? idMatch[1] : "";

    if (serverId !== "8828" || !header.includes("- IN")) return;

    rows.each((_, row) => {
      const cells = $(row).find("td");

      if (cells.length === 3) {
        const name = $(cells[1]).text().trim();
        const score = parseInt($(cells[2]).text().replace(/,/g, ""), 10);

        if (!isNaN(score)) {
          players.push({ name, score });
        }
      }
    });
  });

  return players;
}

client.once("ready", async () => {
  console.log("Bot ready");

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return console.log("Channel not found");

  await channel.send("🟢 BOT ONLINE 🚀").catch(() => {});

  // 30 min status
  setInterval(() => {
    channel.send("🟢 BOT STILL ONLINE 🚀").catch(() => {});
  }, 30 * 60 * 1000);

  // main loop
  setInterval(async () => {
    try {
      console.log("Checking leaderboard...");

      const players = await getPlayers();

      for (const p of players) {

        // 🔴 NON-JSR
        if (!isJSR(p.name)) {

          if (p.score >= 30000 && !alerted30.has(p.name)) {
            await channel.send(`🚨 KILL TARGET 🚨\n${p.name} (${p.score})`);
            alerted30.add(p.name);
          }

          if (p.score >= 80000 && !alerted80.has(p.name)) {
            await channel.send(`💀 ULTRA TARGET 💀\n${p.name} (${p.score})`);
            alerted80.add(p.name);
          }

        }

        // 🟢 JSR
        if (isJSR(p.name)) {

          if (p.score >= 20000 && !jsr20.has(p.name)) {
            await channel.send(`<@&${JSR_ROLE_ID}> HELP NOW! ${p.name} (${p.score})`);
            jsr20.add(p.name);
          }

          if (p.score >= 50000 && !jsr50.has(p.name)) {
            await channel.send(`<@&${JSR_ROLE_ID}> 🚨 URGENT HELP 🚨 ${p.name} (${p.score})`);
            jsr50.add(p.name);
          }

        }

      }

    } catch (err) {
      console.log("Loop error:", err.message);
    }
  }, INTERVAL);
});

client.login(TOKEN);