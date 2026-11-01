import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  EmbedBuilder,
  MessageFlags,
  RoleSelectMenuBuilder,
  SectionBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  UserSelectMenuBuilder
} from "discord.js";
import { categories, escapeMarkdown, readGuildSettings, settingDefinitions } from "../settings.js";

const accentColor = 0x000000;

function categoryMenu(activeCategory) {
  return new ActionRowBuilder().addComponents(
    ...categories.map((category) => new ButtonBuilder()
      .setCustomId(`setup:category:${category.value}`)
      .setLabel(category.label)
      .setStyle(category.value === activeCategory ? ButtonStyle.Primary : ButtonStyle.Secondary))
  );
}

function configureButton(customId, label = "Edit") {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setEmoji({ name: "⚙️" })
    .setStyle(ButtonStyle.Secondary);
}

export function createSetupContainer(guildId, activeCategory = "general") {
  const selectedCategory = categories.some(({ value }) => value === activeCategory) ? activeCategory : "general";
  const settings = readGuildSettings(guildId);
  const categoryLabel = categories.find(({ value }) => value === selectedCategory).label;
  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## Settings\nCozyy settings for this server. To get started, look at Arrivals (captcha, anti-raid) and Moderation (logs channel, sanctions). Every change applies immediately.`
      ))
      .setButtonAccessory(new ButtonBuilder()
        .setCustomId("setup:changelog")
        .setLabel("Changelog")
        .setStyle(ButtonStyle.Secondary)))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(categoryMenu(selectedCategory));

  if (selectedCategory !== "protection") {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${categoryLabel}`));
  }

  const visibleSettings = settingDefinitions.filter(({ category }) => category === selectedCategory);
  for (const definition of visibleSettings) {
    const summary = escapeMarkdown(definition.summary(settings[definition.id]));
    const badge = definition.badge ? ` [${definition.badge}]` : "";
    container.addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**${definition.title}${badge}**\n${summary}`
      ))
      .setButtonAccessory(definition.toggle
        ? stateButton(`utilities:toggle:${definition.id}`, isEnabledValue(settings[definition.id].enabled))
        : configureButton(`setup:configure:${definition.id}`, definition.buttonLabel ?? "Edit")));
  }

  return container;
}

function stateButton(customId, enabled) {
  const action = enabled ? "disable" : "enable";
  return new ButtonBuilder()
    .setCustomId(`${customId}:${action}`)
    .setLabel(action === "disable" ? "Disable" : "Enable")
    
    .setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Secondary);
}

function numberSelect(customId, placeholder, options, currentValue) {
  const choices = options.some((option) => option.value === currentValue)
    ? options
    : [{ label: `${currentValue} (custom)`, value: currentValue }, ...options];
  choices.push({ label: "Custom value", value: "custom" });
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(...choices.map((option) => ({
      label: option.label,
      value: option.value,
      default: option.value === currentValue
    })));
}

export function createRaidModeContainer(guildId) {
  const { raidMode } = readGuildSettings(guildId);
  const memberOptions = [10, 15, 20, 30].map((count) => ({
    label: `${count} members`,
    value: String(count)
  }));
  const durationOptions = [1, 2, 5, 10].map((minutes) => ({
    label: `${minutes} ${minutes === 1 ? "minute" : "minutes"}`,
    value: String(minutes)
  }));
  const actionOptions = [
    { label: "Lock invites", value: "lock_invites", description: "Nobody new gets in during the raid." },
    { label: "Kick everyone arriving", value: "kick_arrivals", description: "They can come back with an invite afterwards." },
    { label: "Send to the captcha", value: "captcha", description: "People arriving take the captcha instead of being kicked." },
    { label: "Captcha frozen during the raid", value: "captcha_frozen", description: "People wait behind the captcha and take it after the wave." }
  ];
  const selectedAction = actionOptions.find(({ value }) => value === raidMode.action) ?? actionOptions[0];
  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Auto RaidMode configuration"))
      .setButtonAccessory(stateButton("raidmode:toggle:enabled", isEnabledValue(raidMode.enabled))))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `RaidMode turns on when too many members arrive at once. Set the threshold, its duration, and what happens to new members during the wave.\n\n Arrivals  ›  Auto RaidMode`
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Number of members / ${raidMode.seconds} seconds`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(numberSelect(
      "raidmode:select:members",
      `${raidMode.members} members`,
      memberOptions,
      raidMode.members
    )))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("###  Duration"))
    .addActionRowComponents(new ActionRowBuilder().addComponents(numberSelect(
      "raidmode:select:duration",
      `${raidMode.duration} ${raidMode.duration === "1" ? "minute" : "minutes"}`,
      durationOptions,
      raidMode.duration
    )))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `###  Action during the raid\n${selectedAction.description}`
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("raidmode:select:action")
        .setPlaceholder(actionOptions.find(({ value }) => value === raidMode.action)?.label ?? "Select an action")
        .addOptions(actionOptions.map((option) => ({ ...option, default: option.value === raidMode.action })))
    ))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `###  Close DMs\n${isEnabledValue(raidMode.closeDMs) ? "Enabled" : "Disabled"}`
      ))
      .setButtonAccessory(stateButton("raidmode:toggle:closeDMs", isEnabledValue(raidMode.closeDMs))))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setup:category:arrivals")
        .setLabel("Back")
        
        .setStyle(ButtonStyle.Secondary)
    ));

  return container;
}

export function createCaptchaContainer(guildId, channelName) {
  const { channel: channelId } = readGuildSettings(guildId).captcha;
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId("captcha:channel")
    .setPlaceholder(channelName ?? "Select a verification channel")
    .setChannelTypes(ChannelType.GuildText);
  if (channelId) channelSelect.setDefaultChannels(channelId);

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("## Captcha configuration"))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "New members must pass a test before accessing the server. This blocks automated accounts (selfbots) and raids."
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(" Arrivals  ›  Captcha"))
    .addSeparatorComponents(new SeparatorBuilder())
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("###  Verification channel"))
      .setButtonAccessory(new ButtonBuilder()
        .setCustomId("captcha:create-channel")
        .setLabel("Create one for me")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(Boolean(channelId))))
    .addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setup:category:arrivals")
        .setLabel("Back")
        
        .setStyle(ButtonStyle.Secondary)
    ));
}

