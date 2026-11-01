import { EmbedBuilder, SlashCommandBuilder } from "discord.js";

export const mediaCommands = ["avatar", "cover"].map((name) => new SlashCommandBuilder()
  .setName(name)
  .setDescription(name === "avatar" ? "Show a user's avatar" : "Show a user's profile banner")
  .addUserOption((option) => option.setName("user").setDescription("User to show (defaults to you)"))
  .toJSON());

export async function resolveMediaUserId(message, targetToken = "") {
  const mentionedId = /^<@!?(\d{17,20})>$/.exec(targetToken)?.[1];
  if (mentionedId) return mentionedId;
  if (/^\d{17,20}$/.test(targetToken)) return targetToken;

  if (message.reference?.messageId) {
    const referencedMessage = await message.fetchReference().catch(() => null);
    if (referencedMessage?.author?.id) return referencedMessage.author.id;
  }
  return message.author.id;
}

export async function createMediaResponse(client, userId, type) {
  const user = await client.users.fetch(userId, { force: true });
  const isAvatar = type === "avatar";
  const imageUrl = isAvatar
    ? user.displayAvatarURL({ size: 1024 })
    : user.bannerURL({ size: 1024 });

  if (!imageUrl) return { content: `${user.username} does not have a profile banner.` };

  const title = `${user.username}'s ${isAvatar ? "avatar" : "profile banner"}`;
  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setTitle(title)
    .setURL(imageUrl)
    .setImage(imageUrl);
  return { embeds: [embed] };
}
