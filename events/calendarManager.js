const { ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { createEmbed, COLORS } = require('../utils');
const mathQuiz = require('./mathQuiz');
const eventsManager = require('./eventsManager');

async function getAllEvents(db) {
    const quizScheduleJson = await db.getConfig('math_quiz_schedule');
    const gloryScheduleJson = await db.getConfig('glory_hour_schedule');

    const quizTimes = quizScheduleJson ? JSON.parse(quizScheduleJson) : [];
    const gloryTimes = gloryScheduleJson ? JSON.parse(gloryScheduleJson) : [];

    const allEvents = [];
    quizTimes.forEach((t, i) => allEvents.push({ type: '🧮 Quiz Maths', time: t, key: 'math_quiz_schedule', originalIndex: i }));
    gloryTimes.forEach((t, i) => allEvents.push({ type: '⚡ Heure de Gloire', time: t, key: 'glory_hour_schedule', originalIndex: i }));
    
    const todayBraquage = new Date();
    todayBraquage.setHours(20, 30, 0, 0);
    allEvents.push({ type: '🔫 Braquage', time: todayBraquage.getTime(), key: 'static', originalIndex: -1 });

    return allEvents.sort((a, b) => a.time - b.time);
}

function buildCalendarEmbed(events) {
    let list = '';
    const now = Date.now();

    // --- Mini Event : Heure de Gloire (statut en direct) ---
    const gloryStatus = eventsManager.getGloryHourStatus();
    let statusLine = '';
    if (gloryStatus.active) {
        statusLine = `⚡ **Mini Event actif : Heure de Gloire** — Gains doublés !\n\n`;
    }

    if (events.length === 0) {
        list = 'Aucun événement prévu.';
    } else {
        events.forEach(e => {
            const status = e.time < now ? '✅ (Passé)' : '⌛ (À venir)';
            list += `**${e.type}** : <t:${Math.floor(e.time / 1000)}:F> (${status})\n`;
        });
    }

    return createEmbed(
        '🗓️ Calendrier des Événements',
        `${statusLine}Voici les prochains événements programmés :\n\n${list}`,
        COLORS.GOLD
    );
}

async function handleInteraction(interaction, db) {
    const customId = interaction.customId;
    if (!customId?.startsWith('cal_')) return false;

    if (interaction.isButton()) {
        if (customId === 'cal_refresh') {
            const refreshedEvents = await getAllEvents(db);
            await interaction.update({ embeds: [buildCalendarEmbed(refreshedEvents)] });
            return true;
        }

        if (customId === 'cal_postpone_all') {
            const shift = 24 * 60 * 60 * 1000;
            const keys = ['math_quiz_schedule', 'glory_hour_schedule'];
            
            for (const key of keys) {
                const json = await db.getConfig(key);
                if (json) {
                    const times = JSON.parse(json).map(t => t + shift);
                    await db.setConfig(key, JSON.stringify(times));
                }
            }
            
            await mathQuiz.loadAndScheduleEvents(interaction.client, db);
            await eventsManager.loadAndScheduleEvents(interaction.client, db);

            const updatedEvents = await getAllEvents(db);
            await interaction.update({ 
                content: '✅ Tous les événements ont été décalés de 24h.',
                embeds: [buildCalendarEmbed(updatedEvents)] 
            });
            return true;
        }

        if (customId === 'cal_edit') {
            const recentEvents = (await getAllEvents(db)).filter(e => e.time > Date.now() && e.key !== 'static');
            if (recentEvents.length === 0) {
                return interaction.reply({ content: 'Aucun événement futur modifiable.', flags: 64 }), true;
            }

            const select = new StringSelectMenuBuilder()
                .setCustomId('cal_select_edit')
                .setPlaceholder('Choisissez un événement à modifier')
                .addOptions(recentEvents.slice(0, 25).map((e, index) => ({
                    label: `${e.type}`,
                    description: new Date(e.time).toLocaleString('fr-FR'),
                    value: `${e.key}_${e.originalIndex}`
                })));

            await interaction.reply({ 
                content: 'Sélectionnez l\'événement à reprogrammer :', 
                components: [new ActionRowBuilder().addComponents(select)],
                flags: 64 
            });
            return true;
        }
    }

    if (interaction.isStringSelectMenu() && customId === 'cal_select_edit') {
        const [key, index] = interaction.values[0].split('_');
        
        const modal = new ModalBuilder()
            .setCustomId(`cal_modal_edit_${key}_${index}`)
            .setTitle('Reprogrammer l\'événement');

        const timeInput = new TextInputBuilder()
            .setCustomId('new_time')
            .setLabel('Nouvelle heure (Format HH:MM)')
            .setPlaceholder('Ex: 15:30')
            .setRequired(true)
            .setStyle(TextInputStyle.Short);

        modal.addComponents(new ActionRowBuilder().addComponents(timeInput));
        await interaction.showModal(modal);
        return true;
    }

    if (interaction.isModalSubmit() && customId.startsWith('cal_modal_edit_')) {
        const [, , , key, indexStr] = customId.split('_');
        const index = parseInt(indexStr);
        const newTime = interaction.fields.getTextInputValue('new_time');

        const [hours, minutes] = newTime.split(':').map(n => parseInt(n));
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return interaction.reply({ content: '❌ Format d\'heure invalide (HH:MM).', flags: 64 }), true;
        }

        const scheduleJson = await db.getConfig(key);
        if (!scheduleJson) return interaction.reply({ content: '❌ Erreur : Calendrier introuvable.', flags: 64 }), true;

        const times = JSON.parse(scheduleJson);
        const targetDate = new Date(times[index]);
        targetDate.setHours(hours, minutes, 0, 0);

        times[index] = targetDate.getTime();
        await db.setConfig(key, JSON.stringify(times));

        if (key === 'math_quiz_schedule') await mathQuiz.loadAndScheduleEvents(interaction.client, db);
        else if (key === 'glory_hour_schedule') await eventsManager.loadAndScheduleEvents(interaction.client, db);

        await interaction.reply({ content: `✅ Événement reprogrammé à **${newTime}** !`, flags: 64 });
        return true;
    }

    return false;
}

module.exports = { handleInteraction, getAllEvents, buildCalendarEmbed };