export function createMinimumAgeContainer(guildId) {
  const { minimumAge } = readGuildSettings(guildId);
  const ageOptions = [
    { label: "2 hours", value: "2" },
    { label: "12 hours", value: "12" },
    { label: "1 day", value: "24" },
    { label: "2 days", value: "48" }
  ];
  const actionOptions = [
    { label: "Kick", value: "kick", description: "Kicked on every attempt while their account is too new." },
    { label: "Quarantine until the required age", value: "quarantine", description: "They cannot see the server until old enough, or use /bypass minage." },
    { label: "Hold at the gate", value: "hold", description: "They can only complete the captcha once their account is old enough." }
  ];
  const selectedAction = actionOptions.find(({ value }) => value === minimumAge.action) ?? actionOptions[0];

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Minimum account age settings"))
      .setButtonAccessory(new ButtonBuilder()
        .setCustomId("minimumage:reset")
        .setLabel("Reset")
        
        .setStyle(ButtonStyle.Danger)))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "An account created too recently cannot join normally. Depending on the chosen action, it is kicked, quarantined, or held at a captcha until it reaches the required age.\nChanging the age applies to pending kicks, quarantines, and captchas; a ban already issued keeps its date."
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(" Arrivals  ›  Minimum account age"))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("###  Minimum account age"))
    .addActionRowComponents(new ActionRowBuilder().addComponents(numberSelect(
      "minimumage:select:hours",
      `${formatAgeHours(minimumAge.hours)}`,
      ageOptions,
      minimumAge.hours
    )))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `###  Action\n${selectedAction.description}`
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("minimumage:select:action")
        .setPlaceholder(selectedAction.label)
        .addOptions(actionOptions.map((option) => ({ ...option, default: option.value === minimumAge.action })))
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setup:category:arrivals")
        .setLabel("Back")
        
        .setStyle(ButtonStyle.Secondary)
    ));
}

export function createAutoRolesContainer(guildId) {
  const autoRoles = readGuildSettings(guildId).autoRoles;
  const roleIds = autoRoles.roles.split(",").filter(Boolean);
  const buttons = parseWelcomeButtons(autoRoles.buttons);
  const buttonOptions = [
    { label: "Manage buttons", value: "manage", description: "Choose a button to edit, or add a new one." }
  ];
  if (buttons.length < 5) buttonOptions.push({ label: "Add button", value: "add" });
  const buttonMenu = new StringSelectMenuBuilder()
    .setCustomId("autoroles:buttons:home")
    .setPlaceholder("Manage auto roles links")
    .addOptions(buttonOptions);
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId("autoroles:select")
    .setPlaceholder(roleIds.length ? `${roleIds.length} role${roleIds.length === 1 ? "" : "s"} selected` : "Select one or more roles")
    .setMinValues(0)
    .setMaxValues(3);
  if (roleIds.length) roleSelect.setDefaultRoles(...roleIds);

  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Auto roles"))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "Roles given to every new member on arrival, or after the captcha if it is active. Avoid roles with permissions."
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(" Arrivals  ›  Auto roles"))
    .addSeparatorComponents(new SeparatorBuilder())
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("###  Auto roles"))
      .setButtonAccessory(new ButtonBuilder()
        .setCustomId("autoroles:reset")
        .setLabel("Reset")
        
        .setStyle(ButtonStyle.Danger)))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(" 3 roles maximum, 10 with premium."))
    .addActionRowComponents(new ActionRowBuilder().addComponents(roleSelect))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("###  Auto roles links"))
    .addActionRowComponents(new ActionRowBuilder().addComponents(buttonMenu));

  const linksRow = createWelcomeButtonRow(guildId, autoRoles.buttons);
  if (linksRow) container.addActionRowComponents(linksRow);

  return container
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setup:category:arrivals")
        .setLabel("Back")
        
        .setStyle(ButtonStyle.Secondary)
    ));
}

export function createAutoRolesButtonsManagerContainer(guildId) {
  const buttons = parseWelcomeButtons(readGuildSettings(guildId).autoRoles.buttons);
  const options = buttons.flatMap((button) => [
    { label: `Edit: ${button.name}`.slice(0, 100), value: `edit:${button.id}` },
    { label: `Remove: ${button.name}`.slice(0, 100), value: `remove:${button.id}` }
  ]);
  if (buttons.length < 5) options.push({ label: "Add button", value: "add" });
  const menu = new StringSelectMenuBuilder()
    .setCustomId("autoroles:buttons:manage")
    .setPlaceholder("Choose an auto roles button to edit or remove")
    .addOptions(options);

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Auto roles links"))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      buttons.length ? "Choose a button to edit or remove, or add a new one." : "No links yet. Add a button to link a channel from Auto roles."
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(menu))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("autoroles:buttons:back")
        .setLabel("Back")
        
        .setStyle(ButtonStyle.Secondary)
    ));
}

export function createBotsContainer(guildId) {
  const { bots } = readGuildSettings(guildId);
  const botsAllowed = !isEnabledValue(bots.kick);
  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Bot arrival"))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "Choose whether newly added bots are allowed to join the server."
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(" Arrivals  ›  Bots"))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `###  Allow new bots\n${botsAllowed ? "Enabled" : "Disabled"}`
      ))
      .setButtonAccessory(new ButtonBuilder()
        .setCustomId(`bots:toggle:allow:${botsAllowed ? "disable" : "enable"}`)
        .setLabel(botsAllowed ? "Disable" : "Enable")
        
        .setStyle(botsAllowed ? ButtonStyle.Success : ButtonStyle.Danger)))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "When disabled, newly added bots are kicked immediately. When enabled, they can join and receive the selected bot role or Auto roles."
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setup:category:arrivals")
        .setLabel("Back")
        
        .setStyle(ButtonStyle.Secondary)
    ));
}
      "When enabled, new bots can join and receive the configured Auto roles. When disabled, newly added bots are kicked immediately."
export function createWelcomeContainer(guildId) {
  const { welcome } = readGuildSettings(guildId);
  const buttons = parseWelcomeButtons(welcome.buttons);
  const buttonOptions = [
    { label: "Manage buttons", value: "manage", description: "Choose a button to edit, or add a new one." }
  ];
  if (buttons.length < 5) buttonOptions.push({ label: "Add button", value: "add" });
  const buttonMenu = new StringSelectMenuBuilder()
    .setCustomId("welcome:buttons:home")
    .setPlaceholder("Manage buttons")
    .addOptions(buttonOptions);
  const welcomeChannel = new ChannelSelectMenuBuilder()
    .setCustomId("welcome:channel")
    .setPlaceholder("Select a welcome channel")
    .setMinValues(0)
    .setMaxValues(1)
    .setChannelTypes(ChannelType.GuildText);
  if (welcome.channel) welcomeChannel.setDefaultChannels(welcome.channel);

  return new ContainerBuilder()
    .setAccentColor(parseWelcomeColor(welcome.color))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Welcome message"))
      .setButtonAccessory(stateButton("welcome:toggle:enabled", isEnabledValue(welcome.enabled))))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `${isEnabledValue(welcome.enabled) ? "A welcome message will be sent when a new member joins." : "No welcome message will be sent when a new member joins."}\n\n Arrivals  ›  Welcome message`
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("###  Welcome channel"))
    .addActionRowComponents(new ActionRowBuilder().addComponents(welcomeChannel))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("###  Message content"))
      .setButtonAccessory(new ButtonBuilder()
        .setCustomId("welcome:edit:text")
        .setLabel("Text")
        
        .setStyle(ButtonStyle.Secondary)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("welcome:edit:color")
        .setLabel("Color")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("welcome:edit:image")
        .setLabel("Image edit")
        
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("welcome:preview")
        .setLabel("Preview")
        
        .setStyle(ButtonStyle.Primary)
    ))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `###  Mention member\n${isEnabledValue(welcome.mention) ? "Enabled" : "Disabled"}`
      ))
      .setButtonAccessory(stateButton("welcome:toggle:mention", isEnabledValue(welcome.mention))))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "###  Manage buttons\nChoose a button to edit, or add a new one."
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(buttonMenu))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setup:category:arrivals")
        .setLabel("Back")
        
        .setStyle(ButtonStyle.Secondary)
    ));
}

