require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const QRCode = require('qrcode');
const { execFile } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');

const execFilePromise = util.promisify(execFile);

// Environment Variables with Sensible Defaults for Open Source Community
const WG_HELPER_PATH = process.env.WG_HELPER_PATH || '/usr/local/bin/wg-bot-helper.sh';
const WG_CONFIG_DIR = process.env.WG_CONFIG_DIR || '/home/ubuntu';
const WG_INTERFACE = process.env.WG_INTERFACE || 'wg0';
const MOCK_ENDPOINT = process.env.MOCK_ENDPOINT || '127.0.0.1:51820';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder()
        .setName('vpn')
        .setDescription('Manage WireGuard VPN Server')
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a new VPN client and get QR code')
                .addStringOption(opt => opt.setName('name').setDescription('Client name (only letters, numbers, - and _)').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('revoke')
                .setDescription('Revoke an existing VPN client')
                .addStringOption(opt => opt.setName('name').setDescription('Client name to revoke').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List active WireGuard peers')
        )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_SERVER_ID),
            { body: commands }
        );
        console.log('Slash commands registered successfully!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
})();

client.once('clientReady', () => {
    console.log(`Bot logged in as ${client.user.tag} (MOCK_MODE: ${process.env.MOCK_MODE})`);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.user.id !== process.env.DISCORD_MASTER_ID) {
        return interaction.reply({
            content: 'Unauthorized: You do not have permission to use this bot.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (interaction.commandName === 'vpn') {
        const subcommand = interaction.options.getSubcommand();
        const clientName = interaction.options.getString('name');

        if (clientName && !/^[a-zA-Z0-9_-]+$/.test(clientName)) {
            return interaction.reply({
                content: 'Invalid client name! Only letters, numbers, `_` and `-` are allowed.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            if (subcommand === 'add') {
                let configContent = '';

                if (process.env.MOCK_MODE === 'true') {
                    configContent = `[Interface]\nPrivateKey = MOCK_PRIVATE_KEY_${clientName}\nAddress = 10.66.66.2/32\nDNS = 1.1.1.1\n\n[Peer]\nPublicKey = MOCK_SERVER_PUBLIC_KEY\nEndpoint = ${MOCK_ENDPOINT}\nAllowedIPs = 0.0.0.0/0`;
                } else {
                    await execFilePromise('sudo', [WG_HELPER_PATH, 'add', clientName, WG_CONFIG_DIR, WG_INTERFACE]);
                    const confFilePath = path.join(WG_CONFIG_DIR, `${WG_INTERFACE}-client-${clientName}.conf`);
                    configContent = await fs.readFile(confFilePath, 'utf8');
                }

                const qrBuffer = await QRCode.toBuffer(configContent, { type: 'png', width: 300, margin: 2 });
                const qrAttachment = new AttachmentBuilder(qrBuffer, { name: `${clientName}-qr.png` });
                const confAttachment = new AttachmentBuilder(Buffer.from(configContent, 'utf-8'), { name: `${clientName}.conf` });

                await interaction.editReply({
                    content: `✅ Client **${clientName}** created successfully! Scan the QR code below:`,
                    files: [qrAttachment, confAttachment]
                });

            } else if (subcommand === 'revoke') {
                if (process.env.MOCK_MODE === 'true') {
                    await interaction.editReply(`[MOCK] Client **${clientName}** has been revoked.`);
                } else {
                    await execFilePromise('sudo', [WG_HELPER_PATH, 'revoke', clientName, WG_CONFIG_DIR, WG_INTERFACE]);
                    await interaction.editReply(`🗑️ Client **${clientName}** has been revoked successfully!`);
                }

            } else if (subcommand === 'list') {
                if (process.env.MOCK_MODE === 'true') {
                    await interaction.editReply('```\n[MOCK] interface: wg0\n  👤 Client: mock_user_1\n  👤 Client: mock_user_2\n```');
                } else {
                    const { stdout } = await execFilePromise('sudo', [WG_HELPER_PATH, 'list', '', WG_CONFIG_DIR, WG_INTERFACE]);
                    await interaction.editReply(`\`\`\`\n${stdout || 'No active peers'}\n\`\`\``);
                }
            }
        } catch (err) {
            console.error(err);
            await interaction.editReply(`❌ Error: \`${err.stderr || err.message}\``);
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);

if (process.env.MOCK_MODE !== 'true') {
    console.log = function() {}; // Disable standard console.log
    console.error = function() {}; // Disable standard console.error (or keep for critical errors)
}