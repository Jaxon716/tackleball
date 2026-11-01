"use strict";
// UI layer: screens, 2D field rendering, broadcast score bug, prompts, season mode.

const $ = s => document.querySelector(s);

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

const SPEED = { line: 340, banner: 1200, fast: false };
function L() { return SPEED.fast ? Math.max(40, Math.round(SPEED.line * 0.18)) : SPEED.line; }
function B() { return SPEED.fast ? Math.max(300, Math.round(SPEED.banner * 0.4)) : SPEED.banner; }

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  $("#" + id).classList.remove("hidden");
  window.scrollTo(0, 0);
}

/* ================= Field rendering ================= */

const FIELD = { los: 50, firstDown: 50, ball: 50, left: null, right: null, dir: 1, off: null, formation: null };

// Formation templates: [lateral (-1..1 across the field), depth (yards from LOS,
// negative = behind the LOS on offense's side, positive = downfield of it)]
// Depth is drawn at DEPTH_PX per yard (exaggerated vs the field scale) so every
// player has clear space even where the screen compresses real yardage.
const FORMATIONS = {
  off: {
    run: [ // I-form
      [-0.26, -2], [-0.13, -2], [0, -2], [0.13, -2], [0.26, -2],
      [0.42, -2], [-0.88, -2], [0.88, -2],
      [0, -4], [0, -6.5], [0, -9],
    ],
    pass: [ // shotgun spread
      [-0.26, -2], [-0.13, -2], [0, -2], [0.13, -2], [0.26, -2],
      [-0.42, -2], [-0.88, -2], [0.88, -2], [0.6, -3],
      [0, -5], [0.3, -5],
    ],
    punt: [
      [-0.13, -2], [0, -2], [0.13, -2],
      [-0.3, -3], [0.3, -3],
      [-0.9, -2], [0.9, -2],
      [-0.38, -8], [0.38, -8], [0, -10],
      [0, -14],
    ],
    fieldgoal: [
      [-0.26, -2], [-0.13, -2], [0, -2], [0.13, -2], [0.26, -2],
      [-0.4, -2], [0.4, -2], [-0.5, -4], [0.5, -4],
      [0.07, -7], [0, -9.5],
    ],
    kickreturn: [ // return team (offense = receiving team)
      [0, -22],
      [-0.4, -12], [0.4, -12], [0, -9],
      [-0.18, -6], [0.18, -6],
      [0, -3],
      [-0.65, -4], [0.65, -4], [-0.9, -5], [0.9, -5],
    ],
  },
  def: {
    run: [ // 4-3
      [-0.38, 2], [-0.2, 2], [0.2, 2], [0.38, 2],
      [-0.15, 5], [0, 5.5], [0.15, 5],
      [-0.88, 1.5], [0.88, 1.5],
      [-0.3, 11], [0.3, 11],
    ],
    pass: [ // nickel
      [-0.25, 2], [0, 2], [0.25, 2],
      [-0.45, 4], [0.25, 6],
      [0.48, 2],
      [-0.88, 1.5], [0.88, 1.5],
      [0, 8],
      [-0.25, 12], [0.25, 12],
    ],
    blitz: [
      [-0.38, 2], [-0.2, 2], [0.2, 2], [0.38, 2],
      [-0.3, 3], [0.3, 3], [-0.15, 4], [0.15, 4],
      [-0.88, 1.5], [0.88, 1.5],
      [0, 12],
    ],
    prevent: [
      [-0.25, 2], [0, 2], [0.25, 2],
      [-0.3, 7], [0.3, 7],
      [-0.88, 10], [-0.55, 9], [0.55, 9], [0.88, 10],
      [-0.2, 16], [0.2, 16],
    ],
    goal: [ // goal-line
      [-0.4, 2], [-0.25, 2], [-0.1, 2], [0.1, 2], [0.25, 2], [0.4, 2],
      [0, 3], [-0.3, 3.5], [0.3, 3.5],
      [-0.88, 2], [0.88, 2],
    ],
    puntreturn: [
      [-0.5, 2], [-0.3, 2], [0, 2], [0.3, 2], [0.5, 2],
      [-0.4, 8], [0, 9], [0.4, 8],
      [-0.2, 14], [0.2, 14],
      [0, 19],
    ],
    fgrush: [
      [-0.5, 2], [-0.35, 2], [-0.2, 2], [0, 2], [0.2, 2], [0.35, 2], [0.5, 2],
      [-0.45, 3], [0.45, 3],
      [0, 6], [0.6, 5],
    ],
    kickoff: [ // coverage team lined up across the kick spot
      [-0.9, 2], [-0.72, 2], [-0.54, 2], [-0.36, 2], [-0.18, 2],
      [0, 2], [0.18, 2], [0.36, 2], [0.54, 2], [0.72, 2], [0.9, 2],
    ],
  },
};
const ballAnim = { active: false, from: 0, to: 0, start: 0, dur: 0, yOff: 0, anim: null };

