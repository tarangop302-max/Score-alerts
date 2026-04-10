const Discord = require("discord.js");
const cheerio = require("cheerio");
const https = require("https");

const client = new Discord.Client({
  intents: [Discord.GatewayIntentBits.Guilds],
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

// ✅ SAFE FETCH (no dependency)
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

// ✅ ONLY SERVER 8828
async function getPlayers() {
  const html = await fetchHTML(URL);
  const $ = cheerio.load(html);

  const players = [];

  $("table").each((_, table) => {
    const rows = $(table).find("tr");

    const header = rows.first().text().trim();
    const idMatch = header.match(/^(\d+)/);
    const serverId = idMatch ? idMatch[1] : "";

    if (serverId !== "8828" || !header.includes("- IN")) return;

    rows.each((_, row) => {
      const cells = $(row).find("td");

      if (cells.length === 3) {
        const name = $(cells[1]).text().trim();
        const score = parseInt($(cells[2]).text().replace(/,/g, ""), 10);

        if (!is