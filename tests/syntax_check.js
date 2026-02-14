try {
    require('./utils');
    require('./events/shop');
    require('./events/roleExpiration');
    require('./commands/tirage');
    require('./braquageUtils');
    console.log('✅ Syntax check passed');
} catch (e) {
    console.error('❌ Syntax check failed:', e);
    process.exit(1);
}
