const mathQuiz = require('../events/mathQuiz');

// Mock DB
const mockDb = {
    config: {},
    users: {},
    setConfig: async (key, value) => {
        console.log(`[DB] setConfig: ${key} = ${value}`);
        mockDb.config[key] = value;
    },
    getConfig: async (key) => {
        console.log(`[DB] getConfig: ${key}`);
        return mockDb.config[key];
    },
    updateBalance: async (id, amount) => {
        console.log(`[DB] updateBalance: User ${id} + ${amount}`);
        if (!mockDb.users[id]) mockDb.users[id] = { balance: 0, tirages: 0 };
        mockDb.users[id].balance += amount;
    },
    updateTirages: async (id, amount) => {
        console.log(`[DB] updateTirages: User ${id} + ${amount}`);
        if (!mockDb.users[id]) mockDb.users[id] = { balance: 0, tirages: 0 };
        mockDb.users[id].tirages += amount;
    }
};

// Mock Client
const mockClient = {
    channels: {
        cache: {
            get: (id) => {
                console.log(`[Client] Getting channel ${id}`);
                return {
                    send: async (msg) => {
                        console.log(`[Channel] Sending message:`, msg);
                    },
                    createMessageCollector: ({ filter, time }) => {
                        console.log(`[Channel] Creating collector (time: ${time}ms)`);
                        return {
                            on: (event, callback) => {
                                console.log(`[Collector] Registered listener for '${event}'`);
                                // Simulate interaction
                                if (event === 'collect') {
                                    // Manually trigger collect for testing 
                                    // In a real test we'd need to emit this.
                                    // For this script, we'll expose a 'emit' method
                                    
                                }
                            }
                        };
                    }
                };
            }
        }
    }
};

// Helper to simulate collector
function createMockChannel() {
    let collectCallback = null;
    let endCallback = null;
    
    return {
        send: async (msg) => {
            console.log(`[Channel] Msg Content: ${msg.content}`);
            if (msg.embeds) {
                console.log(`[Channel] Embed Title: ${msg.embeds[0].data.title}`);
                console.log(`[Channel] Embed Desc: ${msg.embeds[0].data.description}`);
            }
        },
        createMessageCollector: ({ filter, time }) => {
            return {
                on: (event, cb) => {
                    if (event === 'collect') collectCallback = cb;
                    if (event === 'end') endCallback = cb;
                },
                // Test helper
                emitCollect: async (msg) => {
                    if (filter(msg)) {
                        console.log(`[Test] Filter passed for: ${msg.content}`);
                        await collectCallback(msg);
                    } else {
                        console.log(`[Test] Filter rejected: ${msg.content}`);
                    }
                }
            };
        }
    };
}

// Override mock client to use helper
mockClient.channels.cache.get = (id) => {
    if (id === '1469713523549540536') return mockChannel;
    return null;
};

const mockChannel = createMockChannel();

// Mock Date to be 08:00 AM
const RealDate = Date;
global.Date = class extends RealDate {
    constructor(arg) {
        if (arg) return new RealDate(arg);
        // Return 08:00 AM of current day
        const d = new RealDate();
        d.setHours(8, 0, 0, 0);
        return d;
    }
};

(async () => {
    console.log('--- TEST START ---');

    console.log('\n> Testing Scheduling...');
    await mathQuiz.scheduleDailyEvents(mockDb);

    const schedule = await mockDb.getConfig('math_quiz_schedule');
    const times = JSON.parse(schedule);
    console.log(`Scheduled ${times.length} times.`);
    if (times.length !== 5) throw new Error('Should schedule 5 times');

    console.log('\n> Testing Quiz Logic...');
    
    // We can' easily wait for mathQuiz internal collector, so we just run startQuiz
    // and trigger the mock collector.
    
    // To properly test the collector we need to capture the created collector instance.
    // Since startQuiz creates it internally, we can only verify side effects via logs
    // unless we spy on createMessageCollector (which we did with createMockChannel).
    
    // We need to know the answer to test the filter.
    // The answer is stored in local variable in startQuiz.
    // We can't access it. This makes testing valid answer hard.
    // BUT, we can see the console log of the Embed which contains the expression.
    // We can parse it!
    
    // Intercept send to parse answer
    let expectedAnswer = null;
    const originalSend = mockChannel.send;
    mockChannel.send = async (msg) => {
        await originalSend(msg);
        if (msg.embeds) {
            const desc = msg.embeds[0].data.description;
            // Extract expression "# 12 + 5 = ?"
            const match = desc.match(/# (\d+) (.) (\d+) = \?/);
            if (match) {
                const a = parseInt(match[1]);
                const op = match[2];
                const b = parseInt(match[3]);
                if (op === '+') expectedAnswer = a + b;
                if (op === '-') expectedAnswer = a - b;
                if (op === 'x') expectedAnswer = a * b;
                console.log(`[Test] Decoded Answer: ${expectedAnswer}`);
            }
        }
    };

    // We must expose the collector to call emitCollect
    let activeCollector = null;
    const originalCreate = mockChannel.createMessageCollector;
    mockChannel.createMessageCollector = (opts) => {
        activeCollector = originalCreate(opts);
        return activeCollector;
    };

    await mathQuiz.startQuiz(mockClient, mockDb);

    if (!activeCollector) throw new Error('Collector not created');
    if (expectedAnswer === null) throw new Error('Could not parse answer');

    console.log('\n> Testing Wrong Answer...');
    await activeCollector.emitCollect({ 
        content: (expectedAnswer + 1).toString(), 
        author: { bot: false, id: 'user1', toString: () => '<@user1>' } 
    });

    console.log('\n> Testing Correct Answer...');
    await activeCollector.emitCollect({ 
        content: expectedAnswer.toString(), 
        author: { bot: false, id: 'winner', toString: () => '<@winner>' } 
    });

    console.log('\n> Verifying DB Update...');
    if (mockDb.users['winner'] && mockDb.users['winner'].balance === 100) {
        console.log('✅ Winner received 100 coins');
    } else {
        console.error('❌ Winner did not receive coins', mockDb.users);
    }

    console.log('--- TEST END ---');
})();
