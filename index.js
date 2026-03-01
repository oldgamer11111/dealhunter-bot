const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const axios = require('axios');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const commands = [
  new SlashCommandBuilder()
    .setName('check')
    .setDescription('Check 70%+ Steam deals')
].map(command => command.toJSON());

client.once("ready", async () => {
  console.log("Bot is online!");

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("Slash command registered!");
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "check") {
    await interaction.deferReply();

    const response = await axios.get(
      "https://www.cheapshark.com/api/1.0/deals?storeID=1&upperPrice=100"
    );

    const deals = response.data.filter(
      game => parseFloat(game.savings) >= 70
    );

    if (deals.length === 0) {
      return interaction.editReply("No 70%+ deals found.");
    }

    const game = deals[0];

    const embed = new EmbedBuilder()
      .setTitle(`🔥 ${game.title}`)
      .addFields(
        { name: "Price", value: `$${game.salePrice}`, inline: true },
        { name: "Discount", value: `${game.savings}%`, inline: true }
      )
      .setColor(0x00AEFF);

    interaction.editReply({ embeds: [embed] });
  }
});

client.login(process.env.TOKEN);
