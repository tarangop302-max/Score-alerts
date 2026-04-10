const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const cheerio = require("cheerio");

// Crash protection
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const URL = "https://ntl-slither.com/ss/";
const INTERVAL = 60000;
const TARGET_SERVER_ID = "8828";
const TARGET_REGION = "IN";
const JSR_ROLE_ID = "1456546757893947598";

// 🔥 TRACKERS
const alerted30 = new Set();
const alerted80 = new Set();
const jsr20 = new Set();
const jsr50 = new Set();

// JSR detection (supports all formats)
function isJSR(name) {
  const tags = [
    "JSR",
    "{JSR}", "{ JSR }", "{ J S R }",
    "(JSR)", "( JSR )", "( J S R )"
  ];
  return tags.some(tag => name.includes(tag));
}

// Fetch leaderboard
async function getPlayers() {
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
        const score = parseInt($(cells[2]).text().replace(/,/g, ""), 10);
        if (!isNaN(score)) {
          players.push({ name, score });
        }
      }
    });
  });

  return players;
}

// EMBEDS
function helpEmbed(p) {
  return new EmbedBuilder()
    .setColor(0x00ff99)
    .setDescription(`🛡️ JSR NEEDS HELP 🛡️\n🐍 ${p.name}\n📏 ${p.score}`);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);

  if (!channel) {
    console.log("❌ Channel not found");
    return;
  }

  console.log("✅ Channel OK");

  // START MESSAGE
  try {
    await channel.send("🟢 BOT ONLINE 🚀");
    console.log("✅ Start message sent");
  } catch (err) {
    console.error("❌ Send failed:", err.message);
  }

  // EVERY 30 MIN
  setInterval(async () => {
    try {
      await channel.send("🟢 BOT STILL ONLINE 🚀");
    } catch {}
  }, 30 * 60 * 1000);

  // 🔥 MAIN LOGIC
  setInterval(async () => {
    try {
      console.log("Checking leaderboard...");

      const players = await getPlayers();

      for (const p of players) {

        // 🔴 NON-JSR PLAYERS

        if (!isJSR(p.name)) {

          // 30K ALERT
          if (p.score >= 30000 && !alerted30.has(p.name)) {
            await channel.send(`🚨 KILL TARGET 🚨\n${p.name} (${p.score}) — ATTACK NOW ⚔️`);
            alerted30.add(p.name);
          }

          // 80K ULTRA ALERT
          if (p.score >= 80000 && !alerted80.has(p.name)) {
            await channel.send(`💀💀 ULTRA TARGET 💀💀\n${p.name} (${p.score}) — ALL ATTACK 🔥`);
            alerted80.add(p.name);
          }

        }

        // 🟢 JSR PLAYERS

        if (isJSR(p.name)) {

          // 20K HELP
          if (p.score >= 20000 && !jsr20.has(p.name)) {
            await channel.send({
              content: `<@&${JSR_ROLE_ID}> HELP NOW!`,
              embeds: [helpEmbed(p)],
            });
            jsr20.add(p.name);
          }

          // 50K URGENT HELP
          if (p.score >= 50000 && !jsr50.has(p.name)) {
            await channel.send({
              content: `<@&${JSR_ROLE_ID}> 🚨 URGENT HELP REQUIRED 🚨`,
              embeds: [helpEmbed(p)],
            });
            jsr50.add(p.name);
          }

        }

      }

    } catch (err) {
      console.error("Loop Error:", err);
    }
  }, INTERVAL);
});

client.login(TOKEN);