export function parseWelcomeButtons(serialized) {
  try {
    const buttons = JSON.parse(serialized || "[]");
    if (!Array.isArray(buttons)) return [];
    return buttons.filter((button) =>
      typeof button.id === "string" && typeof button.name === "string" &&
      typeof button.channelId === "string" && button.name.length > 0
    ).slice(0, 5);
  } catch {
    return [];
  }
}

export function createWelcomeButtonsManagerContainer(guildId) {
  const buttons = parseWelcomeButtons(readGuildSettings(guildId).welcome.buttons);
  const options = buttons.flatMap((button) => [
    { label: `Edit: ${button.name}`.slice(0, 100), value: `edit:${button.id}` },
    { label: `Remove: ${button.name}`.slice(0, 100), value: `remove:${button.id}` }
  ]);
  if (buttons.length < 5) options.push({ label: "Add button", value: "add" });
  const menu = new StringSelectMenuBuilder()
    .setCustomId("welcome:buttons:manage")
    .setPlaceholder("Choose a button to edit or remove")
    .addOptions(options);

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Manage buttons"))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      buttons.length ? "Choose a button to edit or remove, or add a new one." : "No buttons yet. Add a button to link a channel from the welcome message."
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(menu))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("welcome:buttons:back")
        .setLabel("Back")
        
        .setStyle(ButtonStyle.Secondary)
    ));
}

export function createWelcomeButtonRow(guildId, serialized) {
  const buttons = parseWelcomeButtons(serialized);
  if (!buttons.length) return null;

  return new ActionRowBuilder().addComponents(buttons.map((button) => {
    const link = new ButtonBuilder()
      .setLabel(button.name)
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${guildId}/${button.channelId}`);
    if (button.emoji) link;
    return link;
  }));
}

function parseButtonEmoji(value) {
  const customEmoji = value.match(/^<(a?):([^:]+):(\d+)>$/);
  if (customEmoji) {
    return { animated: customEmoji[1] === "a", name: customEmoji[2], id: customEmoji[3] };
  }
  return value;
}

export function createDisconContainer(guildId) {
  const { discord } = readGuildSettings(guildId);
  const panelChannel = new ChannelSelectMenuBuilder()
    .setCustomId("discon:panel-channel")
    .setPlaceholder("DISCON panel channel (text or voice)")
    .setMinValues(0)
    .setMaxValues(1)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice);
  const statusChannel = new ChannelSelectMenuBuilder()
    .setCustomId("discon:status-channel")
    .setPlaceholder("Status voice channel (optional)")
    .setMinValues(0)
    .setMaxValues(1)
    .setChannelTypes(ChannelType.GuildVoice);
  if (discord.panelChannel) panelChannel.setDefaultChannels(discord.panelChannel);
  if (discord.statusChannel) statusChannel.setDefaultChannels(discord.statusChannel);

  const levels = [
    { value: "5", label: "DISCON 5" },
    { value: "4", label: "DISCON 4" },
    { value: "3", label: "DISCON 3" },
    { value: "2", label: "DISCON 2" },
    { value: "1", label: "DISCON 1" }
  ];
  const levelSelect = new StringSelectMenuBuilder()
    .setCustomId("discon:level")
    .setPlaceholder(`Current level: DISCON ${discord.currentLevel}`)
    .addOptions(levels.map((level) => ({ ...level, default: level.value === discord.currentLevel })));
  const levelDescriptions = [
    " **DISCON 5** All clear; medium verification.",
    " **DISCON 4** Heightened; high verification.",
    " **DISCON 3** Alert; highest verification, DM lock.",
    " **DISCON 2** Critical; highest verification, DM lock.",
    " **DISCON 1** Catastrophe; highest verification, DM lock, lockdown, no one can post or react."
  ].join("\n");

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  DISCON configuration"))
      .setButtonAccessory(new ButtonBuilder()
        .setCustomId("discon:create-panel")
        .setLabel("Create panel channel")
        
        .setStyle(ButtonStyle.Secondary)))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "Choose the channel where the DISCON panel is posted and, optionally, a voice channel whose name mirrors the current level.\n\n Protection  ›  DISCON"
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(panelChannel))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        "###  Status voice channel\n The DISCON status voice channel requires premium."
      ))
      .setButtonAccessory(new ButtonBuilder()
        .setCustomId("discon:create-status")
        .setLabel("Create status channel")
        
        .setStyle(ButtonStyle.Secondary)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(statusChannel))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      " **Level 1 will not stop everyone.** It only stops the @everyone role from talking; roles and channel overrides can grant that permission back."
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Current level\n**DISCON ${discord.currentLevel}**`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(levelSelect))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Level scale\n${levelDescriptions}`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setup:category:protection")
        .setLabel("Back")
        
        .setStyle(ButtonStyle.Secondary)
    ));
}

export function createAntiSpamContainer(guildId) {
  const { antiSpam } = readGuildSettings(guildId);
  const channelIds = antiSpam.ignoredChannels.split(",").filter(Boolean);
  const roleIds = antiSpam.ignoredRoles.split(",").filter(Boolean);
  const userIds = antiSpam.ignoredMembers.split(",").filter(Boolean);
  const ignoredChannelSelect = new ChannelSelectMenuBuilder()
    .setCustomId("antispam:channels")
    .setPlaceholder(" Channel(s) to ignore (write to search)")
    .setMinValues(0)
    .setMaxValues(25)
    .setChannelTypes(ChannelType.GuildText);
  const ignoredRoleSelect = new RoleSelectMenuBuilder()
    .setCustomId("antispam:roles")
    .setPlaceholder(" Role(s) to ignore (write to search)")
    .setMinValues(0)
    .setMaxValues(25);
  const ignoredMemberSelect = new UserSelectMenuBuilder()
    .setCustomId("antispam:members")
    .setPlaceholder(" Member(s) to ignore (write to search)")
    .setMinValues(0)
    .setMaxValues(25);
  if (channelIds.length) ignoredChannelSelect.setDefaultChannels(...channelIds);
  if (roleIds.length) ignoredRoleSelect.setDefaultRoles(...roleIds);
  if (userIds.length) ignoredMemberSelect.setDefaultUsers(...userIds);

  const sanctions = [
    { label: "Soft", value: "soft", description: "Warns first, then times out or jails: never kicks or bans." },
    { label: "Standard", value: "standard", description: "Cozyy's default sanctions." },
    { label: "Strict (not recommended)", value: "strict", description: "Bans advertising and automated accounts on the first spam." }
  ];
  const sanction = sanctions.find(({ value }) => value === antiSpam.sanction)
    ?? sanctions.find(({ value }) => value === "standard");

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Anti-spam configuration"))
      .setButtonAccessory(stateButton("antispam:toggle:enabled", isEnabledValue(antiSpam.enabled))))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `Detects spam (flood, duplicates, links, mentions, selfbots...) and sanctions its author. Each spam type has its own sanction.\n\n Protection  ›  Anti-spam`
    ))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("###  Sanctions"))
      .setButtonAccessory(new ButtonBuilder()
        .setCustomId("antispam:details")
        .setLabel("View details")
        
        .setStyle(ButtonStyle.Secondary)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("antispam:sanction")
        .setPlaceholder(sanction.label)
        .addOptions(sanctions.map((option) => ({ ...option, default: option.value === sanction.value })))
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(ignoredChannelSelect))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `###  Ignore “spam” channels\nA channel whose name contains “spam” is ignored by Anti-spam. ${isEnabledValue(antiSpam.ignoreSpamChannels) ? "Enabled" : "Disabled"}`
      ))
      .setButtonAccessory(stateButton("antispam:toggle:ignoreSpamChannels", isEnabledValue(antiSpam.ignoreSpamChannels))))
    .addActionRowComponents(new ActionRowBuilder().addComponents(ignoredRoleSelect))
    .addActionRowComponents(new ActionRowBuilder().addComponents(ignoredMemberSelect))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        "###  Simulation\nCheck whether anti-spam would react: pick a member, a channel and a spam type."
      ))
      .setButtonAccessory(new ButtonBuilder()
        .setCustomId("antispam:simulate")
        .setLabel("Simulate")
        
        .setStyle(ButtonStyle.Secondary)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setup:category:protection")
        .setLabel("Back")
        
        .setStyle(ButtonStyle.Secondary)
    ));
}

