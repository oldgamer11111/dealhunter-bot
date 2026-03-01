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

const DATA_FILE = "./data.json";

let data = fs.existsSync(DATA_FILE)
  ? JSON.parse(fs.readFileSync(DATA_FILE))
  : { channels: {} };

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const STORES = {
  steam: 1,
  ps: 7,
  xbox: 25
};

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

  console.log("Slash Commands Registered");

  // When bot starts → send fresh deals
  await sendAllDeals();

  // Every hour check
  setInterval(sendAllDeals, 3600000);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const platform = interaction.options.getString("platform");

  if (interaction.commandName === "setchannel") {
    data.channels[platform] = interaction.channelId;
    saveData();
    return interaction.reply(`✅ ${platform.toUpperCase()} channel saved.`);
  }

  if (interaction.commandName === "check") {
    await interaction.deferReply();
    await sendDeals(platform, true);
    return interaction.editReply("✅ Deals sent.");
  }
});

let sentDeals = new Set();

async function sendAllDeals() {
  for (let platform of Object.keys(data.channels)) {
    await sendDeals(platform, false);
  }
}

async function sendDeals(platform, manual) {
  if (!data.channels[platform]) return;

  try {
    const response = await axios.get(
      `https://www.cheapshark.com/api/1.0/deals?storeID=${STORES[platform]}`
    );

    if (!response.data.length) return;

    const channel = await client.channels.fetch(data.channels[platform]);

    // Sort by biggest discount
    const deals = response.data
      .sort((a, b) => parseFloat(b.savings) - parseFloat(a.savings))
      .slice(0, 10);

    for (let game of deals) {
      const id = game.dealID;
      if (!manual && sentDeals.has(id)) continue;

      sentDeals.add(id);

      const discount = parseFloat(game.savings);
      const usd = parseFloat(game.salePrice);
      const inr = Math.round(usd * 83);

      const embed = new EmbedBuilder()
        .setTitle(`🔥 ${game.title}`)
        .setURL(`https://www.cheapshark.com/redirect?dealID=${game.dealID}`)
        .setThumbnail(game.thumb)
        .addFields(
          { name: "Platform", value: platform.toUpperCase(), inline: true },
          { name: "Discount", value: `${discount}%`, inline: true },
          { name: "USD", value: `$${usd}`, inline: true },
          { name: "INR", value: `₹${inr}`, inline: true }
        )
        .setColor(discount >= 90 ? 0xff0000 : 0x00AEFF)
        .setFooter({ text: "Deal Tracker Bot" });

      if (discount >= 90) {
        await channel.send("🚨 90%+ MEGA DEAL 🚨");
      }

      await channel.send({ embeds: [embed] });
    }

  } catch (err) {
    console.error(err);
  }
}

client.login(process.env.TOKEN);
