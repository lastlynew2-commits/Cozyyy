import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CheckboxGroupBuilder,
  CheckboxBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  TextDisplayBuilder,
  UserSelectMenuBuilder
} from "discord.js";
import { createAntiSpamContainer, createAuthenticationManagerContainer, createAutomodContainer, createAutoRolesButtonsManagerContainer, createAutoRolesContainer, createBotLogsContainer, createBotsContainer, createCaptchaContainer, createDisconContainer, createFileExtensionsContainer, createHoneyPotContainer, createImageFilterContainer, createJailContainer, createLogsContainer, createMinimumAgeContainer, createMuteContainer, createOnDutyRoleContainer, createOtherServersContainer, createPreventiveSlowmodeContainer, createRaidModeContainer, createReportsContainer, createSanctionsContainer, createSetupContainer, createTagRoleContainer, createWelcomeButtonRow, createWelcomeButtonsManagerContainer, createWelcomeContainer, createWelcomePreviewEmbed, parseWelcomeButtons, setupMessageFlags } from "./commands/setup.js";
import { categories, isEnabled, readGuildSettings, settingDefinitions, writeGuildSettings } from "./settings.js";
import { executeModerationCommand } from "./commands/moderation.js";
import { createMediaResponse, resolveMediaUserId } from "./commands/media.js";
import { clearAfkStatus, createAfkConfirmation, createAfkNoticeContainer, createWelcomeBackContainer, formatAfkDuration, getAfkStatus, setAfkStatus } from "./commands/afk.js";
import { syncTagRole, toggleOnDutyRole } from "./commands/utilities.js";
import { createFalseReportModal, createReportNotificationRoleModal, createReporterNotificationModal, createReportsReceivingModal, createTrustedRoleModal } from "./commands/report-forms.js";
import { submitReport } from "./commands/reports.js";

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN is missing. Copy .env.example to .env and set your bot token.");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

function parseCommandDuration(value) {
  const match = /^(\d+)(m|h|d)?$/i.exec(value ?? "");
  if (!match) return null;
  const multiplier = { m: 1, h: 60, d: 1440 }[(match[2] ?? "m").toLowerCase()];
  const minutes = Number(match[1]) * multiplier;
  return Number.isSafeInteger(minutes) && minutes >= 1 && minutes <= 40320 ? minutes : null;
}

