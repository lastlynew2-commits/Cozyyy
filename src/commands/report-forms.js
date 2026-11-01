import {
  ChannelSelectMenuBuilder,
  ChannelType,
  CheckboxBuilder,
  LabelBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder
} from "discord.js";
import { isEnabled } from "../settings.js";

function reportSelect(customId, value, options) {
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(options.find((option) => option.value === value)?.label ?? options[0].label)
    .addOptions(options.map((option) => ({ ...option, default: option.value === value })));
}

export function createReportsReceivingModal(reports) {
  const channel = new ChannelSelectMenuBuilder()
    .setCustomId("channel")
    .setMinValues(0)
    .setMaxValues(1)
    .setChannelTypes(ChannelType.GuildText);
  if (/^\d{17,20}$/.test(reports.channel)) channel.setDefaultChannels(reports.channel);
  return new ModalBuilder()
    .setCustomId("reports:modal:receiving")
    .setTitle("Receiving reports")
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("### Documentation\nChannel where reports arrive."))
    .addLabelComponents(
      new LabelBuilder().setLabel("Receiving reports").setChannelSelectMenuComponent(channel),
      new LabelBuilder().setLabel("Automatic creation").setCheckboxComponent(new CheckboxBuilder()
        .setCustomId("automaticCreation")
        .setDefault(isEnabled(reports.automaticCreation)))
    );
}

export function createReportNotificationRoleModal(reports) {
  const role = new RoleSelectMenuBuilder()
    .setCustomId("role")
    .setMinValues(0)
    .setMaxValues(1);
  if (/^\d{17,20}$/.test(reports.notificationRoleId)) role.setDefaultRoles(reports.notificationRoleId);
  return new ModalBuilder()
    .setCustomId("reports:modal:notificationRole")
    .setTitle("Notification role")
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("### Documentation\nRole mentioned on every new report, usually your moderators."))
    .addLabelComponents(
      new LabelBuilder().setLabel("Notification role").setDescription("Choose a role, or tick a mention below.").setRoleSelectMenuComponent(role),
      new LabelBuilder().setLabel("Other mention").setCheckboxComponent(new CheckboxBuilder()
        .setCustomId("everyone")
        .setDefault(isEnabled(reports.notifyEveryone))),
      new LabelBuilder().setLabel("Mention @here").setCheckboxComponent(new CheckboxBuilder()
        .setCustomId("here")
        .setDefault(isEnabled(reports.notifyHere))),
      new LabelBuilder().setLabel("Create a role for me").setCheckboxComponent(new CheckboxBuilder()
        .setCustomId("createRole")
        .setDefault(false))
    );
}

export function createReporterNotificationModal(reports) {
  const options = [
    { label: "Handled only", value: "handled" },
    { label: "All reports", value: "all" }
  ];
  return new ModalBuilder()
    .setCustomId("reports:modal:reporterNotification")
    .setTitle("Reporter notification")
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("### Documentation\nChoose when the person who submitted the report receives an update."))
    .addLabelComponents(new LabelBuilder()
      .setLabel("Reporter notification")
      .setStringSelectMenuComponent(reportSelect("reporterNotification", reports.reporterNotification, options)));
}

export function createTrustedRoleModal(reports) {
  const role = new RoleSelectMenuBuilder()
    .setCustomId("role")
    .setMinValues(0)
    .setMaxValues(1);
  if (/^\d{17,20}$/.test(reports.trustedRoleId)) role.setDefaultRoles(reports.trustedRoleId);
  return new ModalBuilder()
    .setCustomId("reports:modal:trustedRole")
    .setTitle("Trusted role")
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("### Documentation\nMembers with this role are treated as trusted reporters."))
    .addLabelComponents(
      new LabelBuilder().setLabel("Trusted role").setRoleSelectMenuComponent(role),
      new LabelBuilder().setLabel("Create a role for me").setCheckboxComponent(new CheckboxBuilder()
        .setCustomId("createRole")
        .setDefault(false))
    );
}

export function createFalseReportModal(reports) {
  const thresholds = [
    { label: "Disabled", value: "disabled" },
    ...[3, 5, 6, 10].map((count) => ({ label: String(count), value: String(count) }))
  ];
  const windows = [7, 14, 30, 60, 90].map((days) => ({ label: `${days} days`, value: String(days) }));
  const actions = [
    { label: "Notify moderators", value: "notify" },
    { label: "Auto-block", value: "auto_block" },
    { label: "Auto-sanction", value: "auto_sanction" },
    { label: "Block and sanction", value: "block_and_sanction" }
  ];
  const sanctions = ["warn", "timeout", "mute", "kick", "ban"].map((sanction) => ({
    label: sanction[0].toUpperCase() + sanction.slice(1),
    value: sanction
  }));
  return new ModalBuilder()
    .setCustomId("reports:modal:falseReport")
    .setTitle("Reporter reputation")
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("### Documentation\nActs on members whose reports are often refused: choose the threshold, period and action."))
    .addLabelComponents(
      new LabelBuilder().setLabel("Threshold").setDescription("Number of rejected reports that triggers the action.")
        .setStringSelectMenuComponent(reportSelect("threshold", reports.falseReportThreshold, thresholds)),
      new LabelBuilder().setLabel("Window").setDescription("Period over which rejected reports are counted.")
        .setStringSelectMenuComponent(reportSelect("window", reports.falseReportWindow, windows)),
      new LabelBuilder().setLabel("Action").setDescription("What happens once the threshold is reached.")
        .setStringSelectMenuComponent(reportSelect("action", reports.falseReportAction, actions)),
      new LabelBuilder().setLabel("Sanction").setDescription("Sanction applied when the action includes one.")
        .setStringSelectMenuComponent(reportSelect("sanction", reports.falseReportSanction, sanctions))
    );
}
