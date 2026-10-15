// Connects to the game server for your arena and logs what it sends back.
// Used by the "!probe" Discord command (works on Railway - no shell needed).
const WebSocket = require("ws");

const hex = (b) => Buffer.from(b).slice(0, 48).toString("hex").match(/.{1,2}/g)?.join(" ") || "";

function attempt(label, url, firstBytes, out) {
  return new Promise(resolve => {
    out.push(`\n=== ${label}  ${url}  send=${firstBytes ? hex(firstBytes) : "(nothing)"}`);
    let n = 0, finished = false;
    let ws;
    const finish = () => { if (finished) return; finished = true; clearTimeout(timer); try { ws && ws.terminate(); } catch {} resolve(); };
    const timer = setTimeout(finish, 5000);
    try {
      ws = new WebSocket(url, { origin: "http://slither.io", headers: { "User-Agent": "Mozilla/5.0" } });
    } catch (e) { out.push("error " + e.message); return finish(); }
    ws.on("open", () => { out.push("open"); if (firstBytes) ws.send(Uint8Array.from(firstBytes)); });
    ws.on("message", (m) => { if (n++ < 12) out.push(`msg #${n} len=${m.length} hex=${hex(m)}`); });
    ws.on("close", (c) => { out.push("close " + c); finish(); });
    ws.on("error", (e) => { out.push("error " + e.message); });
  });
}

async function runProbe(arena) {
  const out = [];
  if (!arena) return "Arena not found in Wyrm API";
  out.push("API fields: " + JSON.stringify({ address: arena.address, ipv4: arena.ipv4, ipv6: arena.ipv6, ipv4Address: arena.ipv4Address, region: arena.region, custom: arena.custom, status: arena.status }));
  const hosts = [];
  for (const h of [arena.ipv4Address, arena.address, arena.ipv4]) if (h && !hosts.includes(h)) hosts.push(h);
  for (const h of hosts) {
    const url = `ws://${h.includes(":") ? h : h + ":444"}/slither`;
    await attempt("listen only", url, null, out);
    await attempt("send [99]", url, [99], out);
    await attempt("send [99,0,0,0,0,0]", url, [99, 0, 0, 0, 0, 0], out);
  }
  out.push("\nDONE");
  return out.join("\n");
}

module.exports = { runProbe };
