require('dotenv').config();
const db = require('./database');

async function check() {
  await db.initDb();
  const gws = await db.getActiveGiveaways();
  const now = Date.now();
  console.log("Current Date.now():", now);
  console.log("Current time readable:", new Date(now).toISOString());
  
  if (gws.length === 0) console.log("No active giveaways.");
  
  for (const gw of gws) {
    const endsAt = parseInt(gw.ends_at);
    const diff = endsAt - now;
    console.log(`Giveaway #${gw.id} ends at ${endsAt} (${new Date(endsAt).toISOString()})`);
    console.log(`  Diff from now: ${diff}ms (${Math.floor(diff/60000)} minutes)`);
    console.log(`  Created at: ${gw.created_at} (${new Date(gw.created_at).getTime()})`);
    console.log(`  Calculated duration was probably: ${endsAt - new Date(gw.created_at).getTime()}ms (${Math.floor((endsAt - new Date(gw.created_at).getTime())/60000)} minutes)`);
  }
  process.exit(0);
}

check();