export function createHoneyPotContainer(guildId) {
  const { honeyPot } = readGuildSettings(guildId);
  const sanctionOptions = [
    { label: "Ban", value: "ban" },
    { label: "Softban", value: "softban" },
    { label: "Jail", value: "jail" },
    { label: "Kick", value: "kick" },
    { label: "Mute", value: "mute" }
  ];
  const selectedSanction = sanctionOptions.find(({ value }) => value === honeyPot.sanction) ?? sanctionOptions[1];
  const sanctionMenu = new StringSelectMenuBuilder()
    .setCustomId("honeypot:sanction")
    .setPlaceholder(selectedSanction.label)
    .addOptions(sanctionOptions.map((option) => ({ ...option, default: option.value === selectedSanction.value })));
  const durationMenu = new StringSelectMenuBuilder()
    .setCustomId("honeypot:duration")
    .setPlaceholder(honeyPot.duration === "1440" ? "1 day" : `${honeyPot.duration} minutes`)
    .setDisabled(!["mute", "jail"].includes(honeyPot.sanction))
    .addOptions([
      { label: "5 minutes", value: "5" },
      { label: "1 hour", value: "60" },
      { label: "1 day", value: "1440", default: honeyPot.duration === "1440" },
      { label: "Custom value", value: "custom" }
    ]);
  const delayOptions = [
    { label: "Immediate sanction", value: "0" },
    { label: "Ask first, sanction after 30 seconds", value: "30" },
    { label: "Ask first, sanction after 1 minute", value: "60" },
    { label: "Ask first, sanction after 2 minutes", value: "120" },
    { label: "Ask first, sanction after 5 minutes", value: "300" }
  ];
  const delayMenu = new StringSelectMenuBuilder()
    .setCustomId("honeypot:delay")
    .setPlaceholder(delayOptions.find(({ value }) => value === honeyPot.delay)?.label ?? "Immediate sanction")
    .addOptions(delayOptions.map((option) => ({ ...option, default: option.value === honeyPot.delay })));
  const ignoredOptions = [
    { label: "Nobody (except non-moderable members)", value: "nobody" },
    { label: "Staff (Admin / Manage Server / Manage Channels)", value: "staff" },
    { label: "Members ignored by Antispam", value: "antiSpam" }
  ];
  const ignoredMenu = new StringSelectMenuBuilder()
    .setCustomId("honeypot:ignoredMembers")
    .setPlaceholder(ignoredOptions.find(({ value }) => value === honeyPot.ignoredMembers)?.label ?? "Staff")
    .addOptions(ignoredOptions.map((option) => ({ ...option, default: option.value === honeyPot.ignoredMembers })));

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  HoneyPot configuration"))
      .setButtonAccessory(stateButton("honeypot:toggle", isEnabledValue(honeyPot.enabled))))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "A trap channel open to everyone, even jailed or unverified members. Any member who writes in it is sanctioned automatically.\n\nThe channel is created at the top of the server with a warning message and a translate button.\n\n Protection  ›  HoneyPot"
    ))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `###  HoneyPot channel\n${honeyPot.channel ? `<#${honeyPot.channel}>` : "No channel created yet."}`
      ))
      .setButtonAccessory(new ButtonBuilder()
        .setCustomId("honeypot:create-channel")
        .setLabel(honeyPot.channel ? "Regenerate channel" : "Create channel")
        
        .setStyle(ButtonStyle.Secondary)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(sanctionMenu))
    .addActionRowComponents(new ActionRowBuilder().addComponents(durationMenu))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `###  Delay before sanction [NEW]\nWith a delay, the message is removed and the member can click to say it was a mistake. Otherwise, they are sanctioned after the delay. The same message posted in another channel is sanctioned immediately.`
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(delayMenu))
    .addActionRowComponents(new ActionRowBuilder().addComponents(ignoredMenu))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup:category:protection").setLabel("Back").setStyle(ButtonStyle.Secondary)
    ));
}

export function createPreventiveSlowmodeContainer(guildId) {
  const { slots: serializedSlots } = readGuildSettings(guildId).preventiveSlowmode;
  const slots = parseJsonArray(serializedSlots);
  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Preventive slowmode"))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "Adjusts the slowmode of the chosen channels based on messages per minute, within the limits set for each.\n\n Protection  ›  Preventive slowmode"
    ));

  for (let index = 0; index < 6; index += 1) {
    const rule = slots[index];
    const content = rule
      ? `<#${rule.channelId}>\n${rule.messagesPerMinute} messages/minute · ${rule.seconds} seconds slowmode`
      : "Free slot.";
    container.addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setButtonAccessory(new ButtonBuilder()
        .setCustomId(`slowmode:edit:${index}`)
        .setLabel(rule ? "Edit" : "Add")
        
        .setStyle(ButtonStyle.Secondary)));
  }

  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("setup:category:protection")
      .setLabel("Back")
      
      .setStyle(ButtonStyle.Secondary)
  ));
  return container;
}

