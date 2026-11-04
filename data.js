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

// Real NFL roster names — the current player for each team at each of the
// game's six positions (ESPN depth charts, 2026). Player names are public
// facts, so a fan adaptation can use them (unlike team logos). Where a team's
// marquee player is only out with an injury, his name is kept over the fill-in.
// LM = defensive line (edge or interior), DB = corner or safety.
const PLAYER_NAMES = {
  // AFC East
  "Buffalo Bills":            { QB: "Josh Allen", RB: "James Cook III", WR: "Khalil Shakir", LM: "Ed Oliver", LB: "Terrel Bernard", DB: "Christian Benford" },
  "Miami Dolphins":           { QB: "Tua Tagovailoa", RB: "De'Von Achane", WR: "Malik Washington", LM: "Chop Robinson", LB: "Jordyn Brooks", DB: "Jason Marshall Jr." },
  "New England Patriots":     { QB: "Drake Maye", RB: "Rhamondre Stevenson", WR: "A.J. Brown", LM: "Christian Barmore", LB: "Robert Spillane", DB: "Christian Gonzalez" },
  "New York Jets":            { QB: "Geno Smith", RB: "Breece Hall", WR: "Garrett Wilson", LM: "Will McDonald IV", LB: "Demario Davis", DB: "Minkah Fitzpatrick" },
  // AFC North
  "Baltimore Ravens":         { QB: "Lamar Jackson", RB: "Derrick Henry", WR: "Zay Flowers", LM: "Nnamdi Madubuike", LB: "Roquan Smith", DB: "Marlon Humphrey" },
  "Cincinnati Bengals":       { QB: "Joe Burrow", RB: "Chase Brown", WR: "Ja'Marr Chase", LM: "Dexter Lawrence II", LB: "Barrett Carter", DB: "Bryan Cook" },
  "Cleveland Browns":         { QB: "Deshaun Watson", RB: "Quinshon Judkins", WR: "Jerry Jeudy", LM: "Jared Verse", LB: "Carson Schwesinger", DB: "Denzel Ward" },
  "Pittsburgh Steelers":      { QB: "Aaron Rodgers", RB: "Jaylen Warren", WR: "DK Metcalf", LM: "T.J. Watt", LB: "Patrick Queen", DB: "Jalen Ramsey" },
  // AFC South
  "Houston Texans":           { QB: "C.J. Stroud", RB: "Woody Marks", WR: "Nico Collins", LM: "Will Anderson Jr.", LB: "Azeez Al-Shaair", DB: "Derek Stingley Jr." },
  "Indianapolis Colts":       { QB: "Daniel Jones", RB: "Jonathan Taylor", WR: "Josh Downs", LM: "Jaylahn Tuimoloau", LB: "CJ Allen", DB: "Sauce Gardner" },
  "Jacksonville Jaguars":     { QB: "Trevor Lawrence", RB: "Bhayshul Tuten", WR: "Brian Thomas Jr.", LM: "Josh Hines-Allen", LB: "Foyesade Oluokun", DB: "Travis Hunter" },
  "Tennessee Titans":         { QB: "Cam Ward", RB: "Tony Pollard", WR: "Carnell Tate", LM: "Jermaine Johnson II", LB: "Anthony Hill Jr.", DB: "Amani Hooker" },
  // AFC West
  "Denver Broncos":           { QB: "Bo Nix", RB: "Jonah Coleman", WR: "Jaylen Waddle", LM: "Nik Bonitto", LB: "Alex Singleton", DB: "Pat Surtain II" },
  "Kansas City Chiefs":       { QB: "Patrick Mahomes", RB: "Kenneth Walker III", WR: "Rashee Rice", LM: "Chris Jones", LB: "Nick Bolton", DB: "Nohl Williams" },
  "Las Vegas Raiders":        { QB: "Kirk Cousins", RB: "Ashton Jeanty", WR: "Tre Tucker", LM: "Maxx Crosby", LB: "Quay Walker", DB: "Taron Johnson" },
  "Los Angeles Chargers":     { QB: "Justin Herbert", RB: "Omarion Hampton", WR: "Ladd McConkey", LM: "Khalil Mack", LB: "Daiyan Henley", DB: "Derwin James Jr." },
  // NFC East
  "Dallas Cowboys":           { QB: "Dak Prescott", RB: "Javonte Williams", WR: "CeeDee Lamb", LM: "Quinnen Williams", LB: "DeMarvion Overshown", DB: "DaRon Bland" },
  "New York Giants":          { QB: "J.J. McCarthy", RB: "Cam Skattebo", WR: "Malik Nabers", LM: "Abdul Carter", LB: "Micah McFadden", DB: "Jevon Holland" },
  "Philadelphia Eagles":      { QB: "Jalen Hurts", RB: "Saquon Barkley", WR: "DeVonta Smith", LM: "Jalen Carter", LB: "Zack Baun", DB: "Quinyon Mitchell" },
  "Washington Commanders":    { QB: "Jayden Daniels", RB: "Rachaad White", WR: "Stefon Diggs", LM: "Odafe Oweh", LB: "Frankie Luvu", DB: "Amik Robertson" },
  // NFC North
  "Chicago Bears":            { QB: "Caleb Williams", RB: "D'Andre Swift", WR: "Rome Odunze", LM: "Jeffery Simmons", LB: "T.J. Edwards", DB: "Jaylon Johnson" },
  "Detroit Lions":            { QB: "Jared Goff", RB: "Jahmyr Gibbs", WR: "Amon-Ra St. Brown", LM: "Aidan Hutchinson", LB: "Jack Campbell", DB: "Brian Branch" },
  "Green Bay Packers":        { QB: "Jordan Love", RB: "Josh Jacobs", WR: "Matthew Golden", LM: "Micah Parsons", LB: "Ty'Ron Hopper", DB: "Xavier McKinney" },
  "Minnesota Vikings":        { QB: "Kyler Murray", RB: "Jordan Mason", WR: "Justin Jefferson", LM: "Andrew Van Ginkel", LB: "Blake Cashman", DB: "Harrison Smith" },
  // NFC South
  "Atlanta Falcons":          { QB: "Michael Penix Jr.", RB: "Bijan Robinson", WR: "Drake London", LM: "Brandon Dorlus", LB: "Divine Deablo", DB: "Jessie Bates III" },
  "Carolina Panthers":        { QB: "Bryce Young", RB: "Chuba Hubbard", WR: "Tetairoa McMillan", LM: "Derrick Brown", LB: "Bobby Okereke", DB: "Tre'von Moehrig" },
  "New Orleans Saints":       { QB: "Tyler Shough", RB: "Alvin Kamara", WR: "Chris Olave", LM: "Cameron Jordan", LB: "Pete Werner", DB: "Kool-Aid McKinstry" },
  "Tampa Bay Buccaneers":     { QB: "Baker Mayfield", RB: "Bucky Irving", WR: "Emeka Egbuka", LM: "Vita Vea", LB: "Alex Anzalone", DB: "Antoine Winfield Jr." },
  // NFC West
  "Arizona Cardinals":        { QB: "Gardner Minshew II", RB: "Tyler Allgeier", WR: "Michael Wilson", LM: "Josh Sweat", LB: "Mack Wilson Sr.", DB: "Budda Baker" },
  "Los Angeles Rams":         { QB: "Matthew Stafford", RB: "Kyren Williams", WR: "Puka Nacua", LM: "Myles Garrett", LB: "Nate Landman", DB: "Trent McDuffie" },
  "San Francisco 49ers":      { QB: "Brock Purdy", RB: "Christian McCaffrey", WR: "Mike Evans", LM: "Nick Bosa", LB: "Fred Warner", DB: "Ji'Ayir Brown" },
  "Seattle Seahawks":         { QB: "Sam Darnold", RB: "Zach Charbonnet", WR: "Jaxon Smith-Njigba", LM: "Leonard Williams", LB: "Ernest Jones IV", DB: "Devon Witherspoon" },
};

// The real roster name for a team at a position, or null.
function rosterName(team, pos) {
  const r = PLAYER_NAMES[team];
  return r && r[pos] ? r[pos] : null;
}