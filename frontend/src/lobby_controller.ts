interface RoomState {
    host_name: string;
    players: string[];
}

// Safely resolve the backend IP with a debug check
// Safely resolve the backend configuration
const customIp = import.meta.env.VITE_BACKEND_IP;
const hostIp = customIp || window.location.hostname;

console.log("[CONFIG DEBUG] VITE_BACKEND_IP:", customIp);
console.log("[CONFIG DEBUG] Resolved hostIp for connections:", hostIp);

// Check if we are using a public ngrok tunnel or secure HTTPS connection
const isSecure = hostIp.includes("ngrok") || window.location.protocol === "https:";
const protocolHttp = isSecure ? "https" : "http";
const protocolWs = isSecure ? "wss" : "ws";

// If using ngrok, omit the port because ngrok tunnels standard traffic directly
const portString = hostIp.includes("ngrok") ? "" : ":8000";

const BACKEND_URL = `${protocolHttp}://${hostIp}${portString}`;
const WS_BACKEND_URL = `${protocolWs}://${hostIp}${portString}`;

console.log("[CONFIG DEBUG] BACKEND_URL:", BACKEND_URL);
console.log("[CONFIG DEBUG] WS_BACKEND_URL:", WS_BACKEND_URL);

let ws: WebSocket | null = null;
let currentPin: string = "";
let isHost: boolean = false;
let myName: string = "Player1";

function log(msg: string) {
    const logEl = document.getElementById("log");
    if (logEl) {
        logEl.innerText += `\n${msg}`;
        logEl.scrollTop = logEl.scrollHeight;
    }
    console.log(msg);
}

function updateUIState(pin: string, state?: RoomState) {
    const pinEl = document.getElementById("current-pin");
    if (pinEl) pinEl.innerText = pin !== "" ? pin : "None";

    const listEl = document.getElementById("player-list");
    if (listEl) {
        listEl.innerHTML = "";
        if (state) {
            const allPlayers = [`${state.host_name} (Host)`, ...state.players];
            allPlayers.forEach(p => {
                const li = document.createElement("li");
                li.innerText = p;
                listEl.appendChild(li);
            });
        } else if (pin && pin !== "None") {
            const li = document.createElement("li");
            li.innerText = myName + (isHost ? " (Host)" : " (Player)");
            listEl.appendChild(li);
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    log("[SYSTEM]: Frontend testing script initialized.");

    const usernameInput = document.getElementById("username") as HTMLInputElement;
    const pinInput = document.getElementById("pin-input") as HTMLInputElement;
    const btnHost = document.getElementById("btn-host") as HTMLButtonElement;
    const btnJoin = document.getElementById("btn-join") as HTMLButtonElement;

    // 1. Host Game Click Handler
    btnHost?.addEventListener("click", async () => {
        myName = usernameInput?.value.trim() || "Player1";
        log(`[SYSTEM]: Requesting room creation as host (${myName})...`);

        // Disable button to prevent double-clicks/spam
        if (btnHost) btnHost.disabled = true;

        try {
            const res = await fetch(`${BACKEND_URL}/api/create-room`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ host_name: myName })
            });

            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

            const data = await res.json();
            currentPin = data.pin;
            isHost = true;

            log(`[SUCCESS]: Room created with PIN: ${currentPin}`);
            updateUIState(currentPin);

            // Connect Host WebSocket
            const wsUrl = `${WS_BACKEND_URL}/ws/host/${currentPin}/${encodeURIComponent(myName)}`;
            connectWebSocket(wsUrl);

        } catch (err) {
            log(`[ERROR]: Failed to host game -> ${err}`);
            cleanup();
        } finally {
            if (btnHost) btnHost.disabled = false;
        }
    });

    // 2. Join Game Click Handler
    btnJoin?.addEventListener("click", () => {
        myName = usernameInput?.value.trim() || "Player1";
        const pinVal = pinInput?.value.trim();

        if (!pinVal || pinVal.length !== 6) {
            alert("Please enter a valid 6-digit PIN.");
            return;
        }

        currentPin = pinVal;
        isHost = false;

        log(`[SYSTEM]: Joining room ${currentPin} as ${myName}...`);
        updateUIState(currentPin);

        // Connect Player WebSocket
        const wsUrl = `${WS_BACKEND_URL}/ws/join/${currentPin}/${encodeURIComponent(myName)}`;
        connectWebSocket(wsUrl);
    });
});

function connectWebSocket(url: string) {
    if (ws) {
        ws.close();
    }

    ws = new WebSocket(url);

    ws.onopen = () => {
        log("[WS]: Connected to server successfully.");
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            log(`[WS RECV]: ${event.data}`);

            if (msg.type === "PLAYER_LIST_UPDATE") {
                updateUIState(currentPin, msg.state);
            } else if (msg.type === "ROOM_CLOSED" || msg.type === "ERROR") {
                alert(msg.message || "Room error occurred.");
                cleanup();
            }
        } catch (e) {
            log(`[WS RECV RAW]: ${event.data}`);
        }
    };

    ws.onclose = () => {
        log("[WS]: Connection closed.");
    };

    ws.onerror = (err) => {
        log(`[WS ERROR]: Connection failed or dropped.`);
        console.error(err);
        // If connection fails right away, cleanup state so user isn't stuck in limbo
        if (!ws || ws.readyState === WebSocket.CLOSED) {
            cleanup();
        }
    };
}

function cleanup() {
    if (ws) {
        ws.close();
        ws = null;
    }
    currentPin = "";
    isHost = false;
    updateUIState("None");
}