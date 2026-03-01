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

let guildChannels = {}; 
// { guildId: channelId }

/* ================= COMMAND ================= */

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set the channel for Steam deals")
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel to send deals")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(c => c.toJSON());

/* ================= READY ================= */

client.once("ready", async () => {
  console.log("Steam Deal Bot Online");

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  // 🔥 IMPORTANT: replace YOUR_SERVER_ID with your real server id
  await rest.put(
    Routes.applicationGuildCommands(
      client.user.id,
      "1320275989011632213"
    ),
    { body: commands }
  );

  // Send deals on start
  await sendDealsToAllGuilds();

  // Every 12 hours refresh
  setInterval(refreshAllGuilds, 43200000);
});

/* ================= INTERACTION ================= */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "setup") {
    const guildId = interaction.guildId;
    const channel = interaction.options.getChannel("channel");

    guildChannels[guildId] = channel.id;

    await interaction.reply("✅ Deal channel saved. Sending deals now...");

    // 🔥 Immediately send deals after setup
    await sendDealsForGuild(guildId);
  }
});

/* ================= DEAL LOGIC ================= */

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
      .sort((a, b) => b.discount_percent - a.discount_percent)
      .slice(0, 10);

    const channel = await client.channels.fetch(channelId);
    if (!channel) return;

    for (let game of deals) {

      const discount = game.discount_percent;
      const original = (game.original_price / 100).toFixed(2);
      const final = (game.final_price / 100).toFixed(2);
      const inr = Math.round(final * 83);

      const embed = new EmbedBuilder()
        .setTitle(`🔥 ${game.name}`)
        .setURL(`https://store.steampowered.com/app/${game.id}`)
        .setImage(game.header_image)
        .addFields(
          { name: "Discount", value: `${discount}%`, inline: true },
          { name: "Original", value: `$${original}`, inline: true },
          { name: "Now", value: `$${final}`, inline: true },
          { name: "INR", value: `₹${inr}`, inline: true }
        )
        .setColor(discount >= 90 ? 0xff0000 : 0x00AEFF)
        .setFooter({ text: "Steam Deal Tracker" });

      await channel.send({ embeds: [embed] });
    }

  } catch (err) {
    console.error("Deal fetch error:", err.message);
  }
}

/* ================= START ================= */

client.login(TOKEN);
