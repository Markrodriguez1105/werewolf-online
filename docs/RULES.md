# Werewolf — application rules

This application uses a deliberately small classic Werewolf ruleset. The general hidden-role, night-action, discussion, and voting structure is described in [Bézier Games' Ultimate Werewolf overview](https://beziergames.com/products/ultimate-werewolf). The detailed timing, Guard, voting, and parity rules below are the application's chosen house rules. [One Night Ultimate Werewolf](https://beziergames.com/products/one-night-ultimate-werewolf) is a different game.

## Setup

Gather 6–16 players with a device/browser session each. One player creates the room and becomes host. Join before the game starts; late joining is unavailable. The application moderates, so the host participates normally and cannot see other players' hidden roles.

The host chooses the number of Werewolves, whether to include a Guard, and night/discussion/vote timers. A Seer is always included. Remaining players are Villagers. All roles except Werewolves belong to the village team. Settings must leave more village players than wolves. Everyone must be connected and ready before starting.

Each player privately reveals their assigned card and acknowledges it. Roles stay fixed throughout the match. Wolves know their teammates. The village knows the deck composition but not which living player has which role.

## Night

The first phase after card acknowledgments is Night 1. All living players see the same phase deadline. Nights last their full configured duration, even if actions have already been submitted. The app does not reveal which special roles are still acting.

- **Werewolves:** select one living nonwolf victim. Each wolf can see fellow living wolves' selections and revise their own until the deadline. Every living wolf must select the same victim. Missing selections or disagreement mean no attack.
- **Seer:** select one other living player. At dawn, privately learn whether they are a Werewolf. This reveals wolf status, not the target's exact village role. Results remain in the Seer's private history.
- **Guard (optional):** select one other living player to protect from that night's wolf attack. Cannot protect themselves or the same player on consecutive nights. Missing the deadline means no protection.
- **Villagers:** wait for dawn. No night action is available.

Night actions resolve simultaneously at the deadline. Protection prevents the selected wolf victim's elimination. A Seer who is attacked still receives that night's investigation. There is no public announcement of protection targets or investigation targets/results.

## Morning and discussion

Morning announces the eliminated player, if any, and reveals their role. A night without a victim gives no reason: protection and wolf disagreement are not distinguished publicly. After a short announcement, daytime discussion begins. The host can move from morning into discussion or finish discussion early; otherwise timers advance automatically.

Discuss aloud, accuse, persuade, bluff, and defend yourself. Players may claim any role. Do not physically inspect someone else's screen. Eliminated players must stay silent and cannot vote or act, though they still share their team's eventual result.

## Voting

Each living player selects one other living player to eliminate. Votes are hidden from other players until resolution. You may change your vote while voting remains open. Voting closes when all living players vote or the deadline passes; missing votes do not count. No self-votes or explicit abstain option.

The player with the most votes is eliminated; an absolute majority is not required. Their role is revealed. A tie for the most votes triggers one timed runoff limited to tied candidates. Players cannot vote for themselves even in a runoff. If the runoff also ties, or receives no votes, nobody is eliminated. No votes in the initial ballot also means no elimination. Resolved tallies are public; live tallies are not.

The game then enters the next night unless a victory condition has been met.

## Victory

Victory is checked after night and day eliminations:

- **Village:** no living Werewolves remain.
- **Werewolves:** living wolves equal or outnumber all other living players combined.

This parity ending is an explicit rule of this app. The losing team does not need to be individually eliminated. When the match ends, reveal everyone's role. The host may return the group to the lobby for a rematch; players ready themselves again and roles are shuffled afresh.

## Disconnects

A refresh or temporary connection loss does not eliminate a player. Reopen the same address in the same browser to resume. Timers continue during disconnects. If a required action is missing when its phase ends, the normal missing-action rule applies. The host role transfers to a connected player when possible. During a match, leaving reserves the original seat; it cannot be taken over by entering the same name.

In the lobby, the host may explicitly remove disconnected seats. If someone cannot return during a match (including before acknowledging a card), the host may end that match and return the group to the lobby. This abandons the current match without a winner. Returning to the lobby through this action or a rematch removes disconnected seats and clears everyone's ready status.

The host computer/server is the source of truth. Stopping or restarting it ends the match. Keep it powered and awake.

## Suggested decks

| Players | Suggested Werewolves | Seer | Guard | Villagers |
| --- | --- | --- | --- | --- |
| 6 | 1 | 1 | 0 | 4 |
| 8 | 2 | 1 | 0 | 5 |
| 10 | 2 | 1 | 1 | 6 |
| 12 | 3 | 1 | 1 | 7 |
| 16 | 3 | 1 | 1 | 11 |

These are starting presets for playtesting, not a guarantee of equal win rates. Familiar groups may adjust the wolf count and Guard before a match.
