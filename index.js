const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const cheerio = require("cheerio");

// Crash protection
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const URL = "https://ntl-slither.com/ss/";
const INTERVAL = 60000;
const TARGET_SERVER_ID = "8828";
const TARGET_REGION = "IN";
const JSR_THRESHOLD = 20000;
const JSR_ROLE_ID = "1456546757893947598";

const seen = new Set();
const jsrDone = new Set();

function isJSR(name) {
  return name.includes("JSR");
}

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

function killEmbed(p) {
  return new EmbedBuilder()
    .setColor(0xff0000)
    .setDescription(`🚨 TARGET SPOTTED 🚨\n🐍 ${p.name}\n📏 ${p.score}\n⚔️ KILL NOW!`);
}

function helpEmbed(p) {
  return new EmbedBuilder()
    .setColor(0x00ff99)
    .setDescription(`🛡️ JSR NEEDS HELP 🛡️\n🐍 ${p.name}\n📏 ${p.score}\n🤝 PROTECT NOW!`);
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
  await channel.send("🟢 BOT ONLINE 🚀");

  // EVERY 30 MIN
  setInterval(() => {
    channel.send("🟢 BOT STILL ONLINE 🚀");
  }, 30 * 60 * 1000);

  // MAIN LOOP
  setInterval(async () => {
    try {
      console.log("Checking leaderboard...");

      const players = await getPlayers();
      const current = new Set();

      for (const p of players) {
        current.add(p.name);

        if (!seen.has(p.name)) {
          seen.add(p.name);
          if (!isJSR(p.name)) {
            await channel.send({ embeds: [killEmbed(p)] });
          }
        }

        if (isJSR(p.name) && p.score >= JSR_THRESHOLD && !jsrDone.has(p.name)) {
          await channel.send({
            content: `<@&${JSR_ROLE_ID}> HELP NOW!`,
            embeds: [helpEmbed(p)],
          });
          jsrDone.add(p.name);
        }