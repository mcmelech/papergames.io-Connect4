// ==UserScript==
// @name         Connect 4 Helper
// @version      2.4.0
// @description  finds the best move on papergames connect 4, plus tie and let them win modes
// @match        https://papergames.io/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
                              .__                .__
  _____   ____   _____   ____ |  |   ____   ____ |  |__
 /     \_/ ___\ /     \_/ __ \|  | _/ __ \_/ ___\|  |  \
|  Y Y  \  \___|  Y Y  \  ___/|  |_\  ___/\  \___|   Y  \
|__|_|  /\___  >__|_|  /\___  >____/\___  >\___  >___|  /
      \/     \/      \/     \/          \/     \/     \/
    All rights reserved. Copyright (c) 2026 MCMELE.CH
    FILE: connect4-helper.user.js
    LAST EDIT: 08/11/2026
*/

class Solver {
    static WIN = 1e6;
    static DRAW = 4e5;
    static HOSTILE = -5e5;
    static DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

    search = (job) => {
        if (!job.troll || job.toMove !== job.troll) {
            const res = this.run({ ...job, troll: 0 });

            return { ...res, adv: res.score, advSolved: res.solved };
        }

        const plain = this.run({ ...job, troll: 0, timeMs: 200 });

        if (plain.over) return plain;

        return { ...this.plan(job), adv: plain.score, advSolved: plain.solved };
    };

    plan = (job) => {
        if (job.lose) return this.concede(this.run({ ...job, realistic: true }), job.board);

        const timeMs = Math.max(100, job.timeMs / 2);
        const hostile = this.run({ ...job, timeMs });

        if (hostile.score >= Solver.DRAW - 1) return { ...hostile, model: 'guaranteed' };

        return { ...this.run({ ...job, timeMs, realistic: true }), model: 'realistic' };
    };

    concede = (res, board) => {
        const cells = board.flat();
        const fill = cells.filter(Boolean).length / cells.length;
        const phase = fill < 0.45 ? 'resist' : fill < 0.75 ? 'open' : 'give';

        const columns = res.scores.flatMap((score, col) => (score === null ? [] : [{ col, score }])).sort((a, b) => b.score - a.score);
        const forced = columns.filter(({ score }) => score <= -(Solver.WIN - 1000));
        const slow = forced.filter(({ score }) => Solver.WIN + score > 2);
        const quick = forced.filter(({ score }) => Solver.WIN + score <= 2);
        const own = columns.filter(({ score }) => score === res.ownWin);
        const ties = columns.filter(({ score }) => score >= Solver.DRAW);
        const unclear = columns.filter((column) => !forced.includes(column) && !own.includes(column) && !ties.includes(column));
        const weak = [...unclear].reverse();

        const order = {
            resist: [unclear, forced, ties, own],
            open: [slow, weak, quick, ties, own],
            give: [forced, weak, ties, own],
        };

        const [pick] = order[phase].find((list) => list.length) ?? [];

        return pick ? { ...res, best: pick.col, score: pick.score, phase } : { ...res, phase };
    };

    run = ({ rows: R, cols: C, board, toMove, timeMs = 1500, troll = 0, realistic = false, lose = false }) => {
        const { WIN, DRAW, HOSTILE, DIRS } = Solver;

        const N = R * C;
        const me = troll || toMove;
        const middle = C >> 1;
        const gain = troll ? [0, 0, 1, -30] : [0, 1, 6, 40];
        const loss = [0, 1, 6, 40];
        const centre = troll ? 0 : 3;
        const tie = troll ? DRAW : 0;
        const ownWin = realistic ? DRAW - 1 : HOSTILE;

        const g = Int8Array.from(board.flat());

        const tops = Int32Array.from({ length: C }, (_, c) => {
            let r = R - 1;

            while (r >= 0 && g[r * C + c]) r--;

            return r;
        });

        const order = [...tops.keys()].sort((a, b) => Math.abs(a - (C - 1) / 2) - Math.abs(b - (C - 1) / 2));

        const windows = [];

        for (let r = 0; r < R; r++) {
            for (let c = 0; c < C; c++) {
                for (const [dr, dc] of DIRS) {
                    const inside = r + 3 * dr < R && c + 3 * dc < C && c + 3 * dc >= 0;

                    if (inside) windows.push([0, 1, 2, 3].map((k) => (r + k * dr) * C + c + k * dc));
                }
            }
        }

        const decided = windows.find(([a, b, c, d]) => g[a] && g[a] === g[b] && g[a] === g[c] && g[a] === g[d]);

        if (decided) return { over: true, winner: g[decided[0]] };

        let empties = tops.reduce((sum, r) => sum + r + 1, 0);

        if (!empties) return { over: true, winner: 0 };

        const table = (max) => [[], ...[1, 2].map(() => Int32Array.from({ length: N }, () => Math.random() * max))];
        const high = table(0x7fffffff);
        const low = table(0x1fffff);

        let h1 = 0;
        let h2 = 0;

        const toggle = (i, p) => {
            h1 ^= high[p][i];
            h2 ^= low[p][i];
        };

        g.forEach((p, i) => p && toggle(i, p));

        const play = (c, p) => {
            const r = tops[c];

            g[r * C + c] = p;
            tops[c]--;
            empties--;
            toggle(r * C + c, p);

            return r;
        };

        const undo = (c, r, p) => {
            g[r * C + c] = 0;
            tops[c]++;
            empties++;
            toggle(r * C + c, p);
        };

        const rows = DIRS.map(([dr]) => dr);
        const cols = DIRS.map(([, dc]) => dc);

        const count = (r, c, dr, dc, p) => {
            let n = 0;

            for (r += dr, c += dc; r >= 0 && r < R && c >= 0 && c < C && g[r * C + c] === p; r += dr, c += dc) n++;

            return n;
        };

        const wins = (r, c, p) => {
            for (let d = 0; d < 4; d++) {
                if (count(r, c, rows[d], cols[d], p) + count(r, c, -rows[d], -cols[d], p) >= 3) return true;
            }

            return false;
        };

        const winning = (p) => {
            for (let i = 0; i < C; i++) {
                const c = order[i];

                if (tops[c] >= 0 && wins(tops[c], c, p)) return c;
            }

            return -1;
        };

        const allowed = (list) => {
            if (!realistic) return list;

            const safe = list.filter((c) => tops[c] >= 0 && !wins(tops[c], c, me));

            return safe.length ? safe : list;
        };

        const leaf = () => {
            let score = 0;

            for (let w = 0; w < windows.length; w++) {
                const window = windows[w];

                let mine = 0;
                let theirs = 0;

                for (let k = 0; k < 4; k++) {
                    const piece = g[window[k]];

                    if (piece === me) mine++;
                    else if (piece) theirs++;
                }

                if (!theirs) score += gain[mine];
                else if (!mine) score -= loss[theirs];
            }

            if (!centre) return score;

            for (let r = 0; r < R; r++) {
                const piece = g[r * C + middle];

                if (piece) score += piece === me ? centre : -centre;
            }

            return score;
        };

        const memory = new Map();
        const deadline = Date.now() + timeMs;

        let nodes = 0;
        let stopped = false;

        const after = (r, c, p, depth, ply, a, b) => {
            if (wins(r, c, p)) {
                if (p !== me) return ply - WIN;

                return troll ? ownWin : WIN - ply;
            }

            return empties ? node(depth - 1, a, b, 3 - p, ply) : tie;
        };

        const node = (depth, a, b, p, ply) => {
            if (!(++nodes & 2047) && Date.now() > deadline) stopped = true;
            if (stopped) return 0;

            const hunting = !troll || p !== me;

            if (hunting && winning(p) >= 0) return p === me ? WIN - ply - 1 : ply + 1 - WIN;
            if (depth <= 0) return leaf();

            const key = h1 * 2097152 + h2;
            const known = memory.get(key);

            const floor = a;
            const ceiling = b;

            if (known?.depth >= depth) {
                if (known.flag === 0) return known.score;
                if (known.flag === 1) a = Math.max(a, known.score);
                if (known.flag === 2) b = Math.min(b, known.score);
                if (a >= b) return known.score;
            }

            const maximising = p === me;
            const sorted = known ? [known.move, ...order.filter((c) => c !== known.move)] : order;
            const moves = maximising ? allowed(sorted) : sorted;

            let best = maximising ? -Infinity : Infinity;
            let move = -1;

            for (const c of moves) {
                if (tops[c] < 0) continue;

                const r = play(c, p);
                const score = after(r, c, p, depth, ply + 1, a, b);

                undo(c, r, p);

                if (maximising ? score > best : score < best) {
                    best = score;
                    move = c;
                }

                if (maximising) a = Math.max(a, score);
                else b = Math.min(b, score);

                if (a >= b) break;
            }

            if (stopped) return 0;
            if (move < 0) return tie;
            if (memory.size > 3e6) memory.clear();

            memory.set(key, { depth, score: best, move, flag: best <= floor ? 2 : best >= ceiling ? 1 : 0 });

            return best;
        };

        const line = (first) => {
            const moves = [];
            const stack = [];

            let who = toMove;
            let c = first;

            while (moves.length < 12 && c >= 0 && tops[c] >= 0) {
                const r = play(c, who);

                stack.push([c, r, who]);
                moves.push(c);

                if (wins(r, c, who) || !empties) break;

                who = 3 - who;

                const finish = !troll || who !== me ? winning(who) : -1;

                c = finish >= 0 ? finish : memory.get(h1 * 2097152 + h2)?.move ?? -1;
            }

            stack.reverse().forEach((move) => undo(...move));

            return moves;
        };

        const total = empties;
        const roots = troll ? allowed(order) : order;

        let result = null;

        for (let depth = 1; depth <= total; depth++) {
            const scores = new Array(C).fill(null);

            let best = -1;
            let top = -Infinity;

            for (const c of roots) {
                if (tops[c] < 0 || stopped) continue;

                const r = play(c, toMove);

                scores[c] = after(r, c, toMove, depth, 1, -Infinity, Infinity);
                undo(c, r, toMove);

                if (scores[c] > top) {
                    top = scores[c];
                    best = c;
                }
            }

            if (stopped) break;

            result = { best, score: top, scores, depth, solved: depth >= total };

            const lost = top <= -(WIN - 1000);
            const done = troll ? lost || (!lose && top >= DRAW - 1) : top > WIN - 1000;

            if (done) break;
        }

        result ??= { best: order.find((c) => tops[c] >= 0), score: 0, scores: new Array(C).fill(null), depth: 0, solved: false };

        return {
            ...result,
            lines: result.scores.map((score, c) => (score === null ? null : line(c))),
            win: WIN,
            draw: DRAW,
            ownWin,
            troll: !!troll,
        };
    };
}

