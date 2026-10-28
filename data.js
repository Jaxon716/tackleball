"use strict";

const STAT_NAMES = ["QB", "RB", "WR", "LM", "LB", "DB"];

// Adapted game ratings (QB, RB, WR, LM, LB, DB) on the rulebook's 3-18 scale.
// Ratings are game adaptations from broad team-strength tiers, not official NFL data.
const TEAMS = {
  "Arizona Cardinals":      { abbr: "ARI", primary: "#97233F", alt: "#000000", text: "#FFFFFF", qb: 11, rb: 11, wr: 12, lm: 10, lb: 11, db: 11 },
  "Atlanta Falcons":        { abbr: "ATL", primary: "#A71930", alt: "#000000", text: "#FFFFFF", qb: 13, rb: 12, wr: 13, lm: 12, lb: 11, db: 12 },
  "Baltimore Ravens":       { abbr: "BAL", primary: "#241773", alt: "#9E7C0C", text: "#FFFFFF", qb: 15, rb: 15, wr: 13, lm: 14, lb: 15, db: 14 },
  "Buffalo Bills":          { abbr: "BUF", primary: "#00338D", alt: "#C60C30", text: "#FFFFFF", qb: 16, rb: 13, wr: 14, lm: 13, lb: 13, db: 13 },
  "Carolina Panthers":      { abbr: "CAR", primary: "#0085CA", alt: "#101820", text: "#FFFFFF", qb: 10, rb: 11, wr: 11, lm: 11, lb: 11, db: 11 },
  "Chicago Bears":          { abbr: "CHI", primary: "#0B162A", alt: "#C83803", text: "#FFFFFF", qb: 13, rb: 13, wr: 12, lm: 13, lb: 13, db: 13 },
  "Cincinnati Bengals":     { abbr: "CIN", primary: "#FB4F14", alt: "#000000", text: "#FFFFFF", qb: 15, rb: 11, wr: 15, lm: 12, lb: 11, db: 12 },
  "Cleveland Browns":       { abbr: "CLE", primary: "#311D00", alt: "#FF3C00", text: "#FFFFFF", qb: 11, rb: 12, wr: 11, lm: 13, lb: 13, db: 12 },
  "Dallas Cowboys":         { abbr: "DAL", primary: "#041E42", alt: "#869397", text: "#FFFFFF", qb: 14, rb: 13, wr: 14, lm: 13, lb: 12, db: 12 },
  "Denver Broncos":         { abbr: "DEN", primary: "#FB4F14", alt: "#002244", text: "#FFFFFF", qb: 13, rb: 12, wr: 12, lm: 14, lb: 14, db: 14 },
  "Detroit Lions":          { abbr: "DET", primary: "#0076B6", alt: "#B0B7BC", text: "#FFFFFF", qb: 15, rb: 14, wr: 14, lm: 15, lb: 13, db: 12 },
  "Green Bay Packers":      { abbr: "GB",  primary: "#203731", alt: "#FFB612", text: "#FFFFFF", qb: 14, rb: 13, wr: 14, lm: 13, lb: 12, db: 13 },
  "Houston Texans":         { abbr: "HOU", primary: "#03202F", alt: "#A71930", text: "#FFFFFF", qb: 14, rb: 12, wr: 13, lm: 13, lb: 13, db: 13 },
  "Indianapolis Colts":     { abbr: "IND", primary: "#002C5F", alt: "#A2AAAD", text: "#FFFFFF", qb: 13, rb: 13, wr: 12, lm: 12, lb: 12, db: 12 },
  "Jacksonville Jaguars":   { abbr: "JAX", primary: "#006778", alt: "#D7A22A", text: "#FFFFFF", qb: 12, rb: 12, wr: 12, lm: 12, lb: 11, db: 11 },
  "Kansas City Chiefs":     { abbr: "KC",  primary: "#E31837", alt: "#FFB81C", text: "#FFFFFF", qb: 15, rb: 12, wr: 14, lm: 13, lb: 12, db: 12 },
  "Las Vegas Raiders":      { abbr: "LV",  primary: "#000000", alt: "#A5ACAF", text: "#FFFFFF", qb: 11, rb: 12, wr: 12, lm: 12, lb: 11, db: 11 },
  "Los Angeles Chargers":   { abbr: "LAC", primary: "#0080C6", alt: "#FFC20E", text: "#FFFFFF", qb: 14, rb: 12, wr: 14, lm: 12, lb: 12, db: 12 },
  "Los Angeles Rams":       { abbr: "LAR", primary: "#003594", alt: "#FFD100", text: "#FFFFFF", qb: 14, rb: 13, wr: 14, lm: 14, lb: 13, db: 12 },
  "Miami Dolphins":         { abbr: "MIA", primary: "#008E97", alt: "#FC4C02", text: "#FFFFFF", qb: 14, rb: 13, wr: 14, lm: 12, lb: 11, db: 12 },
  "Minnesota Vikings":      { abbr: "MIN", primary: "#4F2683", alt: "#FFC62F", text: "#FFFFFF", qb: 14, rb: 12, wr: 14, lm: 13, lb: 13, db: 13 },
  "New England Patriots":   { abbr: "NE",  primary: "#002244", alt: "#C60C30", text: "#FFFFFF", qb: 12, rb: 11, wr: 12, lm: 12, lb: 13, db: 13 },
  "New Orleans Saints":     { abbr: "NO",  primary: "#D3BC45", alt: "#101820", text: "#FFFFFF", qb: 12, rb: 12, wr: 12, lm: 12, lb: 12, db: 12 },
  "New York Giants":        { abbr: "NYG", primary: "#0B2265", alt: "#A71930", text: "#FFFFFF", qb: 11, rb: 11, wr: 11, lm: 12, lb: 12, db: 12 },
  "New York Jets":          { abbr: "NYJ", primary: "#125740", alt: "#000000", text: "#FFFFFF", qb: 11, rb: 11, wr: 11, lm: 13, lb: 14, db: 13 },
  "Philadelphia Eagles":    { abbr: "PHI", primary: "#004C54", alt: "#A5ACAF", text: "#FFFFFF", qb: 15, rb: 14, wr: 14, lm: 15, lb: 13, db: 13 },
  "Pittsburgh Steelers":    { abbr: "PIT", primary: "#FFB612", alt: "#101820", text: "#FFFFFF", qb: 12, rb: 12, wr: 12, lm: 14, lb: 15, db: 14 },
  "San Francisco 49ers":    { abbr: "SF",  primary: "#AA0000", alt: "#B3995F", text: "#FFFFFF", qb: 14, rb: 15, wr: 14, lm: 15, lb: 14, db: 13 },
  "Seattle Seahawks":       { abbr: "SEA", primary: "#002244", alt: "#69BE28", text: "#FFFFFF", qb: 13, rb: 13, wr: 13, lm: 13, lb: 12, db: 12 },
  "Tampa Bay Buccaneers":   { abbr: "TB",  primary: "#D50A0A", alt: "#34302B", text: "#FFFFFF", qb: 14, rb: 12, wr: 14, lm: 13, lb: 12, db: 12 },
  "Tennessee Titans":       { abbr: "TEN", primary: "#0C2340", alt: "#4B92DB", text: "#FFFFFF", qb: 11, rb: 13, wr: 11, lm: 12, lb: 12, db: 11 },
  "Washington Commanders":  { abbr: "WAS", primary: "#5A1414", alt: "#FFB612", text: "#FFFFFF", qb: 13, rb: 12, wr: 13, lm: 12, lb: 12, db: 12 },
};

