const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const axios = require("axios");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.TOKEN;

/* ====== CONFIG ====== */

const CHANNELS = {
  steam: "PUT_STEAM_CHANNEL_ID",
  ps: "PUT_PS_CHANNEL_ID",
  xbox: "PUT_XBOX_CHANNEL_ID"
};

const STORES = {
  steam: 1,
  ps: 7,
  xbox: 25
};

// Custom minimum discount per platform
const MIN_DISCOUNT = {
  steam: 70,
  ps: 60,
  xbox: 50
};

// Role ping for 90%+
const MEGA_ROLE_ID = "PUT_ROLE_ID";

/* ===================== */

let sentDeals = new Set();
let trendingMap = {};
let dailyTopDeals = [];

client.once("ready", async () => {
  console.log("Smart Bot Online");

  await sendAllDeals();

  setInterval(sendAllDeals, 3600000); // 1 hour
  setInterval(sendDailySummary, 86400000); // 24 hours
});

function generateBar(percent) {
  const total = 10;
  const filled = Math.round((percent / 100) * total);
  return "█".repeat(filled) + "░".repeat(total - filled);
}

async function sendAllDeals() {
  dailyTopDeals = [];

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
      .filter(g => parseFloat(g.savings) >= MIN_DISCOUNT[platform])
      .sort((a, b) => parseFloat(b.savings) - parseFloat(a.savings))
      .slice(0, 10);

    let rank = 1;

    for (let game of deals) {
      if (sentDeals.has(game.dealID)) continue;

      sentDeals.add(game.dealID);

      const discount = parseFloat(game.savings);
      const usd = parseFloat(game.salePrice);
      const inr = Math.round(usd * 83);

      // Trending logic
      trendingMap[game.title] = (trendingMap[game.title] || 0) + 1;
      const isTrending = trendingMap[game.title] >= 2;

      const embed = new EmbedBuilder()
        .setTitle(`#${rank} 🔥 ${game.title}`)
        .setURL(`https://www.cheapshark.com/redirect?dealID=${game.dealID}`)
        .setThumbnail(game.thumb)
        .addFields(
          { name: "Platform", value: platform.toUpperCase(), inline: true },
          { name: "Discount", value: `${discount}%`, inline: true },
          { name: "Visual", value: `${generateBar(discount)} ${discount}%` },
          { name: "USD", value: `$${usd}`, inline: true },
          { name: "INR", value: `₹${inr}`, inline: true }
        )
        .setColor(discount >= 90 ? 0xff0000 : 0x00AEFF)
        .setFooter({
          text: isTrending ? "🔥 TRENDING DEAL" : "Smart Deal Tracker"
        });

      if (discount >= 90) {
        await channel.send(`<@&${MEGA_ROLE_ID}> 🚨 90%+ MEGA DEAL!`);
      }

      await channel.send({ embeds: [embed] });

      dailyTopDeals.push({ title: game.title, discount });

      rank++;
    }

  } catch (err) {
    console.error(err);
  }
}

async function sendDailySummary() {
  if (!dailyTopDeals.length) return;

  for (let platform of Object.keys(CHANNELS)) {
    const channel = await client.channels.fetch(CHANNELS[platform]);
    if (!channel) continue;

    const top5 = dailyTopDeals
      .sort((a, b) => b.discount - a.discount)
      .slice(0, 5);

    let summary = "📊 **Daily Top 5 Deals**\n\n";
    top5.forEach((g, i) => {
      summary += `#${i + 1} ${g.title} - ${g.discount}% OFF\n`;
    });

    await channel.send(summary);
  }
}

client.login(TOKEN);