class SearchClient {
    worker = null;
    blocked = false;
    id = 0;
    local = new Solver();

    constructor(onResult, onFail) {
        this.onResult = onResult;
        this.onFail = onFail;
    }

    spawn = () => {
        try {
            const source = `${Solver.toString()}\nconst solver = new Solver();\nonmessage = ({ data }) => postMessage({ id: data.id, res: solver.search(data.job) });`;
            const worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));

            worker.onmessage = ({ data }) => data.id === this.id && this.onResult(data.res);

            worker.onerror = () => {
                this.blocked = true;
                this.worker = null;
                this.onFail();
            };

            return worker;
        } catch {
            this.blocked = true;

            return null;
        }
    };

    run = (job) => {
        const id = ++this.id;

        if (!this.blocked) this.worker ??= this.spawn();
        if (this.worker) return this.worker.postMessage({ id, job });

        setTimeout(() => id === this.id && this.onResult(this.local.search(job)));
    };
}

const bool = (value) => typeof value === 'boolean';
const oneOf = (...list) => (value) => list.includes(value);
const range = (min, max) => (value) => typeof value === 'number' && value >= min && value <= max;
const colour = (value) => value === '' || /^#[0-9a-f]{6}$/i.test(value);
const point = (value) => value === null || (range(0, 1e5)(value?.x) && range(0, 1e5)(value?.y));

class Settings {
    static KEY = 'c4helper';

    static RULES = {
        color: oneOf('auto', 'light', 'dark'),
        mode: oneOf('win', 'tie', 'lose'),
        timeMs: range(200, 15000),
        moveDelay: range(0, 10000),
        humanize: bool,
        humanExtra: range(0, 10000),
        humanSlip: range(0, 50),
        autoplay: bool,
        minimized: bool,
        pos: point,
        esp: { threats: bool, poison: bool, line: bool, hover: bool, lineLen: oneOf(2, 4, 6, 8) },
        site: {
            hideAds: bool,
            hideChat: bool,
            hideSide: bool,
            streamer: bool,
            muteReact: bool,
            boardSize: oneOf(60, 70, 80, 90),
            turnSound: bool,
            flashTitle: bool,
            lowTime: bool,
            lowTimeSec: range(5, 300),
            hotkeys: bool,
            hideOutside: bool,
            lightColor: colour,
            darkColor: colour,
        },
    };

    v = 2;
    color = 'auto';
    mode = 'win';
    timeMs = 1500;
    moveDelay = 500;
    humanize = false;
    humanExtra = 1500;
    humanSlip = 15;
    autoplay = false;
    minimized = false;
    pos = null;
    esp = { threats: true, poison: true, line: true, hover: true, lineLen: 4 };

    site = {
        hideAds: false,
        hideChat: false,
        hideSide: false,
        streamer: false,
        muteReact: false,
        boardSize: 60,
        turnSound: false,
        flashTitle: true,
        lowTime: false,
        lowTimeSec: 30,
        hotkeys: false,
        hideOutside: false,
        lightColor: '',
        darkColor: '',
    };

    constructor() {
        const stored = JSON.parse(localStorage.getItem(Settings.KEY) || '{}');

        if (stored.troll) stored.mode = 'tie';
        if ((stored.v || 0) < 2) stored.color = 'auto';

        this.merge(this, stored, Settings.RULES);
    }

    merge = (target, source, rules) => {
        const tally = { applied: 0, skipped: 0 };

        Object.entries(rules).forEach(([key, rule]) => {
            if (!(key in source)) return;

            const value = source[key];

            if (typeof rule === 'function') {
                if (rule(value)) target[key] = value;

                tally[rule(value) ? 'applied' : 'skipped']++;
            } else if (value && typeof value === 'object') {
                const inner = this.merge(target[key], value, rule);

                tally.applied += inner.applied;
                tally.skipped += inner.skipped;
            } else {
                tally.skipped++;
            }
        });

        return tally;
    };

    save = () => localStorage.setItem(Settings.KEY, JSON.stringify(this));

    copy = () => JSON.stringify(this, null, 4);

    paste = (text) => {
        const data = JSON.parse(text);

        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not settings');

        const { applied, skipped } = this.merge(this, data, Settings.RULES);

        if (!applied) throw new Error('no settings');

        this.save();

        return skipped;
    };
}

class Stats {
    static KEY = 'c4helper-stats';

    static blank = () => ({ w: 0, d: 0, l: 0 });

    total = Stats.blank();
    mode = { win: Stats.blank(), tie: Stats.blank(), lose: Stats.blank() };
    opp = {};

    constructor() {
        Object.assign(this, JSON.parse(localStorage.getItem(Stats.KEY) || '{}'));
    }

    save = () => localStorage.setItem(Stats.KEY, JSON.stringify(this));

    reset = () => {
        this.total = Stats.blank();
        this.mode = { win: Stats.blank(), tie: Stats.blank(), lose: Stats.blank() };
        this.opp = {};

        this.save();
    };

    record = (board, winner, mine, mode, opponent) => {
        const id = `${location.pathname}|${board}`;

        if (sessionStorage.getItem('c4h-last-result') === id) return false;

        sessionStorage.setItem('c4h-last-result', id);

        const field = winner === 0 ? 'd' : winner === mine ? 'w' : 'l';

        this.total[field]++;
        this.mode[mode][field]++;

        if (opponent) {
            this.opp[opponent] ??= Stats.blank();
            this.opp[opponent][field]++;
        }

        this.save();

        return true;
    };
}

class Page {
    static hasBoard = () => !!document.querySelector('#connect4');

    static board = () => {
        const cells = [...document.querySelectorAll('#connect4 .grid .grid-item')].flatMap((el) => {
            const match = el.className.match(/cell-(\d+)-(\d+)/);

            if (!match) return [];

            const piece = el.querySelector('circle.circle-light') ? 1 : el.querySelector('circle.circle-dark') ? 2 : 0;

            return [{ el, piece, r: match[1] - 1, c: match[2] - 1, last: !!el.querySelector('.last-move') }];
        });

        if (!cells.length) return null;

        const R = Math.max(...cells.map(({ r }) => r)) + 1;
        const C = Math.max(...cells.map(({ c }) => c)) + 1;

        const grid = () => Array.from({ length: R }, () => new Array(C).fill(0));
        const board = grid();
        const els = grid();

        cells.forEach(({ el, piece, r, c }) => {
            board[r][c] = piece;
            els[r][c] = el;
        });

        const count = (piece) => cells.filter((cell) => cell.piece === piece).length;
        const last = cells.find((cell) => cell.last && cell.piece)?.piece ?? 0;

        return { R, C, board, els, last, n1: count(1), n2: count(2) };
    };

    static key = ({ board }) => board.map((row) => row.join('')).join('|');

