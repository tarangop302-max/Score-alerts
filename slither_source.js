"use strict";
/**
 * slither-source.js -- leaderboard data source for JSR.bot (replaces Playwright).
 *
 * Talks the slither.io game protocol directly over a WebSocket: no browser, no
 * page scraping. It joins the server as a small snake called BOT_NICK, listens
 * for the server's leaderboard packet ('l'), turns it into
 *   { players: [{ name, score, ... }], totalPlayers, rank, updatedAt }
 * and keeps itself connected (circles in place, reconnects after death/drops).
 *
 * Everything protocol-related (handshake, join packet, packet framing, the
 * leaderboard layout and the score formula) is a port of what the zoro-mod app
 * already does in app/src/network/callback.c and game/game_data.c.
 *
 * Events:  "leaderboard" (snapshot)   "status" ({state, ...})   "died"
 */

const { EventEmitter } = require("events");
const WebSocket = require("ws");

const CLIENT_VERSION = 291;

// 20-byte client id sent inside the join packet -- the same bytes zoro-mod sends.
const CLIENT_ID = [
  54, 206, 204, 169, 97, 178, 74, 136, 124, 117,
  14, 210, 106, 236, 8, 208, 136, 213, 140, 111,
];

// ───────────────────────── protocol helpers ─────────────────────────

/** Answer to the server's pre-init ('6') challenge. Port of decode_secret(). */
function decodeSecret(packet) {
  const str = new Array(92).fill(0);
  let strIdx = 0;
  let c = 23, d = 0, e = 0, f = 1;

  while (f < 184 && f < packet.length) {
    let b = packet[f];
    f++;
    if (b <= 96) b += 32;
    b = (b - 97 - c) % 26;
    if (b < 0) b += 26;
    d = d * 16 + b;
    c += 17;
    if (e === 1) {
      str[strIdx++] = d & 255; // the C code stores into a uint8_t
      e = 0;
      d = 0;
    } else {
      e++;
    }
  }

  const secret1 = [];
  for (let i = 0; i < 92; i++) {
    if ((i >= 9 && i <= 13) || (i >= 20 && i <= 41)) secret1.push(str[i]);
  }

  const out = Buffer.alloc(27);
  let b2 = 0;
  for (let i = 0; i < 27; i++) {
    let d2 = 65;
    let a = secret1[i];
    if (a >= 97) {
      d2 += 32;
      a -= 32;
    }
    a -= 65;
    if (i === 0) b2 = 3 + a;
    const e2 = (a + b2) % 26;
    b2 += 2 + a;
    out[i] = (e2 + d2) & 255;
  }
  return out;
}

/** The "join game" packet (sent right after the secret). */
function buildJoinPacket(nick, skin = 0, accessory = 0) {
  const nb = Buffer.from(String(nick), "utf8").subarray(0, 24);
  const out = Buffer.alloc(26 + nb.length + 2);
  out[0] = 115;
  out[1] = 30;
  out[2] = (CLIENT_VERSION >> 8) & 255;
  out[3] = CLIENT_VERSION & 255;
  for (let i = 0; i < 20; i++) out[4 + i] = CLIENT_ID[i];
  out[24] = skin & 255;
  out[25] = nb.length;
  nb.copy(out, 26);
  out[26 + nb.length] = 0;
  out[27 + nb.length] = accessory & 255;
  return out;
}

/** A websocket message can carry several packets; split them like the game does. */
function splitPackets(buf) {
  const packets = [];
  if (!buf || buf.length === 0) return packets;
  if (buf[0] < 32) {
    let m = 0;
    while (m < buf.length) {
      let len;
      if (buf[m] < 32) {
        if (m + 1 >= buf.length) break;
        len = (buf[m] << 8) | buf[m + 1];
        m += 2;
      } else {
        len = buf[m] - 32;
        m++;
      }
      if (len > 0 && m < buf.length) packets.push(buf.subarray(m, Math.min(buf.length, m + len)));
      m += len;
    }
  } else {
    packets.push(buf);
  }
  return packets;
}

/**
 * Score tables. Same maths as set_mscps() in game_data.c:
 *   fmlts[i] = (1 - i/mscps)^2.25      fpsls[i] = fpsls[i-1] + 1/fmlts[i-1]
 * `mscps` comes from the server's init ('a') packet.
 */
function buildScoreTables(mscps) {
  const fmlts = [];
  const fpsls = [];
  for (let i = 0; i <= mscps; i++) {
    fmlts.push(i >= mscps ? fmlts[i - 1] : Math.pow(1 - i / mscps, 2.25));
    fpsls.push(i === 0 ? 0 : fpsls[i - 1] + 1 / fmlts[i - 1]);
  }
  const tf = fmlts[fmlts.length - 1];
  const tp = fpsls[fpsls.length - 1];
  for (let i = 0; i < 2048; i++) {
    fmlts.push(tf);
    fpsls.push(tp);
  }
  return { mscps, fmlts, fpsls };
}