export function createAuthenticationManagerContainer(guildId, activeTab = "roles", page = 0) {
  const settings = readGuildSettings(guildId).authenticationManager;
  const tabs = ["roles", "users", "logs"];
  const tab = tabs.includes(activeTab) ? activeTab : "roles";
  const records = parseJsonArray(settings[tab]);
  const pageCount = Math.max(1, Math.ceil(records.length / 5));
  const currentPage = Math.min(Math.max(0, page), pageCount - 1);
  const entries = records.slice(currentPage * 5, currentPage * 5 + 5);
  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Authentication Manager"))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**Server Configuration**\n Default Session Time: **${settings.sessionTime}**\n Default Min Grade: **${settings.minGrade}**\n Min Managers Grade: **${settings.minManagersGrade}**\n Webhook: ${settings.webhookUrl ? "set" : "not set"}`
      ))
      .setButtonAccessory(new ButtonBuilder()
        .setCustomId("auth:server-config")
        .setLabel("Edit")
        .setStyle(ButtonStyle.Secondary)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup:category:protection").setLabel("Back").setStyle(ButtonStyle.Secondary),
      ...tabs.map((value) => new ButtonBuilder()
        .setCustomId(`auth:tab:${value}`)
        .setLabel(value[0].toUpperCase() + value.slice(1))
        .setStyle(value === tab ? ButtonStyle.Primary : ButtonStyle.Secondary)),
      new ButtonBuilder().setCustomId(`auth:add:${tab}`).setLabel("Add").setStyle(ButtonStyle.Success).setDisabled(tab !== "roles")
    ));

  for (let index = 0; index < 5; index += 1) {
    const entry = entries[index];
    const content = !entry
      ? "Empty slot"
      : tab === "roles"
        ? `<@&${entry.roleId}> · Grade ${entry.grade} · ${entry.sessionTime}`
        : tab === "users"
          ? `<@${entry.userId}> · Grade ${entry.grade}`
          : `${entry.createdAt ?? "Access log entry"} · ${entry.message ?? "Authentication event"}`;
    container.addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setButtonAccessory(new ButtonBuilder()
        .setCustomId(`auth:edit:${tab}:${currentPage * 5 + index}`)
        .setLabel("Edit")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!entry || tab !== "roles")));
  }

  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`auth:page:${tab}:${currentPage}:first`).setLabel("≪").setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
    new ButtonBuilder().setCustomId(`auth:page:${tab}:${currentPage}:prev`).setLabel("‹").setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
    new ButtonBuilder().setCustomId("auth:page:current").setLabel(`${currentPage + 1}/${pageCount}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`auth:page:${tab}:${currentPage}:next`).setLabel("›").setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= pageCount - 1),
    new ButtonBuilder().setCustomId(`auth:page:${tab}:${currentPage}:last`).setLabel("≫").setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= pageCount - 1)
  ));
  const sessions = parseJsonArray(settings.lastSessions);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `### Last sessions\n${sessions.length ? sessions.slice(-3).map((session) => `${session.createdAt ?? "Session"} · ${session.userId ? `<@${session.userId}>` : session.message ?? "Authenticated"}`).join("\n") : "No recent sessions."}`
  ));
  return container;
}

export function createSanctionsContainer(guildId) {
  const { sanctions } = readGuildSettings(guildId);
  const deletionOptions = [
    { label: "No deletion", value: "none" },
    { label: "Delete one day", value: "1" },
    { label: "Delete three days", value: "3" },
    { label: "Delete seven days", value: "7" }
  ];
  const deletionMenu = new StringSelectMenuBuilder()
    .setCustomId("sanctions:banDeletion")
    .setPlaceholder(`Message deletion on ban: ${deletionOptions.find(({ value }) => value === sanctions.banDeletion)?.label ?? "No deletion"}`)
    .addOptions(deletionOptions.map((option) => ({ ...option, default: option.value === sanctions.banDeletion })));
  const logsChannel = new ChannelSelectMenuBuilder()
    .setCustomId("sanctions:logsChannel")
    .setPlaceholder(sanctions.logsChannel || "Select a sanction log channel")
    .setMinValues(0)
    .setMaxValues(1)
    .setChannelTypes(ChannelType.GuildText);
  if (sanctions.logsChannel && /^\d{17,20}$/.test(sanctions.logsChannel)) logsChannel.setDefaultChannels(sanctions.logsChannel);

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Sanctions configuration"))
      .setButtonAccessory(stateButton("sanctions:toggle:enabled", isEnabledValue(sanctions.enabled))))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "Settings shared by all sanctions: Jail and Mute roles, what members see of their sanctions, sanction names, appeal link…\n\n Moderation  ›  Sanctions"
    ))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Jail\n${sanctions.jailRoleId ? `<@&${sanctions.jailRoleId}>` : "None"}`))
      .setButtonAccessory(new ButtonBuilder().setCustomId("sanctions:open:jail").setLabel("Edit").setStyle(ButtonStyle.Secondary)))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `###  Synced Discord quarantine [NEW]\n${isEnabledValue(sanctions.syncedQuarantine) ? "Enabled" : "Disabled"}\nA member whose Discord AutoMod quarantines (nickname, server tag) is quarantined with the Jail role, and released when Discord lifts it. Only new quarantines count.`
      ))
      .setButtonAccessory(stateButton("sanctions:toggle:syncedQuarantine", isEnabledValue(sanctions.syncedQuarantine))))
    .addActionRowComponents(new ActionRowBuilder().addComponents(deletionMenu))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Mute\n${sanctions.muteRoleId ? `<@&${sanctions.muteRoleId}>` : "None"}`))
      .setButtonAccessory(new ButtonBuilder().setCustomId("sanctions:open:mute").setLabel("Edit").setStyle(ButtonStyle.Secondary)))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `###  Timeout / Mute commands\n${isEnabledValue(sanctions.timeoutEnabled) ? "Enabled" : "Disabled"}\nEnable this before using /timeout or /mute.`
      ))
      .setButtonAccessory(stateButton("sanctions:toggle:timeoutEnabled", isEnabledValue(sanctions.timeoutEnabled))))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `###  Logs\n<#${sanctions.logsChannel}>\nPassive moderation logs: ${isEnabledValue(sanctions.passiveLogs) ? "Enabled" : "Disabled"}`
      ))
      .setButtonAccessory(new ButtonBuilder().setCustomId("sanctions:logs-edit").setLabel("Edit").setStyle(ButtonStyle.Secondary).setEmoji({ name: "⚙️" })))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Show media\n${isEnabledValue(sanctions.showMedia) ? "Enabled" : "Disabled"}`))
      .setButtonAccessory(stateButton("sanctions:toggle:showMedia", isEnabledValue(sanctions.showMedia))))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Sanctions Privacy\n${isEnabledValue(sanctions.privacy) ? "Enabled" : "Disabled"}`))
      .setButtonAccessory(stateButton("sanctions:privacy", isEnabledValue(sanctions.privacy))))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup:category:moderation").setLabel("Back").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("sanctions:export").setLabel("Export").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("sanctions:import").setLabel("Import").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("sanctions:names").setLabel("Sanction names").setStyle(ButtonStyle.Primary),
      stateButton("sanctions:toggle:passiveLogs", isEnabledValue(sanctions.passiveLogs))
    ));
}