function animateBall(from, to, ms, yOffNorm, meta) {
  return new Promise(res => {
    const dur = ms || Math.min(1800, 350 + Math.abs(to - from) * 16);
    ballAnim.active = true;
    ballAnim.from = from; ballAnim.to = to;
    ballAnim.yOff = yOffNorm || 0;
    ballAnim.start = performance.now(); ballAnim.dur = dur;
    // Live-play carrier animation (QB throw, WR/RB run, defender pursuit),
    // extended to kick/interception/fumble returns: the returner carries the
    // ball on their side of the ball while the cover team converges on them.
    ballAnim.anim = null;
    if (meta && (meta.kind === "run" || meta.kind === "pass") && FIELD.formation) {
      const G = animGeom();
      const form = FIELD.formation.off;
      const qbIdx = 9;
      // Carrier by geometry: the runner is the deepest helmet (excl. QB), the
      // receiver is the widest — works for both I-form and shotgun looks.
      let carrierIdx;
      if (meta.kind === "run") {
        carrierIdx = 0;
        for (let i = 0; i < form.length; i++) {
          if (i === qbIdx) continue;
          if (form[i][1] < form[carrierIdx][1]) carrierIdx = i;
        }
      } else {
        carrierIdx = 0;
        for (let i = 1; i < form.length; i++) {
          if (Math.abs(form[i][0]) > Math.abs(form[carrierIdx][0])) carrierIdx = i;
        }
      }
      const fromPt = i => {
        const p = form[i];
        let x = G.losX + G.dirOff * p[1] * 10;
        x = Math.max(6, Math.min(G.w - 6, x));
        return [x, G.ht / 2 + p[0] * G.ht * 0.44];
      };
      const catchY = G.ht / 2 + (Math.random() - 0.5) * G.ht * 0.08;
      ballAnim.anim = {
        kind: meta.kind, throwT: meta.kind === "pass" ? 0.3 : 0,
        carrierIn: "off", qbIdx, carrierIdx,
        qbFrom: fromPt(qbIdx),
        carrierFrom: fromPt(carrierIdx),
        carrierTo: [G.X(to), catchY],
        bulge: (Math.random() - 0.5) * G.ht * 0.16,
        // Three nearest defenders converge on the catch/tackle spot.
        pursuers: FIELD.formation.def
          .map((p, i) => {
            let x = G.losX - G.dirOff * p[1] * 10;
            x = Math.max(6, Math.min(G.w - 6, x));
            return { i, pos: [x, G.ht / 2 + p[0] * G.ht * 0.44] };
          })
          .sort((a, b) => Math.hypot(a.pos[0] - G.X(to), a.pos[1] - catchY) -
                          Math.hypot(b.pos[0] - G.X(to), b.pos[1] - catchY))
          .slice(0, 3)
          .map((d, j) => ({
            i: d.i, from: d.pos,
            to: [G.X(to) - (G.X(to) - d.pos[0]) * 0.12 + (Math.random() - 0.5) * 10,
                 catchY + (j - 1) * 11],
            delay: j * 0.1, bulge: (Math.random() - 0.5) * G.ht * 0.1,
          })),
      };
    } else if (meta && meta.kind === "kick" && FIELD.formation) {
      // Boot phase: the kicker's helmet punts/kicks the ball, the return man
      // drifts to the landing spot, and for INTs it's a pass to the pick man.
      const G = animGeom();
      const kickForm = meta.side === "off" ? FIELD.formation.off : FIELD.formation.def;
      const retForm = meta.side === "off" ? FIELD.formation.def : FIELD.formation.off;
      const ptOf = (a, i) => {
        const p = a[i];
        // Same formula as drawSquad: depth sign is carried by the formation data.
        let x = G.losX + G.dirOff * p[1] * 10;
        x = Math.max(6, Math.min(G.w - 6, x));
        return [x, G.ht / 2 + p[0] * G.ht * 0.44];
      };
      const catchY = G.ht / 2 + (Math.random() - 0.5) * G.ht * 0.08;
      const land = [G.X(to), catchY];
      const kickerIdx = meta.pick ? 9 : (meta.side === "off" ? 10 : 5);
      const kickerFrom = ptOf(kickForm, kickerIdx);
      let retIdx = 0;
      for (let i = 1; i < retForm.length; i++) {
        if (Math.abs(retForm[i][1]) > Math.abs(retForm[retIdx][1])) retIdx = i;
      }
      const retFrom = ptOf(retForm, retIdx);
      ballAnim.anim = {
        kind: "kick", throwT: 0, carrierIn: meta.side,
        carrierIdx: kickerIdx, carrierFrom: kickerFrom, carrierTo: land,
        arc: true, arcHt: meta.pick ? 0.1 : 0.22, bulge: 0,
        drift: { side: meta.side === "off" ? "def" : "off", idx: retIdx, from: retFrom, to: land },
        pursuers: [],
      };
    } else if (meta && meta.kind === "return" && FIELD.formation) {
      // Kick/INT/fumble returns: the returner catches the ball where it lands
      // and carries it upfield while the cover team chases.
      const G = animGeom();
      const carrierIn = meta.side === "def" ? "def" : "off";
      const form = carrierIn === "off" ? FIELD.formation.off : FIELD.formation.def;
      const chase = carrierIn === "off" ? FIELD.formation.def : FIELD.formation.off;
      const ptOf = (p) => {
        // Same formula as drawSquad: depth sign is carried by the formation data.
        let x = G.losX + G.dirOff * p[1] * 10;
        x = Math.max(6, Math.min(G.w - 6, x));
        return [x, G.ht / 2 + p[0] * G.ht * 0.44];
      };
      const catchY = G.ht / 2 + (Math.random() - 0.5) * G.ht * 0.08;
      let carrierIdx = 0;
      for (let i = 1; i < form.length; i++) {
        if (Math.abs(form[i][1]) > Math.abs(form[carrierIdx][1])) carrierIdx = i;
      }
      ballAnim.anim = {
        kind: "return", throwT: 0, carrierIn,
        carrierIdx, carrierFrom: [G.X(from), catchY],
        carrierTo: [G.X(to), catchY],
        bulge: (Math.random() - 0.5) * G.ht * 0.14,
        pursuers: chase
          .map((p, i) => ({ i, pos: ptOf(p) }))
          .sort((a, b) => Math.hypot(a.pos[0] - G.X(to), a.pos[1] - catchY) -
                          Math.hypot(b.pos[0] - G.X(to), b.pos[1] - catchY))
          .slice(0, 4)
          .map((d, j) => ({
            i: d.i, from: d.pos,
            to: [G.X(to) - (G.X(to) - d.pos[0]) * 0.1 + (Math.random() - 0.5) * 12,
                 catchY + (j - 1.5) * 12],
            delay: j * 0.08, bulge: (Math.random() - 0.5) * G.ht * 0.1,
          })),
      };
    }
    setTimeout(() => { ballAnim.active = false; ballAnim.anim = null; FIELD.ball = to; res(); }, dur);
  });
}

// Canvas geometry matching drawField(), for computing animation positions.
function animGeom() {
  const wrap = $("#fieldwrap");
  const w = (wrap && wrap.clientWidth > 10) ? wrap.clientWidth : 360;
  const ht = Math.round(w * 0.66);
  const ez = w * 10 / 120;
  const dirOff = FIELD.off === FIELD.left ? 1 : -1;
  return {
    w, ht, ez,
    X: y => ez + y * (w - 2 * ez) / 100,
    losX: ez + FIELD.los * (w - 2 * ez) / 100,
    dirOff,
  };
}
// Quadratic path with a lateral bulge, for organic player movement.
function curvePos(a, b, t, bulge) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const cx = mx - (b[1] - a[1]) * 0.4, cy = my + (b[0] - a[0]) * 0.4;
  const u = 1 - t;
  const bul = Math.sin(t * Math.PI) * (bulge || 0);
  return [
    u * u * a[0] + 2 * u * t * cx + t * t * b[0],
    u * u * a[1] + 2 * u * t * cy + t * t * b[1] + bul,
  ];
}

function drawHelmet(ctx, x, y, team, facing) {
  const t = TEAMS[team.name];
  const r = 5.5;
  ctx.save();
  // Shell
  ctx.fillStyle = t.primary;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  // Stripe
  ctx.strokeStyle = t.alt;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y - 1, r - 1.8, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  // Facemask on the facing side
  ctx.strokeStyle = "#b9c2cc";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + facing * (r - 1), y - 2.5);
  ctx.lineTo(x + facing * (r + 1.5), y - 2.5);
  ctx.moveTo(x + facing * (r - 1), y);
  ctx.lineTo(x + facing * (r + 1.5), y);
  ctx.moveTo(x + facing * (r - 1), y + 2.5);
  ctx.lineTo(x + facing * (r + 1.5), y + 2.5);
  ctx.moveTo(x + facing * (r + 1.5), y - 2.5);
  ctx.lineTo(x + facing * (r + 1.5), y + 2.5);
  ctx.stroke();
  ctx.restore();
}