    static players = () => {
        const me = document.querySelector('app-user-menu .name-credit > div')?.textContent.trim().toLowerCase();

        return [...document.querySelectorAll('app-room-players .row > div')].flatMap((side) => {
            const circle = side.querySelector('app-player-symbol circle');

            if (!circle) return [];

            const name = side.querySelector('[appprofileopener]')?.textContent.trim() ?? '';
            const clock = side.querySelector('app-timer')?.textContent.trim() ?? '';
            const time = clock.match(/(\d+):(\d+)/);

            return [{
                name,
                clock,
                color: circle.classList.contains('circle-light') ? 1 : 2,
                secs: time ? time[1] * 60 + +time[2] : null,
                active: !!side.querySelector('.chronometer.bg-secondary'),
                isMe: !!me && name.toLowerCase() === me,
            }];
        });
    };

    static color = (players, choice) => {
        if (choice !== 'auto') return choice === 'light' ? 1 : 2;

        return (players.find(({ isMe }) => isMe) ?? players[0])?.color ?? 1;
    };

    static turn = ({ last, n1, n2 }, mine, players) => {
        if (last) return 3 - last;
        if (n1 !== n2) return n1 < n2 ? 1 : 2;

        return players.find(({ active }) => active)?.color ?? mine;
    };

    static threats = ({ R, C, board }) => {
        const count = (r, c, dr, dc, p) => {
            let n = 0;

            for (r += dr, c += dc; board[r]?.[c] === p; r += dr, c += dc) n++;

            return n;
        };

        const wins = (r, c, p) => Solver.DIRS.some(([dr, dc]) => count(r, c, dr, dc, p) + count(r, c, -dr, -dc, p) >= 3);

        const at = { 1: new Set(), 2: new Set() };

        board.forEach((row, r) => row.forEach((piece, c) => {
            if (piece) return;

            [1, 2].filter((p) => wins(r, c, p)).forEach((p) => at[p].add(`${r}:${c}`));
        }));

        const land = Array.from({ length: C }, (_, c) => {
            let r = R - 1;

            while (r >= 0 && board[r][c]) r--;

            return r;
        });

        return { at, land };
    };

    static drop = (col) => {
        const found = Page.board();
        const row = found?.board.findLastIndex((cells) => cells[col] === 0) ?? -1;

        if (row < 0) return false;

        found.els[row][col].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

        return true;
    };

    static chat = (text) => {
        const area = document.querySelector('app-chat textarea');

        if (!area) return false;

        area.value = text;
        area.dispatchEvent(new Event('input', { bubbles: true }));

        setTimeout(() => document.querySelector('app-chat button[type=submit]')?.click(), 50);

        return true;
    };
}

class SiteTweaks {
    static CLASSES = {
        hideAds: 'c4-ads',
        hideChat: 'c4-chat',
        hideSide: 'c4-side',
        streamer: 'c4-streamer',
        muteReact: 'c4-mute',
    };

    constructor(settings) {
        this.settings = settings;
    }

    apply = () => {
        const { site } = this.settings;
        const { classList, style } = document.documentElement;

        Object.entries(SiteTweaks.CLASSES).forEach(([key, name]) => classList.toggle(name, site[key]));

        classList.toggle('c4-board', site.boardSize !== 60);
        style.setProperty('--c4-board', `${site.boardSize}vh`);

        const paint = (name, value) => (value ? style.setProperty(name, value) : style.removeProperty(name));

        paint('--c-light-symbol', site.lightColor);
        paint('--c-dark-symbol', site.darkColor);
    };
}

class Alerts {
    audio = null;
    title = null;
    warned = false;

    constructor(settings) {
        this.settings = settings;

        document.addEventListener('visibilitychange', () => !document.hidden && this.restore());
    }

    beep = (frequency = 660, length = 0.12) => {
        try {
            this.audio ??= new AudioContext();
            this.audio.resume();

            const { currentTime, destination } = this.audio;
            const tone = this.audio.createOscillator();
            const gain = this.audio.createGain();

            tone.frequency.value = frequency;
            gain.gain.setValueAtTime(0.15, currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, currentTime + length);

            tone.connect(gain).connect(destination);
            tone.start();
            tone.stop(currentTime + length);
        } catch {}
    };

    turn = () => {
        const { turnSound, flashTitle } = this.settings.site;

        if (turnSound) this.beep();

        if (flashTitle && document.hidden && this.title === null) {
            this.title = document.title;
            document.title = `▶ Your turn - ${this.title}`;
        }
    };

    restore = () => {
        if (this.title === null) return;

        document.title = this.title;
        this.title = null;
    };

    clock = (me) => {
        const { lowTime, lowTimeSec } = this.settings.site;

        if (me?.secs == null) return;

        if (me.secs > lowTimeSec) {
            this.warned = false;

            return;
        }

        if (!lowTime || !me.active || this.warned) return;

        this.warned = true;
        this.beep(880, 0.15);

        setTimeout(() => this.beep(880, 0.15), 220);
    };
}

class GameTracker {
    previous = null;
    analysis = null;
    history = [];
    partial = false;
    moves = 0;
    matched = 0;
    last = '–';

    reset = (partial) => {
        this.history = [];
        this.partial = partial;
        this.moves = 0;
        this.matched = 0;
        this.last = '–';
    };

    forget = () => {
        this.previous = null;
    };

    remember = (key, toMove, res) => {
        this.analysis = { key, toMove, res };
    };

    grade = ({ scores, win }, col) => {
        const score = scores[col];

        if (score == null) return null;

        const best = Math.max(...scores.filter((value) => value !== null));
        const limit = win - 1000;

        if (score === best) return 'best';
        if (best > limit && score <= limit) return 'missed a forced win';
        if (score < -limit && best >= -limit) return 'blunder';

        return best - score > 40 ? 'mistake' : 'decent';
    };

    update = (found, mine) => {
        const { board, R, C, n1, n2 } = found;
        const key = Page.key(found);
        const total = n1 + n2;
        const before = this.previous;

        if (before?.key === key) return;

        this.previous = { key, total, R, C, board };

        if (!before || before.R !== R || before.C !== C || total < before.total) return this.reset(total > 0);

        const added = board.flatMap((row, r) => row.flatMap((piece, c) => (piece && !before.board[r][c] ? [{ c, piece }] : [])));

        if (added.length > 1) this.partial = true;
        if (added.length === 1) this.add(added[0], mine, before.key);
    };

    add = ({ c, piece }, mine, key) => {
        this.history.push(c);

        if (piece === mine) return;

        const { analysis } = this;
        const fresh = analysis?.key === key && analysis.toMove === piece && !analysis.res.troll;
        const grade = fresh ? this.grade(analysis.res, c) : null;

        this.last = `Column ${c + 1}${grade ? ` · ${grade}` : ''}`;

        if (!grade) return;

        this.moves++;

        if (grade === 'best') this.matched++;
    };

    text = () => this.history.map((col) => col + 1).join('');
}

class BoardOverlay {
    static CLASSES = ['c4-col', 'c4-land', 'c4-opp', 'c4-me-win', 'c4-opp-win', 'c4-poison', 'c4-ghost', 'c4-light', 'c4-dark'];

    hover = null;

    constructor(settings) {
        this.settings = settings;
    }

    clear = () => {
        document.querySelectorAll(BoardOverlay.CLASSES.map((name) => `.${name}`).join()).forEach((el) => {
            el.classList.remove(...BoardOverlay.CLASSES);
            el.removeAttribute('data-c4-step');
            el.removeAttribute('data-tip');
        });
    };

    missing = () => !document.querySelector('.c4-land');

    summary = (at, land, mine) => {
        const playable = (player) => land.flatMap((r, c) => (r >= 0 && at[player].has(`${r}:${c}`) ? [c + 1] : []));
        const yours = playable(mine);
        const theirs = playable(3 - mine);

        const parts = [
            yours.length && `you win now: ${yours.join(', ')}`,
            theirs.length && `they win now: ${theirs.join(', ')}`,
        ].filter(Boolean);

        return parts.join(' · ') || `${at[mine].size} yours, ${at[3 - mine].size} theirs, none playable yet`;
    };