export function createReportsContainer(guildId) {
  const { reports } = readGuildSettings(guildId);
  const receivingChannel = /^\d{17,20}$/.test(reports.channel)
    ? `<#${reports.channel}>`
    : reports.channel ? `#${reports.channel}` : "Disabled";
  const reporterNotification = reports.reporterNotification === "all" ? "All reports" : "Handled only";
  const falseReportSummary = reports.falseReportThreshold === "disabled"
    ? "Disabled"
    : `${reports.falseReportThreshold} rejected reports · ${reports.falseReportWindow} days · ${reports.falseReportAction}`;

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Reporting System configuration"))
      .setButtonAccessory(stateButton("reports:toggle:enabled", isEnabledValue(reports.enabled))))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "Members report a member or a message with /report or a right click. The report arrives in the chosen channel, where your team accepts or refuses it.\n\n Moderation  ›  Reports"
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Receiving reports\n${receivingChannel}`))
      .setButtonAccessory(new ButtonBuilder().setCustomId("reports:edit:receiving").setLabel("Edit").setStyle(ButtonStyle.Secondary)))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `###  Notification role\n${reports.notificationRoleId ? `<@&${reports.notificationRoleId}>` : reports.notifyEveryone === "yes" ? "@everyone" : reports.notifyHere === "yes" ? "@here" : "None"}`
      ))
      .setButtonAccessory(new ButtonBuilder().setCustomId("reports:edit:notificationRole").setLabel("Edit").setStyle(ButtonStyle.Secondary)))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Reporter notification\n${reporterNotification}`))
      .setButtonAccessory(new ButtonBuilder().setCustomId("reports:edit:reporterNotification").setLabel("Edit").setStyle(ButtonStyle.Secondary)))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `###  Grouping\n${isEnabledValue(reports.grouping) ? "Enabled" : "Disabled"}\nReports about the same member are grouped into a single alert.`
      ))
      .setButtonAccessory(stateButton("reports:toggle:grouping", isEnabledValue(reports.grouping))))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Trusted role\n${reports.trustedRoleId ? `<@&${reports.trustedRoleId}>` : "Disabled"}`))
      .setButtonAccessory(new ButtonBuilder().setCustomId("reports:edit:trustedRole").setLabel("Edit").setEmoji({ name: "⭐" }).setStyle(ButtonStyle.Secondary)))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  False reporters\n${falseReportSummary}`))
      .setButtonAccessory(new ButtonBuilder().setCustomId("reports:edit:falseReport").setLabel("Edit").setStyle(ButtonStyle.Secondary)))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup:category:moderation").setLabel("≪").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("support:server").setLabel("Support Server").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("docs:open").setLabel("Documentation").setStyle(ButtonStyle.Secondary)
    ));
}

export function createBotLogsContainer(guildId) {
  const { sanctions } = readGuildSettings(guildId);
  const generalLogs = new ChannelSelectMenuBuilder()
    .setCustomId("sanctions:logsChannel:general")
    .setPlaceholder(sanctions.logsChannel || "Channel for general logs (write to search)")
    .setMinValues(0)
    .setMaxValues(1)
    .setChannelTypes(ChannelType.GuildText);
  const moderationLogs = new ChannelSelectMenuBuilder()
    .setCustomId("sanctions:logsChannel:moderation")
    .setPlaceholder(sanctions.logsChannel || "Channel for moderation logs (write to search)")
    .setMinValues(0)
    .setMaxValues(1)
    .setChannelTypes(ChannelType.GuildText);
  if (sanctions.logsChannel && /^\d{17,20}$/.test(sanctions.logsChannel)) {
    generalLogs.setDefaultChannels(sanctions.logsChannel);
    moderationLogs.setDefaultChannels(sanctions.logsChannel);
  }

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Bot Logs configuration"))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("Choose where Cozyy sends its logs."))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("###  Moderation\n> Logs"))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("# Miscellaneous"))
      .setButtonAccessory(new ButtonBuilder().setCustomId("sanctions:logs:create").setLabel("＋").setStyle(ButtonStyle.Secondary)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(generalLogs))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("# Moderation"))
      .setButtonAccessory(new ButtonBuilder().setCustomId("sanctions:logs:create").setLabel("＋").setStyle(ButtonStyle.Secondary)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(moderationLogs))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Passive moderation logs\n${isEnabledValue(sanctions.passiveLogs) ? "Enabled" : "Disabled"}`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      stateButton("sanctions:toggle:passiveLogs", isEnabledValue(sanctions.passiveLogs)),
      new ButtonBuilder().setCustomId("sanctions:back").setLabel("Back").setStyle(ButtonStyle.Secondary)
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup:category:moderation").setLabel("<<").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("support:server").setLabel("Support Server").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("docs:open").setLabel("Documentation").setStyle(ButtonStyle.Secondary)
    ));
}

export function createLogsContainer(guildId) {
  const { logs } = readGuildSettings(guildId);
  const channels = [
    ["miscellaneousChannel", "Miscellaneous logs"],
    ["moderationChannel", "Moderation logs"],
    ["captchaChannel", "Captcha logs"]
  ];
  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("## Logs configuration"))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("Choose a text channel for each type of log."));

  for (const [field, label] of channels) {
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId(`logs:channel:${field}`)
      .setPlaceholder("Select a channel")
      .setMinValues(0)
      .setMaxValues(1)
      .setChannelTypes(ChannelType.GuildText);
    if (logs[field] && /^\d{17,20}$/.test(logs[field])) channelSelect.setDefaultChannels(logs[field]);

    container
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${label}\n${/^\d{17,20}$/.test(logs[field]) ? `<#${logs[field]}>` : logs[field] ? `#${logs[field]}` : "Not set"}`))
      .addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect));
  }

  return container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("setup:category:moderation").setLabel("Back").setStyle(ButtonStyle.Secondary)
  ));
}