// Midfield logo: football with laces surrounded by four dice, drawn vertically
// and semi-transparent into the turf
function drawCenterLogo(ctx, cx, cy, ht) {
  const s = ht * 0.085;     // die side
  const fw = ht * 0.2;      // football width
  const fh = ht * 0.105;    // football height
  const lw = Math.max(1, ht * 0.007);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 2);  // read vertically
  ctx.globalAlpha = 0.55;   // ghosted into the field
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const die = (x, y, rot, pips) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = lw;
    const r = s * 0.18;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-s / 2, -s / 2, s, s, r);
    else ctx.rect(-s / 2, -s / 2, s, s);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#111111";
    const p = s * 0.1, o = s * 0.24;
    const sets = {
      5: [[-o, -o], [o, -o], [0, 0], [-o, o], [o, o]],
      6: [[-o, -o], [o, -o], [-o, 0], [o, 0], [-o, o], [o, o]],
      3: [[-o, -o], [0, 0], [o, o]],
    };
    for (const pp of (sets[pips] || sets[5])) {
      ctx.beginPath();
      ctx.arc(pp[0], pp[1], p, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  const dx = fw * 0.38;
  const dy = fh * 0.85;
  die(-dx, -dy, -0.35, 5);
  die(dx, -dy, 0.35, 6);
  die(-dx, dy, 0.3, 5);
  die(dx, dy, -0.3, 5);

  // Football in true football leather color
  ctx.fillStyle = "#8a4b1f";
  ctx.strokeStyle = "#3a2008";
  ctx.beginPath();
  ctx.ellipse(0, 0, fw / 2, fh / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = lw * 1.4;
  ctx.stroke();

  // End bands (white, like a game ball)
  const bx = fw * 0.33;
  const ye = (fh / 2) * Math.sqrt(1 - (bx / (fw / 2)) * (bx / (fw / 2)));
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = fh * 0.28;
  ctx.beginPath();
  ctx.moveTo(-bx, -ye); ctx.lineTo(-bx, ye);
  ctx.moveTo(bx, -ye); ctx.lineTo(bx, ye);
  ctx.stroke();

  // Laces
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = lw * 1.3;
  ctx.beginPath();
  ctx.moveTo(-fw * 0.18, 0); ctx.lineTo(fw * 0.18, 0);
  ctx.stroke();
  const ly = fh * 0.12;
  for (let i = -3; i <= 3; i++) {
    const lx = i * fw * 0.05;
    ctx.beginPath();
    ctx.moveTo(lx, -ly); ctx.lineTo(lx, ly);
    ctx.stroke();
  }
  ctx.restore();
}

function drawField() {
  const c = $("#field");
  const wrap = $("#fieldwrap");
  if (!c || !wrap) return;
  const w = wrap.clientWidth;
  if (w < 10) return;
  const ht = Math.round(w * 0.66);
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(w * dpr), ph = Math.round(ht * dpr);
  if (c.width !== pw || c.height !== ph) {
    c.width = pw; c.height = ph; c.style.height = ht + "px";
  }
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ez = w * 10 / 120;
  const X = y => ez + y * (w - 2 * ez) / 100;

  // Turf with mow stripes
  ctx.fillStyle = "#1e5c2e";
  ctx.fillRect(0, 0, w, ht);
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  for (let y = 0; y < 100; y += 10) ctx.fillRect(X(y), 0, X(y + 5) - X(y), ht);

  // End zones: fixed team end zones, team colors with diagonal stripes only
  if (FIELD.left && FIELD.right) {
    const zones = [
      [0, TEAMS[FIELD.left.name]],
      [w - ez, TEAMS[FIELD.right.name]],
    ];
    for (const zone of zones) {
      const x0 = zone[0], t = zone[1];
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, 0, ez, ht); ctx.clip();
      ctx.fillStyle = t.primary; ctx.fillRect(x0, 0, ez, ht);
      ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 7;
      for (let i = -ht; i < ez + ht; i += 16) {
        ctx.beginPath();
        ctx.moveTo(x0 + i, 0); ctx.lineTo(x0 + i + ht, ht);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Yard lines every 5 yards
  ctx.strokeStyle = "#f5f5f0";
  for (let y = 0; y <= 100; y += 5) {
    ctx.lineWidth = (y === 0 || y === 100) ? 3.5 : 2;
    ctx.beginPath();
    ctx.moveTo(X(y), 0); ctx.lineTo(X(y), ht);
    ctx.stroke();
  }

  // One-yard ticks: NFL hashes and sideline ticks
  ctx.strokeStyle = "rgba(245,245,240,0.85)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 1; y <= 99; y++) {
    if (y % 5 === 0) continue;
    const x = X(y);
    ctx.moveTo(x, ht * 0.40); ctx.lineTo(x, ht * 0.40 + 5);
    ctx.moveTo(x, ht * 0.60 - 5); ctx.lineTo(x, ht * 0.60);
    ctx.moveTo(x, 0); ctx.lineTo(x, 4);
    ctx.moveTo(x, ht - 4); ctx.lineTo(x, ht);
  }
  ctx.stroke();

  // Yard numbers (small, NFL-style; midfield left open for the center logo)
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "600 " + Math.round(ht * 0.07) + "px system-ui";
  for (let y = 10; y <= 90; y += 10) {
    const num = y < 50 ? y : y > 50 ? 100 - y : 50;
    const x = X(y);
    ctx.fillText(String(num), x, ht * 0.11);
    ctx.fillText(String(num), x, ht * 0.89);
  }

  drawCenterLogo(ctx, X(50), ht / 2, ht);

  // Goal posts at the back of each end zone (yellow fork)
  ctx.strokeStyle = "#ffcf00";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  for (const px of [2, w - 2]) {
    const inward = px < w / 2 ? 1 : -1;
    ctx.moveTo(px, ht * 0.42); ctx.lineTo(px, ht * 0.58);
    ctx.moveTo(px, ht * 0.42); ctx.lineTo(px + inward * 9, ht * 0.42);
    ctx.moveTo(px, ht * 0.58); ctx.lineTo(px + inward * 9, ht * 0.58);
  }
  ctx.stroke();

  // Sideline boundary
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(1, 1, w - 2, ht - 2);

  // First down marker (yellow), then line of scrimmage (blue) in fixed field coordinates
  const los = X(FIELD.los);
  const fg = FIELD.firstDown;
  if (fg !== FIELD.los && fg >= 0 && fg <= 100) {
    ctx.fillStyle = "#ffd400";
    ctx.fillRect(X(fg) - 1.5, 0, 3, ht);
  }
  ctx.fillStyle = "#2f7fe0";
  ctx.fillRect(los - 1.5, 0, 3, ht);
  // Possession arrow points the way the offense is driving
  const dir = FIELD.dir || 1;
  ctx.fillStyle = "#ffd400";
  ctx.beginPath();
  ctx.moveTo(los + dir * 8, ht * 0.045);
  ctx.lineTo(los - dir * 3, ht * 0.012);
  ctx.lineTo(los - dir * 3, ht * 0.078);
  ctx.closePath();
  ctx.fill();

  // Formation helmets: 11 per side, offense behind the LOS, defense downfield of it.
// Depth uses a fixed pixel-per-yard scale so stacks never jumble, whatever the
// screen compression of real yardage is.
if (FIELD.off && FIELD.left && FIELD.right && FIELD.formation) {
    const off = FIELD.off;
    const dfn = off === FIELD.left ? FIELD.right : FIELD.left;
    const dirOff = off === FIELD.left ? 1 : -1;
    const losX = X(FIELD.los);
    const DEPTH_PX = 10;
    // During a live-play animation, the ball carrier and the converging
    // defenders are drawn off their formation spots along curved paths.
    const overOff = {}, overDef = {};
    if (ballAnim.active && ballAnim.anim) {
      const A = ballAnim.anim;
      const t = Math.min(1, (performance.now() - ballAnim.start) / ballAnim.dur);
      const tC = 1 - Math.pow(1 - t, 3); // ease-out on the carrier
      const carrierOver = A.carrierIn === "def" ? overDef : overOff;
      if (!A.arc) carrierOver[A.carrierIdx] = curvePos(A.carrierFrom, A.carrierTo, tC, A.bulge);
      for (const P of A.pursuers) {
        const tt = Math.max(0, Math.min(1, (t - P.delay) / (1 - P.delay)));
        const over = P.i !== undefined ? (A.carrierIn === "def" ? overOff : overDef) : null;
        if (over) over[P.i] = curvePos(P.from, P.to, tt, P.bulge);
      }
      if (A.drift) {
        const over = A.drift.side === "def" ? overDef : overOff;
        over[A.drift.idx] = curvePos(A.drift.from, A.drift.to, tC, 0);
      }
    }
    const drawSquad = (players, team, facing, overrides) => {
      players.forEach((p, i) => {
        let px = losX + dirOff * p[1] * DEPTH_PX;
        px = Math.max(6, Math.min(w - 6, px));
        let py = ht / 2 + p[0] * ht * 0.44;
        if (overrides && overrides[i]) { px = overrides[i][0]; py = overrides[i][1]; }
        drawHelmet(ctx, px, py, team, facing);
      });
    };
    drawSquad(FIELD.formation.off, off, dirOff, overOff);
    drawSquad(FIELD.formation.def, dfn, -dirOff, overDef);
  }

  // Ball (animated)
  let bx = null, by = null;
  if (ballAnim.active) {
    const t = Math.min(1, (performance.now() - ballAnim.start) / ballAnim.dur);
    const e = 1 - Math.pow(1 - t, 3);
    if (ballAnim.anim) {
      // Live play: the ball rides with the carrier, arcs QB → receiver, or
      // booms downfield off the kicker's foot.
      const A = ballAnim.anim;
      if (A.kind === "kick") {
        bx = A.carrierFrom[0] + (A.carrierTo[0] - A.carrierFrom[0]) * e;
        by = A.carrierFrom[1] + (A.carrierTo[1] - A.carrierFrom[1]) * e
           - Math.sin(t * Math.PI) * ht * (A.arcHt || 0.22);
      } else if (A.kind === "pass" && t < A.throwT) {
        const ct = t / A.throwT;
        const throwTo = curvePos(A.carrierFrom, A.carrierTo, A.throwT, A.bulge);
        bx = A.qbFrom[0] + (throwTo[0] - A.qbFrom[0]) * ct;
        by = A.qbFrom[1] + (throwTo[1] - A.qbFrom[1]) * ct - Math.sin(ct * Math.PI) * ht * 0.12;
      } else {
        const cp = curvePos(A.carrierFrom, A.carrierTo, t, A.bulge);
        bx = cp[0]; by = cp[1];
      }
    } else {
      const b = ballAnim.from + (ballAnim.to - ballAnim.from) * e;
      bx = X(b);
      by = ht / 2 + ballAnim.yOff * ht * e;
    }
  }
  if (bx == null) { bx = X(FIELD.ball); by = ht / 2; }
  bx = Math.max(8, Math.min(w - 8, bx));
  ctx.save();
  ctx.translate(bx, by);
  ctx.fillStyle = "#8a4b1f";
  ctx.beginPath();
  ctx.ellipse(0, 0, 7.5, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-2.5, 0); ctx.lineTo(2.5, 0); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-1.2, -1.6); ctx.lineTo(-1.2, 1.6);
  ctx.moveTo(0, -1.8); ctx.lineTo(0, 1.8);
  ctx.moveTo(1.2, -1.6); ctx.lineTo(1.2, 1.6);
  ctx.stroke();
  ctx.restore();
}

function loop() {
  if (!$("#screen-game").classList.contains("hidden")) drawField();
  requestAnimationFrame(loop);
}

/* ================= Presentation hooks for the engine ================= */

let pendingAsk = null;
let quitRequested = false;

function addFeed(text, cls) {
  const feed = $("#feed");
  const line = h("div", "line" + (cls ? " " + cls : ""), text);
  feed.appendChild(line);
  while (feed.children.length > 250) feed.removeChild(feed.firstChild);
  feed.scrollTop = feed.scrollHeight;
}

function quarterClock(g) {
  const secs = Math.max(0, Math.round(900 - g.roundInQ * 22.5));
  const m = Math.floor(secs / 60), s = secs % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

function renderScorebug() {
  const g = pres.game;
  if (!g) return;
  const bug = $("#scorebug");
  const dd = g.offense ? g.downDistance() : "KICKOFF";
  const playsLeft = Math.max(0, 40 - g.roundInQ);
  const redZone = g.offense && g.yard >= 80;
  const possName = g.offense ? g.offense.name : null;
  // Score boxes face each other: user's flag sits at the far left with its score
  // box on the inner side; AI's flag at the far right with its score box inner too.
  const teamBlock = (team, isPoss, userSide) => {
    const t = TEAMS[team.name];
    const flag = '<div class="team-flag' + (userSide ? '' : ' flag-right') +
                 '" style="background:' + t.primary + ';color:' + t.text + '">' + t.abbr + '</div>';
    const score = '<div class="team-score' + (userSide ? '' : ' score-left') + '">' + g.score[team.name] + '</div>';
    const dot = isPoss ? '<div class="poss-dot"></div>' : '';
    return userSide ? flag + score + dot : dot + score + flag;
  };
  bug.innerHTML =
    '<div class="bug-row">' +
      teamBlock(g.user, possName === g.user.name, true) +
      '<div class="bug-center">' +
        '<div class="bug-gold">' +
          '<div class="q">' + (g.q === 5 ? "OT" : "Q" + g.q) + '</div>' +
          '<div class="clk">' + quarterClock(g) + '</div>' +
        '</div>' +
        '<div class="bug-sub">' +
          '<span class="dd">' + dd + '</span>' +
          '<span class="plays">' + playsLeft + ' plays left</span>' +
        '</div>' +
      '</div>' +
      teamBlock(g.ai, possName === g.ai.name, false) +
    '</div>' +
    '<div class="bug-ticker">' +
      (redZone ? '<span class="rz">RED ZONE</span>' : '') +
      '<span class="ad">Action dice · You ' + g.user.actionDice + ' · AI ' + g.ai.actionDice + '</span>' +
    '</div>';
}

function askUI(prompt, options) {
  return new Promise((resolve, reject) => {
    if (quitRequested) { quitRequested = false; reject({ abort: true }); return; }
    pendingAsk = { resolve, reject };
    const p = $("#prompt");
    p.innerHTML = "";
    p.appendChild(h("div", "prompt-title", prompt));
    let lastGroup = null;
    for (const o of options) {
      const grp = o.group || "";
      if (grp && grp !== lastGroup) {
        p.appendChild(h("div", "group-label", grp));
        lastGroup = grp;
      }
      const btn = h("button", "choice-btn", o.label || o);
      btn.onclick = () => {
        $("#prompt").innerHTML = "";
        pendingAsk = null;
        resolve(o.value || o);
      };
      p.appendChild(btn);
    }
    const q = h("button", "quit-btn", "Quit to Menu");
    q.onclick = () => {
      $("#prompt").innerHTML = "";
      pendingAsk = null;
      reject({ abort: true });
    };
    p.appendChild(q);
    p.scrollIntoView({ block: "nearest" });
  });
}

function showBanner(text, cls, ms) {
  const b = $("#banner");
  b.innerHTML = "<span>" + text + "</span>";
  b.className = "show " + (cls || "");
  return delay(ms || B()).then(() => { b.className = ""; });
}

function showStatsReportOverlay(game, title) {
  return new Promise(res => {
    const o = $("#final");
    o.classList.remove("hidden");
    const ut = TEAMS[game.user.name], at = TEAMS[game.ai.name];
    o.innerHTML =
      '<div class="final-card">' +
        '<div class="final-title">' + title + '</div>' +
        '<div class="final-score" style="font-size:22px">' + ut.abbr + ' ' + game.score[game.user.name] +
        ' — ' + game.score[game.ai.name] + ' ' + at.abbr + '</div>' +
        '<table class="stat-table">' + statHeader(game) + statRowsHtml(game) + '</table>' +
        '<button id="statsBtn" class="menu-btn">Continue</button>' +
      '</div>';
    $("#statsBtn").onclick = () => { o.classList.add("hidden"); res(); };
  });
}

function statHeader(game) {
  const ut = TEAMS[game.user.name], at = TEAMS[game.ai.name];
  return '<tr><th>Stat</th><th>' + ut.abbr + '</th><th>' + at.abbr + '</th></tr>';
}

function statRowsHtml(game) {
  const su = game.user.stats, sa = game.ai.stats;
  const row = (label, a, b) =>
    "<tr><td>" + label + "</td><td>" + a + "</td><td>" + b + "</td></tr>";
  const sec = title =>
    '<tr class="stat-section"><td colspan="3">' + title + '</td></tr>';
  let h = sec("TEAM STATS");
  h += row("Total yards", su.passYards + su.rushYards, sa.passYards + sa.rushYards);
  h += row("Pass yards", su.passYards, sa.passYards);
  h += row("Rush yards", su.rushYards, sa.rushYards);
  h += row("Total plays", su.plays, sa.plays);
  h += row("Touchdowns", su.touchdowns, sa.touchdowns);
  h += row("Passing TDs", su.passTDs, sa.passTDs);
  h += row("Rushing TDs", su.rushTDs, sa.rushTDs);
  h += row("1st downs", su.firstDowns, sa.firstDowns);
  h += row("Completions", su.completions + "/" + su.passes, sa.completions + "/" + sa.passes);
  h += row("Turnovers", su.turnovers, sa.turnovers);
  h += row("Sacks allowed", su.sacks + " (" + su.sackYards + " yds)", sa.sacks + " (" + sa.sackYards + " yds)");
  h += row("Penalties", su.penalties, sa.penalties);
  h += row("Punts", su.punts, sa.punts);
  h += row("Injuries", su.injuries, sa.injuries);
  h += sec("OFFENSE — POSITION STATS");
  h += row("QB pass yards", su.qbYards, sa.qbYards);
  h += row("QB pass TDs", su.qbPassTDs, sa.qbPassTDs);
  h += row("RB rush yards", su.rbYards, sa.rbYards);
  h += row("RB rush TDs", su.rbTDs, sa.rbTDs);
  h += row("WR receiving yards", su.wrYards, sa.wrYards);
  h += row("WR receiving TDs", su.wrTDs, sa.wrTDs);
  h += sec("DEFENSE & SPECIAL TEAMS");
  h += row("Sacks made", su.sacksMade, sa.sacksMade);
  h += row("Interceptions made", su.intsMade, sa.intsMade);
  h += row("Interceptions thrown", su.intsThrown, sa.intsThrown);
  h += row("Fumbles", su.fumbles, sa.fumbles);
  h += row("Return yards", su.stYards, sa.stYards);
  h += row("Return TDs", su.stTDs, sa.stTDs);
  // Injury report: injured positions, severity, and modifier loss per team
  const uTeam = game.user, aTeam = game.ai;
  const injuredPos = [...uTeam.minorInjuries, ...aTeam.minorInjuries, ...uTeam.majorInjuries, ...aTeam.majorInjuries];
  if (injuredPos.length) {
    h += sec("INJURY REPORT");
    for (const k of [...new Set(injuredPos)]) {
      const cell = t => {
        const m = t.minorInjuries.filter(x => x === k).length;
        const M = t.majorInjuries.filter(x => x === k).length;
        if (!m && !M) return "Healthy";
        const parts = [];
        if (m) parts.push("minor ×" + m + " (rest of game)");
        if (M) parts.push("major ×" + M + " (rest of season)");
        return parts.join(", ") + " — modifier −" + (m + M);
      };
      h += row(k + " injured", cell(uTeam), cell(aTeam));
    }
  }
  return h;
}

function showFinalOverlay(game) {
  return new Promise(res => {
    const o = $("#final");
    o.classList.remove("hidden");
    const us = game.score[game.user.name], as = game.score[game.ai.name];
    const verdict = us > as ? "YOU WIN" : us < as ? "AI WINS" : "TIE GAME";
    const ut = TEAMS[game.user.name], at = TEAMS[game.ai.name];
    o.innerHTML =
      '<div class="final-card">' +
        '<div class="final-title">FINAL</div>' +
        '<div class="final-score">' + ut.abbr + " " + us + " — " + as + " " + at.abbr + '</div>' +
        '<div class="final-verdict">' + verdict + '</div>' +
        '<table class="stat-table">' + statHeader(game) + statRowsHtml(game) + '</table>' +
        '<button id="finalBtn" class="menu-btn">Continue</button>' +
      '</div>';
    $("#finalBtn").onclick = () => { o.classList.add("hidden"); res(); };
  });
}

const pres = {
  game: null,
  async say(text, cls) { addFeed(text, cls); await delay(L()); },
  async banner(text, cls, ms) { await showBanner(text, cls, ms); },
    async moveBall(from, to, ms, yOffNorm) { await animateBall(from, to, ms, yOffNorm); },
  setEndZones(leftTeam, rightTeam) { FIELD.left = leftTeam; FIELD.right = rightTeam; },
  setPossession(team) { FIELD.off = team; },
  setFormation(offType, defType) {
    FIELD.formation = {
      off: FORMATIONS.off[offType] || FORMATIONS.off.run,
      def: FORMATIONS.def[defType] || FORMATIONS.def.run,
    };
    FIELD.offForm = offType;
  },
  setField(los, firstDown, ball) {
    if (los != null) FIELD.los = los;
    FIELD.firstDown = (firstDown == null) ? FIELD.los : firstDown;
    FIELD.ball = (ball != null) ? ball : FIELD.los;
    FIELD.dir = FIELD.firstDown >= FIELD.los ? 1 : -1;
  },
  updateBoard() { renderScorebug(); },
  ask(prompt, options) { return askUI(prompt, options); },
  showFinal(game) { return showFinalOverlay(game); },
  showStatsReport(game, title) { return showStatsReportOverlay(game, title); },
};

/* ================= Game launch ================= */

async function launchGame(userTeam, aiTeam, userHome, seasonInjuries) {
  showScreen("screen-game");
  $("#feed").innerHTML = "";
  $("#prompt").innerHTML = "";
  quitRequested = false;
  FIELD.off = null;
  FIELD.formation = null;
  const game = new Game(pres, userTeam, aiTeam, userHome);
  for (const pos of (seasonInjuries || [])) {
    if (!game.user.majorInjuries.includes(pos)) game.user.majorInjuries.push(pos);
  }
  pres.game = game;
  pres.setEndZones(game.leftTeam, game.rightTeam);
  pres.setField(50, 50);
  pres.updateBoard();
  try {
    const score = await game.start();
    pres.game = null;
    lastGameMajorInjuries = [...new Set(game.user.majorInjuries)];
    return score;
  } catch (e) {
    if (e && e.abort) { pres.game = null; return null; }
    throw e;
  }
}

/* ================= Career / season persistence ================= */

const SAVE_KEY = "gridiron_nfl_save_v1";
let lastGameMajorInjuries = [];

function loadCareer() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (s) {
      const d = JSON.parse(s);
      if (d && typeof d === "object") {
        d.careerTeam = d.careerTeam || null;
        d.seasonNumber = d.seasonNumber || 1;
        d.ratings = d.ratings || {};
        d.history = d.history || [];
        d.current = d.current || null;
        d.year = d.year || 1;
        d.injuries = d.injuries || {};
        d.stats = Object.assign({ seasonsStarted: 0, gamesPlayed: 0, wins: 0, losses: 0, ties: 0, championships: 0 }, d.stats || {});
        return d;
      }
    }
  } catch (e) {}
  return { careerTeam: null, seasonNumber: 1, ratings: {}, history: [], current: null, year: 1, injuries: {}, stats: { seasonsStarted: 0, gamesPlayed: 0, wins: 0, losses: 0, ties: 0, championships: 0 } };
}

function saveCareer() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(career));
  } catch (e) {
    if (!window.__saveWarned) {
      window.__saveWarned = true;
      try {
        modal("WARNING: your browser is blocking saved progress (seasons and stats will not persist).\n\nThis happens on proxy/redirect links. Fix: add the game to your Home Screen from its official link and save from there.");
      } catch (err) {}
    }
  }
}

