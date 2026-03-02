const db = require('./database');
const achievementsHelper = require('./helpers/achievementsHelper');
const fs = require('fs');

async function runTests() {
    console.log("=== STARTING ACHIEVEMENT TESTS ===");
    
    // Simulate DB Init
    await db.initDb();

    const testUser = 'test_user_achievements';
    
    // 1. Initial State
    // Access pg pool directly
    await db.pool.query('DELETE FROM users WHERE id = $1', [testUser]);
    let u = await db.getUser(testUser);
    console.log("Initial user created:", u.id);

    // Mock client for testing
    const mockClient = {
        channels: {
            fetch: async () => ({ send: async () => {} })
        },
        users: {
            fetch: async () => ({ username: 'TestUser', displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1/1.png' })
        }
    };

    // Test CAPITAL Event
    console.log("\\n--- Testing CAPITAL ---");
    await db.setBalance(testUser, 15000n); // Should unlock CAP_01
    await achievementsHelper.triggerEvent(mockClient, db, testUser, 'CAPITAL', {});
    
    u = await db.getUser(testUser);
    let ach = typeof u.achievements === 'string' ? JSON.parse(u.achievements) : (u.achievements || {});
    console.log("Achievements after 15k:", ach);

    // Test RISK (Tapis Noir)
    console.log("\\n--- Testing RISK: Tapis Noir ---");
    await db.setBalance(testUser, 15000n);
    await achievementsHelper.triggerEvent(mockClient, db, testUser, 'RISK', {
        bet: 15000n, outcome: 'win', winChance: 0.5, potentialWin: 30000n, newBalance: 30000n
    });
    u = await db.getUser(testUser);
    let st = typeof u.stats_trackers === 'string' ? JSON.parse(u.stats_trackers) : (u.stats_trackers || {});
    console.log("Stats after 1 All in win:", st.consecutive_all_ins);

    await db.setBalance(testUser, 30000n);
    await achievementsHelper.triggerEvent(mockClient, db, testUser, 'RISK', {
        bet: 30000n, outcome: 'win', winChance: 0.5, potentialWin: 60000n, newBalance: 60000n
    });
    
    await db.setBalance(testUser, 60000n);
    await achievementsHelper.triggerEvent(mockClient, db, testUser, 'RISK', {
        bet: 60000n, outcome: 'win', winChance: 0.5, potentialWin: 120000n, newBalance: 120000n
    });

    u = await db.getUser(testUser);
    ach = typeof u.achievements === 'string' ? JSON.parse(u.achievements) : u.achievements;
    console.log("RISK_03 (Tapis Noir) unlocked:", ach['RISK_03'] === true);

    // Test RESILIENCE (Phenix)
    console.log("\\n--- Testing RESILIENCE: Phenix ---");
    await db.setBalance(testUser, 0n);
    await achievementsHelper.triggerEvent(mockClient, db, testUser, 'RESILIENCE', {
        bet: 120000n, outcome: 'loss', winChance: 0.5, newBalance: 0n
    });

    u = await db.getUser(testUser);
    st = typeof u.stats_trackers === 'string' ? JSON.parse(u.stats_trackers) : u.stats_trackers;
    console.log("Phenix Flag active:", st.phenix_flag);

    await db.setBalance(testUser, 1000000n);
    await achievementsHelper.triggerEvent(mockClient, db, testUser, 'RESILIENCE', {
        bet: 100n, outcome: 'win', winChance: 0.5, newBalance: 1000000n
    });

    u = await db.getUser(testUser);
    ach = typeof u.achievements === 'string' ? JSON.parse(u.achievements) : u.achievements;
    console.log("RES_03 (Phenix) unlocked:", ach['RES_03'] === true);

    console.log("\\n=== TESTS FINISHED ===");
    process.exit(0);
}

runTests().catch(console.error);
