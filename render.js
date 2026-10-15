// ─────────────────────────────────────────────────────────────
// 🎨 IMAGE RENDERING — leaderboard card + live map
// All drawing functions take a standard Canvas 2D context, so they
// work with @napi-rs/canvas (in the bot) or any browser canvas.
// ─────────────────────────────────────────────────────────────
const FONT = '"DejaVu Sans", "Noto Sans", Arial, sans-serif';

const TEAM_COLORS = {
  JSR: "#ff9500", SMT: "#2f9bff", DINO: "#ff3b3b", LWK: "#ffd60a", IND: "#34c759",
};

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

// ─────────────── LEADERBOARD ───────────────
const LB = { W: 1000, H: 990 };

function drawLeaderboard(ctx, players, opts) {
  const { detectTeam, serverCode, timeText } = opts;
  const { W, H } = LB;
  const top10 = players.slice(0, 10);
  const total = players.reduce((s, p) => s + p.score, 0);
  const maxScore = Math.max(1, top10[0]?.score || 1);

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#15111f");
  bg.addColorStop(1, "#0d0b14");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, "#7b2fff"); bar.addColorStop(1, "#b04dff");
  ctx.fillStyle = bar; ctx.fillRect(0, 0, W, 6);

  // header
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff"; ctx.font = `bold 40px ${FONT}`;
  ctx.fillText("LEADERBOARD", 36, 64);
  ctx.fillStyle = "#9d8fc4"; ctx.font = `20px ${FONT}`;
  ctx.fillText(`Slither Server ${serverCode} · Top 10`, 36, 94);

  // LIVE badge
  ctx.fillStyle = "#3a1722"; rr(ctx, 878, 36, 86, 34, 17); ctx.fill();
  ctx.fillStyle = "#ff4d4d"; ctx.beginPath(); ctx.arc(898, 53, 6, 0, Math.PI * 2); ctx.fill();
  ctx.font = `bold 17px ${FONT}`; ctx.textBaseline = "middle";
  ctx.fillText("LIVE", 912, 54);

  // rows
  const RANK_FILL = ["#ffd24a", "#c0c7d2", "#d98b4a"];
  top10.forEach((p, i) => {
    const y = 120 + i * 76, x = 36, w = 928, h = 66;
    const team = detectTeam(p.name);
    const tc = team ? TEAM_COLORS[team] : null;

    // card
    ctx.save();
    rr(ctx, x, y, w, h, 16); ctx.clip();
    ctx.fillStyle = i < 3 ? "#221a38" : "#1a1528";
    ctx.fillRect(x, y, w, h);
    if (tc) { ctx.fillStyle = tc; ctx.fillRect(x, y, 6, h); }
    ctx.restore();

    // rank circle
    ctx.fillStyle = i < 3 ? RANK_FILL[i] : "#2a2340";
    ctx.beginPath(); ctx.arc(80, y + 33, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = i < 3 ? "#1a1528" : "#9d8fc4";
    ctx.font = `bold ${i < 3 ? 22 : 18}px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), 80, y + 34);

    // score (right aligned)
    ctx.textAlign = "right";
    ctx.font = `bold 28px ${FONT}`;
    ctx.fillStyle = i === 0 ? "#ffd24a" : "#ffffff";
    const scoreStr = p.score.toLocaleString("en-US");
    ctx.fillText(scoreStr, 940, y + 25);
    const scoreW = ctx.measureText(scoreStr).width;

    // team pill + name
    ctx.textAlign = "left";
    let nx = 120;
    if (team) {
      ctx.font = `bold 15px ${FONT}`;
      const tw = ctx.measureText(team).width;
      ctx.fillStyle = tc; rr(ctx, nx, y + 13, tw + 20, 24, 12); ctx.fill();
      ctx.fillStyle = "#1a1528"; ctx.fillText(team, nx + 10, y + 26);
      nx += tw + 20 + 12;
    }
    ctx.font = `bold 24px ${FONT}`; ctx.fillStyle = "#ffffff";
    ctx.fillText(fitText(ctx, p.name, 940 - scoreW - 20 - nx), nx, y + 25);

    // progress bar
    ctx.fillStyle = "#2a2340"; rr(ctx, 120, y + 48, 820, 6, 3); ctx.fill();
    ctx.fillStyle = tc || "#7b2fff";
    rr(ctx, 120, y + 48, Math.max(6, 820 * (p.score / maxScore)), 6, 3); ctx.fill();
  });

  // footer
  ctx.fillStyle = "#2a2340"; ctx.fillRect(36, 894, 928, 1);
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.fillStyle = "#9d8fc4"; ctx.font = `20px ${FONT}`;
  ctx.fillText("TOTAL SCORE", 36, 928);
  ctx.fillText("PLAYERS", 296, 928);
  ctx.fillStyle = "#ffffff"; ctx.font = `bold 26px ${FONT}`;
  ctx.fillText(total.toLocaleString("en-US"), 36, 960);
  ctx.fillText(String(players.length), 296, 960);

  ctx.textAlign = "right"; ctx.fillStyle = "#6c6288"; ctx.font = `15px ${FONT}`;
  ctx.fillText(`Powered by JSR Gaming  •  ${timeText}`, 964, 928);

  // legend
  ctx.font = `bold 17px ${FONT}`;
  const keys = Object.keys(TEAM_COLORS);
  let lx = 964;
  for (let k = keys.length - 1; k >= 0; k--) {
    const label = keys[k];
    ctx.textAlign = "right"; ctx.fillStyle = "#d6d0f0";
    ctx.fillText(label, lx, 955);
    lx -= ctx.measureText(label).width + 10;
    ctx.fillStyle = TEAM_COLORS[label];
    ctx.beginPath(); ctx.arc(lx - 2, 954, 7, 0, Math.PI * 2); ctx.fill();
    lx -= 24;
  }
}

// ─────────────── MAP ───────────────
const MAP = { W: 640, H: 700 };

/**
 * mapData = {
 *   radius?: number,              // arena radius in world units (default 21600)
 *   cells?:  { size:number, data:number[] },   // bitmap minimap (size x size)
 *   snakes?: [{ name, x, y, body?: [[x,y],...], score? }]
 * }
 */
function drawMap(ctx, mapData, opts) {
  const { detectTeam, serverCode, timeText } = opts;
  const { W, H } = MAP;
  const cx = W / 2, cy = 330, R = 290;

  ctx.fillStyle = "#0d0b14"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#7b2fff"; ctx.fillRect(0, 0, W, 5);

  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff"; ctx.font = `bold 30px ${FONT}`;
  ctx.fillText("LIVE MAP", 24, 48);
  ctx.fillStyle = "#9d8fc4"; ctx.font = `16px ${FONT}`;
  ctx.fillText(`Slither Server ${serverCode}`, 24, 72);
  if (mapData.players != null) {
    ctx.textAlign = "right"; ctx.fillStyle = "#ffffff"; ctx.font = `bold 20px ${FONT}`;
    ctx.fillText(`${mapData.players} players`, W - 24, 48);
    ctx.textAlign = "left";
  }

  // arena disc with soft red rim (like the in-game minimap)
  ctx.save();
  ctx.shadowColor = "rgba(255,70,70,0.55)"; ctx.shadowBlur = 22;
  ctx.fillStyle = "#08080b";
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,90,90,0.35)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R - 2, 0, Math.PI * 2); ctx.clip();

  // faint rings
  ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1;
  for (const f of [0.33, 0.66]) { ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, Math.PI * 2); ctx.stroke(); }

  // live preview picture from the Wyrm status feed (already a rendered minimap)
  if (mapData.svgImage) {
    ctx.drawImage(mapData.svgImage, cx - R, cy - R, R * 2, R * 2);
  }

  // bitmap-style minimap
  if (mapData.cells && mapData.cells.size) {
    const n = mapData.cells.size, cell = (R * 2) / n;
    ctx.fillStyle = "rgba(150,150,155,0.85)";
    for (let i = 0; i < mapData.cells.data.length; i++) {
      if (!mapData.cells.data[i]) continue;
      const gx = i % n, gy = Math.floor(i / n);
      ctx.fillRect(cx - R + gx * cell, cy - R + gy * cell, Math.max(2, cell), Math.max(2, cell));
    }
  }

  // coordinate-based snakes
  const snakes = mapData.snakes || [];
  const worldR = mapData.radius || 21600;
  const toPx = (x, y) => [cx + ((x - mapData.ox) / worldR) * R, cy + ((y - mapData.oy) / worldR) * R];

  ctx.fillStyle = "rgba(150,150,155,0.8)";
  for (const s of snakes) for (const [bx, by] of s.body || []) {
    const [px, py] = toPx(bx, by); ctx.fillRect(px - 1, py - 1, 2, 2);
  }
  ctx.restore();

  const labels = [];
  snakes.forEach((s, idx) => {
    const [px, py] = toPx(s.x, s.y);
    const team = detectTeam(s.name || "");
    const col = team ? TEAM_COLORS[team] : "#ffffff";
    const big = idx === 0;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, team ? 5 : 3.2, 0, Math.PI * 2); ctx.fill();
    if (big) { ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.stroke(); }
    if (team || big) labels.push({ px, py, text: s.name, col });
  });
  ctx.font = `bold 12px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  for (const l of labels.slice(0, 15)) {
    const t = fitText(ctx, l.text, 110);
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillText(t, l.px + 9, l.py + 1);
    ctx.fillStyle = l.col; ctx.fillText(t, l.px + 8, l.py);
  }

  // footer
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.fillStyle = "#6c6288"; ctx.font = `14px ${FONT}`;
  ctx.fillText(`Powered by JSR Gaming  •  ${timeText}`, 24, 684);
  ctx.textAlign = "right"; ctx.font = `bold 14px ${FONT}`;
  let lx = W - 24;
  const keys = Object.keys(TEAM_COLORS);
  for (let k = keys.length - 1; k >= 0; k--) {
    ctx.fillStyle = "#d6d0f0"; ctx.fillText(keys[k], lx, 654);
    lx -= ctx.measureText(keys[k]).width + 8;
    ctx.fillStyle = TEAM_COLORS[keys[k]]; ctx.beginPath(); ctx.arc(lx - 2, 649, 5, 0, Math.PI * 2); ctx.fill();
    lx -= 18;
  }
}

module.exports = { LB, MAP, TEAM_COLORS, drawLeaderboard, drawMap };