function applyRatings() {
  for (const n in career.ratings) {
    if (!TEAMS[n]) continue;
    const v = career.ratings[n];
    const keys = ["qb", "rb", "wr", "lm", "lb", "db"];
    keys.forEach((k, i) => { TEAMS[n][k] = Math.max(3, Math.min(18, Math.round(v[i]))); });
  }
}

function exportRatings() {
  const r = {};
  for (const n in TEAMS) {
    const t = TEAMS[n];
    r[n] = [t.qb, t.rb, t.wr, t.lm, t.lb, t.db];
  }
  return r;
}

let career = null;
let cur = null; // active season state (reference into career.current)

/* ================= Team select ================= */

let tsState = null; // { exclude, cb }

function openTeamSelect(title, exclude, cb, backFn) {
  tsState = { exclude, cb, backFn: backFn || (() => showScreen("screen-title")) };
  $("#ts-title").textContent = title;
  const grid = $("#ts-grid");
  grid.innerHTML = "";
  for (const name in TEAMS) {
    if (name === exclude) continue;
    const t = TEAMS[name];
    const b = document.createElement("button");
    b.className = "team-card";
    b.style.background = t.primary;
    b.style.color = t.text;
    const r = teamRatings(name);
    b.innerHTML = '<span class="tc-abbr">' + t.abbr + '</span><span class="tc-name">' + name + '</span>' +
      '<span class="tc-ratings"><span class="rc-chip">OFF ' + r.off + ' (' + r.offMod + ')</span>' +
      '<span class="rc-chip">DEF ' + r.def + ' (' + r.defMod + ')</span>' +
      '<span class="rc-chip ovr" style="background:' + t.alt + ';color:' + t.text + '">OVR ' + r.ovr + ' (' + r.ovrMod + ')</span></span>';
    b.onclick = () => cb(name);
    grid.appendChild(b);
  }
  showScreen("screen-teamselect");
}

