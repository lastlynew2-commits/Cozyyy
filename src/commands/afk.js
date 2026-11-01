import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { readGuildSettings, writeGuildSettings } from "../settings.js";

export const afkCommand = new SlashCommandBuilder()
  .setName("afk")
  .setDescription("Set your AFK status")
  .addStringOption((option) => option.setName("reason").setDescription("Why you are away").setMaxLength(300))
  .toJSON();

function readAfkMembers(settings) {
  try {
    const parsed = JSON.parse(settings.afk.members || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function setAfkStatus(guildId, userId, reason = "") {
  const settings = readGuildSettings(guildId);
  const members = readAfkMembers(settings);
  const message = String(reason).trim().slice(0, 300);
  members[userId] = { reason: message || "AFK", since: Date.now() };
  settings.afk.members = JSON.stringify(members);
  writeGuildSettings(guildId, settings);
  return members[userId];
}

export function createAfkConfirmation(user, status) {
  return new EmbedBuilder()
    .setColor(0x000000)
    .setAuthor({
      name: `${user.globalName ?? user.username} is now afk..`,
      iconURL: user.displayAvatarURL()
    })
    .setDescription(status.reason);
}

export function getAfkStatus(guildId, userId) {
  const settings = readGuildSettings(guildId);
  return readAfkMembers(settings)[userId] ?? null;
}

export function formatAfkDuration(since, now = Date.now()) {
  let totalSeconds = Math.floor(Math.max(0, now - Number(since)) / 1000);

  const units = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
    ["second", 1]
  ];
  const parts = [];
  for (const [unit, secondsPerUnit] of units) {
    const count = Math.floor(totalSeconds / secondsPerUnit);
    if (!count) continue;
    parts.push(`${count} ${unit}${count === 1 ? "" : "s"}`);
    totalSeconds %= secondsPerUnit;
  }
  if (parts.length < 2) return parts[0] ?? "0 seconds";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export function clearAfkStatus(guildId, userId) {
  const settings = readGuildSettings(guildId);
  const members = readAfkMembers(settings);
  const status = members[userId] ?? null;
  if (!status) return null;
  delete members[userId];
  settings.afk.members = JSON.stringify(members);
  writeGuildSettings(guildId, settings);
  return status;
}
