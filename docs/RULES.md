# Werewolf — application rules

This application uses a deliberately small classic Werewolf ruleset. The general hidden-role, night-action, discussion, and voting structure is described in [Bézier Games' Ultimate Werewolf overview](https://beziergames.com/products/ultimate-werewolf). The detailed timing, Guard, voting, and parity rules below are the application's chosen house rules. [One Night Ultimate Werewolf](https://beziergames.com/products/one-night-ultimate-werewolf) is a different game.

## Setup

Gather 6–16 players with a device/browser session each. One player creates the room and becomes host. Join before the game starts; late joining is unavailable. The application moderates, so the host participates normally and cannot see other players' hidden roles.

The host chooses a game mode, the number of Werewolves, whether to include a Guard, and night/discussion/vote timers. All starting roles except Werewolves belong to the village team. Settings must leave more village players than wolves. Everyone must be connected and ready before starting.

Each player privately reveals their assigned card and acknowledges it. Wolves know their teammates. The village knows the initial deck composition but not which living player has which role. Roles stay fixed except when an ordinary Villager is converted in The Infected Village.

## Game modes

### Classic

The original game: Werewolves, one Seer, ordinary Villagers, and an optional Guard. The Seer investigates one other living player each night.

### No Seer

The Seer is removed. One Witch and one Drunk replace the Seer and one ordinary Villager, so the number of players stays the same. An optional Guard may still be included.

- **Witch:** has one healing potion and one killing potion for the entire match. After wolves lock their selection, the Witch privately sees their marked target. She may heal that target, poison one other living player, use both potions, or use neither. She may heal herself if marked by the wolves, but cannot poison herself. Poison kills even if the same player is healed or protected by a Guard; healing cancels the wolf attack only. If the wolves and poison target the same person, that person is eliminated only once. A Witch marked by the wolves still gets to use her potions before dawn.
- **Drunk:** an ordinary member of the village team who must role-play being tipsy during discussion. The Drunk has a normal vote and no special night action.

Wolves act during the normal night timer. A second fixed timer, using the same configured duration, gives the Witch her turn. Both stages run for their full duration, even if the Witch is dead or has no potions left. Potions are spent when the final choices resolve, so the Witch may revise or cancel choices before the deadline. A missed turn uses no potion. The Witch sees the raw wolf target, not the Guard's selection; choosing to heal someone already protected still spends the healing potion.

### The Infected Village

Uses the Classic deck, including the Seer and optional Guard. **Once per game**, the wolves may choose to infect instead of eliminate. All living wolves must agree on both the action and the same target. Missing selections or disagreement produce no attack and do not spend the infection attempt.

Only an **ordinary Villager** can be converted. Seers and Guards cannot be infected. Wolves choose among living nonwolves without learning their hidden roles; choosing an ineligible target is not rejected immediately. The attempt fails at resolution if the target is ineligible or successfully protected by the Guard. An agreed infection attempt is spent even if it fails.

A successful target survives and privately receives **“You are now a Werewolf.”** Their allegiance changes to the wolves, they learn the pack, and the pack learns their identity. They may act with the wolves starting the next night. No public announcement identifies the infection or the new wolf; the morning simply reports no elimination. The initial deck counts do not disclose the new wolf count. Normal victory conditions apply after conversion.

Seer investigations report the target's wolf status at dawn, after any conversion that night. An older innocent result does not guarantee that someone remains innocent in a later round.

### The Secret Pact

Uses the Classic deck. Two distinct players are randomly linked independently of their roles. Each privately learns the partner's name, **not their role**. Normal wolf teammate knowledge still applies if both happen to be wolves.

If either partner is eliminated, the other is immediately eliminated too. Both deaths resolve before victory is checked. Guard protection can stop a direct wolf attack, but cannot stop a death caused by the pact. The link remains secret while both players live.

Both keep their original team and win condition. Eliminated players still share their team's victory, so sacrificing yourself to expose a wolf can be a winning choice for the village. There is no special pact team or lovers' victory condition.

## Moderator narration

The app displays a story for each phase. The host may read it aloud and still play normally. Public narration uses only public information: it never reveals Witch choices, an infection target or result, or the identities of living pact partners. Private role instructions remain on each player's own phone.

## Night

The first phase after card acknowledgments is Night 1. All living players see the same phase deadline. Nights last their full configured duration, even if actions have already been submitted. The app does not reveal which special roles are still acting.

- **Werewolves:** select one living nonwolf victim. Each wolf can see fellow living wolves' selections and revise their own until the deadline. Every living wolf must select the same victim. Missing selections or disagreement mean no attack.
- **Seer:** select one other living player. At dawn, privately learn whether they are a Werewolf. This reveals wolf status, not the target's exact village role. Results remain in the Seer's private history.
- **Guard (optional):** select one other living player to protect from that night's wolf attack. Cannot protect themselves or the same player on consecutive nights. Missing the deadline means no protection.
- **Villagers:** wait for dawn. No night action is available.
- **Witch and Drunk:** in No Seer, the Witch waits for her separate potion stage; the Drunk has no night action.

Night actions resolve together at dawn, after the Witch stage in No Seer. Protection prevents the wolf attack or infection, but not poison or a linked pact death. A Seer who is eliminated that night still receives the investigation. There is no public announcement of protection targets or investigation targets/results.

## Morning and discussion

Morning announces the eliminated player, if any, and reveals their role. A night without a victim gives no reason: protection and wolf disagreement are not distinguished publicly. After a short announcement, daytime discussion begins. The host can move from morning into discussion or finish discussion early; otherwise timers advance automatically.

Discuss aloud, accuse, persuade, bluff, and defend yourself. Players may claim any role. Do not physically inspect someone else's screen. Eliminated players must stay silent and cannot vote or act, though they still share their team's eventual result.

## Voting

Each living player selects one other living player to eliminate. Votes are hidden from other players until resolution. You may change your vote while voting remains open. Voting closes when all living players vote or the deadline passes; missing votes do not count. No self-votes or explicit abstain option.

The player with the most votes is eliminated; an absolute majority is not required. Their role is revealed. A tie for the most votes triggers one timed runoff limited to tied candidates. Players cannot vote for themselves even in a runoff. If the runoff also ties, or receives no votes, nobody is eliminated. No votes in the initial ballot also means no elimination. Resolved tallies are public; live tallies are not.

The game then enters the next night unless a victory condition has been met.

## Victory

Victory is checked after all night effects, conversions, and linked deaths, or after all day eliminations and linked deaths:

- **Village:** no living Werewolves remain.
- **Werewolves:** living wolves equal or outnumber all other living players combined.

This parity ending is an explicit rule of this app. The losing team does not need to be individually eliminated. When the match ends, reveal everyone's role. The host may return the group to the lobby for a rematch; players ready themselves again and roles are shuffled afresh.

## Disconnects

A refresh or temporary connection loss does not eliminate a player. Reopen the same address in the same browser to resume. Timers continue during disconnects. If a required action is missing when its phase ends, the normal missing-action rule applies. The host role transfers to a connected player when possible. During a match, leaving reserves the original seat; it cannot be taken over by entering the same name.

In the lobby, the host may explicitly remove disconnected seats. If someone cannot return during a match (including before acknowledging a card), the host may end that match and return the group to the lobby. This abandons the current match without a winner. Returning to the lobby through this action or a rematch removes disconnected seats and clears everyone's ready status.

The host computer/server is the source of truth. Stopping or restarting it ends the match. Keep it powered and awake.

## Suggested decks

These examples use the Classic deck (also used by Infected Village and Secret Pact). For No Seer, replace the Seer and one Villager with a Witch and Drunk.

| Players | Suggested Werewolves | Seer | Guard | Villagers |
| --- | --- | --- | --- | --- |
| 6 | 1 | 1 | 0 | 4 |
| 8 | 2 | 1 | 0 | 5 |
| 10 | 2 | 1 | 1 | 6 |
| 12 | 3 | 1 | 1 | 7 |
| 16 | 3 | 1 | 1 | 11 |

These are starting presets for playtesting, not a guarantee of equal win rates. Familiar groups may adjust the wolf count and Guard before a match.
