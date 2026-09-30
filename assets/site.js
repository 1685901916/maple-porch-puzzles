(function () {
  "use strict";
  const P = window.Puzzles, $ = s => document.querySelector(s);

  // Print / answer-key controls shared by every tool page.
  function wireSheetControls() {
    const key = $("#with-key"), show = $("#show-answers"), print = $("#print-btn");
    if (key) {
      const sync = () => document.body.classList.toggle("no-key", !key.checked);
      key.addEventListener("change", sync); sync();
    }
    if (show) show.addEventListener("click", () => {
      const on = document.body.classList.toggle("show-answers");
      show.textContent = on ? "Hide answers" : "Show answers";
    });
    if (print) print.addEventListener("click", () => window.print());
  }

  function wordSheet(title, words, p, meta) {
    const list = words.map(w => `<li>${P.esc(w.show)}</li>`).join("");
    return `<section class="sheet"><h2>${P.esc(title)}</h2><p class="meta">${P.esc(meta)}</p>${P.wordSearchSVG(p, false)}<ul class="words">${list}</ul></section>` +
      `<section class="sheet answer-page"><h2>${P.esc(title)} – Answers</h2>${P.wordSearchSVG(p, true)}</section>`;
  }
  const LEVEL_TEXT = { easy: "Words go across, down and diagonally down", medium: "Words go across, down and both diagonals", hard: "Words go in all 8 directions, including backwards" };

  // Word search maker
  const wsForm = $("#ws-form");
  if (wsForm) {
    const out = $("#ws-out"), notes = $("#ws-notes");
    const themes = JSON.parse($("#ws-themes").textContent);
    const build = () => {
      const f = new FormData(wsForm);
      const prep = P.prepareWords(f.get("words") || "");
      notes.innerHTML = prep.notes.map(n => `<p>${P.esc(n)}</p>`).join("");
      notes.hidden = !prep.notes.length;
      if (prep.words.length < 3) { notes.hidden = false; notes.innerHTML += "<p>Please enter at least 3 words.</p>"; return; }
      const level = f.get("level"), sizeSel = f.get("size");
      const keys = prep.words.map(w => w.key);
      const size = sizeSel === "auto" ? P.autoSize(keys) : Math.max(+sizeSel, Math.max(...keys.map(k => k.length)));
      try {
        const p = P.makeWordSearch(keys, size, level, (Math.random() * 2 ** 32) >>> 0);
        const title = (f.get("title") || "Word Search").trim();
        out.innerHTML = wordSheet(title, prep.words, p, `${LEVEL_TEXT[level]} · ${p.size} × ${p.size}`);
        $("#ws-actions").hidden = false;
        out.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (e) { notes.hidden = false; notes.innerHTML += `<p>${P.esc(e.message)}</p>`; }
    };
    wsForm.addEventListener("submit", e => { e.preventDefault(); build(); });
    $("#ws-random").addEventListener("click", () => {
      const t = themes[Math.floor(Math.random() * themes.length)];
      wsForm.elements.title.value = t[0];
      wsForm.elements.words.value = t[1].join("\n");
      build();
    });
    wireSheetControls();
  }

  // Printable theme page: pre-rendered puzzle, "new grid" button re-shuffles the same words.
  const theme = $("#ws-theme");
  if (theme) {
    const data = JSON.parse(theme.textContent);
    const words = data.words.map(w => ({ show: w, key: P.clean(w) }));
    const again = $("#ws-again");
    if (again) again.addEventListener("click", () => {
      const p = P.makeWordSearch(words.map(w => w.key), data.size, "easy", (Math.random() * 2 ** 32) >>> 0);
      $("#ws-out").innerHTML = wordSheet(data.title, words, p, `${LEVEL_TEXT.easy} · ${p.size} × ${p.size}`);
    });
    wireSheetControls();
  }

  // Sudoku maker + daily sudoku
  const LEVEL_NAME = { easy: "Easy", medium: "Medium", hard: "Hard" };
  function sudokuSheets(list, heading) {
    const pages = list.map((s, i) => `<section class="sheet"><h2>${P.esc(heading(s, i))}</h2><p class="meta">${LEVEL_NAME[s.level]} · ${s.clues} clues · Fill every row, column and 3 × 3 box with 1–9</p>${P.sudokuSVG(s, false)}</section>`).join("");
    const answers = list.map((s, i) => `<figure>${P.sudokuSVG(s, true)}<figcaption>${P.esc(heading(s, i))}</figcaption></figure>`).join("");
    return pages + `<section class="sheet answer-page"><h2>Answers</h2><div class="answers-grid">${answers}</div></section>`;
  }

  const suForm = $("#su-form");
  if (suForm) {
    const out = $("#su-out");
    suForm.addEventListener("submit", e => {
      e.preventDefault();
      const f = new FormData(suForm), level = f.get("level"), count = +f.get("count");
      const btn = suForm.querySelector("button"); btn.disabled = true; btn.textContent = "Making puzzles…";
      setTimeout(() => {
        const list = [];
        for (let i = 0; i < count; i++) list.push(P.makeSudoku(level, (Math.random() * 2 ** 32) >>> 0));
        out.innerHTML = sudokuSheets(list, (s, i) => `Large Print Sudoku #${i + 1}`);
        $("#su-actions").hidden = false; btn.disabled = false; btn.textContent = "Make puzzles";
        out.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 30);
    });
    wireSheetControls();
  }

  const daily = $("#daily");
  if (daily) {
    const d = new Date(), iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const nice = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    $("#daily-date").textContent = nice;
    const show = level => {
      const s = P.makeSudoku(level, P.hashSeed(`daily-${iso}-${level}`));
      $("#su-out").innerHTML = sudokuSheets([s], () => `Daily Sudoku – ${nice}`);
      document.querySelectorAll("[data-level]").forEach(b => b.classList.toggle("secondary", b.dataset.level !== level));
    };
    document.querySelectorAll("[data-level]").forEach(b => b.addEventListener("click", () => show(b.dataset.level)));
    show("easy");
    wireSheetControls();
  }

  // Pre-rendered sudoku page (answers already in the HTML).
  if ($("#su-static")) wireSheetControls();
})();