const DIVISIONS = {
  "AFC East":  ["Buffalo Bills", "Miami Dolphins", "New England Patriots", "New York Jets"],
  "AFC North": ["Baltimore Ravens", "Cincinnati Bengals", "Cleveland Browns", "Pittsburgh Steelers"],
  "AFC South": ["Houston Texans", "Indianapolis Colts", "Jacksonville Jaguars", "Tennessee Titans"],
  "AFC West":  ["Denver Broncos", "Kansas City Chiefs", "Las Vegas Raiders", "Los Angeles Chargers"],
  "NFC East":  ["Dallas Cowboys", "New York Giants", "Philadelphia Eagles", "Washington Commanders"],
  "NFC North": ["Chicago Bears", "Detroit Lions", "Green Bay Packers", "Minnesota Vikings"],
  "NFC South": ["Atlanta Falcons", "Carolina Panthers", "New Orleans Saints", "Tampa Bay Buccaneers"],
  "NFC West":  ["Arizona Cardinals", "Los Angeles Rams", "San Francisco 49ers", "Seattle Seahawks"],
};

const PASS_SPECIALS = {
  "Hook":            [6,  "2d6", false],
  "Double Pass":     [10, "4d6", true],
  "Flea Flicker":    [12, "4d6", true],
  "Hail Mary":       [18, "TD",  true],
  "Hook & Lateral":  [10, "4d6", true],
  "Hurry Up":        [10, "3d6", false],
  "Long Bomb":       [14, "6d6", false],
  "Play-Action":     [10, "4d6", false],
  "Screen Pass":     [10, "4d6", false],
  "Shotgun":         [9,  "3d6", false],
  "West Coast":      [8,  "2d6", false],
};

const RUN_SPECIALS = {
  "Blast":               [4,  "1d6", false],
  "Draw":                [7,  "3d6", false],
  "End Run":             [7,  "3d6", false],
  "Halfback Option":     [8,  "3d6", true],
  "Option":              [8,  "3d6", false],
  "QB Sneak":            [4,  "1d6", true],
  "Reverse":             [8,  "3d6", true],
  "Statue of Liberty":   [10, "4d6", true],
  "Sweep":               [8,  "3d6", false],
};