$("#ts-random").onclick = () => {
  const names = Object.keys(TEAMS).filter(n => n !== tsState.exclude);
  tsState.cb(names[Math.floor(Math.random() * names.length)]);
};
$("#ts-back").onclick = () => (tsState && tsState.backFn ? tsState.backFn() : showScreen("screen-title"));

$("#btn-exhibition").onclick = () => {
  const pickTeam = () => openTeamSelect("Choose your team", null, user => {
    openTeamSelect("Choose the opponent", user, opp => startExhibition(user, opp), pickTeam);
  });
  pickTeam();
};

async function startExhibition(user, opp) {
  const score = await launchGame(user, opp, true);
  renderTitle();
  showScreen("screen-title");
}

/* ================= League simulation (AI vs AI) ================= */

function divisionFor(name) {
  for (const d in DIVISIONS) if (DIVISIONS[d].includes(name)) return d;
  return "";
}

function quickLeagueGame(homeName, awayName) {
  const scores = {}; scores[homeName] = 0; scores[awayName] = 0;
  for (let q = 0; q < 4; q++) {
    for (const pair of [[homeName, awayName], [awayName, homeName], [homeName, awayName], [awayName, homeName]]) {
      const off = TEAMS[pair[0]], def = TEAMS[pair[1]];
      const attack = (bonus(off.qb) + bonus(off.rb) + bonus(off.wr)) / 3;
      const stop = (bonus(def.lm) + bonus(def.lb) + bonus(def.db)) / 3;
      const rv = 1 + Math.floor(Math.random() * 20) + Math.round(attack - stop) + (pair[0] === homeName ? 1 : 0);
      if (rv >= 19) {
        if (Math.random() < 0.86) scores[pair[0]] += 7;
        else scores[pair[0]] += 3;
      } else if (rv >= 15) {
        scores[pair[0]] += 3;
      }
    }
  }
  if (scores[homeName] === scores[awayName]) {
    const winner = (1 + Math.floor(Math.random() * 20)) + bonus(TEAMS[homeName].qb) >=
                   (1 + Math.floor(Math.random() * 20)) + bonus(TEAMS[awayName].qb) ? homeName : awayName;
    scores[winner] += 3;
  }
  return scores;
}

