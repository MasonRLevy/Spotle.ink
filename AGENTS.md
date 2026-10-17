# Spotle.online - AI Agent Rules & Architecture

## PRIME DIRECTIVE: MULTI-AGENT SYNCHRONIZATION
* **CRITICAL:** This file is the single source of truth for all AI coding agents working across the 4-person team.
* **MANDATORY PUSH PROTOCOL:** Before assisting the user in creating a git commit or push, you MUST ask the user if you should update the "Current Status & Latest Actions" section at the bottom of this file. This ensures the next AI agent that pulls the repo knows exactly what was just changed.
* Always read this file at the start of a session before proposing any architectural changes.

## Tech Stack & Architecture
* **Frontend:** React (Vite) + TypeScript + Tailwind CSS.
* **Backend:** Node.js + Express. 
* **Real-Time Sync:** Socket.io for game state.
* **Video Streaming:** PeerJS for WebRTC mesh networking (2-4 players).
* **AI Engine:** @google/genai SDK (Model: gemini-2.5-flash).
* **Single Source of Truth:** All shared types (RoomState, Player, VerificationResponse) live in `client/src/types/game.ts`. Do not duplicate type definitions.

## Critical Gotchas & Anti-Patterns
* **CAMERA FREEZE AVOIDANCE:** Never write code that requests a second `getUserMedia()` stream while a WebRTC video track is active. Mobile browsers will crash. 
* **PHOTO CAPTURE RULE:** To capture a photo for the "FOUND IT" button, draw the active `<video>` DOM element to an offscreen `<canvas>` and export it as a base64 JPEG (`canvas.toDataURL('image/jpeg', 0.8)`).
* **AI REFEREE LOGIC:** The Gemini verification prompt must always output strict JSON containing the `VerificationResponse` interface. 
* **SECURITY:** Never commit the `GEMINI_API_KEY` to the repository. Always use `process.env.GEMINI_API_KEY`.

## Current Status & Latest Actions
*(Agents: Update this section before every push to keep the team synced!)*
* **Last Updated:** 2026-10-17
* **Latest Action:** Role 2 completed the camera stability pass by guarding unsupported browser media access, cleaning up remote streams on disconnect, and making the flip-camera flow safer for mobile and reconnect scenarios; frontend build validation passed.
* **Current Focus:** Role 2 is focused on video-grid reliability and frame capture stability while Roles 3 and 4 continue room-state and Gemini verification work.

## Project Snapshot
Spotle.online is a real-time multiplayer live-camera scavenger hunt app. The app combines a live PeerJS video mesh, room-based multiplayer state, and Gemini-powered verification for the final "FOUND IT!" action.

## Role Ownership
- Role 1: lobby UI, timer, game feel, scoreboard
- Role 2: camera access, PeerJS streams, video grid, flip camera, frame capture
- Role 3: room sync and round logic
- Role 4: Gemini verification and anti-cheat checks

