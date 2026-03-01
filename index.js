const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const axios = require("axios");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.TOKEN;

const STEAM_CHANNEL = "1477620193252474961";
const MEGA_ROLE_ID = "1322568416413880352";

let sentApps = new Set();

client.once("ready", async () => {
  console.log("Steam Pro Tracker Online");

  await sendSteamDeals();
  setInterval(sendSteamDeals, 3600000);
});

async function sendSteamDeals() {
  try {
    const res = await axios.get(
      "https://store.steampowered.com/api/featuredcategories/"
    );

    const specials = res.data.specials.items
      .sort((a, b) => b.discount_percent - a.discount_percent)
      .slice(0, 10);

    const channel = await client.channels.fetch(STEAM_CHANNEL);

    let rank = 1;

    for (let game of specials) {
      if (sentApps.has(game.id)) continue;
      sentApps.add(game.id);

      const discount = game.discount_percent;
      const original = (game.original_price / 100).toFixed(2);
      const final = (game.final_price / 100).toFixed(2);
      const inr = Math.round(final * 83);

      // Fetch detailed info
      const details = await axios.get(
        `https://store.steampowered.com/api/appdetails?appids=${game.id}`
      );

      const data = details.data[game.id].data;

      const rating = data.metacritic ? data.metacritic.score : "N/A";
      const reviews = data.recommendations
        ? data.recommendations.total.toLocaleString()
        : "N/A";

      const embed = new EmbedBuilder()
        .setTitle(`#${rank} 🔥 ${game.name}`)
        .setURL(`https://store.steampowered.com/app/${game.id}`)
        .setImage(game.header_image)
        .addFields(
          { name: "Discount", value: `${discount}%`, inline: true },
          { name: "Original", value: `$${original}`, inline: true },
          { name: "Now", value: `$${final}`, inline: true },
          { name: "INR", value: `₹${inr}`, inline: true },
          { name: "Metacritic", value: `${rating}`, inline: true },
          { name: "Total Reviews", value: `${reviews}`, inline: true }
        )
        .setColor(discount >= 90 ? 0xff0000 : 0x00AEFF)
        .setFooter({ text: "Steam Professional Deal Tracker" });

      if (discount >= 90) {
        await channel.send(`<@&${MEGA_ROLE_ID}> 🚨 90% MEGA DEAL`);
      }

      await channel.send({ embeds: [embed] });

      rank++;
    }
  } catch (err) {
    console.error(err);
  }
}

client.login(TOKEN);