function makeCrossDivisionRounds() {
  const names = Object.keys(TEAMS);
  for (let attempt = 0; attempt < 500; attempt++) {
    const used = {};
    names.forEach(n => used[n] = new Set());
    const rounds = [];
    let okay = true;
    for (let r = 0; r < 11; r++) {
      const remaining = new Set(names);
      const games = [];
      while (remaining.size) {
        const candidates = shuffle([...remaining]);
        let pair = null;
        for (const a of candidates) {
          const possible = shuffle([...remaining].filter(b => b !== a && divisionFor(a) !== divisionFor(b) && !used[a].has(b)));
          if (possible.length) { pair = [a, possible[0]]; break; }
        }
        if (!pair) { okay = false; break; }
        games.push(pair);
        remaining.delete(pair[0]); remaining.delete(pair[1]);
      }
      if (!okay) break;
      for (const [a, b] of games) { used[a].add(b); used[b].add(a); }
      rounds.push(games);
    }
    if (okay) return rounds;
  }
  const rotation = names.slice();
  const rounds = [];
  for (let i = 0; i < 31; i++) {
    const games = [];
    for (let j = 0; j < 16; j++) games.push([rotation[j], rotation[rotation.length - 1 - j]]);
    rounds.push(games);
    rotation.splice(0, rotation.length, rotation[0], rotation[rotation.length - 1], ...rotation.slice(1, -1));
  }
  return shuffle(rounds).slice(0, 11);
}

function generateSchedule() {
  const weeks = Array.from({ length: 17 }, () => []);
  const divisionRounds = [];
  for (const div in DIVISIONS) {
    const [a, b, c, d] = DIVISIONS[div];
    divisionRounds.push([
      [[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]
    ]);
  }
  for (let ri = 0; ri < 3; ri++) {
    for (const per of divisionRounds) {
      for (const [home, away] of per[ri]) {
        weeks[ri].push([home, away]);
        weeks[ri + 3].push([away, home]);
      }
    }
  }
  const cross = makeCrossDivisionRounds();
  cross.forEach((games, r) => { for (const g of games) weeks[r + 6].push(g); });
  const homeCount = {}, awayCount = {};
  for (const n in TEAMS) { homeCount[n] = 0; awayCount[n] = 0; }
  const balanced = [];
  for (const week of weeks) {
    const adjusted = [];
    for (const g of week) {
      let a = g[0], b = g[1];
      if (homeCount[a] > homeCount[b] && awayCount[a] < awayCount[b]) { const t = a; a = b; b = t; }
      else if (homeCount[a] === homeCount[b] && Math.random() < 0.5) { const t = a; a = b; b = t; }
      homeCount[a]++; awayCount[b]++;
      adjusted.push([a, b]);
    }
    balanced.push(shuffle(adjusted));
  }
  return balanced;
}

/* ================= Standings ================= */

function emptyRecord() { return { W: 0, L: 0, T: 0, PF: 0, PA: 0, dw: 0, dl: 0 }; }
function emptyRecords() {
  const r = {};
  for (const n in TEAMS) r[n] = emptyRecord();
  return r;
}

function recordResult(records, home, away, hs, as) {
  records[home].PF += hs; records[home].PA += as;
  records[away].PF += as; records[away].PA += hs;
  let winner = null, loser = null;
  if (hs > as) { records[home].W++; records[away].L++; winner = home; loser = away; }
  else if (as > hs) { records[away].W++; records[home].L++; winner = away; loser = home; }
  else { records[home].T++; records[away].T++; }
  if (divisionFor(home) === divisionFor(away) && winner) {
    records[winner].dw++; records[loser].dl++;
  }
}

function standingsKey(name, records) {
  const r = records[name];
  return [r.W + r.T * 0.5, r.dw - r.dl, r.PF - r.PA, r.PF];
}
function cmpKey(a, b) {
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; if (d) return d; }
  return 0;
}

function playoffTeams(records, conf) {
  const divisions = Object.keys(DIVISIONS).filter(d => d.startsWith(conf));
  const champs = divisions.map(d =>
    DIVISIONS[d].slice().sort((a, b) => cmpKey(standingsKey(b, records), standingsKey(a, records)))[0]);
  const divisionSeeds = champs.slice().sort((a, b) => cmpKey(standingsKey(b, records), standingsKey(a, records)));
  const wc = Object.keys(records)
    .filter(n => divisionFor(n).startsWith(conf) && !champs.includes(n))
    .sort((a, b) => cmpKey(standingsKey(b, records), standingsKey(a, records)))
    .slice(0, 3);
  return divisionSeeds.concat(wc);
}

function chip(name) {
  const t = TEAMS[name];
  return '<span class="team-chip-mini" style="background:' + t.primary + ';color:' + t.text + '">' + t.abbr + '</span>';
}

function teamRatings(name) {
  const t = TEAMS[name];
  const off = Math.round((t.qb + t.rb + t.wr) / 3);
  const def = Math.round((t.lm + t.lb + t.db) / 3);
  const offMod = Math.round((bonus(t.qb) + bonus(t.rb) + bonus(t.wr)) / 3);
  const defMod = Math.round((bonus(t.lm) + bonus(t.lb) + bonus(t.db)) / 3);
  return { off, def, ovr: Math.round((off + def) / 2), offMod, defMod, ovrMod: Math.round((offMod + defMod) / 2) };
}

function standingsHtml(records) {
  let html = "";
  for (const conf of ["AFC", "NFC"]) {
    html += '<div class="div-heading">' + conf + '</div>';
    for (const div in DIVISIONS) {
      if (!div.startsWith(conf)) continue;
      html += '<div class="group-label">' + div + '</div>';
      html += '<table class="info-table"><tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>PF</th><th>PA</th></tr>';
      const sorted = DIVISIONS[div].slice().sort((a, b) => cmpKey(standingsKey(b, records), standingsKey(a, records)));
      for (const n of sorted) {
        const r = records[n];
        const mark = n === cur.userTeam ? ' <span class="muted">(you)</span>' : "";
        html += '<tr><td class="chip-cell">' + chip(n) + n + mark + '</td><td>' + r.W + '</td><td>' + r.L +
                '</td><td>' + r.T + '</td><td>' + r.PF + '</td><td>' + r.PA + '</td></tr>';
      }
      html += '</table>';
    }
  }
  return html;
}

