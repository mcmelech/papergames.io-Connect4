# Connect 4 Helper

A Tampermonkey userscript for Connect 4 on [papergames.io](https://papergames.io). It reads the board,
finds the best move and highlights it. It can also lose on purpose, tie on purpose, and show you what
your friends are about to do, which is how you end up with fewer friends.

## The story

This started as a small, reasonable idea: I wanted to beat a few friends at Connect 4.

So I wrote a script that plays well, and it worked. For about two games. Then a friend looked at the
board, looked at me, and said "since when do you know what a diagonal is?" winning every game turns out
to be the least believable thing a person can do. I needed something more subtle, and more annoying.

**Tie mode** came next. Have you ever watched someone fill an entire Connect 4 board, slowly, on purpose,
refusing to win? It's the most irritating thing you can do with 42 circles. Nobody can prove anything.
You just keep "almost" having it. Your friend says "wow, close one" for the fourth time in a row, and
something behind their eyes starts to go.

The script did start accidentally winning, because a very bad opponent can leave you with nothing but
winning moves. I now own code whose bug report reads "won by mistake".

Then came the final form, **Let them win**. Losing is easy, so that isn't the point. It defends properly
at first, makes them work for it, slowly opens a door, and lets them walk through it feeling like a
genius. They think they outplayed you. They tell people. You say "gg" and you mean none of it.

Then I added an ESP tab so I could read their next move, an accuracy score to quietly grade them, and a
streamer mode for no reason. At some point this stopped being about Connect 4.

My friends do not know about this repo. If you're one of my friends: no you didn't win that game. Sorry.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the dashboard, click **+** and paste in `connect4-helper.user.js`.
3. Save and open a Connect 4 room.

Press **Insert** to minimise the menu. Drag the title bar to move it.

## Modes

| Mode | What it does |
| --- | --- |
| Win | Plays the strongest move it can find |
| Force a tie | Refuses to win and steers toward a full board |
| Let them win | Resists early, then opens a path. Never takes a win unless every move is one |

## Tabs

| Tab | What's in it |
| --- | --- |
| Play | Mode, think time, auto-play and its delay, the suggested move, a score for every column |
| ESP | Edge bar, outlook, likely next moves, threats, opponent move grades, clocks, board overlays |
| Site | Hide ads, chat and side menus, bigger board, streamer mode, piece colours, alerts, quick chat |
| Stats | Wins, ties and losses by mode and opponent, this game's moves |
| Config | Colour override, keyboard play, copy and paste settings |

Your colour is auto-detected. If you're logged out it assumes you're the left player, so set it by hand
in Config if that's wrong.

## Reading the scores

| Score | Meaning |
| --- | --- |
| `W3` | Forced win in 3 of your moves |
| `L2` | Forced loss in 2 of their moves |
| `TIE` | That column leads to a tie |
| `W!` | That column forces you to win. Terrible news in tie mode |
| `12` | An estimate. Higher is better |

## Test results

Self-play in Node, 10 games against each opponent, 150 ms per move. These were all bots, so I can't
promise how it feels against a person.

| Let them win against | They won | Tie | We won | Average moves |
| --- | --- | --- | --- | --- |
| Strong engine | 10 | 0 | 0 | 32.9 |
| Weak (half random) | 9 | 0 | 1 | 38.0 |
| Fully random | 9 | 1 | 0 | 39.3 |

Force a tie got 15 ties in 20 games against the weak opponent at 250 ms per move. It lost both games
against the strong engine, because refusing to win is a real handicap.

## Structure

```
connect4-helper.user.js
├── Solver         the search, runs in a web worker
├── SearchClient   starts searches, falls back to the main thread
├── Settings       saved options, copy and paste with validation
├── Stats          saved wins, ties and losses
├── Page           everything that reads or clicks the site
├── SiteTweaks     layout and colour changes
├── Alerts         sounds, tab title, low clock warning
├── GameTracker    move list and opponent grades
├── BoardOverlay   highlights, threats and ghost pieces
├── UI             the menu
└── App            connects everything, main loop
```

## Known limits

- Hide ads may not catch every ad, like the sticky one at the bottom.
- Stats only count boards that finish, so resigns and timeouts are missing.

## Be nice

Use it on friends who will forgive you, and tell them eventually. Don't use it against strangers, in
ranked games or in tournaments, because that's not a prank, it's just cheating at Connect 4. Check the
site's rules too. This project isn't affiliated with papergames.io.
