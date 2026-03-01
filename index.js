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

let guildChannels = {};       // { guildId: channelId }
let sentDeals = {};           // { guildId: Set(appIds) }

/* ================= COMMANDS ================= */

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set the channel for Steam 70%+ quality deals")
    .addChannelOption(option =>
      option.setName("channel")
        .setDescription("Channel for deals")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(c => c.toJSON());

/* ================= READY ================= */

client.once("ready", async () => {
  console.log("Steam 70%+ Quality Tracker Online");

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  // 🔴 REPLACE THIS WITH YOUR SERVER ID
  await rest.put(
    Routes.applicationGuildCommands(
      client.user.id,
      "1320275989011632213"
    ),
    { body: commands }
  );

  // Send deals on startup
  await sendDealsToAllGuilds();

  // Refresh every 12 hours
  setInterval(refreshAllGuilds, 43200000);
});

/* ================= INTERACTION ================= */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "setup") {
    const guildId = interaction.guildId;
    const channel = interaction.options.getChannel("channel");

    guildChannels[guildId] = channel.id;
    sentDeals[guildId] = new Set();

    await interaction.reply("✅ Deal channel saved. Sending 70%+ quality deals now...");

    await sendDealsForGuild(guildId);
  }
});

/* ================= MAIN LOGIC ================= */

async function sendDealsToAllGuilds() {
  for (let guildId of Object.keys(guildChannels)) {
    await sendDealsForGuild(guildId);
  }
}

async function refreshAllGuilds() {
  for (let guildId of Object.keys(guildChannels)) {
    const channelId = guildChannels[guildId];
    if (!channelId) continue;

    try {
      const channel = await client.channels.fetch(channelId);

      // Clear last 100 messages
      await channel.bulkDelete(100).catch(() => {});

      sentDeals[guildId] = new Set(); // reset duplicates
      await sendDealsForGuild(guildId);

    } catch (err) {
      console.error("Refresh error:", err.message);
    }
  }
}

async function sendDealsForGuild(guildId) {
  const channelId = guildChannels[guildId];
  if (!channelId) return;

  try {
    const res = await axios.get(
      "https://store.steampowered.com/api/featuredcategories/"
    );

    const deals = res.data.specials.items
      .sort((a, b) => b.discount_percent - a.discount_percent);

    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    let count = 0;

    for (let game of deals) {

      if (count >= 10) break;

      const discount = game.discount_percent;

      // ✅ ONLY 70%–100%
      if (discount < 70) continue;

      // Duplicate protection
      if (sentDeals[guildId] && sentDeals[guildId].has(game.id)) continue;

      // Fetch detailed info
      const detailRes = await axios.get(
        `https://store.steampowered.com/api/appdetails?appids=${game.id}`
      );

      const appData = detailRes.data[game.id];
      if (!appData.success) continue;

      const data = appData.data;

      // ✅ QUALITY FILTER (Metacritic ≥ 70 if exists)
      if (data.metacritic && data.metacritic.score < 70) continue;

      const original = (game.original_price / 100).toFixed(2);
      const final = (game.final_price / 100).toFixed(2);
      const inr = Math.round(final * 83);

      const embed = new EmbedBuilder()
        .setTitle(`🔥 ${game.name}`)
        .setURL(`https://store.steampowered.com/app/${game.id}`)
        .setImage(game.header_image)
        .addFields(
          { name: "Discount", value: `${discount}%`, inline: true },
          { name: "Original Price", value: `$${original}`, inline: true },
          { name: "Now", value: `$${final}`, inline: true },
          { name: "INR", value: `₹${inr}`, inline: true }
        )
        .setColor(discount >= 90 ? 0xff0000 : 0x00AEFF)
        .setFooter({ text: "Steam 70%+ Quality Deals Only" });

      await channel.send({ embeds: [embed] });

      if (!sentDeals[guildId]) {
        sentDeals[guildId] = new Set();
      }

      sentDeals[guildId].add(game.id);
      count++;
    }

  } catch (err) {
    console.error("Deal fetch error:", err.message);
  }
}

/* ================= START ================= */

client.login(TOKEN);
