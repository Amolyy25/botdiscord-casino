const { parseAmount, formatCoins, parseBet } = require('./utils.js');

function assertStrictEqual(actual, expected, message) {
    if (actual !== expected) {
        console.error(`❌ FAIL: ${message}`);
        console.error(`   Expected: ${expected}`);
        console.error(`   Actual:   ${actual}`);
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

console.log("--- Testing parseAmount ---");

assertStrictEqual(parseAmount('100'), 100n, "Normal integer");
assertStrictEqual(parseAmount('1k'), 1000n, "Suffix 'k'");
assertStrictEqual(parseAmount('1.5k'), 1500n, "Suffix 'k' with decimals");
assertStrictEqual(parseAmount('2.5m'), 2500000n, "Suffix 'm' with decimals");
assertStrictEqual(parseAmount('3md'), 3000000000n, "Suffix 'md'");
assertStrictEqual(parseAmount('4b'), 4000000000n, "Suffix 'b'");
assertStrictEqual(parseAmount('-500'), null, "Negative amount should return null");
assertStrictEqual(parseAmount('abc'), null, "Invalid amount should return null");

console.log("\n--- Testing formatCoins ---");

assertStrictEqual(formatCoins(100n), "100 Coins", "Format 100");
// Space might be a non-breaking space depending on Intl formatting
assertStrictEqual(formatCoins(1234567n).replace(/\u202f/g, ' ').replace(/\s/g, ' '), "1 234 567 Coins", "Format with spaces");
assertStrictEqual(formatCoins(2500000000000n), "2.50T Coins", "Format >= 1 Trillion");
assertStrictEqual(formatCoins(1000000000000n), "1.00T Coins", "Format exactly 1 Trillion");
assertStrictEqual(formatCoins(15500000000000n), "15.50T Coins", "Format ten trillions");

console.log("\n--- Testing parseBet ---");
assertStrictEqual(parseBet('1k', 5000n), 1000n, "parseBet '1k'");
assertStrictEqual(parseBet('all', 123456n), 123456n, "parseBet 'all'");
assertStrictEqual(parseBet('all', '123456'), 123456n, "parseBet 'all' with String balance");
assertStrictEqual(parseBet('-500', 1000n), null, "parseBet negative");
