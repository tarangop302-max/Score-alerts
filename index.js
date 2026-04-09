import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

// Crash protection
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

// ENV
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

// SETTINGS
const URL = "https://ntl-slither.com/ss/";
const INTERVAL = 60000;
const TARGET_SERVER_ID = "8828";
const TARGET_REGION = "IN";
const JSR_THRESHOLD = 20000;
const JSR_ROLE_ID = "1456546757893947598";

// MEMORY
const seen = new Set();
const jsrDone = new Set();

// JSR detection
function isJSR(name) {
  return name.includes("JSR");
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
function killEmbed(p) {
  return new EmbedBuilder()
    .setColor(0xff0000)
    .setDescription(
      `🚨 **TARGET SPOTTED** 🚨\n🐍 ${p.name}\n📏 ${p.score}\n⚔️ KILL NOW!`
    );
}

function helpEmbed(p) {
  return new EmbedBuilder()
    .setColor(0x00ff99)
    .setDescription(
      `🛡️ **JSR NEEDS HELP** 🛡️\n🐍 ${p.name}\n📏 ${p.score}\n🤝 PROTECT NOW!`
    );
}

// BOT
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID);

  setInterval(async () => {
    try {
      const players = await getPlayers();
      const current = new Set();

      for (const p of players) {
        current.add(p.name);

        // 🔴 KILL ALERT
        if (!seen.has(p.name)) {
          seen.add(p.name);
          if (!isJSR(p.name)) {
            await channel.send({ embeds: [killEmbed(p)] });
          }
        }

        // 🟢 HELP ALERT
        if (isJSR(p.name) && p.score >= JSR_THRESHOLD && !jsrDone.has(p.name)) {
          await channel.send({
            content: `<@&${JSR_ROLE_ID}> HELP NOW!`,
            embeds: [helpEmbed(p)],
          });
          jsrDone.add(p.name);
        }

        // 💀 ULTRA ALERT
        if (p.score >= 60000 && !isJSR(p.name)) {
          await channel.send(
            `🚨🚨 ULTRA TARGET 🚨🚨\n${p.name} (${p.score}) — ALL ATTACK 💀`
          );
        }
      }

      // cleanup
      for (const name of seen) {
        if (!current.has(name)) {
          seen.delete(name);
          jsrDone.delete(name);
        }
      }

    } catch (err) {
      console.error("Loop Error:", err);
    }
  }, INTERVAL);
});

client.login(TOKEN);