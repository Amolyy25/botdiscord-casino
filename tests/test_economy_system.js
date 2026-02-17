const assert = require('assert');
const { createEmbed, COLORS, formatCoins } = require('../utils');
const shopData = require('../shop.json');

// --- Mocking ---

class MockDB {
    constructor() {
        this.users = new Map();
        this.shopPurchases = [];
        this.shopEffects = [];
        this.roleExpirations = [];
    }

    async getUser(id) {
        if (!this.users.has(id)) {
            this.users.set(id, { id, balance: "5000", tirages: 0 });
        }
        return this.users.get(id);
    }

    async updateBalance(id, amount) {
        const user = await this.getUser(id);
        const newBalance = BigInt(user.balance) + BigInt(amount);
        user.balance = newBalance.toString();
        this.users.set(id, user);
        return newBalance;
    }

    async addShopPurchase(userId, itemId, targetId, price) {
        this.shopPurchases.push({ userId, itemId, targetId, price });
    }

    async addShopEffect(targetId, userId, type, value, extraData, expiresAt) {
        this.shopEffects.push({ targetId, userId, type, value, extraData, expiresAt });
    }
}

class MockMember {
    constructor(id, displayName, roles = [], joinedTimestamp = Date.now()) {
        this.id = id;
        this.displayName = displayName;
        this.roles = {
            cache: new Map(roles.map(r => [r.id, r])),
            add: async (roleId) => {
                this.roles.cache.set(roleId, { id: roleId });
            },
            remove: async (roleId) => {
                this.roles.cache.delete(roleId);
            },
            highest: { position: 10 }
        };
        this.user = { id, tag: displayName, username: displayName, bot: false };
        this.joinedTimestamp = joinedTimestamp;
        this.moderatable = true;
    }
    
    isCommunicationDisabled() { return false; }
    timeout() { return Promise.resolve(); }
    setNickname() { return Promise.resolve(); }
}

class MockGuild {
    constructor() {
        this.members = {
            cache: new Map(),
            fetch: async (id) => {
                const fetchedId = typeof id === 'object' && id.user ? id.user : id;
                if (this.members.cache.has(fetchedId)) return this.members.cache.get(fetchedId);
                // Return mock if not found in cache for simplicity? Or create new
                return new MockMember(fetchedId, "Unknown");
            }
        };
        this.roles = {
            cache: new Map(),
            fetch: async () => {} 
        };
    }

    addMember(member) {
        this.members.cache.set(member.id, member);
    }
}

class MockInteraction {
    constructor(user, guild, customId, values = []) {
        this.user = user;
        this.member = guild.members.cache.get(user.id);
        this.guild = guild;
        this.customId = customId;
        this.values = values;
        this.replied = false;
        this.deferred = false;
        this.replies = [];
        this.updates = [];
        this.client = { users: { fetch: async (id) => ({ id, bot: false }) } };
    }

    isStringSelectMenu() { return false; } // Override per test
    isButton() { return false; }
    isUserSelectMenu() { return false; }
    isModalSubmit() { return false; }

    async reply(options) {
        this.replied = true;
        this.replies.push(options);
    }

    async update(options) {
        this.updates.push(options);
    }
    
    async deferReply() { this.deferred = true; }
    async deferUpdate() { this.deferred = true; }
    async editReply(options) { this.updates.push(options); }
    async followUp(options) { this.replies.push(options); }
}

// --- Tests ---

