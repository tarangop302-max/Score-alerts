const { Client, GatewayIntentBits } = require("discord.js");
const https = require("https");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const URL = "https://ntl-slither.com/ss/";
const INTERVAL = 5000;

const JSR_ROLE_ID = "1456546757893947598";

// 🧠 memory
const lastScores = new Map();
const triggered = new Set();

// 🧼 normalize name (VERY IMPORTANT)
function normalizeName(name) {
  return name.replace(/\s+/g, "").toLowerCase();
}

// 🔥 STRICT JSR
function isJSR(name) {
  const patterns = [
    "{JSR}",
    "{ JSR }",
    "{ J S R }",
    "(JSR)",
    "( JSR )",
    "( J S R )",
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
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

// 🎯 ONLY SERVER 8828
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
  if (!channel) return console.log("Channel error");

  await channel.send("🟢 **JSR SYSTEM ONLINE ⚡**");

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
      const prev = lastScores.get(id) || 0;
      const curr = p.score;

      try {

        // 🔴 NON-JSR
        if (!isJSR(p.name)) {

          // 🎯 30K
          if (prev < 30000 && curr >= 30000 && !triggered.has(id)) {

            triggered.add(id);
            setTimeout(() => triggered.delete(id), 60000);

            await channel.send({
              content: `<@&${JSR_ROLE_ID}>`,
              embeds: [{
                color: 0xff2d2d,
                title: "🚨 TARGET ACQUIRED",
                description:
                  `🎯 ENEMY LOCKED\n\n` +
                  `🐍 Name   : ${p.name}\n` +
                  `📏 Length : ${curr.toLocaleString()}\n\n` +
                  "⚔️ ATTACK NOW",
                timestamp: new Date(),
              }]
            });
          }

          // 💀 80K
          if (prev < 80000 && curr >= 80000 && !triggered.has(id + "_80")) {

            triggered.add(id + "_80");
            setTimeout(() => triggered.delete(id + "_80"), 60000);

            await channel.send({
              content: `<@&${JSR_ROLE_ID}>`,
              embeds: [{
                color: 0x990000,
                title: "💀 ULTRA TARGET",
                description:
                  `🔥 EXTREME THREAT\n\n` +
                  `🐍 Name   : ${p.name}\n` +
                  `📏 Length : ${curr.toLocaleString()}\n\n` +
                  "⚠️ ALL OUT ATTACK",
                timestamp: new Date(),
              }]
            });
          }

        }

        // 🟢 JSR
        else {

          // 🛡️ 20K
          if (prev < 20000 && curr >= 20000 && !triggered.has(id + "_20")) {

            triggered.add(id + "_20");
            setTimeout(() => triggered.delete(id + "_20"), 60000);

            await channel.send({
              content: `<@&${JSR_ROLE_ID}>`,
              embeds: [{
                color: 0x00ffcc,
                title: "🛡️ ALLY SUPPORT",
                description:
                  `🤝 JSR ACTIVE\n\n` +
                  `🐍 Name   : ${p.name}\n` +
                  `📏 Length : ${curr.toLocaleString()}\n\n` +
                  "🟢 SUPPORT IMMEDIATELY",
                timestamp: new Date(),
              }]
            });
          }

          // 🚨 50K
          if (prev < 50000 && curr >= 50000 && !triggered.has(id + "_50")) {

            triggered.add(id + "_50");
            setTimeout(() => triggered.delete(id + "_50"), 60000);

            await channel.send({
              content: `<@&${JSR_ROLE_ID}>`,
              embeds: [{
                color: 0x00cc66,
                title: "🚨 CRITICAL ALLY",
                description:
                  `⚠️ HIGH VALUE JSR\n\n` +
                  `🐍 Name   : ${p.name}\n` +
                  `📏 Length : ${curr.toLocaleString()}\n\n` +
                  "🔥 DEFEND NOW",
                timestamp: new Date(),
              }]
            });
          }

        }

      } catch (err) {
        console.log("Error:", err?.message);
      }

      // 🧠 update memory
      lastScores.set(id, curr);
    }

  }, INTERVAL);
});

client.login(TOKEN);