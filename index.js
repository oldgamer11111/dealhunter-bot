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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const DATA_FILE = "./settings.json";

let data = fs.existsSync(DATA_FILE)
  ? JSON.parse(fs.readFileSync(DATA_FILE))
  : { channels: {}, notify: [] };

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
    .setDescription("Set alert channel")
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
    .setDescription("Manual deal check")
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
    .setName("notifyme")
    .setDescription("Get DM when game hits discount")
    .addStringOption(option =>
      option.setName("game")
        .setDescription("Game name")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("discount")
        .setDescription("Discount percentage")
        .setRequired(true)
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

  setInterval(runAutoCheck, 3600000); // hourly
  setInterval(refreshAllChannels, 43200000); // every 12h

  runAutoCheck();
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const platform = interaction.options.getString("platform");

  if (interaction.commandName === "setchannel") {
    data.channels[platform] = interaction.channelId;
    saveData();
    return interaction.reply(`✅ ${platform.toUpperCase()} alerts set here.`);
  }

  if (interaction.commandName === "check") {
    await interaction.deferReply();
    await fetchDeals(platform, true);
    return interaction.editReply("✅ Deals sent.");
  }

  if (interaction.commandName === "notifyme") {
    const game = interaction.options.getString("game").toLowerCase();
    const discount = interaction.options.getInteger("discount");

    data.notify.push({
      user: interaction.user.id,
      game,
      discount
    });

    saveData();

    return interaction.reply(`🔔 You’ll be notified when ${game} hits ${discount}%+`);
  }
});

async function getINRRate() {
  try {
    const res = await axios.get("https://api.exchangerate-api.com/v4/latest/USD");
    return res.data.rates.INR;
  } catch {
    return 83;
  }
}

let sentDeals = new Set();

async function runAutoCheck() {
  for (let platform of Object.keys(data.channels)) {
    await fetchDeals(platform, false);
  }
}

async function refreshAllChannels() {
  for (let platform of Object.keys(data.channels)) {
    const channel = await client.channels.fetch(data.channels[platform]);
    await channel.bulkDelete(100).catch(() => {});
    await fetchDeals(platform, true);
  }
}

async function fetchDeals(platform, manual) {
  if (!data.channels[platform]) return;

  try {
    const response = await axios.get(
      `https://www.cheapshark.com/api/1.0/deals?storeID=${STORES[platform]}&upperPrice=100`
    );

    const deals = response.data.filter(
      game => parseFloat(game.savings) >= 70
    );

    const channel = await client.channels.fetch(data.channels[platform]);
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
        .setURL(`https://www.cheapshark.com/redirect?dealID=${game.dealID}`)
        .setThumbnail(
          game.thumb
        )
        .addFields(
          { name: "Platform", value: platform.toUpperCase(), inline: true },
          { name: "Discount", value: `${discount}%`, inline: true },
          { name: "USD", value: `$${usd}`, inline: true },
          { name: "INR", value: `₹${inr}`, inline: true }
        )
        .setColor(discount >= 90 ? 0xff0000 : 0x00AEFF)
        .setFooter({ text: "Deal Hunter Pro" });

      if (discount >= 90) {
        await channel.send("🚨 90%+ MEGA DEAL 🚨");
      }

      await channel.send({ embeds: [embed] });

      // Notify users
      for (let n of data.notify) {
        if (
          game.title.toLowerCase().includes(n.game) &&
          discount >= n.discount
        ) {
          const user = await client.users.fetch(n.user);
          await user.send(
            `🔔 ${game.title} is now ${discount}% OFF!\n$${usd} | ₹${inr}`
          );
        }
      }
    }

  } catch (err) {
    console.error(err);
  }
}

client.login(process.env.TOKEN);
