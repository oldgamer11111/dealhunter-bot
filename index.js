const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const USD_TO_INR = 83;

// Store IDs
const STORES = {
  steam: 1,
  ps: 7,
  xbox: 25
};

// Channel IDs (PUT YOUR CHANNEL IDS HERE)
const CHANNELS = {
  steam: "STEAM_CHANNEL_ID",
  ps: "PS_CHANNEL_ID",
  xbox: "XBOX_CHANNEL_ID"
};

async function checkDeals(platform) {
  try {
    const response = await axios.get(
      `https://www.cheapshark.com/api/1.0/deals?storeID=${STORES[platform]}&upperPrice=100`
    );

    const deals = response.data.filter(
      game => parseFloat(game.savings) >= 70
    );

    if (!deals.length) return;

    const channel = await client.channels.fetch(CHANNELS[platform]);

    for (let game of deals.slice(0, 5)) {
      const usd = parseFloat(game.salePrice);
      const inr = Math.round(usd * USD_TO_INR);

      const embed = new EmbedBuilder()
        .setTitle(`🔥 ${game.title}`)
        .addFields(
          { name: "Platform", value: platform.toUpperCase(), inline: true },
          { name: "Discount", value: `${game.savings}%`, inline: true },
          { name: "Price (USD)", value: `$${usd}`, inline: true },
          { name: "Price (INR)", value: `₹${inr}`, inline: true }
        )
        .setColor(0x00AEFF);

      await channel.send({ embeds: [embed] });
    }

  } catch (err) {
    console.error(err);
  }
}

client.once("ready", () => {
  console.log("Bot is online!");

  // Check every 1 hour
  setInterval(() => {
    checkDeals("steam");
    checkDeals("ps");
    checkDeals("xbox");
  }, 3600000);

  // Run immediately when bot starts
  checkDeals("steam");
  checkDeals("ps");
  checkDeals("xbox");
});

client.login(process.env.TOKEN);
