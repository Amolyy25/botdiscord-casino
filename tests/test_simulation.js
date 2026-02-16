const { EventEmitter } = require('events');

// --- MOCKS ---

class MockUser {
    constructor(id, username) {
        this.id = id;
        this.username = username;
        this.balance = 1000n; // Start with 1000 coins
    }

    displayAvatarURL() { return 'http://avatar.url'; }
}

class MockDB {
    constructor() {
        this.users = new Map();
    }

    async getUser(id) {
        if (!this.users.has(id)) {
            this.users.set(id, new MockUser(id, 'TestUser'));
        }
        return this.users.get(id);
    }

    async updateBalance(id, amount) {
        const user = await this.getUser(id);
        user.balance += BigInt(amount);
        console.log(`[DB] Balance updated for ${user.username}: ${amount} (New: ${user.balance})`);
        return user.balance;
    }
}

class MockInteraction {
    constructor(customId, user, message) {
        this.customId = customId;
        this.user = user;
        this.message = message;
        this.replied = false;
        this.deferred = false;
    }

    async update(options) {
        // console.log(`[Interaction] Update called for ${this.customId}`);
        if (this.message) {
            await this.message.edit(options);
        }
        this.replied = true;
    }

    async deferUpdate() {
        // console.log(`[Interaction] DeferUpdate called for ${this.customId}`);
        this.deferred = true;
    }
}

class MockCollector extends EventEmitter {
    constructor() {
        super();
    }

    stop(reason = 'user') {
        // console.log(`[Collector] Stopped. Reason: ${reason}`);
        this.emit('end', new Map(), reason);
    }
}

class MockMessage {
    constructor(client, content, author) {
        this.client = client;
        this.content = content;
        this.author = author;
        this.id = 'msg_' + Date.now();
        this.embeds = [];
        this.components = [];
        this.collector = null;
    }

    async reply(options) {
        // console.log(`[Message] Reply sent.`);
        const replyMsg = new MockMessage(this.client, '', this.client.user);
        replyMsg.embeds = options.embeds || [];
        replyMsg.components = options.components || [];
        return replyMsg;
    }

    async edit(options) {
        // console.log(`[Message] Edited.`);
        if (options.embeds) this.embeds = options.embeds;
        if (options.components) this.components = options.components;
        return this;
    }

    createMessageComponentCollector(options) {
        this.collector = new MockCollector();
        return this.collector;
    }
}

class MockChannel {
    constructor() {
        this.id = 'channel_1';
    }
    async send(content) {
        console.log(`[Channel] Message sent:`, content.embeds ? '[Embed]' : content);
    }
}

class MockClient {
    constructor() {
        this.user = new MockUser('bot_id', 'CasinoBot');
        this.channels = {
            fetch: async (id) => new MockChannel()
        };
    }
}

// --- TEST RUNNER ---

const db = new MockDB();
const client = new MockClient();

async function runTest(gameName, commandFile, args, interactionSequence = []) {
    console.log(`\n--- TESTING GAME: ${gameName} ---`);
    const author = await db.getUser('tester_1');
    const message = new MockMessage(client, `;${gameName}`, author);
    
    // Override message.reply to capture the game message
    const originalReply = message.reply;
    let gameMessage;
    
    message.reply = async (options) => {
        gameMessage = await originalReply.call(message, options);
        return gameMessage;
    };

    try {
        await commandFile.execute(message, args, db);
    } catch (e) {
        console.error(`[CRITICAL] Game ${gameName} crashed on execute:`, e);
        return;
    }

    if (!gameMessage) {
        console.log(`[Warning] No game message returned (maybe error or instant finish).`);
        return;
    }

    if (interactionSequence.length > 0 && gameMessage.collector) {
        for (const action of interactionSequence) {
            console.log(`> Simulating action: ${action.customId}`);
            
            // Wait a bit to simulate user think time
            await new Promise(r => setTimeout(r, 100));

            const interaction = new MockInteraction(action.customId, author, gameMessage);
            
            // Emit the collect event
            // Note: Some games verify i.user.id, which we mocked correctly
            try {
                // If it's a dynamic ID (like towers_door_X), we use it directly
                // If the game logic needs specific ID formatting (like crash_cashout_MSGID), handle it
                if (action.customId === 'CASH_OUT_DYNAMIC') {
                    interaction.customId = `crash_cashout_${message.id}`;
                }

                await gameMessage.collector.emit('collect', interaction);
            } catch (e) {
                console.error(`[Error] Error during interaction ${action.customId}:`, e);
            }
        }
    } else if (interactionSequence.length > 0) {
        console.log(`[Error] Interactions requested but no collector found.`);
    }

    console.log(`--- END TEST: ${gameName} ---\n`);
}

// --- LOAD COMMANDS ---

const crash = require('../commands/crash');
const bj = require('../commands/bj');
const mines = require('../commands/mines');
const towers = require('../commands/towers');
const roulette = require('../commands/roulette');

// --- SCENARIOS ---

(async () => {
    // 1. CRASH TEST
    // Play 100, wait, cashout
    await runTest('Crash', crash, ['100'], [
        { customId: 'CASH_OUT_DYNAMIC' } // Special handler for dynamic ID
    ]);

    // 2. BLACKJACK TEST
    // Play 100, Hit, Stand
    await runTest('Blackjack', bj, ['100'], [
        { customId: 'hit' },
        { customId: 'stand' }
    ]);

    // 3. MINES TEST
    // Play 100, 3 mines. Reveal 0, Reveal 1, Cashout
    await runTest('Mines', mines, ['100', '3'], [
        { customId: 'mines_0' },
        { customId: 'mines_1' }, // Might hit a mine, randomness involved
        { customId: 'mines_cashout' }
    ]);

    // 4. TOWERS TEST
    // Play 100. Pick door 0 on floor 1, Pick door 1 on floor 2, Cashout
    await runTest('Towers', towers, ['100'], [
        { customId: 'towers_door_0' },
        { customId: 'towers_door_1' },
        { customId: 'towers_cashout' }
    ]);

    // 5. ROULETTE TEST
    // Play 100 on Red (No interaction)
    await runTest('Roulette', roulette, ['100', 'rouge'], []);

})();
