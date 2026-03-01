const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");
const axios = require("axios");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// 🔥 YOUR CHANNEL IDS
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

let sentDeals = new Set();

// 🔥 Slash Commands
const commands = [
  new SlashCommandBuilder()
    .setName("check")
    .setDescription("Check 70%+ deals")
    .addStringOption(option =>
      option.setName("platform")
        .setDescription("steam / ps / xbox")
        .setRequired(true)
        .addChoices(
          { name: "steam", value: "steam" },
          { name: "ps", value: "ps" },
          { name: "xbox", value: "xbox" }
        )
    )
].map(cmd => cmd.toJSON());

client.once("ready", async () => {
  console.log("🚀 Deal Hunter Online");

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("✅ Slash Commands Registered");

  setInterval(runAutoCheck, 3600000);
  runAutoCheck();
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const platform = interaction.options.getString("platform");

  if (interaction.commandName === "check") {
    await interaction.deferReply();
    await fetchDeals(platform, true);
    return interaction.editReply("✅ Deals check completed.");
  }
});

// 🔥 LIVE INR RATE
async function getINRRate() {
  try {
    const res = await axios.get("https://api.exchangerate-api.com/v4/latest/USD");
    return res.data.rates.INR;
  } catch {
    return 83;
  }
}

// 🔥 AUTO CHECK
async function runAutoCheck() {
  console.log("⏳ Running hourly deal check...");
  for (let platform of Object.keys(CHANNELS)) {
    await fetchDeals(platform, false);
  }
}

// 🔥 FETCH DEALS
async function fetchDeals(platform, manual) {
  try {
    const response = await axios.get(
      `https://www.cheapshark.com/api/1.0/deals?storeID=${STORES[platform]}&upperPrice=100`
    );

    const deals = response.data.filter(game =>
      parseFloat(game.savings) >= 70
    );

    if (!deals.length) {
      console.log(`No deals for ${platform}`);
      return;
    }

    const channel = await client.channels.fetch(CHANNELS[platform]);
    const rate = await getINRRate();

    for (let game of deals) {

      if (!manual && sentDeals.has(game.dealID)) continue;
      sentDeals.add(game.dealID);

      const usd = parseFloat(game.salePrice);
      const inr = Math.round(usd * rate);
      const discount = parseFloat(game.savings);

      const embed = new EmbedBuilder()
        .setTitle(`🔥 ${game.title}`)
        .addFields(
          { name: "Platform", value: platform.toUpperCase(), inline: true },
          { name: "Discount", value: `${discount}%`, inline: true },
          { name: "USD", value: `$${usd}`, inline: true },
          { name: "INR", value: `₹${inr}`, inline: true }
        )
        .setColor(discount >= 90 ? 0xff0000 : 0x00AEFF)
        .setFooter({ text: "Deal Hunter Pro" })
        .setTimestamp();

      if (discount >= 90) {
        await channel.send("🚨 **90%+ MEGA DEAL ALERT!** 🚨");
      }

      await channel.send({ embeds: [embed] });
    }

    console.log(`Sent deals for ${platform}`);

  } catch (err) {
    console.error(`Error fetching ${platform}:`, err.message);
  }
}

client.login(process.env.TOKEN);
