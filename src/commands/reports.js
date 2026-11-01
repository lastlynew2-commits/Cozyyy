import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { isEnabled, readGuildSettings } from "../settings.js";

export const reportCommand = new SlashCommandBuilder()
  .setName("report")
  .setDescription("Send a report to the server's moderation team")
  .addUserOption((option) => option.setName("member").setDescription("Member being reported").setRequired(true))
  .addStringOption((option) => option.setName("details").setDescription("What should moderators know?").setMaxLength(1000))
  .toJSON();

async function findReportsChannel(guild, configuredChannel) {
  if (/^\d{17,20}$/.test(configuredChannel)) {
    return guild.channels.cache.get(configuredChannel)
      ?? await guild.channels.fetch(configuredChannel).catch(() => null);
  }
  const normalizedName = configuredChannel.replace(/^#/, "").toLowerCase();
  return guild.channels.cache.find((channel) => channel.name?.toLowerCase() === normalizedName) ?? null;
}

export async function submitReport({ guild, reporter, target, details = "", messageUrl = "" }) {
  if (!guild || !reporter || !target) throw new Error("Reports can only be sent from a server. Select a member to report.");
  const { reports } = readGuildSettings(guild.id);
  if (!isEnabled(reports.enabled)) throw new Error("Reports are disabled in /setup > Moderation > Reports.");

  const channel = await findReportsChannel(guild, reports.channel);
  if (!channel?.isTextBased() || !channel.isSendable()) {
    throw new Error("Choose a valid receiving channel in /setup > Moderation > Reports.");
  }

  const botMember = guild.members.me ?? await guild.members.fetchMe();
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    throw new Error("I need Send Messages and Embed Links in the configured reports channel.");
  }

  const embed = new EmbedBuilder()
    .setColor(0xe05b60)
    .setTitle("New report")
    .addFields(
      { name: "Reported member", value: `<@${target.id}>`, inline: true },
      { name: "Reporter", value: `<@${reporter.id}>`, inline: true }
    )
    .setDescription(String(details).trim().slice(0, 1000) || "No details provided.")
    .setTimestamp();
  if (messageUrl) embed.addFields({ name: "Reported message", value: messageUrl.slice(0, 1000) });

  const roleId = reports.notificationRoleId;
  const everyone = isEnabled(reports.notifyEveryone);
  const here = isEnabled(reports.notifyHere);
  const mention = roleId && guild.roles.cache.has(roleId) ? `<@&${roleId}>` : everyone ? "@everyone" : here ? "@here" : "";
  const allowedMentions = {
    parse: everyone ? ["everyone"] : here ? ["everyone"] : [],
    roles: roleId && guild.roles.cache.has(roleId) ? [roleId] : [],
    users: []
  };

  await channel.send({
    content: mention,
    embeds: [embed],
    allowedMentions
  });
  return channel;
}
