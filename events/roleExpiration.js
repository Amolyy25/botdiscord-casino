module.exports = {
    async init(client, db) {
        const checkExpirations = async () => {
            const now = Date.now();
            const expiredRoles = await db.getExpiredRoles(now);

            for (const entry of expiredRoles) {
                try {
                    const guild = client.guilds.cache.first();
                    if (!guild) continue;

                    const member = await guild.members.fetch(entry.user_id).catch(() => null);
                    if (member) {
                        await member.roles.remove(entry.role_id).catch(() => {});
                        console.log(`Removed expired role ${entry.role_id} from ${member.user.tag}`);
                    }

                    await db.removeRoleExpiration(entry.user_id, entry.role_id);
                } catch (error) {
                    console.error(`Error processing expired role for user ${entry.user_id}:`, error);
                }
            }
        };

        // Check on startup
        checkExpirations();

        // Check every 15 minutes
        setInterval(checkExpirations, 15 * 60 * 1000);
    }
};
