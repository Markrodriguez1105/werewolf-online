# Werewolf

A mobile-first, local-network social deduction game. One computer hosts; everyone plays in a phone browser on the same Wi-Fi. The application is the moderator, so the host can play too.

## Run

Requires Node.js 22.12+ (or 24+) and npm.

```sh
npm install
npm run build
npm start
```

The terminal prints the computer's current LAN address and a scannable QR code for each detected network interface. Scan the terminal QR with your phone's camera to open the app. Both the Mac and phones must be on the same reachable Wi-Fi or hotspot. You can also enter the printed URL manually. Each person needs their own browser session/device.

Use that same network URL on the Mac when hosting. After creating a room, share its room QR code or room code with the other players. The terminal QR opens the app; the room QR opens that particular room.

Keep the terminal open while playing. Press **Ctrl+C** to stop the server. If you switch Wi-Fi networks or hotspots, stop and run `npm start` again to print the updated address and QR code.

1. Enter your name and create a room.
2. Share the room link or QR code. Players join with their own names.
3. Gather 6–16 players. Everyone marks themselves ready.
4. The host configures the deck and timers, then starts.
5. Privately reveal your card, hide it, and acknowledge it. Follow the phase instructions.

The computer must stay awake and the server must keep running. Internet access is required for the initial dependency installation, but the running game has no cloud, account, external font, or CDN dependency.

For development, `npm run dev` runs Vite and the multiplayer server together on port 3000 with live client updates. Server source changes require restarting the command. Set `PORT=3001 npm start` to choose another port. Press Ctrl+C to stop.

## Local network troubleshooting

- On a phone, `localhost` means the phone. Use the host computer's LAN IP instead.
- Use the same reachable Wi-Fi/LAN. Guest networks, AP/client isolation, or some hotspots prevent devices from talking to one another.
- Allow Node.js/incoming connections through the host firewall if prompted. You do not need router port forwarding.
- If the computer has several network interfaces, choose the address reachable from the phones. The room share dialog offers detected addresses.
- If the address changes, reopen the new address on each phone. Player sessions are browser/origin specific.
- This version uses HTTP on the LAN. It does not require installing a PWA or enabling camera permissions to play. Scan the QR with the phone's normal camera app.

## Rules

See [the complete house rules](docs/RULES.md). This is classic Werewolf with repeated nights, discussion, votes, and elimination. It is not One Night Ultimate Werewolf and does not claim compatibility with every commercial edition.

Choose a mode in the lobby:

| Mode | What changes |
| --- | --- |
| Classic | Original Seer, Werewolves, Villagers, and optional Guard |
| No Seer | Witch and Drunk replace the Seer and one Villager; the Witch gets one heal and one kill per game |
| The Infected Village | Classic deck; wolves may once secretly convert an unprotected ordinary Villager instead of attacking |
| The Secret Pact | Classic deck; two random players know each other's names and share each other's fate, while keeping their teams |

The app displays moderator narration while the host participates. Infected players receive a private role-change announcement; pact partners receive only their partner's name, not their role.

Eight-player Classic starter deck: **2 Werewolves, 1 Seer, 5 Villagers**. No Seer uses **2 Werewolves, 1 Witch, 1 Drunk, 4 Villagers**. An optional Guard replaces a Villager. Suggested wolf counts are 1 for 6–7 players, 2 for 8–11, and 3 for 12–16; the host may adjust the deck before starting.

Discuss aloud in the room. Eliminated players watch silently. The app manages private actions, timed phases, votes, role reveals, and victory checks. No voice chat or online matchmaking is needed.

## State and privacy

- Active rooms live in the server's memory. **Restarting the server ends all matches.**
- Refreshes and brief disconnects can resume using the random player token saved in that browser's local storage. Use the same browser and address. Do not clear site data during a match.
- A room code or QR link grants access to the lobby, not another player's identity. Reconnect tokens are never placed in share links or public room state.
- The server validates actions and sends each player an individual view. Living roles, Seer results, and wolf coordination are filtered on the server.
- If the host disconnects, a connected player becomes host. The host has no special access to hidden roles.
- In the lobby, the host can remove disconnected seats. If a match gets stuck, the host can end it and return the group to the lobby. Resetting or starting a rematch removes disconnected seats.
- During a match, a disconnected player's seat remains reserved. Missing votes/actions expire at the deadline. Players cannot join a match already in progress.

## Development and verification

```sh
npm test
npm run check
npm run build
```

React and TypeScript provide the interface; Express and Socket.IO share one HTTP server and port. The game engine is independent of the UI and network layer.

Features were developed by separate agents in separate branches and Git worktrees:

| Branch | Feature |
| --- | --- |
| `feature/game-engine` | Phase machine, roles, action resolution, voting, victory, private views |
| `feature/rooms-networking` | Rooms, sessions, validation, reconnect, host transfer, LAN server |
| `feature/mobile-ui` | Reference-inspired role cards and complete mobile player interface |
| `feature/lan-release` | Integration, verification, local-network documentation |
| `feature/terminal-qr` | Current network URL and scannable QR codes at terminal startup |
| `feature/game-modes-engine` | Witch potions, infection, Secret Pact and mode rules |
| `feature/game-modes-network` | Mode and action validation, private multiplayer payloads |
| `feature/game-modes-ui` | Mode picker, new role cards, private instructions and moderator narration |

Card styling follows the supplied design reference: white faces, thin borders, angular copper line art, compact role titles, and black backs. Role illustrations are original SVG artwork included in the application.
