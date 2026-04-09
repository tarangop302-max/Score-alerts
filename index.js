// =====================
// SLITHER ALERT BOT
// =====================

const { Client, GatewayIntentBits, MessageEmbed } = require("discord.js");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

// Crash protection
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

// ======== ENVIRONMENT VARIABLES ========
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const JSR_ROLE_ID = process.env.JSR_ROLE_ID;

if (!TOKEN || !CHANNEL_ID || !JSR_ROLE_ID) {
  console.error("❌ Missing environment variables! Set DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID, JSR_ROLE_ID");
  process.exit(1);
}

// ======== SETTINGS ========
const URL = "https://ntl-slither.com/ss/";
const INTERVAL = 60 * 1000; // 1 minute
const TARGET_SERVER_ID = "8828";
const TARGET_REGION = "IN";

// ======== TRACKERS ========
const alerted30 = new Set();
const alerted80 = new Set();
const jsr20 = new Set();
const jsr50 = new Set();

// ======== HELPER FUNCTIONS ========
function isJSR(name) {
  const tags = ["JSR","{JSR}","{ JSR }","{ J S R }","(JSR)","( JSR )","( J S R )"];
  return tags.some(tag => name.includes(tag));
}

async function getPlayers(retries = 3) {
  try {
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const players = [];

    $("table").each((_, table) => {
      const rows = $(table).find("tr");
      const header = rows.first().text().trim();
      const idMatch = header.match(/^(\d+)/);
      const serverId = idMatch ? idMatch[1] : "";

      if (!header.includes(`- ${TARGET_REGION}`) || serverId !== TARGET_SERVER_ID) return;

      rows.each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length === 3) {
          const name = $(cells[1]).text().trim();
          const score = parseInt($(cells[2]).text().replace(/,/g, ""), 10);
          if (!isNaN(score)) players.push({ name, score });
        }
      });
    });

    return players;
  } catch (err) {
    console.error("Fetch Error:", err.message);
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 5000));
      return getPlayers(retries - 1);
    }
    return [];
  }
}

function helpEmbed(p) {
  return new MessageEmbed()
    .setColor("#00ff99")
    .setDescription(`🛡️ JSR NEEDS HELP 🛡️\n🐍 ${p.name}\n📏 ${p.score}`);
}

// ======== DISCORD CLIENT ========
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID).catch(err => {
    console.error("❌ Failed to fetch channel:", err);
    process.exit(1);
  });

  await channel.send("🟢 BOT ONLINE 🚀").catch(console.error);

  // Online message every 30 minutes
  setInterval(() => {
    channel.send("🟢 BOT STILL ONLINE 🚀").catch(console.error);
  }, 30 * 60 * 1000);

  // Main leaderboard loop
  setInterval(async () => {
    try {
      const players = await getPlayers();
      for (const p of players) {

        // Non-JSR alerts
        if (!isJSR(p.name)) {
          if (p.score >= 30000 && !alerted30.has(p.name)) {
            await channel.send(`🚨 KILL TARGET 🚨\n${p.name} (${p.score}) — ATTACK NOW ⚔️`).catch(console.error);
            alerted30.add(p.name);
          }
          if (p.score >= 80000 && !alerted80.has(p.name)) {
            await channel.send(`💀💀 ULTRA TARGET 💀💀\n${p.name} (${p.score}) — ALL ATTACK 🔥`).catch(console.error);
            alerted80.add(p.name);
          }
        }

        // JSR alerts
        if (isJSR(p.name)) {
          if (p.score >= 20000 && !jsr20.has(p.name)) {
            await channel.send({ content: `<@&${JSR_ROLE_ID}> HELP NOW!`, embeds: [helpEmbed(p)] }).catch(console.error);
            jsr20.add(p.name);
          }
          if (p.score >= 50000 && !jsr50.has(p.name)) {
            await channel.send({ content: `<@&${JSR_ROLE_ID}> 🚨 URGENT HELP REQUIRED 🚨`, embeds: [helpEmbed(p)] }).catch(console.error);
            jsr50.add(p.name);
          }
        }

      }
    } catch (err) {
      console.error("Loop Error:", err);
    }
  }, INTERVAL);
});

client.login(TOKEN).catch(err => console.error("Failed to login:", err));,