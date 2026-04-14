const { Client, Intents } = require("discord.js");
const https = require("https");

// 🛡️ crash protection
process.on("unhandledRejection", err => console.log("Unhandled:", err));
process.on("uncaughtException", err => console.log("Uncaught:", err));

const client = new Client({
  intents: [Intents.FLAGS.GUILDS],
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const URL = "https://ntl-slither.com/ss/";
const INTERVAL = 5000;

const JSR_ROLE_ID = "1456546757893947598";

const lastScores = {};
const triggered = {};

// 🧼 normalize
function normalizeName(name) {
  return name.replace(/\s+/g, "").toLowerCase();
}

// 🔥 JSR detect
function isJSR(name) {
  const patterns = [
    "{JSR}", "{ JSR }", "{ J S R }",
    "(JSR)", "( JSR )", "( J S R )",
    "JSR"
  ];

  const lower = name.toLowerCase();
  return patterns.some(p => lower.includes(p.toLowerCase()));
}

// 🌐 fetch
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

// 🎯 extract
function extractPlayers(html) {
  const players = [];
  const tables = html.split("<table");

  for (const table of tables) {
    if (!table.includes("8828") || !table.includes("- IN")) continue;

    const rows = table.split("<tr");

    for (const row of rows) {
      const cols = row.split("<td");

      if (cols.length >= 4) {
        const name = cols[2]?.replace(/<[^>]+>/g, "").trim();
        const score = parseInt(cols[3]?.replace(/<[^>]+>/g, "").replace(/,/g, ""));

        if (name && !isNaN(score)) {
          players.push({ name, score });
        }
      }
    }
  }

  return players;
}

client.on("ready", async () => {
  console.log("Bot ready");

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return console.log("Channel not found");

  channel.send("🟢 BOT ONLINE").catch(() => {});

  setInterval(async () => {

    let html;
    try {
      html = await fetchHTML(URL);
    } catch {
      return;
    }

    let players;
    try {
      players = extractPlayers(html);
    } catch {
      return;
    }

    for (const p of players) {

      const id = normalizeName(p.name);
      const prev = lastScores[id] || 0;
      const curr = p.score;

      try {

        // 🔴 NON-JSR
        if (!isJSR(p.name)) {

          if (prev < 30000 && curr >= 30000 && !triggered[id]) {
            triggered[id] = true;

            setTimeout(() => delete triggered[id], 60000);

            channel.send(`<@&${JSR_ROLE_ID}> 🚨 ${p.name} hit ${curr}`);
          }

          if (prev < 80000 && curr >= 80000 && !triggered[id+"_80"]) {
            triggered[id+"_80"] = true;

            setTimeout(() => delete triggered[id+"_80"], 60000);

            channel.send(`<@&${JSR_ROLE_ID}> 💀 ${p.name} hit ${curr}`);
          }
        }

        // 🟢 JSR
        else {

          if (prev < 20000 && curr >= 20000 && !triggered[id+"_20"]) {
            triggered[id+"_20"] = true;

            setTimeout(() => delete triggered[id+"_20"], 60000);

            channel.send(`<@&${JSR_ROLE_ID}> 🛡️ ${p.name} hit ${curr}`);
          }

          if (prev < 50000 && curr >= 50000 && !triggered[id+"_50"]) {
            triggered[id+"_50"] = true;

            setTimeout(() => delete triggered[id+"_50"], 60000);

            channel.send(`<@&${JSR_ROLE_ID}> 🚨 ${p.name} hit ${curr}`);
          }
        }

      } catch (e) {
        console.log("Send error:", e);
      }

      lastScores[id] = curr;
    }

  }, INTERVAL);
});

client.login(TOKEN);