    draw = (game) => {
        this.clear();

        const found = game && Page.board();

        if (!found) return null;

        const { mine, toMove, res } = game;
        const { threats, poison, line, hover, lineLen } = this.settings.esp;
        const { els, R } = found;
        const { at, land } = Page.threats(found);

        const cell = (key) => key.split(':').reduce((row, index) => row?.[index], els);
        const info = { threats: this.summary(at, land, mine), label: 'Likely line', line: '–' };

        if (threats) {
            at[mine].forEach((key) => {
                const el = cell(key);

                el?.classList.add('c4-me-win');

                if (el) el.dataset.tip = 'You win if a piece of yours lands here';
            });

            at[3 - mine].forEach((key) => {
                const el = cell(key);

                el?.classList.add('c4-opp-win');

                if (el) el.dataset.tip = at[mine].has(key) ? 'Whoever lands here wins' : 'They win if a piece of theirs lands here';
            });
        }

        if (poison) {
            land.forEach((r, c) => {
                if (r <= 0 || !at[3 - mine].has(`${r - 1}:${c}`) || at[mine].has(`${r}:${c}`)) return;

                els[r][c].classList.add('c4-poison');
                els[r][c].dataset.tip = 'Poison: if you play here, they win on top';
            });
        }

        if (!res || res.over) return info;

        for (let r = 0; r < R; r++) {
            const el = els[r][res.best];

            el.classList.add(r === land[res.best] ? 'c4-land' : 'c4-col');

            if (toMove !== mine) el.classList.add('c4-opp');
            if (r === land[res.best]) el.dataset.tip = toMove === mine ? 'The suggested move' : 'Their most likely move';
        }

        const shown = hover && res.lines?.[this.hover] ? this.hover : res.best;
        const moves = res.lines?.[shown] ?? [];
        const owner = (step) => (step % 2 ? 3 - toMove : toMove);

        if (shown !== res.best) info.label = `If column ${shown + 1}`;

        if (moves.length) {
            info.line = moves.slice(0, 8).map((c, step) => `${owner(step) === mine ? 'You' : 'They'} ${c + 1}`).join(' › ');

            if (shown !== res.best) info.line += ` (${UI.score(res.scores[shown], res)})`;
        }

        if (line) {
            const next = [...land];

            moves.slice(0, lineLen).forEach((c, step) => {
                const el = els[next[c]--]?.[c];

                if (!el) return;

                el.classList.add('c4-ghost', owner(step) === 1 ? 'c4-light' : 'c4-dark');
                el.setAttribute('data-c4-step', step + 1);

                el.dataset.tip = `Likely move ${step + 1}: ${owner(step) === mine ? 'you' : 'them'}`;
            });
        }

        return info;
    };
}

class UI {
    static MODES = { win: '', tie: ' · TIE MODE', lose: ' · LET THEM WIN' };

    static ICONS = {
        play: 'M2 4h20v16H2zm5 3a2 2 0 100 4 2 2 0 000-4zm5 0a2 2 0 100 4 2 2 0 000-4zm5 0a2 2 0 100 4 2 2 0 000-4zM7 13a2 2 0 100 4 2 2 0 000-4zm5 0a2 2 0 100 4 2 2 0 000-4zm5 0a2 2 0 100 4 2 2 0 000-4z',
        esp: 'M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 3a4 4 0 110 8 4 4 0 010-8zm0 2a2 2 0 100 4 2 2 0 000-4z',
        site: 'M12 2a10 10 0 100 20 10 10 0 000-20zM4.2 11H8c.1-2.3.6-4.4 1.4-6A8 8 0 004.2 11zm5.8 0h4c-.2-3-1.2-5.5-2-6.8-.8 1.3-1.8 3.8-2 6.8zm6 0h3.8a8 8 0 00-5.2-6c.8 1.6 1.3 3.7 1.4 6zM4.2 13a8 8 0 005.2 6c-.8-1.6-1.3-3.7-1.4-6zm5.8 0c.2 3 1.2 5.5 2 6.8.8-1.3 1.8-3.8 2-6.8zm6 0c-.1 2.3-.6 4.4-1.4 6a8 8 0 005.2-6z',
        stats: 'M3 20h18v2H3zM5 11h3v8H5zm5.5-7h3v15h-3zM16 8h3v11h-3z',
        config: 'M10.5 2h3l.5 2.6 1.9.8 2.2-1.5 2.1 2.1-1.5 2.2.8 1.9 2.5.5v3l-2.5.5-.8 1.9 1.5 2.2-2.1 2.1-2.2-1.5-1.9.8-.5 2.8h-3l-.5-2.8-1.9-.8-2.2 1.5-2.1-2.1 1.5-2.2-.8-1.9L2 13.6v-3l2.5-.5.8-1.9-1.5-2.2 2.1-2.1 2.2 1.5 1.9-.8zM12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z',
    };

    static TIPS = {
        'c4-drag': 'Drag here to move the menu',
        'c4-min': 'Minimise to a small box that keeps showing the move (Insert)',
        'c4-mark': 'Click to open the menu again (Insert)',

        mode: 'Win plays the strongest move, Force a tie refuses to win, Let them win loses slowly',
        timeMs: 'How long the search thinks per position. Longer sees further ahead',
        autoplay: 'Plays the suggested move for you on your turn',
        moveDelay: 'How long auto-play waits before moving, after the search finishes',
        humanize: 'Randomizes the auto-play timing and sometimes plays a close second choice',
        humanExtra: 'The most random time added on top of the auto-play delay',
        humanSlip: 'How often it plays a close second choice. Never when the result is already forced',

        'c4-best': 'The move the search picked for the side to play',
        'c4-verdict': 'What the search thinks about this position',
        'c4-info': 'Whose turn it is, how far the search looked and your colour',

        'c4-edge': 'Green is you, red is them',
        'c4-edge-text': 'A rough estimate. It only reaches 0% or 100% when a win is forced',
        'c4-outlook': 'What happens with perfect play, if the search got that far',
        'c4-line': 'The moves the search expects next. Hover a column on the board to preview it',
        'c4-threats': 'Empty cells that would complete four in a row',
        'c4-opp-last': 'Their last column, graded against what the search wanted',
        'c4-opp-match': 'How many of their moves matched the top choice of the search',
        'c4-clocks': 'Time left, read from the page',

        'esp.threats': 'Marks cells that would win, even if they are not playable yet',
        'esp.poison': 'Marks cells with an X when playing there lets them win on top',
        'esp.line': 'Shows the likely moves on the board as numbered pieces',
        'esp.hover': 'Hover a column on the board to see how playing there would go',
        'esp.lineLen': 'How many numbered pieces to show',

        'site.hideAds': 'Hides ad banners and the video slot. Some ads may stay visible',
        'site.hideChat': 'Hides the chat column and gives the board the space',
        'site.hideSide': 'Hides the side menu and the left bar',
        'site.streamer': 'Hides names, flags and avatars, and blurs the chat',
        'site.muteReact': 'Hides emoji reactions and punch messages',
        'site.boardSize': 'How much of the window height the board can use',
        'site.lightColor': 'Colour of the light and dark pieces',
        'site.turnSound': 'Plays a beep when it becomes your turn',
        'site.flashTitle': 'Changes the tab title on your turn while the tab is in the background',
        'site.lowTime': 'Beeps twice when your clock drops below the limit',
        'site.lowTimeSec': 'The clock limit for the low time beep',

        'c4-colours': 'Goes back to the colours of the site',
        'c4-room': 'Copies the link to this room',

        'c4-moves': 'Columns played in this game, in order',
        'c4-copy-moves': 'Copies the columns as one string of digits',
        'c4-copy-board': 'Copies the board as text',
        'c4-reset': 'Deletes your saved wins, ties and losses',

        color: 'Auto-detect matches your name, or assumes you are the left player',
        'site.hotkeys': 'Keys 1-9 drop a piece in that column, Space plays the suggestion',
        'site.hideOutside': 'Only shows this menu while a Connect 4 board is on the page',
        'c4-position': 'Puts the menu back in the top right corner',
        'c4-copy': 'Copies your settings as text. Your results are not included',
        'c4-paste': 'Applies settings you copied earlier. Invalid values are skipped',
    };

    static BOXES = {
        Move: 'The suggested move and a score for each column',
        Prediction: 'What the search expects to happen',
        Opponent: 'How the other player is doing',
        'Board overlays': 'What gets drawn on the board',
        Layout: 'Changes to the page around the board',
        'Board colours': 'Colour of the pieces on the board',
        Alerts: 'Sounds and tab title changes',
        Room: 'Quick chat messages and the room link',
        Results: 'Saved results from finished boards',
        Against: 'Saved results for each opponent',
        'This game': 'The moves recorded in this game',
    };

    static TABS = {
        play: 'Mode, timing and the suggested move',
        esp: 'Predictions, threats and board overlays',
        site: 'Page layout, colours, alerts and quick chat',
        stats: 'Your results and this game',
        config: 'Colour, keyboard play and settings',
    };

