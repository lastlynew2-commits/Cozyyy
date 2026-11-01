import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { afkCommand } from "./commands/afk.js";
import { mediaCommands } from "./commands/media.js";
import { moderationCommands } from "./commands/moderation.js";
import { reportCommand } from "./commands/reports.js";
import { onDutyCommand } from "./commands/utilities.js";

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  throw new Error("Set DISCORD_TOKEN and CLIENT_ID in .env before deploying commands.");
}

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Open the Cozyy server settings")
    .toJSON(),
  afkCommand,
  ...moderationCommands,
  ...mediaCommands,
  reportCommand,
  onDutyCommand
];

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
const route = GUILD_ID
  ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
  : Routes.applicationCommands(CLIENT_ID);

await rest.put(route, { body: commands });
console.log(GUILD_ID ? `Registered ${commands.length} commands in server ${GUILD_ID}.` : `Registered ${commands.length} global commands.`);