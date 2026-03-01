const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");
const axios = require("axios");
const fs = require("fs");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const DATA_FILE = "./settings.json";
let settings = fs.existsSync(DATA_FILE)
  ? JSON.parse(fs.readFileSync(DATA_FILE))
  : {};

function saveSettings() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(settings, null, 2));
}

const STORES = {
  steam: 1,
  ps: 7,
  xbox: 25
};

// Slash commands
const commands = [
  new SlashCommandBuilder()
    .setName("setchannel")
    .setDescription("Set this channel for platform alerts")
    .addStringOption(option =>
      option.setName("platform")
        .setDescription("steam / ps / xbox")
        .setRequired(true)
        .addChoices(
          { name: "steam", value: "steam" },
          { name: "ps", value: "ps" },
          { name: "xbox", value: "xbox" }
        )
    ),

  new SlashCommandBuilder()
    .setName("check")
    .setDescription("Check deals manually")
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
  console.log("Bot Online");

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("Slash Commands Ready");

  setInterval(runAutoCheck, 3600000);
  runAutoCheck();
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const platform = interaction.options.getString("platform");

  if (interaction.commandName === "setchannel") {
    settings[platform] = interaction.channelId;
    saveSettings();
    return interaction.reply(`✅ ${platform.toUpperCase()} alerts set in this channel.`);
  }

  if (interaction.commandName === "check") {
    await interaction.deferReply();
    await fetchDeals(platform, true);
    return interaction.editReply("✅ Deals sent.");
  }
});

let sentDeals = new Set();

async function getINRRate() {
  try {
    const res = await axios.get("https://api.exchangerate-api.com/v4/latest/USD");
    return res.data.rates.INR;
  } catch {
    return 83;
  }
}

async function runAutoCheck() {
  for (let platform of Object.keys(settings)) {
    await fetchDeals(platform, false);
  }
}

async function fetchDeals(platform, manual) {
  if (!settings[platform]) return;

  try {
    const response = await axios.get(
      `https://www.cheapshark.com/api/1.0/deals?storeID=${STORES[platform]}&upperPrice=100`
    );

    const deals = response.data.filter(game =>
      parseFloat(game.savings) >= 70
    );

    if (!deals.length) return;

    const channel = await client.channels.fetch(settings[platform]);
    const rate = await getINRRate();

    for (let game of deals) {
      const id = game.dealID;
      if (!manual && sentDeals.has(id)) continue;

      sentDeals.add(id);

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
        .setColor(discount >= 90 ? 0xff0000 : 0x00AEFF);

      if (discount >= 90) {
        await channel.send("🚨 **90%+ MEGA DEAL ALERT!** 🚨");
      }

      await channel.send({ embeds: [embed] });
    }

  } catch (err) {
    console.error(err);
  }
}

client.login(process.env.TOKEN);