    static CSS = `
        #c4-panel {
            position: fixed;
            top: 80px;
            right: 16px;
            z-index: 99999;
            font: 10px/1.4 Verdana, sans-serif;
            color: #dcdcdc;
            user-select: none;

            #c4-tip {
                display: none;
                position: fixed;
                max-width: 240px;
                padding: 4px 7px;
                color: #dcdcdc;
                background: #0c0c0c;
                border: 1px solid #3d414c;
                pointer-events: none;
                z-index: 1;

                &.open { display: block; }
            }

            &.mini #c4-menu { display: none; }
            &.mini #c4-mark { display: block; }

            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }

            #c4-menu {
                width: 420px;
                border: 5px double #3d414c;
                background: #111;
                box-shadow: 0 8px 28px rgba(0, 0, 0, .6);
            }

            #c4-mark {
                display: none;
                max-width: 320px;
                padding: 5px 10px 7px;
                border: 5px double #3d414c;
                background: #111;
                color: #fff;
                cursor: pointer;

                b {
                    color: #95c021;
                    font-weight: 400;
                }
            }

            .line {
                height: 3px;
                background: linear-gradient(100deg, #45aaf2, #fc5c65, #fed330);
            }

            .title {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 4px 8px;
                color: #8a8a8a;
                letter-spacing: .04em;
                background: #0c0c0c;
                border-bottom: 1px solid #323034;
                cursor: move;

                button {
                    width: 18px;
                    height: 16px;
                    color: #5a5a5a;
                    background: none;
                    border: 0;
                    font: 12px Verdana, sans-serif;
                    cursor: pointer;

                    &:hover { color: #c8c8c8; }
                }
            }

            .main {
                display: flex;
                height: 376px;
            }

            .tabs {
                flex: none;
                width: 58px;
                list-style: none;
                background: #0c0c0c;
                border-right: 1px solid #323034;

                li {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 3px;
                    margin-right: -1px;
                    padding: 10px 0 8px;
                    color: #5a5a5a;
                    font-size: 9px;
                    border-right: 1px solid #323034;
                    cursor: pointer;

                    &:hover { color: #c8c8c8; }

                    &.current {
                        color: #fff;
                        background: #111;
                        border-block: 1px solid #323034;
                        border-right-color: #111;
                    }

                    &:first-child.current { border-top: 0; }
                }

                svg {
                    width: 20px;
                    height: 20px;
                    fill: currentColor;
                }
            }

            .content {
                flex: 1;
                min-width: 0;
                padding: 10px 12px;
                overflow-y: auto;
            }

            .page { display: none; }
            .page.current { display: block; }

            .field {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
            }

            fieldset .field:last-child { margin-bottom: 0; }

            select, input[type=number] {
                width: 124px;
                height: 20px;
                padding: 0 4px;
                color: #dcdcdc;
                background: #1f1f1f;
                border: 1px solid #000;
                border-radius: 0;
                outline: 1px solid #323034;
                outline-offset: -2px;
                font: 10px Verdana, sans-serif;

                &:hover { background: #262626; }
            }

            option {
                color: #dcdcdc;
                background: #1f1f1f;
            }

            input[type=color] {
                width: 34px;
                height: 18px;
                background: #1f1f1f;
                border: 1px solid #000;
                cursor: pointer;
            }

            .check {
                display: block;
                position: relative;
                margin-bottom: 7px;
                padding-left: 17px;
                cursor: pointer;

                input {
                    position: absolute;
                    opacity: 0;
                    z-index: -1;
                }

                i {
                    position: absolute;
                    top: 2px;
                    left: 0;
                    width: 10px;
                    height: 10px;
                    background: #474747;
                    border: 1px solid #000;
                }

                &:hover i { background: #5a5a5a; }
                input:focus-visible ~ i { outline: 1px solid #c8c8c8; }
                input:checked ~ i { background: #95c021; }
            }

            fieldset {
                min-width: 0;
                margin: 0 0 8px;
                padding: 6px 8px 8px;
                background: #0f0f0f;
                border: 1px solid #323034;
            }

            legend {
                float: none;
                width: auto;
                margin-left: 2px;
                padding: 0 4px;
                color: #c8c8c8;
                font: inherit;
            }

            .best {
                color: #fff;
                font-size: 13px;
                font-weight: 700;
            }

            .verdict {
                margin-top: 2px;
                color: #95c021;

                &.bad { color: #fc5c65; }
            }

            .info {
                margin-top: 4px;
                color: #7a7a7a;
            }

            .cols {
                display: flex;
                gap: 2px;
                margin-top: 8px;

                div {
                    flex: 1;
                    min-width: 0;
                    padding: 2px 0;
                    color: #9a9a9a;
                    text-align: center;
                    font-size: 9px;
                    background: #1a1a1a;
                    border: 1px solid #000;
                    overflow: hidden;

                    &.top {
                        color: #000;
                        font-weight: 700;
                        background: #95c021;
                    }
                }
            }

            .stat {
                display: flex;
                justify-content: space-between;
                gap: 8px;
                margin-bottom: 3px;

                span:first-child {
                    flex: none;
                    color: #7a7a7a;
                }

                span:last-child { text-align: right; }
            }

            .meter {
                height: 8px;
                margin-bottom: 6px;
                background: #fc5c65;
                border: 1px solid #000;

                div {
                    width: 50%;
                    height: 100%;
                    background: #95c021;
                    transition: width .25s;
                }
            }

            .acts {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
            }

            .act {
                height: 20px;
                padding: 0 8px;
                color: #dcdcdc;
                background: #1f1f1f;
                border: 1px solid #000;
                outline: 1px solid #323034;
                outline-offset: -2px;
                font: 10px Verdana, sans-serif;
                cursor: pointer;

                &:hover {
                    color: #fff;
                    background: #2a2a2a;
                }
            }

            table {
                width: 100%;
                border-collapse: collapse;
            }

            td, th {
                padding: 1px 0;
                font-weight: 400;
                text-align: right;

                &:first-child {
                    max-width: 150px;
                    text-align: left;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                    overflow: hidden;
                }
            }

            th { color: #7a7a7a; }

            .moves {
                color: #c8c8c8;
                font-family: Consolas, monospace;
                word-break: break-all;
            }

            .hint {
                margin-top: 8px;
                color: #5a5a5a;
            }

            kbd {
                color: #c8c8c8;
                font: inherit;
            }
        }

        .c4-col { box-shadow: inset 0 0 0 3px rgba(149, 192, 33, .5) !important; }

        .c4-land {
            border-radius: 50%;
            box-shadow: inset 0 0 0 6px #95c021 !important;
        }

        .c4-col.c4-opp { box-shadow: inset 0 0 0 3px rgba(252, 92, 101, .45) !important; }
        .c4-land.c4-opp { box-shadow: inset 0 0 0 6px #fc5c65 !important; }

        .c4-me-win, .c4-opp-win, .c4-poison, .c4-ghost { position: relative; }

        .c4-me-win::before, .c4-opp-win::before {
            content: "";
            position: absolute;
            inset: 36%;
            border-radius: 50%;
            box-shadow: 0 0 0 2px #fff;
            pointer-events: none;
            z-index: 2;
        }

        .c4-me-win::before { background: #95c021; }
        .c4-opp-win::before { background: #fc5c65; }
        .c4-me-win.c4-opp-win::before { background: linear-gradient(90deg, #95c021 50%, #fc5c65 50%); }

        .c4-poison::before {
            content: "\\2715";
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fc5c65;
            font: 700 22px Verdana, sans-serif;
            background: none;
            box-shadow: none;
            pointer-events: none;
            z-index: 2;
        }

        .c4-ghost::after {
            content: attr(data-c4-step);
            position: absolute;
            inset: 14%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font: 700 14px Verdana, sans-serif;
            border: 2px dashed #fff;
            border-radius: 50%;
            opacity: .72;
            pointer-events: none;
            z-index: 3;
        }

        .c4-ghost.c4-light::after { background: var(--c-light-symbol, #18bc9c); }
        .c4-ghost.c4-dark::after { background: var(--c-dark-symbol, #2c3e50); }

        html.c4-ads app-ad-banner, html.c4-ads #slot-video { display: none !important; }
        html.c4-chat app-room .right-nav { display: none !important; }
        html.c4-side app-room .left-nav, html.c4-side .app-sidenav { display: none !important; }

        html.c4-chat app-room .row > .col-md-9, html.c4-side app-room .row > .col-md-9 {
            flex: 1 1 0 !important;
            width: auto !important;
            max-width: none !important;
        }

        html.c4-board #connect4 div.grid { max-height: var(--c4-board, 60vh) !important; }

        html.c4-streamer app-room-players [appprofileopener],
        html.c4-streamer .name-credit,
        html.c4-streamer app-chat .message-container { filter: blur(6px); }

        html.c4-streamer app-room-players .flag,
        html.c4-streamer .img-wrapper img { visibility: hidden; }

        html.c4-mute .emoji-reaction, html.c4-mute app-punch-message { display: none !important; }
    `;

    static check = (bind, text, on = '') => `
        <label class="check">
            <input type="checkbox" data-bind="${bind}" data-on="${on}">
            <i></i>${text}
        </label>
    `;

    static field = (label, control, extra = '') => `<div class="field" ${extra}><span>${label}</span>${control}</div>`;

    static select = (bind, on, options) => `
        <select data-bind="${bind}" data-on="${on}">
            ${options.map(([value, text]) => `<option value="${value}">${text}</option>`).join('')}
        </select>
    `;

