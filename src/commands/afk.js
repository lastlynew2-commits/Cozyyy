import { ContainerBuilder, SlashCommandBuilder, TextDisplayBuilder } from "discord.js";
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

export function formatAfkNickname(displayName) {
  const name = stripAfkPrefix(displayName);
  return name ? `[AFK] ${name}` : "[AFK] User";
}

export function stripAfkPrefix(displayName) {
  return String(displayName ?? "").replace(/^\[AFK\]\s*/i, "").trim();
}

export async function setAfkStatus(guild, userId, reason = "") {
  const guildId = typeof guild === "string" ? guild : guild.id;
  const settings = readGuildSettings(guildId);
  const members = readAfkMembers(settings);
  const message = String(reason).trim().slice(0, 300);
  const member = guild && typeof guild.members?.fetch === "function"
    ? await guild.members.fetch(userId).catch(() => null)
    : null;

  const status = {
    ...(members[userId] ?? {}),
    reason: message || "AFK",
    since: Date.now()
  };

  if (member && member.manageable && !member.user.bot) {
    const originalNickname = member.nickname ?? null;
    const displayName = stripAfkPrefix(member.nickname ?? member.user.globalName ?? member.user.username);
    const afkNickname = formatAfkNickname(displayName);
    status.originalNickname = status.originalNickname ?? originalNickname;

    if (member.nickname !== afkNickname) {
      await member.setNickname(afkNickname, "AFK status").catch((error) => {
        console.warn(`Could not set AFK nickname for member ${userId} in guild ${guildId}:`, error.message);
      });
    }
  }

  members[userId] = status;
  settings.afk.members = JSON.stringify(members);
  writeGuildSettings(guildId, settings);
  return members[userId];
}

export function createAfkConfirmation(user, status) {
  return new ContainerBuilder()
    .setAccentColor(0x000000)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## ${user.globalName ?? user.username} is now AFK\n${status.reason}`
    ));
}

export function createAfkNoticeContainer(notices) {
  const content = notices
    .map(({ user, status }) =>
      `**${user.username}** has been AFK for ${formatAfkDuration(status.since)}: ${status.reason}`
    )
    .join("\n");

  return new ContainerBuilder()
    .setAccentColor(0x000000)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## AFK\n${content}`));
}

export function createWelcomeBackContainer(duration) {
  return new ContainerBuilder()
    .setAccentColor(0x000000)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## Welcome back!\nYou were AFK for ${duration}.`
    ));
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

export async function clearAfkStatus(guild, userId) {
  const guildId = typeof guild === "string" ? guild : guild.id;
  const settings = readGuildSettings(guildId);
  const members = readAfkMembers(settings);
  const status = members[userId] ?? null;
  if (!status) return null;

  const member = guild && typeof guild.members?.fetch === "function"
    ? await guild.members.fetch(userId).catch(() => null)
    : null;
  if (member && member.manageable && !member.user.bot) {
    const restoreNickname = status.originalNickname ?? null;
    if (member.nickname !== restoreNickname) {
      await member.setNickname(restoreNickname, "AFK status ended").catch((error) => {
        console.warn(`Could not restore nickname for member ${userId} in guild ${guildId}:`, error.message);
      });
    }
  }

  delete members[userId];
  settings.afk.members = JSON.stringify(members);
  writeGuildSettings(guildId, settings);
  return status;
}
