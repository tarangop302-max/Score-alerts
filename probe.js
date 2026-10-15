// Run:  node probe.js
// Finds your server's game address from the Wyrm API, then connects and logs
// what the game server sends back. Output is saved to probe-output.txt
const fs = require("fs");
const https = require("https");
const WebSocket = require("ws");

const src = fs.readFileSync(__dirname + "/index.js", "utf8");
const BASE = src.match(/const WYRM_BASE\s*=\s*"([^"]+)"/)[1];
const KEY = src.match(/const WYRM_KEY\s*=\s*"([^"]+)"/)[1];
const CODE = src.match(/const SERVER_CODE\s*=\s*"([^"]+)"/)[1];

const lines = [];
const log = (...a) => { const l = a.join(" "); console.log(l); lines.push(l); fs.writeFileSync(__dirname + "/probe-output.txt", lines.join("\n")); };
const hex = (b) => Buffer.from(b).slice(0, 48).toString("hex").match(/.{1,2}/g)?.join(" ") || "";

function get(path) {
  return new Promise((res, rej) => {
    https.get(BASE + path, { headers: { accept: "application/json", "X-Wyrm-Key": KEY } }, r => {
      let d = ""; r.on("data", c => d += c); r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on("error", rej);
  });
}

function attempt(label, url, firstBytes) {
  return new Promise(resolve => {
    log(`\n=== ${label}  ${url}  send=${firstBytes ? hex(firstBytes) : "(nothing)"}`);
    let n = 0;
    const ws = new WebSocket(url, { origin: "http://slither.io", headers: { "User-Agent": "Mozilla/5.0" } });
    ws.binaryType = "arraybuffer";
    const done = () => { try { ws.terminate(); } catch {} resolve(); };
    const timer = setTimeout(done, 8000);
    ws.on("open", () => { log("open"); if (firstBytes) ws.send(Uint8Array.from(firstBytes)); });
    ws.on("message", (m) => { if (n++ < 12) log(`msg #${n} len=${m.byteLength ?? m.length} hex=${hex(m)}`); });
    ws.on("close", (c) => { log("close", c); clearTimeout(timer); resolve(); });
    ws.on("error", (e) => { log("error", e.message); });
  });
}

(async () => {
  const data = await get("/v1/data/arenas?include=leaderboard");
  const a = (data.arenas || []).find(x => String(x.code) === CODE);
  if (!a) return log("Arena not found");
  log("API address fields:", JSON.stringify({ address: a.address, ipv4: a.ipv4, ipv6: a.ipv6, ipv4Address: a.ipv4Address, region: a.region, custom: a.custom, status: a.status }));

  const hosts = [];
  for (const h of [a.ipv4Address, a.address, a.ipv4]) if (h && !hosts.includes(h)) hosts.push(h);
  for (const h of hosts) {
    const base = h.includes(":") ? h : `${h}:444`;
    const url = `ws://${base}/slither`;
    await attempt("listen only", url, null);
    await attempt("send [99]", url, [99]);
    await attempt("send [99,0,0,0,0,0]", url, [99, 0, 0, 0, 0, 0]);
  }
  log("\nDONE - send me probe-output.txt (or a screenshot of this output)");
  process.exit(0);
})().catch(e => { log("FAILED", e.message); process.exit(1); });
