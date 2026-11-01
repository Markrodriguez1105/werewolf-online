# Verification — 1 November 2026

## Automated checks

- `npm test`: 52 passing checks across engine, Socket.IO integration, client selectors, terminal QR startup, game modes, and one real timed six-client match.
- `npm run build`: TypeScript check and production Vite build pass.
- Engine checks include role deck validation, fixed night deadlines, unanimous/revisable wolf actions, simultaneous Seer/protection resolution, invalid/dead actors, one runoff, vote revisions, village victory, wolf parity victory, and private view isolation.
- Server checks include malformed payloads, unique names, session replacement, host transfer, lobby readiness, late-action rejection, active-match joining restrictions, disconnected seat recovery, match reset, room capacity, attempt limits, and LAN address discovery.
- The full-match test connects six independent Socket.IO clients, submits a protected attack and Seer check, waits for the actual night deadline, verifies private results, votes out the wolf, and returns to a fresh lobby.
- The terminal startup test launches the real entry point on an assigned port, checks its health endpoint, and verifies that each terminal QR encodes the advertised LAN URL and actual port.

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

## Four-mode verification

The mode picker exposes Classic, No Seer, The Infected Village, and The Secret Pact. Shared role-deck tests verify that No Seer replaces the Seer and one Villager with Witch and Drunk, while the other modes use the Classic deck. Added engine and socket tests cover potion permissions and consumption, stage deadlines, simultaneous deaths, infection eligibility/protection/unanimity, conversion privacy, Seer results after conversion, independently selected pact partners, and linked deaths before victory. Client tests ensure private role data cannot change public moderator narration.

Six isolated phone-sized Chrome sessions exercised the new interface on a temporary server:

- No Seer: no Seer card dealt; Drunk has no night action; a Witch attacked by the wolf heals herself and poisons the last wolf; village victory follows both effects.
- Infected Village: one ordinary Villager privately changes to Werewolf without a death; other phones do not receive the conversion notice; a same-night Seer check reports the new wolf status; the converted identity survives a browser refresh.
- Secret Pact: exactly two players receive partner notices without role disclosure; one wolf attack eliminates both partners; a cross-team pact resolves both deaths before awarding village victory.
- Room layouts fit 360, 390, 768, and 1440 pixels without horizontal overflow. No browser JavaScript errors were recorded. The new Drunk card, potion form, mode selector, conversion notice, partner notice, and linked-death result were visually inspected.

The expanded home passes the layout inspector with zero failures. Its secondary six-role gallery extends below the desktop fold so the create/join form remains prominent. The inspector's chart-color warning refers to illustrative SVG role drawings; the page contains no data chart. The retained 30px home heading remains intentional. Keyboard access to the skip link was verified after tightening its hidden styling to prevent an overlay in full-page screenshots.

The test server used port 3100, separately from the user's manually started server on port 3000. It is stopped after QA. An already-running server needs a manual restart to load the new engine and mode settings.

## Network and limits

- The production server binds to `0.0.0.0` and responds through both loopback and the detected LAN address.
- `/api/health` returned `{ "ok": true }` through `http://192.168.1.57:3000` on this host. That address can change with the network.
- The user subsequently confirmed the game loads on a physical phone when the Mac connects to its hotspot. Access through the original PLDT Wi-Fi remains unresolved.
- Safari/WebKit was not tested.
- Rooms are intentionally in memory. Restarting the server ends matches; browser refresh/reconnect preserves seats while the server remains running.
- Feature branches and their worktrees are retained. The release branch integrates all three agent-owned features; `main` contains the reviewed release.
