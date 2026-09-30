/* Big Letter Puzzles: word search + sudoku generators (ported from the E1 book engines).
   Everything runs in the browser; nothing is sent to a server. */
(function (global) {
  "use strict";

  // ---------- shared ----------
  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function shuffle(a, r) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // ---------- word search ----------
  const DIRS = {
    easy: [[0, 1], [1, 0], [1, 1]],
    medium: [[0, 1], [1, 0], [1, 1], [-1, 1]],
    hard: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]],
  };
  const clean = w => w.toUpperCase().replace(/[^A-Z]/g, "");

  function occurrences(grid, word, dirs) {
    const n = grid.length, k = word.length;
    let hits = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (grid[r][c] !== word[0]) continue;
      for (const [dr, dc] of dirs) {
        const er = r + dr * (k - 1), ec = c + dc * (k - 1);
        if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
        let ok = true;
        for (let i = 1; i < k && ok; i++) ok = grid[r + dr * i][c + dc * i] === word[i];
        if (ok) hits++;
      }
    }
    return hits;
  }

  function placeAll(words, size, dirs, r, tries) {
    for (let t = 0; t < tries; t++) {
      const grid = Array.from({ length: size }, () => Array(size).fill(null));
      const placed = [];
      let ok = true;
      for (const w of [...words].sort((a, b) => b.length - a.length)) {
        const spots = [];
        for (let rr = 0; rr < size; rr++) for (let c = 0; c < size; c++) for (const [dr, dc] of dirs) {
          const er = rr + dr * (w.length - 1), ec = c + dc * (w.length - 1);
          if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
          let overlap = 0, fits = true;
          for (let i = 0; i < w.length; i++) {
            const g = grid[rr + dr * i][c + dc * i];
            if (g !== null && g !== w[i]) { fits = false; break; }
            if (g === w[i]) overlap++;
          }
          if (fits) spots.push([overlap, rr, c, dr, dc]);
        }
        if (!spots.length) { ok = false; break; }
        shuffle(spots, r);
        if (r() < 0.4) spots.sort((a, b) => Math.min(b[0], 1) - Math.min(a[0], 1));
        const [, rr, c, dr, dc] = spots[0];
        for (let i = 0; i < w.length; i++) grid[rr + dr * i][c + dc * i] = w[i];
        placed.push([w, rr, c, dr, dc]);
      }
      if (ok) return { grid, placed };
    }
    return null;
  }

  function autoSize(words) {
    const longest = Math.max(...words.map(w => w.length));
    const total = words.reduce((s, w) => s + w.length, 0);
    return Math.min(20, Math.max(10, longest, Math.ceil(Math.sqrt(total * 2.1))));
  }

  // Returns {grid:[str], placed:[[w,r,c,dr,dc]], words, size} or throws.
  function makeWordSearch(words, size, level, seed) {
    const r = rng(seed);
    const dirs = DIRS[level] || DIRS.easy;
    const letters = [...new Set(words.join(""))].join("") + "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (let s = size; s <= Math.max(size, 22); s++) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const res = placeAll(words, s, dirs, r, 60);
        if (!res) break; // grid too small, grow it
        const full = res.grid.map(row => row.map(ch => ch !== null ? ch : letters[Math.floor(r() * letters.length)]));
        if (words.every(w => occurrences(full, w, dirs) === 1)) {
          return { grid: full.map(row => row.join("")), placed: res.placed, words, size: s };
        }
      }
    }
    throw new Error("Could not build a grid with these words. Try fewer or shorter words.");
  }

  // Clean user input: returns {words:[{show, key}], notes:[str]}
  function prepareWords(raw) {
    const notes = [];
    const seen = new Set();
    let items = raw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean).map(show => ({ show: show.toUpperCase(), key: clean(show) }));
    items = items.filter(it => {
      if (it.key.length < 2) { if (it.show) notes.push(`Skipped "${it.show}" (too short).`); return false; }
      if (it.key.length > 20) { notes.push(`Skipped "${it.show}" (longer than 20 letters).`); return false; }
      if (seen.has(it.key)) return false;
      seen.add(it.key); return true;
    });
    // A word hidden inside another word would be found twice, so drop the shorter one.
    const keep = items.filter(it => {
      const host = items.find(o => o !== it && o.key.length > it.key.length && o.key.includes(it.key));
      if (host) notes.push(`Skipped "${it.show}" because it is inside "${host.show}".`);
      return !host;
    });
    if (keep.length > 30) { notes.push("Only the first 30 words were used."); keep.length = 30; }
    return { words: keep, notes };
  }

  function wordSearchSVG(p, answers) {
    const n = p.grid.length, cs = 40, pad = 10, W = n * cs + pad * 2;
    const out = [`<svg class="ws-grid" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${answers ? "Answer key" : "Word search grid"}, ${n} by ${n} letters">`,
      `<rect x="1" y="1" width="${W - 2}" height="${W - 2}" rx="12" fill="#fff" stroke="#1d2433" stroke-width="2"/>`];
    if (answers) {
      for (const [w, r, c, dr, dc] of p.placed) {
        const x1 = pad + c * cs + cs / 2, y1 = pad + r * cs + cs / 2;
        const x2 = x1 + dc * (w.length - 1) * cs, y2 = y1 + dr * (w.length - 1) * cs;
        out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e8a33d" stroke-opacity="0.5" stroke-width="${cs * 0.74}" stroke-linecap="round"/>`);
      }
    }
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      out.push(`<text x="${pad + c * cs + cs / 2}" y="${pad + r * cs + cs / 2 + 9}">${p.grid[r][c]}</text>`);
    }
    out.push("</svg>");
    return out.join("");
  }

  // ---------- sudoku ----------
  const BOX = i => ((i / 27) | 0) * 3 + (((i % 9) / 3) | 0);
  function popcount(m) { let k = 0; while (m) { m &= m - 1; k++; } return k; }

  function countSolutions(cells, limit) {
    const g = cells.slice(), rows = new Uint16Array(9), cols = new Uint16Array(9), boxes = new Uint16Array(9);
    for (let i = 0; i < 81; i++) {
      const v = g[i]; if (!v) continue;
      const b = 1 << v, r = (i / 9) | 0, c = i % 9, x = BOX(i);
      if ((rows[r] | cols[c] | boxes[x]) & b) return 0;
      rows[r] |= b; cols[c] |= b; boxes[x] |= b;
    }
    let count = 0;
    (function rec() {
      let best = -1, bestMask = 0, bestK = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = ~(rows[(i / 9) | 0] | cols[i % 9] | boxes[BOX(i)]) & 0x3FE, k = popcount(m);
        if (k < bestK) { best = i; bestMask = m; bestK = k; if (!k) return; }
      }
      if (best < 0) { count++; return; }
      const r = (best / 9) | 0, c = best % 9, x = BOX(best);
      for (let v = 1; v <= 9; v++) {
        const b = 1 << v; if (!(bestMask & b)) continue;
        g[best] = v; rows[r] |= b; cols[c] |= b; boxes[x] |= b;
        rec();
        g[best] = 0; rows[r] &= ~b; cols[c] &= ~b; boxes[x] &= ~b;
        if (count >= limit) return;
      }
    })();
    return count;
  }

  function fullGrid(r) {
    const g = new Array(81).fill(0);
    (function rec(i) {
      if (i === 81) return true;
      const row = (i / 9) | 0, col = i % 9, x = BOX(i);
      for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], r)) {
        let ok = true;
        for (let k = 0; k < 81 && ok; k++) if (g[k] === v && ((k / 9 | 0) === row || k % 9 === col || BOX(k) === x)) ok = false;
        if (!ok) continue;
        g[i] = v;
        if (rec(i + 1)) return true;
        g[i] = 0;
      }
      return false;
    })(0);
    return g;
  }

  // True if the puzzle can be finished with naked and hidden singles only (no guessing).
  function singlesSolvable(cells) {
    const g = cells.slice();
    const peers = i => { const r = (i / 9) | 0, c = i % 9, x = BOX(i); let m = 0; for (let k = 0; k < 81; k++) if (g[k] && ((k / 9 | 0) === r || k % 9 === c || BOX(k) === x)) m |= 1 << g[k]; return m; };
    let progress = true;
    while (progress) {
      progress = false;
      const cand = new Array(81).fill(0);
      for (let i = 0; i < 81; i++) if (!g[i]) { cand[i] = ~peers(i) & 0x3FE; if (!cand[i]) return false; }
      for (let i = 0; i < 81; i++) if (!g[i] && popcount(cand[i]) === 1) { g[i] = Math.log2(cand[i]); progress = true; }
      if (progress) continue;
      const units = [];
      for (let u = 0; u < 9; u++) {
        units.push([...Array(9)].map((_, k) => u * 9 + k));
        units.push([...Array(9)].map((_, k) => k * 9 + u));
        units.push([...Array(9)].map((_, k) => (((u / 3) | 0) * 3 + ((k / 3) | 0)) * 9 + (u % 3) * 3 + (k % 3)));
      }
      for (const unit of units) for (let v = 1; v <= 9 && !progress; v++) {
        const spots = unit.filter(i => !g[i] && (cand[i] & (1 << v)));
        if (spots.length === 1 && !unit.some(i => g[i] === v)) { g[spots[0]] = v; progress = true; }
      }
    }
    return g.every(Boolean);
  }

  const SUDOKU_LEVELS = { easy: [38, true], medium: [31, true], hard: [26, false] };

  function makeSudoku(level, seed) {
    const r = rng(seed);
    const [target, needSingles] = SUDOKU_LEVELS[level] || SUDOKU_LEVELS.easy;
    for (let attempt = 0; attempt < 30; attempt++) {
      const sol = fullGrid(r), puz = sol.slice();
      let clues = 81;
      for (const i of shuffle([...Array(41).keys()], r)) {
        if (clues <= target) break;
        const j = 80 - i, a = puz[i], b = puz[j];
        puz[i] = puz[j] = 0;
        if (countSolutions(puz, 2) === 1 && (!needSingles || singlesSolvable(puz))) clues -= i === j ? 1 : 2;
        else { puz[i] = a; puz[j] = b; }
      }
      // Hard should need more than singles; accept a singles-only grid only after many tries.
      if (!needSingles && attempt < 20 && singlesSolvable(puz)) continue;
      if (clues <= target + 3) return { puzzle: puz, solution: sol, clues, level };
    }
    throw new Error("Could not make a puzzle, please try again.");
  }

  function sudokuSVG(s, answers) {
    const cs = 56, pad = 6, W = cs * 9 + pad * 2, out = [];
    out.push(`<svg class="su-grid" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${answers ? "Sudoku answer" : "Sudoku puzzle"}">`);
    out.push(`<rect x="${pad}" y="${pad}" width="${cs * 9}" height="${cs * 9}" fill="#fff"/>`);
    for (let k = 1; k < 9; k++) {
      if (k % 3 === 0) continue;
      out.push(`<line x1="${pad + k * cs}" y1="${pad}" x2="${pad + k * cs}" y2="${pad + 9 * cs}" stroke="#8f98a8" stroke-width="1.2"/>`);
      out.push(`<line x1="${pad}" y1="${pad + k * cs}" x2="${pad + 9 * cs}" y2="${pad + k * cs}" stroke="#8f98a8" stroke-width="1.2"/>`);
    }
    for (let k = 0; k <= 9; k += 3) {
      out.push(`<line x1="${pad + k * cs}" y1="${pad - 1.5}" x2="${pad + k * cs}" y2="${pad + 9 * cs + 1.5}" stroke="#1d2433" stroke-width="3.5"/>`);
      out.push(`<line x1="${pad - 1.5}" y1="${pad + k * cs}" x2="${pad + 9 * cs + 1.5}" y2="${pad + k * cs}" stroke="#1d2433" stroke-width="3.5"/>`);
    }
    for (let i = 0; i < 81; i++) {
      const given = s.puzzle[i], v = given || (answers ? s.solution[i] : 0);
      if (!v) continue;
      const x = pad + (i % 9) * cs + cs / 2, y = pad + ((i / 9) | 0) * cs + cs / 2 + 12;
      out.push(`<text x="${x}" y="${y}"${given ? "" : ' class="f"'}>${v}</text>`);
    }
    out.push("</svg>");
    return out.join("");
  }

  global.Puzzles = { rng, hashSeed, esc, clean, prepareWords, autoSize, makeWordSearch, wordSearchSVG, makeSudoku, sudokuSVG, countSolutions, singlesSolvable };
})(typeof window !== "undefined" ? window : globalThis);
