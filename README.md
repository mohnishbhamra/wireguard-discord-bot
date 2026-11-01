# 🛡️ WireGuard Discord Bot Manager

A lightweight, self-hosted Discord bot built with Node.js to manage your WireGuard VPN server directly from Discord using Slash Commands. 

Designed specifically to work seamlessly alongside popular WireGuard setup scripts (like [`angristan/wireguard-install`](https://github.com/angristan/wireguard-install)) on cloud instances such as **Oracle Cloud (OCI)**, **AWS EC2**, **DigitalOcean**, or **Linode**.

---

## ✨ Features

* **⚡ Instant Client Creation (`/vpn add`):** Generates cryptographic keys, assigns the next available IPv4/IPv6 address, live-reloads WireGuard (`wg syncconf`) with **zero downtime**, and sends the **QR Code** + `.conf` file directly to Discord.
* **🗑️ One-Click Revocation (`/vpn revoke`):** Removes the peer from `/etc/wireguard/wg0.conf`, deletes the client config, and live-updates the WireGuard interface.
* **📋 Human-Readable Peer List (`/vpn list`):** Maps cryptographic Public Keys from `wg show` to human-readable client names (`👤 Client: <name>`) parsed from your WireGuard config.
* **🔒 Ephemeral & Locked Down:** 
  * Hardcoded `DISCORD_MASTER_ID` validation ensures **only you** can run commands.
  * All responses (including QR codes and `.conf` files) use Discord's **Ephemeral Messages** (`Only you can see this`), leaving zero sensitive traces in chat history.
* **💻 Local Windows/Mac Development Mode (`MOCK_MODE`):** Test Discord slash commands and in-memory QR code generation locally on Windows/macOS before deploying to your Linux server.

---

## 🏗️ Architecture

```text
+-------------------+       Slash Command (/vpn add)       +-----------------------+
|   Discord Client  | -----------------------------------> |  Node.js Discord Bot  |
| (Mobile / Desktop)| <----------------------------------- |      (PM2 Daemon)     |
+-------------------+   Ephemeral Reply (QR PNG + .conf)   +-----------+-----------+
                                                                       |
                                                          sudo execFile| (Strict Regex Validated)
                                                                       v
                                                           +-----------------------+
                                                           |   wg-bot-helper.sh    |
                                                           +-----------+-----------+
                                                                       |
                                                 +---------------------+---------------------+
                                                 |                                           |
                                                 v                                           v
                                    +-------------------------+                 +-------------------------+
                                    | /etc/wireguard/wg0.conf |                 |   Linux Kernel (wg0)    |
                                    |  & Client .conf Files   |                 | Live Reload: wg syncconf|
                                    +-------------------------+                 +-------------------------+
```

---

## 📋 Prerequisites

1. **A Linux Server (Ubuntu/Debian/etc.)** with WireGuard already installed and running via [`angristan/wireguard-install`](https://github.com/angristan/wireguard-install) (uses `/etc/wireguard/params` and `/etc/wireguard/wg0.conf`).
2. **Node.js (v18+)** and **npm** installed.
3. **A Discord Account** and a private Discord Server.

---

## 🤖 Step 1: Create Your Private Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. **Get Client ID:** Under **General Information**, copy the **Application ID** (this is your `DISCORD_CLIENT_ID`).
3. **Disable Default Install Link:**
   * Go to the **Installation** tab on the left sidebar[cite: 1].
   * Under **Install Link**, change the dropdown from `Discord Provided Link` to **None** and click **Save Changes**[cite: 1].
4. **Configure Bot & Get Token:**
   * Go to the **Bot** tab on the left sidebar[cite: 1].
   * Turn **OFF** the **Public Bot** toggle (so no one else can invite your bot) and click **Save Changes**.
   * Click **Reset Token** and copy your bot token (this is your `DISCORD_BOT_TOKEN`).
5. **Invite Bot to Your Private Server:**
   * Go to **OAuth2** -> **URL Generator**.
   * Under **Scopes**, check `bot` and `applications.commands`.
   * Under **Bot Permissions**, check `Send Messages`, `Attach Files`, and `Use Slash Commands`.
   * Copy the **Generated URL** at the bottom, paste it into your browser, and add the bot to your private Discord server.
6. **Get Your User ID & Server ID:**
   * In the Discord app, go to **User Settings** -> **Advanced** -> Turn ON **Developer Mode**.
   * Right-click your profile picture/username -> **Copy User ID** (`DISCORD_MASTER_ID`).
   * Right-click your private server icon -> **Copy Server ID** (`DISCORD_SERVER_ID`).

---

## 🚀 Step 2: Installation & Setup

### A. Local Testing (Windows / macOS)

1. Clone the repository and install dependencies:
   ```bash
   git clone [https://github.com/mohnishbhamra/wireguard-discord-bot.git](https://github.com/mohnishbhamra/wireguard-discord-bot.git)
   cd wireguard-discord-bot
   npm install
   ```
2. Copy `.env.sample` to `.env`:
   ```bash
   cp .env.sample .env
   ```
3. Fill in your Discord credentials in `.env` and keep `MOCK_MODE=true`.
4. Run the bot:
   ```bash
   node index.js
   ```

---

### B. Production Deployment (Linux / OCI / AWS)

1. SSH into your WireGuard server and clone the repository:
   ```bash
   git clone [https://github.com/mohnishbhamra/wireguard-discord-bot.git](https://github.com/mohnishbhamra/wireguard-discord-bot.git)
   cd wireguard-discord-bot
   npm install
   ```
2. Strip any Windows CRLF line endings from the bash helper script and make it executable:
   ```bash
   sed -i 's/\r$//' wg-bot-helper.sh && chmod +x wg-bot-helper.sh
   ```
3. Create your `.env` file from the sample:
   ```bash
   cp .env.sample .env
   nano .env
   ```
4. Update the `.env` variables for production (set `MOCK_MODE=false` and verify paths using `pwd`):
   ```env
   DISCORD_MASTER_ID=123456789012345678
   DISCORD_BOT_TOKEN=your_token_here
   DISCORD_CLIENT_ID=123456789012345678
   DISCORD_SERVER_ID=123456789012345678

   MOCK_MODE=false
   MOCK_ENDPOINT=127.0.0.1:51820

   WG_HELPER_PATH=/home/ubuntu/wireguard-discord-bot/wg-bot-helper.sh
   WG_CONFIG_DIR=/home/ubuntu
   WG_INTERFACE=wg0
   ```
5. *(Optional - Sudoers Configuration)*: Cloud instances like OCI (`ubuntu` user) have passwordless `sudo` enabled by default. If your Linux user requires a password for `sudo`, grant passwordless execution specifically for the helper script:
   ```bash
   echo "$USER ALL=(ALL) NOPASSWD: $(pwd)/wg-bot-helper.sh" | sudo tee /etc/sudoers.d/wireguard-bot
   sudo chmod 0440 /etc/sudoers.d/wireguard-bot
   ```

---

## 🔄 Step 3: Run 24/7 in Background with PM2

Install PM2 globally and configure the bot to start automatically on server reboots:

```bash
sudo npm install -g pm2
pm2 start index.js --name "wg-vpn-bot"
pm2 save
pm2 startup
```
*(Copy and run the `sudo env PATH=...` command output by `pm2 startup` to finalize boot persistence).*

**Useful PM2 Commands:**
* View live logs: `pm2 logs wg-vpn-bot`
* Restart bot: `pm2 restart wg-vpn-bot`
* Check status: `pm2 status`

---

## 💬 Usage (Discord Slash Commands)

| Command | Description |
| :--- | :--- |
| `/vpn add name:<client_name>` | Creates a new WireGuard peer and replies with an ephemeral QR code + `.conf` attachment. |
| `/vpn revoke name:<client_name>` | Revokes the specified client's access and removes their configuration file. |
| `/vpn list` | Displays active WireGuard peers mapped to their human-readable client names, transfer stats, and latest handshakes. |

---

## 🛡️ Security Best Practices

* **Never commit `.env`:** Ensure `.env` is listed in your `.gitignore`.
* **Strict Input Sanitization:** Client names are validated against `/^[a-zA-Z0-9_-]+$/` and passed via `child_process.execFile` (without spawning a shell) to prevent command injection.
* **Principle of Least Privilege:** Do not run the Node.js process as `root`; run it under a standard user (`ubuntu`) with scoped `sudo` execution for `wg-bot-helper.sh`.

---

## 📄 License

MIT License — Feel free to fork, modify, and use this for your personal infrastructure!