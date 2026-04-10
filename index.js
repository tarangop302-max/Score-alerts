const { Client, GatewayIntentBits } = require("discord.js");
const https = require("https");

// 🛡️ GLOBAL CRASH PROTECTION
process.on("unhandledRejection", err => console.log("Unhandled:", err));
process.on("uncaughtException", err => console.log("Uncaught:", err));

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

function isJSR(name) {
  return name.includes("JSR");
}

// ✅ SAFE FETCH
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";

      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

// ✅ RAW PARSER (NO LIB CRASH)
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

  try {
    await channel.send("🟢 BOT ONLINE 🚀");
  } catch (e) {
    console.log("Start message failed");
  }

  // 🟢 30 min ping
  setInterval(() => {
    channel.send("🟢 BOT STILL ONLINE 🚀").catch(() => {});
  }, 30 * 60 * 1000);

  // 🔥 MAIN LOOP (FULL PROTECTION)
  setInterval(async () => {
    console.log("Checking leaderboard...");

    let html;
    try {
      html = await fetchHTML(URL);
    } catch {
      console.log("Fetch failed — skip");
      return;
    }

    let players;
    try {
      players = extractPlayers(html);
    } catch {
      console.log("Parse failed — skip");
      return;
    }

    for (const p of players) {
      try {

        if (!isJSR(p.name)) {

          if (p.score >= 30000 && !alerted30.has(p.name)) {
            await channel.send(`🚨 KILL TARGET 🚨\n${p.name} (${p.score})`);
            alerted30.add(p.name);
          }

          if (p.score >= 80000 && !alerted80.has(p.name)) {
            await channel.send(`💀 ULTRA TARGET 💀\n${p.name} (${p.score})`);
            alerted80.add(p.name);
          }

        } else {

          if (p.score >= 20000 && !jsr20.has(p.name)) {
            await channel.send(`<@&${JSR_ROLE_ID}> HELP NOW! ${p.name} (${p.score})`);
            jsr20.add(p.name);
          }

          if (p.score >= 50000 && !jsr50.has(p.name)) {
            await channel.send(`<@&${JSR_ROLE_ID}> 🚨 URGENT HELP 🚨 ${p.name} (${p.score})`);
            jsr50.add(p.name);
          }

        }

      } catch {
        console.log("Send failed — skipped");
      }
    }

  }, INTERVAL);
});

client.login(TOKEN);