require('dotenv').config();
const { ShardingManager } = require('discord.js');
const path = require('path');

const manager = new ShardingManager(path.join(__dirname, 'bot.js'), {
    token: process.env.TOKEN,
    totalShards: 'auto',
    respawn: true
});

manager.on('shardCreate', shard => console.log(`[Manager] Launched shard ${shard.id}`));

manager.spawn().catch(console.error);
