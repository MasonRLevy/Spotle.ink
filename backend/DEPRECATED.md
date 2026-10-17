# `backend/` is deprecated — do not add features here

Everything in this folder has been superseded by the unified server in
[`server/`](../server). It is kept only so nobody loses in-flight work;
**nothing in here runs as part of the game any more.**

## Where each piece went

| Old file | Replaced by |
|---|---|
| `main.py` (FastAPI websockets, 6-digit PIN rooms) | `server/src/index.ts` + `server/src/rooms.ts` |
| `game_manager.py` (START_ROUND / PLAYER_FOUND_ITEM / scoreboard) | `server/src/gameEngine.ts` |
| `server.js` (Express + Socket.io rooms, verify endpoint) | `server/src/index.ts` |
| `src/roomManager.js` | `server/src/rooms.ts` |
| `src/geminiReferee.js` (JS mirror of the referee) | `server/gemini-referee/` — the original, imported directly |
| `routers/`, `services/`, `config.py` | never imported by `main.py`; dead on arrival |

## Why it was merged

The three servers each had one third of the game and none of them could play
a full round:

- the Python server had the round loop but **no AI verification at all**,
- the Node server had rooms and the referee but **no round loop or scoring**,
- `server/gemini-referee/` had the referee and object pool but **was not a game server**.

Merging also removed the duplicated referee. `backend/src/geminiReferee.js`
existed only because a JS backend could not import the TypeScript referee —
the unified TypeScript server imports it directly, so that workaround is gone.

## To run the game

```bash
cd server && npm install && npm start     # unified server on :3001
cd frontend && npm install && npm run dev # UI on :5173
```

If you want something from this folder back, take the logic and port it into
`server/src/` rather than restarting a second backend process.