function scoreFrom(tables, sct, fam) {
  const i = Math.min(sct, tables.fpsls.length - 1);
  return Math.floor((tables.fpsls[i] + fam / tables.fmlts[i] - 1) * 15 - 5);
}

/** Parse the leaderboard ('l') packet. `a` starts with the 'l' byte. */
function parseLeaderboard(a, tables, ownNick) {
  let m = 1;
  const lbPos = a[m++];
  const rank = (a[m] << 8) | a[m + 1];
  m += 2;
  const totalPlayers = (a[m] << 8) | a[m + 1];
  m += 2;

  const players = [];
  let pos = 0;
  while (m + 6 <= a.length) {
    pos++;
    const sct = (a[m] << 8) | a[m + 1];
    m += 2;
    const fam = ((a[m] << 16) | (a[m + 1] << 8) | a[m + 2]) / 16777215;
    m += 3;
    const cv = a[m] % 9;
    m++;
    const nl = a[m];
    m++;
    let name = a.toString("utf8", m, Math.min(a.length, m + nl));
    m += nl;
    const isSelf = pos === lbPos;
    if (isSelf) name = ownNick; // the server leaves our own name out
    players.push({ pos, name, score: scoreFrom(tables, sct, fam), sct, fam, cv, isSelf });
  }
  return { players, totalPlayers, rank };
}

// ───────────────────────── the source ─────────────────────────

