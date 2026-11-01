#!/bin/bash
set -e

ACTION=$1
CLIENT_NAME=$2
OUTPUT_DIR=${3:-"/home/ubuntu"}
WG_NIC=${4:-"wg0"}

WG_CONF="/etc/wireguard/${WG_NIC}.conf"
WG_PARAMS="/etc/wireguard/params"

if [ "$ACTION" == "list" ]; then
    awk '
    FNR==NR {
        if ($1 == "###" && $2 == "Client") { client = $3 }
        else if ($1 == "PublicKey" && client != "") { map[$3] = client; client = "" }
        next
    }
    /^peer:/ {
        pub = $2
        name = (pub in map) ? map[pub] : "Unknown"
        print "👤 Client: " name " (" pub ")"
        next
    }
    { print }
    ' "$WG_CONF" <(wg show "$WG_NIC")

elif [ "$ACTION" == "add" ]; then
    source "$WG_PARAMS"
    
    if grep -q "^### Client ${CLIENT_NAME}\$" "$WG_CONF"; then
        echo "Client already exists!" >&2
        exit 1
    fi

    for DOT_IP in {2..254}; do
        if ! grep -q "${SERVER_WG_IPV4::-1}${DOT_IP}/32" "$WG_CONF"; then
            break
        fi
    done

    CLIENT_WG_IPV4="${SERVER_WG_IPV4::-1}${DOT_IP}"
    CLIENT_WG_IPV6="${SERVER_WG_IPV6::-1}${DOT_IP}"

    CLIENT_PRIV_KEY=$(wg genkey)
    CLIENT_PUB_KEY=$(echo "$CLIENT_PRIV_KEY" | wg pubkey)
    CLIENT_PRE_SHARED_KEY=$(wg genpsk)

    ENDPOINT="${SERVER_PUB_IP}:${SERVER_PORT}"
    if [[ "$SERVER_PUB_IP" =~ : ]]; then
        ENDPOINT="[${SERVER_PUB_IP}]:${SERVER_PORT}"
    fi

    CONF_FILE="${OUTPUT_DIR}/${WG_NIC}-client-${CLIENT_NAME}.conf"

    cat <<EOF > "$CONF_FILE"
[Interface]
PrivateKey = ${CLIENT_PRIV_KEY}
Address = ${CLIENT_WG_IPV4}/32,${CLIENT_WG_IPV6}/128
DNS = ${CLIENT_DNS_1},${CLIENT_DNS_2}

[Peer]
PublicKey = ${SERVER_PUB_KEY}
PresharedKey = ${CLIENT_PRE_SHARED_KEY}
Endpoint = ${ENDPOINT}
AllowedIPs = ${ALLOWED_IPS}
EOF

    # Jis user ne sudo chalaya hai (e.g., ubuntu, ec2-user), file ki ownership usko de do
    if [ -n "$SUDO_USER" ]; then
        chown "$SUDO_USER:$SUDO_USER" "$CONF_FILE"
    fi
    chmod 600 "$CONF_FILE"

    cat <<EOF >> "$WG_CONF"

### Client ${CLIENT_NAME}
[Peer]
PublicKey = ${CLIENT_PUB_KEY}
PresharedKey = ${CLIENT_PRE_SHARED_KEY}
AllowedIPs = ${CLIENT_WG_IPV4}/32,${CLIENT_WG_IPV6}/128
EOF

    wg syncconf "${WG_NIC}" <(wg-quick strip "${WG_NIC}")

elif [ "$ACTION" == "revoke" ]; then
    if ! grep -q "^### Client ${CLIENT_NAME}\$" "$WG_CONF"; then
        echo "Client not found!" >&2
        exit 1
    fi

    sed -i "/^### Client ${CLIENT_NAME}\$/,/^$/d" "$WG_CONF"
    rm -f "${OUTPUT_DIR}/${WG_NIC}-client-${CLIENT_NAME}.conf"

    wg syncconf "${WG_NIC}" <(wg-quick strip "${WG_NIC}")
fi