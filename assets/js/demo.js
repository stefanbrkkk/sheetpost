/* ============================================================
   SHEETPOST V2 — the live FA(3) demo engine.
   Runs 100% in the browser: parse -> map -> validate -> preview
   -> simulated filing. One free run, then the gate.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var t = window.SP_T || function (k) { return k; };
  var store = window.SPStore || {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v === null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* noop */ } }
  };

  var state = {
    raw: '',
    rows: [],          /* {name, qty, unit, vat} */
    headers: [],
    colmap: {},        /* srcIndex -> 'name'|'qty'|'unit'|'vat'|'skip' */
    xml: '',
    invoiceNo: ''
  };

  function prefersReduced() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  var panes = $$('.dpane');
  var steps = $$('.dstep');

  function showPane(n, moveFocus) {
    var wasFocused = document.activeElement;
    panes.forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-pane') === String(n)); });
    steps.forEach(function (s) {
      var sn = Number(s.getAttribute('data-step'));
      s.classList.toggle('active', sn === n);
      s.classList.toggle('done', sn < n);
    });
    /* the button that moved us here has just been display:none'd, so focus
       would otherwise fall back to <body> */
    if (moveFocus === false) return;
    var pane = panes.filter(function (p) { return p.getAttribute('data-pane') === String(n); })[0];
    if (!pane) return;
    if (wasFocused && wasFocused !== document.body && pane.contains(wasFocused)) return;
    var target = pane.querySelector('.dpane-h, h3, [tabindex="0"], input, button:not([disabled])');
    if (target) {
      if (!target.hasAttribute('tabindex') && /^H\d$/.test(target.tagName)) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  }

  /* ================= parsing ================= */
  function detectDelimiter(line) {
    var cands = ['\t', ';', ',', '|'];
    var best = '\t', bestN = 0;
    cands.forEach(function (c) {
      var n = line.split(c).length;
      if (n > bestN) { best = c; bestN = n; }
    });
    return best;
  }
  function splitLine(line, d) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; continue; }  /* "" is a literal quote */
        q = !q;
        continue;
      }
      if (ch === d && !q) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  }
  /* currency markers we recognise; anything but PLN cannot be filed to KSeF */
  var CUR_RE = /(zł|zl|PLN|EUR|€|USD|\$|GBP|£|RON|lei|HRK|CZK|Kč|CHF)/i;
  var FOREIGN_RE = /(EUR|€|USD|\$|GBP|£|RON|lei|HRK|CZK|Kč|CHF)/i;
  function currencyOfCell(v) {
    if (typeof v !== 'string') return null;
    var m = v.match(CUR_RE);
    return m ? m[0] : null;
  }
  function isForeignAmount(v) {
    return typeof v === 'string' && FOREIGN_RE.test(v);
  }
  /* "1 200,50" (pl) and "1,200.50" (en) are the same number. Whichever
     separator comes LAST is the decimal point; everything before it groups. */
  function parseAmount(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (typeof v !== 'string') return NaN;
    var s = v.replace(/\s|\u00A0/g, '').replace(CUR_RE, '').trim();
    if (!s) return NaN;
    var lastComma = s.lastIndexOf(',');
    var lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');   /* 1.200,50 */
      else s = s.replace(/,/g, '');                                          /* 1,200.50 */
    } else if (lastComma >= 0) {
      /* a lone comma is a decimal separator unless it groups thousands (1,200) */
      var after = s.length - lastComma - 1;
      s = (after === 3 && /^\d{1,3}(,\d{3})+$/.test(s)) ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (lastDot >= 0) {
      var afterDot = s.length - lastDot - 1;
      if (afterDot === 3 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');  /* 1.200 */
    }
    var n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  }
  /* FA(3) accepts numeric rates plus the three non-numeric markers:
     zw = exempt, np = not subject to VAT, oo = reverse charge. */
  var VAT_MARKERS = ['zw', 'np', 'oo'];
  function parseVat(v) {
    if (typeof v === 'number') v = String(v);
    if (typeof v !== 'string') return null;
    var s = v.trim().toLowerCase().replace(/%/g, '').replace(',', '.').trim();
    if (!s) return null;
    if (VAT_MARKERS.indexOf(s) >= 0) return s;
    var n = parseFloat(s);
    if (isNaN(n)) return null;
    if (n > 0 && n < 1) n = n * 100;          /* 0.23 -> 23 */
    n = Math.round(n * 100) / 100;
    return [23, 8, 5, 0].indexOf(n) >= 0 ? n : null;
  }
  function vatIsMarker(v) { return typeof v === 'string' && VAT_MARKERS.indexOf(v) >= 0; }
  function looksNumeric(v) { return !isNaN(parseFloat(String(v).replace(',', '.'))) && isFinite(parseFloat(String(v).replace(',', '.'))); }

  /* ---------------------------------------------------------------
     Column detection. Header names come first, because a spreadsheet
     that says "Ilosc" is telling you the truth and no magnitude
     heuristic beats that. Numbers only decide what the header left open.
     --------------------------------------------------------------- */
  var HEADER_WORDS = {
    name: ['nazwa', 'nazwatowaru', 'nazwatowaruuslugi', 'towar', 'usluga', 'produkt', 'pozycja', 'opis',
      'item', 'items', 'description', 'name', 'product', 'service',
      'bezeichnung', 'artikel', 'beschreibung', 'leistung',
      'naziv', 'stavka', 'proizvod', 'usluga',
      'denumire', 'descriere', 'produs', 'serviciu'],
    qty: ['ilosc', 'ilosć', 'szt', 'sztuk', 'liczba', 'qty', 'quantity', 'qnt', 'count',
      'menge', 'anzahl', 'stk', 'kolicina', 'kom', 'cantitate', 'cant', 'buc'],
    unit: ['netto', 'cena', 'cenanetto', 'cenajedn', 'cenajednostkowa', 'jednostkowa', 'price', 'unitprice',
      'net', 'netprice', 'unit', 'preis', 'nettopreis', 'einzelpreis', 'stueckpreis',
      'cijena', 'neto', 'jedinicnacijena', 'pret', 'pretnet', 'pretunitar', 'pretunit'],
    vat: ['vat', 'stawka', 'stawkavat', 'podatek', 'tax', 'taxrate', 'ust', 'mwst', 'steuersatz',
      'pdv', 'stopa', 'tva', 'cota', 'cotatva'],
    /* recognised on purpose so they are never mistaken for something useful */
    skip: ['lp', 'l p', 'nr', 'no', 'poz', 'index', 'idx', 'pos', 'wartosc', 'wartoscnetto', 'kwota',
      'brutto', 'suma', 'razem', 'total', 'amount', 'linetotal', 'summe', 'gesamt', 'iznos', 'ukupno',
      'valoare', 'totalvaloare', 'data', 'date', 'datum', 'jm', 'jednostka', 'unitofmeasure', 'uom']
  };
  function normHeader(h) {
    return String(h || '')
      .toLowerCase()
      .replace(/[ąà]/g, 'a').replace(/[ćč]/g, 'c').replace(/[ęè]/g, 'e').replace(/ł/g, 'l')
      .replace(/[ńñ]/g, 'n').replace(/[óö]/g, 'o').replace(/[śš]/g, 's').replace(/[żź]/g, 'z')
      .replace(/[üu]/g, 'u').replace(/ß/g, 'ss').replace(/[ăâ]/g, 'a').replace(/[țţ]/g, 't').replace(/[șş]/g, 's')
      .replace(/[^a-z0-9]/g, '');
  }
  function headerField(h) {
    var n = normHeader(h);
    if (!n) return null;
    var fields = ['vat', 'qty', 'unit', 'name', 'skip'];
    for (var f = 0; f < fields.length; f++) {
      var words = HEADER_WORDS[fields[f]];
      for (var i = 0; i < words.length; i++) {
        var w = normHeader(words[i]);
        if (n === w) return fields[f];
      }
    }
    for (var f2 = 0; f2 < fields.length; f2++) {
      var words2 = HEADER_WORDS[fields[f2]];
      for (var j = 0; j < words2.length; j++) {
        var w2 = normHeader(words2[j]);
        if (w2.length >= 3 && n.indexOf(w2) >= 0) return fields[f2];
      }
    }
    return null;
  }

  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  /* A sheet often opens with a title or a blank line. Score the first few
     rows and use the best one as the header instead of assuming row 0. */
  function pickHeaderRow(grid, width) {
    var best = -1, bestScore = 0;
    var limit = Math.min(4, grid.length - 1);
    for (var r = 0; r < limit; r++) {
      var row = grid[r];
      var filled = 0, named = 0, numeric = 0;
      for (var c = 0; c < width; c++) {
        var v = String(row[c] || '').trim();
        if (!v) continue;
        filled++;
        if (headerField(v)) named++;
        if (looksNumeric(v.replace('%', ''))) numeric++;
      }
      if (filled < 2) continue;
      var score = named * 3 + (filled - numeric);
      if (named >= 2 && score > bestScore) { bestScore = score; best = r; }
    }
    if (best >= 0) return best;
    /* fall back to "row 0 is a header if it is mostly words" */
    var first = grid[0];
    var wordy = 0, any = 0;
    for (var c2 = 0; c2 < width; c2++) {
      var v2 = String(first[c2] || '').trim();
      if (!v2) continue;
      any++;
      if (!looksNumeric(v2.replace('%', ''))) wordy++;
    }
    return (any >= 2 && wordy >= Math.ceil(any / 2)) ? 0 : -1;
  }

  function parseGrid(grid) {
    if (!grid.length) return { ok: false, rows: 0, headers: [] };
    var width = grid.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    if (!width) return { ok: false, rows: 0, headers: [] };
    grid = grid.map(function (r) { var c = r.slice(); while (c.length < width) c.push(''); return c; });

    var headerRow = pickHeaderRow(grid, width);
    var headers = headerRow >= 0
      ? grid[headerRow]
      : grid[0].map(function (_, i) { return 'kol ' + String.fromCharCode(65 + i); });
    var body = headerRow >= 0 ? grid.slice(headerRow + 1) : grid;
    body = body.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
    if (!body.length) return { ok: false, rows: 0, headers: [] };

    /* --- pass 1: believe the headers --- */
    var byHeader = {};
    var taken = {};
    for (var c = 0; c < width; c++) {
      var f = headerRow >= 0 ? headerField(headers[c]) : null;
      if (!f || f === 'skip') { byHeader[c] = f || null; continue; }
      if (taken[f]) { byHeader[c] = null; continue; }   /* first match wins */
      taken[f] = true;
      byHeader[c] = f;
    }
    var nameCol = -1, qtyCol = -1, unitCol = -1, vatCol = -1;
    Object.keys(byHeader).forEach(function (k) {
      var i = Number(k);
      if (byHeader[k] === 'name') nameCol = i;
      else if (byHeader[k] === 'qty') qtyCol = i;
      else if (byHeader[k] === 'unit') unitCol = i;
      else if (byHeader[k] === 'vat') vatCol = i;
    });
    var skipped = {};
    Object.keys(byHeader).forEach(function (k) { if (byHeader[k] === 'skip') skipped[k] = true; });

    /* --- pass 2: statistics fill in whatever the header did not say --- */
    var stats = [];
    for (var c2 = 0; c2 < width; c2++) {
      var filled = 0, numeric = 0, vatish = 0, amounts = [];
      var distinct = {};
      for (var b = 0; b < body.length; b++) {
        var raw = String(body[b][c2] === undefined ? '' : body[b][c2]).trim();
        if (!raw) continue;
        filled++;
        distinct[raw.toLowerCase()] = 1;
        if (looksNumeric(raw.replace('%', ''))) numeric++;
        if (parseVat(raw) !== null) vatish++;
        var a = parseAmount(raw);
        if (!isNaN(a)) amounts.push(a);
      }
      stats.push({
        col: c2, filled: filled, numeric: numeric, vatish: vatish,
        amounts: amounts, med: median(amounts),
        distinct: Object.keys(distinct).length,
        numRatio: filled ? numeric / filled : 0,
        vatRatio: filled ? vatish / filled : 0
      });
    }
    function free(i) { return !skipped[i] && i !== nameCol && i !== qtyCol && i !== unitCol && i !== vatCol; }

    if (vatCol < 0) {
      /* A VAT column is a small, closed set of legal rates, not just numbers
         that happen to look like 23. Require both. */
      var bestVat = -1, bestVatScore = 0;
      for (var i = 0; i < width; i++) {
        if (!free(i) || !stats[i].filled) continue;
        var st = stats[i];
        if (st.vatRatio <= 0.8) continue;
        if (st.distinct > 5) continue;
        var score = st.vatRatio * 10 - st.distinct;
        if (score > bestVatScore) { bestVatScore = score; bestVat = i; }
      }
      if (bestVat >= 0) vatCol = bestVat;
    }
    if (nameCol < 0) {
      for (var i2 = 0; i2 < width; i2++) {
        if (!free(i2) || !stats[i2].filled) continue;
        if (stats[i2].numRatio < 0.5) { nameCol = i2; break; }
      }
    }
    var moneyCols = [];
    for (var i3 = 0; i3 < width; i3++) {
      if (!free(i3)) continue;
      if (stats[i3].filled && stats[i3].numRatio > 0.6) moneyCols.push(stats[i3]);
    }
    moneyCols.sort(function (x, y) { return x.med - y.med; });
    if (unitCol < 0 && moneyCols.length) { unitCol = moneyCols[moneyCols.length - 1].col; }
    if (qtyCol < 0 && moneyCols.length >= 2 && moneyCols[0].col !== unitCol) { qtyCol = moneyCols[0].col; }

    if (nameCol < 0) {
      /* last resort: the widest text column, even a numeric-ish one */
      for (var i4 = 0; i4 < width; i4++) { if (free(i4) && stats[i4].filled) { nameCol = i4; break; } }
    }

    var rows = [];
    body.forEach(function (r, ri) {
      var name = String(r[nameCol] === undefined ? '' : r[nameCol]).trim();
      var qtyRaw = qtyCol >= 0 ? r[qtyCol] : '';
      var qty = qtyCol >= 0 ? parseAmount(qtyRaw) : 1;
      var unit = unitCol >= 0 ? parseAmount(r[unitCol]) : NaN;
      var vat = vatCol >= 0 ? parseVat(r[vatCol]) : 23;
      if (!name && isNaN(unit)) return;
      rows.push({
        name: name,
        qty: (qtyCol < 0 || String(qtyRaw).trim() === '') ? 1 : qty,
        unit: unit,
        vat: vat,
        rawVat: vatCol >= 0 ? r[vatCol] : '23',
        rawUnit: unitCol >= 0 ? r[unitCol] : '',
        row: ri + (headerRow >= 0 ? headerRow + 2 : 1)
      });
    });

    if (!rows.length || isNaN(rows[0].unit)) return { ok: false, rows: 0, headers: [] };
    return {
      ok: true, rows: rows.length, headers: headers, grid: body,
      nameCol: nameCol, qtyCol: qtyCol, unitCol: unitCol, vatCol: vatCol,
      skipped: skipped, headerRow: headerRow, width: width
    };
  }

  function parseInput(text) {
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
    if (lines.length < 2) return { ok: false, rows: 0, headers: [] };
    var d = detectDelimiter(lines[0]);
    return parseGrid(lines.map(function (l) { return splitLine(l, d); }));
  }

  /* ---- real Excel workbooks (.xlsx/.xls): SheetJS lazy-loaded on first use ---- */
  var xlsxLoading = null;
  function ensureXlsx() {
    if (window.XLSX) return Promise.resolve();
    if (xlsxLoading) return xlsxLoading;
    xlsxLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'assets/js/vendor/xlsx.mini.min.js';
      s.onload = resolve;
      s.onerror = function () { xlsxLoading = null; s.remove(); reject(new Error('xlsx load failed')); };
      document.head.appendChild(s);
    });
    return xlsxLoading;
  }
  function handleWorkbook(buf) {
    parseMsg.textContent = t('d_reading');
    ensureXlsx().then(function () {
      /* cellDates keeps 45000-style date serials from being read as prices */
      var wb = XLSX.read(buf, { type: 'array', cellDates: true });
      var picked = null, fallback = null;
      for (var i = 0; i < wb.SheetNames.length && !picked; i++) {
        var name = wb.SheetNames[i];
        if (!wb.Sheets[name]['!ref']) continue;
        var aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
        var grid = aoa.map(function (row) {
          return row.map(function (cell) {
            if (cell === null || cell === undefined) return '';
            if (cell instanceof Date) return cell.toISOString().slice(0, 10);
            return String(cell);
          });
        }).filter(function (row) { return row.some(function (c) { return String(c).trim() !== ''; }); });
        if (grid.length < 2) continue;
        /* a cover or instructions tab must not sink the whole workbook:
           keep looking until a sheet actually parses */
        var attempt = parseGrid(grid);
        if (attempt.ok) picked = { name: name, grid: grid, res: attempt };
        else if (!fallback) fallback = { name: name, grid: grid };
      }
      if (!picked && fallback) picked = { name: fallback.name, grid: fallback.grid, res: parseGrid(fallback.grid) };
      if (!picked || !picked.res.ok) {
        parseMsg.textContent = t('d_parse_err');
        parseMsg.classList.add('err');
        btnToMap.disabled = true;
        return;
      }
      var res = picked.res;
      parseMsg.classList.remove('err');
      parseMsg.textContent = t('d_parsed', { r: res.rows }) + ' · ' + t('d_sheet', { name: picked.name });
      state.raw = picked.grid.map(function (r) { return r.join('\t'); }).join('\n');
      state.headers = res.headers;
      state.parsed = res;
      state.colmap = {};          /* new workbook, new columns */
      btnToMap.disabled = false;
    }).catch(function () {
      parseMsg.textContent = t('d_parse_err');
      parseMsg.classList.add('err');
    });
  }

  /* ================= step 1: input ================= */
  var dropzone = $('#dropzone');
  var fileInput = $('#file-input');
  var pasteWrap = $('#paste-wrap');
  var pasteArea = $('#paste-area');
  var parseMsg = $('#parse-msg');
  var btnToMap = $('#btn-to-map');

  function acceptText(text) {
    var res = parseInput(text);
    if (!res.ok) {
      parseMsg.textContent = t('d_parse_err');
      parseMsg.classList.add('err');
      btnToMap.disabled = true;
      return;
    }
    parseMsg.classList.remove('err');
    parseMsg.textContent = t('d_parsed', { r: res.rows });
    state.raw = text;
    state.headers = res.headers;
    state.parsed = res;
    state.colmap = {};          /* new data, new columns: never inherit a mapping */
    btnToMap.disabled = false;
  }

  if (dropzone) {
    dropzone.addEventListener('click', function () { fileInput.click(); });
    dropzone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
    ['dragover', 'dragenter'].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove('drag'); });
    });
    dropzone.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      if (/\.xlsx?$/.test(f.name.toLowerCase())) {
        var frb = new FileReader();
        frb.onload = function () { handleWorkbook(new Uint8Array(frb.result)); };
        frb.readAsArrayBuffer(f);
        return;
      }
      var reader = new FileReader();
      reader.onload = function () { acceptText(String(reader.result || '')); };
      reader.readAsText(f);
    });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      if (/\.xlsx?$/.test(f.name.toLowerCase())) {
        var frb2 = new FileReader();
        frb2.onload = function () { handleWorkbook(new Uint8Array(frb2.result)); };
        frb2.readAsArrayBuffer(f);
        return;
      }
      var reader2 = new FileReader();
      reader2.onload = function () { acceptText(String(reader2.result || '')); };
      reader2.readAsText(f);
    });
  }
  var SAMPLE = [
    'Nazwa towaru / usługi\tIlość\tCena netto\tVAT',
    'Projekt logo - pakiet podstawowy\t1\t3200,00\t23',
    'Warsztaty UX (2 dni)\t1\t4800,00\t23',
    'Licencja roczna - narzędzie\t2\t650,00\t8',
    'Szkolenie online\t15\t120,00\t23'
  ].join('\n');
  var btnSample = $('#btn-sample');
  if (btnSample) btnSample.addEventListener('click', function () {
    pasteWrap.hidden = false;
    pasteArea.value = SAMPLE;
    acceptText(SAMPLE);
  });
  var btnPaste = $('#btn-paste');
  if (btnPaste) btnPaste.addEventListener('click', function () {
    pasteWrap.hidden = !pasteWrap.hidden;
    if (!pasteWrap.hidden) pasteArea.focus();
  });
  if (pasteArea) pasteArea.addEventListener('input', function () {
    if (pasteArea.value.trim().length > 4) { acceptText(pasteArea.value); return; }
    /* clearing the box must disarm the flow, not leave it running on data
       the visitor can no longer see */
    state.parsed = null;
    parseMsg.textContent = '';
    parseMsg.classList.remove('err');
    btnToMap.disabled = true;
  });

  /* ================= step 2: mapping ================= */
  var mapTable = $('#map-table');
  var FIELDS = [
    ['name', 'd_col_name'], ['qty', 'd_col_qty'], ['unit', 'd_col_unit'], ['vat', 'd_col_vat'], ['skip', 'd_col_skip']
  ];
  function guessField(i, p) {
    if (i === p.nameCol) return 'name';
    if (i === p.qtyCol) return 'qty';
    if (i === p.unitCol) return 'unit';
    if (i === p.vatCol) return 'vat';
    return 'skip';
  }
  /* A language switch re-renders the mapping table; it must not silently
     throw away a mapping the visitor corrected by hand. */
  function fieldFor(i, p) {
    var chosen = state.colmap[i];
    return chosen === undefined ? guessField(i, p) : chosen;
  }
  function makeFieldSelect(label) {
    var sel = document.createElement('select');
    sel.className = 'input';
    sel.setAttribute('aria-label', t('map_h') + ': ' + label);
    FIELDS.forEach(function (f) {
      var o = document.createElement('option');
      o.value = f[0];
      o.textContent = t(f[1]);
      sel.appendChild(o);
    });
    return sel;
  }
  function bindColumnSelect(idx, sel) {
    sel.addEventListener('change', function () { state.colmap[idx] = sel.value; });
  }
  function renderMapping() {
    var p = state.parsed;
    if (!p || !mapTable) return;
    mapTable.innerHTML = '';
    for (var i = 0; i < p.width; i++) {
      var sample = p.grid[0] ? p.grid[0][i] : '';
      var row = document.createElement('div');
      row.className = 'map-row';
      var src = document.createElement('div');
      src.className = 'm-src';
      src.textContent = state.headers[i] || ('kol ' + i);
      var small = document.createElement('small');
      small.textContent = sample ? sample.slice(0, 26) : '';
      src.appendChild(small);
      var arrow = document.createElement('span');
      arrow.className = 'm-arrow';
      arrow.textContent = '->';
      var sel = makeFieldSelect(state.headers[i] || i);
      var guess = fieldFor(i, p);
      sel.value = guess;
      state.colmap[i] = guess;
      bindColumnSelect(i, sel);
      row.appendChild(src); row.appendChild(arrow); row.appendChild(sel);
      mapTable.appendChild(row);
    }
  }

  /* NIP checksum */
  function nipOk(nip) {
    var s = String(nip || '').replace(/[\s-]/g, '');
    if (!/^\d{10}$/.test(s)) return false;
    if (/^0+$/.test(s)) return false;      /* passes the weights, is not a NIP */
    var w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
    var sum = 0;
    for (var i = 0; i < 9; i++) sum += w[i] * Number(s[i]);
    var mod = sum % 11;
    return mod !== 10 && mod === Number(s[9]);
  }
  function wireNip(inputId, hintId, badKey) {
    var inp = $(inputId), hint = $(hintId);
    if (!inp || !hint) return null;
    inp.setAttribute('aria-describedby', hint.id);
    var update = function () {
      var v = inp.value.replace(/[\s-]/g, '');
      if (v.length === 0) {
        hint.textContent = '';
        inp.removeAttribute('aria-invalid');
        hint.className = 'hint';
        return;
      }
      var good = nipOk(v);
      /* a bare tick tells a screen reader nothing */
      hint.textContent = good ? t('d_nip_ok') : t(badKey);
      hint.className = 'hint' + (good ? ' ok' : ' err');
      if (good) inp.removeAttribute('aria-invalid');
      else inp.setAttribute('aria-invalid', 'true');
    };
    inp.addEventListener('input', update);
    update();
    return update;
  }
  var nipUpdaters = [];
  nipUpdaters.push(wireNip('#s-nip', '#s-nip-hint', 'd_chkh_bad_d'));
  nipUpdaters.push(wireNip('#b-nip', '#b-nip-hint', 'd_chkb_bad_d'));

  /* ================= step 3: validation ================= */
  var checksWrap = $('#checks');
  var btnToPreview = $('#btn-to-preview');
  function buildRowsFromMap() {
    var out = [];
    var p = state.parsed;
    var base = (p.headerRow !== undefined && p.headerRow >= 0) ? p.headerRow + 2 : 1;
    p.grid.forEach(function (r, ri) {
      /* `row` is the row number the visitor sees in their own spreadsheet,
         which is the only number worth putting in an error message */
      var o = { name: '', qty: 1, unit: NaN, vat: 23, row: ri + base, foreign: null, rawUnit: '' };
      var sawQty = false;
      for (var i = 0; i < p.width; i++) {
        var f = state.colmap[i];
        var cell = r[i] === undefined ? '' : r[i];
        if (f === 'name') o.name = String(cell).trim();
        else if (f === 'qty') { sawQty = true; o.qty = String(cell).trim() === '' ? 1 : parseAmount(cell); }
        else if (f === 'unit') { o.unit = parseAmount(cell); o.rawUnit = String(cell); if (isForeignAmount(cell)) o.foreign = currencyOfCell(cell); }
        else if (f === 'vat') o.vat = parseVat(cell);
      }
      if (!sawQty) o.qty = 1;
      if (o.name || !isNaN(o.unit)) out.push(o);
    });
    return out;
  }
  /* Every check below is a real assertion. A check that can never fail is
     worse than no check: it teaches the visitor to trust a green tick that
     means nothing. */
  function mathBadRow(rows) {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!isFinite(r.qty) || !isFinite(r.unit)) continue;   /* the format check owns this */
      if (r.qty <= 0 || r.unit < 0) return r.row;
      var net = r.qty * r.unit;
      var rate = typeof r.vat === 'number' ? r.vat : 0;
      var vat = net * rate / 100;
      /* the numbers we file have to survive rounding to grosze */
      if (Math.abs((Math.round(net * 100) + Math.round(vat * 100)) - Math.round((net + vat) * 100)) > 1) return r.row;
    }
    return null;
  }
  function grossOf(rows) {
    var g = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!isFinite(r.qty) || !isFinite(r.unit)) continue;
      var net = r.qty * r.unit;
      g += net + net * (typeof r.vat === 'number' ? r.vat : 0) / 100;
    }
    return g;
  }

  function renderChecks() {
    var rows = buildRowsFromMap();
    state.rows = rows;
    var sNip = ($('#s-nip') || {}).value || '';
    var bNip = ($('#b-nip') || {}).value || '';
    var badVat = null, badReq = null, badFmt = null, badCur = null, badCurCode = '';

    rows.forEach(function (r) {
      if (r.vat === null && badVat === null) badVat = r.row;
      if ((isNaN(r.unit) || isNaN(r.qty)) && badFmt === null) badFmt = r.row;
      if (!String(r.name || '').trim() && badReq === null) badReq = r.row;
      if (r.foreign && badCur === null) { badCur = r.row; badCurCode = r.foreign; }
    });
    var badMath = mathBadRow(rows);
    var hasRows = rows.length > 0 && grossOf(rows) > 0;

    /* a failing check renames itself: the title carries the verdict, the
       detail line carries the remedy */
    var defs = [
      { key: 'h', pass: nipOk(sNip), title: nipOk(sNip) ? t('d_chkh') : t('d_chkh_bad'), d: t('d_chkh_d'), failD: t('d_chkh_bad_d') },
      { key: 'b', pass: nipOk(bNip), title: nipOk(bNip) ? t('d_chkb') : t('d_chkb_bad'), d: t('d_chkb_d'), failD: t('d_chkb_bad_d') },
      {
        key: 'v', pass: badVat === null, title: t('d_chkv'), d: t('d_chkv_d'),
        failD: badVat === null ? '' : t('d_chkv_bad', { n: badVat }) + '. ' + t('d_chkv_bad_d')
      },
      {
        key: 'm', pass: badMath === null && hasRows, title: t('d_chkm'), d: t('d_chkm_d'),
        failD: !hasRows ? t('d_chkt_bad_d') : t('d_chkm_bad', { n: badMath }) + '. ' + t('d_chkm_bad_d')
      },
      {
        key: 'r', pass: badReq === null && hasRows, title: t('d_chkr'), d: t('d_chkr_d'),
        failD: !hasRows ? t('d_chkt_bad_d') : t('d_chkr_bad', { n: badReq }) + '. ' + t('d_chkr_bad_d')
      },
      {
        key: 'c', pass: badFmt === null && badCur === null && hasRows, title: t('d_chkc'), d: t('d_chkc_d'),
        failD: !hasRows ? t('d_chkt_bad_d')
          : badCur !== null ? t('d_chkc_cur', { n: badCur, cur: badCurCode }) + '. ' + t('d_chkc_cur_d')
            : t('d_chkc_bad', { n: badFmt }) + '. ' + t('d_chkc_bad_d')
      }
    ];
    checksWrap.innerHTML = '';
    defs.forEach(function (d2, i) {
      var el = document.createElement('div');
      el.className = 'check' + (d2.pass ? ' pass' : ' fail');
      var ico = document.createElement('span');
      ico.className = 'c-ico';
      ico.textContent = d2.pass ? '✓' : '!';
      var box = document.createElement('div');
      var b = document.createElement('b');
      b.textContent = d2.title;
      var small = document.createElement('small');
      small.textContent = d2.pass ? d2.d : d2.failD;
      box.appendChild(b); box.appendChild(small);
      el.appendChild(ico); el.appendChild(box);
      checksWrap.appendChild(el);
      if (prefersReduced()) el.classList.add('on');
      else setTimeout(function () { el.classList.add('on'); }, 90 + i * 140);
    });
    btnToPreview.disabled = !defs.every(function (d2) { return d2.pass; });
  }

  /* ================= step 4: preview + XML ================= */
  var invRows = $('#inv-rows');
  var invTotal = $('#inv-total');
  var invFoot = $('#inv-foot');
  var xmlOut = $('#xml-out');
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt(n, dec) {
    var loc = window.SPLocale ? window.SPLocale() : 'pl-PL';
    return n.toLocaleString(loc, { minimumFractionDigits: dec === undefined ? 2 : dec, maximumFractionDigits: dec === undefined ? 2 : dec });
  }
  /* the XML side of the house: dot decimals, no grouping, no locale */
  function num(n, dec) {
    if (typeof n !== 'number' || !isFinite(n)) return '0';
    if (dec !== undefined) return n.toFixed(dec);
    return String(Math.round(n * 1e6) / 1e6);
  }
  function compute() {
    var rows = state.rows.map(function (r) {
      var net = (r.qty || 0) * (r.unit || 0);
      var rate = typeof r.vat === 'number' ? r.vat : 0;
      var vat = net * rate / 100;
      return { name: r.name, qty: r.qty, unit: r.unit, rate: r.vat, net: net, vat: vat, gross: net + vat };
    });
    var totals = rows.reduce(function (a, r) {
      a.net += r.net; a.vat += r.vat; a.gross += r.gross; return a;
    }, { net: 0, vat: 0, gross: 0 });
    return { rows: rows, totals: totals };
  }
  /* ---------------------------------------------------------------
     FA(3) preview. This mirrors the real element order of the KSeF 2.0
     schema (crd.gov.pl/wzor/2025/06/25/13775): Naglowek, Podmiot1,
     Podmiot2, then Fa with its header fields, the per-rate summary and
     finally the FaWiersz lines. It is a faithful preview, not a filing:
     the production app builds and signs the document server-side.
     --------------------------------------------------------------- */
  /* FA(3) allows up to 6 decimals on a quantity; carry only what is needed
     and never fewer than two, so 1 -> 1.00 and 0.5 -> 0.50 */
  function qtyStr(q) {
    if (typeof q !== 'number' || !isFinite(q)) return '0.00';
    var out = q.toFixed(6).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
    if (out.indexOf('.') < 0) return out + '.00';
    var dec = out.split('.')[1].length;
    return dec < 2 ? out + '0' : out;
  }
  function vatBucketKeys(rate) {
    if (rate === 23) return ['P_13_1', 'P_14_1'];
    if (rate === 8) return ['P_13_2', 'P_14_2'];
    if (rate === 5) return ['P_13_3', 'P_14_3'];
    if (rate === 0) return ['P_13_6_1', null];
    if (rate === 'zw') return ['P_13_7', null];
    if (rate === 'np') return ['P_13_8', null];
    if (rate === 'oo') return ['P_13_9', null];
    return [null, null];
  }
  function buildXml(data) {
    var now = new Date();
    var dstr = now.toISOString().slice(0, 10);
    var no = state.invoiceNo;
    var sN = ($('#s-nip') || {}).value || '';
    var bN = ($('#b-nip') || {}).value || '';
    var sName = ($('#s-name') || {}).value || '';
    var bName = ($('#b-name') || {}).value || '';

    /* per-rate summary buckets, in the order the schema declares them */
    var buckets = {};
    data.rows.forEach(function (r) {
      var keys = vatBucketKeys(r.rate);
      if (!keys[0]) return;
      buckets[keys[0]] = (buckets[keys[0]] || 0) + r.net;
      if (keys[1]) buckets[keys[1]] = (buckets[keys[1]] || 0) + r.vat;
    });
    var ORDER = ['P_13_1', 'P_14_1', 'P_13_2', 'P_14_2', 'P_13_3', 'P_14_3', 'P_13_6_1', 'P_13_7', 'P_13_8', 'P_13_9'];

    var lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">');
    lines.push('  <Naglowek>');
    lines.push('    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>');
    lines.push('    <WariantFormularza>3</WariantFormularza>');
    lines.push('    <DataWytworzeniaFa>' + now.toISOString().slice(0, 19) + 'Z</DataWytworzeniaFa>');
    lines.push('    <SystemInfo>Sheetpost</SystemInfo>');
    lines.push('  </Naglowek>');
    lines.push('  <Podmiot1>');
    lines.push('    <DaneIdentyfikacyjne>');
    lines.push('      <NIP>' + esc(sN.replace(/[\s-]/g, '')) + '</NIP>');
    lines.push('      <Nazwa>' + esc(sName) + '</Nazwa>');
    lines.push('    </DaneIdentyfikacyjne>');
    lines.push('    <Adres><KodKraju>PL</KodKraju></Adres>');
    lines.push('  </Podmiot1>');
    lines.push('  <Podmiot2>');
    lines.push('    <DaneIdentyfikacyjne>');
    lines.push('      <NIP>' + esc(bN.replace(/[\s-]/g, '')) + '</NIP>');
    lines.push('      <Nazwa>' + esc(bName) + '</Nazwa>');
    lines.push('    </DaneIdentyfikacyjne>');
    lines.push('    <Adres><KodKraju>PL</KodKraju></Adres>');
    lines.push('  </Podmiot2>');
    lines.push('  <Fa>');
    lines.push('    <KodWaluty>PLN</KodWaluty>');
    lines.push('    <P_1>' + dstr + '</P_1>');
    lines.push('    <P_2>' + esc(no) + '</P_2>');
    lines.push('    <P_6>' + dstr + '</P_6>');
    ORDER.forEach(function (k) {
      if (buckets[k] === undefined) return;
      lines.push('    <' + k + '>' + num(buckets[k], 2) + '</' + k + '>');
    });
    lines.push('    <P_15>' + num(data.totals.gross, 2) + '</P_15>');
    lines.push('    <Adnotacje>');
    lines.push('      <P_16>2</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A>');
    lines.push('      <Zwolnienie><P_19N>1</P_19N></Zwolnienie>');
    lines.push('      <NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu>');
    lines.push('      <P_23>2</P_23>');
    lines.push('      <PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy>');
    lines.push('    </Adnotacje>');
    lines.push('    <RodzajFaktury>VAT</RodzajFaktury>');
    data.rows.forEach(function (r, i) {
      lines.push('    <FaWiersz>');
      lines.push('      <NrWierszaFa>' + (i + 1) + '</NrWierszaFa>');
      lines.push('      <P_7>' + esc(r.name) + '</P_7>');
      lines.push('      <P_8A>szt</P_8A>');
      /* XML carries machine numbers, never locale-formatted ones */
      lines.push('      <P_8B>' + qtyStr(r.qty) + '</P_8B>');
      lines.push('      <P_9A>' + num(r.unit, 2) + '</P_9A>');
      lines.push('      <P_11>' + num(r.net, 2) + '</P_11>');
      lines.push('      <P_12>' + (typeof r.rate === 'number' ? r.rate : esc(vatIsMarker(r.rate) ? r.rate : 'zw')) + '</P_12>');
      lines.push('    </FaWiersz>');
    });
    lines.push('  </Fa>');
    lines.push('</Faktura>');
    return lines.join('\n');
  }
  function colorizeXml(xml) {
    var out = esc(xml);
    /* esc() already turned every quote into &quot;, so the attribute regex
       has to look for that, not for a raw double quote */
    out = out.replace(/&lt;(\?xml|\/?[A-Za-z_][\w.:-]*)((?:(?!&gt;).)*?)(\/?&gt;)/g, function (m, a, attrs, b) {
      var painted = attrs.replace(/(&quot;(?:(?!&quot;).)*&quot;)/g, '<span class="x-val">$1</span>');
      return '<span class="x-tag">&lt;' + a + '</span>' + painted + '<span class="x-tag">' + b + '</span>';
    });
    return out;
  }
  function renderPreview() {
    var data = compute();
    var cur = 'PLN';
    state.invoiceNo = state.invoiceNo || ('FV/' + new Date().getFullYear() + '/' + String(new Date().getMonth() + 1).padStart(2, '0') + '/' + String(100 + Math.floor(Math.random() * 900)));
    var invNoEl = $('#inv-no');
    if (invNoEl) invNoEl.textContent = state.invoiceNo;
    invRows.innerHTML = '';
    data.rows.forEach(function (r) {
      var div = document.createElement('div');
      div.className = 'inv-row';
      var s1 = document.createElement('span');
      s1.textContent = r.name + (r.qty !== 1 ? ' × ' + fmt(r.qty, 0) : '');
      var b = document.createElement('b');
      b.className = 'mono';
      b.textContent = fmt(r.net) + ' ' + cur;
      div.appendChild(s1); div.appendChild(b);
      invRows.appendChild(div);
    });
    var vatRow = document.createElement('div');
    vatRow.className = 'inv-row';
    vatRow.innerHTML = '<span>VAT</span><b class="mono">' + fmt(data.totals.vat) + ' ' + cur + '</b>';
    invRows.appendChild(vatRow);
    invTotal.textContent = fmt(data.totals.gross) + ' ' + cur;
    invFoot.textContent = t('d_inv_foot', { n: data.rows.length });
    state.xml = buildXml(data);
    xmlOut.innerHTML = colorizeXml(state.xml);
  }

  /* tabs: selection, roving tabindex and arrow keys, as the pattern requires */
  var tabs = $$('.ptab');
  function selectTab(tab, focus) {
    tabs.forEach(function (x) {
      var on = x === tab;
      x.setAttribute('aria-selected', on ? 'true' : 'false');
      x.setAttribute('tabindex', on ? '0' : '-1');
    });
    $('#view-human').hidden = tab.getAttribute('data-view') !== 'human';
    $('#view-xml').hidden = tab.getAttribute('data-view') !== 'xml';
    if (focus) tab.focus();
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { selectTab(tab, false); });
    tab.addEventListener('keydown', function (e) {
      var next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (!next) return;
      e.preventDefault();
      selectTab(next, true);
    });
  });
  if (tabs.length) selectTab(tabs[0], false);

  /* ================= step 5: send (simulation) + gate ================= */
  var sendlog = $('#sendlog');
  var upoBox = $('#upo');
  var gate = $('#gate');
  /* sp_runs is a signed counter: 0..n = free runs used, negative = bonus runs
     still owed after an email unlock. runsLeft() is the only thing the UI and
     the gate are allowed to reason about. */
  function runs() { return parseInt(store.get('sp_runs', '0'), 10) || 0; }
  /* The unlock is worth exactly three runs, once. Re-submitting an address
     must not top the counter back up forever. */
  function grantBonus() {
    if (store.get('sp_bonus', '') === '1') return false;
    store.set('sp_bonus', '1');
    store.set('sp_runs', String(-3));
    return true;
  }
  function runsLeft() {
    var r = runs();
    return r < 0 ? -r : Math.max(0, 1 - r);
  }
  function runsLabel() {
    var el = $('#demo-runs');
    if (!el) return;
    var left = runsLeft();
    el.textContent = left > 0 ? t('d_runs_left', { n: left }) : t('d_runs_done');
  }
  function showGate() {
    gate.classList.add('show');
    document.documentElement.classList.add('is-locked');
    document.body.style.overflow = 'hidden';
    setInert(true);
    var st = gate.querySelector('.stamp');
    if (st) { st.classList.remove('hit'); void st.offsetWidth; st.classList.add('hit'); }
    var closer = $('#gate-close');
    if (closer) setTimeout(function () { closer.focus(); }, 80);
  }
  function hideGate() {
    gate.classList.remove('show');
    document.documentElement.classList.remove('is-locked');
    document.body.style.overflow = '';
    setInert(false);
    var back = $('#btn-to-send');
    if (back) back.focus({ preventScroll: true });
  }
  var gateClose = $('#gate-close');
  /* a link out of the gate has to release the page it is holding */
  $$('#gate a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function () { hideGate(); });
  });
  if (gate) {
    gate.addEventListener('click', function (e) { if (e.target === gate) hideGate(); });
  }
  if (gateClose) {
    gateClose.addEventListener('click', hideGate);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && gate.classList.contains('show')) hideGate();
      /* focus trap while gate is shown */
      if (e.key === 'Tab' && gate.classList.contains('show')) {
        var f = $$('#gate button, #gate input, #gate a[href]').filter(function (el) { return !el.disabled && el.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  var gateForm = $('#gate-form');
  if (gateForm) {
    gateForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var em = $('#gate-email');
      if (!em.value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em.value)) { em.setAttribute('aria-invalid', 'true'); return; }
      em.removeAttribute('aria-invalid');
      store.set('sp_lead_email', em.value);
      /* grantBonus() reports whether the unlock was still available. Ignoring
         it meant re-submitting any address re-ran the filing every time, so
         the gate could be walked straight through for ever. */
      if (grantBonus()) {
        onBonus();
      } else {
        var used = $('#gate-used');
        if (used) { used.textContent = t('gate_used'); used.hidden = false; }
        em.setAttribute('aria-invalid', 'true');
      }
    });
  }

  function onBonus() {
    hideGate();
    var em = store.get('sp_lead_email', '');
    var lead = $('#demo-lead');
    /* its own slot, so the run counter can keep updating without wiping
       the confirmation the visitor just earned */
    if (lead) lead.textContent = t('d_bonus') + ' · ' + t('d_bonus_mail', { mail: em });
    runsLabel();
    /* resume the filing the visitor was trying to make, but only if the
       unlock actually left them a run to spend */
    if (state.xml && !sending && runsLeft() > 0) doSend();
  }
  window.SPDemo = { onBonus: onBonus };

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function genKsefNo() {
    var nip = ($('#s-nip') || {}).value || '0000000000';
    var d = new Date();
    var dstr = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    function rnd(n) {
      var s = '';
      var chars = '0123456789ABCDEF';
      for (var i = 0; i < n; i++) s += chars[(Math.random() * 16) | 0];
      return s;
    }
    return nip.replace(/[\s-]/g, '') + '-' + dstr + '-' + rnd(10) + '-' + rnd(10);
  }

  /* while the gate is up, the rest of the document is not interactive and not
     in the accessibility tree */
  function setInert(on) {
    ['#nav', '#main > section:not(#demo)', '.footer'].forEach(function (sel) {
      $$(sel).forEach(function (el) {
        if (on) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
        else { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
      });
    });
    var stage = $('.demo-shell');
    if (!stage) return;
    if (on) { stage.setAttribute('inert', ''); } else { stage.removeAttribute('inert'); }
  }

  var sending = false;
  async function doSend() {
    if (sending) return;
    sending = true;
    sendlog.innerHTML = '';
    upoBox.classList.remove('show');
    showPane(5);
    var seq = [
      ['d_log_auth', 620], ['d_log_session', 520], ['d_log_schema', 640],
      ['d_log_send', 900], ['d_log_upo', 560]
    ];
    for (var i = 0; i < seq.length; i++) {
      var span = document.createElement('span');
      span.className = 'log-line l-run cursor-blink';
      span.textContent = '> ' + t(seq[i][0]) + ' …';
      sendlog.appendChild(span);
      await sleep(seq[i][1]);
      span.classList.remove('cursor-blink');
      span.innerHTML = '&gt; ' + esc(t(seq[i][0])) + ' … <span class="l-ok">' + esc(t('d_log_ok')) + '</span>';
    }
    var ksefNo = genKsefNo();
    $('#upo-id').textContent = ksefNo;
    upoBox.classList.add('show');
    /* count the run: bonus runs count down toward 0, free runs count up */
    store.set('sp_runs', String(runs() + 1));
    runsLabel();
    sending = false;
  }
  var btnSend = $('#btn-to-send');
  if (btnSend) btnSend.addEventListener('click', function () {
    if (runsLeft() <= 0) { showGate(); return; }
    doSend();
  });

  var btnAgain = $('#btn-again');
  if (btnAgain) btnAgain.addEventListener('click', function () {
    /* a new run is a NEW document: nothing may survive from the last one */
    state.raw = '';
    state.rows = [];
    state.headers = [];
    state.colmap = {};
    state.xml = '';
    state.invoiceNo = '';
    state.parsed = null;
    if (mapTable) mapTable.innerHTML = '';
    if (checksWrap) checksWrap.innerHTML = '';
    if (invRows) invRows.innerHTML = '';
    if (xmlOut) xmlOut.textContent = '';
    if (sendlog) sendlog.innerHTML = '';
    if (upoBox) upoBox.classList.remove('show');
    if (btnToPreview) btnToPreview.disabled = true;
    parseMsg.textContent = '';
    parseMsg.classList.remove('err');
    btnToMap.disabled = true;
    pasteArea.value = '';
    pasteWrap.hidden = true;
    showPane(1);
    dropzone.focus();
  });

  var btnXmlDl = $('#btn-xml-dl');
  if (btnXmlDl) btnXmlDl.addEventListener('click', function () {
    if (!state.xml) return;
    var blob = new Blob([state.xml], { type: 'application/xml' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'faktura-FA3-podglad.xml';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  });

  /* ================= step navigation wiring ================= */
  var b1 = $('#btn-to-map'), b2 = $('#btn-to-check'), b3 = $('#btn-to-preview');
  var bk1 = $('#btn-back-1'), bk2 = $('#btn-back-2'), bk3 = $('#btn-back-3');
  if (b1) b1.addEventListener('click', function () { renderMapping(); showPane(2); });
  if (b2) b2.addEventListener('click', function () { renderChecks(); showPane(3); });
  if (b3) b3.addEventListener('click', function () { renderPreview(); showPane(4); });
  if (bk1) bk1.addEventListener('click', function () { showPane(1); });
  if (bk2) bk2.addEventListener('click', function () { showPane(2); });
  if (bk3) bk3.addEventListener('click', function () { showPane(3); });

  /* ================= i18n re-render hook ================= */
  if (window.SP_I18N_HOOKS) window.SP_I18N_HOOKS.push(function () {
    nipUpdaters.forEach(function (fn) { if (fn) fn(); });
    var lead = $('#demo-lead');
    if (lead && lead.textContent) {
      lead.textContent = t('d_bonus') + ' · ' + t('d_bonus_mail', { mail: store.get('sp_lead_email', '') });
    }
    if (state.parsed && state.parsed.width) renderMapping();
    if (state.rows && state.rows.length) {
      renderChecks();
      var previewPane = $('#view-human').closest('.dpane');
      if (previewPane && previewPane.classList.contains('active')) renderPreview();
    }
    runsLabel();
  });
  runsLabel();
  showPane(1, false);
})();
