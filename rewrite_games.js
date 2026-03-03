const fs = require('fs');

const files = fs.readdirSync('commands').filter(f => f.endsWith('.js'));
for (const f of files) {
  const p = 'commands/' + f;
  let code = fs.readFileSync(p, 'utf8');
  let changed = false;
  
  if (code.includes('if (eventsManager.isDoubleGainActive()) profit *= 2n;')) {
      code = code.replace(/if\s*\(eventsManager\.isDoubleGainActive\(\)\)\s*profit\s*\*\=\s*2n;/g, 'profit = eventsManager.applyGloryHourMultiplier(profit);');
      changed = true;
  }
  if (code.includes('if (eventsManager.isDoubleGainActive()) winAmount *= 2n;')) {
      code = code.replace(/if\s*\(eventsManager\.isDoubleGainActive\(\)\)\s*winAmount\s*\*\=\s*2n;/g, 'winAmount = eventsManager.applyGloryHourMultiplier(winAmount);');
      changed = true;
  }
  if (code.includes('eventsManager.isDoubleGainActive() ? 2n : 1n')) {
      code = code.replace(/eventsManager\.isDoubleGainActive\(\)\s*\?\s*2n\s*:\s*1n/g, 'eventsManager.getGloryHourMultiplier()');
      changed = true;
  }
  if (code.includes('if (eventsManager.isDoubleGainActive()) {\\n                profit *= 2n; // We multiply exactly what they gained\\n            }')) {
      code = code.replace(/if\s*\(eventsManager\.isDoubleGainActive\(\)\)\s*\{\s*profit\s*\*\=\s*2n;\s*\/\/\s*We multiply exactly what they gained\s*\}/g, 'profit = eventsManager.applyGloryHourMultiplier(profit);');
      changed = true;
  }
  if (code.includes('if (eventsManager.isDoubleGainActive()) {\\n                winAmount *= 2n;\\n            }')) {
      code = code.replace(/if\s*\(eventsManager\.isDoubleGainActive\(\)\)\s*\{\s*winAmount\s*\*\=\s*2n;\s*\}/g, 'winAmount = eventsManager.applyGloryHourMultiplier(winAmount);');
      changed = true;
  }

  // Crash specific:
  if (f === 'crash.js') {
     code = code.replace(/profit\s*\*\=\s*2n;/g, 'profit = eventsManager.applyGloryHourMultiplier(profit);');
     changed = true;
  }
  if (f === 'roulette.js') {
     code = code.replace(/winAmount\s*\*\=\s*2n;/g, 'winAmount = eventsManager.applyGloryHourMultiplier(winAmount);');
     changed = true;
  }

  if (changed) {
     fs.writeFileSync(p, code);
     console.log('Rewrote '+p);
  }
}
