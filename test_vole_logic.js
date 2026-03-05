const { formatCoins } = require('./utils');

async function testVoleLogic() {
    console.log("--- Testing Vole Logic with BigInt ---");
    const targetBalance = "10000000000"; // 10 Billion
    const stealPct = 20;
    const stealAmount = (BigInt(targetBalance) * BigInt(stealPct)) / 100n;
    console.log("Target balance: 10,000,000,000");
    console.log("Steal amount:  ", stealAmount.toString());

    const latestBalance = "5000000000"; // Target spent half
    const finalSteal = stealAmount > BigInt(latestBalance) ? BigInt(latestBalance) : stealAmount;
    console.log("Latest balance: 5,000,000,000");
    console.log("Final steal:   ", finalSteal.toString());

    const formatted = formatCoins(finalSteal);
    console.log("Formatted:     ", formatted);
}

testVoleLogic();