export function createJailContainer(guildId) {
  const { jailRoleId, jailHandling } = readGuildSettings(guildId).sanctions;
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId("sanctions:jail:role")
    .setMinValues(0)
    .setMaxValues(1)
    .setPlaceholder(jailRoleId ? "Jail role selected" : "Jail Role (write to search)");
  if (jailRoleId) roleSelect.setDefaultRoles(jailRoleId);
  const handlingOptions = [
    { label: "Add the jail role", value: "add", description: "The member keeps their roles; the jail role is added." },
    { label: "Replace all roles", value: "replace", description: "Roles are removed, then restored on unjail." }
  ];
  const handling = new StringSelectMenuBuilder()
    .setCustomId("sanctions:jail:handling")
    .setPlaceholder(handlingOptions.find(({ value }) => value === jailHandling)?.label ?? "Add the jail role")
    .addOptions(handlingOptions.map((option) => ({ ...option, default: option.value === jailHandling })));

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Moderation configuration\nThe Jail role isolates a member: they see almost nothing of the server, which is stricter than a mute. It is required for /jail and /tempjail.\n\n Moderation  ›  Sanctions  ›  Jail"))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Jail\n${jailRoleId ? `<@&${jailRoleId}>` : "No jail role selected."}`))
      .setButtonAccessory(new ButtonBuilder().setCustomId("sanctions:jail:create").setLabel("Create one for me").setStyle(ButtonStyle.Primary)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(roleSelect))
      .addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("sanctions:jail:reset").setLabel("Reset").setStyle(ButtonStyle.Danger)
      ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Role handling on jail\n${handlingOptions.find(({ value }) => value === jailHandling)?.description ?? handlingOptions[0].description}`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(handling))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("sanctions:back").setLabel("Back").setStyle(ButtonStyle.Secondary)
    ));
}

export function createMuteContainer(guildId) {
  const { muteRoleId, muteHandling } = readGuildSettings(guildId).sanctions;
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId("sanctions:mute:role")
    .setMinValues(0)
    .setMaxValues(1)
    .setPlaceholder(muteRoleId ? "Mute role selected" : "Mute Role (write to search)");
  if (muteRoleId) roleSelect.setDefaultRoles(muteRoleId);
  const handlingOptions = [
    { label: "Add the mute role", value: "add", description: "The member keeps their roles; the mute role is added." },
    { label: "Replace all roles", value: "replace", description: "Roles are removed, then restored when unmuted." }
  ];
  const handling = new StringSelectMenuBuilder()
    .setCustomId("sanctions:mute:handling")
    .setPlaceholder(handlingOptions.find(({ value }) => value === muteHandling)?.label ?? "Add the mute role")
    .addOptions(handlingOptions.map((option) => ({ ...option, default: option.value === muteHandling })));

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Mute configuration\nThe Mute role prevents members from speaking in server channels. Configure the role and how existing roles are handled.\n\n Moderation  ›  Sanctions  ›  Mute"))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Mute\n${muteRoleId ? `<@&${muteRoleId}>` : "No mute role selected."}`))
      .setButtonAccessory(new ButtonBuilder().setCustomId("sanctions:mute:create").setLabel("Create one for me").setStyle(ButtonStyle.Primary)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(roleSelect))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("sanctions:mute:reset").setLabel("Reset").setStyle(ButtonStyle.Danger)
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Role handling on mute\n${handlingOptions.find(({ value }) => value === muteHandling)?.description ?? handlingOptions[0].description}`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(handling))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("sanctions:back").setLabel("Back").setStyle(ButtonStyle.Secondary)
    ));
}

function createUtilityRoleContainer(guildId, settingId) {
  const isTagRole = settingId === "tagRole";
  const setting = readGuildSettings(guildId)[settingId];
  const roleId = setting.roleId;
  const title = isTagRole ? "Tag Role" : "On-duty role";
  const description = isTagRole
    ? "Gives a role to members who display your server tag on their profile, and removes it if they remove the tag.\n\nThe role arrives on their next profile update. Many members already have the tag? Ask support for a sync."
    : "The on-duty role shows which moderators are available. They take it or remove it with /onduty.";
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`utilities:${settingId}:role`)
    .setMinValues(0)
    .setMaxValues(1)
    .setPlaceholder(roleId ? `${title} selected` : `${title} (write to search)`);
  if (roleId && /^\d{17,20}$/.test(roleId)) roleSelect.setDefaultRoles(roleId);

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`##  ${title} configuration`))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${description}\n\n Utilities  ›  ${title}`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  ${title}\n${roleId ? `<@&${roleId}>` : "Disabled"}`))
      .setButtonAccessory(new ButtonBuilder()
        .setCustomId(`utilities:role:create:${settingId}`)
        .setLabel("Create one for me")
        .setStyle(ButtonStyle.Secondary)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(roleSelect))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`utilities:role:reset:${settingId}`)
        .setLabel("Reset")
        .setStyle(ButtonStyle.Danger)
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup:category:utilities").setLabel("≪").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("support:server").setLabel("Support Server").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("docs:open").setLabel("Documentation").setStyle(ButtonStyle.Secondary)
    ));
}

export function createTagRoleContainer(guildId) {
  return createUtilityRoleContainer(guildId, "tagRole");
}

export function createOnDutyRoleContainer(guildId) {
  return createUtilityRoleContainer(guildId, "onDutyRole");
}

export function createAutomodContainer(guildId) {
  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Automod"))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "Filters that automatically delete unwanted messages, such as known scam images. Each filter has its own sanction for the author.\n\n Protection  ›  Automod"
    ))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("** Images**\nTimeout\nKnown scams, matched by fingerprint"))
      .setButtonAccessory(configureButton("automod:open:images", "Configure")))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("** Other servers [NEW]**\nInvites, forwards and tags from other servers\nDeletes invites and forwarded messages; quarantines their tags."))
      .setButtonAccessory(configureButton("automod:open:otherServers", "Configure")))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("** File extensions [NEW]**\nBlocked files, or only allowed ones, per channel\nRefused files are deleted based on the configured rules."))
      .setButtonAccessory(configureButton("automod:open:fileExtensions", "Configure")))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup:category:protection").setLabel("Back").setStyle(ButtonStyle.Secondary)
    ));
}

function automodBackButton() {
  return new ButtonBuilder()
    .setCustomId("automod:back")
    .setLabel("Back")
    
    .setStyle(ButtonStyle.Secondary);
}

function sanctionMenu(customId, value) {
  const options = [
    { label: "Default", value: "default", description: "Use the default sanction, or the HoneyPot sanction when active." },
    { label: "Ban", value: "ban" },
    { label: "Softban", value: "softban" },
    { label: "Jail", value: "jail" },
    { label: "Kick", value: "kick" },
    { label: "Timeout", value: "timeout" },
    { label: "Message deleted only", value: "message_deleted" }
  ];
  const selected = options.find((option) => option.value === value) ?? options[0];
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(selected.label)
    .addOptions(options.map((option) => ({ ...option, default: option.value === selected.value })));
}

function deletedMessageSanctionMenu(customId, value) {
  const options = [
    { label: "Default", value: "default", description: "Use the configured default sanction." },
    { label: "Message deleted only", value: "message_deleted", description: "Delete the message without an additional sanction." },
    { label: "Warn", value: "warn" },
    { label: "Timeout", value: "timeout" },
    { label: "Mute", value: "mute", description: "Not configured; falls back to Timeout. Set it in Moderation > Sanctions." },
    { label: "Jail", value: "jail", description: "Not configured; falls back to Timeout. Set it in Moderation > Sanctions." }
  ];
  const selected = options.find((option) => option.value === value) ?? options[0];
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(selected.label)
    .addOptions(options.map((option) => ({ ...option, default: option.value === selected.value })));
}

function durationMenu(customId, value) {
  const options = [
    { label: "Default", value: "default" },
    { label: "5 minutes", value: "5" },
    { label: "1 hour", value: "60" },
    { label: "1 day", value: "1440" }
  ];
  const selected = options.find((option) => option.value === value)
    ?? { label: `${value} minutes (custom)`, value };
  const choices = options.some((option) => option.value === selected.value)
    ? options
    : [selected, ...options];
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(selected.label)
    .addOptions(
      ...choices.map((option) => ({ ...option, default: option.value === selected.value })),
      { label: "Custom value", value: "custom" }
    );
}

export function createImageFilterContainer(guildId) {
  const image = readGuildSettings(guildId).automodImages;
  const catalogs = parseJsonArray(image.catalogs);
  const catalogSummary = catalogs.length
    ? catalogs.map((catalog) => `**${catalog.name}** (${catalog.images?.length ?? 0}/${catalog.images?.length ?? 0})`).join("\n")
    : "**Crypto Scam**\nManaged by Cozyy, applied on all servers.\n\nNo list for this server yet. Create one, choose its verification channel, then add your images.";

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  Image filter"))
      .setButtonAccessory(stateButton("automod:toggle:images", isEnabledValue(image.enabled))))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "Deletes images that match known scams and sanctions their author. Message text is not read.\n\n Protection  ›  Automod  ›  Images"
    ))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("###  Applied sanction"))
      .setButtonAccessory(new ButtonBuilder().setCustomId("automod:details:images").setLabel("View details").setStyle(ButtonStyle.Secondary)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(sanctionMenu("automod:images:sanction", image.sanction)))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `###  Sanction duration\n${image.duration === "default" ? "Default" : image.duration === "60" ? "1 hour" : image.duration === "1440" ? "1 day" : `${image.duration} minutes`}\nDuration specific to this filter, independent from Anti-spam and HoneyPot.`
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(durationMenu("automod:images:duration", image.duration)))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "###  Image catalog\n One list = one single image registry (one content type). Mixing unrelated images in a list corrupts detection."
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(catalogSummary))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("automod:images:create-list").setLabel(`Create a list (${catalogs.length}/0)`).setStyle(ButtonStyle.Secondary)
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(automodBackButton()));
}

