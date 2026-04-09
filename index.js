const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

// 🚨 Crash protection
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ⚙️ Environment variables
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

if (!TOKEN || !CHANNEL_ID) {
  console.error("❌ DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID is missing!");
  process.exit(1);
}

// 🔗 Settings
const URL = "https://ntl-slither.com/ss/";
const INTERVAL = 60000; // 1 minute
const TARGET_SERVER_ID = "8828";
const TARGET_REGION = "IN";

// 🎯 Trackers
const alerted30 = new Set();
const alerted80 = new Set();
const jsr20 = new Set();
const jsr50 = new Set();

// 🔎 JSR detection
function isJSR(name) {
  const tags = ["JSR","{JSR}","{ JSR }","{ J S R }","(JSR)","( JSR )","( J S R )"];
  return tags.some(tag => name.includes(tag));
}

// 🌐 Fetch leaderboard
async function getPlayers() {
  try {
    const res = await fetch(URL);
    const html = await res.text();
    const $ = cheerio.load(html);

    const players = [];

    $("table").each((_, table) => {
      const rows = $(table).find("tr");
      let header = rows.first().text().trim();
      let idMatch = header.match(/^(\d+)/);
      let serverId = idMatch ? idMatch[1] : "";

      if (!header.includes(`- ${TARGET_REGION}`) || serverId !== TARGET_SERVER_ID) return;

      rows.each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length === 3) {
          const name = $(cells[1]).text().trim();
          const score = Number($(cells[2]).text().replace(/,/g, ""));
          if (!isNaN(score)) players.push({ name, score });
        }
      });
    });

    return players;
  } catch (err) {
    console.error("❌ Failed to fetch leaderboard:", err.message);
    return [];
  }
}

// 🛡️ Embed for JSR alerts
function helpEmbed(p) {
  return new EmbedBuilder()
    .setColor(0x00ff99)
    .setDescription(`🛡️ JSR NEEDS HELP 🛡️\n🐍 ${p.name}\n📏 ${p.score}`);
}

// 🤖 Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // 🚨 Safe channel fetch
  let channel;
  try {
    channel = await client.channels.fetch(CHANNEL_ID);
  } catch (err) {
    console.error("❌ Failed to fetch channel:", err.message);
    return;
  }

  if (!channel) {
    console.error("❌ Channel not found or bot has no access");
    return;
  }

  console.log("✅ Channel OK");

  try {
    await channel.send("🟢 BOT ONLINE 🚀");
  } catch (err) {
    console.error("❌ Failed to send start message:", err.message);
  }

  // 🔁 Main loop
  setInterval(async () => {
    try {
      const players = await getPlayers();

      for (const p of players) {
        const { name, score } = p;

        // JSR players
        if (isJSR(name)) {
          if (score >= 20000 && !jsr20.has(name)) {
            await channel.send({ embeds: [helpEmbed(p)] }).catch(console.error);
            jsr20.add(name);
          } else if (score >= 50000 && !jsr50.has(name)) {
            await channel.send({ embeds: [helpEmbed(p)] }).catch(console.error);
            jsr50.add(name);
          }
        } 
        // Non-JSR players
        else {
          if (score >= 30000 && !alerted30.has(name)) {
            await channel.send(`⚔️ KILL ALERT ⚔️\n🐍 ${name} reached 30k!`).catch(console.error);
            alerted30.add(name);
          } else if (score >= 80000 && !alerted80.has(name)) {
            await channel.send(`⚔️ KILL ALERT ⚔️\n🐍 ${name} reached 80k!`).catch(console.error);
            alerted80.add(name);
          }
        }
      }

    } catch (err) {
      console.error("❌ Error in leaderboard loop:", err.message);
    }
  }, INTERVAL);
});

// 🚀 Login
client.login(TOKEN).catch(err => {
  console.error("❌ Failed to login:", err.message);
});