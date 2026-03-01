const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const axios = require("axios");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.TOKEN;

// 🔥 PUT YOUR CHANNEL IDs HERE
const CHANNELS = {
  steam: "1320282654209478666",
  ps: "1320275990290890826",
  xbox: "1320275990290890827"
};

const STORES = {
  steam: 1,
  ps: 7,
  xbox: 25
};

client.once("ready", async () => {
  console.log("Bot Online");

  await sendAllDeals();
  setInterval(sendAllDeals, 3600000); // every 1 hour
});

async function sendAllDeals() {
  for (let platform of Object.keys(CHANNELS)) {
    await sendDeals(platform);
  }
}

async function sendDeals(platform) {
  try {
    const response = await axios.get(
      `https://www.cheapshark.com/api/1.0/deals?storeID=${STORES[platform]}`
    );

    const channel = await client.channels.fetch(CHANNELS[platform]);
    if (!channel) return;

    const deals = response.data
      .sort((a, b) => parseFloat(b.savings) - parseFloat(a.savings))
      .slice(0, 10);

    for (let game of deals) {
      const discount = parseFloat(game.savings);
      const usd = parseFloat(game.salePrice);
      const inr = Math.round(usd * 83);

      const embed = new EmbedBuilder()
        .setTitle(`🔥 ${game.title}`)
        .setURL(`https://www.cheapshark.com/redirect?dealID=${game.dealID}`)
        .setThumbnail(game.thumb)
        .addFields(
          { name: "Platform", value: platform.toUpperCase(), inline: true },
          { name: "Discount", value: `${discount}%`, inline: true },
          { name: "USD", value: `$${usd}`, inline: true },
          { name: "INR", value: `₹${inr}`, inline: true }
        )
        .setColor(discount >= 90 ? 0xff0000 : 0x00AEFF);

      await channel.send({ embeds: [embed] });
    }

  } catch (err) {
    console.error(err);
  }
}

client.login(TOKEN);
