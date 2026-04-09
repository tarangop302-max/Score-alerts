import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import cheerio from "cheerio";
import fetch from "node-fetch";

process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]:", err.message);
});

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const NTL_URL = "https://ntl-slither.com/ss/";
const POLL_INTERVAL_MS = 60000;
const TARGET_SERVER_ID = "8828";
const TARGET_SERVER_REGION = "IN";
const JSR_SCORE_THRESHOLD = 20000;
const JSR_ROLE_ID = "1456546757893947598";

const playersOnLeaderboard = new Set();
const jsrAlerted = new Set();

function isJsrPlayer(name) {
  const tags = [
    "{ J S R }", "{ JSR }", "{J S R}", "{JSR}",
    "( J S R )", "( JSR )", "(J S R)", "(JSR)",
  ];
  return tags.some((tag) => name.includes(tag));
}

async function fetchLeaderboard() {
  const res = await fetch(NTL_URL);
  const html = await res.text();
  const $ = cheerio.load(html);

  const players = [];

  $("table").each((_i, table) => {
    const rows = $(table).find("tr");

    let serverName = "";
    let serverId = "";

    const header = rows.first().text().trim();
    if (header) {
      serverName = header;
      const match = header.match(/^(\d+)/);
      if (match) serverId = match[1];
    }

    const isTarget =
      serverId === TARGET_SERVER_ID &&
      serverName.includes(`- ${TARGET_SERVER_REGION}`);

    if (!isTarget) return;

    rows.each((_j, row) => {
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

function buildKillEmbed(player) {
  return new EmbedBuilder()
    .setColor(0xff0000)
    .setDescription(
      `🚨 **TARGET SPOTTED** 🚨\n🐍 ${player.name}\n📏 ${player.score}\n⚔️ **KILL NOW!**`
    );
}

function buildHelpEmbed(player) {
  return new EmbedBuilder()
    .setColor(0x00ff99)
    .setDescription(
      `🛡️ **JSR NEEDS HELP** 🛡️\n🐍 ${player.name}\n📏 ${player.score}\n🤝 PROTECT NOW!`
    );
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);

  setInterval(async () => {
    try {
      const players = await fetchLeaderboard();
      const current = new Set();

      for (const player of players) {
        current.add(player.name);

        // 🔴 Kill alert
        if (!playersOnLeaderboard.has(player.name)) {
          playersOnLeaderboard.add(player.name);

          if (!isJsrPlayer(player.name)) {
            await channel.send({ embeds: [buildKillEmbed(player)] });
          }
        }

        // 🟢 JSR Help alert
        if (
          isJsrPlayer(player.name) &&
          player.score >= JSR_SCORE_THRESHOLD &&
          !jsrAlerted.has(player.name)
        ) {
          await channel.send({
            content: `<@&${JSR_ROLE_ID}> HELP NEEDED!`,
            embeds: [buildHelpEmbed(player)],
          });

          jsrAlerted.add(player.name);
        }

        // 💀 ULTRA ALERT (60k+)
        if (player.score >= 60000 && !isJsrPlayer(player.name)) {
          await channel.send(
            `🚨🚨 **ULTRA TARGET** 🚨🚨\n${player.name} (${player.score}) — ALL ATTACK 💀`
          );
        }
      }

      // cleanup
      for (const name of playersOnLeaderboard) {
        if (!current.has(name)) {
          playersOnLeaderboard.delete(name);
          jsrAlerted.delete(name);
        }
      }

    } catch (err) {
      console.error("Error:", err);
    }
  }, POLL_INTERVAL_MS);
});

client.login(DISCORD_BOT_TOKEN);
