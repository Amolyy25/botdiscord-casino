function parseDuration(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)(m|h|d|j|s)$/i);
  if (!match) return null;
  const val = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, j: 86_400_000 };
  return val * (multipliers[unit] || 0);
}

console.log("2h" , parseDuration("2h"));
console.log("2 h" , parseDuration("2 h")); // null
console.log("2H" , parseDuration("2H")); 
