const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const cheerio = require("cheerio");

// crash protection
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const URL = "https://ntl-slither.com/ss/";
const INTERVAL = 60000;
const TARGET_SERVER_ID = "8828";
const TARGET_REGION = "IN";
const JSR_ROLE_ID = "1456546757893947598";

// trackers
const alerted30 = new Set();
const alerted80 = new Set();
const jsr20 = new Set();
const jsr50 = new Set();

// detect JSR
function isJSR(name) {
  const tags = ["JSR", "{JSR}", "{ JSR }", "{ J S R }", "(JSR)", "( JSR )", "( J S R )"];
  return tags.some(tag => name.includes(tag));
}

// fetch leaderboard (USES BUILT-IN FETCH ✅)
async function getPlayers() {
  const res = await fetch(URL);
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
        if (!isNaN(score)) {
          players.push({ name, score });
        }
      }
    });
  });

  return players;
}

// embed
function helpEmbed(p) {
  return new EmbedBuilder()
    .setColor(0x00ff99)
    .setDescription(`🛡️ JSR NEEDS HELP 🛡️\n🐍 ${p.name}\n📏 ${p.score}`);
}

// bot
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return console.log("❌ Channel not found");

  console.log("✅ Channel OK");

  // start message
  await channel.send("🟢 BOT ONLINE 🚀").catch(console.error);

  // every 30 min
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
            await channel.send({
              content: `<@&${JSR_ROLE_ID}> HELP NOW!`,
              embeds: [helpEmbed(p)],
            });
            jsr20.add(p.name);
          }

          if (p.score >= 50000 && !jsr50.has(p.name)) {
            await channel.send({
              content: `<@&${JSR_ROLE_ID}> 🚨 URGENT HELP 🚨`,
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