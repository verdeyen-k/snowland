# ❄️ Snow Land

A turn-based snowball fight for 2 to 4 players: on one device, or online with a room code.

Play it at https://verdeyen-k.github.io/snowland/

## How to play

Everyone starts in a corner of a snowy field. On your turn, walk up to 2 squares, then do one thing:

- ✋ **Scoop**: pick up 2 snow.
- ❄️ **Throw** (1 snow): a snowball flies 4 squares in a straight line (any of 8 directions). It stops at the first tree, wall or player.
- 🧱 **Wall** (3 snow): build a wall on a square next to you. Walls block snowballs and people. Two hits break one.
- 🗼 **Tower** (5 snow): build a tower under your feet. Snowballs thrown from a tower fly 7 squares. Anyone can climb it.
- ⏭️ **Skip**.

Get hit and you're out (the host can choose 1, 2 or 3 hits). The last one standing wins.

## Files

- `index.html`: the page and styles.
- `snowland.js`: the rules, drawing and online rooms. Online games use Firebase (`snowland/rooms/<CODE>`): the room keeps the list of moves, and every device replays them to get the same field.
