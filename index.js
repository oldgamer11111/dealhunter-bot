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

/* ============================= */
/*         MEMORY STORE          */
/* ============================= */

let guildConfig = {}; 
// { guildId: { channelId, category } }

let sentDeals = {}; 
// { guildId: { appId: timestamp } }

let dailyTracker = {}; 
// { guildId: [ {name, discount} ] }

/* ============================= */

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set deal channel")
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel for deals")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("setcategory")
    .setDescription("Set category filter (rpg, action, strategy)")
    .addStringOption(o =>
      o.setName("type")
        .setDescription("Category")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

].map(c => c.toJSON());

/* ============================= */

client.once("ready", async () => {
  console.log("Steam Pro Multi-Server Bot Online");

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  setInterval(checkDealsAllGuilds, 3600000);
  setInterval(sendDailySummary, 86400000);
});

/* ============================= */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guildId;

  if (interaction.commandName === "setup") {
    const channel = interaction.options.getChannel("channel");
    guildConfig[guildId] = guildConfig[guildId] || {};
    guildConfig[guildId].channelId = channel.id;

    await interaction.reply("✅ Deal channel set.");
  }

  if (interaction.commandName === "setcategory") {
    const type = interaction.options.getString("type").toLowerCase();
    guildConfig[guildId] = guildConfig[guildId] || {};
    guildConfig[guildId].category = type;

    await interaction.reply(`✅ Category set to ${type}`);
  }
});

/* ============================= */

async function checkDealsAllGuilds() {
  for (let guildId of Object.keys(guildConfig)) {
    await sendDealsForGuild(guildId);
  }
}

async function sendDealsForGuild(guildId) {
  const config = guildConfig[guildId];
  if (!config || !config.channelId) return;

  try {
    const res = await axios.get(
      "https://store.steampowered.com/api/featuredcategories/"
    );

    const specials = res.data.specials.items
      .sort((a, b) => b.discount_percent - a.discount_percent)
      .slice(0, 10);

    const channel = await client.channels.fetch(config.channelId);
    if (!channel) return;

    sentDeals[guildId] = sentDeals[guildId] || {};
    dailyTracker[guildId] = dailyTracker[guildId] || [];

    for (let game of specials) {

      const now = Date.now();
      const lastSent = sentDeals[guildId][game.id];

      if (lastSent && now - lastSent < 86400000) continue; // 24h duplicate protection

      const details = await axios.get(
        `https://store.steampowered.com/api/appdetails?appids=${game.id}`
      );

      const data = details.data[game.id].data;

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

      const reviewPercent = data.review_score || 0;
      const reviewText = data.review_score_desc || "Unknown";

      const ratingBar = generateBar(reviewPercent);

      const embed = new EmbedBuilder()
        .setTitle(`🔥 ${game.name}`)
        .setURL(`https://store.steampowered.com/app/${game.id}`)
        .setImage(game.header_image)
        .addFields(
          { name: "Discount", value: `${discount}%`, inline: true },
          { name: "Original", value: `$${original}`, inline: true },
          { name: "Now", value: `$${final}`, inline: true },
          { name: "Review", value: `${reviewText} (${reviewPercent}%)` },
          { name: "Rating", value: ratingBar }
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
    console.error(err);
  }
}

/* ============================= */

async function sendDailySummary() {
  for (let guildId of Object.keys(dailyTracker)) {
    const config = guildConfig[guildId];
    if (!config || !config.channelId) continue;

    const channel = await client.channels.fetch(config.channelId);

    const top5 = dailyTracker[guildId]
      .sort((a, b) => b.discount - a.discount)
      .slice(0, 5);

    if (!top5.length) continue;

    let text = "📊 **Daily Top 5 Steam Deals**\n\n";

    top5.forEach((g, i) => {
      text += `#${i+1} ${g.name} - ${g.discount}% OFF\n`;
    });

    await channel.send(text);

    dailyTracker[guildId] = [];
  }
}

/* ============================= */

function generateBar(percent) {
  const total = 10;
  const filled = Math.round((percent / 100) * total);
  return "█".repeat(filled) + "░".repeat(total - filled);
}

/* ============================= */

client.login(TOKEN);
