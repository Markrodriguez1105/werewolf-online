# Verification — 1 November 2026

## Automated checks

- `npm test`: 26 passing checks across engine, Socket.IO integration, client selectors, and one real timed six-client match.
- `npm run build`: TypeScript check and production Vite build pass.
- Engine checks include role deck validation, fixed night deadlines, unanimous/revisable wolf actions, simultaneous Seer/protection resolution, invalid/dead actors, one runoff, vote revisions, village victory, wolf parity victory, and private view isolation.
- Server checks include malformed payloads, unique names, session replacement, host transfer, lobby readiness, late-action rejection, active-match joining restrictions, disconnected seat recovery, match reset, room capacity, attempt limits, and LAN address discovery.
- The full-match test connects six independent Socket.IO clients, submits a protected attack and Seer check, waits for the actual night deadline, verifies private results, votes out the wolf, and returns to a fresh lobby.

## Browser verification

Headless Google Chrome 156, using six isolated mobile browser contexts at 390 × 844:

1. Create and join a room through the actual interface.
2. Open/dismiss the rules dialog with Escape; generate and inspect a QR share link.
3. Change settings, enable Guard, ready all players, and deal cards.
4. Reveal each player's own card and acknowledge it.
5. Submit Werewolf, Seer, and Guard selections through the target controls.
6. Refresh a nonhost phone during the night and rejoin its reserved seat.
7. Verify the protected player survives and the Seer alone receives the investigation result.
8. Advance discussion, cast votes, show village victory and all six roles.
9. Rematch, disconnect a player, and remove their lobby seat through host controls.
10. Confirm no browser JavaScript errors and no horizontal room overflow at 360, 390, 768, and 1440 pixels.

Home layouts were also measured at 360, 390, 768, 900, and 1440 pixels. A tablet card illustration overlap was found visually, corrected, and remeasured: at 768 pixels the right card ends at x=385 and the form starts at x=425. All measured home widths fit their viewports.

Design inspection at 390, 768, and 1440 pixels reports no failures with the reference's compact uppercase role lettering explicitly retained (`--allow micro-label`). The 30px two-line home heading is intentional: it introduces the game while keeping the create action within the phone's first screen. The operational room heading is smaller. Lint warnings for phase labels and zero-padded clock/seat numbers are retained because they carry actual game state and seat data.

The rendered home, role reveal, night actions, results, share dialog, and corrected tablet layout were visually inspected. Local screenshots are in the ignored `.taste-skill/*-inspection/` directories.

## Network and limits

- The production server binds to `0.0.0.0` and responds through both loopback and the detected LAN address.
- `/api/health` returned `{ "ok": true }` through `http://192.168.1.57:3000` on this host. That address can change with the network.
- No physical phone or separate Wi-Fi device was available for a hardware connection test. Browser emulation and host-to-LAN requests were verified.
- Safari/WebKit was not tested.
- Rooms are intentionally in memory. Restarting the server ends matches; browser refresh/reconnect preserves seats while the server remains running.
- Feature branches and their worktrees are retained. The release branch integrates all three agent-owned features; `main` contains the reviewed release.