export function createOtherServersContainer(guildId) {
  const settings = readGuildSettings(guildId).automodOtherServers;
  const blocklist = parseJsonArray(settings.blocklist);
  const allowlist = parseJsonArray(settings.allowlist);
  const policies = [
    { label: "Disabled", value: "disabled" },
    { label: "Blocklist", value: "blocklist" },
    { label: "Allowlist", value: "allowlist" }
  ];
  const policyMenu = (id, label, value) => new StringSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder(`${label}: ${policies.find((option) => option.value === value)?.label ?? "Disabled"}`)
    .addOptions(policies.map((option) => ({ ...option, default: option.value === value })));

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  References to other servers"))
      .setButtonAccessory(stateButton("automod:toggle:otherServers", isEnabledValue(settings.enabled))))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "Targets messages that point to another server: invite, forwarded message or channel link, displayed server tag. For each one, refuse some servers (blocklist) or accept only some (allowlist). Your own server always passes, and your team is never targeted.\n\n Protection  ›  Automod  ›  Other servers"
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(policyMenu("automod:otherServers:invites", " Invite", settings.invites)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(policyMenu("automod:otherServers:forwarded", " Forwarded message/link", settings.forwarded)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(policyMenu("automod:otherServers:serverTags", " Displayed server tag", settings.serverTags)))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "###  Sanction for deleted messages\nRefused messages are deleted; the sanction applies at most once per minute per member. A refused tag quarantines the member until they remove it."
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(deletedMessageSanctionMenu("automod:otherServers:deletedSanction", settings.deletedSanction)))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Blocklist (${blocklist.length})\n${blocklist.length ? blocklist.join(", ") : "No servers"}`))
      .setButtonAccessory(new ButtonBuilder().setCustomId("automod:servers:blocklist").setLabel("Add / remove").setStyle(ButtonStyle.Secondary)))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Allowlist (${allowlist.length})\n${allowlist.length ? allowlist.join(", ") : "No servers"}`))
      .setButtonAccessory(new ButtonBuilder().setCustomId("automod:servers:allowlist").setLabel("Add / remove").setStyle(ButtonStyle.Secondary)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(automodBackButton()));
}

export function createFileExtensionsContainer(guildId) {
  const settings = readGuildSettings(guildId).automodFileExtensions;
  const channelRules = parseJsonArray(settings.channelRules);
  const channels = new ChannelSelectMenuBuilder()
    .setCustomId("automod:fileExtensions:channels")
    .setPlaceholder(`Channels and categories (${channelRules.length})`)
    .setMinValues(0)
    .setMaxValues(20)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory);
  if (channelRules.length) channels.setDefaultChannels(...channelRules.map((rule) => rule.channelId));
  const serverRules = [
    { label: "Disabled", value: "disabled", description: "No extension refused server-wide." },
    { label: "Blocklist", value: "blocklist", description: "Deletes files with these extensions, everywhere." },
    { label: "Allowlist", value: "allowlist", description: "Deletes any file with another extension, everywhere." }
  ];

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("##  File extensions"))
      .setButtonAccessory(stateButton("automod:toggle:fileExtensions", isEnabledValue(settings.enabled))))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      "Block file extensions or allow only some, server-wide or per channel. Your team is never targeted.\n\n Protection  ›  Automod  ›  File extensions"
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("###  Entire server"))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("automod:fileExtensions:server")
        .setPlaceholder(`Entire server: ${serverRules.find((rule) => rule.value === settings.entireServer)?.label ?? "Disabled"}`)
        .addOptions(serverRules.map((rule) => ({ ...rule, default: rule.value === settings.entireServer })))
    ))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `###  Always refuse corrupted files\nAn image or video Discord cannot read (for example, an .exe renamed to .png) is deleted in every channel, not only by an allowlist. ${isEnabledValue(settings.refuseCorrupted) ? "Enabled" : "Disabled"}`
      ))
      .setButtonAccessory(stateButton("automod:toggle:fileExtensions:refuseCorrupted", isEnabledValue(settings.refuseCorrupted))))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`###  Channels and categories (${channelRules.length})`))
      .setButtonAccessory(new ButtonBuilder()
        .setCustomId("automod:fileExtensions:add-channel")
        .setLabel("Add a channel")
        
        .setStyle(ButtonStyle.Secondary)))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `A category rule applies to all its channels. More specific channel rules override the category, then server.\n Without premium, only one channel rule applies and categories are unavailable; up to 20 rules with premium.\n${channelRules.length ? channelRules.map((rule) => `<#${rule.channelId}>: ${rule.extensions || "No extensions set"}`).join("\n") : "No channels set"}`
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(channels))
    .addActionRowComponents(new ActionRowBuilder().addComponents(deletedMessageSanctionMenu("automod:fileExtensions:sanction", settings.deletedSanction)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(automodBackButton()));
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function createWelcomePreviewEmbed(guild, user, settings) {
  const memberUser = user.user ?? user;
  const userName = memberUser.username;
  const displayName = user.displayName ?? userName;
  const userId = memberUser.id;
  const description = settings.message
    .replaceAll("{user.mention}", isEnabledValue(settings.mention) ? `<@${userId}>` : displayName)
    .replaceAll("{user.name}", userName)
    .replaceAll("{user.displayname}", displayName)
    .replaceAll("{user.id}", userId)
    .replaceAll("{server.name}", guild.name)
    .replaceAll("{server.id}", guild.id)
    .replaceAll("{server.member_count}", "");
  const embed = new EmbedBuilder()
    .setColor(parseWelcomeColor(settings.color))
    .setDescription(description || "Welcome message preview");
  if (settings.thumbnailUrl) embed.setThumbnail(settings.thumbnailUrl);
  if (settings.imageUrl) embed.setImage(settings.imageUrl);
  return embed;
}

function parseWelcomeColor(value) {
  const hex = String(value).replace(/^#/, "");
  return /^[\da-f]{6}$/i.test(hex) ? Number.parseInt(hex, 16) : accentColor;
}

function formatAgeHours(hours) {
  const value = Number(hours);
  if (value === 24) return "1 day";
  if (value === 48) return "2 days";
  if (value % 24 === 0 && value > 48) return `${value / 24} days`;
  return `${value} ${value === 1 ? "hour" : "hours"}`;
}

function isEnabledValue(value) {
  return ["yes", "true", "on", "enabled"].includes(String(value).trim().toLowerCase());
}

export const setupMessageFlags = MessageFlags.IsComponentsV2;