    static number = (bind, on, min, max, step) => `<input type="number" data-bind="${bind}" data-on="${on}" min="${min}" max="${max}" step="${step}">`;

    static stat = (id, label, labelId = '') => `<div class="stat"><span ${labelId && `id="${labelId}"`}>${label}</span><span id="${id}">–</span></div>`;

    static box = (title, body) => `<fieldset><legend>${title}</legend>${body}</fieldset>`;

    static tab = (name, label, current) => `
        <li class="${current ? 'current' : ''}" data-page="c4-${name}" data-tip="${UI.TABS[name]}">
            <svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="${UI.ICONS[name]}"/></svg>
            ${label}
        </li>
    `;

    static page = (name, body, current) => `<div class="page ${current ? 'current' : ''}" id="c4-${name}">${body}</div>`;

    static play = () => `
        ${UI.field('Mode', UI.select('mode', 'rerun', [['win', 'Win'], ['tie', 'Force a tie'], ['lose', 'Let them win']]))}
        ${UI.field('Think time (ms)', UI.number('timeMs', 'rerun', 200, 15000, 100))}
        ${UI.check('autoplay', 'Auto-play my moves', 'rerun')}
        ${UI.field('Auto-play delay (ms)', UI.number('moveDelay', '', 0, 10000, 100), 'data-show="autoplay"')}
        ${UI.check('humanize', 'Humanized play', 'rerun')}
        ${UI.field('Random extra delay (ms)', UI.number('humanExtra', '', 0, 10000, 100), 'data-show="humanize"')}
        ${UI.field('Slip chance (%)', UI.number('humanSlip', 'rerun', 0, 50, 5), 'data-show="humanize"')}

        ${UI.box('Move', `
            <div class="best" id="c4-best"></div>
            <div class="verdict" id="c4-verdict"></div>
            <div class="info" id="c4-info"></div>
            <div class="cols" id="c4-cols"></div>
        `)}
    `;

    static esp = () => `
        ${UI.box('Prediction', `
            <div class="meter"><div id="c4-edge"></div></div>
            ${UI.stat('c4-edge-text', 'Edge (estimate)')}
            ${UI.stat('c4-outlook', 'Outlook')}
            ${UI.stat('c4-line', 'Likely line', 'c4-line-label')}
            ${UI.stat('c4-threats', 'Threats')}
        `)}

        ${UI.box('Opponent', `
            ${UI.stat('c4-opp-last', 'Last move')}
            ${UI.stat('c4-opp-match', 'Matched engine')}
            ${UI.stat('c4-clocks', 'Clocks (you / them)')}
        `)}

        ${UI.box('Board overlays', `
            ${UI.check('esp.threats', 'Winning cells (green you, red them)', 'redraw')}
            ${UI.check('esp.poison', 'Poison cells (playing there lets them win on top)', 'redraw')}
            ${UI.check('esp.line', 'Ghost pieces for the likely line', 'redraw')}
            ${UI.check('esp.hover', 'Preview a column when hovering over it', 'redraw')}
            ${UI.field('Ghost pieces', UI.select('esp.lineLen', 'redraw', [[2, 2], [4, 4], [6, 6], [8, 8]]))}
        `)}
    `;

    static site = () => `
        ${UI.box('Layout', `
            ${UI.check('site.hideAds', 'Hide ads', 'site')}
            ${UI.check('site.hideChat', 'Hide chat column', 'site')}
            ${UI.check('site.hideSide', 'Hide side menu and left bar', 'site')}
            ${UI.check('site.streamer', 'Streamer mode (hide names, flags, avatars)', 'site')}
            ${UI.check('site.muteReact', 'Hide emoji reactions and punch messages', 'site')}
            ${UI.field('Board size', UI.select('site.boardSize', 'site', [[60, 'Default'], [70, 'Large'], [80, 'Larger'], [90, 'Huge']]))}
        `)}

        ${UI.box('Board colours', UI.field('Light / dark piece', `
            <span class="acts">
                <input type="color" data-bind="site.lightColor" data-on="site" data-fallback="#18bc9c">
                <input type="color" data-bind="site.darkColor" data-on="site" data-fallback="#2c3e50">
                <button class="act" id="c4-colours">Reset</button>
            </span>
        `))}

        ${UI.box('Alerts', `
            ${UI.check('site.turnSound', 'Sound on your turn', 'sound')}
            ${UI.check('site.flashTitle', 'Flash tab title on your turn', 'title')}
            ${UI.check('site.lowTime', 'Beep when your clock runs low', 'sound')}
            ${UI.field('Low clock (seconds)', UI.number('site.lowTimeSec', '', 5, 300, 5))}
        `)}

        ${UI.box('Room', `
            <div class="acts">
                ${['gl hf', 'nice one', 'gg', 'rematch?'].map((text) => `<button class="act" data-chat="${text}" data-tip="Sends ${text} in the room chat">${text}</button>`).join('')}
                <button class="act" id="c4-room">Copy room link</button>
            </div>
        `)}
    `;

    static stats = () => `
        ${UI.box('Results', '<table id="c4-tally"></table>')}
        ${UI.box('Against', '<table id="c4-opps"></table>')}

        ${UI.box('This game', `
            <div class="moves" id="c4-moves"></div>

            <div class="acts" style="margin-top: 6px">
                <button class="act" id="c4-copy-moves">Copy moves</button>
                <button class="act" id="c4-copy-board">Copy board</button>
                <button class="act" id="c4-reset">Reset results</button>
            </div>
        `)}

        <div class="hint">Results count finished boards only, so resigns and timeouts are not included.</div>
    `;

    static config = () => `
        ${UI.field('My colour', UI.select('color', 'rerun', [['auto', 'Auto-detect'], ['light', 'Light (teal)'], ['dark', 'Dark (navy)']]))}
        ${UI.check('site.hotkeys', 'Keyboard play: 1-9 drops a piece, Space plays the best move')}
        ${UI.check('site.hideOutside', 'Hide this menu outside Connect 4 games')}

        <div class="acts">
            <button class="act" id="c4-position">Reset menu position</button>
            <button class="act" id="c4-copy">Copy settings</button>
            <button class="act" id="c4-paste">Paste settings</button>
        </div>

        <div class="hint"><kbd>Insert</kbd> minimises the menu. Drag the title bar to move it.</div>
    `;

    static markup = () => `
        <div id="c4-menu">
            <div class="line"></div>

            <div class="title" id="c4-drag">
                <span>connect 4 helper</span>
                <button id="c4-min">–</button>
            </div>

            <div class="main">
                <ul class="tabs">
                    ${UI.tab('play', 'Play', true)}
                    ${UI.tab('esp', 'ESP')}
                    ${UI.tab('site', 'Site')}
                    ${UI.tab('stats', 'Stats')}
                    ${UI.tab('config', 'Config')}
                </ul>

                <div class="content">
                    ${UI.page('play', UI.play(), true)}
                    ${UI.page('esp', UI.esp())}
                    ${UI.page('site', UI.site())}
                    ${UI.page('stats', UI.stats())}
                    ${UI.page('config', UI.config())}
                </div>
            </div>
        </div>

        <div id="c4-mark"></div>
        <div id="c4-tip"></div>
    `;

    static score = (score, { win, troll, ownWin, draw }) => {
        if (score == null) return '·';
        if (troll && score === ownWin) return 'W!';
        if (troll && score >= draw - 1) return 'TIE';
        if (!troll && score > win - 1000) return `W${Math.ceil((win - score) / 2)}`;
        if (score < 1000 - win) return `L${Math.ceil((win + score) / 2)}`;

        return `${Math.round(score)}`;
    };

    static meaning = (score, { win, troll, ownWin, draw }) => {
        if (score == null) return 'not an option right now';
        if (troll && score === ownWin) return 'forces you to win';
        if (troll && score >= draw - 1) return 'leads to a tie';
        if (!troll && score > win - 1000) return `forced win in ${Math.ceil((win - score) / 2)}`;
        if (score < 1000 - win) return `forced loss in ${Math.ceil((win + score) / 2)}`;

        return `estimate ${Math.round(score)}, higher is better`;
    };

    static edge = (score, win) => {
        if (score > win - 1000) return 100;
        if (score < 1000 - win) return 0;

        return Math.max(3, Math.min(97, 50 + 50 * Math.tanh(score / 120)));
    };

    constructor(settings, stats, actions) {
        this.settings = settings;
        this.stats = stats;
        this.actions = actions;

        document.head.append(Object.assign(document.createElement('style'), { textContent: UI.CSS }));

        this.root = Object.assign(document.createElement('div'), { id: 'c4-panel', innerHTML: UI.markup() });

        document.body.append(this.root);

        this.bindTips();
        this.bindControls();
        this.bindTabs();
        this.bindWindow();
        this.bindButtons();

        this.sync();
        this.renderStats();
        this.status('Waiting for board…');
    }

