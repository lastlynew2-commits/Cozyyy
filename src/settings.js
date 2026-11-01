import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dataPath = resolve(dirname(fileURLToPath(import.meta.url)), "../data/settings.json");

export const categories = [
  { label: "General", value: "general" },
  { label: "Arrivals", value: "arrivals" },
  { label: "Protection", value: "protection" },
  { label: "Moderation", value: "moderation" },
  { label: "Utilities", value: "utilities" }
];

export const settingDefinitions = [
  {
    id: "discord", category: "protection", title: "DISCORD", badge: "NEW",
    fields: [
      { id: "panelChannel", label: "DISCON panel channel ID", default: "" },
      { id: "statusChannel", label: "Status voice channel ID", default: "" },
      { id: "currentLevel", label: "DISCON level", default: "5" }
    ],
    summary: (value) => `Server danger level: DISCON ${value.currentLevel}`
  },
  {
    id: "raidMode", category: "arrivals", title: "Auto RaidMode",
    fields: [
      { id: "enabled", label: "Enabled (yes/no)", default: "yes" },
      { id: "members", label: "New members threshold", default: "10" },
      { id: "seconds", label: "Time window in seconds", default: "10" },
      { id: "duration", label: "RaidMode duration in minutes", default: "5" },
      { id: "action", label: "Action during the raid", default: "lock_invites" },
      { id: "closeDMs", label: "Close DMs (yes/no)", default: "yes" }
    ],
    summary: (value) => isEnabled(value.enabled) ? `${value.members} members / ${value.seconds} seconds · ${value.duration} minutes` : "Disabled"
  },
  {
    id: "minimumAge", category: "arrivals", title: "Minimum account age",
    fields: [
      { id: "enabled", label: "Enabled (yes/no)", default: "yes" },
      { id: "hours", label: "Minimum age in hours", default: "12" },
      { id: "action", label: "Action for accounts that are too new", default: "kick" }
    ],
    summary: (value) => isEnabled(value.enabled) ? `${value.hours} hours` : "Disabled"
  },
  {
    id: "autoRoles", category: "arrivals", title: "Auto roles", badge: "NEW",
    fields: [
      { id: "roles", label: "Assigned role IDs", default: "" },
      { id: "buttons", label: "Auto roles link buttons", default: "[]" }
    ],
    summary: (value) => value.roles ? value.roles.split(",").map((roleId) => `<@&${roleId}>`).join(" ") : "No roles selected"
  },
  {
    id: "captcha", category: "arrivals", title: "Captcha", badge: "NEW",
    fields: [{ id: "channel", label: "Verification channel", default: "" }],
    summary: (value) => value.channel ? `<#${value.channel}>` : "Disabled"
  },
  {
    id: "welcome", category: "arrivals", title: "Welcome message", badge: "NEW",
    fields: [
      { id: "enabled", label: "Enabled (yes/no)", default: "no" },
      { id: "channel", label: "Welcome channel ID", default: "" },
      { id: "message", label: "Welcome message", default: "welcome {user.mention} to **{server.name}**!", paragraph: true },
      { id: "mention", label: "Mention member (yes/no)", default: "no" },
      { id: "color", label: "Embed color", default: "e05b60" },
      { id: "thumbnailUrl", label: "Thumbnail image URL", default: "" },
      { id: "imageUrl", label: "Welcome image URL", default: "" },
      { id: "buttons", label: "Welcome link buttons", default: "[]" }
    ],
    summary: (value) => isEnabled(value.enabled) ? `#${value.channel} · ${value.message}` : "Disabled"
  },
  {
    id: "bots", category: "arrivals", title: "Bots", badge: "NEW",
    fields: [{ id: "kick", label: "Allow new bots (yes/no)", default: "no" }],
    summary: (value) => `New bots: ${isEnabled(value.kick) ? "Blocked" : "Allowed"}`
  },
  {
    id: "antiSpam", category: "protection", title: "Anti-spam",
    fields: [
      { id: "enabled", label: "Enabled (yes/no)", default: "yes" },
      { id: "sanction", label: "Sanctions", default: "standard" },
      { id: "ignoredChannels", label: "Ignored channel IDs", default: "" },
      { id: "ignoreSpamChannels", label: "Ignore channels with spam in the name (yes/no)", default: "yes" },
      { id: "ignoredRoles", label: "Ignored role IDs", default: "" },
      { id: "ignoredMembers", label: "Ignored member IDs", default: "" }
    ],
    summary: (value) => isEnabled(value.enabled) ? "Enabled" : "Disabled"
  },
  {
    id: "automod", category: "protection", title: "Automod", badge: "NEW",
    fields: [{ id: "enabled", label: "Enabled (yes/no)", default: "yes" }],
    summary: () => "Images, Other servers, File extensions"
  },
  {
    id: "automodImages", category: "automod", title: "Images",
    fields: [
      { id: "enabled", label: "Enabled (yes/no)", default: "yes" },
      { id: "sanction", label: "Applied sanction", default: "timeout" },
      { id: "duration", label: "Sanction duration in minutes", default: "60" },
      { id: "catalogs", label: "Image catalogs", default: "[]" }
    ],
    summary: (value) => `${value.sanction === "default" ? "Default" : value.sanction[0].toUpperCase() + value.sanction.slice(1)} · ${value.duration === "60" ? "1 hour" : `${value.duration} minutes`}`
  },
  {
    id: "automodOtherServers", category: "automod", title: "Other servers", badge: "NEW",
    fields: [
      { id: "enabled", label: "Enabled (yes/no)", default: "no" },
      { id: "invites", label: "Invite links", default: "disabled" },
      { id: "forwarded", label: "Forwarded messages, channel or event links", default: "disabled" },
      { id: "serverTags", label: "Displayed server tags", default: "disabled" },
      { id: "deletedSanction", label: "Sanction for deleted messages", default: "message_deleted" },
      { id: "blocklist", label: "Blocked server IDs", default: "[]" },
      { id: "allowlist", label: "Allowed server IDs", default: "[]" }
    ],
    summary: () => "Invites, forwards and tags from other servers"
  },
  {
    id: "automodFileExtensions", category: "automod", title: "File extensions", badge: "NEW",
    fields: [
      { id: "enabled", label: "Enabled (yes/no)", default: "no" },
      { id: "entireServer", label: "Entire server rule", default: "disabled" },
      { id: "refuseCorrupted", label: "Always refuse corrupted files (yes/no)", default: "yes" },
      { id: "channelRules", label: "Channel and category rules", default: "[]" },
      { id: "deletedSanction", label: "Sanction for deleted messages", default: "message_deleted" }
    ],
    summary: () => "Blocked files, or only allowed ones, per channel"
  },
  {
    id: "honeyPot", category: "protection", title: "HoneyPot", badge: "NEW",
    fields: [
      { id: "enabled", label: "Enabled (yes/no)", default: "yes" },
      { id: "channel", label: "Silence channel ID", default: "" },
      { id: "sanction", label: "Applied sanction", default: "softban" },
      { id: "duration", label: "Mute or jail duration in minutes", default: "1440" },
      { id: "delay", label: "Delay before sanction in seconds", default: "0" },
      { id: "ignoredMembers", label: "Ignored member preset", default: "staff" }
    ],
    summary: (value) => `#${value.channel || "silence-channel"} · ${isEnabled(value.enabled) ? "Enabled" : "Disabled"}`
  },
  {
    id: "preventiveSlowmode", category: "protection", title: "Preventive slowmode", badge: "NEW",
    fields: [{ id: "slots", label: "Per-channel slowmode rules", default: "[]" }],
    summary: (value) => `${parseJsonArray(value.slots).filter(Boolean).length}/6 channels configured`
  },
  {
    id: "authenticationManager", category: "protection", title: "Authentication Manager",
    fields: [
      { id: "sessionTime", label: "Default session time", default: "10m" },
      { id: "minGrade", label: "Default minimum grade", default: "A" },
      { id: "minManagersGrade", label: "Minimum managers grade", default: "A" },
      { id: "webhookUrl", label: "Webhook URL", default: "" },
      { id: "roles", label: "Authentication roles", default: "[]" },
      { id: "users", label: "Authentication users", default: "[]" },
      { id: "logs", label: "Authentication access log", default: "[]" },
      { id: "lastSessions", label: "Recent sessions", default: "[]" }
    ],
    summary: (value) => `Session ${value.sessionTime} · Grade ${value.minGrade} · ${parseJsonArray(value.roles).length} roles`
  },
  {
    id: "dmLock", category: "protection", title: "DM Lock",
    buttonLabel: "Edit",
    fields: [{ id: "enabled", label: "Close the server's direct messages", default: "no" }],
    summary: (value) => isEnabled(value.enabled) ? "Enabled" : "Disabled"
  },
  {
    id: "logs", category: "moderation", title: "Logs",
    fields: [
      { id: "miscellaneousChannel", label: "Miscellaneous log channel", default: "cozyy-logs" },
      { id: "moderationChannel", label: "Moderation log channel", default: "cozyy-logs" },
      { id: "captchaChannel", label: "Captcha log channel", default: "cozyy-logs" }
    ],
    summary: (value) => `Miscellaneous #${value.miscellaneousChannel}\nModeration #${value.moderationChannel}\nCaptcha #${value.captchaChannel}`
  },
  {
    id: "sanctions", category: "moderation", title: "Sanctions", badge: "NEW",
    fields: [
      { id: "enabled", label: "Enabled (yes/no)", default: "yes" },
      { id: "jailRoleId", label: "Jail role ID", default: "" },
      { id: "jailHandling", label: "Role handling on jail", default: "add" },
      { id: "jailedMembers", label: "Jailed member role backups", default: "[]" },
      { id: "muteRoleId", label: "Mute role ID", default: "" },
      { id: "muteHandling", label: "Role handling on mute", default: "add" },
      { id: "timeoutEnabled", label: "Enable Timeout/Mute commands (yes/no)", default: "no" },
      { id: "syncedQuarantine", label: "Synced Discord quarantine (yes/no)", default: "no" },
      { id: "banDeletion", label: "Message deletion on ban", default: "none" },
      { id: "logsChannel", label: "Sanction logs channel", default: "cozyy-logs" },
      { id: "passiveLogs", label: "Passive moderation logs (yes/no)", default: "yes" },
      { id: "showMedia", label: "Show media (yes/no)", default: "no" },
      { id: "privacy", label: "Sanctions privacy (yes/no)", default: "no" },
      { id: "sanctionNames", label: "Sanction names", default: "[]" }
    ],
    summary: (value) => isEnabled(value.enabled) ? "Enabled" : "Disabled"
  },
  {
    id: "reports", category: "moderation", title: "Reports",
    fields: [
      { id: "enabled", label: "Enabled (yes/no)", default: "yes" },
      { id: "channel", label: "Reports channel", default: "cozyy-logs" },
      { id: "automaticCreation", label: "Create a reports channel automatically (yes/no)", default: "no" },
      { id: "notificationRoleId", label: "Notification role ID", default: "" },
      { id: "notifyEveryone", label: "Mention @everyone (yes/no)", default: "no" },
      { id: "notifyHere", label: "Mention @here (yes/no)", default: "yes" },
      { id: "mention", label: "Legacy notification mention", default: "@here" },
      { id: "reporterNotification", label: "Reporter notification mode", default: "handled" },
      { id: "grouping", label: "Group reports (yes/no)", default: "yes" },
      { id: "trustedRoleId", label: "Trusted role ID", default: "" },
      { id: "falseReportThreshold", label: "False reporter threshold", default: "disabled" },
      { id: "falseReportWindow", label: "False reporter period in days", default: "30" },
      { id: "falseReportAction", label: "False reporter action", default: "notify" },
      { id: "falseReportSanction", label: "False reporter sanction", default: "warn" }
    ],
    summary: (value) => isEnabled(value.enabled) ? `#${value.channel} · ${value.mention}` : "Disabled"
  },
  {
    id: "transparency", category: "moderation", title: "Transparency",
    fields: [
      { id: "enabled", label: "Enabled (yes/no)", default: "no" },
      { id: "channel", label: "Public moderation log channel", default: "cozyy-logs" }
    ],
    summary: (value) => `${isEnabled(value.enabled) ? "Enabled" : "Disabled"}\nPeriodic recaps and public modlog.`
  },
  {
    id: "tagRole", category: "utilities", title: "Tag Role",
    buttonLabel: "Configure",
    fields: [{ id: "roleId", label: "Server tag role ID", default: "" }],
    summary: (value) => value.roleId ? `<@&${value.roleId}>` : "Disabled"
  },
  {
    id: "channelLock", category: "utilities", title: "Channel lock",
    toggle: true,
    fields: [{ id: "enabled", label: "Enabled (yes/no)", default: "yes" }],
    summary: (value) => isEnabled(value.enabled) ? "Enabled" : "Disabled"
  },
  {
    id: "onDutyRole", category: "utilities", title: "On-duty role", badge: "NEW",
    buttonLabel: "Configure",
    fields: [{ id: "roleId", label: "On-duty role ID", default: "" }],
    summary: (value) => value.roleId ? `<@&${value.roleId}>` : "Disabled"
  },
  {
    id: "messageCaching", category: "utilities", title: "Message caching", badge: "NEW",
    toggle: true,
    fields: [{ id: "enabled", label: "Enabled (yes/no)", default: "yes" }],
    summary: (value) => isEnabled(value.enabled) ? "Enabled" : "Disabled"
  },
  {
    id: "language", category: "general", title: "Language",
    fields: [{
      id: "locale", label: "Bot language", default: "English",
      options: [
        { label: "Italiano", value: "Italiano" },
        { label: "English", value: "English" },
        { label: "Tagalog (Filipino)", value: "Tagalog (Filipino)" }
      ]
    }],
    summary: (value) => value.locale || "English"
  },
  {
    id: "commands", category: "general", title: "Message commands",
    fields: [{
      id: "prefix", label: "Prefix (or 'disabled' to turn off)", default: "!", maxLength: 8
    }],
    summary: (value) => value.prefix.toLowerCase() === "disabled"
      ? "Disabled · Prefix commands unavailable"
      : `Prefix: ${value.prefix}\nAvailable commands: ${["help", "setup", "afk", "report", "onduty", "avatar", "cover", "jail", "unjail", "timeout", "mute"].map((command) => `${value.prefix}${command}`).join(", ")}`
  },
  {
    id: "commandPermissions", category: "general", title: "Command Permissions",
    buttonLabel: "View",
    fields: [],
    summary: () => "Integrations applied everywhere"
  },
  {
    id: "timezone", category: "general", title: "Timezone",
    fields: [{
      id: "zone", label: "Timezone", default: "America/New_York",
      options: [
        { label: "USA", value: "America/New_York" },
        { label: "Italy", value: "Europe/Rome" },
        { label: "Philippines", value: "Asia/Manila" }
      ]
    }],
    summary: (value) => ({
      "America/New_York": "USA",
      "Europe/Rome": "Italy",
      "Asia/Manila": "Philippines"
    }[value.zone] ?? "USA")
  }
];

export function isEnabled(value) {
  return ["yes", "true", "on", "enabled"].includes(String(value).trim().toLowerCase());
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readGuildSettings(guildId) {
  let allSettings = {};
  try {
    allSettings = JSON.parse(readFileSync(dataPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const saved = allSettings[guildId] ?? {};
  const settings = Object.fromEntries(settingDefinitions.map((definition) => {
    const savedValues = saved[definition.id] ?? {};
    return [definition.id, Object.fromEntries(definition.fields.map((field) => [
      field.id,
      String(savedValues[field.id] ?? field.default)
    ]))];
  }));
  settings.afk = { members: String(saved.afk?.members ?? "{}") };
  return settings;
}

export function writeGuildSettings(guildId, values) {
  let allSettings = {};
  try {
    allSettings = JSON.parse(readFileSync(dataPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  allSettings[guildId] = values;
  mkdirSync(dirname(dataPath), { recursive: true });
  writeFileSync(dataPath, `${JSON.stringify(allSettings, null, 2)}\n`);
}

export function escapeMarkdown(value) {
  return String(value).replace(/[\\`*_{}\[\]()#+\-.!|>~]/g, "\\$&");
}