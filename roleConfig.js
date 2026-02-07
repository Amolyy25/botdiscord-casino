const CASINO_CATEGORY_ID = '1469071692172361836';
const CASINO_CHANNEL_ID = '1469071692348264634';
const WINS_CHANNEL_ID = '1469719884249301176';

// Role IDs and their probabilities
const ROLE_POOL = [
    { id: '1469071689831940302', name: 'Blanc', probability: 0.0005, color: '#FFFFFF' },
    { id: '1469071689831940301', name: 'Violet', probability: 0.01, color: '#9B59B6' },
    { id: '1469071689823289446', name: 'Noir', probability: 0.005, color: '#000000' },
    { id: '1469071689823289445', name: 'Cyan', probability: 0.02, color: '#00FFFF' },
    { id: '1469071689823289444', name: 'Jaune', probability: 0.10, color: '#FFFF00' },
    { id: '1469071689823289443', name: 'Rouge foncé', probability: 0.05, color: '#8B0000' },
    { id: '1469071689823289442', name: 'Rouge Claire', probability: 0.05, color: '#FF6B6B' },
    { id: '1469071689823289441', name: 'Orange', probability: 0.10, color: '#FFA500' },
    { id: '1469071689823289440', name: 'Vert foncé', probability: 0.10, color: '#006400' },
    { id: '1469071689823289439', name: 'Vert Claire', probability: 0.10, color: '#90EE90' },
    { id: '1469071689823289438', name: 'Bleu foncé', probability: 0.23225, color: '#00008B' },
    { id: '1469071689823289437', name: 'Bleu Claire', probability: 0.23225, color: '#87CEEB' }
];

// Special role IDs for weekly tirages
const BOOSTER_ROLE_ID = '1469071689399926791'; // 1 tirage per week
const PREMIUM_ROLE_ID = '1469314101615398995'; // 2 tirages per week

function drawRole() {
    const random = Math.random();
    let cumulative = 0;
    
    for (const role of ROLE_POOL) {
        cumulative += role.probability;
        if (random <= cumulative) {
            return role;
        }
    }
    
    // Fallback to last role if something goes wrong
    return ROLE_POOL[ROLE_POOL.length - 1];
}

module.exports = {
    CASINO_CATEGORY_ID,
    CASINO_CHANNEL_ID,
    WINS_CHANNEL_ID,
    ROLE_POOL,
    BOOSTER_ROLE_ID,
    PREMIUM_ROLE_ID,
    drawRole
};