    $ = (id) => this.root.querySelector(`#${id}`);

    text = (id, value) => {
        this.$(id).textContent = value;
    };

    contains = (node) => this.root.contains(node);

    owner = (path) => {
        const keys = path.split('.');
        const key = keys.pop();

        return [keys.reduce((group, name) => group[name], this.settings), key];
    };

    read = (el, old) => {
        if (el.type === 'checkbox') return el.checked;
        if (el.type !== 'number') return typeof old === 'number' ? +el.value : el.value;

        return el.value === '' ? old : Math.min(+el.max, Math.max(+el.min, +el.value));
    };

    bindTips = () => {
        Object.entries(UI.TIPS).forEach(([key, tip]) => {
            const el = this.root.querySelector(`[data-bind="${key}"], [id="${key}"]`);
            const holder = el.matches('button') ? el : el.closest('.field, .stat, .check') ?? el;

            holder.dataset.tip = tip;
        });

        this.root.querySelectorAll('fieldset').forEach((box) => {
            box.dataset.tip = UI.BOXES[box.querySelector('legend').textContent];
        });

        const tip = this.$('c4-tip');

        let hovered = null;
        let timer = null;
        let x = 0;
        let y = 0;

        const hide = () => {
            clearTimeout(timer);
            tip.classList.remove('open');
        };

        const show = () => {
            if (!hovered?.isConnected || !hovered.dataset.tip) return;

            tip.textContent = hovered.dataset.tip;
            tip.classList.add('open');

            const { width, height } = tip.getBoundingClientRect();

            tip.style.left = `${Math.max(0, Math.min(x + 12, innerWidth - width - 4))}px`;
            tip.style.top = `${y + 18 + height > innerHeight ? Math.max(0, y - height - 8) : y + 18}px`;
        };

        addEventListener('mousemove', ({ clientX, clientY }) => {
            x = clientX;
            y = clientY;
        });

        document.addEventListener('mouseover', ({ target }) => {
            const el = target.closest?.('[data-tip]') ?? null;

            if (el === hovered) return;

            hovered = el;

            hide();

            if (el) timer = setTimeout(show, 1000);
        });

        document.documentElement.addEventListener('mouseleave', () => {
            hovered = null;

            hide();
        });

        addEventListener('mousedown', hide, true);
    };

    bindControls = () => {
        this.root.querySelectorAll('[data-bind]').forEach((el) => {
            const [group, key] = this.owner(el.dataset.bind);

            el.addEventListener(el.type === 'color' ? 'input' : 'change', () => {
                group[key] = this.read(el, group[key]);

                this.settings.save();
                this.sync();
                this.actions[el.dataset.on]?.();
            });
        });
    };

    sync = () => {
        this.root.querySelectorAll('[data-bind]').forEach((el) => {
            const [group, key] = this.owner(el.dataset.bind);

            if (el.type === 'checkbox') el.checked = group[key];
            else el.value = group[key] || el.dataset.fallback || group[key];
        });

        this.root.querySelectorAll('[data-show]').forEach((el) => {
            el.style.display = this.settings[el.dataset.show] ? '' : 'none';
        });

        this.root.classList.toggle('mini', this.settings.minimized);

        this.visibility();
        this.position();
    };

    bindTabs = () => {
        this.root.querySelectorAll('.tabs li').forEach((tab) => {
            tab.onclick = () => {
                this.root.querySelectorAll('.tabs li, .page').forEach((el) => el.classList.remove('current'));

                tab.classList.add('current');
                this.$(tab.dataset.page).classList.add('current');
            };
        });
    };

    mini = (on) => {
        this.settings.minimized = on;
        this.settings.save();

        this.sync();
    };

    toggle = () => this.mini(!this.settings.minimized);

    visibility = () => {
        this.root.style.display = this.settings.site.hideOutside && !Page.hasBoard() ? 'none' : '';
    };

