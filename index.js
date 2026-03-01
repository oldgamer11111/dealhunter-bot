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

let guildChannels = {};     // { guildId: channelId }
let sentDeals = {};         // { guildId: Set(appIds) }

/* ================= COMMANDS ================= */

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set the channel for Steam 70%+ deals")
    .addChannelOption(option =>
      option.setName("channel")
        .setDescription("Channel to send deals")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

/* ================= READY ================= */

client.once("ready", async () => {
  console.log("Steam 70%+ Search Tracker Online");

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  // 🔴 REPLACE WITH YOUR SERVER ID
  await rest.put(
    Routes.applicationGuildCommands(
      client.user.id,
      "1320275989011632213"
    ),
    { body: commands }
  );

  // Send on startup
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

    await interaction.reply("✅ Channel saved. Sending 70%+ Steam deals now...");

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

      await channel.bulkDelete(100).catch(() => {});

      sentDeals[guildId] = new Set(); // reset duplicate memory
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
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    // Steam Search API (no featuredcategories)
    const res = await axios.get(
      "https://store.steampowered.com/api/storesearch/?term=&l=english&cc=US"
    );

    const games = res.data.items;

    if (!games || !games.length) return;

    // Sort highest discount first
    games.sort((a, b) => b.discount_percent - a.discount_percent);

    let count = 0;

    for (let game of games) {

      if (count >= 10) break;

      const discount = game.discount_percent;

      // Only 70%–100%
      if (discount < 70) continue;

      if (sentDeals[guildId] && sentDeals[guildId].has(game.id)) continue;

      const original = (game.price.initial / 100).toFixed(2);
      const final = (game.price.final / 100).toFixed(2);
      const inr = Math.round(final * 83);

      const embed = new EmbedBuilder()
        .setTitle(`🔥 ${game.name}`)
        .setURL(`https://store.steampowered.com/app/${game.id}`)
        .setImage(game.tiny_image)
        .addFields(
          { name: "Discount", value: `${discount}%`, inline: true },
          { name: "Original Price", value: `$${original}`, inline: true },
          { name: "Now", value: `$${final}`, inline: true },
          { name: "INR", value: `₹${inr}`, inline: true }
        )
        .setColor(discount >= 90 ? 0xff0000 : 0x00AEFF)
        .setFooter({ text: "Steam 70%+ Deals (Search API)" });

      await channel.send({ embeds: [embed] });

      sentDeals[guildId].add(game.id);
      count++;
    }

  } catch (err) {
    console.error("Deal fetch error:", err.message);
  }
}

/* ================= START ================= */

client.login(TOKEN);
