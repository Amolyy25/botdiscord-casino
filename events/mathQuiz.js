const cron = require('node-cron');
const { createEmbed, COLORS, formatCoins, logError } = require('../utils');

const EVENT_CHANNEL_ID = '1469713523549540536';
const QUIZ_CONFIG_KEY = 'math_quiz_schedule';

let scheduledTimeouts = [];

/**
 * Initializes the Math Quiz System.
 * Should be called when the client is ready.
 */
async function init(client, db) {
    console.log('Initializing Math Quiz System...');

    // 1. Schedule daily planner at 09:00 AM
    cron.schedule('0 9 * * *', async () => {
        try {
            console.log('Running daily Math Quiz scheduler...');
            await scheduleDailyEvents(db);
            await loadAndScheduleEvents(client, db);
        } catch (err) {
            await logError(client, err, { filePath: 'events/mathQuiz.js:cron' });
        }
    }, { timezone: "Europe/Paris" });

    // 2. Load existing schedule from DB (in case of restart)
    await loadAndScheduleEvents(client, db);
}

/**
 * Generates 5 random times between 09:00 and 22:00 for the current day.
 * Saves them to the database.
 */
async function scheduleDailyEvents(db) {
    const now = new Date();
    const times = [];

    for (let i = 0; i < 5; i++) {
        // Random hour between 9 and 21 (inclusive of 9, exclusive of 22 effectively for minutes)
        // 09:00 to 22:00.
        // Let's say we pick a random minute from 9*60 to 22*60.
        const startMin = 9 * 60;
        const endMin = 22 * 60; 
        const randomMin = Math.floor(Math.random() * (endMin - startMin + 1)) + startMin;
        
        const timestamp = new Date(now);
        timestamp.setHours(0, 0, 0, 0); // Reset to start of day
        timestamp.setMinutes(randomMin);
        
        // Ensure it's in the future if running manually later in the day (though usually runs at 9am)
        if (timestamp > now) {
             times.push(timestamp.getTime());
        }
    }

    // Sort times
    times.sort((a, b) => a - b);

    // Save to DB
    await db.setConfig(QUIZ_CONFIG_KEY, JSON.stringify(times));
    console.log(`Scheduled ${times.length} math quizzes for today:`, times.map(t => new Date(t).toLocaleTimeString()));
}

/**
 * Loads the schedule from DB and sets timeouts.
 */
async function loadAndScheduleEvents(client, db) {
    // Clear existing timeouts
    scheduledTimeouts.forEach(t => clearTimeout(t));
    scheduledTimeouts = [];

    const scheduleJson = await db.getConfig(QUIZ_CONFIG_KEY);
    if (!scheduleJson) {
        // No schedule found, maybe first run or manual trigger needed?
        // If it's already past 9am, we might want to schedule for today instantly if empty.
        // For now, let's just log.
        if (new Date().getHours() >= 9) {
             console.log('No math quiz schedule found for today. Generating one now...');
             await scheduleDailyEvents(db);
             // Recursive call to load what we just saved (be careful of infinite loop, but here it's safe as we just saved)
             const newSchedule = await db.getConfig(QUIZ_CONFIG_KEY); // Re-fetch
             if(newSchedule) return loadAndScheduleEvents(client, db);
        }
        return;
    }

    let times;
    try {
        times = JSON.parse(scheduleJson);
    } catch (e) {
        console.error('Failed to parse math quiz schedule:', e);
        return;
    }

    const now = Date.now();
    let pendingCount = 0;

    times.forEach(timestamp => {
        if (timestamp > now) {
            const delay = timestamp - now;
            const timeout = setTimeout(() => startQuiz(client, db), delay);
            scheduledTimeouts.push(timeout);
            pendingCount++;
        }
    });

    console.log(`Loaded Math Quiz schedule. ${pendingCount} quizzes pending for today.`);
}

/**
 * Generates equation, sends it, and listens for answer.
 */
async function startQuiz(client, db) {
    const channel = client.channels.cache.get(EVENT_CHANNEL_ID);
    if (!channel) {
        return;
    }

    try {
        // Generate Math Problem
        const type = Math.floor(Math.random() * 3);
        let expression, answer;

        if (type === 0) { // Addition
            const a = Math.floor(Math.random() * 100) + 1;
            const b = Math.floor(Math.random() * 100) + 1;
            expression = `${a} + ${b}`;
            answer = a + b;
        } else if (type === 1) { // Subtraction
            const a = Math.floor(Math.random() * 100) + 1;
            const b = Math.floor(Math.random() * a); 
            expression = `${a} - ${b}`;
            answer = a - b;
        } else { // Multiplication
            const a = Math.floor(Math.random() * 11) + 2; 
            const b = Math.floor(Math.random() * 11) + 2;
            expression = `${a} x ${b}`;
            answer = a * b;
        }

        const embed = createEmbed(
            '🧠 Événement Calcul Mental !',
            `Le premier à donner la bonne réponse gagne **500 coins** !\n` +
            `⏳ Vous avez **2 minutes** pour répondre.\n\n` +
            `# ${expression} = ?`,
            COLORS.GOLD
        );

        await channel.send({ content: '<@&1469713522194780404>', embeds: [embed] });

        const collector = channel.createMessageCollector({
            filter: m => !m.author.bot && parseInt(m.content) === answer,
            time: 120000, 
            max: 1 
        });

        collector.on('collect', async m => {
            try {
                const userId = m.author.id;
                let rewardMsg = `Bravo ${m.author} ! La réponse était bien **${answer}**.\n`;
                rewardMsg += `Tu remportes ${formatCoins(500)} !`;

                await db.updateBalance(userId, 500, 'Quiz Maths');

                if (Math.random() < 0.02) {
                    await db.updateTirages(userId, 1);
                    rewardMsg += `\n✨ **CHANCE INCROYABLE !** Tu reçois aussi **+1 Tirage gratuit** ! 🎰`;
                }

                await channel.send(rewardMsg);
            } catch (err) {
                await logError(client, err, { filePath: 'events/mathQuiz.js:collector:collect' });
            }
        });

        collector.on('end', (collected, reason) => {
            try {
                if (reason === 'time') {
                    channel.send(`⏳ Temps écoulé ! Personne n'a trouvé. La réponse était **${answer}**.`);
                }
            } catch (err) {}
        });
    } catch (err) {
        await logError(client, err, { filePath: 'events/mathQuiz.js:startQuiz' });
    }
}

module.exports = { init, scheduleDailyEvents, startQuiz, loadAndScheduleEvents };