    place = (x, y) => {
        const { width, height } = this.root.getBoundingClientRect();
        const pos = { x: Math.max(0, Math.min(x, innerWidth - width)), y: Math.max(0, Math.min(y, innerHeight - height)) };

        Object.assign(this.root.style, { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto' });

        return pos;
    };

    position = () => {
        const { pos } = this.settings;

        if (pos) return this.place(pos.x, pos.y);

        Object.assign(this.root.style, { left: '', top: '', right: '' });
    };

    bindWindow = () => {
        this.$('c4-min').onclick = () => this.mini(true);
        this.$('c4-mark').onclick = () => this.mini(false);

        addEventListener('resize', this.position);

        this.$('c4-drag').onmousedown = (event) => {
            if (event.target.closest('button')) return;

            event.preventDefault();

            const { left, top } = this.root.getBoundingClientRect();
            const dx = event.clientX - left;
            const dy = event.clientY - top;

            const move = ({ clientX, clientY }) => {
                this.settings.pos = this.place(clientX - dx, clientY - dy);
            };

            const up = () => {
                removeEventListener('mousemove', move);
                removeEventListener('mouseup', up);

                this.settings.save();
            };

            addEventListener('mousemove', move);
            addEventListener('mouseup', up);
        };
    };

    flash = (button, text) => {
        button.dataset.text ??= button.textContent;
        button.textContent = text;

        clearTimeout(button.timer);

        button.timer = setTimeout(() => {
            button.textContent = button.dataset.text;
        }, 900);
    };

    copy = async (button, text) => {
        try {
            await navigator.clipboard.writeText(text);

            this.flash(button, 'Copied');
        } catch {
            this.flash(button, 'Failed');
        }
    };

    paste = (button) => {
        const text = prompt('Paste your exported settings:');

        if (!text) return;

        try {
            const skipped = this.settings.paste(text);

            this.sync();
            this.actions.site();
            this.actions.rerun();

            this.flash(button, skipped ? `Imported, ${skipped} skipped` : 'Imported');
        } catch {
            this.flash(button, 'Invalid settings');
        }
    };

    bindButtons = () => {
        const { settings, stats, actions } = this;

        const clicks = {
            'c4-room': (button) => this.copy(button, location.href),
            'c4-copy-moves': (button) => this.copy(button, actions.moves()),
            'c4-copy-board': (button) => this.copy(button, actions.board()),
            'c4-copy': (button) => this.copy(button, settings.copy()),
            'c4-paste': this.paste,

            'c4-position': () => {
                settings.pos = null;
                settings.save();

                this.position();
            },

            'c4-colours': () => {
                settings.site.lightColor = '';
                settings.site.darkColor = '';
                settings.save();

                this.sync();
                actions.site();
            },

            'c4-reset': () => {
                if (!confirm('Reset all saved Connect 4 results?')) return;

                stats.reset();

                this.renderStats();
            },
        };

        Object.entries(clicks).forEach(([id, click]) => {
            this.$(id).onclick = ({ currentTarget }) => click(currentTarget);
        });

        this.root.querySelectorAll('[data-chat]').forEach((button) => {
            button.onclick = () => this.flash(button, Page.chat(button.dataset.chat) ? 'Sent' : 'No chat');
        });
    };

    status = (best, verdict = '', info) => {
        this.text('c4-best', best);
        this.text('c4-verdict', verdict);

        this.$('c4-verdict').classList.toggle('bad', verdict.includes('losing'));

        if (info !== undefined) this.text('c4-info', info);

        const mark = this.$('c4-mark');

        mark.innerHTML = 'c4 helper | <b></b>';
        mark.querySelector('b').textContent = best;
    };

    columns = (res) => {
        this.$('c4-cols').innerHTML = (res?.scores ?? [])
            .map((score, col) => `<div class="${col === res.best ? 'top' : ''}" data-tip="Column ${col + 1}: ${UI.meaning(score, res)}">${col + 1}<br>${UI.score(score, res)}</div>`)
            .join('');
    };

    boardInfo = (info) => {
        if (!info) return;

        this.text('c4-threats', info.threats);
        this.text('c4-line-label', info.label);
        this.text('c4-line', info.line);
    };

    prediction = ({ over, adv, advSolved, win, depth }, turn) => {
        if (over || adv === undefined) return;

        const limit = win - 1000;
        const edge = UI.edge(adv, win);
        const me = turn ? edge : 100 - edge;
        const moves = Math.ceil((win - Math.abs(adv)) / 2);
        const ahead = turn ? adv : -adv;

        this.$('c4-edge').style.width = `${me}%`;
        this.text('c4-edge-text', `You ${Math.round(me)}% · Them ${Math.round(100 - me)}%`);

        if (ahead > limit) return this.text('c4-outlook', `You can force a win in ${moves}`);
        if (ahead < -limit) return this.text('c4-outlook', `They can force a win in ${moves}`);

        this.text('c4-outlook', advSolved ? 'Tie with perfect play' : `Unclear at depth ${depth}`);
    };

    tracker = ({ last, moves, matched, history, partial }) => {
        this.text('c4-opp-last', last);
        this.text('c4-opp-match', moves ? `${matched} of ${moves} moves` : '–');

        const list = history.map((col) => col + 1).join(' ');
        const empty = partial ? 'Joined mid-game, recording from the next move' : 'No moves yet';

        this.text('c4-moves', history.length ? `${partial ? '… ' : ''}${list}` : empty);
    };

    clocks = (text) => this.text('c4-clocks', text);

    renderStats = () => {
        const { total, mode, opp } = this.stats;
        const played = ({ w, d, l }) => w + d + l;

        const fill = (table, rows) => {
            table.innerHTML = '<tr><th></th><th>Won</th><th>Tied</th><th>Lost</th></tr>';

            rows.forEach(([name, { w, d, l }]) => {
                const row = table.insertRow();

                [name, w, d, l].forEach((value) => {
                    row.insertCell().textContent = value;
                });
            });
        };

        const rivals = Object.entries(opp).sort(([, a], [, b]) => played(b) - played(a)).slice(0, 6);

        fill(this.$('c4-tally'), [['All games', total], ['Win mode', mode.win], ['Tie mode', mode.tie], ['Let them win', mode.lose]]);
        fill(this.$('c4-opps'), rivals);

        if (!rivals.length) this.$('c4-opps').innerHTML = '<tr><td>No finished games yet</td></tr>';
    };
}

class App {
    settings = new Settings();
    stats = new Stats();
    site = new SiteTweaks(this.settings);
    alerts = new Alerts(this.settings);
    games = new GameTracker();
    overlay = new BoardOverlay(this.settings);
    search = new SearchClient((res) => this.result(res), () => this.rerun());

    ui = new UI(this.settings, this.stats, {
        rerun: () => this.rerun(),
        redraw: () => this.redraw(),
        site: () => this.site.apply(),
        sound: () => this.alerts.beep(),
        title: () => this.alerts.restore(),
        moves: () => this.games.text(),
        board: () => Page.board()?.board.map((row) => row.map((piece) => '.OX'[piece]).join(' ')).join('\n') ?? '',
    });

    key = '';
    game = null;
    timer = null;
    auto = null;
    ours = false;

    start = () => {
        console.info('[connect 4 helper] running v2.4.0 on', location.host);

        this.site.apply();
        this.ui.tracker(this.games);

        this.bindKeys();
        this.bindHover();

        setInterval(this.second, 1000);

        new MutationObserver((list) => {
            if (list.some(({ target }) => !this.ui.contains(target))) this.schedule();
        }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

        this.schedule();
    };

    schedule = () => {
        clearTimeout(this.timer);

        this.timer = setTimeout(this.tick, 120);
    };

    rerun = () => {
        this.key = '';

        this.schedule();
    };

    redraw = () => this.ui.boardInfo(this.overlay.draw(this.game));

    idle = () => {
        if (this.game) this.overlay.clear();

        this.game = null;
        this.key = '';

        this.games.forget();
        this.alerts.restore();

        this.ui.status('Waiting for board…', '', '');
        this.ui.columns();
    };

    tick = () => {
        this.ui.visibility();

        const found = Page.board();

        if (!found) return this.idle();

        const { color, timeMs, mode, autoplay, humanize, humanSlip } = this.settings;
        const players = Page.players();
        const mine = Page.color(players, color);
        const toMove = Page.turn(found, mine, players);
        const key = [Page.key(found), toMove, mine, timeMs, mode, autoplay, humanize, humanSlip].join(':');

        if (key === this.key) {
            if (this.game?.res && !this.game.res.over && this.overlay.missing()) this.redraw();

            return;
        }

        this.key = key;

        clearTimeout(this.auto);

        this.games.update(found, mine);
        this.ui.tracker(this.games);

        const turn = toMove === mine;

        if (turn && !this.ours && found.n1 + found.n2) this.alerts.turn();
        if (!turn) this.alerts.restore();

        this.ours = turn;
        this.game = { found, mine, toMove, key, players, res: null };

        this.ui.status('Thinking…', '', this.describe());
        this.redraw();

        this.search.run({
            rows: found.R,
            cols: found.C,
            board: found.board,
            toMove,
            timeMs,
            troll: mode === 'win' ? 0 : mine,
            lose: mode === 'lose',
        });
    };

    describe = (res) => {
        const { mine, toMove } = this.game;
        const { color, mode } = this.settings;

        const who = toMove === mine ? 'Your move' : "Opponent's move";
        const depth = res ? ` · depth ${res.depth}${res.solved ? ' (solved)' : ''}` : '';
        const side = mine === 1 ? 'light' : 'dark';
        const auto = color === 'auto' ? ' (auto)' : '';

        return `${who}${depth} · you are ${side}${auto}${UI.MODES[mode]}`;
    };

    verdict = ({ phase, troll, score, ownWin, draw, model, win }, turn) => {
        const limit = win - 1000;

        if (phase) return { resist: 'putting up a fight', open: 'opening a path', give: 'leaving the door open' }[phase];

        if (troll) {
            if (score === ownWin) return "can't dodge winning";
            if (score >= draw - 1) return model === 'guaranteed' ? 'tie guaranteed' : 'tie unless they gift you a win';

            return score <= -limit ? 'losing' : 'steering to tie';
        }

        if (score > limit) return `${turn ? 'forced win in' : 'they have a forced win in'} ${Math.ceil((win - score) / 2)}`;
        if (score < -limit) return turn ? 'losing' : 'they are losing';

        return '';
    };

    finish = ({ winner }) => {
        const { found, mine, players } = this.game;
        const opponent = players.find(({ color }) => color !== mine)?.name;

        this.ui.status(winner === 0 ? 'Draw' : winner === mine ? 'You won' : 'You lost');
        this.ui.columns();

        if (this.stats.record(Page.key(found), winner, mine, this.settings.mode, opponent)) this.ui.renderStats();

        this.alerts.restore();
        this.redraw();
    };

    slip = (res) => {
        const { score, scores, best, win } = res;
        const { humanize, humanSlip } = this.settings;
        const limit = res.troll ? res.draw - 1 : win - 1000;

        if (!humanize || Math.abs(score) >= limit || Math.random() * 100 >= humanSlip) return res;

        const close = scores.flatMap((value, col) => (col !== best && value !== null && Math.abs(value - score) <= 25 ? [col] : []));

        if (!close.length) return res;

        const col = close[Math.floor(Math.random() * close.length)];

        return { ...res, best: col, score: scores[col] };
    };

    wait = () => {
        const { moveDelay, humanize, humanExtra } = this.settings;

        if (!humanize) return moveDelay + Math.random() * 250;

        return moveDelay * (0.7 + Math.random() * 0.6) + Math.random() * humanExtra;
    };

    result = (raw) => {
        if (!this.game) return;

        if (raw.over) {
            this.game.res = raw;

            return this.finish(raw);
        }

        const { found, mine, toMove, key } = this.game;
        const { autoplay } = this.settings;
        const turn = toMove === mine;
        const res = turn ? this.slip(raw) : raw;

        this.game.res = res;
        this.games.remember(Page.key(found), toMove, raw);

        this.ui.status(`${turn ? 'Play column' : 'They want column'} ${res.best + 1}`, this.verdict(res, turn), this.describe(res));
        this.ui.columns(res);
        this.ui.prediction(res, turn);

        this.redraw();

        if (!autoplay || !turn) return;

        this.auto = setTimeout(() => this.game?.key === key && Page.drop(res.best), this.wait());
    };

    second = () => {
        this.ui.visibility();

        if (!this.game) return this.ui.clocks('–');

        const players = Page.players();
        const me = players.find(({ color }) => color === this.game.mine);
        const them = players.find(({ color }) => color !== this.game.mine);

        this.ui.clocks(`${me?.clock || '–'} / ${them?.clock || '–'}`);
        this.alerts.clock(me);
    };

    bindKeys = () => {
        addEventListener('keydown', (event) => {
            const { key, code, target, ctrlKey, altKey, metaKey } = event;

            if (key === 'Insert') return this.ui.toggle();
            if (!this.settings.site.hotkeys || ctrlKey || altKey || metaKey) return;
            if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName)) return;

            const { game } = this;

            if (!game || game.toMove !== game.mine) return;

            if (/^[1-9]$/.test(key)) Page.drop(key - 1);

            if (code === 'Space' && game.res && !game.res.over) {
                event.preventDefault();

                Page.drop(game.res.best);
            }
        });
    };

    bindHover = () => {
        document.addEventListener('mouseover', ({ target }) => {
            if (!this.settings.esp.hover) return;

            const match = target.closest?.('#connect4 .grid-item')?.className.match(/cell-\d+-(\d+)/);
            const col = match ? match[1] - 1 : null;

            if (col === this.overlay.hover) return;

            this.overlay.hover = col;

            this.redraw();
        });
    };
}

new App().start();
