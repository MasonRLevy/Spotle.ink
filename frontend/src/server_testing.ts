interface RoomState {
    host_name: string;
    players: string[];
}

// Point directly to your FastAPI backend server
const BACKEND_URL = "http://127.0.0.1:8000";
const WS_BACKEND_URL = "ws://127.0.0.1:8000";

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
    if (pinEl) pinEl.innerText = pin;

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
        } else if (pin !== "None") {
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
    const btnHost = document.getElementById("btn-host");
    const btnJoin = document.getElementById("btn-join");

    // 1. Host Game Click Handler
    btnHost?.addEventListener("click", async () => {
        myName = usernameInput?.value || "Player1";
        log(`[SYSTEM]: Requesting room creation as host (${myName})...`);

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
        }
    });

    // 2. Join Game Click Handler
    btnJoin?.addEventListener("click", () => {
        myName = usernameInput?.value || "Player1";
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
        log(`[WS ERROR]: ${JSON.stringify(err)}`);
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