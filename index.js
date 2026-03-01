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

/* ================= STORAGE ================= */

const guildConfig = {};   // { guildId: { channelId, sent:Set } }

/* ================= COMMAND ================= */

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set Steam 70%+ deal channel")
    .addChannelOption(option =>
      option.setName("channel")
        .setDescription("Channel to send deals")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(c => c.toJSON());

/* ================= READY ================= */

client.once("ready", async () => {
  console.log("🔥 Ultimate Steam Deal Bot Online");

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  // 🔴 CHANGE THIS TO YOUR SERVER ID
  await rest.put(
    Routes.applicationGuildCommands(
      client.user.id,
      "1320275989011632213"
    ),
    { body: commands }
  );

  await sendAllGuilds();
  setInterval(refreshAllGuilds, 43200000); // 12h
});

/* ================= INTERACTION ================= */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "setup") {
    const guildId = interaction.guildId;
    const channel = interaction.options.getChannel("channel");

    guildConfig[guildId] = {
      channelId: channel.id,
      sent: new Set()
    };

    await interaction.reply("✅ Channel saved. Sending deals now...");
    await sendDeals(guildId);
  }
});

/* ================= CORE ENGINE ================= */

async function fetchSteamDeals() {

  let allDeals = [];

  // Check 5 pages (300 deals)
  for (let page = 0; page < 5; page++) {

    const res = await axios.get(
      `https://www.cheapshark.com/api/1.0/deals?storeID=1&pageSize=60&pageNumber=${page}`
    );

    allDeals.push(...res.data);
  }

  // Filter 70%+
  const filtered = allDeals.filter(d =>
    parseFloat(d.savings) >= 70
  );

  // Sort highest discount first
  filtered.sort((a, b) =>
    parseFloat(b.savings) - parseFloat(a.savings)
  );

  return filtered;
}

async function sendAllGuilds() {
  for (const guildId in guildConfig) {
    await sendDeals(guildId);
  }
}

async function refreshAllGuilds() {

  console.log("🔄 12h refresh running");

  for (const guildId in guildConfig) {

    const config = guildConfig[guildId];
    if (!config) continue;

    const channel = await client.channels.fetch(config.channelId);
    if (!channel) continue;

    await channel.bulkDelete(100).catch(() => {});

    config.sent = new Set();

    await sendDeals(guildId);
  }
}

async function sendDeals(guildId) {

  const config = guildConfig[guildId];
  if (!config) return;

  const channel = await client.channels.fetch(config.channelId);
  if (!channel) return;

  try {

    const deals = await fetchSteamDeals();

    console.log("Total 70%+ deals found:", deals.length);

    let sentCount = 0;

    for (const deal of deals) {

      if (sentCount >= 10) break;

      if (config.sent.has(deal.dealID)) continue;

      const discount = parseFloat(deal.savings).toFixed(0);
      const original = deal.normalPrice;
      const final = deal.salePrice;
      const inr = Math.round(final * 83);

      const embed = new EmbedBuilder()
        .setTitle(`🔥 ${deal.title}`)
        .setURL(`https://store.steampowered.com/app/${deal.steamAppID}`)
        .setImage(deal.thumb)
        .addFields(
          { name: "Discount", value: `${discount}%`, inline: true },
          { name: "Original", value: `$${original}`, inline: true },
          { name: "Now", value: `$${final}`, inline: true },
          { name: "INR", value: `₹${inr}`, inline: true }
        )
        .setColor(discount >= 90 ? 0xff0000 : 0x00AEFF)
        .setFooter({ text: "Steam 70–100% Mega Deals" });

      await channel.send({ embeds: [embed] });

      config.sent.add(deal.dealID);
      sentCount++;
    }

    if (sentCount === 0) {
      await channel.send("⚠️ No 70%+ Steam deals found right now.");
    }

  } catch (err) {
    console.error("Deal error:", err.message);
  }
}

/* ================= START ================= */

client.login(TOKEN);
