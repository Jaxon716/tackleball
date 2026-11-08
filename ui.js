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
// The ball's drawn orientation: it points along its travel direction (passes
// spiral to the receiver, runners tuck it in the direction they're going).
let ballAngle = 0, lastBallPt = null;

function animateBall(from, to, ms, yOffNorm, meta) {
  return new Promise(res => {
    const dur = ms || Math.min(2400, 800 + Math.abs(to - from) * 40);
    ballAnim.active = true;
    FIELD.returnerHold = null;
    FIELD.ballY = null;
    ballAnim.from = from; ballAnim.to = to;
    ballAnim.yOff = yOffNorm || 0;
    ballAnim.start = Date.now(); ballAnim.dur = dur;
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
        // The QB spreads it around: any eligible receiver is a target —
        // wideouts and slot backs, not just the widest man every play.
        const eligible = [];
        for (let i = 0; i < form.length; i++) {
          if (i === qbIdx) continue;
          if (Math.abs(form[i][0]) > 0.6 || (Math.abs(form[i][0]) >= 0.4 && form[i][1] <= -3)) eligible.push(i);
        }
        carrierIdx = eligible[Math.floor(Math.random() * eligible.length)];
      }
      const fromPt = (arr, i) => {
        const p = arr[i];
        let x = G.losX + G.dirOff * p[1] * 10;
        x = Math.max(6, Math.min(G.w - 6, x));
        return [x, G.ht / 2 + p[0] * G.ht * 0.44];
      };
      // The catch spot sits near the receiver's alignment — wide receivers
      // make catches near the numbers and sideline, not middle-of-the-field.
      const carrierFrom = fromPt(form, carrierIdx);
      const catchY = Math.max(G.ht * 0.1, Math.min(G.ht * 0.9,
        carrierFrom[1] + (Math.random() - 0.5) * G.ht * 0.08));
      const ballEnd = [G.X(to), catchY];
      const qbFrom = fromPt(form, qbIdx);
      const snapT = 0.12;
      const throwT = meta.kind === "pass" ? 0.45 : 0.24;
      // Route book: every route is a stem downfield, then a break. Slants
      // angle inside, outs flatten to the sideline, posts climb and cut in,
      // curls come back to the QB, and streaks hug the sideline.
      const routeEnds = {}; // offensive index → final point, so corners can shadow
      const stemPt = (f, d, y) => [f[0] + G.dirOff * d, f[1] + y];
      const pickRoute = (f) => {
        const kinds = ["slant", "slant", "out", "post", "go", "go", "curl", "flat"];
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        const outS = f[1] >= G.ht / 2 ? 1 : -1; // toward the receiver's own sideline
        const inS = -outS;
        if (kind === "slant") {
          const stem = stemPt(f, 25 + Math.random() * 20, outS * 6);
          return { via: stem, viaT: 0.4,
            to: [stem[0] + G.dirOff * (25 + Math.random() * 40),
                 stem[1] + inS * (30 + Math.random() * 50)] };
        } else if (kind === "out") {
          const stem = stemPt(f, 18 + Math.random() * 15, 0);
          return { via: stem, viaT: 0.45,
            to: [stem[0] + G.dirOff * (5 + Math.random() * 15),
                 Math.max(G.ht * 0.08, Math.min(G.ht * 0.92, f[1] + outS * (35 + Math.random() * 45)))] };
        } else if (kind === "post") {
          const stem = stemPt(f, 55 + Math.random() * 35, outS * 10);
          return { via: stem, viaT: 0.5,
            to: [stem[0] + G.dirOff * (45 + Math.random() * 50),
                 stem[1] + inS * (50 + Math.random() * 60)] };
        } else if (kind === "go") {
          // Deep streak hugging the sideline — a dead straight line.
          return { via: null, straight: true, to: [f[0] + G.dirOff * (120 + Math.random() * 80),
                 f[1] + outS * (3 + Math.random() * 10)] };
        } else if (kind === "curl") {
          const stem = stemPt(f, 45 + Math.random() * 30, outS * 8);
          return { via: stem, viaT: 0.5,
            to: [stem[0] - G.dirOff * (8 + Math.random() * 15),
                 stem[1] + inS * (8 + Math.random() * 18)] };
        } else { // flat: burst to the sideline immediately
          return { via: null,
            to: [f[0] + G.dirOff * (4 + Math.random() * 10),
                 Math.max(G.ht * 0.08, Math.min(G.ht * 0.92, f[1] + outS * (55 + Math.random() * 35)))] };
        }
      };
      // Whole-formation organic movement: receivers run real routes with a
      // stem and a break, the QB drops back, linemen jostle, backs leak out
      // on check-downs, and the defense plays coverage instead of mobbing.
      const offMoves = [], defMoves = [];
      form.forEach((p, i) => {
        if (i === carrierIdx) return;
        const from = fromPt(form, i);
        let to, via = null, viaT = 0.45;
        let bul = (Math.random() - 0.5) * G.ht * 0.12;
        if (i === qbIdx) {
          // QB drops back a step on passes, stays put on runs
          const drop = meta.kind === "pass" ? 10 : 3;
          to = [from[0], from[1] - G.dirOff * drop];
        } else if (Math.abs(p[0]) > 0.6 || (meta.kind === "pass" && p[1] <= -3 && Math.random() < 0.5)) {
          // Wide receivers run real routes; backs leak out on passes.
          // On runs, receivers fire upfield as downfield blockers.
          if (meta.kind === "run") {
            via = [from[0] + G.dirOff * 12, from[1]];
            viaT = 0.3;
            to = [from[0] + G.dirOff * (35 + Math.random() * 25),
                  from[1] + (p[0] >= 0 ? 1 : -1) * (6 + Math.random() * 14)];
          } else {
            const R = pickRoute(from);
            via = R.via; to = R.to; viaT = R.viaT || 0.45;
            if (R.straight) bul = 0; // streaks run dead straight
          }
          routeEnds[i] = to;
        } else if (meta.kind === "run" && p[1] <= -3) {
          // Lead blocker: flow toward the hole at the line
          to = [from[0] + G.dirOff * (14 + Math.random() * 10),
                from[1] + (Math.random() - 0.5) * 20];
        } else {
          // Linemen and backs jostle around their spots
          to = [from[0] + (Math.random() - 0.5) * 14,
                from[1] + G.dirOff * Math.random() * 8];
        }
        offMoves.push({ i, from, to, via, viaT, delay: Math.random() * 0.1,
                        bulge: bul });
      });
      // The ball carrier runs his own route: on passes a stem then the break
      // to where the ball is thrown; on runs a jump cut through the hole.
      let carrierVia = null, carrierViaT = 0, carrierVia2 = null, carrierViaT2 = 0;
      if (meta.kind === "pass") {
        const depth = (ballEnd[0] - carrierFrom[0]) * G.dirOff;
        const stemD = Math.min(Math.max(depth * 0.45, 20), 55);
        carrierVia = [carrierFrom[0] + G.dirOff * stemD,
          carrierFrom[1] + (ballEnd[1] - carrierFrom[1]) * 0.15 + (Math.random() - 0.5) * 10];
        carrierViaT = 0.35 + Math.random() * 0.15;
      } else {
        // Two organic cuts: plant and slash through the first hole, then
        // bend again — the runner weaves, he doesn't skate a straight line.
        const dx = ballEnd[0] - carrierFrom[0], dy = ballEnd[1] - carrierFrom[1];
        carrierVia = [carrierFrom[0] + dx * 0.35 + (Math.random() - 0.5) * 18,
          carrierFrom[1] + dy * 0.35 + (Math.random() - 0.5) * G.ht * 0.14];
        carrierViaT = 0.3 + Math.random() * 0.15;
        carrierVia2 = [carrierFrom[0] + dx * 0.7 + (Math.random() - 0.5) * 20,
          carrierFrom[1] + dy * 0.7 + (Math.random() - 0.5) * G.ht * 0.12];
        carrierViaT2 = 0.55 + Math.random() * 0.2;
      }
      routeEnds[carrierIdx] = ballEnd;
      // The chase down: the three nearest defenders converge all the way in
      // and wrap up the carrier as the play ends.
      const tacklers = FIELD.formation.def
        .map((_, i) => i)
        .sort((a, b) => {
          const fa = fromPt(FIELD.formation.def, a), fb = fromPt(FIELD.formation.def, b);
          return Math.hypot(ballEnd[0] - fa[0], ballEnd[1] - fa[1]) -
                 Math.hypot(ballEnd[0] - fb[0], ballEnd[1] - fb[1]);
        })
        .slice(0, 3);
      FIELD.formation.def.forEach((p, i) => {
        const from = fromPt(FIELD.formation.def, i);
        const lateral = Math.abs(p[0]);
        const depth = p[1];
        let to, via = null, viaT = 0.45;
        const rank = tacklers.indexOf(i);
        if (rank >= 0) {
          // Tackle: the chase down finishes in a pile — the three nearest
          // defenders wrap around the ball as the play ends.
          const wrap = [[-8, 2], [8, 2], [0, -9]][rank];
          via = [(from[0] + ballEnd[0]) / 2, (from[1] + ballEnd[1]) / 2 + (Math.random() - 0.5) * 14];
          viaT = 0.35 + Math.random() * 0.15;
          to = [ballEnd[0] + wrap[0] + (Math.random() - 0.5) * 6,
                ballEnd[1] + wrap[1] + (Math.random() - 0.5) * 6];
        } else if (meta.kind === "pass" && lateral > 0.5) {
          // Corner / nickel: cover the nearest receiver — trail him a step
          // behind and outside, so his slant or post gets shadowed.
          let best = null, bestD = 1e9;
          for (const jStr of Object.keys(routeEnds)) {
            const j = +jStr;
            const rFrom = fromPt(form, j);
            const d = Math.hypot(rFrom[0] - from[0], rFrom[1] - from[1]);
            if (d < bestD) { bestD = d; best = routeEnds[j]; }
          }
          if (best) {
            const trail = [best[0] - G.dirOff * (6 + Math.random() * 8),
              best[1] + (from[1] > best[1] ? 1 : -1) * (8 + Math.random() * 10)];
            const k = 0.55 + Math.random() * 0.3;
            to = [from[0] + (trail[0] - from[0]) * k,
                  from[1] + (trail[1] - from[1]) * k];
          } else {
            to = [from[0] + (ballEnd[0] - from[0]) * 0.4,
                  from[1] + (ballEnd[1] - from[1]) * 0.4];
          }
        } else if (meta.kind === "pass" && depth >= 9) {
          // Deep safety: cushion over the top, then break on the ball late
          via = [from[0] + G.dirOff * (15 + Math.random() * 20),
            from[1] + (Math.random() - 0.5) * 30];
          const k = 0.35 + Math.random() * 0.3;
          to = [via[0] + (ballEnd[0] - via[0]) * k,
                via[1] + (ballEnd[1] - via[1]) * k];
          viaT = 0.55;
        } else if (meta.kind === "pass" && depth <= 6) {
          if (Math.random() < 0.45) {
            // Pass rush: burst upfield and collapse on the QB
            to = [from[0] + G.dirOff * (8 + Math.random() * 14),
                  from[1] + (qbFrom[1] - from[1]) * 0.6];
          } else {
            // Zone drop: settle into a hook zone, then drift toward the ball
            via = [from[0] + G.dirOff * (12 + Math.random() * 18),
              from[1] + (Math.random() - 0.5) * 26];
            const k = 0.3 + Math.random() * 0.3;
            to = [via[0] + (ballEnd[0] - via[0]) * k,
                  via[1] + (ballEnd[1] - via[1]) * k];
            viaT = 0.45;
          }
        } else {
          // Run defense: flow to the ball — the nearest three go all the way
          // in for the tackle, the rest shade toward it.
          const dist = Math.hypot(ballEnd[0] - from[0], ballEnd[1] - from[1]);
          const k = dist < G.w * 0.35 ? 0.85 + Math.random() * 0.15 : 0.25 + Math.random() * 0.5;
          to = [from[0] + (ballEnd[0] - from[0]) * k,
                from[1] + (ballEnd[1] - from[1]) * k];
        }
        defMoves.push({ i, from, to, via, viaT, delay: Math.random() * 0.15,
                        bulge: (Math.random() - 0.5) * G.ht * 0.12 });
      });
      ballAnim.anim = {
        kind: meta.kind, snapT, throwT,
        carrierIn: "off", qbIdx, carrierIdx, dirOff: G.dirOff,
        losPt: [G.X(from), G.ht / 2],
        qbFrom, carrierFrom,
        carrierVia, carrierViaT, carrierVia2, carrierViaT2,
        carrierTo: ballEnd,
        bulge: (Math.random() - 0.5) * G.ht * 0.16,
        offMoves, defMoves, pursuers: [],
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
    setTimeout(() => {
      const fin = ballAnim.anim;
      ballAnim.active = false; ballAnim.anim = null; FIELD.ball = to; res();
      // After a kick, pin the returner's helmet to the landing spot — he
      // stands exactly where the ball is while you decide fair catch or return.
      if (fin && fin.kind === "kick" && fin.drift) {
        FIELD.returnerHold = { side: fin.drift.side, idx: fin.drift.idx, pt: fin.drift.to };
        FIELD.ballY = fin.drift.to[1];
      }
    }, dur);
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

/* ================= Sound (generated in-browser — no audio files) ================= */
let soundOn = true;
try { soundOn = localStorage.getItem("tb_sound") !== "off"; } catch (e) {}
let audioCtx = null;
function ensureAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) {}
}
function tone(freq, dur, type, vol, when) {
  if (!audioCtx) return;
  const t0 = (when || 0) + audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type || "sine"; o.frequency.value = freq;
  g.gain.setValueAtTime(vol || 0.08, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function noiseBurst(dur, vol, from, to) {
  if (!audioCtx) return;
  const len = Math.floor(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const f = audioCtx.createBiquadFilter();
  f.type = "bandpass";
  const t0 = audioCtx.currentTime;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.linearRampToValueAtTime(to, t0 + dur);
  f.Q.value = 1.2;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(audioCtx.destination);
  src.start();
}
function sfx(name) {
  if (!soundOn) return;
  ensureAudio();
  if (!audioCtx) return;
  try {
    if (name === "whistle") noiseBurst(0.3, 0.05, 2200, 2600);
    else if (name === "tick") tone(1900, 0.04, "square", 0.04);
    else if (name === "roar") noiseBurst(1.5, 0.1, 300, 900);
    else if (name === "ooh") { tone(330, 0.4, "sine", 0.08); tone(262, 0.5, "sine", 0.06, 0.15); }
    else if (name === "chime") { tone(523, 0.12, "sine", 0.07); tone(659, 0.12, "sine", 0.07, 0.12); tone(784, 0.2, "sine", 0.07, 0.24); }
  } catch (e) {}
}

// The carrier's exact position at time t — used for BOTH his helmet and the
// ball, so the ball stays glued to him from the catch to the tackle.
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function carrierPosAt(A, t) {
  const tRun = A.snapT ? Math.max(0, Math.min(1, (t - A.snapT) / (1 - A.snapT))) : t;
  // The carrier runs his route — stem, break, and on runs a second cut.
  if (A.carrierVia && tRun < A.carrierViaT) {
    return curvePos(A.carrierFrom, A.carrierVia, easeInOut(tRun / A.carrierViaT), A.bulge);
  } else if (A.carrierVia2 && tRun < A.carrierViaT2) {
    const fx = A.carrierVia || A.carrierFrom, ft = A.carrierVia ? A.carrierViaT : 0;
    return curvePos(fx, A.carrierVia2, easeInOut((tRun - ft) / (A.carrierViaT2 - ft)), (A.bulge || 0) * 0.7);
  } else if (A.carrierVia) {
    const fx = A.carrierVia2 || A.carrierVia, ft = A.carrierVia2 ? A.carrierViaT2 : A.carrierViaT;
    return curvePos(fx, A.carrierTo, easeInOut((tRun - ft) / (1 - ft)), (A.bulge || 0) * 0.6);
  }
  return curvePos(A.carrierFrom, A.carrierTo, easeInOut(tRun), A.bulge);
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
      const t = Math.min(1, (Date.now() - ballAnim.start) / ballAnim.dur);
      const tC = 1 - Math.pow(1 - t, 3); // ease-out on the carrier
      // Whole-squad organic movement: every helmet walks its own curved
      // path (routes, drops, jostles, pursuit flow) once the ball is snapped.
      const applyMoves = (moves, over) => {
        for (const M of moves || []) {
          const raw = Math.max(0, Math.min(1, (t - M.delay) / (1 - M.delay)));
          // Two-stage paths: a route's stem, then its break.
          if (M.via && raw < M.viaT) {
            over[M.i] = curvePos(M.from, M.via, easeInOut(raw / M.viaT), M.bulge);
          } else if (M.via) {
            over[M.i] = curvePos(M.via, M.to, easeInOut((raw - M.viaT) / (1 - M.viaT)), (M.bulge || 0) * 0.6);
          } else {
            over[M.i] = curvePos(M.from, M.to, easeInOut(raw), M.bulge);
          }
        }
      };
      applyMoves(A.offMoves, overOff);
      applyMoves(A.defMoves, overDef);
      const carrierOver = A.carrierIn === "def" ? overDef : overOff;
      // The carrier waits for the snap, then carries the ball downfield — the
      // ball is drawn from this same position, so it stays glued to him.
      if (!A.arc) carrierOver[A.carrierIdx] = carrierPosAt(A, t);
      for (const P of A.pursuers) {
        const tt = Math.max(0, Math.min(1, (t - P.delay) / (1 - P.delay)));
        const over = P.i !== undefined ? (A.carrierIn === "def" ? overOff : overDef) : null;
        if (over) over[P.i] = curvePos(P.from, P.to, tt, P.bulge);
      }
      if (A.drift) {
        const over = A.drift.side === "def" ? overDef : overOff;
        over[A.drift.idx] = curvePos(A.drift.from, A.drift.to, tC, 0);
      }
    } else if (FIELD.returnerHold) {
      // No play running: the returner stands exactly where he caught the kick.
      (FIELD.returnerHold.side === "off" ? overOff : overDef)[FIELD.returnerHold.idx] = FIELD.returnerHold.pt;
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
    const t = Math.min(1, (Date.now() - ballAnim.start) / ballAnim.dur);
    const e = 1 - Math.pow(1 - t, 3);
    if (ballAnim.anim) {
      // Live play: the ball rides with the carrier, arcs QB → receiver, or
      // booms downfield off the kicker's foot.
      const A = ballAnim.anim;
      if (A.kind === "kick") {
        bx = A.carrierFrom[0] + (A.carrierTo[0] - A.carrierFrom[0]) * e;
        by = A.carrierFrom[1] + (A.carrierTo[1] - A.carrierFrom[1]) * e
           - Math.sin(t * Math.PI) * ht * (A.arcHt || 0.22);
      } else if (A.kind === "pass" || A.kind === "run") {
        // Snap → throw/handoff → carry: the ball first pops to the QB, then
        // flies (pass) or is handed off (run), then rides the carrier — drawn
        // from the carrier's own position so it never separates from him.
        if (t < A.snapT) {
          const st = t / A.snapT;
          bx = A.losPt[0] + (A.qbFrom[0] - A.losPt[0]) * st;
          by = A.losPt[1] + (A.qbFrom[1] - A.losPt[1]) * st;
        } else if (A.kind === "pass" && t < A.throwT) {
          const ct = (t - A.snapT) / (A.throwT - A.snapT);
          const catchPt = carrierPosAt(A, A.throwT);
          bx = A.qbFrom[0] + (catchPt[0] - A.qbFrom[0]) * ct;
          by = A.qbFrom[1] + (catchPt[1] - A.qbFrom[1]) * ct - Math.sin(ct * Math.PI) * ht * 0.12;
        } else if (t < A.throwT) {
          // Handoff: ball travels from the QB into the runner's grasp.
          const ht2 = (t - A.snapT) / (A.throwT - A.snapT);
          const cp = carrierPosAt(A, t);
          bx = A.qbFrom[0] + (cp[0] - A.qbFrom[0]) * ht2;
          by = A.qbFrom[1] + (cp[1] - A.qbFrom[1]) * ht2;
        } else {
          // Carry phase: the ball is tucked in the carrier's arm —
          // drawn from the exact same position as his helmet, so it sticks.
          const cp = carrierPosAt(A, t);
          bx = cp[0] - 5 * ((A.carrierTo[0] >= A.carrierFrom[0]) ? 1 : -1);
          by = cp[1] + 4;
        }
      } else {
        // Returns (punts/kickoffs/INTs/fumbles): same glue to the returner.
        const cp = carrierPosAt(A, t);
        bx = cp[0] - 5 * ((A.carrierTo[0] >= A.carrierFrom[0]) ? 1 : -1);
        by = cp[1] + 4;
      }
    } else {
      const b = ballAnim.from + (ballAnim.to - ballAnim.from) * e;
      bx = X(b);
      by = ht / 2 + ballAnim.yOff * ht * e;
    }
  }
  if (bx == null) {
    bx = X(FIELD.ball);
    by = (FIELD.ballY != null ? FIELD.ballY : ht / 2);
    ballAngle = 0; lastBallPt = null;
  }
  bx = Math.max(8, Math.min(w - 8, bx));
  // The ball points where it's going — spiral on a throw, tucked on a run.
  if (lastBallPt) {
    const dx = bx - lastBallPt[0], dy = by - lastBallPt[1];
    if (dx * dx + dy * dy > 0.25) ballAngle = Math.atan2(dy, dx);
  } else {
    ballAngle = 0;
  }
  lastBallPt = [bx, by];
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(ballAngle);
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
  // Tackle flash: a white burst at the ball as the chase down ends.
  if (ballAnim.active && ballAnim.anim && (ballAnim.anim.kind === "run" || ballAnim.anim.kind === "pass")) {
    const tt = Math.min(1, (Date.now() - ballAnim.start) / ballAnim.dur);
    if (tt > 0.9) {
      const k = (tt - 0.9) / 0.1;
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255," + (0.85 * (1 - k)).toFixed(3) + ")";
      ctx.lineWidth = 2 + 2 * k;
      ctx.beginPath();
      ctx.arc(bx, by, 6 + 26 * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function loop() {
  if (!$("#screen-game").classList.contains("hidden")) drawField();
  requestAnimationFrame(loop);
}

/* ================= Presentation hooks for the engine ================= */

let pendingAsk = null;
let quitRequested = false;

function addFeed(text, cls) {
  if (cls === "dice") sfx("tick");
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
  if (/NO GOOD!|FUMBLE!|INTERCEPTED!|SAFETY!/.test(text)) sfx("ooh");
  else if (/TOUCHDOWN!|GOOD!|COVERED!/.test(text)) sfx("roar");
  else if (/AUTOMATIC FIRST DOWN/.test(text)) sfx("chime");
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
        const carried = (t.seasonInjuries || []).includes(k) && M;
        if (m) parts.push("minor ×" + m + " (rest of game)");
        if (M) parts.push("major ×" + M + " (rest of season" + (carried ? ", injured earlier this season" : "") + ")");
        const nm = rosterName(t.name, k);
        return (nm ? nm + " — " : "") + parts.join(", ") + " — modifier −" + (m + M);
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

// Pre-game matchup card: both teams face off with team ratings, position
// ratings, season records and injuries — shown right before the coin toss.
function injLine(t) {
  const bad = [];
  if (t.majorInjuries.length) bad.push("OUT: " + t.majorInjuries.join(", "));
  if (t.minorInjuries.length) bad.push("banged up: " + t.minorInjuries.join(", "));
  if (!bad.length) return "";
  return '<div style="font-size:12px;margin:4px 0;color:#ffb3b3">' + TEAMS[t.name].abbr +
    " — " + bad.join(" · ") + '</div>';
}
function posCell(t, k) {
  const v = TEAMS[t.name][k.toLowerCase()];
  let s = '<b>' + v + '</b> <span class="muted">(' + bonus(v) + ')</span>';
  const P = k.toUpperCase();
  if (t.majorInjuries.indexOf(P) >= 0) s += ' <span style="color:#ff8f8f">OUT</span>';
  else if (t.minorInjuries.indexOf(P) >= 0) s += ' <span style="color:#ffd77a">banged up</span>';
  career.stars = career.stars || {};
  if (career.stars[P] === t.name) s += ' <span style="color:#ffd400">★ STAR</span>';
  const nm = rosterName(t.name, P);
  if (nm) s += ' <span class="muted">' + nm.split(" ").pop() + '</span>';
  return s;
}
function recordCell(n) {
  if (!cur || !cur.records) return "—";
  const r = cur.records[n];
  if (!r) return "—";
  return r.W + "-" + r.L + "-" + r.T + " (PF " + r.PF + ", PA " + r.PA + ")";
}
function matchupHtml(game) {
  const u = game.user, a = game.ai;
  const ru = teamRatings(u.name), ra = teamRatings(a.name);
  let html = '<div class="panel-title">' + TEAMS[u.name].abbr + " at " + TEAMS[a.name].abbr + '</div>';
  html += '<div style="text-align:center;margin-bottom:8px">' + chip(u.name) + " " + u.name +
    " <b>vs</b> " + chip(a.name) + " " + a.name + '</div>';
  html += '<table class="info-table">' +
    '<tr><th></th><th>' + TEAMS[u.name].abbr + '</th><th>' + TEAMS[a.name].abbr + '</th></tr>' +
    '<tr><td class="chip-cell">Record</td><td>' + recordCell(u.name) + '</td><td>' + recordCell(a.name) + '</td></tr>' +
    '<tr><td class="chip-cell">OFF</td><td><b>' + ru.off + '</b> (' + ru.offMod + ')</td><td><b>' + ra.off + '</b> (' + ra.offMod + ')</td></tr>' +
    '<tr><td class="chip-cell">DEF</td><td><b>' + ru.def + '</b> (' + ru.defMod + ')</td><td><b>' + ra.def + '</b> (' + ra.defMod + ')</td></tr>' +
    '<tr><td class="chip-cell">OVR</td><td><b>' + ru.ovr + '</b> (' + ru.ovrMod + ')</td><td><b>' + ra.ovr + '</b> (' + ra.ovrMod + ')</td></tr>';
  for (const k of ["QB", "RB", "WR", "LM", "LB", "DB"]) {
    html += '<tr><td class="chip-cell">' + k + '</td><td>' + posCell(u, k) + '</td><td>' + posCell(a, k) + '</td></tr>';
  }
  html += '</table>';
  html += injLine(u) + injLine(a);
  return html;
}
function showMatchupModal(game) {
  return new Promise(res => {
    const t = $("#modal-text");
    const ok = $("#modal-ok");
    const oldOk = ok.textContent;
    t.innerHTML = matchupHtml(game);
    ok.textContent = "Ready — kick it off!";
    ok.classList.remove("hidden");
    $("#modal").classList.remove("hidden");
    ok.onclick = () => {
      $("#modal").classList.add("hidden");
      ok.textContent = oldOk;
      t.textContent = "";
      res();
    };
  });
}

const pres = {
  game: null,
  async say(text, cls) { addFeed(text, cls); await delay(L()); },
  async banner(text, cls, ms) { await showBanner(text, cls, ms); },
  async showMatchup(g) { await showMatchupModal(g); },
  async moveBall(from, to, ms, yOffNorm, meta) { await animateBall(from, to, ms, yOffNorm, meta); },
  setEndZones(leftTeam, rightTeam) { FIELD.left = leftTeam; FIELD.right = rightTeam; },
  setPossession(team) { FIELD.off = team; },
  setFormation(offType, defType) {
    FIELD.formation = {
      off: FORMATIONS.off[offType] || FORMATIONS.off.run,
      def: FORMATIONS.def[defType] || FORMATIONS.def.run,
    };
    FIELD.offForm = offType;
    // A new alignment means a new play — the returner re-lines up too.
    FIELD.returnerHold = null;
    FIELD.ballY = null;
    sfx("whistle");
  },
  setField(los, firstDown, ball) {
    if (los != null) FIELD.los = los;
    FIELD.firstDown = (firstDown == null) ? FIELD.los : firstDown;
    FIELD.ball = (ball != null) ? ball : FIELD.los;
    // The arrow follows the offense's driving direction — during kicks (where
    // the first-down marker sits on the LOS) that's the only reliable signal.
    FIELD.dir = FIELD.off ? (FIELD.off === FIELD.left ? 1 : -1)
              : (FIELD.firstDown >= FIELD.los ? 1 : -1);
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
  // Remember which injuries were carried in from earlier in the season, so
  // the halftime/final reports can tell them apart from this game's injuries.
  game.user.seasonInjuries = (seasonInjuries || []).slice();
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
        d.draftPick = d.draftPick || null;
        d.money = d.money || {};
        d.markets = d.markets || {};
        d.stars = d.stars || {};
        d.starNames = d.starNames || {};
        d.offseason = d.offseason || null;
        d.injuries = d.injuries || {};
        d.stats = Object.assign({ seasonsStarted: 0, gamesPlayed: 0, wins: 0, losses: 0, ties: 0, championships: 0 }, d.stats || {});
        return d;
      }
    }
  } catch (e) {}
  return { careerTeam: null, seasonNumber: 1, ratings: {}, history: [], current: null, year: 1, draftPick: null,
    money: {}, markets: {}, stars: {}, starNames: {}, offseason: null,
    injuries: {}, stats: { seasonsStarted: 0, gamesPlayed: 0, wins: 0, losses: 0, ties: 0, championships: 0 } };
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

function openTeamSelect(title, exclude, cb, backFn, blind) {
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
    if (blind) {
      // A new career rolls every roster from dice — nothing is pre-built.
      b.innerHTML = '<span class="tc-abbr">' + t.abbr + '</span><span class="tc-name">' + name + '</span>' +
        '<span class="tc-ratings"><span class="rc-chip">roster rolls on 3d6 after you pick</span></span>';
    } else {
      const r = teamRatings(name);
      b.innerHTML = '<span class="tc-abbr">' + t.abbr + '</span><span class="tc-name">' + name + '</span>' +
        '<span class="tc-ratings"><span class="rc-chip">OFF ' + r.off + ' (' + r.offMod + ')</span>' +
        '<span class="rc-chip">DEF ' + r.def + ' (' + r.defMod + ')</span>' +
        '<span class="rc-chip ovr" style="background:' + t.alt + ';color:' + t.text + '">OVR ' + r.ovr + ' (' + r.ovrMod + ')</span></span>';
    }
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
  // Home or away is your call: it changes the action dice (4 vs 3) and
  // which end zone you defend.
  const userHome = await choose("EXHIBITION: " + TEAMS[user].abbr + " vs " + TEAMS[opp].abbr +
    " — where are you playing?", [
    { label: "HOME game — your stadium, 4 action dice", value: true },
    { label: "AWAY game — their stadium, 3 action dice", value: false }]);
  await launchGame(user, opp, userHome);
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

// Pen & Paper team creation: every rating rolls 3d6 on the 3-18 scale.
function roll3d6() {
  const dice = [1, 2, 3].map(() => 1 + Math.floor(Math.random() * 6));
  return { dice, total: dice.reduce((a, b) => a + b, 0) };
}

// Team creation at the start of a career, in the rulebook's order: you pick
// your team, roll YOUR six positions live (dice shown, one mulligan), then
// watch the rest of the league roll its rosters division by division before
// the season begins.
function rollLine(k, r) {
  return k + ": [" + r.dice.join(", ") + "] = " + r.total;
}
function rosterText(rolls) {
  return STAT_NAMES.map(k => rollLine(k, rolls[k])).join("\n");
}
async function teamCreation(team, offseasonPick) {
  // YOUR ROSTER: roll each position, one at a time.
  const rolls = {};
  for (const k of STAT_NAMES) {
    rolls[k] = roll3d6();
    TEAMS[team][k.toLowerCase()] = rolls[k].total;
    await modal("YOUR ROSTER — " + team + "\n\nRolling your " + k + "...\n\n" + rollLine(k, rolls[k]));
  }
  const mull = await choose("One mulligan — re-roll a position?\n\nYOUR ROSTER:\n" + rosterText(rolls),
    STAT_NAMES.map(k => ({ label: "Re-roll " + k, value: k }))
      .concat([{ label: "Keep this roster", value: null }]));
  if (mull) {
    rolls[mull] = roll3d6();
    TEAMS[team][mull.toLowerCase()] = rolls[mull].total;
    await modal("MULLIGAN — " + mull + " re-rolled:\n\n" + rollLine(mull, rolls[mull]) +
                "\n\nYOUR ROSTER:\n" + rosterText(rolls));
  }
  // THE LEAGUE ROLLS: every other team rolls its roster, division by division.
  for (const div in DIVISIONS) {
    let msg = div.toUpperCase() + " — ROSTER ROLLS\n";
    for (const n of DIVISIONS[div]) {
      if (n === team) { msg += "\n" + n + " — your roster (already rolled)"; continue; }
      const rr = {};
      for (const k of STAT_NAMES) {
        rr[k] = roll3d6();
        TEAMS[n][k.toLowerCase()] = rr[k].total;
      }
      msg += "\n" + n + ": " + STAT_NAMES.map(k => k + " " + rr[k].total).join(", ") +
             "  (OVR " + teamRatings(n).ovr + ")";
    }
    await modal(msg);
  }
  // Reigning star players report to camp: +2 to their position for the season.
  career.stars = career.stars || {};
  for (const pos of POS_LIST) {
    const holder = career.stars[pos];
    if (holder && TEAMS[holder]) {
      TEAMS[holder][pos.toLowerCase()] = Math.min(18, TEAMS[holder][pos.toLowerCase()] + 2);
    }
  }
  // THE OFF-SEASON, for a continuing career: fan bases, revenue, events for
  // the worst teams, development dice, then the draft and free agency — all
  // played out on top of the fresh rolls, exactly like the rulebook.
  if (offseasonPick) await offseasonSeason(team, offseasonPick);
  career.ratings = exportRatings();
}

function renderSeasonHub() {
  cur = career.current;
  const r = cur.records[cur.userTeam];
  // The season's length comes from its schedule: the real 2026 slate is 18
  // weeks with one bye per team, a generated season is 17.
  const totalWeeks = (cur.schedule || []).length || 17;
  const weekGames = cur.schedule[cur.week] || [];
  const myGame = cur.week < totalWeeks
    ? weekGames.find(g => g[0] === cur.userTeam || g[1] === cur.userTeam) || null
    : null;
  const onBye = cur.week < totalWeeks && !myGame;
  $("#season-head").innerHTML =
    '<div class="sh-line">YEAR ' + (career.year || 1) + ' OF 5 · SEASON ' + cur.seasonNumber + ' — ' + cur.userTeam + '</div>' +
    '<div class="sh-record">YOUR SEASON: ' + r.W + '-' + r.L + '-' + r.T + ' · PF ' + r.PF + ' · PA ' + r.PA +
    ' · BANKED $' + ((career.money && career.money[cur.userTeam]) || 0) + 'M</div>' +
    ((career.injuries[cur.userTeam] || []).length ?
      '<div class="sh-record" style="color:#ff8f8f">SEASON INJURIES: ' + career.injuries[cur.userTeam].join(", ") + '</div>' : '') +
    (cur.scheduleLabel ? '<div class="sh-record">' + cur.scheduleLabel + '</div>' : '') +
    '<div class="sh-week">' + (cur.week < totalWeeks
      ? "WEEK " + (cur.week + 1) + " OF " + totalWeeks + (onBye ? " · BYE WEEK" : "")
      : "REGULAR SEASON COMPLETE") + '</div>';
  const body = $("#season-body");
  body.innerHTML = "";
  if (cur.week < totalWeeks) {
    const box = h("div", null);
    box.appendChild(h("div", "group-label", "WEEK " + (cur.week + 1) + " MATCHUPS"));
    for (const g of weekGames) {
      const mine = g[0] === cur.userTeam || g[1] === cur.userTeam;
      box.appendChild(h("div", "match-line", g[1] + " at " + g[0] + (mine ? "  —  YOUR GAME" : "")));
    }
    if (onBye) {
      box.appendChild(h("div", "match-line", "Your " + TEAMS[cur.userTeam].abbr +
        " are on a bye this week — the rest of the league plays on."));
    }
    body.appendChild(box);
    const btn = h("button", "menu-btn", onBye
      ? "Advance Through Bye Week " + (cur.week + 1)
      : "Play Week " + (cur.week + 1));
    btn.onclick = playWeek;
    body.appendChild(btn);
  } else {
    const btn = h("button", "menu-btn", "Start Playoffs");
    btn.onclick = () => {
      // Quitting playoffs rewinds the career tally, so replaying the
      // playoffs never counts a round's win or loss twice.
      const snapStats = JSON.parse(JSON.stringify(career.stats));
      runPlayoffs().catch(e => {
        if (e && e.abort) { career.stats = snapStats; saveCareer(); }
        else console.error(e);
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
  // Every new season starts from dice: the cards stay blind, you roll your
  // roster live, and the league rolls fresh rosters too. A continuing career
  // then plays its offseason market (retirements, draft, free agency) on top.
  openTeamSelect("Choose your franchise", null, async team => {
    career.injuries = career.injuries || {};
    career.stats = career.stats || { seasonsStarted: 0, gamesPlayed: 0, wins: 0, losses: 0, ties: 0, championships: 0 };
    const fresh = !career.careerTeam;
    career.careerTeam = team;
    if (fresh) career.year = 1;
    career.injuries[team] = [];
    career.stats.seasonsStarted++;
    if (fresh) {
      career.draftPick = null;
      await teamCreation(team);
    } else {
      // The draft order was set by last season's record (stored at season end).
      await teamCreation(team, career.draftPick || 17);
    }
    // Season 1 plays the real 2026 NFL slate (18 weeks, each team one bye);
    // from the second season on, the game schedules the league itself.
    const nflSlate = career.seasonNumber === 1;
    const schedule = nflSlate ? nfl2026Schedule() : generateSchedule();
    career.current = {
      userTeam: team,
      seasonNumber: career.seasonNumber,
      schedule,
      scheduleLabel: (nflSlate ? "2026 NFL SCHEDULE" : "GENERATED SCHEDULE") +
        " · " + schedule.length + " WEEKS" + (nflSlate ? " · ONE BYE EACH" : ""),
      records: emptyRecords(),
      week: 0,
      results: [],
    };
    saveCareer();
    renderSeasonHub();
    showScreen("screen-season");
  }, () => showScreen("screen-title"), true);
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

// Sim injuries: a simmed game has a chance of a season injury at a random
// position for either team — recorded into the career injury list.
function simInjuries(home, away) {
  const news = [];
  const positions = ["QB", "RB", "WR", "LM", "LB", "DB"];
  for (const t of [home, away]) {
    if (Math.random() < 0.22) {
      const pos = positions[Math.floor(Math.random() * positions.length)];
      career.injuries[t] = career.injuries[t] || [];
      if (!career.injuries[t].includes(pos)) {
        career.injuries[t].push(pos);
        news.push(TEAMS[t].abbr + " " + pos + " — injured (out for the season)");
      }
    }
  }
  return news;
}

// The Week Recap: the other games' finals and the injury news, shown
// before your own game — like the NFL's weekly scoreboard show.
function recapText(wi, games, injNews) {
  let out = "WEEK " + (wi + 1) + " — AROUND THE LEAGUE\n\n";
  for (const r of games) {
    out += TEAMS[r.away].abbr + " " + r.as + " — " + r.hs + " " + TEAMS[r.home].abbr + "\n";
  }
  if (injNews.length) {
    out += "\nINJURY NEWS:\n" + injNews.join("\n");
  } else {
    out += "\nNo reported injuries around the league.";
  }
  return out;
}

async function playWeek() {
  const wi = cur.week;
  const myTeam = cur.userTeam;
  const weekGames = cur.schedule[wi] || [];
  const myGame = weekGames.find(g => g[0] === myTeam || g[1] === myTeam) || null;
  // Snapshot so quitting mid-week — in-game or by closing the app — never
  // double-counts: standings, this week's results AND the career W/L tally
  // all roll back together, so a replayed week counts your wins and losses
  // exactly once. The snapshot lives in the saved career, so it survives
  // the app being closed mid-week.
  if (cur.weekSnap && cur.weekSnap.week === wi) {
    cur.records = JSON.parse(JSON.stringify(cur.weekSnap.records));
    cur.results = JSON.parse(JSON.stringify(cur.weekSnap.results));
    career.stats = JSON.parse(JSON.stringify(cur.weekSnap.stats));
  } else {
    cur.weekSnap = {
      week: wi,
      records: JSON.parse(JSON.stringify(cur.records)),
      results: JSON.parse(JSON.stringify(cur.results)),
      stats: JSON.parse(JSON.stringify(career.stats)),
    };
  }
  saveCareer();
  const snapRecords = JSON.parse(JSON.stringify(cur.records));
  const snapResults = (cur.results[wi] || []).slice();
  const snapStats = JSON.parse(JSON.stringify(career.stats));
  // The rest of the league plays FIRST — check the scores and injury
  // report before taking the field, like the NFL's weekly news show.
  const otherGames = [], injNews = [];
  for (const g of weekGames) {
    const home = g[0]; const away = g[1];
    if (home === myTeam || away === myTeam) continue;
    const s = quickLeagueGame(home, away);
    const hs = s[home], as = s[away];
    recordResult(cur.records, home, away, hs, as);
    cur.results[wi] = cur.results[wi] || [];
    cur.results[wi].push({ home, away, hs, as });
    otherGames.push({ home, away, hs, as });
    injNews.push(...simInjuries(home, away));
  }
  if (otherGames.length) {
    saveCareer();
    await modal(recapText(wi, otherGames, injNews) +
      (myGame ? "" : "\n\nBYE WEEK — the " + TEAMS[myTeam].abbr +
        " are off. The league plays on without you."));
  }
  if (myGame) {
    const home = myGame[0]; const away = myGame[1];
    const userTeam = home === myTeam ? home : away;
    const aiTeam = userTeam === home ? away : home;
    const seasonInj = (career.injuries[myTeam] || []).slice();
    const score = await launchGame(userTeam, aiTeam, home === myTeam, seasonInj);
    if (score === null) {
      cur.records = snapRecords;
      cur.results[wi] = snapResults;
      career.stats = snapStats;
      // The week snapshot stays: the week is still unplayed, so a later
      // replay (even after the app was closed) restores from the same point.
      saveCareer();
      renderSeasonHub();
      showScreen("screen-season");
      return;
    }
    const hs = score[home]; const as = score[away];
    recordResult(cur.records, home, away, hs, as);
    cur.results[wi] = cur.results[wi] || [];
    cur.results[wi].push({ home, away, hs, as });
    career.stats.gamesPlayed++;
    const my = home === myTeam ? hs : as, their = home === myTeam ? as : hs;
    if (my > their) career.stats.wins++; else if (their > my) career.stats.losses++; else career.stats.ties++;
    career.injuries[myTeam] = [...new Set([...(career.injuries[myTeam] || []), ...lastGameMajorInjuries])];
    saveCareer();
    addSeasonLine(TEAMS[away].abbr + " " + as + " — " + hs + " " + TEAMS[home].abbr + "  (your game)");
  }
  cur.weekSnap = null; // week complete — everything is counted exactly once now
  cur.week++;
  saveCareer();
  renderSeasonHub();
  showScreen("screen-season");
  await modal("Week " + (wi + 1) + " complete." +
    (myGame ? "" : "\nBye week — the " + TEAMS[myTeam].abbr + " were off.") +
    "\nYour record: " +
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

/* ================= Off-season (Pen & Paper career rules) ================= */

// A modal that offers choices instead of just OK — used by the draft and
// free agency. Resolves with the chosen option's value.
function choose(text, options) {
  return new Promise(res => {
    $("#modal-text").textContent = text;
    const ok = $("#modal-ok");
    ok.classList.add("hidden");
    const card = ok.parentNode || ok;
    for (const o of options) {
      const b = h("button", "menu-btn modal-choice", o.label);
      b.style.marginTop = "8px";
      b.onclick = () => {
        (ok.parentNode || ok).querySelectorAll(".modal-choice").forEach(x => x.remove());
        ok.classList.remove("hidden");
        res(o.value);
      };
      (card.appendChild ? card : ok).appendChild(b);
    }
    $("#modal").classList.remove("hidden");
  });
}

// Rookies and free agents roll their rating on 2d6 + 6 (8-18).
function rookieRoll() {
  return Math.min(18, 6 + (1 + Math.floor(Math.random() * 6)) + (1 + Math.floor(Math.random() * 6)));
}

// League geography: each team's home market, which cities count as major
// markets (shared — other teams can hold them too), and the minor-market
// pool teams can expand into or relocate to.
const TEAM_CITIES = {
  "Arizona Cardinals": "Phoenix", "Atlanta Falcons": "Atlanta",
  "Baltimore Ravens": "Baltimore", "Buffalo Bills": "Buffalo",
  "Carolina Panthers": "Charlotte", "Chicago Bears": "Chicago",
  "Cincinnati Bengals": "Cincinnati", "Cleveland Browns": "Cleveland",
  "Dallas Cowboys": "Dallas", "Denver Broncos": "Denver",
  "Detroit Lions": "Detroit", "Green Bay Packers": "Green Bay",
  "Houston Texans": "Houston", "Indianapolis Colts": "Indianapolis",
  "Jacksonville Jaguars": "Jacksonville", "Kansas City Chiefs": "Kansas City",
  "Las Vegas Raiders": "Las Vegas", "Los Angeles Chargers": "Los Angeles",
  "Los Angeles Rams": "Los Angeles", "Miami Dolphins": "Miami",
  "Minnesota Vikings": "Minneapolis", "New England Patriots": "Boston",
  "New Orleans Saints": "New Orleans", "New York Giants": "New York",
  "New York Jets": "New York", "Philadelphia Eagles": "Philadelphia",
  "Pittsburgh Steelers": "Pittsburgh", "San Francisco 49ers": "San Francisco",
  "Seattle Seahawks": "Seattle", "Tampa Bay Buccaneers": "Tampa Bay",
  "Tennessee Titans": "Nashville", "Washington Commanders": "Washington",
};
const MAJOR_MARKETS = ["New York", "Los Angeles", "Chicago", "Dallas",
  "Philadelphia", "Miami", "Atlanta", "Houston", "San Francisco"];
const EXPANSION_POOL = ["Portland", "San Antonio", "Salt Lake City", "Memphis",
  "Columbus", "Louisville", "Birmingham", "Omaha", "Sacramento", "Milwaukee",
  "Raleigh", "Tucson", "Fresno", "Norfolk", "Boise", "Albuquerque"];
const POS_LIST = ["QB", "RB", "WR", "LM", "LB", "DB"];

// Record tiers from the final standings — they drive fan-base rolls,
// revenue, off-season events for the worst teams, and free development.
function computeTiers(records) {
  const teams = Object.keys(records);
  const byKey = t => standingsKey(t, records);
  const sorted = teams.slice().sort((a, b) => cmpKey(byKey(b), byKey(a)));
  const best = sorted[0], worst = sorted[sorted.length - 1];
  const tiers = {};
  for (const div in DIVISIONS) {
    const ds = DIVISIONS[div].slice().sort((a, b) => cmpKey(byKey(b), byKey(a)));
    tiers[ds[0]] = "Best in Division";
    tiers[ds[ds.length - 1]] = "Worst in Division";
  }
  tiers[best] = "Best in League";
  tiers[worst] = "Worst in League";
  for (const t of teams) {
    if (tiers[t]) continue;
    const pts = byKey(t)[0];
    if (pts > 8.5) tiers[t] = "Winning Record";
    else if (pts === 8.5) tiers[t] = "Even Record";
    else tiers[t] = "Losing Record";
  }
  return { tiers, worst: teams.filter(t =>
    tiers[t] === "Worst in Division" || tiers[t] === "Worst in League") };
}

// The fan-base d6 table by season record (grow / no change / shrink).
function growRoll(tier) {
  const r = 1 + Math.floor(Math.random() * 6);
  if (tier === "Best in League") return r <= 4 ? "grow" : "none";
  if (tier === "Best in Division") return r <= 3 ? "grow" : "none";
  // The book prints "1-3 grow / 3-6 no change" for a winning record; read
  // as 1-3 grow, 4-6 no change.
  if (tier === "Winning Record") return r <= 3 ? "grow" : "none";
  if (tier === "Even Record") return r === 1 ? "grow" : (r === 6 ? "shrink" : "none");
  if (tier === "Losing Record") return r >= 5 ? "shrink" : "none";
  if (tier === "Worst in Division") return r >= 4 ? "shrink" : "none";
  return r >= 3 ? "shrink" : "none"; // Worst in League
}

// Revenue by record tier: [major market rate, minor market rate] in $M.
const INCOME_RATES = {
  "Best in League": [20, 12], "Best in Division": [15, 9],
  "Winning Record": [10, 6], "Even Record": [8, 4],
  "Losing Record": [6, 2], "Worst in Division": [3, 1],
  "Worst in League": [1, 0],
};
function teamMarkets(t) {
  career.markets = career.markets || {};
  if (!career.markets[t]) {
    career.markets[t] = { home: TEAM_CITIES[t] || "Home", minors: [] };
  }
  return career.markets[t];
}
function incomeFor(t, tiers) {
  const rates = INCOME_RATES[tiers[t]] || INCOME_RATES["Even Record"];
  const m = teamMarkets(t);
  const homeMajor = MAJOR_MARKETS.includes(m.home) ? 1 : 0;
  return homeMajor * rates[0] + (m.minors.length + (homeMajor ? 0 : 1)) * rates[1];
}
function expandMarket(t) {
  const m = teamMarkets(t);
  const pool = EXPANSION_POOL.filter(c => c !== m.home && m.minors.indexOf(c) < 0);
  if (!pool.length) return null;
  const city = pool[Math.floor(Math.random() * pool.length)];
  m.minors.push(city);
  return city;
}
function contractMarket(t) {
  const m = teamMarkets(t);
  if (!m.minors.length) return null;
  return m.minors.splice(Math.floor(Math.random() * m.minors.length), 1)[0];
}

// Every team rolls 1d20 for negative developments since last season.
function setbackRoll() {
  const r = 1 + Math.floor(Math.random() * 20);
  return r <= 10 ? 1 : r <= 15 ? 2 : r <= 18 ? 3 : r === 19 ? 4 : 5;
}
// A development attempt: 1d20 — bad year (−1), no change, +1, +2,
// or a 20 recruits (or steals) the league's star player at that position.
function improveRoll() {
  const r = 1 + Math.floor(Math.random() * 20);
  if (r === 1) return { r, delta: -1, star: false };
  if (r <= 9) return { r, delta: 0, star: false };
  if (r <= 15) return { r, delta: 1, star: false };
  if (r <= 19) return { r, delta: 2, star: false };
  return { r, delta: 2, star: true };
}

const STAR_FIRST = ["Marcus", "DeShawn", "Trey", "Colt", "Ezra", "Hank",
  "Jermaine", "Kai", "Luka", "Monte", "Nico", "Omar", "Rashad", "Silas",
  "Vaughn", "Zeke", "Bo", "Cyrus", "Dax", "Emmitt"];
const STAR_LAST = ["Bellweather", "Granger", "Holloway", "Kingsley", "Maddox",
  "Stallworth", "Vance", "Whitlock", "Cortez", "Draper", "Fontaine",
  "Ironside", "Mercer", "Okafor", "Pruitt", "Vandermeer", "Rooker", "Tibbs"];
function starName() {
  return STAR_FIRST[Math.floor(Math.random() * STAR_FIRST.length)] + " " +
    STAR_LAST[Math.floor(Math.random() * STAR_LAST.length)];
}
function starFlavor(pos) {
  const sub = 1 + Math.floor(Math.random() * 6);
  const f = {
    QB: sub <= 3 ? "quarterback" : "center",
    RB: sub <= 3 ? "fullback" : "running back",
    WR: sub <= 3 ? "wide receiver" : "tight end",
    LM: sub <= 3 ? "defensive end" : "defensive tackle",
    LB: "linebacker",
    DB: sub <= 3 ? "cornerback" : "safety",
  };
  return f[pos] || pos;
}
// A star signs (or is stolen from another team): +2 to the position score,
// the old team loses theirs. Only one star per position league-wide.
function starFlow(team, pos, log) {
  const key = pos.toLowerCase();
  career.stars = career.stars || {};
  career.starNames = career.starNames || {};
  const prev = career.stars[pos];
  // Real roster names: a new star signs as the team's actual player at that
  // position; a stolen or re-signed star keeps his name — same guy, new team.
  const name = prev ? (career.starNames[pos] || starName())
    : (rosterName(team, pos) || starName());
  const before = TEAMS[team][key];
  let line;
  if (prev && prev !== team) {
    TEAMS[prev][key] = Math.max(3, TEAMS[prev][key] - 2);
    line = "STAR STOLEN: " + name + " (" + starFlavor(pos) + ") ditches " + TEAMS[prev].abbr +
      " for " + TEAMS[team].abbr + " — " + TEAMS[prev].abbr + " " + pos + " " + TEAMS[prev][key] +
      ", " + TEAMS[team].abbr + " " + pos + " " + before + " → " + Math.min(18, before + 2);
  } else if (prev === team) {
    line = "STAR RE-SIGNED: " + name + " (" + starFlavor(pos) + ") stays with " + TEAMS[team].abbr +
      " — " + pos + " " + before + " → " + Math.min(18, before + 2);
  } else {
    line = "STAR PLAYER: " + name + " (" + starFlavor(pos) + ") signs with " + TEAMS[team].abbr +
      " — " + pos + " " + before + " → " + Math.min(18, before + 2);
  }
  TEAMS[team][key] = Math.min(18, before + 2);
  career.stars[pos] = team;
  career.starNames[pos] = name;
  log.push(line);
}

function runAttempt(team, pos, log) {
  const roll = improveRoll();
  const key = pos.toLowerCase();
  const before = TEAMS[team][key];
  if (roll.star) {
    starFlow(team, pos, log);
    return log[log.length - 1];
  }
  TEAMS[team][key] = Math.max(3, Math.min(18, before + roll.delta));
  log.push(pos + ": 1d20 [" + roll.r + "] " +
    (roll.delta > 0 ? "+" + roll.delta : roll.delta < 0 ? "bad development −1" : "no change") +
    " → " + before + " → " + TEAMS[team][key]);
  return null;
}
async function userAttempt(team, tag, log) {
  const pos = await choose(tag + " — choose the position to develop:\n\n" +
    log.slice(-6).join("\n"), POS_LIST.map(p => ({ label: p, value: p })));
  const starLine = runAttempt(team, pos, log);
  if (starLine) await modal(starLine);
}
// AI teams develop their weakest position silently.
function aiAttempt(team) {
  const pos = POS_LIST.reduce((lo, p) =>
    TEAMS[team][p.toLowerCase()] < TEAMS[team][lo.toLowerCase()] ? p : lo, "QB");
  runAttempt(team, pos, []);
}

// THE OFF-SEASON, played out after the fresh rolls: fan bases, revenue,
// events for the worst teams, development dice, then the draft and free agency.
async function offseasonSeason(team, pickNo) {
  const info = career.offseason || { tiers: {}, worst: [] };
  const tier = t => info.tiers[t] || "Even Record";
  career.money = career.money || {};
  const news = [], devLog = [];
  // 1. FAN BASES: every team rolls on the grow/no change/shrink table.
  let grew = 0, shrank = 0, myFan = null;
  for (const t in TEAMS) {
    const res = growRoll(tier(t));
    if (res === "grow") {
      const city = expandMarket(t);
      if (city) {
        grew++;
        if (t === team) myFan = "FAN BASE: your roll expanded the fan base into " + city + ".";
      }
    } else if (res === "shrink") {
      const city = contractMarket(t);
      if (city) {
        shrank++;
        if (t === team) myFan = "FAN BASE: contraction — you lost " + city + ".";
      }
    }
  }
  if (myFan) news.push(myFan);
  news.push("AROUND THE LEAGUE: " + grew + " teams expanded their fan base, " +
    shrank + " contracted.");
  // 2. REVENUE: markets pay by record, banked for the off-season.
  const income = {}, wallet = {};
  for (const t in TEAMS) {
    income[t] = incomeFor(t, info.tiers);
    wallet[t] = (career.money[t] || 0) + income[t];
  }
  // 3. OFF-SEASON EVENTS: worst in division or league roll 2d6.
  for (const t of (info.worst || [])) {
    const r = (1 + Math.floor(Math.random() * 6)) + (1 + Math.floor(Math.random() * 6));
    if (r === 2) {
      if (t === team) {
        for (const p of POS_LIST) TEAMS[t][p.toLowerCase()] = Math.max(3, TEAMS[t][p.toLowerCase()] - 3);
        news.push("FRANCHISE CRISIS: a fan revolt nearly folded your franchise — the league took over and stripped the roster (every position −3).");
      } else {
        for (const p of POS_LIST) TEAMS[t][p.toLowerCase()] = 3;
        news.push("FRANCHISE FOLDED: the " + TEAMS[t].abbr + " collapsed from empty stadiums — the league installed a bare-bones roster (all ratings 3).");
      }
    } else if (r <= 5) {
      if (wallet[t] >= 30) {
        wallet[t] -= 30;
        news.push(t === team ?
          "STADIUM RESCUE: you spent $30M on improvements and public relations — the fans stay." :
          TEAMS[t].abbr + " spent $30M on a stadium rescue and stay put.");
      } else {
        const m = teamMarkets(t);
        const pool = EXPANSION_POOL.filter(c => c !== m.home);
        m.home = pool[Math.floor(Math.random() * pool.length)];
        m.minors = [];
        news.push((t === team ? "RELOCATION: you couldn't fund stadium improvements — the franchise moved to " :
          "RELOCATION: the " + TEAMS[t].abbr + " moved to ") + m.home + ".");
      }
    }
  }
  // 4. DEVELOPMENT: every team rolls for setbacks; you assign your hits.
  const freeAttempts = (info.tiers[team] === "Worst in Division" ||
    info.tiers[team] === "Worst in League") ? 2 : 1;
  for (const t in TEAMS) {
    const pts = setbackRoll();
    if (t === team) {
      devLog.push("SETBACK: 1d20 — " + pts + " point" + (pts > 1 ? "s" : "") + " lost off the roster.");
      for (let i = 0; i < pts; i++) {
        const pos = await choose("DEVELOPMENT SETBACK (" + (i + 1) + " of " + pts +
          ") — pick the position that takes the hit:",
          POS_LIST.map(p => ({ label: p + " −1", value: p })));
        const key = pos.toLowerCase();
        const before = TEAMS[t][key];
        TEAMS[t][key] = Math.max(3, before - 1);
        devLog.push(pos + ": " + before + " → " + TEAMS[t][key]);
      }
    } else {
      for (let i = 0; i < pts; i++) {
        const pos = POS_LIST[Math.floor(Math.random() * POS_LIST.length)];
        TEAMS[t][pos.toLowerCase()] = Math.max(3, TEAMS[t][pos.toLowerCase()] - 1);
      }
    }
  }
  // 5. DEVELOPMENT ATTEMPTS: one free (two if you were division-worst);
  // more can be bought with revenue ($50M / $150M / $500M for 1 / 2 / 3).
  for (let i = 0; i < freeAttempts; i++) {
    await userAttempt(team, "DEVELOPMENT (" + (i + 1) + " of " + freeAttempts + " free)", devLog);
  }
  for (const t in TEAMS) if (t !== team) aiAttempt(t);
  const COSTS = [[1, 50], [2, 150], [3, 500]];
  const buyOpts = [{ label: "Skip extra development", value: 0 }]
    .concat(COSTS.filter(c => wallet[team] >= c[1]).map(c =>
      ({ label: "Buy " + c[0] + " extra attempt" + (c[0] > 1 ? "s" : "") + " ($" + c[1] + "M)", value: c[0] })));
  const buy = await choose("OFF-SEASON BUDGET: $" + wallet[team] + "M available (income $" +
    income[team] + "M + banked).\n\nEach purchase is one more development attempt:", buyOpts);
  if (buy > 0) {
    const price = COSTS.filter(c => c[0] === buy)[0][1];
    wallet[team] -= price;
    for (let i = 0; i < buy; i++) {
      await userAttempt(team, "PAID DEVELOPMENT (" + (i + 1) + " of " + buy + ")", devLog);
    }
    devLog.push("OFF-SEASON BUDGET: spent $" + price + "M on extra development.");
  }
  // AI teams buy what they can afford.
  for (const t in TEAMS) {
    if (t === team) continue;
    const n = wallet[t] >= 500 ? 3 : wallet[t] >= 150 ? 2 : wallet[t] >= 50 ? 1 : 0;
    for (let i = 0; i < n; i++) aiAttempt(t);
    wallet[t] -= n === 3 ? 500 : n === 2 ? 150 : n === 1 ? 50 : 0;
  }
  // 6. THE DRAFT — worst records pick first; you choose the position.
  const pick = await choose("THE DRAFT — you pick #" + pickNo + " of 32." +
    "\nChoose a position to draft:", POS_LIST.map(p => ({ label: p, value: p })));
  const rollVal = rookieRoll();
  const oldVal = TEAMS[team][pick.toLowerCase()];
  TEAMS[team][pick.toLowerCase()] = rollVal;
  devLog.push("THE DRAFT: with pick #" + pickNo + " you drafted a " + pick +
    " rated " + rollVal + " (was " + oldVal + ").");
  // 7. FREE AGENCY — three free agents on the market, sign one or skip.
  const fas = [];
  for (let i = 0; i < 3; i++) {
    fas.push({ pos: POS_LIST[Math.floor(Math.random() * POS_LIST.length)],
               rating: Math.min(18, rookieRoll() + 2) });
  }
  const opts = fas.map((f, i) => ({ label: "Sign " + f.pos + " (" + f.rating + ")", value: i }));
  opts.push({ label: "Skip free agency", value: -1 });
  const sign = await choose("FREE AGENCY — on the market this year:\n" +
    fas.map(f => f.pos + " rated " + f.rating).join("\n"), opts);
  if (sign >= 0) {
    const f = fas[sign];
    const oldV = TEAMS[team][f.pos.toLowerCase()];
    TEAMS[team][f.pos.toLowerCase()] = f.rating;
    devLog.push("FREE AGENCY: you signed a " + f.pos + " rated " + f.rating + " (was " + oldV + ").");
  } else {
    devLog.push("FREE AGENCY: you stood pat.");
  }
  // Bank it: every team keeps wallet = banked revenue + income − spending.
  for (const t in TEAMS) career.money[t] = Math.max(0, Math.round(wallet[t]));
  news.push("REVENUE: your markets earned $" + income[team] + "M as a " + tier(team) +
    " — after the off-season you're banked at $" + career.money[team] + "M.");
  if (career.stars && Object.keys(career.stars).length) {
    const lines = POS_LIST.filter(p => career.stars[p]).map(p =>
      "STAR REPORT: " + (career.starNames[p] || "the star") + " (" + p + ", " +
      TEAMS[career.stars[p]].abbr + ") reports to camp — " + p + " +2 for the season.");
    news.push(lines.join("\n"));
  }
  await modal("OFFSEASON — AROUND THE LEAGUE\n\n" + news.join("\n\n"));
  await modal("OFFSEASON — YOUR FRANCHISE\n\n" + devLog.join("\n"));
}

async function completeSeason(champion) {
  const r = cur.records[cur.userTeam];
  const team = cur.userTeam;
  const seasonNo = cur.seasonNumber;
  const year = career.year || 1;
  const myTitles = career.history.filter(i => i.champion === i.team).length + (champion === team ? 1 : 0);
  career.history.push({
    season: seasonNo, year, team, W: r.W, L: r.L, T: r.T, PF: r.PF, PA: r.PA,
    champion, date: new Date().toISOString().slice(0, 10),
  });
  // Draft order: worst records pick first (more wins = later pick). The
  // pick is stored and the market plays out at the start of the NEXT season,
  // on top of that season's fresh rolls.
  const pickNo = 1 + Object.keys(cur.records).filter(n => n !== team &&
    (cur.records[n].W > r.W || (cur.records[n].W === r.W && cur.records[n].PF < r.PF))).length;
  // Record tiers from the final standings drive the whole off-season: fan
  // bases, revenue, events for the worst teams, and free development.
  career.offseason = computeTiers(cur.records);
  career.ratings = exportRatings();
  career.injuries[team] = [];
  career.seasonNumber = seasonNo + 1;
  career.careerTeam = team;
  career.draftPick = pickNo;
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
    career.draftPick = null;
  } else {
    career.year = year + 1;
  }
  saveCareer();
  renderTitle();
  await modal("SEASON " + seasonNo + " COMPLETE" +
        "\n" + team + ": " + r.W + "-" + r.L + "-" + r.T + " (year " + year + " of 5)" +
        "\nSuper Bowl champion: " + champion + endMsg +
        "\n\nThe offseason market runs when you start your next season.");
  showScreen("screen-title");
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
  // Reigning star players: one star per position, stolen on a development 20.
  career.stars = career.stars || {};
  career.starNames = career.starNames || {};
  const starRows = POS_LIST.filter(p => career.stars[p]).map(p =>
    '<tr><td>' + p + '</td><td class="chip-cell">' + chip(career.stars[p]) + career.stars[p] +
    '</td><td>' + (career.starNames[p] || "—") + '</td></tr>');
  if (starRows.length) {
    html += '<div class="group-label" style="margin-top:10px">LEAGUE STARS</div>' +
      '<table class="info-table"><tr><th>Pos</th><th>Team</th><th>Star Player</th></tr>' +
      starRows.join("") + '</table>';
  }
  showInfo(html);
};

/* ================= Game screen controls ================= */

$("#speedBtn").onclick = () => {
  SPEED.fast = !SPEED.fast;
  $("#speedBtn").textContent = "Speed: " + (SPEED.fast ? "Fast" : "Normal");
};
$("#soundBtn").onclick = () => {
  soundOn = !soundOn;
  try { localStorage.setItem("tb_sound", soundOn ? "on" : "off"); } catch (e) {}
  $("#soundBtn").textContent = "Sound: " + (soundOn ? "On" : "Off");
  if (soundOn) { ensureAudio(); sfx("tick"); }
};
$("#soundBtn").textContent = "Sound: " + (soundOn ? "On" : "Off");

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