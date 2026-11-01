import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { readGuildSettings } from "../settings.js";

export const onDutyCommand = new SlashCommandBuilder()
  .setName("onduty")
  .setDescription("Toggle your server's on-duty role")
  .toJSON();

export async function toggleOnDutyRole(guild, member) {
  const roleId = readGuildSettings(guild.id).onDutyRole.roleId;
  const role = roleId ? guild.roles.cache.get(roleId) : null;
  if (!role) throw new Error("Configure the On-duty role first in /setup > Utilities.");

  const botMember = guild.members.me ?? await guild.members.fetchMe();
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || !role.editable) {
    throw new Error("I cannot assign that role. Check my Manage Roles permission and role position.");
  }

  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role, "Member toggled their On-duty status.");
    return "You are now off duty.";
  }
  await member.roles.add(role, "Member toggled their On-duty status.");
  return "You are now on duty.";
}

export async function syncTagRole(member) {
  if (!member || member.user.bot) return;
  const roleId = readGuildSettings(member.guild.id).tagRole.roleId;
  const role = roleId ? member.guild.roles.cache.get(roleId) : null;
  if (!role || !role.editable) return;

  const primaryGuild = member.user.primaryGuild;
  const hasServerTag = primaryGuild?.identityGuildId === member.guild.id
    && primaryGuild.identityEnabled === true
    && Boolean(primaryGuild.tag);
  const alreadyHasRole = member.roles.cache.has(role.id);
  if (hasServerTag && !alreadyHasRole) await member.roles.add(role, "Member enabled this server's profile tag.");
  else if (!hasServerTag && alreadyHasRole) await member.roles.remove(role, "Member removed this server's profile tag.");
}