class SlitherSource extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.ip
   * @param {number} [o.port=444]
   * @param {boolean} [o.secure=true]   wss:// (real servers) or ws:// (tests)
   * @param {string} [o.nick="JSR.bot"]
   * @param {number} [o.skin=0]
   * @param {object} [o.timing]   override the timings below (used by the tests)
   */
  constructor(o) {
    super();
    this.opts = Object.assign({ port: 444, secure: true, nick: "JSR.bot", skin: 0 }, o);
    this.timing = Object.assign(
      {
        deathPauseMs: 4000, // pause between lives
        backoffStartMs: 3000, // first retry delay after a failed/dropped connection
        backoffMaxMs: 60000,
        silentMs: 15000, // no packets at all for this long -> reconnect
        noLeaderboardMs: 45000, // connected but no leaderboard for this long -> reconnect
        checkMs: 5000, // how often the watchdog looks
      },
      (o && o.timing) || {}
    );
    this.tables = buildScoreTables(411);
    this.latest = { players: [], totalPlayers: 0, rank: 0, updatedAt: 0 };
    this.stats = { connects: 0, deaths: 0, drops: 0, packets: 0, startedAt: Date.now() };
    this.state = "idle";
    this.backoff = this.timing.backoffStartMs;
    this._stopped = true;
    this._ws = null;
    this._timers = [];
    this._reconnectTimer = null;
    this._angle = 0;
    this._lastMsgAt = 0;
    this._lastLbAt = 0;
  }

  start() {
    if (!this._stopped) return;
    this._stopped = false;
    this._connect();
  }

  stop() {
    this._stopped = true;
    clearTimeout(this._reconnectTimer);
    this._cleanup();
    if (this._ws) {
      try { this._ws.terminate(); } catch (e) { /* ignore */ }
    }
    this._setState("stopped");
  }

  /** Latest leaderboard plus how old it is. */
  getSnapshot() {
    return Object.assign({}, this.latest, {
      ageMs: this.latest.updatedAt ? Date.now() - this.latest.updatedAt : Infinity,
    });
  }

  getStatus() {
    return {
      state: this.state,
      server: `${this.opts.ip}:${this.opts.port}`,
      nick: this.opts.nick,
      lastLeaderboardAgeSec: this.latest.updatedAt
        ? Math.round((Date.now() - this.latest.updatedAt) / 1000)
        : null,
      totalPlayers: this.latest.totalPlayers,
      players: this.latest.players.length,
      connects: this.stats.connects,
      deaths: this.stats.deaths,
      drops: this.stats.drops,
      uptimeSec: Math.round((Date.now() - this.stats.startedAt) / 1000),
    };
  }

  // ── internals ──

  _setState(s, extra) {
    if (this.state === s) return;
    this.state = s;
    this.emit("status", Object.assign({ state: s }, extra));
  }

  _url() {
    const { secure, ip, port } = this.opts;
    return `${secure ? "wss" : "ws"}://${ip}:${port}/slither`;
  }

  _connect() {
    if (this._stopped) return;
    this._setState("connecting");
    this._joined = false;
    this._sawDeath = false;
    this._lastMsgAt = Date.now();
    this._lastLbAt = Date.now();

    let ws;
    try {
      ws = new WebSocket(this._url(), {
        headers: {
          // The game servers only accept connections that carry the site's Origin
          // (same headers the zoro-mod app sends).
          Origin: "https://slither.com",
          Host: "slither.com",
          "User-Agent": "JSR.bot leaderboard-watcher",
        },
        rejectUnauthorized: false, // connecting by IP, so the certificate name can't match
        perMessageDeflate: false,
        handshakeTimeout: 10000,
      });
    } catch (e) {
      this._scheduleReconnect(false);
      return;
    }
    this._ws = ws;

    ws.on("open", () => {
      this.stats.connects++;
      ws.send(Buffer.from([1]));
      ws.send(Buffer.from([99, 0]));
      this._startTimers(ws);
    });

    ws.on("message", (data) => {
      this._lastMsgAt = Date.now();
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      for (const p of splitPackets(buf)) {
        this.stats.packets++;
        try {
          this._onPacket(ws, p);
        } catch (e) {
          this.emit("error-log", `packet '${String.fromCharCode(p[0])}': ${e.message}`);
        }
      }
    });

    ws.on("error", (e) => this.emit("error-log", `socket: ${e.message}`));

    ws.on("close", () => {
      if (this._ws !== ws) return;
      this._cleanup();
      this._ws = null;
      if (this._stopped) return;
      if (!this._sawDeath) this.stats.drops++;
      this._scheduleReconnect(this._sawDeath);
    });
  }

  _onPacket(ws, a) {
    const cmd = String.fromCharCode(a[0]);
    if (cmd === "6") {
      // pre-init challenge -> answer it, then join the game
      ws.send(decodeSecret(a));
      ws.send(buildJoinPacket(this.opts.nick, this.opts.skin));
    } else if (cmd === "a") {
      const mscps = (a[4] << 8) | a[5];
      if (mscps > 0 && mscps < 2000 && mscps !== this.tables.mscps) this.tables = buildScoreTables(mscps);
      this._joined = true;
      this._setState("playing");
    } else if (cmd === "l") {
      const lb = parseLeaderboard(a, this.tables, this.opts.nick);
      this.latest = { ...lb, updatedAt: Date.now() };
      this._lastLbAt = Date.now();
      this.backoff = this.timing.backoffStartMs; // we are clearly connected fine
      this.emit("leaderboard", this.getSnapshot());
    } else if (cmd === "v") {
      // our snake died -> the server closes the connection; come back after a pause
      this._sawDeath = true;
      this.stats.deaths++;
      this.emit("died");
      this._setState("dead");
      try { ws.close(); } catch (e) { /* ignore */ }
    }
    // every other packet (movement, food, other snakes, pongs ...) is irrelevant here
  }

  _startTimers(ws) {
    const every = (ms, fn) => this._timers.push(setInterval(fn, ms));
    const send = (b) => { if (ws.readyState === WebSocket.OPEN) ws.send(b); };

    // keep-alive ping (the server answers with 'p')
    every(1000, () => send(Buffer.from([251])));

    // Steer in a small circle: the target angle spins faster than the snake can turn,
    // so it just keeps turning in place instead of running into walls.
    every(100, () => {
      if (!this._joined) return;
      this._angle = (this._angle + 25) % 251;
      send(Buffer.from([this._angle]));
    });

    // watchdog: silent socket, or connected but no leaderboard for a long time
    every(this.timing.checkMs, () => {
      const now = Date.now();
      if (now - this._lastMsgAt > this.timing.silentMs || now - this._lastLbAt > this.timing.noLeaderboardMs) {
        this.emit("error-log", "watchdog: no data, reconnecting");
        try { ws.terminate(); } catch (e) { /* ignore */ }
      }
    });
  }

  _cleanup() {
    for (const t of this._timers) clearInterval(t);
    this._timers = [];
  }

  _scheduleReconnect(afterDeath) {
    if (this._stopped) return;
    let delay;
    if (afterDeath) {
      delay = this.timing.deathPauseMs; // a short pause between lives
    } else {
      delay = this.backoff;
      this.backoff = Math.min(this.backoff * 2, this.timing.backoffMaxMs);
    }
    this._setState("waiting", { retryInMs: delay });
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => this._connect(), delay);
  }
}

module.exports = {
  SlitherSource,
  // exported for tests
  decodeSecret, buildJoinPacket, splitPackets, buildScoreTables, scoreFrom, parseLeaderboard,
};
