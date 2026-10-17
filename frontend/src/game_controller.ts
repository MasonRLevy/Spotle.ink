/**
 * gameActions.ts
 * Strictly houses all client-to-server WebSocket messaging functions for gameplay.
 */

/**
 * Sends a signal to the backend that the host wants to start a hunt round.
 */
export function sendStartRound(ws: WebSocket | null) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "START_ROUND" }));
        console.log("[WS SEND]: START_ROUND");
    } else {
        console.warn("[WS SEND ERROR]: WebSocket is not connected.");
    }
}

/**
 * Sends a signal to the backend when a player clicks "FOUND IT!".
 */
export function sendPlayerFoundItem(ws: WebSocket | null) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "PLAYER_FOUND_ITEM" }));
        console.log("[WS SEND]: PLAYER_FOUND_ITEM");
    } else {
        console.warn("[WS SEND ERROR]: WebSocket is not connected.");
    }
}