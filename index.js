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

let guildChannels = {}; // { guildId: channelId }
let sentDeals = {};     // { guildId: Set(dealIDs) }

/* ================= COMMAND ================= */

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
  console.log("Steam 70%+ CheapShark Tracker Online");

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  // 🔴 REPLACE WITH YOUR SERVER ID
  await rest.put(
    Routes.applicationGuildCommands(
      client.user.id,
      "1320275989011632213"
    ),
    { body: commands }
  );

  await sendDealsToAllGuilds();

  setInterval(refreshAllGuilds, 43200000); // 12 hours
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

/* ================= MAIN FUNCTIONS ================= */

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
      sentDeals[guildId] = new Set();

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

    // CheapShark Steam deals (storeID=1 is Steam)
    const res = await axios.get(
      "https://www.cheapshark.com/api/1.0/deals?storeID=1&upperPrice=100&pageSize=60"
    );

    let deals = res.data;

    // Filter 70%+
    deals = deals.filter(deal => parseFloat(deal.savings) >= 50);

    // Sort highest discount first
    deals.sort((a, b) => parseFloat(b.savings) - parseFloat(a.savings));

    let count = 0;

    for (let deal of deals) {

      if (count >= 100) break;

      if (sentDeals[guildId] && sentDeals[guildId].has(deal.dealID)) continue;

      const discount = parseFloat(deal.savings).toFixed(0);
      const original = deal.normalPrice;
      const final = deal.salePrice;
      const inr = Math.round(final * 83);

      const steamLink = `https://store.steampowered.com/app/${deal.steamAppID}`;
      const image = deal.thumb;

      const embed = new EmbedBuilder()
        .setTitle(`🔥 ${deal.title}`)
        .setURL(steamLink)
        .setImage(image)
        .addFields(
          { name: "Discount", value: `${discount}%`, inline: true },
          { name: "Original Price", value: `$${original}`, inline: true },
          { name: "Now", value: `$${final}`, inline: true },
          { name: "INR", value: `₹${inr}`, inline: true }
        )
        .setColor(discount >= 90 ? 0xff0000 : 0x00AEFF)
        .setFooter({ text: "Steam 70%+ Deals (CheapShark)" });

      await channel.send({ embeds: [embed] });

      if (!sentDeals[guildId]) sentDeals[guildId] = new Set();
      sentDeals[guildId].add(deal.dealID);

      count++;
    }

  } catch (err) {
    console.error("Deal fetch error:", err.message);
  }
}

/* ================= START ================= */

client.login(TOKEN);