async function handlePrefixModeration(message) {
  if (!message.guild || message.author.bot || !message.member) return;
  const prefix = String(readGuildSettings(message.guild.id).commands.prefix ?? "").trim();
  const isPrefixCommand = Boolean(prefix && prefix.toLowerCase() !== "disabled" && message.content.startsWith(prefix));
  const args = isPrefixCommand ? message.content.slice(prefix.length).trim().split(/\s+/).filter(Boolean) : [];
  const action = args.shift()?.toLowerCase();
  if (isPrefixCommand && action === "afk") {
    const status = await setAfkStatus(message.guild, message.author.id, args.join(" "));
    await message.reply({ components: [createAfkConfirmation(message.author, status)], flags: MessageFlags.IsComponentsV2 });
    return;
  }

  const previousStatus = await clearAfkStatus(message.guild, message.author.id);
  if (previousStatus) {
    await message.reply({
      components: [createWelcomeBackContainer(formatAfkDuration(previousStatus.since))],
      flags: MessageFlags.IsComponentsV2
    });
  }

  const afkTargets = new Map(message.mentions.users
    .filter((user) => user.id !== message.author.id)
    .map((user) => [user.id, user]));
  if (message.reference?.messageId) {
    const referencedMessage = await message.fetchReference().catch(() => null);
    const repliedUser = referencedMessage?.author;
    if (repliedUser && repliedUser.id !== message.author.id) afkTargets.set(repliedUser.id, repliedUser);
  }
  const afkNotices = [...afkTargets.values()]
    .map((user) => ({ user, status: getAfkStatus(message.guild.id, user.id) }))
    .filter(({ status }) => status);
  if (afkNotices.length) {
    await message.reply({
      components: [createAfkNoticeContainer(afkNotices)],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (!isPrefixCommand) return;
  if (action === "help") {
    await message.reply(`Prefix commands: ${prefix}setup, ${prefix}afk, ${prefix}report, ${prefix}onduty, ${prefix}avatar, ${prefix}cover, ${prefix}jail, ${prefix}unjail, ${prefix}timeout, ${prefix}mute`);
    return;
  }
  if (action === "setup") {
    await message.reply({ components: [createSetupContainer(message.guild.id)], flags: setupMessageFlags });
    return;
  }
  if (action === "report") {
    const targetToken = args.shift();
    const targetId = /^<@!?([0-9]{17,20})>$/.exec(targetToken ?? "")?.[1]
      ?? (/^[0-9]{17,20}$/.test(targetToken ?? "") ? targetToken : null);
    const target = targetId ? await message.guild.members.fetch(targetId).catch(() => null) : null;
    if (!target) {
      await message.reply(`Usage: ${prefix}report @member [details]`);
      return;
    }
    try {
      const channel = await submitReport({ guild: message.guild, reporter: message.author, target: target.user, details: args.join(" ") });
      await message.reply(`Your report was sent to #${channel.name}.`);
    } catch (error) {
      await message.reply(error.message);
    }
    return;
  }
  if (action === "onduty") {
    try {
      await message.reply(await toggleOnDutyRole(message.guild, message.member));
    } catch (error) {
      await message.reply(error.message);
    }
    return;
  }
  if (["avatar", "cover"].includes(action)) {
    const targetId = await resolveMediaUserId(message, args[0] ?? "");
    try {
      await message.reply(await createMediaResponse(client, targetId, action));
    } catch {
      await message.reply("I couldn't load that user's media. Please try again.");
    }
    return;
  }
  if (!["jail", "unjail", "timeout", "mute"].includes(action)) return;

  const targetToken = args.shift();
  const targetId = /^<@!?([0-9]{17,20})>$/.exec(targetToken ?? "")?.[1]
    ?? (/^[0-9]{17,20}$/.test(targetToken ?? "") ? targetToken : null);
  const target = targetId ? await message.guild.members.fetch(targetId).catch(() => null) : null;
  if (!target) {
    await message.reply(`Usage: ${prefix}${action} @member${["timeout", "mute"].includes(action) ? " <duration: 10m, 2h, or 1d>" : ""} [reason]`);
    return;
  }

  let minutes;
  if (action === "timeout" || action === "mute") {
    minutes = parseCommandDuration(args.shift());
    if (!minutes) {
      await message.reply(`Choose a duration from 1 minute to 28 days, such as ${prefix}${action} @member 10m [reason].`);
      return;
    }
  }

  try {
    const result = await executeModerationCommand({
      guild: message.guild,
      actor: message.member,
      target,
      action,
      minutes,
      reason: args.join(" ")
    });
    await message.reply(result);
  } catch (error) {
    await message.reply(error.message);
  }
}

function requestedEnabledValue(interaction, currentValue) {
  let action = interaction.customId.split(":").at(-1);
  if (action !== "enable" && action !== "disable") {
    const label = String(interaction.component?.label ?? "").toLowerCase();
    if (label === "enable") action = "enable";
    else if (label === "disable") action = "disable";
    else if (label === "passive logs on") action = "disable";
    else if (label === "passive logs off") action = "enable";
  }
  if (action === "enable") return "yes";
  if (action === "disable") return "no";
  return isEnabled(currentValue) ? "yes" : "no";
}

function createConfigureModal(definition, guildId) {
  const currentSettings = readGuildSettings(guildId)[definition.id];
  const modal = new ModalBuilder()
    .setCustomId(`setup:modal:${definition.id}`)
    .setTitle(`Configure ${definition.title}`);

  const optionField = definition.fields.find((field) => field.options);
  if (optionField) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(optionField.id)
      .setPlaceholder(currentSettings[optionField.id])
      .addOptions(optionField.options.map((option) => ({
        ...option,
        default: option.value === currentSettings[optionField.id]
      })));
    return modal.addLabelComponents(
      new LabelBuilder().setLabel(optionField.label).setStringSelectMenuComponent(select)
    );
  }

  if (definition.id === "commands") {
    const field = definition.fields[0];
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(field.maxLength)
      .setValue(currentSettings[field.id]);
    return modal
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        "### Commands available with the prefix\n`help`, `setup`, `afk`, `report`, `onduty`, `avatar`, `cover`, `jail`, `unjail`, `timeout`, `mute`"
      ))
      .addLabelComponents(new LabelBuilder().setLabel(field.label).setTextInputComponent(input));
  }

  modal.addComponents(...definition.fields.map((field) => {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(field.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(field.maxLength ?? (field.paragraph ? 1000 : 100))
      .setValue(currentSettings[field.id]);
    return new ActionRowBuilder().addComponents(input);
  }));
  return modal;
}

function createRaidModeCustomModal(field) {
  const isMembers = field === "members";
  const modal = new ModalBuilder()
    .setCustomId(`raidmode:custom:${field}`)
    .setTitle(isMembers ? "Custom member threshold" : "Custom RaidMode duration");
  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel(isMembers ? "Number of members (2 to 500)" : "Duration in minutes (1 to 1440)")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(4)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function createMinimumAgeCustomModal() {
  const modal = new ModalBuilder()
    .setCustomId("minimumage:custom:hours")
    .setTitle("Custom minimum account age");
  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel("Minimum age in hours (1 to 8760)")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(4)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function createAntiSpamSimulationModal() {
  const memberSelect = new UserSelectMenuBuilder()
    .setCustomId("member")
    .setMinValues(1)
    .setMaxValues(1);
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId("channel")
    .setMinValues(1)
    .setMaxValues(1)
    .setChannelTypes(ChannelType.GuildText);
  const spamSelect = new StringSelectMenuBuilder()
    .setCustomId("spamType")
    .setPlaceholder("Choose a spam type")
    .addOptions(
      { label: "Flood", value: "flood" },
      { label: "Duplicate messages", value: "duplicates" },
      { label: "Links", value: "links" },
      { label: "Mentions", value: "mentions" },
      { label: "Selfbot-like behavior", value: "selfbots" }
    );
  return new ModalBuilder()
    .setCustomId("antispam:simulation")
    .setTitle("Simulate anti-spam")
    .addLabelComponents(
      new LabelBuilder().setLabel("Member").setUserSelectMenuComponent(memberSelect),
      new LabelBuilder().setLabel("Channel").setChannelSelectMenuComponent(channelSelect),
      new LabelBuilder().setLabel("Spam type").setStringSelectMenuComponent(spamSelect)
    );
}

function createAutomodDurationModal(filter) {
  const input = new TextInputBuilder()
    .setCustomId("duration")
    .setLabel("Sanction duration in minutes (1 to 10080)")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(5)
    .setRequired(true);
  return new ModalBuilder()
    .setCustomId(`automod:duration:${filter}`)
    .setTitle("Custom sanction duration")
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function createImageCatalogModal() {
  const name = new TextInputBuilder()
    .setCustomId("name")
    .setLabel("List name")
    .setPlaceholder("Ex: Crypto scam images")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(80)
    .setRequired(true);
  const channel = new ChannelSelectMenuBuilder()
    .setCustomId("channel")
    .setMinValues(1)
    .setMaxValues(1)
    .setChannelTypes(ChannelType.GuildText);
  return new ModalBuilder()
    .setCustomId("automod:images:create-list")
    .setTitle("Create image list")
    .addLabelComponents(
      new LabelBuilder().setLabel("List name").setTextInputComponent(name),
      new LabelBuilder().setLabel("Verification channel").setChannelSelectMenuComponent(channel)
    );
}

function createServerListModal(listName) {
  const input = new TextInputBuilder()
    .setCustomId("serverId")
    .setLabel("Server ID (add or remove)")
    .setPlaceholder("Right-click a server and choose Copy Server ID")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(24)
    .setRequired(true);
  return new ModalBuilder()
    .setCustomId(`automod:servers:modal:${listName}`)
    .setTitle(`${listName === "blocklist" ? "Blocklist" : "Allowlist"} server`)
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function createFileExtensionRuleModal() {
  const channel = new ChannelSelectMenuBuilder()
    .setCustomId("channel")
    .setMinValues(1)
    .setMaxValues(1)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory);
  const extensions = new TextInputBuilder()
    .setCustomId("extensions")
    .setLabel("Extensions (comma-separated, without dots)")
    .setPlaceholder("exe, zip, scr")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(200)
    .setRequired(true);
  return new ModalBuilder()
    .setCustomId("automod:fileExtensions:rule")
    .setTitle("Add a channel rule")
    .addLabelComponents(
      new LabelBuilder().setLabel("Channel or category").setChannelSelectMenuComponent(channel),
      new LabelBuilder().setLabel("Refused extensions").setTextInputComponent(extensions)
    );
}

function createSlowmodeSlotModal(index, rule = {}) {
  const channel = new ChannelSelectMenuBuilder()
    .setCustomId("channel")
    .setMinValues(0)
    .setMaxValues(1)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory);
  if (rule.channelId) channel.setDefaultChannels(rule.channelId);
  const messages = new TextInputBuilder()
    .setCustomId("messagesPerMinute")
    .setLabel("Messages per minute (1 to 60)")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(2)
    .setRequired(false);
  const seconds = new TextInputBuilder()
    .setCustomId("seconds")
    .setLabel("Slowmode duration in seconds (1 to 21600)")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(5)
    .setRequired(false);
  if (rule.messagesPerMinute) messages.setValue(String(rule.messagesPerMinute));
  if (rule.seconds) seconds.setValue(String(rule.seconds));
  return new ModalBuilder()
    .setCustomId(`slowmode:slot:${index}`)
    .setTitle(rule.channelId ? "Edit slowmode slot" : "Add slowmode slot")
    .addLabelComponents(
      new LabelBuilder().setLabel("Channel or category").setDescription("Clear this selection to remove an existing slot.").setChannelSelectMenuComponent(channel),
      new LabelBuilder().setLabel("Messages per minute").setTextInputComponent(messages),
      new LabelBuilder().setLabel("Slowmode duration").setTextInputComponent(seconds)
    );
}

function createDmLockEditModal(enabled) {
  return new ModalBuilder()
    .setCustomId("dmLock:edit")
    .setTitle("DM Lock")
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "###  Documentation\nCloses members' direct messages to block phishing and scams. Discord's security actions are limited to 24h and renewed as long as protection is active.\n\n Only bots, staff, friends, and members who have already exchanged messages will still be able to send DMs."
    ))
    .addLabelComponents(new LabelBuilder()
      .setLabel("DM Lock state")
      .setCheckboxComponent(new CheckboxBuilder()
        .setCustomId("enabled")
        .setDefault(isEnabled(enabled))));
}

function createSanctionsLogsModal(settings) {
  const channel = new ChannelSelectMenuBuilder()
    .setCustomId("logsChannel")
    .setMinValues(0)
    .setMaxValues(1)
    .setChannelTypes(ChannelType.GuildText);
  if (/^\d{17,20}$/.test(settings.logsChannel)) channel.setDefaultChannels(settings.logsChannel);
  const passiveLogs = new CheckboxBuilder()
    .setCustomId("passiveLogs")
    .setDefault(isEnabled(settings.passiveLogs));
  return new ModalBuilder()
    .setCustomId("sanctions:logs-edit")
    .setTitle("Sanction logs")
    .addLabelComponents(
      new LabelBuilder().setLabel("Logs channel").setChannelSelectMenuComponent(channel),
      new LabelBuilder().setLabel("Passive moderation logs").setCheckboxComponent(passiveLogs)
    );
}

function createSanctionsJsonModal(customId, title, initialValue) {
  const input = new TextInputBuilder()
    .setCustomId("json")
    .setLabel("JSON value")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(4000)
    .setRequired(true);
  if (initialValue) input.setValue(initialValue);
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function parseStoredArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseAuthenticationSessionTime(value) {
  const match = String(value).trim().match(/^(\d+)(m|h)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const minutes = match[2].toLowerCase() === "h" ? amount * 60 : amount;
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 480 ? `${amount}${match[2].toLowerCase()}` : null;
}

const authenticationGrades = [
  { label: "Passkey required", value: "S" },
  { label: "OTP required", value: "A" },
  { label: "Reinforced PIN 8+", value: "B" },
  { label: "Reinforced PIN 6+", value: "C" },
  { label: "Simple PIN 6+", value: "D" }
];

function gradeSelect(customId, grade) {
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(authenticationGrades.find(({ value }) => value === grade)?.label ?? "OTP required")
    .addOptions(authenticationGrades.map((option) => ({ ...option, default: option.value === grade })));
}

function createAuthenticationServerModal(settings) {
  const sessionTime = new TextInputBuilder()
    .setCustomId("sessionTime")
    .setLabel("Default Session Time")
    .setPlaceholder("10m")
    .setMaxLength(4)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(settings.sessionTime);
  const webhook = new TextInputBuilder()
    .setCustomId("webhookUrl")
    .setLabel("Webhook URL (leave empty to clear)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(1000)
    .setRequired(false);
  if (settings.webhookUrl) webhook.setValue(settings.webhookUrl);

  return new ModalBuilder()
    .setCustomId("auth:server-config")
    .setTitle("Server Authentication Configuration")
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("Max: 8h · 1d with Premium"))
    .addLabelComponents(
      new LabelBuilder().setLabel("Default Session Time").setTextInputComponent(sessionTime),
      new LabelBuilder().setLabel("Default Minimum Grade").setStringSelectMenuComponent(gradeSelect("minGrade", settings.minGrade)),
      new LabelBuilder().setLabel("Min Managers Grade").setStringSelectMenuComponent(gradeSelect("minManagersGrade", settings.minManagersGrade)),
      new LabelBuilder().setLabel("Webhook URL").setTextInputComponent(webhook)
    );
}

function createAuthenticationRoleModal(entry = {}) {
  const role = new RoleSelectMenuBuilder()
    .setCustomId("role")
    .setMinValues(1)
    .setMaxValues(1);
  if (entry.roleId) role.setDefaultRoles(entry.roleId);
  const session = new TextInputBuilder()
    .setCustomId("sessionTime")
    .setLabel("Session Time (max. 8h)")
    .setPlaceholder("10m")
    .setMaxLength(4)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(entry.sessionTime ?? "10m");
  const strategy = new StringSelectMenuBuilder()
    .setCustomId("strategy")
    .setPlaceholder(entry.strategy === "split" ? "Create a separate permissions role" : "Use this role as-is")
    .addOptions(
      { label: "Use this role as-is", value: "as_is", description: "The role will be used directly as the authentication role.", default: !entry.strategy || entry.strategy === "as_is" },
      { label: "Create a separate permissions role", value: "split", description: "A new role with the permissions is created; this role keeps its display.", default: entry.strategy === "split" }
    );
  const adminOptions = new CheckboxGroupBuilder()
    .setCustomId("adminOptions")
    .setMinValues(0)
    .setMaxValues(2)
    .addOptions(
      { label: "Split administrator role", value: "splitAdmin", description: "Outside a session, the display role sees nothing without administrator.", default: Boolean(entry.splitAdmin) },
      { label: "Keep view access to every channel outside a session", value: "keepView", default: Boolean(entry.keepView) }
    );

  return new ModalBuilder()
    .setCustomId(`auth:role:${entry.index ?? "new"}`)
    .setTitle(entry.roleId ? "Edit Authentication Role" : "Add Authentication Role")
    .addLabelComponents(
      new LabelBuilder().setLabel("Discord Role").setRoleSelectMenuComponent(role),
      new LabelBuilder().setLabel("Minimum Security Grade").setStringSelectMenuComponent(gradeSelect("grade", entry.grade ?? "A")),
      new LabelBuilder().setLabel("Session Time (max. 8h)").setTextInputComponent(session),
      new LabelBuilder().setLabel("Choose a strategy").setStringSelectMenuComponent(strategy),
      new LabelBuilder().setLabel("Administrator options").setCheckboxGroupComponent(adminOptions)
    );
}

function createWelcomeTextModal(settings) {
  const modal = new ModalBuilder()
    .setCustomId("welcome:modal:text")
    .setTitle("Text");
  const input = new TextInputBuilder()
    .setCustomId("message")
    .setLabel("Text (empty restores the default)")
    .setPlaceholder("Variables: {user.mention}, {user.name}, {user.displayname}, {user.id}, {server.name}, {server.id}")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setRequired(false);
  if (settings.message) input.setValue(settings.message);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function createWelcomeImageModal(settings) {
  const modal = new ModalBuilder()
    .setCustomId("welcome:modal:image")
    .setTitle("Image edit");
  const thumbnail = new TextInputBuilder()
    .setCustomId("thumbnailUrl")
    .setLabel("Thumbnail URL (optional)")
    .setPlaceholder("https://cdn.discordapp.com/attachments/.../thumbnail.png")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(1000)
    .setRequired(false);
  const image = new TextInputBuilder()
    .setCustomId("imageUrl")
    .setLabel("Image URL (optional)")
    .setPlaceholder("https://cdn.discordapp.com/attachments/.../image.png")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(1000)
    .setRequired(false);
  if (settings.thumbnailUrl) thumbnail.setValue(settings.thumbnailUrl);
  if (settings.imageUrl) image.setValue(settings.imageUrl);
  modal.addComponents(
    new ActionRowBuilder().addComponents(thumbnail),
    new ActionRowBuilder().addComponents(image)
  );
  return modal;
}

function createWelcomeColorModal(color) {
  const modal = new ModalBuilder()
    .setCustomId("welcome:modal:color")
    .setTitle("Welcome embed color");
  const input = new TextInputBuilder()
    .setCustomId("color")
    .setLabel("Hex color (for example, e05b60)")
    .setStyle(TextInputStyle.Short)
    .setMinLength(6)
    .setMaxLength(7)
    .setRequired(true)
    .setValue(color.replace(/^#/, ""));
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function createWelcomeButtonModal(button = {}, scope = "welcome") {
  const isEditing = Boolean(button.id);
  const modal = new ModalBuilder()
    .setCustomId(`${scope}:button:modal:${button.id ?? "new"}`)
    .setTitle(isEditing ? "Edit button" : "Add a button");
  const name = new TextInputBuilder()
    .setCustomId("name")
    .setLabel("Button name")
    .setPlaceholder("My button label")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(80)
    .setRequired(true);
  const emoji = new TextInputBuilder()
    .setCustomId("emoji")
    .setLabel("Emoji (optional)")
    .setPlaceholder(" or <:emoji_name:id>")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(false);
  const channel = new ChannelSelectMenuBuilder()
    .setCustomId("channel")
    .setMinValues(1)
    .setMaxValues(1)
    .setChannelTypes(ChannelType.GuildText);
  if (button.name) name.setValue(button.name);
  if (button.emoji) emoji.setValue(button.emoji);
  if (button.channelId) channel.setDefaultChannels(button.channelId);
  modal.addLabelComponents(
    new LabelBuilder().setLabel("Button name").setTextInputComponent(name),
    new LabelBuilder().setLabel("Emoji (optional)").setDescription("A standard emoji or one of this server's emojis.").setTextInputComponent(emoji),
    new LabelBuilder().setLabel("Select a channel to link").setChannelSelectMenuComponent(channel)
  );
  return modal;
}

function isHttpsImageUrl(value) {
  if (!value) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand() && interaction.commandName === "report") {
    if (!interaction.guild || !interaction.guildId) {
      await interaction.reply({ content: "Reports can only be sent from a server.", flags: MessageFlags.Ephemeral });
      return;
    }
    const user = interaction.options.getUser("member");
    const target = user ? await interaction.guild.members.fetch(user.id).catch(() => null) : null;
    try {
      const channel = await submitReport({
        guild: interaction.guild,
        reporter: interaction.user,
        target: target?.user,
        details: interaction.options.getString("details") ?? ""
      });
      await interaction.reply({ content: `Your report was sent to #${channel.name}.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
      await interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:reports") {
    await interaction.update({ components: [createReportsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("reports:edit:")) {
    const form = interaction.customId.slice("reports:edit:".length);
    const reports = readGuildSettings(interaction.guildId).reports;
    const modal = form === "receiving" ? createReportsReceivingModal(reports)
      : form === "notificationRole" ? createReportNotificationRoleModal(reports)
        : form === "reporterNotification" ? createReporterNotificationModal(reports)
          : form === "trustedRole" ? createTrustedRoleModal(reports)
            : form === "falseReport" ? createFalseReportModal(reports)
              : null;
    if (!modal) return;
    await interaction.showModal(modal);
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("reports:toggle:")) {
    const field = interaction.customId.slice("reports:toggle:".length).split(":")[0];
    if (!["enabled", "grouping"].includes(field)) return;
    const settings = readGuildSettings(interaction.guildId);
    settings.reports[field] = requestedEnabledValue(interaction, settings.reports[field]);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createReportsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("reports:modal:")) {
    if (!interaction.guild || !interaction.guildId) {
      await interaction.reply({ content: "Reports settings can only be changed in a server.", flags: MessageFlags.Ephemeral });
      return;
    }
    const form = interaction.customId.slice("reports:modal:".length);
    const settings = readGuildSettings(interaction.guildId);
    const reports = settings.reports;

    if (form === "receiving") {
      const selectedChannel = [...interaction.fields.getSelectedChannels("channel").keys()][0];
      if (selectedChannel) reports.channel = selectedChannel;
      reports.automaticCreation = interaction.fields.getCheckbox("automaticCreation") ? "yes" : "no";
      if (reports.automaticCreation === "yes") {
        const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
          await interaction.reply({ content: "I need the Manage Channels permission to create a reports channel.", flags: MessageFlags.Ephemeral });
          return;
        }
        const channel = await interaction.guild.channels.create({
          name: "cozyy-reports",
          type: ChannelType.GuildText,
          reason: "Reports configuration"
        });
        reports.channel = channel.id;
      }
    } else if (form === "notificationRole") {
      reports.notificationRoleId = [...interaction.fields.getSelectedRoles("role").keys()][0] ?? "";
      if (interaction.fields.getCheckbox("createRole")) {
        const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
          await interaction.reply({ content: "I need the Manage Roles permission to create a notification role.", flags: MessageFlags.Ephemeral });
          return;
        }
        const role = await interaction.guild.roles.create({ name: "Report notifications", color: 0xe05b60, reason: "Reports configuration" });
        reports.notificationRoleId = role.id;
      }
      reports.notifyEveryone = interaction.fields.getCheckbox("everyone") ? "yes" : "no";
      reports.notifyHere = interaction.fields.getCheckbox("here") ? "yes" : "no";
      reports.mention = reports.notifyEveryone === "yes" ? "@everyone"
        : reports.notifyHere === "yes" ? "@here"
          : reports.notificationRoleId ? `<@&${reports.notificationRoleId}>` : "None";
    } else if (form === "reporterNotification") {
      reports.reporterNotification = interaction.fields.getStringSelectValues("reporterNotification")[0] ?? "handled";
    } else if (form === "trustedRole") {
      reports.trustedRoleId = [...interaction.fields.getSelectedRoles("role").keys()][0] ?? "";
      if (interaction.fields.getCheckbox("createRole")) {
        const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
          await interaction.reply({ content: "I need the Manage Roles permission to create a trusted role.", flags: MessageFlags.Ephemeral });
          return;
        }
        const role = await interaction.guild.roles.create({ name: "Trusted reporter", color: 0xf1c40f, reason: "Reports configuration" });
        reports.trustedRoleId = role.id;
      }
    } else if (form === "falseReport") {
      reports.falseReportThreshold = interaction.fields.getStringSelectValues("threshold")[0] ?? "disabled";
      reports.falseReportWindow = interaction.fields.getStringSelectValues("window")[0] ?? "30";
      reports.falseReportAction = interaction.fields.getStringSelectValues("action")[0] ?? "notify";
      reports.falseReportSanction = interaction.fields.getStringSelectValues("sanction")[0] ?? "warn";
    } else {
      return;
    }

    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createReportsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "onduty") {
    if (!interaction.guild) {
      await interaction.reply({ content: "On-duty status can only be toggled in a server.", flags: MessageFlags.Ephemeral });
      return;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    await interaction.reply(await toggleOnDutyRole(interaction.guild, member));
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "afk") {
    if (!interaction.guildId) {
      await interaction.reply({ content: "AFK status can only be set in a server.", flags: MessageFlags.Ephemeral });
      return;
    }
    const status = await setAfkStatus(interaction.guild, interaction.user.id, interaction.options.getString("reason") ?? "");
    await interaction.reply({
      components: [createAfkConfirmation(interaction.user, status)],
      flags: MessageFlags.IsComponentsV2
    });
    return;
  }

  if (interaction.isChatInputCommand() && ["avatar", "cover"].includes(interaction.commandName)) {
    const user = interaction.options.getUser("user") ?? interaction.user;
    await interaction.reply(await createMediaResponse(client, user.id, interaction.commandName));
    return;
  }

  if (interaction.isChatInputCommand() && ["jail", "unjail", "timeout", "mute"].includes(interaction.commandName)) {
    const targetUser = interaction.options.getUser("member");
    const target = targetUser ? await interaction.guild?.members.fetch(targetUser.id).catch(() => null) : null;
    const actor = interaction.guild ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null) : null;
    try {
      const result = await executeModerationCommand({
        guild: interaction.guild,
        actor,
        target,
        action: interaction.commandName,
        minutes: interaction.options.getInteger("minutes"),
        reason: interaction.options.getString("reason")
      });
      await interaction.reply({ content: result, flags: MessageFlags.Ephemeral });
    } catch (error) {
      await interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "setup") {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Run /setup in a server.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      components: [createSetupContainer(interaction.guildId)],
      flags: setupMessageFlags
    });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "setup:category") {
    await interaction.update({
      components: [createSetupContainer(interaction.guildId, interaction.values[0])]
    });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("setup:category:")) {
    const category = interaction.customId.slice("setup:category:".length);
    if (!categories.some(({ value }) => value === category)) {
      await interaction.reply({
        content: "That settings page is unavailable. Run /setup again to open the current settings.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    await interaction.update({
      components: [createSetupContainer(interaction.guildId, category)]
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:raidMode") {
    await interaction.update({
      components: [createRaidModeContainer(interaction.guildId)]
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:captcha") {
    await interaction.update({
      components: [createCaptchaContainer(interaction.guildId)]
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:minimumAge") {
    await interaction.update({
      components: [createMinimumAgeContainer(interaction.guildId)]
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:autoRoles") {
    await interaction.update({
      components: [createAutoRolesContainer(interaction.guildId)]
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:bots") {
    await interaction.update({ components: [createBotsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:discord") {
    await interaction.update({ components: [createDisconContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:antiSpam") {
    await interaction.update({ components: [createAntiSpamContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:sanctions") {
    await interaction.update({ components: [createSanctionsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:tagRole") {
    await interaction.update({ components: [createTagRoleContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:onDutyRole") {
    await interaction.update({ components: [createOnDutyRoleContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("utilities:role:create:")) {
    if (!interaction.guild || !interaction.guildId) return;
    const settingId = interaction.customId.slice("utilities:role:create:".length);
    if (!["tagRole", "onDutyRole"].includes(settingId)) return;
    const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: "I need the Manage Roles permission to create this role.", flags: MessageFlags.Ephemeral });
      return;
    }
    const role = await interaction.guild.roles.create({
      name: settingId === "tagRole" ? "Tag" : "On-duty",
      color: 0xe05b60,
      reason: `${settingId === "tagRole" ? "Tag Role" : "On-duty role"} configuration`
    });
    const settings = readGuildSettings(interaction.guildId);
    settings[settingId].roleId = role.id;
    writeGuildSettings(interaction.guildId, settings);
    const container = settingId === "tagRole"
      ? createTagRoleContainer(interaction.guildId)
      : createOnDutyRoleContainer(interaction.guildId);
    await interaction.update({ components: [container] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("utilities:role:reset:")) {
    const settingId = interaction.customId.slice("utilities:role:reset:".length);
    if (!["tagRole", "onDutyRole"].includes(settingId)) return;
    const settings = readGuildSettings(interaction.guildId);
    settings[settingId].roleId = "";
    writeGuildSettings(interaction.guildId, settings);
    const container = settingId === "tagRole"
      ? createTagRoleContainer(interaction.guildId)
      : createOnDutyRoleContainer(interaction.guildId);
    await interaction.update({ components: [container] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("utilities:toggle:")) {
    const settingId = interaction.customId.slice("utilities:toggle:".length).split(":")[0];
    if (!["channelLock", "messageCaching"].includes(settingId)) return;
    const settings = readGuildSettings(interaction.guildId);
    settings[settingId].enabled = requestedEnabledValue(interaction, settings[settingId].enabled);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createSetupContainer(interaction.guildId, "utilities")] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "sanctions:open:jail") {
    await interaction.update({ components: [createJailContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "sanctions:open:mute") {
    await interaction.update({ components: [createMuteContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "sanctions:jail:create") {
    if (!interaction.guild || !interaction.guildId) return;
    const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: "I need the Manage Roles permission to create the Jail role.", flags: MessageFlags.Ephemeral });
      return;
    }
    const role = await interaction.guild.roles.create({ name: "Jailed", color: 0x555555, reason: "Sanctions configuration" });
    const settings = readGuildSettings(interaction.guildId);
    settings.sanctions.jailRoleId = role.id;
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createJailContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "sanctions:jail:reset") {
    const settings = readGuildSettings(interaction.guildId);
    settings.sanctions.jailRoleId = "";
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createJailContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "sanctions:mute:create") {
    if (!interaction.guild || !interaction.guildId) return;
    const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: "I need the Manage Roles permission to create the Mute role.", flags: MessageFlags.Ephemeral });
      return;
    }
    const role = await interaction.guild.roles.create({ name: "Muted", color: 0x555555, reason: "Sanctions configuration" });
    const settings = readGuildSettings(interaction.guildId);
    settings.sanctions.muteRoleId = role.id;
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createMuteContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "sanctions:mute:reset") {
    const settings = readGuildSettings(interaction.guildId);
    settings.sanctions.muteRoleId = "";
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createMuteContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("sanctions:toggle:")) {
    const field = interaction.customId.slice("sanctions:toggle:".length).split(":")[0];
    if (!["enabled", "timeoutEnabled", "syncedQuarantine", "showMedia", "passiveLogs", "privacy"].includes(field)) return;
    const settings = readGuildSettings(interaction.guildId);
    settings.sanctions[field] = requestedEnabledValue(interaction, settings.sanctions[field]);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createSanctionsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("sanctions:privacy")) {
    const settings = readGuildSettings(interaction.guildId);
    settings.sanctions.privacy = requestedEnabledValue(interaction, settings.sanctions.privacy);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createSanctionsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isRoleSelectMenu() && interaction.customId.startsWith("utilities:") && interaction.customId.endsWith(":role")) {
    const settingId = interaction.customId.split(":")[1];
    if (!["tagRole", "onDutyRole"].includes(settingId)) return;
    const settings = readGuildSettings(interaction.guildId);
    settings[settingId].roleId = interaction.values[0] ?? "";
    writeGuildSettings(interaction.guildId, settings);
    const container = settingId === "tagRole"
      ? createTagRoleContainer(interaction.guildId)
      : createOnDutyRoleContainer(interaction.guildId);
    await interaction.update({ components: [container] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "sanctions:logs-edit") {
    await interaction.update({ components: [createBotLogsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "sanctions:back") {
    await interaction.update({ components: [createSanctionsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "sanctions:export") {
    await interaction.reply({
      content: `\`\`\`json\n${JSON.stringify(readGuildSettings(interaction.guildId).sanctions, null, 2)}\n\`\`\``,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === "sanctions:import") {
    await interaction.showModal(createSanctionsJsonModal("sanctions:import-submit", "Import sanctions", JSON.stringify(readGuildSettings(interaction.guildId).sanctions)));
    return;
  }

  if (interaction.isButton() && interaction.customId === "sanctions:names") {
    await interaction.showModal(createSanctionsJsonModal("sanctions:names-submit", "Sanction names", readGuildSettings(interaction.guildId).sanctions.sanctionNames));
    return;
  }

  if (interaction.isRoleSelectMenu() && interaction.customId === "sanctions:jail:role") {
    const settings = readGuildSettings(interaction.guildId);
    settings.sanctions.jailRoleId = interaction.values[0] ?? "";
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createJailContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isRoleSelectMenu() && interaction.customId === "sanctions:mute:role") {
    const settings = readGuildSettings(interaction.guildId);
    settings.sanctions.muteRoleId = interaction.values[0] ?? "";
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createMuteContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "sanctions:jail:handling") {
    const settings = readGuildSettings(interaction.guildId);
    settings.sanctions.jailHandling = interaction.values[0];
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createJailContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "sanctions:mute:handling") {
    const settings = readGuildSettings(interaction.guildId);
    settings.sanctions.muteHandling = interaction.values[0];
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createMuteContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "sanctions:banDeletion") {
    const settings = readGuildSettings(interaction.guildId);
    settings.sanctions.banDeletion = interaction.values[0];
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createSanctionsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isChannelSelectMenu() && interaction.customId.startsWith("sanctions:logsChannel")) {
    const settings = readGuildSettings(interaction.guildId);
    settings.sanctions.logsChannel = interaction.values[0] ?? "";
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createBotLogsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isChannelSelectMenu() && interaction.customId.startsWith("logs:channel:")) {
    const field = interaction.customId.slice("logs:channel:".length);
    if (!["miscellaneousChannel", "moderationChannel", "captchaChannel"].includes(field)) return;
    const settings = readGuildSettings(interaction.guildId);
    settings.logs[field] = interaction.values[0] ?? "";
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createLogsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:dmLock") {
    const { enabled } = readGuildSettings(interaction.guildId).dmLock;
    await interaction.showModal(createDmLockEditModal(enabled));
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:authenticationManager") {
    await interaction.update({ components: [createAuthenticationManagerContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "auth:server-config") {
    const settings = readGuildSettings(interaction.guildId).authenticationManager;
    await interaction.showModal(createAuthenticationServerModal(settings));
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("auth:tab:")) {
    const tab = interaction.customId.slice("auth:tab:".length);
    await interaction.update({ components: [createAuthenticationManagerContainer(interaction.guildId, tab)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("auth:page:")) {
    const [, , tab, pageValue, action] = interaction.customId.split(":");
    if (!["roles", "users", "logs"].includes(tab) || !interaction.guildId) return;
    const records = parseStoredArray(readGuildSettings(interaction.guildId).authenticationManager[tab]);
    const maxPage = Math.max(0, Math.ceil(records.length / 5) - 1);
    const currentPage = Number(pageValue) || 0;
    const page = action === "first" ? 0
      : action === "last" ? maxPage
        : action === "prev" ? Math.max(0, currentPage - 1)
          : Math.min(maxPage, currentPage + 1);
    await interaction.update({ components: [createAuthenticationManagerContainer(interaction.guildId, tab, page)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "auth:add:roles") {
    await interaction.showModal(createAuthenticationRoleModal());
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("auth:edit:roles:")) {
    const index = Number(interaction.customId.slice("auth:edit:roles:".length));
    if (!Number.isInteger(index) || index < 0 || index >= 100) return;
    const entries = parseStoredArray(readGuildSettings(interaction.guildId).authenticationManager.roles);
    await interaction.showModal(entries[index]
      ? createAuthenticationRoleModal({ ...entries[index], index })
      : createAuthenticationRoleModal());
    return;
  }

  if (interaction.isButton() && interaction.customId === "auth:add:roles") {
    await interaction.showModal(createAuthenticationRoleModal());
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:honeyPot") {
    await interaction.update({ components: [createHoneyPotContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:preventiveSlowmode") {
    await interaction.update({ components: [createPreventiveSlowmodeContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("slowmode:edit:")) {
    const index = Number(interaction.customId.slice("slowmode:edit:".length));
    if (!Number.isInteger(index) || index < 0 || index >= 6) return;
    const slots = JSON.parse(readGuildSettings(interaction.guildId).preventiveSlowmode.slots || "[]");
    await interaction.showModal(createSlowmodeSlotModal(index, slots[index] ?? {}));
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("slowmode:slot:")) {
    const index = Number(interaction.customId.slice("slowmode:slot:".length));
    if (!Number.isInteger(index) || index < 0 || index >= 6 || !interaction.guildId) return;
    const channelId = [...interaction.fields.getSelectedChannels("channel").keys()][0];
    const settings = readGuildSettings(interaction.guildId);
    let slots;
    try { slots = JSON.parse(settings.preventiveSlowmode.slots || "[]"); }
    catch { slots = []; }
    if (!Array.isArray(slots)) slots = [];
    slots = Array.from({ length: 6 }, (_, slotIndex) => slots[slotIndex] ?? null);
    if (!channelId) {
      if (!slots[index]) {
        await interaction.reply({ content: "Choose a channel or category for this slot.", flags: MessageFlags.Ephemeral });
        return;
      }
      slots[index] = null;
    } else {
      const messagesPerMinute = Number(interaction.fields.getTextInputValue("messagesPerMinute"));
      const seconds = Number(interaction.fields.getTextInputValue("seconds"));
      if (!Number.isInteger(messagesPerMinute) || messagesPerMinute < 1 || messagesPerMinute > 60 || !Number.isInteger(seconds) || seconds < 1 || seconds > 21600) {
        await interaction.reply({ content: "Messages per minute must be 1–60 and duration must be 1–21600 seconds.", flags: MessageFlags.Ephemeral });
        return;
      }
      slots[index] = { channelId, messagesPerMinute, seconds };
    }
    settings.preventiveSlowmode.slots = JSON.stringify(slots);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createPreventiveSlowmodeContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("honeypot:toggle")) {
    const settings = readGuildSettings(interaction.guildId);
    settings.honeyPot.enabled = requestedEnabledValue(interaction, settings.honeyPot.enabled);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createHoneyPotContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "honeypot:create-channel") {
    if (!interaction.guild || !interaction.guildId) return;
    const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({ content: "I need the Manage Channels permission to create the HoneyPot channel.", flags: MessageFlags.Ephemeral });
      return;
    }
    const settings = readGuildSettings(interaction.guildId);
    let channel = settings.honeyPot.channel
      ? interaction.guild.channels.cache.get(settings.honeyPot.channel)
      : null;
    if (channel) {
      await channel.setPosition(0);
    } else {
      channel = await interaction.guild.channels.create({
        name: "silence-channel",
        type: ChannelType.GuildText,
        position: 0,
        topic: "HoneyPot trap channel. Members who post here may be sanctioned.",
        permissionOverwrites: [{
          id: interaction.guild.roles.everyone.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        }]
      });
    }
    const warning = " This channel is monitored. Messages posted here may result in an automatic sanction. Leave this channel if you do not intend to test it.";
    const translateUrl = `https://translate.google.com/?sl=auto&text=${encodeURIComponent(warning)}`;
    await channel.send({
      content: warning,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Translate").setStyle(ButtonStyle.Link).setURL(translateUrl)
      )]
    });
    settings.honeyPot.channel = channel.id;
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createHoneyPotContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("honeypot:")) {
    const field = interaction.customId.slice("honeypot:".length);
    if (!["sanction", "duration", "delay", "ignoredMembers"].includes(field)) return;
    const value = interaction.values[0];
    const settings = readGuildSettings(interaction.guildId);
    settings.honeyPot[field] = value;
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createHoneyPotContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:automod") {
    await interaction.update({ components: [createAutomodContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("automod:open:")) {
    const filter = interaction.customId.slice("automod:open:".length);
    const containers = {
      images: createImageFilterContainer,
      otherServers: createOtherServersContainer,
      fileExtensions: createFileExtensionsContainer
    };
    if (containers[filter]) {
      await interaction.update({ components: [containers[filter](interaction.guildId)] });
    }
    return;
  }

  if (interaction.isButton() && interaction.customId === "automod:back") {
    await interaction.update({ components: [createAutomodContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("automod:toggle:")) {
    const [filter, ...fieldParts] = interaction.customId.slice("automod:toggle:".length).split(":");
    const lastPart = fieldParts.at(-1);
    const action = ["enable", "disable"].includes(lastPart) ? fieldParts.pop() : null;
    const field = fieldParts.join(":") || "enabled";
    const settingId = { images: "automodImages", otherServers: "automodOtherServers", fileExtensions: "automodFileExtensions" }[filter];
    if (!settingId || !["enabled", "refuseCorrupted"].includes(field)) return;
    const settings = readGuildSettings(interaction.guildId);
    settings[settingId][field] = action
      ? action === "enable" ? "yes" : "no"
      : requestedEnabledValue(interaction, settings[settingId][field]);
    writeGuildSettings(interaction.guildId, settings);
    const container = { images: createImageFilterContainer, otherServers: createOtherServersContainer, fileExtensions: createFileExtensionsContainer }[filter];
    await interaction.update({ components: [container(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("automod:details:")) {
    const filter = interaction.customId.slice("automod:details:".length);
    const sanction = readGuildSettings(interaction.guildId).automodImages.sanction;
    await interaction.reply({
      content: `Image filter sanction: **${sanction}**. This filter has its own duration, independent from Anti-spam and HoneyPot.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === "automod:images:create-list") {
    await interaction.showModal(createImageCatalogModal());
    return;
  }

  if (interaction.isButton() && interaction.customId === "automod:fileExtensions:add-channel") {
    await interaction.showModal(createFileExtensionRuleModal());
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("automod:servers:")) {
    const listName = interaction.customId.slice("automod:servers:".length);
    if (["blocklist", "allowlist"].includes(listName)) {
      await interaction.showModal(createServerListModal(listName));
      return;
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("automod:")) {
    const settings = readGuildSettings(interaction.guildId);
    if (interaction.customId.startsWith("automod:images:")) {
      const field = interaction.customId.slice("automod:images:".length);
      if (field === "duration" && interaction.values[0] === "custom") {
        await interaction.showModal(createAutomodDurationModal("images"));
        return;
      }
      if (!["sanction", "duration"].includes(field)) return;
      settings.automodImages[field] = interaction.values[0];
      writeGuildSettings(interaction.guildId, settings);
      await interaction.update({ components: [createImageFilterContainer(interaction.guildId)] });
      return;
    }
    if (interaction.customId.startsWith("automod:otherServers:")) {
      const field = interaction.customId.slice("automod:otherServers:".length);
      if (!["invites", "forwarded", "serverTags", "deletedSanction"].includes(field)) return;
      settings.automodOtherServers[field] = interaction.values[0];
      writeGuildSettings(interaction.guildId, settings);
      await interaction.update({ components: [createOtherServersContainer(interaction.guildId)] });
      return;
    }
    if (interaction.customId.startsWith("automod:fileExtensions:")) {
      const field = interaction.customId.slice("automod:fileExtensions:".length);
      if (field === "server") settings.automodFileExtensions.entireServer = interaction.values[0];
      else if (field === "sanction") settings.automodFileExtensions.deletedSanction = interaction.values[0];
      else return;
      writeGuildSettings(interaction.guildId, settings);
      await interaction.update({ components: [createFileExtensionsContainer(interaction.guildId)] });
      return;
    }
  }

  if (interaction.isChannelSelectMenu() && interaction.customId === "automod:fileExtensions:channels") {
    const settings = readGuildSettings(interaction.guildId);
    let previous;
    try { previous = JSON.parse(settings.automodFileExtensions.channelRules || "[]"); }
    catch { previous = []; }
    if (!Array.isArray(previous)) previous = [];
    const previousById = new Map(previous.map((rule) => [rule.channelId, rule]));
    settings.automodFileExtensions.channelRules = JSON.stringify(interaction.values.map((channelId) =>
      previousById.get(channelId) ?? { channelId, extensions: "" }
    ));
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createFileExtensionsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "automod:fileExtensions:rule") {
    const channelId = [...interaction.fields.getSelectedChannels("channel").keys()][0];
    const extensions = interaction.fields.getTextInputValue("extensions")
      .split(",")
      .map((extension) => extension.trim().replace(/^\./, "").toLowerCase())
      .filter(Boolean);
    if (!channelId || !extensions.length || extensions.some((extension) => !/^[a-z0-9][a-z0-9_-]{0,15}$/.test(extension))) {
      await interaction.reply({
        content: "Choose a channel/category and enter valid extensions such as exe, zip, scr.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const settings = readGuildSettings(interaction.guildId);
    let rules;
    try { rules = JSON.parse(settings.automodFileExtensions.channelRules || "[]"); }
    catch { rules = []; }
    if (!Array.isArray(rules)) rules = [];
    const existing = rules.findIndex((rule) => rule.channelId === channelId);
    const rule = { channelId, extensions: extensions.join(", ") };
    if (existing < 0) rules.push(rule);
    else rules[existing] = rule;
    settings.automodFileExtensions.channelRules = JSON.stringify(rules);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createFileExtensionsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "dmLock:edit") {
    const settings = readGuildSettings(interaction.guildId);
    settings.dmLock.enabled = interaction.fields.getCheckbox("enabled") ? "yes" : "no";
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createSetupContainer(interaction.guildId, "protection")] });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "sanctions:logs-edit") {
    const channelId = [...interaction.fields.getSelectedChannels("logsChannel").keys()][0] ?? "";
    const passiveLogs = interaction.fields.getCheckbox("passiveLogs");
    const settings = readGuildSettings(interaction.guildId);
    settings.sanctions.logsChannel = channelId;
    settings.sanctions.passiveLogs = passiveLogs ? "yes" : "no";
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createSanctionsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "sanctions:import-submit") {
    let imported;
    try { imported = JSON.parse(interaction.fields.getTextInputValue("json")); }
    catch {
      await interaction.reply({ content: "Import must be valid JSON.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!imported || typeof imported !== "object" || Array.isArray(imported)) {
      await interaction.reply({ content: "Import must be a JSON object of sanction settings.", flags: MessageFlags.Ephemeral });
      return;
    }
    const allowedFields = settingDefinitions.find(({ id }) => id === "sanctions").fields.map(({ id }) => id);
    const settings = readGuildSettings(interaction.guildId);
    for (const field of allowedFields) {
      if (field in imported) settings.sanctions[field] = String(imported[field]);
    }
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createSanctionsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "sanctions:names-submit") {
    let names;
    try { names = JSON.parse(interaction.fields.getTextInputValue("json")); }
    catch {
      await interaction.reply({ content: "Sanction names must be a JSON array of strings.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (!Array.isArray(names) || names.some((name) => typeof name !== "string")) {
      await interaction.reply({ content: "Sanction names must be a JSON array of strings.", flags: MessageFlags.Ephemeral });
      return;
    }
    const settings = readGuildSettings(interaction.guildId);
    settings.sanctions.sanctionNames = JSON.stringify(names.slice(0, 100));
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createSanctionsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "auth:server-config") {
    const sessionTime = parseAuthenticationSessionTime(interaction.fields.getTextInputValue("sessionTime"));
    const webhookUrl = interaction.fields.getTextInputValue("webhookUrl").trim();
    if (!sessionTime) {
      await interaction.reply({ content: "Session time must be between 1m and 8h.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (webhookUrl && !isHttpsImageUrl(webhookUrl)) {
      await interaction.reply({ content: "Webhook URL must be a valid HTTPS URL.", flags: MessageFlags.Ephemeral });
      return;
    }
    const settings = readGuildSettings(interaction.guildId);
    settings.authenticationManager.sessionTime = sessionTime;
    settings.authenticationManager.minGrade = interaction.fields.getStringSelectValues("minGrade")[0];
    settings.authenticationManager.minManagersGrade = interaction.fields.getStringSelectValues("minManagersGrade")[0];
    settings.authenticationManager.webhookUrl = webhookUrl;
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createAuthenticationManagerContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("auth:role:")) {
    const indexValue = interaction.customId.slice("auth:role:".length);
    const roleId = [...interaction.fields.getSelectedRoles("role").keys()][0];
    const sessionTime = parseAuthenticationSessionTime(interaction.fields.getTextInputValue("sessionTime"));
    if (!roleId || !sessionTime) {
      await interaction.reply({ content: "Choose a role and enter a session time between 1m and 8h.", flags: MessageFlags.Ephemeral });
      return;
    }
    const grade = interaction.fields.getStringSelectValues("grade")[0];
    const strategy = interaction.fields.getStringSelectValues("strategy")[0];
    const adminOptions = interaction.fields.getCheckboxGroup("adminOptions");
    const settings = readGuildSettings(interaction.guildId);
    const roles = parseStoredArray(settings.authenticationManager.roles);
    const entry = {
      roleId,
      grade,
      sessionTime,
      strategy,
      splitAdmin: adminOptions.includes("splitAdmin"),
      keepView: adminOptions.includes("keepView")
    };
    if (indexValue === "new") roles.push(entry);
    else {
      const index = Number(indexValue);
      if (!Number.isInteger(index) || index < 0 || index >= roles.length) {
        await interaction.reply({ content: "That authentication role slot no longer exists.", flags: MessageFlags.Ephemeral });
        return;
      }
      roles[index] = entry;
    }
    settings.authenticationManager.roles = JSON.stringify(roles);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createAuthenticationManagerContainer(interaction.guildId, "roles")] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("automod:fileExtensions:")) {
    const [action, target] = interaction.customId.slice("automod:fileExtensions:".length).split(":");
    if (action === "toggle" && target === "corrupted") {
      const settings = readGuildSettings(interaction.guildId);
      settings.automodFileExtensions.refuseCorrupted = requestedEnabledValue(interaction, settings.automodFileExtensions.refuseCorrupted);
      writeGuildSettings(interaction.guildId, settings);
      await interaction.update({ components: [createFileExtensionsContainer(interaction.guildId)] });
      return;
    }
  }

  if (interaction.isButton() && interaction.customId.startsWith("antispam:toggle:enabled")) {
    const settings = readGuildSettings(interaction.guildId);
    settings.antiSpam.enabled = requestedEnabledValue(interaction, settings.antiSpam.enabled);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createAntiSpamContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("antispam:toggle:ignoreSpamChannels")) {
    const settings = readGuildSettings(interaction.guildId);
    settings.antiSpam.ignoreSpamChannels = requestedEnabledValue(interaction, settings.antiSpam.ignoreSpamChannels);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createAntiSpamContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "antispam:details") {
    const sanction = readGuildSettings(interaction.guildId).antiSpam.sanction;
    const details = {
      soft: "Warns first, then times out or jails. Soft never kicks or bans.",
      standard: "Cozyy's default sanctions.",
      strict: "Not recommended. Bans advertising and automated accounts on their first spam."
    };
    await interaction.reply({
      content: `**${sanction[0].toUpperCase()}${sanction.slice(1)} sanctions**\n${details[sanction] ?? details.standard}\n\nFloods, duplicates, links, mentions, and selfbot-like behavior are checked separately. Enforcement actions still need to be connected to this preset.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === "antispam:simulate") {
    await interaction.showModal(createAntiSpamSimulationModal());
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "antispam:sanction") {
    const settings = readGuildSettings(interaction.guildId);
    settings.antiSpam.sanction = interaction.values[0];
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createAntiSpamContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isChannelSelectMenu() && interaction.customId === "antispam:channels") {
    const settings = readGuildSettings(interaction.guildId);
    settings.antiSpam.ignoredChannels = interaction.values.join(",");
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createAntiSpamContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isRoleSelectMenu() && interaction.customId === "antispam:roles") {
    const settings = readGuildSettings(interaction.guildId);
    settings.antiSpam.ignoredRoles = interaction.values.join(",");
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createAntiSpamContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isUserSelectMenu() && interaction.customId === "antispam:members") {
    const settings = readGuildSettings(interaction.guildId);
    settings.antiSpam.ignoredMembers = interaction.values.join(",");
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createAntiSpamContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "discon:create-panel") {
    if (!interaction.guild || !interaction.guildId) return;
    const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        content: "I need the Manage Channels permission to create the DISCON panel channel.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const channel = await interaction.guild.channels.create({
      name: "discon-panel",
      type: ChannelType.GuildText,
      topic: "DISCON security panel."
    });
    const settings = readGuildSettings(interaction.guildId);
    settings.discord.panelChannel = channel.id;
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createDisconContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "discon:create-status") {
    await interaction.reply({
      content: "The DISCON status voice channel is a premium feature.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (interaction.isChannelSelectMenu() && interaction.customId.startsWith("discon:")) {
    const field = interaction.customId === "discon:panel-channel" ? "panelChannel" : "statusChannel";
    const settings = readGuildSettings(interaction.guildId);
    settings.discord[field] = interaction.values[0] ?? "";
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createDisconContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "discon:level") {
    const level = interaction.values[0];
    if (!interaction.guildId || !["1", "2", "3", "4", "5"].includes(level)) return;
    const settings = readGuildSettings(interaction.guildId);
    settings.discord.currentLevel = level;
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createDisconContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:configure:welcome") {
    await interaction.update({ components: [createWelcomeContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("welcome:toggle:enabled")) {
    const settings = readGuildSettings(interaction.guildId);
    settings.welcome.enabled = requestedEnabledValue(interaction, settings.welcome.enabled);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createWelcomeContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("welcome:toggle:mention")) {
    const settings = readGuildSettings(interaction.guildId);
    settings.welcome.mention = requestedEnabledValue(interaction, settings.welcome.mention);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createWelcomeContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("welcome:edit:")) {
    const settings = readGuildSettings(interaction.guildId).welcome;
    const editor = interaction.customId.slice("welcome:edit:".length);
    if (editor === "text") await interaction.showModal(createWelcomeTextModal(settings));
    else if (editor === "image") await interaction.showModal(createWelcomeImageModal(settings));
    else if (editor === "color") await interaction.showModal(createWelcomeColorModal(settings.color));
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "welcome:buttons:home") {
    const selection = interaction.values[0];
    if (selection === "manage") {
      await interaction.update({ components: [createWelcomeButtonsManagerContainer(interaction.guildId)] });
      return;
    }
    if (selection === "add") {
      if (parseWelcomeButtons(readGuildSettings(interaction.guildId).welcome.buttons).length >= 5) {
        await interaction.reply({ content: "You can add up to five welcome buttons.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.showModal(createWelcomeButtonModal());
      return;
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "welcome:buttons:manage") {
    const selection = interaction.values[0];
    if (selection === "add") {
      if (parseWelcomeButtons(readGuildSettings(interaction.guildId).welcome.buttons).length >= 5) {
        await interaction.reply({ content: "You can add up to five welcome buttons.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.showModal(createWelcomeButtonModal());
      return;
    }
    const [action, buttonId] = selection.split(":");
    const settings = readGuildSettings(interaction.guildId);
    const buttons = parseWelcomeButtons(settings.welcome.buttons);
    const buttonIndex = buttons.findIndex((button) => button.id === buttonId);
    if (buttonIndex < 0) {
      await interaction.reply({ content: "That welcome button no longer exists.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === "edit") {
      await interaction.showModal(createWelcomeButtonModal(buttons[buttonIndex]));
      return;
    }
    if (action === "remove") {
      buttons.splice(buttonIndex, 1);
      settings.welcome.buttons = JSON.stringify(buttons);
      writeGuildSettings(interaction.guildId, settings);
      await interaction.update({ components: [createWelcomeButtonsManagerContainer(interaction.guildId)] });
      return;
    }
  }

  if (interaction.isButton() && interaction.customId === "welcome:buttons:back") {
    await interaction.update({ components: [createWelcomeContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "autoroles:buttons:home") {
    const selection = interaction.values[0];
    if (selection === "manage") {
      await interaction.update({ components: [createAutoRolesButtonsManagerContainer(interaction.guildId)] });
      return;
    }
    if (selection === "add") {
      if (parseWelcomeButtons(readGuildSettings(interaction.guildId).autoRoles.buttons).length >= 5) {
        await interaction.reply({ content: "You can add up to five Auto roles buttons.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.showModal(createWelcomeButtonModal({}, "autoroles"));
      return;
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "autoroles:buttons:manage") {
    const selection = interaction.values[0];
    if (selection === "add") {
      if (parseWelcomeButtons(readGuildSettings(interaction.guildId).autoRoles.buttons).length >= 5) {
        await interaction.reply({ content: "You can add up to five Auto roles buttons.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.showModal(createWelcomeButtonModal({}, "autoroles"));
      return;
    }
    const [action, buttonId] = selection.split(":");
    const settings = readGuildSettings(interaction.guildId);
    const buttons = parseWelcomeButtons(settings.autoRoles.buttons);
    const buttonIndex = buttons.findIndex((button) => button.id === buttonId);
    if (buttonIndex < 0) {
      await interaction.reply({ content: "That Auto roles button no longer exists.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === "edit") {
      await interaction.showModal(createWelcomeButtonModal(buttons[buttonIndex], "autoroles"));
      return;
    }
    if (action === "remove") {
      buttons.splice(buttonIndex, 1);
      settings.autoRoles.buttons = JSON.stringify(buttons);
      writeGuildSettings(interaction.guildId, settings);
      await interaction.update({ components: [createAutoRolesButtonsManagerContainer(interaction.guildId)] });
      return;
    }
  }

  if (interaction.isButton() && interaction.customId === "autoroles:buttons:back") {
    await interaction.update({ components: [createAutoRolesContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "welcome:preview") {
    const settings = readGuildSettings(interaction.guildId).welcome;
    const buttonRow = createWelcomeButtonRow(interaction.guildId, settings.buttons);
    await interaction.reply({
      embeds: [createWelcomePreviewEmbed(interaction.guild, interaction.user, settings)],
      components: buttonRow ? [buttonRow] : [],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("bots:toggle:allow:")) {
    const action = interaction.customId.split(":").at(-1);
    if (!["enable", "disable"].includes(action)) return;
    const settings = readGuildSettings(interaction.guildId);
    settings.bots.kick = action === "enable" ? "no" : "yes";
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createBotsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("bots:toggle:kick")) {
    const settings = readGuildSettings(interaction.guildId);
    settings.bots.kick = requestedEnabledValue(interaction, settings.bots.kick);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createBotsContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "autoroles:reset") {
    const settings = readGuildSettings(interaction.guildId);
    settings.autoRoles.roles = "";
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createAutoRolesContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isRoleSelectMenu() && interaction.customId === "autoroles:select") {
    const settings = readGuildSettings(interaction.guildId);
    settings.autoRoles.roles = interaction.values.join(",");
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createAutoRolesContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "minimumage:reset") {
    const settings = readGuildSettings(interaction.guildId);
    const definition = settingDefinitions.find((setting) => setting.id === "minimumAge");
    settings.minimumAge = Object.fromEntries(definition.fields.map((field) => [field.id, field.default]));
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createMinimumAgeContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("minimumage:select:")) {
    const field = interaction.customId.slice("minimumage:select:".length);
    const value = interaction.values[0];
    if (!["hours", "action"].includes(field) || !interaction.guildId) return;
    if (value === "custom" && field === "hours") {
      await interaction.showModal(createMinimumAgeCustomModal());
      return;
    }
    const settings = readGuildSettings(interaction.guildId);
    settings.minimumAge[field] = value;
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createMinimumAgeContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "captcha:create-channel") {
    if (!interaction.guild || !interaction.guildId) return;
    const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        content: "I need the Manage Channels permission to create a verification channel.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const channel = await interaction.guild.channels.create({
      name: "captcha-verification",
      type: ChannelType.GuildText,
      topic: "Verification channel for Cozyy captcha setup."
    });
    const settings = readGuildSettings(interaction.guildId);
    settings.captcha.channel = channel.id;
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({
      components: [createCaptchaContainer(interaction.guildId, `#${channel.name}`)]
    });
    return;
  }

  if (interaction.isChannelSelectMenu() && interaction.customId === "captcha:channel") {
    const channelId = interaction.values[0];
    const channel = interaction.guild?.channels.cache.get(channelId);
    const settings = readGuildSettings(interaction.guildId);
    settings.captcha.channel = channelId;
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({
      components: [createCaptchaContainer(interaction.guildId, channel ? `#${channel.name}` : undefined)]
    });
    return;
  }

  if (interaction.isChannelSelectMenu() && interaction.customId === "welcome:channel") {
    const settings = readGuildSettings(interaction.guildId);
    settings.welcome.channel = interaction.values[0] ?? "";
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createWelcomeContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("raidmode:toggle:")) {
    const field = interaction.customId.slice("raidmode:toggle:".length).split(":")[0];
    if (!["enabled", "closeDMs"].includes(field) || !interaction.guildId) return;
    const settings = readGuildSettings(interaction.guildId);
    settings.raidMode[field] = requestedEnabledValue(interaction, settings.raidMode[field]);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createRaidModeContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("raidmode:select:")) {
    const field = interaction.customId.slice("raidmode:select:".length);
    const value = interaction.values[0];
    if (!["members", "duration", "action"].includes(field) || !interaction.guildId) return;
    if (value === "custom") {
      await interaction.showModal(createRaidModeCustomModal(field));
      return;
    }
    const settings = readGuildSettings(interaction.guildId);
    settings.raidMode[field] = value;
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createRaidModeContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("setup:configure:")) {
    const settingId = interaction.customId.slice("setup:configure:".length);
    const definition = settingDefinitions.find((setting) => setting.id === settingId);
    if (!definition || !interaction.guildId) {
      await interaction.reply({ content: "That setting is unavailable.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (settingId === "commandPermissions") {
      await interaction.reply({
        content: "Command permissions are managed by Discord in **Server Settings > Integrations > Cozyy**. There you can choose who may use slash commands and enable **Apply integration permissions**. Cozyy cannot change this Discord-controlled setting.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    if (settingId === "logs") {
      await interaction.update({ components: [createLogsContainer(interaction.guildId)] });
      return;
    }
    await interaction.showModal(createConfigureModal(definition, interaction.guildId));
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup:changelog") {
    await interaction.reply({
      content: "**Cozyy v1.0**\nImproved raid detection and refreshed server setup controls.",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("setup:modal:")) {
    const settingId = interaction.customId.slice("setup:modal:".length);
    const definition = settingDefinitions.find((setting) => setting.id === settingId);
    if (!definition || !interaction.guildId) {
      await interaction.reply({ content: "That setting is unavailable.", flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = readGuildSettings(interaction.guildId);
    const values = Object.fromEntries(definition.fields.map((field) => [
      field.id,
      (field.options
        ? interaction.fields.getStringSelectValues(field.id)[0]
        : interaction.fields.getTextInputValue(field.id).trim()) || settings[settingId][field.id]
    ]));
    if (settingId === "commands" && (/\s/.test(values.prefix) || values.prefix.length > 8)) {
      await interaction.reply({ content: "Prefix must be 1 to 8 characters with no spaces.", flags: MessageFlags.Ephemeral });
      return;
    }
    settings[settingId] = values;
    writeGuildSettings(interaction.guildId, settings);

    if (interaction.isFromMessage()) {
      await interaction.update({
        components: [createSetupContainer(interaction.guildId, definition.category)]
      });
    } else {
      await interaction.reply({
        content: "Settings saved. Run /setup to view the updated values.",
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === "welcome:modal:text") {
    const settings = readGuildSettings(interaction.guildId);
    const text = interaction.fields.getTextInputValue("message").trim();
    settings.welcome.message = text || "welcome {user.mention} to **{server.name}**!";
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createWelcomeContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "welcome:modal:image") {
    const thumbnailUrl = interaction.fields.getTextInputValue("thumbnailUrl").trim();
    const imageUrl = interaction.fields.getTextInputValue("imageUrl").trim();
    if (!isHttpsImageUrl(thumbnailUrl) || !isHttpsImageUrl(imageUrl)) {
      await interaction.reply({
        content: "Image URLs must be valid HTTPS links. Discord CDN attachment URLs are supported.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const settings = readGuildSettings(interaction.guildId);
    settings.welcome.thumbnailUrl = thumbnailUrl;
    settings.welcome.imageUrl = imageUrl;
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createWelcomeContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "welcome:modal:color") {
    const color = interaction.fields.getTextInputValue("color").trim().replace(/^#/, "");
    if (!/^[\da-f]{6}$/i.test(color)) {
      await interaction.reply({
        content: "Enter a six-digit hex color, for example e05b60.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const settings = readGuildSettings(interaction.guildId);
    settings.welcome.color = color;
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createWelcomeContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "automod:duration:images") {
    const duration = Number(interaction.fields.getTextInputValue("duration"));
    if (!Number.isInteger(duration) || duration < 1 || duration > 10080) {
      await interaction.reply({ content: "Enter a whole number from 1 to 10080 minutes.", flags: MessageFlags.Ephemeral });
      return;
    }
    const settings = readGuildSettings(interaction.guildId);
    settings.automodImages.duration = String(duration);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createImageFilterContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "automod:images:create-list") {
    const name = interaction.fields.getTextInputValue("name").trim();
    const channelId = [...interaction.fields.getSelectedChannels("channel").keys()][0];
    if (!name || !channelId) {
      await interaction.reply({ content: "Enter a list name and choose its verification channel.", flags: MessageFlags.Ephemeral });
      return;
    }
    const settings = readGuildSettings(interaction.guildId);
    let catalogs;
    try { catalogs = JSON.parse(settings.automodImages.catalogs || "[]"); }
    catch { catalogs = []; }
    if (!Array.isArray(catalogs) || catalogs.length >= 10) {
      await interaction.reply({ content: "This server can have up to ten image lists.", flags: MessageFlags.Ephemeral });
      return;
    }
    catalogs.push({ id: randomUUID(), name, channelId, images: [] });
    settings.automodImages.catalogs = JSON.stringify(catalogs);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createImageFilterContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("automod:servers:modal:")) {
    const listName = interaction.customId.slice("automod:servers:modal:".length);
    if (!["blocklist", "allowlist"].includes(listName)) return;
    const serverId = interaction.fields.getTextInputValue("serverId").trim();
    if (!/^\d{17,20}$/.test(serverId)) {
      await interaction.reply({ content: "Enter a valid Discord server ID (17–20 digits).", flags: MessageFlags.Ephemeral });
      return;
    }
    const settings = readGuildSettings(interaction.guildId);
    let serverIds;
    try { serverIds = JSON.parse(settings.automodOtherServers[listName] || "[]"); }
    catch { serverIds = []; }
    if (!Array.isArray(serverIds)) serverIds = [];
    settings.automodOtherServers[listName] = JSON.stringify(
      serverIds.includes(serverId) ? serverIds.filter((id) => id !== serverId) : [...serverIds, serverId]
    );
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({ components: [createOtherServersContainer(interaction.guildId)] });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "antispam:simulation") {
    const userId = interaction.fields.getSelectedUsers("member").keys().next().value;
    const channel = interaction.fields.getSelectedChannels("channel").first();
    const spamType = interaction.fields.getStringSelectValues("spamType")[0];
    if (!interaction.guild || !userId || !channel || !spamType) {
      await interaction.reply({ content: "Select a member, channel, and spam type to simulate.", flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = readGuildSettings(interaction.guildId).antiSpam;
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    const ignoredChannels = settings.ignoredChannels.split(",").filter(Boolean);
    const ignoredRoles = settings.ignoredRoles.split(",").filter(Boolean);
    const ignoredMembers = settings.ignoredMembers.split(",").filter(Boolean);
    let result;
    if (!isEnabled(settings.enabled)) {
      result = "Anti-spam is disabled, so it would not react.";
    } else if (ignoredChannels.includes(channel.id)) {
      result = "This channel is on the Anti-spam ignore list, so it would not react.";
    } else if (isEnabled(settings.ignoreSpamChannels) && channel.name.toLowerCase().includes("spam")) {
      result = "This channel name contains “spam” and that filter is enabled, so it would not react.";
    } else if (ignoredMembers.includes(userId)) {
      result = "This member is on the Anti-spam ignore list, so it would not react.";
    } else if (member && member.roles.cache.some((role) => ignoredRoles.includes(role.id))) {
      result = "This member has an ignored role, so Anti-spam would not react.";
    } else {
      result = `Anti-spam would apply the **${settings.sanction}** sanction for **${spamType}** in <#${channel.id}>.`;
    }

    await interaction.reply({ content: result, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    return;
  }

  if (interaction.isModalSubmit() && /^(welcome|autoroles):button:modal:/.test(interaction.customId)) {
    const [, scope, buttonId] = interaction.customId.match(/^(welcome|autoroles):button:modal:(.+)$/);
    const name = interaction.fields.getTextInputValue("name").trim();
    const emoji = interaction.fields.getTextInputValue("emoji").trim();
    const channelId = [...interaction.fields.getSelectedChannels("channel").keys()][0];
    if (!name || !channelId) {
      await interaction.reply({ content: "Enter a button name and select a channel.", flags: MessageFlags.Ephemeral });
      return;
    }
    const settings = readGuildSettings(interaction.guildId);
    const buttonSettings = scope === "welcome" ? settings.welcome : settings.autoRoles;
    const buttons = parseWelcomeButtons(buttonSettings.buttons);
    const buttonIndex = buttons.findIndex((button) => button.id === buttonId);
    if (buttonId === "new" && buttons.length >= 5) {
      const sectionName = { welcome: "welcome", autoroles: "Auto roles" }[scope];
      await interaction.reply({ content: `You can add up to five ${sectionName} buttons.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const button = { id: buttonId === "new" ? randomUUID() : buttonId, name, emoji, channelId };
    if (buttonId === "new") buttons.push(button);
    else if (buttonIndex >= 0) buttons[buttonIndex] = button;
    else {
      await interaction.reply({ content: "That welcome button no longer exists.", flags: MessageFlags.Ephemeral });
      return;
    }
    buttonSettings.buttons = JSON.stringify(buttons);
    writeGuildSettings(interaction.guildId, settings);
    await interaction.update({
      components: [scope === "welcome"
        ? createWelcomeButtonsManagerContainer(interaction.guildId)
        : createAutoRolesButtonsManagerContainer(interaction.guildId)]
    });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("raidmode:custom:")) {
    const field = interaction.customId.slice("raidmode:custom:".length);
    if (!["members", "duration"].includes(field) || !interaction.guildId) return;
    const value = Number(interaction.fields.getTextInputValue("value"));
    const minimum = field === "members" ? 2 : 1;
    const maximum = field === "members" ? 500 : 1440;
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      await interaction.reply({
        content: `Enter a whole number from ${minimum} to ${maximum}.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const settings = readGuildSettings(interaction.guildId);
    settings.raidMode[field] = String(value);
    writeGuildSettings(interaction.guildId, settings);
    if (interaction.isFromMessage()) {
      await interaction.update({ components: [createRaidModeContainer(interaction.guildId)] });
    } else {
      await interaction.reply({ content: "RaidMode setting saved.", flags: MessageFlags.Ephemeral });
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === "minimumage:custom:hours") {
    if (!interaction.guildId) return;
    const value = Number(interaction.fields.getTextInputValue("value"));
    if (!Number.isInteger(value) || value < 1 || value > 8760) {
      await interaction.reply({
        content: "Enter a whole number from 1 to 8760 hours.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const settings = readGuildSettings(interaction.guildId);
    settings.minimumAge.hours = String(value);
    writeGuildSettings(interaction.guildId, settings);
    if (interaction.isFromMessage()) {
      await interaction.update({ components: [createMinimumAgeContainer(interaction.guildId)] });
    } else {
      await interaction.reply({ content: "Minimum account age saved.", flags: MessageFlags.Ephemeral });
    }
  }

  if (interaction.isButton() && !interaction.replied && !interaction.deferred) {
    await interaction.reply({
      content: "That button is outdated or unavailable. Run /setup again to open the current settings.",
      flags: MessageFlags.Ephemeral
    });
  }
}

async function applyBotJoinPolicy(member) {
  if (!member.user.bot || member.id === client.user?.id) return;

  const settings = readGuildSettings(member.guild.id);
  const botMember = member.guild.members.me ?? await member.guild.members.fetchMe();
  if (isEnabled(settings.bots.kick)) {
    if (!botMember.permissions.has(PermissionFlagsBits.KickMembers) || !member.kickable) {
      console.warn(`Cannot kick newly joined bot ${member.id} in guild ${member.guild.id}.`);
      return;
    }
    await member.kick("New bots are disabled in this server's settings.");
    return;
  }

  const roleIds = settings.autoRoles.roles.split(",").filter(Boolean);
  const roles = roleIds
    .map((roleId) => member.guild.roles.cache.get(roleId))
    .filter((role) => role && !role.managed && role.editable);
  if (!roles.length) return;
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    console.warn(`Cannot assign configured bot roles in guild ${member.guild.id}: missing Manage Roles.`);
    return;
  }

  await member.roles.add(roles, "Assign configured roles to the newly joined bot.");
}

async function applyWelcomeMessage(member) {
  if (member.id === client.user?.id) return;
  const { welcome } = readGuildSettings(member.guild.id);
  if (!isEnabled(welcome.enabled) || !welcome.channel) return;

  const channel = member.guild.channels.cache.get(welcome.channel)
    ?? await member.guild.channels.fetch(welcome.channel).catch(() => null);
  if (!channel?.isTextBased() || !channel.isSendable()) return;

  const botMember = member.guild.members.me ?? await member.guild.members.fetchMe();
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    console.warn(`Cannot send welcome message in channel ${channel.id}: missing Send Messages or Embed Links.`);
    return;
  }

  const buttonRow = createWelcomeButtonRow(member.guild.id, welcome.buttons);
  await channel.send({
    embeds: [createWelcomePreviewEmbed(member.guild, member, welcome)],
    components: buttonRow ? [buttonRow] : [],
    allowedMentions: {
      parse: [],
      users: isEnabled(welcome.mention) ? [member.id] : []
    }
  });
}

client.on(Events.InteractionCreate, (interaction) => {
  handleInteraction(interaction).catch(async (error) => {
    console.error(`Interaction failed (${interaction.customId ?? interaction.commandName ?? "unknown"}):`, error);
    const message = error && typeof error === "object" && "message" in error && error.message
      ? String(error.message)
      : typeof error === "string" && error
        ? error
        : "Something went wrong while applying that setting.";
    const response = { content: message, flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(response).catch(() => {});
    else await interaction.reply(response).catch(() => {});
  });
});

client.on(Events.MessageCreate, (message) => {
  handlePrefixModeration(message).catch((error) => {
    console.error("Prefix moderation command failed:", error);
  });
});

client.on(Events.GuildMemberAdd, (member) => {
  applyBotJoinPolicy(member).catch((error) => {
    console.error(`Failed to apply bot join policy in guild ${member.guild.id}:`, error);
  });
  applyWelcomeMessage(member).catch((error) => {
    console.error(`Failed to send welcome message in guild ${member.guild.id}:`, error);
  });
});

client.on(Events.GuildMemberUpdate, (_oldMember, newMember) => {
  syncTagRole(newMember).catch((error) => {
    console.error(`Failed to synchronize Tag Role for member ${newMember.id} in guild ${newMember.guild.id}:`, error);
  });
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.login(token);