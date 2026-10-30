"use strict";
// Play-by-play football engine, adapted from the pen & paper head-to-head rules.
// All user decisions are made through pres.ask(); all narration flows through pres.say().

function bonus(score) {
  if (score === 3) return 0;
  if (score <= 5) return 1;
  if (score <= 8) return 2;
  if (score <= 12) return 3;
  if (score <= 15) return 4;
  if (score <= 17) return 5;
  return 6;
}

function roll(n, sides = 6, exploding = false) {
  const rolls = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    let r = 1 + Math.floor(Math.random() * sides);
    rolls.push(r); total += r;
    while (exploding && r === 6) {
      r = 1 + Math.floor(Math.random() * sides);
      rolls.push(r); total += r;
    }
  }
  return [total, rolls];
}

function rollText(rolls) { return rolls.join("+"); }
function pickA(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

class Team {
  constructor(name, home) {
    this.name = name;
    const t = TEAMS[name];
    this.scores = { QB: t.qb, RB: t.rb, WR: t.wr, LM: t.lm, LB: t.lb, DB: t.db };
    this.bonuses = {};
    for (const k in this.scores) this.bonuses[k] = bonus(this.scores[k]);
    this.home = home;
    this.actionDice = home ? 4 : 3; // home field gets one extra action die
    this.minorInjuries = [];
    this.majorInjuries = [];
    this.stats = { plays: 0, rushes: 0, rushYards: 0, passes: 0, completions: 0, passYards: 0,
                   firstDowns: 0, turnovers: 0, sacks: 0, punts: 0, fieldGoals: 0,
                   touchdowns: 0, penalties: 0, injuries: 0,
                   qbYards: 0, rbYards: 0, wrYards: 0, qbTDs: 0, rbTDs: 0, wrTDs: 0, qbPassTDs: 0,
                   passTDs: 0, rushTDs: 0, stYards: 0, stTDs: 0,
                   fumbles: 0, intsThrown: 0, intsMade: 0, sacksMade: 0, sackYards: 0 };
  }
  b(stat) {
    return Math.max(0, this.bonuses[stat]
      - this.minorInjuries.filter(s => s === stat).length
      - this.majorInjuries.filter(s => s === stat).length);
  }
}

class Game {
  constructor(pres, userName, aiName, userHome = true) {
    this.pres = pres;
    this.user = new Team(userName, userHome);
    this.ai = new Team(aiName, !userHome);
    this.teams = [this.user, this.ai];
    this.leftTeam = this.user.home ? this.user : this.ai;   // home team defends the left end zone all game
    this.rightTeam = this.other(this.leftTeam);             // away team defends the right end zone
    this.score = {};
    this.score[userName] = 0;
    this.score[aiName] = 0;
    this.q = 1;
    this.roundInQ = 0;
    this.totalPlays = 0;
    this.log = [];
    this.trickUses = {}; this.trickUses[userName] = {}; this.trickUses[aiName] = {};
    this.hardCountUses = {}; this.hardCountUses[userName] = 0; this.hardCountUses[aiName] = 0;
    this.fakeUses = {}; this.fakeUses[userName] = 0; this.fakeUses[aiName] = 0;
    this.lastHurry = {}; this.lastHurry[userName] = false; this.lastHurry[aiName] = false;
    this.offense = null; this.defense = null;
    this.yard = 20; this.down = 1; this.toGo = 10; this.driveStart = 20; this.lineToGain = 30;
    this.downResult = null;
    this.halfKickoffReceiver = null;
    this.gameOver = false;
    this.userDefenseActionBonus = 0;
    this.userActionBonus = 0;
    this.pendingDefense = null;
    this.lastTDScorer = null;
  }

  other(team) { return team === this.user ? this.ai : this.user; }

  // Convert an offense-relative yard (0=own goal line) to the fixed on-screen position.
  absOf(team, y) { return team === this.leftTeam ? y : 100 - y; }

  scoreline() {
    return TEAMS[this.user.name].abbr + " " + this.score[this.user.name] +
           " — " + TEAMS[this.ai.name].abbr + " " + this.score[this.ai.name];
  }

  fieldSpotFor(offense, y) {
    y = Math.max(0, Math.min(100, y));
    if (y === 50) return "the 50-yard line";
    const oAbbr = TEAMS[offense.name].abbr;
    if (y < 50) return oAbbr + " " + y;
    const dAbbr = TEAMS[this.other(offense).name].abbr;
    return dAbbr + " " + (100 - y);
  }

  fieldSpot(yard) {
    const y = (yard == null) ? this.yard : Math.max(0, Math.min(100, yard));
    if (!this.offense) return String(y);
    return this.fieldSpotFor(this.offense, y);
  }

  downDistance(offense) {
    if (!offense) offense = this.offense;
    const yardsToGain = Math.max(0, this.lineToGain - this.yard);
    const distance = this.lineToGain >= 100 ? "Goal" : String(yardsToGain);
    const names = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" };
    return (names[this.down] || String(this.down)) + " & " + distance + " at " + this.fieldSpot();
  }

  async _say(s, cls) { this.log.push(s); await this.pres.say(s, cls); }

  async start() {
    this.pres.setEndZones(this.leftTeam, this.rightTeam);
    await this.pres.banner("COIN TOSS", "neutral", 900);
    await this._say("Team captains meet at midfield for the coin toss.");
    const call = await this.pres.ask("Call the toss:", [
      { label: "Heads", value: "heads", group: "COIN TOSS" },
      { label: "Tails", value: "tails", group: "COIN TOSS" }]);
    const toss = pickA(["heads", "tails"]);
    await this._say("The coin spins... it lands on " + toss.toUpperCase() + ". You called " + call.toUpperCase() + ".");
    let offense;
    if (toss === call) {
      const d = await this.pres.ask("You won the toss. Choose:", [
        { label: "Receive — start on offense", value: "Receive", group: "COIN TOSS" },
        { label: "Kick — make them start on offense", value: "Kick", group: "COIN TOSS" }]);
      if (d === "Receive") {
        offense = this.user;
        await this._say("You choose to receive the opening kickoff.");
      } else {
        offense = this.ai;
        await this._say("You choose to kick. " + this.ai.name + " take the opening kickoff.");
      }
    } else {
      const d = pickA(["Receive", "Kick"]);
      if (d === "Receive") {
        offense = this.ai;
        await this._say("You lost the toss. " + this.ai.name + " choose to receive the opening kickoff.");
      } else {
        offense = this.user;
        await this._say("You lost the toss. " + this.ai.name + " choose to kick — you take the opening kickoff.");
      }
    }
    this.halfKickoffReceiver = offense;
    await this.kickoff(this.other(offense), offense);
    while (!this.gameOver) {
      await this.drive();
      if (this.roundInQ >= 40) await this.endQuarter();
    }
    return await this.finish();
  }

  async kickoff(kicking, receiving, opts = {}) {
    const safety = opts.safety || false;
    this.offense = receiving; this.defense = kicking;
    this.pres.setPossession(receiving);
    this.pres.setField(this.absOf(receiving, 65), this.absOf(receiving, 65));
    this.pres.updateBoard();
    if (safety) {
      await this._say("Safety: " + kicking.name + " must punt from its own end zone.", "event");
      await this.punt(kicking, receiving, true);
      return;
    }
    this.totalPlays++; this.roundInQ++;
    this.pres.updateBoard();
    this.pres.setFormation("kickreturn", "kickoff");
    await this._say("KICKOFF: " + kicking.name + " kick off to " + receiving.name + ".", "event");
    let kickType = "standard";
    if (kicking === this.user) {
      kickType = await this.pres.ask("Choose your kick:", [
        { label: "Standard kick", value: "standard", group: "SPECIAL TEAMS" },
        { label: "Onside kick", value: "onside", group: "SPECIAL TEAMS" },
        { label: "Squib kick", value: "squib", group: "SPECIAL TEAMS" }]);
      await this.pres.ask("You are kicking off. Press KICK to boot it:", [
        { label: "Kick it!", value: "kick", group: "SPECIAL TEAMS" }]);
    }
    if (kickType === "onside") {
      await this._say("ONSIDE KICK! " + kicking.name + " tries to surprise the coverage.", "event");
      const o = 1 + Math.floor(Math.random() * 20);
      await this._say("Onside roll: 1d20 = " + o + " (must roll 12 or higher).", "dice");
      if (o >= 12) {
        await this.pres.banner("ONSIDE KICK RECOVERED!", "good", 1200);
        await this._say(kicking.name + " recover the onside kick at their opponent's 40!");
        await this.setDrive(kicking, receiving, 60);
      } else {
        await this._say(receiving.name + " cover the onside kick at their own 40.");
        await this.setDrive(receiving, kicking, 40);
      }
      return;
    }
    const [k, krolls] = kickType === "squib" ? roll(1) : roll(2);
    const dist = this.kickDistance(kickType === "squib" ? Math.max(2, k) : k, 65);
    const spot = 65 - dist; // receiving-relative spot (negative = deep in the end zone)
    await this._say("The kick travels " + dist + " yards (" + rollText(krolls) + ").", "dice");
    await this.pres.moveBall(this.absOf(receiving, 65), this.absOf(receiving, Math.max(-9, spot)), 900);
    if (spot < 0) {
      await this._say("The kick is caught " + Math.abs(spot) + " yards deep in the end zone.");
    } else {
      await this._say(receiving.name + " field the kick at their own " + spot + ".");
    }
    let kind;
    if (receiving === this.user) {
      kind = await this.pres.ask(spot < 0 ? "Kick is in the end zone. Choose:" :
        "Kick landed at your own " + spot + ". Choose:", [
        { label: "Return", value: "Return", group: "SPECIAL TEAMS" },
        { label: "Fair catch", value: "Fair catch", group: "SPECIAL TEAMS" }]);
    } else {
      kind = Math.random() < 0.82 ? "Return" : "Fair catch";
      await this._say("AI calls: " + kind.toLowerCase() + ".");
    }
    if (kind === "Fair catch") {
      if (spot < 0) {
        await this._say("Fair catch in the end zone — touchback. " + receiving.name + " start at their own 20.");
        await this.setDrive(receiving, kicking, 20);
      } else {
        await this._say(receiving.name + " fair-catch at their own " + spot + ".");
        await this.setDrive(receiving, kicking, Math.min(99, spot));
      }
    } else {
      let [gain, rolls] = kickType === "squib" ? roll(3, 6, true) : roll(5, 6, true);
      this.yard = spot;
      if (spot < 0) {
        // End-zone return: the returner bursts out of the end zone.
        const bonus = (-spot) + 8;
        gain += bonus;
        await this._say(receiving.name + " bring it out of the end zone (+" + bonus + " escape yardage).", "good");
      }
      if (gain >= 30) gain = await this.footRace(receiving, gain);
      const end = spot + gain;
      if (end <= 0) {
        await this._say(receiving.name + " can't escape the end zone — touchback. They start at their own 20.");
        await this.setDrive(receiving, kicking, 20);
        return;
      }
      const tdX = this.absOf(receiving, 100) + (receiving === this.leftTeam ? 5 : -5);
      await this.pres.moveBall(this.absOf(receiving, spot), end >= 100 ? tdX : this.absOf(receiving, end), 900);
      await this._say(receiving.name + " return: " + gain + " yards (" + rollText(rolls) +
                      ") — to their own " + Math.min(99, end) + ".");
      receiving.stats.stYards += gain;
      if (Math.floor(Math.random() * 20) === 0) {
        await this._say("Kickoff return FUMBLE! Resolved at the midpoint of the return.", "turnover");
        await this.pres.banner("FUMBLE!", "bad", 900);
        receiving.stats.fumbles++;
        this.yard = Math.max(1, Math.min(99, spot + Math.floor(gain / 2)));
        await this.resolveFumble(receiving, kicking);
        if (this.offense === receiving) await this.setDrive(receiving, kicking, this.yard);
      } else if (end >= 100) {
        this.lastTDScorer = "st";
        await this.touchdown(receiving, kicking);
      } else {
        await this.setDrive(receiving, kicking, Math.min(99, end));
      }
    }
  }

  kickDistance(rollTotal, fallback) {
    const table = { 2: 45, 3: 50, 4: 55, 5: 60, 6: 60, 7: 65, 8: 65, 9: 65, 10: 70, 11: 70, 12: 75 };
    return table[rollTotal] != null ? table[rollTotal] : fallback;
  }

  async setDrive(offense, defense, yard) {
    this.offense = offense; this.defense = defense;
    this.pres.setPossession(offense);
    this.yard = Math.max(1, Math.min(99, yard));
    this.down = 1;
    this.lineToGain = Math.min(100, this.yard + 10);
    this.toGo = this.lineToGain - this.yard;
    this.driveStart = this.yard;
    this.downResult = null;
    this.pres.setField(this.absOf(offense, this.yard), this.absOf(offense, this.lineToGain));
    this.pres.updateBoard();
    await this._say(offense.name + " ball at " + this.fieldSpot() + ". " + this.downDistance(offense) + ".");
  }

  async drive() {
    if (this.roundInQ >= 40 || this.gameOver) return;
    const off = this.offense, deff = this.defense;
    if (!off) return;
    await this._say(off.name + " drive — " + this.downDistance(off) + ".");
    let action;
    if (off === this.user) {
      // The AI defense breaks its huddle and aligns first, so the user can
      // read its formation before choosing a play.
      this.pendingDefense = await this.aiDefense(null, null);
      const defType = this.pendingDefense[1] === "normal" ? this.pendingDefense[0] : this.pendingDefense[1];
      this.pres.setFormation("run", defType);
      this.pres.updateBoard();
      await this._say("The " + deff.name + " defense lines up.", "dice");
      const menu = [
        { label: "Run", value: "Run", group: "OFFENSE" },
        { label: "Pass", value: "Pass", group: "OFFENSE" },
        { label: "Special Run", value: "Special run", group: "OFFENSE" },
        { label: "Special Pass", value: "Special pass", group: "OFFENSE" },
        { label: "Punt", value: "Punt", group: "SPECIAL TEAMS" },
        { label: "Field Goal", value: "Field goal", group: "SPECIAL TEAMS" },
        { label: "Kneel", value: "Kneel", group: "OFFENSE" },
        { label: "Hard Count", value: "Hard count", group: "OFFENSE" }];
      if (this.down === 4) {
        menu.push({ label: "Fake Punt", value: "Fake punt", group: "SPECIAL TEAMS" });
        menu.push({ label: "Fake Field Goal", value: "Fake field goal", group: "SPECIAL TEAMS" });
      }
      action = await this.pres.ask(this.downDistance(off) + " — choose a play:", menu);
      this.userActionBonus = 0;
      if (action !== "Special pass") this.lastHurry[off.name] = false;
    } else {
      this.userActionBonus = 0;
      action = this.aiChoosePlay(off, deff);
      // The AI offense automatically aligns in its formation once it has chosen,
      // so the user can read it before picking a defense.
      const aiOffType = (action === "Run" || action === "Special run") ? "run" :
                        (action === "Pass" || action === "Special pass") ? "pass" : null;
      if (aiOffType) this.pres.setFormation(aiOffType, "run");
      else if (action === "Punt") this.pres.setFormation("punt", "puntreturn");
      else if (action === "Field goal") this.pres.setFormation("fieldgoal", "fgrush");
      this.pres.updateBoard();
      await this._say("AI calls: " + action + ".");
    }
    if (action === "Run") await this.scrimmagePlay(off, deff, "run");
    else if (action === "Pass") await this.scrimmagePlay(off, deff, "pass");
    else if (action === "Special run") await this.specialPlay(off, deff, "run");
    else if (action === "Special pass") await this.specialPlay(off, deff, "pass");
    else if (action === "Punt") await this.punt(off, deff);
    else if (action === "Field goal") await this.fieldGoal(off, deff);
    else if (action === "Fake punt") await this.fakeKick(off, deff, "punt");
    else if (action === "Fake field goal") await this.fakeKick(off, deff, "field goal");
    else if (action === "Kneel") await this.kneel(off);
    else if (action === "Hard count") await this.hardCount(off, deff);
    else await this.scrimmagePlay(off, deff, "run");
  }

  aiChoosePlay(off, deff) {
    if (this.down === 4) {
      const fgDist = 117 - this.yard;
      if (fgDist <= 55 && this.yard >= 55 && Math.random() < 0.70) return "Field goal";
      if (this.yard < 58 && this.toGo > 2) return "Punt";
      if (this.toGo >= 5 && this.yard < 65) return "Punt";
    }
    if (this.yard >= 82 && this.down <= 3 && Math.random() < 0.16) return "Special pass";
    if (this.toGo <= 2) return pickA(["Run", "Special run", "Run", "Pass"]);
    if (this.down >= 3 && this.toGo > 7) return pickA(["Pass", "Special pass", "Pass"]);
    if (off.b("QB") + off.b("WR") >= off.b("RB") + off.b("QB"))
      return pickA(["Pass", "Pass", "Run", "Special pass"]);
    return pickA(["Run", "Run", "Pass", "Special run"]);
  }

  async aiDefense(kind, special) {
    if (this.offense === this.ai) {
      const base = await this.pres.ask("Choose your defense:", [
        { label: "Run Defense", value: "Run defense", group: "DEFENSE" },
        { label: "Pass Defense", value: "Pass defense", group: "DEFENSE" },
        { label: "Blitz vs Run", value: "Blitz vs run", group: "DEFENSE" },
        { label: "Blitz vs Pass", value: "Blitz vs pass", group: "DEFENSE" },
        { label: "Prevent vs Pass", value: "Prevent vs pass", group: "DEFENSE" },
        { label: "Goal-line vs Run", value: "Goal-line stand vs run", group: "DEFENSE" },
        { label: "Goal-line vs Pass", value: "Goal-line stand vs pass", group: "DEFENSE" }]);
      this.userDefenseActionBonus = 0;
      if (this.user.actionDice > 0) {
        const spend = await this.pres.ask("Spend one action die to add 1d6 to this defensive roll?", [
          { label: "No", value: "No", group: "ACTION DIE" },
          { label: "Yes", value: "Yes", group: "ACTION DIE" }]);
        if (spend === "Yes") {
          this.user.actionDice--;
          this.userDefenseActionBonus = 1 + Math.floor(Math.random() * 6);
          await this._say("You spend a defensive action die: +" + this.userDefenseActionBonus + " to the DC.", "dice");
        }
      }
      if (base.startsWith("Run")) return ["run", "normal"];
      if (base.startsWith("Pass")) return ["pass", "normal"];
      if (base.startsWith("Blitz")) return [base.includes("run") ? "run" : "pass", "blitz"];
      if (base.startsWith("Prevent")) return ["pass", "prevent"];
      return [base.includes("run") ? "run" : "pass", "goal"];
    }
    // AI defensive call: situational but not omniscient about a hidden play.
    if (this.yard >= 85) return pickA([["pass", "goal"], ["run", "goal"], ["pass", "normal"]]);
    if (this.toGo >= 8) return pickA([["pass", "normal"], ["pass", "blitz"], ["run", "normal"]]);
    return pickA([["run", "normal"], ["pass", "normal"], ["run", "blitz"], ["pass", "prevent"]]);
  }

  defenseDc(deff, kind, defenseKind, specialDef, special) {
    let dc;
    if (kind === "run") {
      dc = 6 + deff.b("LM");
      if (defenseKind === "run") dc += deff.b("LB");
    } else {
      dc = 8 + deff.b("DB");
      if (defenseKind === "pass") dc += deff.b("LB");
      if (this.yard >= 80) dc += 2;
    }
    if (specialDef === "blitz") dc -= 2;
    else if (specialDef === "goal") { if (kind === "run" && special !== "Sweep") dc += 2; else dc -= 2; }
    else if (specialDef === "prevent") dc -= 2;
    return dc;
  }

  async scrimmagePlay(off, deff, kind, opts = {}) {
    const special = opts.special || null;
    const yardDice = opts.yardDice || null;
    let baseDc = opts.baseDc;
    const playStartYard = this.yard;
    this.downResult = null;
    let defenseKind, specialDef;
    if (off === this.user && this.pendingDefense) {
      [defenseKind, specialDef] = this.pendingDefense; // pre-aligned at the huddle
      this.pendingDefense = null;
    } else {
      [defenseKind, specialDef] = await this.aiDefense(kind, special);
    }
    if (special === "Halfback Option") kind = defenseKind === "run" ? "pass" : "run";
    if (special === "Shotgun" && specialDef === "blitz") specialDef = "normal";
    const offType = kind === "run" ? "run" : "pass";
    const defType = specialDef === "normal" ? defenseKind : specialDef;
    this.pres.setFormation(offType, defType);
    let dc = this.defenseDc(deff, kind, defenseKind, specialDef, special);
    if (baseDc != null) {
      if (special === "Play-Action" && defenseKind === "pass") baseDc = 12;
      dc = baseDc;
      if (kind === "run") {
        dc += deff.b("LM");
        if (defenseKind === "run" && special !== "QB Sneak") dc += deff.b("LB");
      } else {
        dc += deff.b("DB");
        if (defenseKind === "pass") dc += deff.b("LB");
        if (this.yard >= 80) dc += 2;
      }
      if (specialDef === "blitz") dc -= 2;
      else if (specialDef === "goal") { if (kind === "run" && special !== "Sweep") dc += 2; else dc -= 2; }
      else if (specialDef === "prevent") dc -= 2;
    }
    let defensiveActionBonus = deff === this.user ? this.userDefenseActionBonus : 0;
    this.userDefenseActionBonus = 0;
    if (deff === this.ai && deff.actionDice > 0 && Math.random() < 0.20) {
      deff.actionDice--;
      defensiveActionBonus = 1 + Math.floor(Math.random() * 6);
      await this._say("AI spends a defensive action die: +" + defensiveActionBonus + " to the DC.", "dice");
    }
    dc += defensiveActionBonus;
    let attackBonus = off.b("QB") + (kind === "run" ? off.b("RB") : off.b("WR"));
    if (special === "QB Sneak") attackBonus = off.b("QB");
    if (special === "Halfback Option") attackBonus = off.b("WR");
    let actionBonus = 0;
    if (off === this.user && off.actionDice > 0) {
      const spend = await this.pres.ask("Spend one action die to add 1d6 to this offensive play?", [
        { label: "No", value: "No", group: "ACTION DIE" },
        { label: "Yes", value: "Yes", group: "ACTION DIE" }]);
      if (spend === "Yes") {
        off.actionDice--;
        actionBonus = 1 + Math.floor(Math.random() * 6);
        await this._say("Your offensive action die adds +" + actionBonus + " to the attack.", "dice");
      }
    } else if (off === this.ai && off.actionDice > 0 && Math.random() < 0.25) {
      off.actionDice--;
      actionBonus = 1 + Math.floor(Math.random() * 6);
      await this._say("AI spends an offensive action die: +" + actionBonus + " to attack.", "dice");
    }
    const d20 = 1 + Math.floor(Math.random() * 20);
    const attack = d20 + attackBonus + actionBonus;
    const mishapDie = 1 + Math.floor(Math.random() * 6);
    const playName = (special ? special + " " + kind : kind).toUpperCase();
    await this._say(off.name + " faces " + defenseKind + " " + specialDef + " defense on " + playName +
                    ": d20 " + d20 + " + " + (attackBonus + actionBonus) + " = " + attack +
                    " vs DC " + dc + ". Mishap die: " + mishapDie + ".", "dice");
    if (d20 === 1) await this._say("A natural 1 on the d20 — critical-failure result.", "bad");
    else if (attack >= dc) await this._say("The offense clears the defensive target by " + (attack - dc) + ".", "dice");
    else await this._say("The offense falls " + (dc - attack) + " short of the defensive target.", "dice");
    this.totalPlays++; this.roundInQ++;
    off.stats.plays++;
    off.stats[kind === "run" ? "rushes" : "passes"]++;
    let gained = 0, turnover = false;
    if (d20 === 1) {
      if (special === "Reverse") {
        await this._say("Reverse rule: a natural 1 always causes a fumble.", "bad");
        off.stats.fumbles++;
        await this.resolveFumble(off, deff);
        turnover = this.offense !== off;
      } else if (kind === "pass") {
        const chance = deff.b("DB") > off.b("QB") ? 2 : 1;
        if (1 + Math.floor(Math.random() * 6) <= chance) {
          turnover = true;
          off.stats.turnovers++; deff.stats.turnovers++;
          off.stats.intsThrown++; deff.stats.intsMade++;
          await this.pres.banner("INTERCEPTED!", "bad", 1200);
          const [thrown] = roll(2, 6, true);
          let [ret, rtr] = roll(3, 6, true);
          if (special === "Screen Pass") [ret, rtr] = roll(4, 6, true);
          await this._say("INTERCEPTION! Pass traveled " + thrown + " yards; return " + ret +
                          " yards (" + rollText(rtr) + ").", "turnover");
          const spot = Math.max(1, Math.min(99, 100 - (this.yard + thrown) + ret));
          await this.turnover(off, deff, spot);
        } else {
          const [loss] = roll(1, 6, true);
          off.stats.sacks++; deff.stats.sacksMade++;
          await this._say("Sacked for a " + loss + "-yard loss.", "bad");
          off.stats.passYards -= loss;
          off.stats.qbYards -= loss;
          off.stats.sackYards += loss;
          await this.advance(off, -loss);
        }
      } else {
        const chance = deff.b("LB") > off.b("RB") ? 2 : 1;
        if (1 + Math.floor(Math.random() * 6) <= chance) {
          await this.pres.banner("FUMBLE!", "bad", 1000);
          await this._say("FUMBLE on the critical run failure!", "turnover");
          off.stats.fumbles++;
          await this.resolveFumble(off, deff);
          turnover = true;
        } else {
          const [loss] = roll(1, 6, true);
          await this._say("Tackled behind the line for a " + loss + "-yard loss.", "bad");
          off.stats.rushYards -= loss;
          off.stats.rbYards -= loss;
          await this.advance(off, -loss);
        }
      }
    } else if (attack < dc) {
      if (special === "Double Pass") {
        const [loss, lr] = roll(1, 6, true);
        await this._say("Double Pass fails: loss of " + loss + " yards (" + rollText(lr) + ").", "bad");
        off.stats.passYards -= loss;
        off.stats.qbYards -= loss;
        off.stats.wrYards -= loss;
        await this.advance(off, -loss);
      } else if (special === "Option") {
        const [loss] = roll(1, 6, true);
        await this._say("Option fails: loss of " + loss + " yards.", "bad");
        off.stats.rushYards -= loss;
        off.stats.rbYards -= loss;
        await this.advance(off, -loss);
      } else if (special === "Hook & Lateral") {
        await this._say("Hook & Lateral fails: automatic fumble.", "bad");
        off.stats.fumbles++;
        await this.pres.banner("FUMBLE!", "bad", 1000);
        await this.resolveFumble(off, deff);
        turnover = this.offense !== off;
      } else if (specialDef === "blitz") {
        const [loss] = roll(2, 6, true);
        await this._say("The blitz beats the play: loss of " + loss + " yards.", "bad");
        off.stats[kind === "pass" ? "passYards" : "rushYards"] -= loss;
        if (kind === "pass") { off.stats.qbYards -= loss; off.stats.sackYards += loss; } else off.stats.rbYards -= loss;
        await this.advance(off, -loss);
      } else if (kind === "pass") {
        await this._say("Incomplete pass. No gain.");
        await this.advance(off, 0);
      } else {
        await this._say("Run stopped. No gain.");
        await this.advance(off, 0);
      }
    } else {
      if (special === "Hail Mary") {
        gained = 100 - this.yard;
        await this._say("Hail Mary succeeds: automatic touchdown per the rules!", "good");
      } else if (yardDice) {
        let [g, rs] = roll(yardDice[0], 6, specialDef !== "prevent");
        gained = g;
        if (kind === "pass" && special === null && d20 === 20) gained += 10;
        if (kind === "run" && special === null && d20 === 20) gained += 5;
        if (special === "West Coast") { const r2 = roll(defenseKind === "run" ? 3 : 2, 6, specialDef !== "prevent"); gained = r2[0]; rs = r2[1]; }
        if (special === "End Run" && defenseKind === "pass") { const r2 = roll(3, 6, specialDef !== "prevent"); gained = r2[0]; rs = r2[1]; }
        if (special === "End Run" && defenseKind === "run") { const r2 = roll(1, 6, specialDef !== "prevent"); gained = r2[0]; rs = r2[1]; }
        if (special === "Draw" && specialDef === "blitz") { const r2 = roll(3, 6, specialDef !== "prevent"); gained = r2[0]; rs = r2[1]; }
        if (special === "Draw" && specialDef !== "blitz") { const r2 = roll(2, 6, specialDef !== "prevent"); gained = r2[0]; rs = r2[1]; }
        await this._say((special || kind) + " succeeds: yardage dice [" + rollText(rs) + "] produce " + gained + " yards.", "good");
      } else {
        const [g, rs] = roll(kind === "pass" ? 3 : 2, 6, true);
        gained = g;
        if (kind === "pass" && d20 === 20) gained += 10;
        if (kind === "run" && d20 === 20) gained += 5;
        await this._say(kind + " succeeds: yardage dice [" + rollText(rs) + "] produce " + gained + " yards.", "good");
      }
      if (gained >= 25 && special !== "Hail Mary") gained = await this.footRace(off, gained);
      if (!turnover) {
        off.stats[kind === "pass" ? "passYards" : "rushYards"] += gained;
        if (kind === "pass") {
          off.stats.qbYards += gained;                     // QB throwing yards (incl. sack losses)
          off.stats.wrYards += gained;                     // WR receiving yards (incl. completed losses)
        } else {
          off.stats.rbYards += gained;
        }
        this.lastTDScorer = kind === "pass" ? "wr" : (special === "QB Sneak" ? "qb" : "rb");
        await this.advance(off, gained);
      }
      if (kind === "pass" && gained >= 0) off.stats.completions++;
    }
    if (mishapDie === 1 && !turnover && this.offense === off) await this.handleMishap(off, deff, kind, playStartYard);
    if (!turnover && !this.gameOver && this.offense === off) await this.finishDown(off, deff);
    if (special === "Hurry Up" && d20 !== 1 && attack >= dc) {
      this.roundInQ = Math.max(0, this.roundInQ - 1);
      await this._say("Successful Hurry Up: the play does not count as a round of play.", "good");
    }
    if (this.offense === off && this.roundInQ >= 40) await this._say("Quarter time has expired after this play.");
  }

  async specialPlay(off, deff, kind) {
    const plays = kind === "run" ? RUN_SPECIALS : PASS_SPECIALS;
    let names = Object.keys(plays);
    let name;
    if (off === this.user) {
      if (kind === "pass" && this.lastHurry[off.name]) names = names.filter(n => n !== "Hurry Up");
      name = await this.pres.ask("Choose a special " + kind + " play:",
        names.map(n => ({ label: n, value: n, group: "SPECIAL " + kind.toUpperCase() + " PLAYS" })));
    } else {
      const choices = kind === "pass" ? ["Hook", "West Coast", "Screen Pass", "Long Bomb"]
                                      : ["Blast", "Draw", "Sweep", "End Run"];
      name = pickA(choices);
    }
    const entry = plays[name];
    let dc = entry[0];
    const trick = entry[2];
    const uses = this.trickUses[off.name][name] || 0;
    if (trick && uses > 0) dc += 2 * uses;
    this.trickUses[off.name][name] = uses + 1;
    if (trick && uses) await this._say("Trick-play DC increased cumulatively to " + dc + ".", "dice");
    let dice = null;
    if (name !== "Hail Mary") dice = [parseInt(entry[1][0], 10), true];
    this.lastHurry[off.name] = (name === "Hurry Up");
    await this.scrimmagePlay(off, deff, kind, { special: name, baseDc: dc, yardDice: dice });
  }

  async footRace(runner, gained) {
    let total = gained;
    let first = true;
    while (total >= 25 && (first || this.yard + total < 100)) {
      first = false;
      const r = 1 + Math.floor(Math.random() * 6);
      const d = 1 + Math.floor(Math.random() * 6);
      await this._say("Foot race: runner " + r + " vs defender " + d + ".", "dice");
      if (r >= d) {
        total += 10;
        if (this.yard + total >= 100) break;
      } else {
        total = Math.min(total, Math.max(0, 99 - this.yard));
        await this._say("The defender catches the runner!", "bad");
        break;
      }
    }
    return total;
  }

  async advance(off, yards) {
    if (yards < 0 && this.yard + yards <= 0) {
      await this._say("SAFETY! " + off.name + " is tackled in its own end zone.", "event");
      await this.pres.banner("SAFETY!", "bad", 1200);
      this.score[this.other(off).name] += 2;
      await this._say(this.scoreline());
      this.pres.updateBoard();
      if (this.q >= 5) { this.gameOver = true; await this._say("Overtime safety. Game over."); return; }
      this.offense = off; this.defense = this.other(off);
      this.yard = 0;
      await this.punt(off, this.other(off), true);
      return;
    }
    const from = this.yard;
    this.yard = Math.max(1, Math.min(100, this.yard + yards));
    if (this.yard >= 100) {
      await this.pres.moveBall(this.absOf(off, from), this.absOf(off, 100) + (off === this.leftTeam ? 5 : -5));
      await this.touchdown(off, this.other(off));
      return;
    }
    await this.pres.moveBall(this.absOf(off, from), this.absOf(off, this.yard));
    this.pres.setField(this.absOf(off, this.yard), this.absOf(off, this.lineToGain));
  }

  async finishDown(off, deff) {
    if (this.yard >= 100 || this.offense !== off) return;
    if (this.downResult === "first") {
      off.stats.firstDowns++;
      this.down = 1; this.driveStart = this.yard;
      this.lineToGain = Math.min(100, this.yard + 10);
      this.toGo = this.lineToGain - this.yard;
      this.downResult = null;
      await this._say("AUTOMATIC FIRST DOWN! " + off.name + " ball at " + this.fieldSpot() + ".", "good");
      this.pres.setField(this.absOf(off, this.yard), this.absOf(off, this.lineToGain));
      this.pres.updateBoard();
      return;
    }
    if (this.downResult === "replay") {
      this.toGo = Math.max(1, this.lineToGain - this.yard);
      this.downResult = null;
      await this._say("Down replayed: " + this.downDistance(off) + ".");
      this.pres.setField(this.absOf(off, this.yard), this.absOf(off, this.lineToGain));
      this.pres.updateBoard();
      return;
    }
    if (this.downResult === "loss") {
      this.down++;
      this.downResult = null;
      if (this.down > 4) {
        await this._say("Turnover on downs. " + deff.name + " take over.", "turnover");
        await this.turnover(off, deff, 100 - this.yard);
        return;
      }
      this.toGo = Math.max(1, this.lineToGain - this.yard);
      await this._say("Loss of down. Next play: " + this.downDistance(off) + ".");
      this.pres.setField(this.absOf(off, this.yard), this.absOf(off, this.lineToGain));
      this.pres.updateBoard();
      return;
    }
    if (this.yard >= this.lineToGain) {
      off.stats.firstDowns++;
      this.down = 1; this.driveStart = this.yard;
      this.lineToGain = Math.min(100, this.yard + 10);
      this.toGo = this.lineToGain - this.yard;
      await this.pres.banner("FIRST DOWN", "good", 700);
      await this._say("FIRST DOWN! " + off.name + " ball at " + this.fieldSpot() + ".", "good");
      this.pres.setField(this.absOf(off, this.yard), this.absOf(off, this.lineToGain));
      this.pres.updateBoard();
      return;
    }
    this.down++;
    this.toGo = Math.max(1, this.lineToGain - this.yard);
    if (this.down > 4) {
      await this._say("Turnover on downs. " + deff.name + " take over.", "turnover");
      await this.turnover(off, deff, 100 - this.yard);
    } else {
      await this._say("Next play: " + this.downDistance(off) + ".");
      this.pres.setField(this.absOf(off, this.yard), this.absOf(off, this.lineToGain));
      this.pres.updateBoard();
    }
  }

  async turnover(off, deff, newYard) {
    if (this.gameOver) return;
    newYard = Math.max(1, Math.min(99, newYard));
    await this._say("TURNOVER: " + deff.name + " take possession at " + this.fieldSpotFor(deff, newYard) + ".", "turnover");
    await this.setDrive(deff, off, newYard);
  }

  async resolveFumble(off, deff) {
    let a = 1 + Math.floor(Math.random() * 6);
    let b = 1 + Math.floor(Math.random() * 6);
    while (a === b) {
      await this._say("Fumble recovery tied at " + a + ". Roll again.", "dice");
      a = 1 + Math.floor(Math.random() * 6);
      b = 1 + Math.floor(Math.random() * 6);
    }
    await this._say("Fumble recovery: " + off.name + " roll " + a + ", " + deff.name + " roll " + b + ".", "dice");
    if (b > a) {
      off.stats.turnovers++; deff.stats.turnovers++;
      if (b === 6) {
        const [run] = roll(1);
        await this._say(deff.name + " recover and advance " + run + " yards.", "turnover");
        await this.turnover(off, deff, Math.min(99, 100 - this.yard + run));
      } else {
        await this.turnover(off, deff, 100 - this.yard);
      }
    } else if (a === 6) {
      const [run] = roll(1);
      await this._say(off.name + " recover and advance " + run + " yards.", "good");
      await this.advance(off, run);
    } else {
      await this._say(off.name + " recover their own fumble.");
    }
  }

  async handleMishap(off, deff, kind, playStartYard) {
    const [total, rs] = roll(2);
    await this._say("MISHAP! 2d6 [" + rollText(rs) + "] = " + total + ".", "penalty");
    if (total >= 9 && total <= 11) {
      const inj = 1 + Math.floor(Math.random() * 6);
      const stat = STAT_NAMES[inj - 1];
      const team = (stat === "QB" || stat === "RB" || stat === "WR") ? off : deff;
      team.minorInjuries.push(stat);
      team.stats.injuries++;
      await this._say("Injury roll: 1d6 = " + inj + " → " + stat + " injured.", "penalty");
            await this.pres.banner("INJURY: " + stat + " DOWN", "injury", 1300);
      await this._say("Minor injury: " + team.name + " " + stat + " is reduced for the rest of this game.", "penalty");
      return;
    }
    if (total === 12) {
      const inj = 1 + Math.floor(Math.random() * 6);
      const stat = STAT_NAMES[inj - 1];
      const team = (stat === "QB" || stat === "RB" || stat === "WR") ? off : deff;
      team.majorInjuries.push(stat);
      team.stats.injuries++;
      await this._say("Injury roll: 1d6 = " + inj + " → " + stat + " injured.", "penalty");
      await this.pres.banner("MAJOR INJURY: " + stat, "injury", 1400);
      await this._say("Major injury: " + team.name + " " + stat + " is reduced for the remainder of the season.", "penalty");
      return;
    }
    let foul;
    while (true) {
      foul = 1 + Math.floor(Math.random() * 20);
      if (foul === 12 && kind !== "pass") continue;
      if ((foul === 13 || foul === 14) && kind !== "pass") continue;
      break;
    }
    const labels = {
      1: "Offense — delay of game", 2: "Offense — false start", 3: "Offense — false start",
      4: "Offense — illegal formation", 5: "Offense — holding", 6: "Offense — holding",
      7: "Offense — holding", 8: "Offense — holding", 9: "Offense — holding", 10: "Offense — holding",
      11: "Offense — unnecessary roughness", 12: "Offense — pass interference",
      13: "Defense — pass interference", 14: "Defense — roughing the passer",
      15: "Defense — unnecessary roughness", 16: "Defense — face mask",
      17: "Defense — illegal use of hands", 18: "Defense — holding",
      19: "Defense — offsides", 20: "Defense — neutral zone infraction"
    };
    const yardsByFoul = { 1: 5, 2: 5, 3: 5, 4: 5, 5: 10, 6: 10, 7: 10, 8: 10, 9: 10, 10: 10,
                          11: 15, 12: 10, 14: 15, 15: 15, 16: 15, 17: 5, 18: 5, 19: 5, 20: 5 };
    const offensiveFoul = foul <= 12;
    const victim = offensiveFoul ? deff : off;
    const penaltyYards = yardsByFoul[foul] || 0;
    await this._say("Penalty roll: 1d20 = " + foul + " → " + labels[foul] + ".", "penalty");
    await this.pres.banner("FLAG ON THE FIELD!", "penalty", 900);
    let decline;
    if (victim === this.user) {
      const penalizedSide = offensiveFoul ? "offense" : "defense";
      const penalizedTeam = offensiveFoul ? off : deff;
      const d = await this.pres.ask("Flag is on the " + penalizedSide + " (" + penalizedTeam.name +
        ") — your " + (victim === off ? "offense" : "defense") + " may accept it or decline:", [
        { label: "Accept penalty", value: "Accept", group: "PENALTY" },
        { label: "Decline — play stands", value: "Decline", group: "PENALTY" }]);
      decline = d === "Decline";
    } else {
      const playGain = this.yard - playStartYard;
      if ([14, 15, 16, 17, 18].includes(foul)) decline = false;
      else if (offensiveFoul) decline = playGain > penaltyYards;
      else decline = playGain >= penaltyYards;
      await this._say("AI " + (decline ? "declines" : "accepts") + " the penalty.");
    }
    if (decline) {
      await this._say("Penalty declined — the play stands as it happened.");
      return;
    }
    victim.stats.penalties++;
    const offender = offensiveFoul ? off : deff;
    offender.stats.penalties++;
    if (offensiveFoul) {
      this.yard = Math.max(1, playStartYard - penaltyYards);
      if (foul >= 1 && foul <= 10) {
        this.downResult = "replay";
        await this._say(penaltyYards + "-yard offensive penalty; replay the down.", "penalty");
      } else {
        this.downResult = "loss";
        await this._say(penaltyYards + "-yard offensive penalty and loss of down.", "penalty");
      }
    } else if (foul === 13) {
      this.yard = Math.max(1, playStartYard);
      const [yards, rolls] = roll(3, 6, false);
      this.yard = Math.min(100, this.yard + yards);
      off.stats.completions++; off.stats.passYards += yards;
      off.stats.qbYards += yards; off.stats.wrYards += yards;
      await this._say("Defensive pass interference: automatic completion for " + yards +
                      " yards (" + rollText(rolls) + ").", "penalty");
      if (this.yard >= 100) {
        this.lastTDScorer = "wr";
        await this.pres.moveBall(this.absOf(off, playStartYard), this.absOf(off, 100) + (off === this.leftTeam ? 5 : -5));
        await this.touchdown(off, deff);
      }
    } else if (foul === 14) {
      this.yard = Math.min(100, this.yard + penaltyYards);
      this.downResult = "first";
      await this._say("Roughing the passer: 15 yards added to the play; automatic first down.", "penalty");
    } else if (foul <= 18) {
      this.yard = Math.min(100, playStartYard + penaltyYards);
      this.downResult = "first";
      await this._say(penaltyYards + "-yard defensive penalty; automatic first down.", "penalty");
    } else {
      this.yard = Math.min(100, playStartYard + penaltyYards);
      await this._say("Five-yard defensive penalty.", "penalty");
    }
    this.pres.setField(this.absOf(this.offense, this.yard), this.absOf(this.offense, this.lineToGain));
    this.pres.updateBoard();
  }

  async punt(off, deff, safety = false) {
    const [total, rs] = roll(2);
    const table = { 2: 35, 3: 40, 4: 45, 5: 45, 6: 50, 7: 50, 8: 55, 9: 55, 10: 60, 11: 65, 12: 70 };
    const dist = table[total];
    this.totalPlays++; this.roundInQ++;
    off.stats.punts++;
    this.pres.setPossession(off);
    this.pres.updateBoard();
    this.pres.setFormation("punt", "puntreturn");
    if (off === this.user) {
      await this.pres.ask("You are punting from " + this.fieldSpot() + ". Press KICK:", [
        { label: "Kick it!", value: "kick", group: "SPECIAL TEAMS" }]);
    }
    await this._say("PUNT: " + off.name + " punt " + dist + " yards (" + rollText(rs) + ").", "event");
    const landing = Math.min(100, this.yard + dist);
    const deep = this.yard + dist - 100;
    await this.pres.moveBall(this.absOf(off, this.yard), this.absOf(off, landing + Math.max(0, deep)), 800);
    if (deep > 0) {
      await this._say("The punt is caught " + deep + " yards deep in the end zone.");
      let choice;
      if (deff === this.user) {
        choice = await this.pres.ask("Punt is in the end zone. Choose:", [
          { label: "Return", value: "Return", group: "SPECIAL TEAMS" },
          { label: "Fair catch", value: "Fair catch", group: "SPECIAL TEAMS" }]);
      } else {
        choice = Math.random() < 0.5 ? "Return" : "Fair catch";
        await this._say("AI calls: " + choice.toLowerCase() + ".");
      }
      if (choice === "Fair catch") {
        await this._say("Fair catch in the end zone — touchback. " + deff.name + " start at their own 20.");
        await this.setDrive(deff, off, 20);
        return;
      }
      // End-zone punt return, resolved from the returner-relative spot of -deep.
      let [gain, rrs] = roll(3, 6, true);
      const bonus = deep + 8;
      gain += bonus;
      deff.stats.stYards += gain;
      await this._say(deff.name + " bring it out of the end zone (+" + bonus + " escape yardage) — " +
                      gain + " yards (" + rollText(rrs) + ").", "good");
      const end = -deep + gain;
      if (end <= 0) {
        await this._say(deff.name + " can't escape the end zone — touchback. They start at their own 20.");
        await this.setDrive(deff, off, 20);
        return;
      }
      const tdX = this.absOf(deff, 100) + (deff === this.leftTeam ? 5 : -5);
      await this.pres.moveBall(this.absOf(deff, -deep), end >= 100 ? tdX : this.absOf(deff, end), 800);
      if (end >= 100) {
        this.lastTDScorer = "st";
        await this.touchdown(deff, off);
      } else {
        await this.setDrive(deff, off, Math.min(99, end));
      }
      return;
    }
    const receivingYard = Math.max(1, 100 - (this.yard + dist));
    await this._say(deff.name + " field the punt at their own " + receivingYard + ".");
    let choice;
    if (deff === this.user) {
      choice = await this.pres.ask("Punt landed at your own " + receivingYard + ". Choose:", [
        { label: "Return", value: "Return", group: "SPECIAL TEAMS" },
        { label: "Fair catch", value: "Fair catch", group: "SPECIAL TEAMS" }]);
    } else {
      choice = Math.random() < 0.7 ? "Return" : "Fair catch";
      await this._say("AI calls: " + choice.toLowerCase() + ".");
    }
    if (choice === "Fair catch") {
      await this._say(deff.name + " fair-catch at their own " + receivingYard + ".");
      await this.setDrive(deff, off, receivingYard);
    } else {
      const [yards, rrs] = roll(3, 6, true);
      const final = receivingYard + yards;
      deff.stats.stYards += yards;
      await this.pres.moveBall(this.absOf(deff, receivingYard), this.absOf(deff, Math.min(99, final)), 800);
      await this._say(deff.name + " return the punt " + yards + " yards (" + rollText(rrs) +
                      "), to their own " + Math.min(99, final) + ".");
      await this.setDrive(deff, off, Math.min(99, final));
    }
  }

  async fieldGoal(off, deff, pat = false) {
    const distance = pat ? 27 : (117 - this.yard);
    const threshold = distance <= 29 ? 1 : distance <= 39 ? 5 : distance <= 49 ? 9 :
                      distance <= 59 ? 13 : distance <= 69 ? 16 : 19;
    this.totalPlays++; this.roundInQ++;
    this.pres.updateBoard();
    this.pres.setFormation("fieldgoal", "fgrush");
    if (off === this.user) {
      await this.pres.ask(pat ? "You are lining up for the extra point. Press KICK:" :
        "You are lined up for a " + distance + "-yard field goal. Press KICK:", [
        { label: "Kick it!", value: "kick", group: "SPECIAL TEAMS" }]);
    }
    const d20 = 1 + Math.floor(Math.random() * 20);
    const good = d20 > threshold;
    const dir = off === this.leftTeam ? 1 : -1;
    const start = this.absOf(off, this.yard);
    const posts = this.absOf(off, 100) + dir * 10; // the uprights plane
    await this._say("FIELD GOAL attempt: " + distance + " yards — the kick is up!", "event");
    // Good kicks split the uprights; misses sail wide of them.
    await this.pres.moveBall(start, posts, 900, good ? 0 : (Math.random() < 0.5 ? -0.22 : 0.22));
    await this._say("d20 = " + d20 + " (must roll over " + threshold + ").", "dice");
    if (good) {
      this.score[off.name] += pat ? 1 : 3;
      if (!pat) off.stats.fieldGoals++;
      await this.pres.banner(pat ? "PAT GOOD" : "FIELD GOAL IS GOOD!", "good", 1000);
      await this._say("The kick is GOOD! " + this.scoreline(), "good");
      this.pres.updateBoard();
      if (this.q >= 5) { this.gameOver = true; await this._say("Overtime score. Game over."); }
      else await this.kickoff(off, deff);
    } else {
      await this.pres.banner(pat ? "PAT NO GOOD" : "NO GOOD!", "bad", 900);
      await this._say("The kick is NO GOOD.", "bad");
      if (pat) {
        await this._say("Missed PAT: the scoring team still kicks off to the opponent.");
        if (this.q >= 5) this.gameOver = true;
        else await this.kickoff(off, deff);
      } else {
        await this._say(deff.name + " take over 7 yards behind the spot.");
        await this.setDrive(deff, off, Math.max(1, Math.min(99, 100 - (this.yard - 7))));
      }
    }
  }

  async touchdown(off, deff) {
    this.score[off.name] += 6;
    off.stats.touchdowns++;
    const scorer = this.lastTDScorer || "rb";
    if (scorer === "qb") { off.stats.qbTDs++; off.stats.rushTDs++; }
    else if (scorer === "wr") { off.stats.wrTDs++; off.stats.passTDs++; off.stats.qbPassTDs++; }
    else if (scorer === "st") { off.stats.stTDs++; }
    else { off.stats.rbTDs++; off.stats.rushTDs++; }
    this.lastTDScorer = null;
    await this.pres.banner("TOUCHDOWN!", "good", 1600);
    await this._say("TOUCHDOWN " + off.name + "! " + this.scoreline(), "event");
    this.pres.updateBoard();
    if (this.q >= 5) {
      this.gameOver = true;
      await this._say("Overtime sudden-death score. Game over.");
      return;
    }
    let choice;
    if (off === this.user) {
      choice = await this.pres.ask("Extra point:", [
        { label: "Kick PAT", value: "Kick PAT", group: "SPECIAL TEAMS" },
        { label: "Go for two", value: "Go for two", group: "OFFENSE" }]);
    } else {
      choice = Math.random() < 0.88 ? "Kick PAT" : "Go for two";
    }
    if (choice === "Kick PAT") {
      await this.fieldGoal(off, deff, true);
    } else {
      this.totalPlays++; this.roundInQ++;
      let kind;
      if (off === this.user) {
        const d = await this.pres.ask("Two-point try:", [
          { label: "Run", value: "Run", group: "OFFENSE" },
          { label: "Pass", value: "Pass", group: "OFFENSE" }]);
        kind = d === "Run" ? "run" : "pass";
      } else {
        kind = Math.random() < 0.55 ? "run" : "pass";
      }
      const dc = kind === "run" ? 6 + deff.b("LM") + deff.b("LB") : 8 + deff.b("DB") + deff.b("LB");
      const attackBonus = off.b("QB") + (kind === "run" ? off.b("RB") : off.b("WR"));
      const d20 = 1 + Math.floor(Math.random() * 20);
      await this._say("Two-point " + kind + " try: d20 " + d20 + " + " + attackBonus + " vs DC " + dc + ".", "dice");
      if (d20 !== 1 && d20 + attackBonus >= dc) {
        this.score[off.name] += 2;
        await this.pres.banner("TWO-POINT GOOD!", "good", 900);
        await this._say("Two-point conversion succeeds! " + this.scoreline(), "good");
        this.pres.updateBoard();
      } else {
        await this._say("Two-point conversion fails.", "bad");
      }
      await this.kickoff(off, deff);
    }
  }

  async kneel(off) {
    this.totalPlays++; this.roundInQ++;
    await this._say(off.name + " kneel down: loss of 2 yards.");
    await this.advance(off, -2);
    if (this.offense === off) await this.finishDown(off, this.other(off));
  }

  async hardCount(off, deff) {
    this.totalPlays++; this.roundInQ++;
    const a = 1 + Math.floor(Math.random() * 6) + off.b("QB");
    const b = 1 + Math.floor(Math.random() * 6) + deff.b("LM") + this.hardCountUses[off.name];
    this.hardCountUses[off.name] = this.hardCountUses[off.name] + 1;
    await this._say("Hard count: offense " + a + ", defense " + b + ".", "dice");
    if (a > b) {
      this.yard = Math.min(99, this.yard + 5);
      await this._say("The defense jumps offside — 5 yards!", "good");
    } else {
      this.yard = Math.max(1, this.yard - 5);
      await this._say("Delay of game — the offense loses 5 yards.", "bad");
    }
    this.pres.setField(this.absOf(off, this.yard), this.absOf(off, this.lineToGain));
    this.pres.updateBoard();
    if (this.offense === off) await this.finishDown(off, deff);
  }

  // Fake punt / fake field goal (4th down only): 1d6 >= 4 first try, >= 5 second, >= 6 after.
  // Success rolls 2d6 (no exploding) from the LOS; failure or a short gain gives the ball over.
  async fakeKick(off, deff, kind) {
    this.pres.setPossession(off);
    this.pres.updateBoard();
    this.pres.setFormation(kind === "punt" ? "punt" : "fieldgoal", kind === "punt" ? "puntreturn" : "fgrush");
    this.totalPlays++; this.roundInQ++;
    await this._say("FAKE " + kind.toUpperCase() + "! " + off.name + " try to catch the defense off guard.", "event");
    const uses = this.fakeUses[off.name] || 0;
    this.fakeUses[off.name] = uses + 1;
    const need = uses === 0 ? 4 : uses === 1 ? 5 : 6;
    const f = 1 + Math.floor(Math.random() * 6);
    await this._say("Fake roll: 1d6 = " + f + " (needs " + need + " or higher).", "dice");
    if (f >= need) {
      await this._say("The fake works! " + off.name + " run a play from the line of scrimmage.", "good");
      const [gain, rs] = roll(2, 6, false);
      await this._say("Yardage dice [" + rollText(rs) + "] produce " + gain + " yards.", "good");
      this.downResult = null;
      await this.advance(off, gain);
      if (!this.gameOver && this.offense === off) await this.finishDown(off, deff);
    } else {
      await this._say("The fake is sniffed out! " + off.name + " turn it over on downs at the line of scrimmage.", "bad");
      await this.turnover(off, deff, this.yard);
    }
  }

  async endQuarter() {
    if (this.q >= 4) {
      if (this.q === 4 && this.score[this.user.name] === this.score[this.ai.name]) {
        await this._say("Regulation tie — overtime begins. First score wins.", "event");
        await this.pres.banner("OVERTIME", "neutral", 1000);
        this.q = 5;
        this.roundInQ = 0;
        this.pres.updateBoard();
        return;
      }
      this.gameOver = true;
      return;
    }
    await this._say("END OF QUARTER " + this.q + " — " + this.scoreline(), "event");
    this.q++;
    this.roundInQ = 0;
    this.pres.updateBoard();
    if (this.q === 3) {
      for (const t of this.teams) if (t.minorInjuries.length) t.minorInjuries.splice(0, 1);
      const receiver = this.other(this.halfKickoffReceiver);
      this.halfKickoffReceiver = receiver;
      await this.pres.banner("HALFTIME", "neutral", 900);
      await this.pres.showStatsReport(this, "HALFTIME TEAM STATS");
      await this.kickoff(this.other(receiver), receiver);
    }
  }

  async finish() {
    this.pres.updateBoard();
    const out = {};
    out[this.user.name] = this.score[this.user.name];
    out[this.ai.name] = this.score[this.ai.name];
    await this.pres.showFinal(this);
    return out;
  }
}