/* ================= Season hub ================= */

function addSeasonLine(text) {
  const f = $("#season-feed");
  f.appendChild(h("div", null, text));
  f.scrollTop = f.scrollHeight;
}

function renderSeasonHub() {
  cur = career.current;
  const r = cur.records[cur.userTeam];
  $("#season-head").innerHTML =
    '<div class="sh-line">YEAR ' + (career.year || 1) + ' OF 5 · SEASON ' + cur.seasonNumber + ' — ' + cur.userTeam + '</div>' +
    '<div class="sh-record">' + r.W + '-' + r.L + '-' + r.T + ' · PF ' + r.PF + ' · PA ' + r.PA + '</div>' +
    ((career.injuries[cur.userTeam] || []).length ?
      '<div class="sh-record" style="color:#ff8f8f">SEASON INJURIES: ' + career.injuries[cur.userTeam].join(", ") + '</div>' : '') +
    '<div class="sh-week">' + (cur.week < 17 ? "WEEK " + (cur.week + 1) + " OF 17" : "REGULAR SEASON COMPLETE") + '</div>';
  const body = $("#season-body");
  body.innerHTML = "";
  if (cur.week < 17) {
    const box = h("div", null);
    box.appendChild(h("div", "group-label", "WEEK " + (cur.week + 1) + " MATCHUPS"));
    for (const g of cur.schedule[cur.week]) {
      const mine = g[0] === cur.userTeam || g[1] === cur.userTeam;
      box.appendChild(h("div", "match-line", g[1] + " at " + g[0] + (mine ? "  —  YOUR GAME" : "")));
    }
    body.appendChild(box);
    const btn = h("button", "menu-btn", "Play Week " + (cur.week + 1));
    btn.onclick = playWeek;
    body.appendChild(btn);
  } else {
    const btn = h("button", "menu-btn", "Start Playoffs");
    btn.onclick = () => {
      runPlayoffs().catch(e => {
        if (!(e && e.abort)) console.error(e);
        renderSeasonHub();
        showScreen("screen-season");
      });
    };
    body.appendChild(btn);
  }
  $("#season-feed").innerHTML = "";
}

$("#btn-season").onclick = async () => {
  if (career.current) await modal("You have a saved season in progress.\nStarting a new one deletes it.");
  openTeamSelect("Choose your franchise", null, team => {
    career.injuries = career.injuries || {};
    career.stats = career.stats || { seasonsStarted: 0, gamesPlayed: 0, wins: 0, losses: 0, ties: 0, championships: 0 };
    const fresh = !career.careerTeam;
    career.careerTeam = team;
    if (fresh) career.year = 1;
    career.injuries[team] = [];
    career.stats.seasonsStarted++;
    career.current = {
      userTeam: team,
      seasonNumber: career.seasonNumber,
      schedule: generateSchedule(),
      records: emptyRecords(),
      week: 0,
      results: [],
    };
    saveCareer();
    renderSeasonHub();
    showScreen("screen-season");
  }, () => showScreen("screen-title"));
};

$("#btn-continue").onclick = () => {
  if (!career.current) { modal("No saved season to load.\nStart a new season first."); return; }
  renderSeasonHub();
  showScreen("screen-season");
};

$("#ss-menu").onclick = () => { saveCareer(); showScreen("screen-title"); };
let ssDeleteArmed = false;
$("#ss-delete").onclick = () => {
  if (!ssDeleteArmed) {
    ssDeleteArmed = true;
    $("#ss-delete").textContent = "Tap again to confirm delete";
    return;
  }
  ssDeleteArmed = false;
  $("#ss-delete").textContent = "Delete Saved Season";
  career.current = null;
  cur = null;
  saveCareer();
  renderTitle();
  showScreen("screen-title");
  modal("Saved season deleted.");
};
$("#ss-standings").onclick = () => {
  if (!cur) return;
  showInfo(standingsHtml(cur.records), "screen-season");
};

async function playWeek() {
  const wi = cur.week;
  const myTeam = cur.userTeam;
  // Snapshot so quitting mid-week never double-counts games already simmed.
  const snapRecords = JSON.parse(JSON.stringify(cur.records));
  const snapResults = (cur.results[wi] || []).slice();
  for (const g of cur.schedule[wi]) {
    const home = g[0], away = g[1];
    let hs, as;
    if (home === myTeam || away === myTeam) {
      const userTeam = home === myTeam ? home : away;
      const aiTeam = userTeam === home ? away : home;
      const seasonInj = (career.injuries[myTeam] || []).slice();
      const score = await launchGame(userTeam, aiTeam, home === myTeam, seasonInj);
      if (score === null) {
        cur.records = snapRecords;
        cur.results[wi] = snapResults;
        saveCareer();
        renderSeasonHub();
        showScreen("screen-season");
        return;
      }
      hs = score[home]; as = score[away];
      career.stats.gamesPlayed++;
      const my = home === myTeam ? hs : as, their = home === myTeam ? as : hs;
      if (my > their) career.stats.wins++; else if (their > my) career.stats.losses++; else career.stats.ties++;
      career.injuries[myTeam] = [...new Set([...(career.injuries[myTeam] || []), ...lastGameMajorInjuries])];
      saveCareer();
      addSeasonLine(TEAMS[away].abbr + " " + as + " — " + hs + " " + TEAMS[home].abbr + "  (your game)");
    } else {
      const s = quickLeagueGame(home, away);
      hs = s[home]; as = s[away];
      addSeasonLine("SIM: " + TEAMS[away].abbr + " " + as + " — " + hs + " " + TEAMS[home].abbr);
      await delay(120);
    }
    recordResult(cur.records, home, away, hs, as);
    cur.results[wi] = cur.results[wi] || [];
    cur.results[wi].push({ home, away, hs, as });
  }
  cur.week++;
  saveCareer();
  renderSeasonHub();
  showScreen("screen-season");
  await modal("Week " + (wi + 1) + " complete.\nYour record: " +
    cur.records[cur.userTeam].W + "-" + cur.records[cur.userTeam].L + "-" + cur.records[cur.userTeam].T + ".");
}

/* ================= Playoffs ================= */

function modal(text) {
  return new Promise(res => {
    $("#modal-text").textContent = text;
    $("#modal").classList.remove("hidden");
    $("#modal-ok").onclick = () => { $("#modal").classList.add("hidden"); res(); };
  });
}

async function playoffGame(a, b, round) {
  await modal(round + "\n" + TEAMS[a].abbr + " (home) vs " + TEAMS[b].abbr);
  let hs, as;
  if (a === cur.userTeam || b === cur.userTeam) {
    const userTeam = a === cur.userTeam ? a : b;
    const aiTeam = userTeam === a ? b : a;
    const seasonInj = (career.injuries[cur.userTeam] || []).slice();
    const score = await launchGame(userTeam, aiTeam, userTeam === a, seasonInj);
    if (score === null) throw { abort: true };
    hs = score[a]; as = score[b];
    career.stats.gamesPlayed++;
    const my = score[cur.userTeam], their = score[cur.userTeam === a ? b : a];
    if (my > their) career.stats.wins++; else if (their > my) career.stats.losses++; else career.stats.ties++;
    career.injuries[cur.userTeam] = [...new Set([...(career.injuries[cur.userTeam] || []), ...lastGameMajorInjuries])];
    saveCareer();
  } else {
    const s = quickLeagueGame(a, b);
    hs = s[a]; as = s[b];
    await modal("SIM: " + TEAMS[a].abbr + " " + hs + " — " + as + " " + TEAMS[b].abbr);
  }
  if (hs === as) {
    hs += 3;
    await modal("Tie game — " + TEAMS[a].abbr + " win in overtime.");
  }
  await modal("FINAL: " + TEAMS[a].abbr + " " + hs + " — " + as + " " + TEAMS[b].abbr +
              "\n" + (hs > as ? a : b) + " advance.");
  return hs > as ? a : b;
}

