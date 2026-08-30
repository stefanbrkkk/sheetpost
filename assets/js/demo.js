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
    checks: [],
    xml: '',
    invoiceNo: ''
  };

  var panes = $$('.dpane');
  var steps = $$('.dstep');

  function showPane(n) {
    panes.forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-pane') === String(n)); });
    steps.forEach(function (s) {
      var sn = Number(s.getAttribute('data-step'));
      s.classList.toggle('active', sn === n);
      s.classList.toggle('done', sn < n);
    });
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
      if (ch === '"') { q = !q; continue; }
      if (ch === d && !q) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  }
  function parseAmount(v) {
    if (typeof v !== 'string') return NaN;
    var s = v.replace(/\s|\u00A0/g, '').replace(/(zł|zl|PLN|EUR|€)/gi, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  }
  function parseVat(v) {
    if (typeof v !== 'string') return null;
    var s = v.trim().toLowerCase().replace('%', '').replace(',', '.');
    if (s === 'zw' || s === 'np' || s === 'oo' || s === '0%') s = s === '0%' ? '0' : s;
    if (s === 'zw' || s === 'np') return s;
    var n = parseFloat(s);
    if (isNaN(n)) return null;
    if (n > 0 && n <= 1) n = n * 100;
    return [23, 8, 5, 0].indexOf(n) >= 0 ? n : null;
  }
  function looksNumeric(v) { return !isNaN(parseFloat(String(v).replace(',', '.'))) && isFinite(parseFloat(String(v).replace(',', '.'))); }

  function parseGrid(grid) {
    if (!grid.length) return { ok: false, rows: 0, headers: [] };
    var width = grid.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    grid = grid.map(function (r) { while (r.length < width) r.push(''); return r; });

    var first = grid[0];
    var headerish = first.filter(function (c) { return c.length > 0 && !looksNumeric(c.replace('%', '')); }).length >= Math.ceil(width / 2);
    var headers = headerish ? first : first.map(function (_, i) { return 'kol ' + String.fromCharCode(65 + i); });
    var body = headerish ? grid.slice(1) : grid;

    var rows = [];
    var numericCols = [];
    for (var c = 0; c < width; c++) {
      var numCount = 0;
      body.forEach(function (r) { if (looksNumeric(r[c])) numCount++; });
      numericCols.push(numCount / Math.max(1, body.length));
    }

    var nameCol = 0, bestStr = -1;
    for (var c2 = 0; c2 < width; c2++) {
      if (numericCols[c2] < 0.5 && bestStr < 0) { bestStr = c2; nameCol = c2; }
    }
    /* classify remaining numeric columns: VAT (rate-set match), then qty vs unit
       by median magnitude (qty small, unit price large). */
    function median(arr) {
      if (!arr.length) return 0;
      var s = arr.slice().sort(function (a, b) { return a - b; });
      var mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }
    var vatCol = -1;
    var numCands = [];
    for (var c3 = 0; c3 < width; c3++) {
      if (c3 === nameCol) continue;
      var vals = body.map(function (r) { return r[c3]; }).filter(looksNumeric);
      if (vals.length / Math.max(1, body.length) <= 0.6) continue;
      var vatish = vals.filter(function (v) { return parseVat(v) !== null; }).length;
      if (vatCol < 0 && vatish / vals.length > 0.6) { vatCol = c3; continue; }
      numCands.push({ col: c3, med: median(vals.map(function (v) { return parseAmount(v); }).filter(function (n) { return !isNaN(n); })) });
    }
    numCands.sort(function (a, b) { return a.med - b.med; });
    var qtyCol = numCands.length >= 2 ? numCands[0].col : -1;
    var unitCol = numCands.length ? numCands[numCands.length - 1].col : -1;
    /* fallback: name, then unit */
    if (unitCol < 0) {
      for (var c4 = 0; c4 < width; c4++) { if (c4 !== nameCol && numericCols[c4] > 0.5) { unitCol = c4; break; } }
    }

    body.forEach(function (r) {
      var name = r[nameCol] || '';
      var qty = qtyCol >= 0 ? parseAmount(r[qtyCol]) : 1;
      var unit = unitCol >= 0 ? parseAmount(r[unitCol]) : NaN;
      var vat = vatCol >= 0 ? parseVat(r[vatCol]) : 23;
      if (!name && isNaN(unit)) return;
      rows.push({ name: name, qty: isNaN(qty) ? 1 : qty, unit: unit, vat: vat, rawVat: vatCol >= 0 ? r[vatCol] : '23' });
    });

    if (!rows.length || isNaN(rows[0].unit)) return { ok: false, rows: 0, headers: [] };
    return { ok: true, rows: rows.length, headers: headers, grid: body, nameCol: nameCol, qtyCol: qtyCol, unitCol: unitCol, vatCol: vatCol, width: width };
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
      s.onerror = function () { reject(new Error('xlsx load failed')); };
      document.head.appendChild(s);
    });
    return xlsxLoading;
  }
  function handleWorkbook(buf) {
    parseMsg.textContent = t('d_reading');
    ensureXlsx().then(function () {
      var wb = XLSX.read(buf, { type: 'array' });
      var picked = null;
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
        if (grid.length >= 2) picked = { name: name, grid: grid };
      }
      if (!picked) {
        parseMsg.textContent = t('d_parse_err');
        parseMsg.classList.add('err');
        btnToMap.disabled = true;
        return;
      }
      var res = parseGrid(picked.grid);
      if (!res.ok) {
        parseMsg.textContent = t('d_parse_err');
        parseMsg.classList.add('err');
        btnToMap.disabled = true;
        return;
      }
      parseMsg.classList.remove('err');
      parseMsg.textContent = t('d_parsed', { r: res.rows }) + ' · ' + t('d_sheet', { name: picked.name });
      state.raw = picked.grid.map(function (r) { return r.join('\t'); }).join('\n');
      state.headers = res.headers;
      state.parsed = res;
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

  function acceptText(text, sourceLabel) {
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
    if (pasteArea.value.trim().length > 4) acceptText(pasteArea.value);
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
  function renderMapping() {
    var p = state.parsed;
    if (!p || !mapTable) return;
    state.colmap = {};
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
      var sel = document.createElement('select');
      sel.className = 'input';
      sel.setAttribute('aria-label', t('map_h') + ': ' + (state.headers[i] || i));
      FIELDS.forEach(function (f) {
        var o = document.createElement('option');
        o.value = f[0];
        o.textContent = t(f[1]);
        sel.appendChild(o);
      });
      var guess = guessField(i, p);
      sel.value = guess;
      state.colmap[i] = guess;
      sel.addEventListener('change', function (idx, s) {
        return function () { state.colmap[idx] = s.value; };
      }(i, sel));
      row.appendChild(src); row.appendChild(arrow); row.appendChild(sel);
      mapTable.appendChild(row);
    }
  }

  /* NIP checksum */
  function nipOk(nip) {
    var s = String(nip || '').replace(/[\s-]/g, '');
    if (!/^\d{10}$/.test(s)) return false;
    var w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
    var sum = 0;
    for (var i = 0; i < 9; i++) sum += w[i] * Number(s[i]);
    var mod = sum % 11;
    return mod !== 10 && mod === Number(s[9]);
  }
  function wireNip(inputId, hintId, badKey) {
    var inp = $(inputId), hint = $(hintId);
    if (!inp || !hint) return;
    var update = function () {
      var v = inp.value.replace(/[\s-]/g, '');
      if (v.length === 0) { hint.textContent = ''; return; }
      hint.textContent = nipOk(v) ? '✓' : t(badKey);
      hint.className = 'hint' + (nipOk(v) ? '' : ' err');
    };
    inp.addEventListener('input', update);
    update();
  }
  wireNip('#s-nip', '#s-nip-hint', 'd_chkh_bad_d');
  wireNip('#b-nip', '#b-nip-hint', 'd_chkb_bad_d');

  /* ================= step 3: validation ================= */
  var checksWrap = $('#checks');
  var btnToPreview = $('#btn-to-preview');
  function buildRowsFromMap() {
    var out = [];
    var p = state.parsed;
    p.grid.forEach(function (r, ri) {
      var o = { name: '', qty: 1, unit: NaN, vat: 23, row: ri + 2 };
      for (var i = 0; i < p.width; i++) {
        var f = state.colmap[i];
        if (f === 'name') o.name = r[i];
        else if (f === 'qty') o.qty = parseAmount(r[i]);
        else if (f === 'unit') o.unit = parseAmount(r[i]);
        else if (f === 'vat') o.vat = parseVat(r[i]);
      }
      if (o.name || !isNaN(o.unit)) out.push(o);
    });
    return out;
  }
  function renderChecks() {
    var rows = buildRowsFromMap();
    state.rows = rows;
    var sNip = ($('#s-nip') || {}).value || '';
    var bNip = ($('#b-nip') || {}).value || '';
    var badVat = null, badMath = null, badReq = null, badFmt = null;

    rows.forEach(function (r, i) {
      var n = i + 1;
      if (r.vat === null && badVat === null) badVat = n;
      if ((isNaN(r.unit) || isNaN(r.qty)) && badFmt === null) badFmt = n;
      if (!String(r.name || '').trim() && badReq === null) badReq = n;
    });

    var defs = [
      {
        key: 'h', pass: nipOk(sNip), title: t('d_chkh'), d: t('d_chkh_d'), failD: t('d_chkh_bad_d')
      },
      {
        key: 'b', pass: nipOk(bNip), title: t('d_chkb'), d: t('d_chkb_d'), failD: t('d_chkb_bad_d')
      },
      {
        key: 'v', pass: badVat === null, title: t('d_chkv'), d: t('d_chkv_d'),
        failD: badVat === null ? '' : t('d_chkv_bad', { n: badVat }) + '. ' + t('d_chkv_bad_d')
      },
      {
        key: 'm', pass: badFmt === null && badMath === null, title: t('d_chkm'), d: t('d_chkm_d'),
        failD: badFmt === null ? t('d_chkm_bad_d') : t('d_chkc_bad', { n: badFmt }) + '. ' + t('d_chkc_bad_d')
      },
      {
        key: 'r', pass: badReq === null, title: t('d_chkr'), d: t('d_chkr_d'),
        failD: badReq === null ? '' : t('d_chkr_bad', { n: badReq }) + '. ' + t('d_chkr_bad_d')
      },
      {
        key: 'c', pass: true, title: t('d_chkc'), d: t('d_chkc_d'), failD: ''
      }
    ];
    checksWrap.innerHTML = '';
    defs.forEach(function (d2, i) {
      var el = document.createElement('div');
      el.className = 'check' + (d2.pass ? ' pass' : ' fail');
      el.innerHTML = '<span class="c-ico">' + (d2.pass ? '✓' : '!') + '</span>' +
        '<div><b></b><small></small></div>';
      el.querySelector('b').textContent = d2.title;
      el.querySelector('small').textContent = d2.pass ? d2.d : d2.failD;
      checksWrap.appendChild(el);
      setTimeout(function () { el.classList.add('on'); }, 90 + i * 140);
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
  function buildXml(data) {
    var now = new Date();
    var dstr = now.toISOString().slice(0, 10);
    var dcompact = dstr.replace(/-/g, '');
    var no = state.invoiceNo;
    var sN = ($('#s-nip') || {}).value || '';
    var bN = ($('#b-nip') || {}).value || '';
    var sName = ($('#s-name') || {}).value || '';
    var bName = ($('#b-name') || {}).value || '';
    var lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">');
    lines.push('  <Naglowek>');
    lines.push('    <KodFormularza KodSystemowy="FA (3)" WersjaSchemy="1-0E">FA</KodFormularza>');
    lines.push('    <WariantFormularza>3</WariantFormularza>');
    lines.push('    <DataWytworzeniaFa>' + now.toISOString().slice(0, 19) + '</DataWytworzeniaFa>');
    lines.push('    <SystemInfo>Sheetpost</SystemInfo>');
    lines.push('  </Naglowek>');
    lines.push('  <Podmiot1>');
    lines.push('    <DaneIdentyfikacyjne>');
    lines.push('      <NIP>' + esc(sN) + '</NIP>');
    lines.push('      <Nazwa>' + esc(sName) + '</Nazwa>');
    lines.push('    </DaneIdentyfikacyjne>');
    lines.push('  </Podmiot1>');
    lines.push('  <Podmiot2>');
    lines.push('    <DaneIdentyfikacyjne>');
    lines.push('      <NIP>' + esc(bN) + '</NIP>');
    lines.push('      <Nazwa>' + esc(bName) + '</Nazwa>');
    lines.push('    </DaneIdentyfikacyjne>');
    lines.push('  </Podmiot2>');
    lines.push('  <Fa>');
    lines.push('    <KodWaluty>PLN</KodWaluty>');
    lines.push('    <P_1>' + dcompact + '</P_1>');
    lines.push('    <P_2>' + esc(no) + '</P_2>');
    data.rows.forEach(function (r, i) {
      lines.push('    <FaWiersz>');
      lines.push('      <NrWierszaFa>' + (i + 1) + '</NrWierszaFa>');
      lines.push('      <P_7>' + esc(r.name) + '</P_7>');
      lines.push('      <P_8B>' + fmt(r.qty, 0) + '</P_8B>');
      lines.push('      <P_9A>' + r.unit.toFixed(2) + '</P_9A>');
      lines.push('      <P_11>' + r.net.toFixed(2) + '</P_11>');
      lines.push('      <P_12>' + (typeof r.rate === 'number' ? r.rate : 'zw') + '</P_12>');
      lines.push('    </FaWiersz>');
    });
    lines.push('    <Podsumowanie>');
    lines.push('      <P_13_1>' + data.totals.net.toFixed(2) + '</P_13_1>');
    lines.push('      <P_14_1>' + data.totals.vat.toFixed(2) + '</P_14_1>');
    lines.push('      <P_15>' + data.totals.gross.toFixed(2) + '</P_15>');
    lines.push('    </Podsumowanie>');
    lines.push('  </Fa>');
    lines.push('</Faktura>');
    return lines.join('\n');
  }
  function colorizeXml(xml) {
    var out = esc(xml);
    out = out.replace(/&lt;(\?xml|\/?[A-Za-z_][\w.:-]*)([^&]*?)(\/?&gt;)/g, function (m, a, attrs, b) {
      return '<span class="x-tag">&lt;' + a + '</span>' + attrs.replace(/("[^"]*")/g, '<span class="x-val">$1</span>') + '<span class="x-tag">' + b + '</span>';
    });
    return out;
  }
  function renderPreview() {
    var data = compute();
    var cur = 'PLN';
    state.invoiceNo = state.invoiceNo || ('FV/' + new Date().getFullYear() + '/' + String(new Date().getMonth() + 1).padStart(2, '0') + '/' + String(100 + Math.floor(Math.random() * 900)));
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
    var lang = document.documentElement.getAttribute('data-lang');
    invFoot.textContent = (lang === 'pl' ? 'z pliku' : lang === 'de' ? 'aus Tabelle' : lang === 'hr' ? 'iz tablice' : lang === 'ro' ? 'din foaie' : 'from sheet') + ' · ' + data.rows.length + (lang === 'pl' ? ' wiersze · walidacja OK' : ' rows · validation OK');
    state.xml = buildXml(data);
    xmlOut.innerHTML = colorizeXml(state.xml);
  }

  /* tabs */
  $$('.ptab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      $$('.ptab').forEach(function (x) { x.setAttribute('aria-selected', x === tab ? 'true' : 'false'); });
      $('#view-human').hidden = tab.getAttribute('data-view') !== 'human';
      $('#view-xml').hidden = tab.getAttribute('data-view') !== 'xml';
    });
  });

  /* ================= step 5: send (simulation) + gate ================= */
  var sendlog = $('#sendlog');
  var upoBox = $('#upo');
  var gate = $('#gate');
  function runs() { return parseInt(store.get('sp_runs', '0'), 10) || 0; }
  function bonusLeft() { var r = runs(); return r < 0 ? -r : 0; }
  function runsLabel() {
    var el = $('#demo-runs');
    if (!el) return;
    var r = runs();
    if (r < 0) el.textContent = t('d_runs_left', { n: -r });
    else if (r === 0) el.textContent = t('d_runs_left', { n: 1 });
    else el.textContent = t('d_runs_done');
  }
  function showGate() {
    gate.classList.add('show');
    var st = gate.querySelector('.stamp');
    if (st) { st.classList.remove('hit'); void st.offsetWidth; st.classList.add('hit'); }
    var closer = $('#gate-close');
    if (closer) setTimeout(function () { closer.focus(); }, 80);
  }
  function hideGate() {
    gate.classList.remove('show');
    var back = $('#btn-to-send');
    if (back) back.focus({ preventScroll: true });
  }
  var gateClose = $('#gate-close');
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
      store.set('sp_lead_email', em.value);
      store.set('sp_runs', String(-3));
      onBonus();
    });
  }

  function onBonus() {
    hideGate();
    runsLabel();
    var em = store.get('sp_lead_email', '');
    var el = $('#demo-runs');
    if (el) el.textContent = t('d_bonus') + ' · ' + t('d_bonus_mail', { mail: em });
    /* resume the filing the user was trying to make */
    if (state.xml && !sending) doSend();
  }
  window.SPDemo = { onBonus: onBonus };

  function logLine(text, cls) {
    var s = document.createElement('span');
    s.className = 'log-line ' + (cls || '');
    s.textContent = text;
    sendlog.appendChild(s);
  }
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
    /* count the run */
    if (runs() < 0) store.set('sp_runs', String(runs() + 1));
    else store.set('sp_runs', String(runs() + 1));
    runsLabel();
    sending = false;
  }
  var btnSend = $('#btn-to-send');
  if (btnSend) btnSend.addEventListener('click', function () {
    var r = runs();
    if (r >= 1 && bonusLeft() === 0) { showGate(); return; }
    doSend();
  });

  var btnAgain = $('#btn-again');
  if (btnAgain) btnAgain.addEventListener('click', function () {
    showPane(1);
    parseMsg.textContent = '';
    btnToMap.disabled = true;
    pasteArea.value = '';
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
    if (state.parsed && state.parsed.width) renderMapping();
    if (state.rows && state.rows.length) { renderChecks(); if (!$('#view-human').closest('.dpane').classList.contains('active')) return; renderPreview(); }
    runsLabel();
  });
  runsLabel();
  showPane(1);
})();
