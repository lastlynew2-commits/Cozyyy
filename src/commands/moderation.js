import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { isEnabled, readGuildSettings, writeGuildSettings } from "../settings.js";

const moderationCommands = [
  new SlashCommandBuilder()
    .setName("jail")
    .setDescription("Give a member the configured Jail role")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((option) => option.setName("member").setDescription("Member to jail").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason for the jail").setMaxLength(500)),
  new SlashCommandBuilder()
    .setName("unjail")
    .setDescription("Remove a member's Jail role and restore saved roles")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((option) => option.setName("member").setDescription("Member to unjail").setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason for the unjail").setMaxLength(500)),
  ...["timeout", "mute"].map((name) => new SlashCommandBuilder()
    .setName(name)
    .setDescription(`${name === "mute" ? "Mute" : "Timeout"} a member for a number of minutes`)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("member").setDescription("Member to timeout").setRequired(true))
    .addIntegerOption((option) => option.setName("minutes").setDescription("Duration in minutes (1-40320)").setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption((option) => option.setName("reason").setDescription("Reason for the timeout").setMaxLength(500)))
].map((command) => command.toJSON());

export { moderationCommands };

function readJailedMembers(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function canModerateTarget(actor, target, guild) {
  if (actor.id === target.id) return "You cannot use this command on yourself.";
  if (target.id === guild.ownerId) return "The server owner cannot be moderated.";
  if (actor.id !== guild.ownerId && actor.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return "Your highest role must be above the target's highest role.";
  }
  return "";
}

export async function executeModerationCommand({ guild, actor, target, action, minutes, reason }) {
  if (!guild || !actor || !target || target.guild.id !== guild.id) {
    throw new Error("Choose a valid member in this server.");
  }

  const jailAction = action === "jail" || action === "unjail";
  const requiredPermission = jailAction ? PermissionFlagsBits.ManageRoles : PermissionFlagsBits.ModerateMembers;
  if (actor.id !== guild.ownerId && !actor.permissions.has(requiredPermission)) {
    throw new Error(jailAction ? "You need Manage Roles to use Jail commands." : "You need Moderate Members to use Timeout/Mute commands.");
  }

  const hierarchyError = canModerateTarget(actor, target, guild);
  if (hierarchyError) throw new Error(hierarchyError);

  const botMember = guild.members.me ?? await guild.members.fetchMe();
  const settings = readGuildSettings(guild.id);
  const sanctions = settings.sanctions;
  if (action === "jail" && !isEnabled(sanctions.enabled)) {
    throw new Error("Enable Sanctions in /setup before using /jail.");
  }
  if (action === "jail" && !sanctions.jailRoleId) {
    throw new Error("Configure a Jail role in /setup > Moderation > Sanctions > Jail before using /jail.");
  }
  if ((action === "timeout" || action === "mute") && !isEnabled(sanctions.timeoutEnabled)) {
    throw new Error("Enable Timeout / Mute commands in /setup > Moderation > Sanctions before using this command.");
  }
  const auditReason = String(reason || `Cozyy ${action} command`).slice(0, 500);

  if (action === "timeout" || action === "mute") {
    const durationMs = Number(minutes) * 60_000;
    if (!Number.isInteger(Number(minutes)) || durationMs < 60_000 || durationMs > 28 * 24 * 60 * 60_000) {
      throw new Error("Duration must be between 1 and 40320 minutes (28 days).");
    }
    if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers) || !target.moderatable) {
      throw new Error("I cannot timeout that member. Check my Moderate Members permission and role position.");
    }
    await target.timeout(durationMs, auditReason);
    return `${target.user.tag} was ${action === "mute" ? "muted" : "timed out"} for ${minutes} minute${Number(minutes) === 1 ? "" : "s"}.`;
  }

  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || !target.manageable) {
    throw new Error("I cannot change that member's roles. Check my Manage Roles permission and role position.");
  }

  const jailedMembers = readJailedMembers(sanctions.jailedMembers);
  const existingIndex = jailedMembers.findIndex((entry) => entry.memberId === target.id);

  if (action === "jail") {
    const jailRole = guild.roles.cache.get(sanctions.jailRoleId);
    if (!jailRole || !jailRole.editable) {
      throw new Error("Configure a Jail role first in /setup > Moderation > Sanctions > Jail.");
    }
    if (existingIndex < 0) {
      jailedMembers.push({
        memberId: target.id,
        roleId: jailRole.id,
        handling: sanctions.jailHandling,
        roleIds: target.roles.cache.filter((role) => role.id !== guild.id && role.id !== jailRole.id && !role.managed).map((role) => role.id),
        hadJailRole: target.roles.cache.has(jailRole.id)
      });
    }
    if (sanctions.jailHandling === "replace") await target.roles.set([jailRole], auditReason);
    else await target.roles.add(jailRole, auditReason);
    sanctions.jailedMembers = JSON.stringify(jailedMembers);
    writeGuildSettings(guild.id, settings);
    return `${target.user.tag} was jailed.`;
  }

  if (action === "unjail") {
    const record = existingIndex >= 0 ? jailedMembers[existingIndex] : null;
    const jailRole = guild.roles.cache.get(record?.roleId || sanctions.jailRoleId);
    if (!jailRole) throw new Error("No configured Jail role was found for this member.");
    if (record && record.handling === "replace") {
      const roles = (record.roleIds ?? [])
        .map((roleId) => guild.roles.cache.get(roleId))
        .filter((role) => role?.editable);
      await target.roles.set(roles, auditReason);
    } else if (!record?.hadJailRole) {
      await target.roles.remove(jailRole, auditReason);
    }
    if (existingIndex >= 0) jailedMembers.splice(existingIndex, 1);
    sanctions.jailedMembers = JSON.stringify(jailedMembers);
    writeGuildSettings(guild.id, settings);
    return `${target.user.tag} was unjailed.`;
  }

  throw new Error("Unknown moderation command.");
}
