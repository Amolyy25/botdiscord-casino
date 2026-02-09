const primeInfoCommand = require('../commands/primeinfo');
const { PermissionFlagsBits } = require('discord.js');

// Mock DB
const mockDb = {
    getBounty: async (id) => {
        if (id === '1') return {
            id: 1, title: 'Test Bounty', description: 'Desc', reward: 100, author_id: 'user1', winner_id: null, status: 'active', created_at: new Date()
        };
        if (id === '2') return {
            id: 2, title: 'Completed Bounty', description: 'Desc 2', reward: 200, author_id: 'user2', winner_id: 'user1', status: 'closed', created_at: new Date()
        };
        return null;
    },
    getBountiesByAuthor: async (id) => {
        if (id === 'user1') return [{ id: 1, title: 'Test Bounty', status: 'active' }];
        return [];
    },
    getBountiesByWinner: async (id) => {
        if (id === 'user1') return [{ id: 2, title: 'Completed Bounty', reward: 200 }];
        return [];
    }
};

// Mock Message
const createMockMessage = (content, isAdmin = true) => {
    return {
        content: content,
        member: {
            permissions: {
                has: (perm) => isAdmin
            }
        },
        guild: {
            members: {
                fetch: async (id) => ({ user: { username: `User${id}` } })
            }
        },
        reply: async (msg) => {
            console.log(`[Reply] ${msg.content || 'Embed'}`);
            if (msg.embeds) {
                console.log(`[Embed Title] ${msg.embeds[0].data.title}`);
                msg.embeds[0].data.fields.forEach(f => console.log(`[Field] ${f.name}: ${f.value}`));
            }
        }
    };
};

(async () => {
    console.log('--- TEST PRIMEINFO ---');

    console.log('\n> Test 1: No args');
    await primeInfoCommand.execute(createMockMessage(';primeinfo'), [], mockDb);

    console.log('\n> Test 2: Invalid ID');
    await primeInfoCommand.execute(createMockMessage(';primeinfo abc'), ['abc'], mockDb);

    console.log('\n> Test 3: Bounty ID (found)');
    await primeInfoCommand.execute(createMockMessage(';primeinfo 1'), ['1'], mockDb);

    console.log('\n> Test 4: User ID (mentions/id)');
    await primeInfoCommand.execute(createMockMessage(';primeinfo <@user1>'), ['<@user1>'], mockDb);

    console.log('\n> Test 5: No User Bounties');
    await primeInfoCommand.execute(createMockMessage(';primeinfo user3'), ['user3'], mockDb); // user3 has nothing

    console.log('\n> Test 6: Not Admin');
    await primeInfoCommand.execute(createMockMessage(';primeinfo 1', false), ['1'], mockDb);

    console.log('--- TEST END ---');
})();