function seedsText(seeds) {
  return seeds.map((s, i) => (i + 1) + ". " + s).join("\n");
}

async function runPlayoffs() {
  cur = career.current;
  const afc = playoffTeams(cur.records, "AFC");
  const nfc = playoffTeams(cur.records, "NFC");
  await modal("AFC PLAYOFF SEEDS\n" + seedsText(afc));
  await modal("NFC PLAYOFF SEEDS\n" + seedsText(nfc));
  const confWinners = [];
  for (const [conf, seeds] of [["AFC", afc], ["NFC", nfc]]) {
    const w1 = await playoffGame(seeds[1], seeds[6], conf + " Wild Card");
    const w2 = await playoffGame(seeds[2], seeds[5], conf + " Wild Card");
    const w3 = await playoffGame(seeds[3], seeds[4], conf + " Wild Card");
    const seedNum = {};
    seeds.forEach((s, i) => seedNum[s] = i + 1);
    const winners = [w1, w2, w3];
    const lowest = winners.reduce((x, y) => seedNum[x] > seedNum[y] ? x : y);
    const others = winners.filter(w => w !== lowest);
    const d1 = await playoffGame(seeds[0], lowest, conf + " Divisional");
    const d2 = await playoffGame(others[0], others[1], conf + " Divisional");
    const pair = [d1, d2].sort((x, y) => seedNum[x] - seedNum[y]);
    confWinners.push(await playoffGame(pair[0], pair[1], conf + " Championship"));
  }
  const champion = await playoffGame(confWinners[0], confWinners[1], "SUPER BOWL");
  if (champion === cur.userTeam) career.stats.championships++;
  completeSeason(champion);
}

function rerollLeague() {
  // Offseason rolls: every team's six ratings drift by up to ±3 on the 3-18 scale.
  const before = {};
  for (const n in TEAMS) before[n] = teamRatings(n).ovr;
  for (const n in TEAMS) {
    const t = TEAMS[n];
    for (const k of STAT_NAMES) {
      const d = (1 + Math.floor(Math.random() * 6)) - (1 + Math.floor(Math.random() * 6));
      const key = k.toLowerCase();
      t[key] = Math.max(3, Math.min(18, t[key] + Math.max(-3, Math.min(3, d))));
    }
  }
  let riser = null, faller = null;
  for (const n in TEAMS) {
    const d = teamRatings(n).ovr - before[n];
    if (!riser || d > riser.d) riser = { n, d };
    if (!faller || d < faller.d) faller = { n, d };
  }
  return { riser, faller };
}

function completeSeason(champion) {
  const r = cur.records[cur.userTeam];
  const team = cur.userTeam;
  const seasonNo = cur.seasonNumber;
  const year = career.year || 1;
  const myTitles = career.history.filter(i => i.champion === i.team).length + (champion === team ? 1 : 0);
  career.history.push({
    season: seasonNo, year, team, W: r.W, L: r.L, T: r.T, PF: r.PF, PA: r.PA,
    champion, date: new Date().toISOString().slice(0, 10),
  });
  const rolls = rerollLeague();
  career.ratings = exportRatings();
  career.injuries[team] = [];
  career.seasonNumber = seasonNo + 1;
  career.careerTeam = team;
  career.current = null;
  cur = null;
  let endMsg = "";
  if (year >= 5) {
    // Five years in: career complete, summarize it and reset.
    endMsg = "\n\n5-YEAR CAREER COMPLETE" +
             "\nSeasons played: " + career.history.length +
             "\nSuper Bowl titles with your team: " + myTitles +
             "\n\nTap New Season to begin year 1 of a fresh career.";
    career.history = [];
    career.injuries = {};
    career.careerTeam = null;
    career.year = 1;
  } else {
    career.year = year + 1;
  }
  saveCareer();
  renderTitle();
  modal("SEASON " + seasonNo + " COMPLETE" +
        "\n" + team + ": " + r.W + "-" + r.L + "-" + r.T + " (year " + year + " of 5)" +
        "\nSuper Bowl champion: " + champion +
        "\n\nOFFSEASON ROLLS — all 32 teams re-rolled their ratings" +
        "\nBiggest riser: " + rolls.riser.n + " (OVR +" + rolls.riser.d + ")" +
        "\nBiggest faller: " + rolls.faller.n + " (OVR " + rolls.faller.d + ")" +
        endMsg)
    .then(() => showScreen("screen-title"));
}

/* ================= Info screens ================= */

function showInfo(html, backTo) {
  $("#info-body").innerHTML = html;
  infoBackTarget = backTo || "screen-title";
  showScreen("screen-info");
}
let infoBackTarget = "screen-title";
$("#info-back").onclick = () => showScreen(infoBackTarget);

$("#btn-teams").onclick = () => {
  let html = '<div class="panel-title">Teams &amp; Adapted Ratings</div>' +
             '<div class="muted" style="font-size:12px;margin-bottom:10px">QB / RB / WR / LM / LB / DB on the 3-18 scale, with roll modifiers in parentheses. Game adaptations, not official NFL ratings.</div>';
  for (const div in DIVISIONS) {
    html += '<div class="div-heading">' + div + '</div>';
    html += '<table class="info-table"><tr><th>Team</th><th>OFF</th><th>DEF</th><th>OVR</th><th>QB</th><th>RB</th><th>WR</th><th>LM</th><th>LB</th><th>DB</th></tr>';
    for (const n of DIVISIONS[div]) {
      const t = TEAMS[n];
      const r = teamRatings(n);
      html += '<tr><td class="chip-cell">' + chip(n) + n + '</td><td><b>' + r.off + '</b></td><td><b>' + r.def +
              '</b></td><td><b>' + r.ovr + '</b></td><td>' + t.qb + ' (' + bonus(t.qb) + ')</td><td>' + t.rb +
              ' (' + bonus(t.rb) + ')</td><td>' + t.wr + ' (' + bonus(t.wr) + ')</td><td>' + t.lm +
              ' (' + bonus(t.lm) + ')</td><td>' + t.lb + ' (' + bonus(t.lb) + ')</td><td>' + t.db +
              ' (' + bonus(t.db) + ')</td></tr>';
    }
    html += '</table>';
  }
  showInfo(html);
};

$("#btn-history").onclick = () => {
  let html = '<div class="panel-title">Career History</div>';
  const s = career.stats;
  html += '<div class="muted" style="font-size:12.5px;margin-bottom:10px">' +
    s.seasonsStarted + ' seasons started · ' + s.gamesPlayed + ' games played (' +
    s.wins + '-' + s.losses + '-' + s.ties + ') · ' + s.championships + ' championships</div>';
  if (!career.history.length) {
    html += '<div class="muted">No completed seasons yet. Start a season to build your career.</div>';
  } else {
    html += '<table class="info-table"><tr><th>Year</th><th>Season</th><th>Team</th><th>Record</th><th>Champion</th></tr>';
    for (const it of career.history) {
      html += '<tr><td>' + (it.year || '—') + '</td><td>' + it.season + '</td><td class="chip-cell">' + chip(it.team) + it.team +
              '</td><td>' + it.W + '-' + it.L + '-' + it.T + '</td><td class="chip-cell">' +
              chip(it.champion) + it.champion + '</td></tr>';
    }
    html += '</table>';
  }
  showInfo(html);
};

/* ================= Game screen controls ================= */

$("#speedBtn").onclick = () => {
  SPEED.fast = !SPEED.fast;
  $("#speedBtn").textContent = "Speed: " + (SPEED.fast ? "Fast" : "Normal");
};

$("#quitBtn").onclick = () => {
  if (pendingAsk) {
    const p = pendingAsk;
    pendingAsk = null;
    $("#prompt").innerHTML = "";
    p.reject({ abort: true });
  } else {
    quitRequested = true;
  }
};

/* ================= Title / init ================= */

function renderTitle() {
  $("#btn-continue").style.display = "block";
}

career = loadCareer();
applyRatings();
renderTitle();
showScreen("screen-welcome");
$("#btn-enter").onclick = () => showScreen("screen-title");
requestAnimationFrame(loop);