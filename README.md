# Cozyy Setup Bot

A Discord.js bot that serves `/setup` as a Discord Components V2 container. Each setting is rendered as a V2 section with its own **Configure** button accessory. The category menu switches sections, and configuration modals save per-server values to `data/settings.json`.

This project includes the setup interface and persistence, bot-arrival kicking and role assignment, and configurable welcome messages. Raid detection, captcha verification, account-age enforcement, and other protection actions still need to be connected to their saved settings.

## Run

Requirements: Node.js 20 or newer and a Discord application/bot.

1. In the Discord Developer Portal, create an application and bot. Enable the privileged **Server Members Intent** and **Message Content Intent**. Invite the bot with the `bot` and `applications.commands` scopes.
2. Copy `.env.example` to `.env`, then set `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID` (use a test server ID for instant command registration).
3. Install dependencies and register `/setup`, `/afk`, `/report`, `/jail`, `/unjail`, `/timeout`, `/mute`, `/avatar`, `/cover`, and `/onduty`:

	```sh
	npm install
	npm run deploy:commands
	```

4. Start the bot:

	```sh
	npm start
	```

Global command registration can take time to appear. Set `GUILD_ID` to register the command in one server while developing. Keep `.env` private; never commit your bot token.

For bot-arrival settings, grant the bot **Kick Members** and **Manage Roles** permissions. Its highest role must be above the roles it assigns. When **Kick new bots** is enabled, every newly joined bot other than this bot itself is kicked, including previously authorized bots; Discord permissions and role hierarchy still apply.

For welcome messages, grant **View Channels**, **Send Messages**, and **Embed Links** in the configured channel. Enable **Server Members Intent** in the Discord Developer Portal. Image edit accepts HTTPS URLs, including Discord CDN attachments. Manage buttons supports up to five channel-link buttons with an optional emoji.

`/afk [reason]` and the configured-prefix form (for example, `!afk away for lunch`) set your AFK status per server. Your next message clears it. AFK confirmations, mention/reply notices, and welcome-back responses use Components V2 containers; mentions and replies to your messages show your reason and how long you have been AFK. Prefix commands require the privileged **Message Content Intent**.

In `/setup` > Utilities, select or create the Tag Role and On-duty role. Tag Role follows Discord primary-guild tag profile updates; existing members receive the role on their next profile update. `/onduty` (or the configured-prefix form) toggles your own On-duty role.

Configure the destination under `/setup` > Moderation > Reports > Receiving reports. `/report @member [details]` and the configured-prefix equivalent send a report to that channel. The bot needs **Send Messages** and **Embed Links** there.

For moderation commands, configure a Jail role in `/setup` under Moderation > Sanctions > Jail before using `/jail` or `/unjail`. Enable **Timeout / Mute commands** in the Sanctions panel before using `/timeout` or `/mute`. Jail commands require **Manage Roles**; Timeout/Mute commands require **Moderate Members**. Prefix versions use the prefix selected in `/setup` under General > Message commands, for example `!jail @member`, `!unjail @member`, `!timeout @member 10m reason`, and `!mute @member 2h reason`. Durations accept minutes (`10m`), hours (`2h`), or days (`1d`), up to 28 days. `/avatar` and `/cover` show your own media by default; both accept an optional user, and prefix forms such as `!avatar @member` and `!cover @member` use the configured General prefix too. Reply to a user's message with the prefix command (for example, `!avatar`) to target that user. Cover displays the user's Discord profile banner when one is available.