async function runTests() {
    const shop = require('../events/shop');
    const db = new MockDB();
    const guild = new MockGuild();
    
    // User 1 (Tester)
    const user1 = new MockMember("u1", "Tester", [], Date.now() - 100000000);
    guild.addMember(user1);

    // User 2 (Rich Victim)
    const user2 = new MockMember("u2", "RichGuy", [], Date.now() - 100000000);
    guild.addMember(user2);
    await db.users.set("u2", { id: "u2", balance: "10000", tirages: 0 }); // 10k coins

    // User 3 (Newcomer)
    const user3 = new MockMember("u3", "Noob", [], Date.now() - 1000); // Just joined
    guild.addMember(user3);

    console.log("▶️  Starting Tests...\n");

    // 1. Test Buyback (Adding role first)
    console.log("🧪 Test 1: Buyback System");
    
    // Mock user having role
    const fakeRoleItem = shopData.items.find(i => i.id === "cmd_fake");
    user1.roles.cache.set(fakeRoleItem.roleId, { id: fakeRoleItem.roleId });
    
    // Interaction: Select category 'revente'
    const interaction1 = new MockInteraction(user1.user, guild, "shop_category", ["revente"]);
    interaction1.isStringSelectMenu = () => true;

    await shop.handleInteraction(interaction1, db);
    
    if (interaction1.replies.length > 0) {
        console.log("  ✅ Revente menu displayed");
    } else {
        console.error("  ❌ Failed to display revente menu");
    }

    // Interaction: Select item to sell
    const interactionSell = new MockInteraction(user1.user, guild, "shop_sell_items", [`sell_${fakeRoleItem.id}`]);
    interactionSell.isStringSelectMenu = () => true;
    
    await shop.handleInteraction(interactionSell, db);
    
    // Interaction: Confirm Sell
    const interactionConfirm = new MockInteraction(user1.user, guild, `shop_confirm_sell.${fakeRoleItem.id}`);
    interactionConfirm.isButton = () => true;

    const balanceBefore = BigInt((await db.getUser("u1")).balance);
    
    await shop.handleInteraction(interactionConfirm, db);
    
    const balanceAfter = BigInt((await db.getUser("u1")).balance);
    const expectedRefund = BigInt(Math.floor(fakeRoleItem.price * 0.5));
    
    if (balanceAfter - balanceBefore === expectedRefund) {
        console.log(`  ✅ Balance refunded correctly (+${expectedRefund})`);
    } else {
        console.error(`  ❌ Balance mismatch. Expected +${expectedRefund}, got +${balanceAfter - balanceBefore}`);
    }


    // 2. Test Dynamic Theft
    console.log("\n🧪 Test 2: Dynamic Theft Pricing");
    const stealItem = shopData.items.find(i => i.type === "instant_steal");
    
    // Confirm Steal Button
    // Expected Price: 10000 * 0.2 * 0.6 = 1200
    const interactionStealConfirm = new MockInteraction(user1.user, guild, `shop_force_steal.${stealItem.id}.u2`);
    interactionStealConfirm.isButton = () => true;

    // We spy on db.updateBalance to check deduction
    const balanceBeforeTheft = BigInt((await db.getUser("u1")).balance);
    
    await shop.handleInteraction(interactionStealConfirm, db);

    const balanceAfterTheft = BigInt((await db.getUser("u1")).balance);
    const deduction = balanceBeforeTheft - balanceAfterTheft; // Should be the price
    // Note: The thief also GETS the stolen amount.
    // Theft amount: 10000 * 0.2 (+bonus? No bonus here, just logic).
    // Logic in shop.js: updateBalance(target, -finalSteal); updateBalance(user, finalSteal);
    // AND updateBalance(user, -price) happens inside processPurchase logic.
    
    // Wait, processPurchase deducts price.
    // dynamicPrice = 1200.
    // finalSteal = floor(10000 * (random 0.1-0.3)). Let's say we check logic is triggered.
    // We can check shopPurchases log in MockDB.
    
    const purchase = db.shopPurchases.find(p => p.userId === "u1" && p.targetId === "u2" && p.itemId === stealItem.id);
    if (purchase) {
         if (BigInt(purchase.price) === 1200n) {
             console.log("  ✅ Dynamic price calculated correctly (1200 coins)");
         } else {
             console.error(`  ❌ Wrong price. Expected 1200, got ${purchase.price}`);
         }
    } else {
        console.error("  ❌ Purchase not processed");
    }


    // 3. Test Newcomer Shield
    console.log("\n🧪 Test 3: Newcomer Shield");
    const muteItem = shopData.items.find(i => i.type === "timeout");
    
    // Interaction: Select target u3 (Newcomer)
    const interactionTarget = new MockInteraction(user1.user, guild, `shop_target.${muteItem.id}`, ["u3"]);
    interactionTarget.isUserSelectMenu = () => true;
    
    await shop.handleInteraction(interactionTarget, db);
    
    // Check replis/updates
    const shieldMsg = interactionTarget.updates.find(u => u.embeds && u.embeds[0].data.description.includes("Cible protégée"));
    if (shieldMsg) {
        console.log("  ✅ Shield activated: Action blocked");
    } else {
        console.error("  ❌ Shield FAILED: Action went through");
    }

    console.log("\nDone.");
}

runTests().catch(console.error);
