const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits
} = require("discord.js");

const axios = require("axios");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.TOKEN;

/* ================= MEMORY ================= */

let guildConfig = {};     // { guildId: { channelId, category } }
let sentDeals = {};       // { guildId: { appId: timestamp } }
let dailyTracker = {};    // { guildId: [ {name, discount} ] }

/* ================= COMMANDS ================= */

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set the channel for Steam deals")
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel to send deals")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("setcategory")
    .setDescription("Filter by category (rpg, action, strategy etc.)")
    .addStringOption(o =>
      o.setName("type")
        .setDescription("Category name")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

].map(c => c.toJSON());

/* ================= READY ================= */

client.once("ready", async () => {
  console.log("Steam Multi-Server Bot Online");

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(
  Routes.applicationGuildCommands(
    client.user.id,
    "1320275989011632213"
  ),
  { body: commands }
);

  await checkAllGuilds();
  
  setInterval(checkAllGuilds, 3600000); // 1 hour
  setInterval(sendDailySummary, 86400000); // 24 hours
});

/* ================= INTERACTION ================= */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guildId;

  if (interaction.commandName === "setup") {
    const channel = interaction.options.getChannel("channel");

    guildConfig[guildId] = guildConfig[guildId] || {};
    guildConfig[guildId].channelId = channel.id;

    await interaction.reply("✅ Deal channel set successfully.");
  }

  if (interaction.commandName === "setcategory") {
    const type = interaction.options.getString("type").toLowerCase();

    guildConfig[guildId] = guildConfig[guildId] || {};
    guildConfig[guildId].category = type;

    await interaction.reply(`✅ Category filter set to "${type}"`);
  }
});

/* ================= MAIN LOGIC ================= */

async function checkAllGuilds() {
  for (let guildId of Object.keys(guildConfig)) {
    await sendDealsForGuild(guildId);
  }
}

async function sendDealsForGuild(guildId) {
  const config = guildConfig[guildId];
  if (!config || !config.channelId) return;

  try {
    const featured = await axios.get(
      "https://store.steampowered.com/api/featuredcategories/"
    );

    const deals = featured.data.specials.items
      .sort((a, b) => b.discount_percent - a.discount_percent)
      .slice(0, 10);

    const channel = await client.channels.fetch(config.channelId);
    if (!channel) return;

    sentDeals[guildId] = sentDeals[guildId] || {};
    dailyTracker[guildId] = dailyTracker[guildId] || [];

    for (let game of deals) {

      const now = Date.now();
      const lastSent = sentDeals[guildId][game.id];

      if (lastSent && now - lastSent < 86400000) continue; // 24h duplicate

      // Fetch detailed info
      const detailRes = await axios.get(
        `https://store.steampowered.com/api/appdetails?appids=${game.id}`
      );

      const appData = detailRes.data[game.id];

      if (!appData.success) continue;

      const data = appData.data;

      // CATEGORY FILTER
      if (config.category && data.genres) {
        const match = data.genres.some(g =>
          g.description.toLowerCase().includes(config.category)
        );
        if (!match) continue;
      }

      const discount = game.discount_percent;
      const original = (game.original_price / 100).toFixed(2);
      const final = (game.final_price / 100).toFixed(2);

      // REVIEW INFO
      let reviewPercent = 0;
      let reviewText = "No reviews";

      if (data.recommendations && data.metacritic) {
        reviewPercent = data.metacritic.score;
        reviewText = "Metacritic";
      }

      const ratingBar = generateBar(reviewPercent);

      const embed = new EmbedBuilder()
        .setTitle(`🔥 ${game.name}`)
        .setURL(`https://store.steampowered.com/app/${game.id}`)
        .setImage(game.header_image)
        .addFields(
          { name: "Discount", value: `${discount}%`, inline: true },
          { name: "Original", value: `$${original}`, inline: true },
          { name: "Now", value: `$${final}`, inline: true },
          { name: "Rating", value: `${reviewText} (${reviewPercent})` },
          { name: "Visual", value: ratingBar }
        )
        .setColor(discount >= 90 ? 0xff0000 : 0x00AEFF);

      await channel.send({ embeds: [embed] });

      sentDeals[guildId][game.id] = now;
      dailyTracker[guildId].push({
        name: game.name,
        discount
      });
    }

  } catch (err) {
    console.error("ERROR:", err.message);
  }
}

/* ================= DAILY SUMMARY ================= */

async function sendDailySummary() {
  for (let guildId of Object.keys(dailyTracker)) {

    const config = guildConfig[guildId];
    if (!config || !config.channelId) continue;

    const channel = await client.channels.fetch(config.channelId);
    if (!channel) continue;

    const top5 = dailyTracker[guildId]
      .sort((a, b) => b.discount - a.discount)
      .slice(0, 5);

    if (!top5.length) continue;

    let summary = "📊 **Daily Top 5 Steam Deals**\n\n";

    top5.forEach((g, i) => {
      summary += `#${i + 1} ${g.name} - ${g.discount}% OFF\n`;
    });

    await channel.send(summary);

    dailyTracker[guildId] = [];
  }
}

/* ================= HELPER ================= */

function generateBar(percent) {
  const total = 10;
  const filled = Math.round((percent / 100) * total);
  return "█".repeat(filled) + "░".repeat(total - filled);
}

/* ================= START ================= */

client.login(TOKEN);
