/* Draws both dashboards from docs/data/<story>.json.
   No libraries. Every number on the page comes from that file. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var COLOR = { AUS: '#2B50AA', USA: '#EE5A3B', IDN: '#C27F0A', other: '#7C8299', ink: '#1D2440', ink2: '#4C536B', grid: '#E6E1D3' };
  var NAMES = {
    'USA': 'United States', 'Rep. of Korea': 'South Korea', 'Viet Nam': 'Vietnam',
    'Russian Federation': 'Russia', 'Other Asia, nes': 'Other Asia (not specified)',
    'China, Hong Kong SAR': 'Hong Kong', 'Türkiye': 'Turkey', 'Rep. of Moldova': 'Moldova'
  };
  var COUNTRY = { AUS: 'Australia', IDN: 'Indonesia' };

  // On phones the charts are drawn narrower so their text is not scaled down to an unreadable size.
  var NARROW = window.matchMedia && window.matchMedia('(max-width: 560px)').matches;

  function name(n) { return NAMES[n] || n; }

  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k]; else node.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (kid) { if (kid) node.appendChild(kid); });
    return node;
  }

  function svg(tag, attrs, text) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text != null) node.textContent = text;
    return node;
  }

  function num(x, d) {
    if (x == null || isNaN(x)) return 'not available';
    return Number(x).toLocaleString('en-AU', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function pct(x, d) { return x == null ? 'not available' : num(x * 100, d == null ? 0 : d) + '%'; }
  function signedPct(x) { return x == null ? 'not available' : (x > 0 ? '+' : '') + num(x * 100, 1) + '%'; }

  /* ---------- tooltip ---------- */
  var tip = el('div', { id: 'tip', role: 'status' });
  function showTip(evt, text) {
    tip.textContent = text;
    tip.style.display = 'block';
    var x = Math.min(evt.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, evt.clientY - tip.offsetHeight - 12) + 'px';
  }
  function hideTip() { tip.style.display = 'none'; }
  function hover(node, textFn) {
    node.addEventListener('mousemove', function (e) { showTip(e, textFn()); });
    node.addEventListener('mouseleave', hideTip);
  }

  /* ---------- scales ---------- */
  function niceMax(v) {
    if (!(v > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  // Gridline count that gives round steps: 2 -> 0.5 steps, otherwise fifths.
  function divisions(max) {
    var m = max / Math.pow(10, Math.floor(Math.log10(max)));
    return Math.abs(m - 2) < 1e-9 ? 4 : 5;
  }
  function tickDecimals(max) {
    var step = max / divisions(max);
    return step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  }

  function frame(W, H, m, max, fmt, unit) {
    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    var plotH = H - m.t - m.b, nd = divisions(max);
    for (var i = 0; i <= nd; i++) {
      var v = max * i / nd, y = m.t + plotH - plotH * i / nd;
      root.appendChild(svg('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: i ? COLOR.grid : COLOR.ink2, 'stroke-width': 1 }));
      root.appendChild(svg('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 13, fill: COLOR.ink2 }, fmt(v)));
    }
    if (unit) root.appendChild(svg('text', { x: 0, y: 12, 'font-size': 13, fill: COLOR.ink2 }, unit));
    return root;
  }

  /* ---------- bar chart: one measure over the years ---------- */
  function barChart(o) {
    var W = NARROW ? 400 : 640, H = 300, m = { l: 52, r: 16, t: 30, b: 34 };
    var vals = o.values, n = vals.length;
    var max = niceMax(Math.max.apply(null, vals.map(function (v) { return v || 0; })));
    var d = tickDecimals(max);
    var root = frame(W, H, m, max, function (v) { return num(v, d); }, o.unit);
    root.setAttribute('aria-label', o.aria);
    var band = (W - m.l - m.r) / n, bw = Math.min(44, band * 0.62), plotH = H - m.t - m.b;
    var lastIdx = -1;
    vals.forEach(function (v, i) { if (v != null) lastIdx = i; });
    vals.forEach(function (v, i) {
      var cx = m.l + band * (i + 0.5);
      if (n <= (NARROW ? 6 : 12) || i % 2 === (n - 1) % 2) {
        root.appendChild(svg('text', { x: cx, y: H - 12, 'text-anchor': 'middle', 'font-size': 13, fill: COLOR.ink2 }, o.labels[i]));
      }
      if (v == null) return;
      var h = Math.max(1, plotH * v / max), y = m.t + plotH - h, r = Math.min(4, h);
      var bar = svg('path', {
        d: 'M' + (cx - bw / 2) + ' ' + (y + h) + 'V' + (y + r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' -' + r +
          'H' + (cx + bw / 2 - r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r + 'V' + (y + h) + 'Z',
        fill: o.color
      });
      hover(bar, function () { return o.labels[i] + ': ' + o.format(v); });
      root.appendChild(bar);
      if (i === lastIdx) {
        var label = o.format(v), halfW = label.length * 4.6;  // about half the text width at 15px
        var toEnd = cx + halfW > W - m.r;
        root.appendChild(svg('text', { x: toEnd ? cx + bw / 2 : cx, y: y - 8, 'text-anchor': toEnd ? 'end' : 'middle', 'font-size': 15, 'font-weight': 700, fill: COLOR.ink }, label));
      }
    });
    return el('div', { 'class': 'chart' }, [root]);
  }

  /* ---------- line chart: up to a few series over the years ---------- */
  function lineChart(o) {
    var W = NARROW ? 400 : 640, H = 300, m = { l: 52, r: NARROW ? 112 : 150, t: 30, b: 34 };
    var n = o.labels.length, all = [];
    o.series.forEach(function (s) { s.values.forEach(function (v) { if (v != null) all.push(v); }); });
    var max = niceMax(Math.max.apply(null, all.concat([0])));
    var d = o.tickDecimals != null ? o.tickDecimals : tickDecimals(max);
    var root = frame(W, H, m, max, function (v) { return o.tick ? o.tick(v) : num(v, d); }, o.unit);
    root.setAttribute('aria-label', o.aria);
    var plotW = W - m.l - m.r, plotH = H - m.t - m.b;
    function X(i) { return m.l + (n === 1 ? plotW / 2 : plotW * i / (n - 1)); }
    function Y(v) { return m.t + plotH - plotH * v / max; }
    o.labels.forEach(function (lab, i) {
      if (n <= 8 || i % 2 === (n - 1) % 2) {
        root.appendChild(svg('text', { x: X(i), y: H - 12, 'text-anchor': 'middle', 'font-size': 13, fill: COLOR.ink2 }, lab));
      }
    });
    var ends = [];
    o.series.forEach(function (s) {
      var path = '', pen = false, last = -1;
      s.values.forEach(function (v, i) {
        if (v == null) { pen = false; return; }
        path += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1);
        pen = true; last = i;
      });
      root.appendChild(svg('path', { d: path, fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      if (last >= 0) {
        root.appendChild(svg('circle', { cx: X(last), cy: Y(s.values[last]), r: 5, fill: s.color, stroke: '#FFF7E8', 'stroke-width': 2 }));
        ends.push({ s: s, x: X(last), y: Y(s.values[last]), v: s.values[last] });
      }
    });
    ends.sort(function (a, b) { return a.y - b.y; });
    for (var k = 1; k < ends.length; k++) {
      if (ends[k].y - ends[k - 1].y < 34) ends[k].y = ends[k - 1].y + 34;
    }
    ends.forEach(function (e) {
      root.appendChild(svg('text', { x: e.x + 12, y: e.y - 2, 'font-size': 14, 'font-weight': 700, fill: COLOR.ink }, e.s.name));
      root.appendChild(svg('text', { x: e.x + 12, y: e.y + 15, 'font-size': 14, fill: COLOR.ink }, o.format(e.v)));
    });
    var cross = svg('line', { y1: m.t, y2: m.t + plotH, stroke: COLOR.ink2, 'stroke-width': 1, 'stroke-dasharray': '3 3', visibility: 'hidden' });
    root.appendChild(cross);
    var slot = n > 1 ? plotW / (n - 1) : plotW;
    o.labels.forEach(function (lab, i) {
      var zone = svg('rect', { x: X(i) - slot / 2, y: m.t, width: slot, height: plotH, fill: 'transparent' });
      zone.addEventListener('mousemove', function (e) {
        cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
        showTip(e, lab + ' — ' + o.series.map(function (s) { return s.name + ': ' + (s.values[i] == null ? 'not available' : o.format(s.values[i])); }).join('; '));
      });
      zone.addEventListener('mouseleave', function () { cross.setAttribute('visibility', 'hidden'); hideTip(); });
      root.appendChild(zone);
    });
    return el('div', { 'class': 'chart' }, [root]);
  }

  /* ---------- horizontal bars: shares in one year ---------- */
  function hbars(items, aria) {
    var max = Math.max.apply(null, items.map(function (it) { return it.value; }));
    var scale = niceMax(max);
    var box = el('div', { 'class': 'hbars', role: 'img', 'aria-label': aria });
    items.forEach(function (it) {
      var fill = el('div', { 'class': 'fill', style: 'width:' + (100 * it.value / scale).toFixed(1) + '%;background:' + it.color });
      box.appendChild(el('div', { 'class': 'hbar' }, [
        el('span', { text: it.label }), el('div', { 'class': 'track' }, [fill]), el('span', { 'class': 'val', text: pct(it.value) })
      ]));
    });
    return box;
  }

  function table(cols, rows) {
    var head = el('tr', {}, cols.map(function (c) { return el('th', { scope: 'col', text: c }); }));
    var body = rows.map(function (r) {
      return el('tr', {}, r.map(function (c) {
        return typeof c === 'object' && c ? el('td', { 'class': 'flag', text: c.flag }) : el('td', { text: c });
      }));
    });
    return el('div', { 'class': 'tablebox' }, [el('table', {}, [el('thead', {}, [head]), el('tbody', {}, body)])]);
  }

  function legend(items) {
    return el('div', { 'class': 'legend' }, items.map(function (it) {
      return el('span', {}, [el('i', { style: 'background:' + it.color }), document.createTextNode(it.name)]);
    }));
  }

  var figureCount = 0;
  function figure(parent, o) {
    figureCount += 1;
    var kids = [
      el('h3', { text: o.headline }),
      el('p', { 'class': 'sub', text: 'Figure ' + figureCount + ': ' + o.sub }),
      o.legend ? legend(o.legend) : null,
      o.chart,
      o.note ? el('p', { 'class': 'note', text: o.note }) : null,
      el('p', { 'class': 'source', text: 'Source: UN Comtrade.' })
    ];
    if (o.table) {
      kids.push(el('details', {}, [el('summary', { text: 'Show the data as a table' }), table(o.table.cols, o.table.rows)]));
    }
    parent.appendChild(el('div', { 'class': o.wide ? 'card wide' : 'card' }, kids));
  }

  function kpi(parent, label, value, unit, note) {
    var v = el('span', { 'class': 'value', text: value });
    if (unit) v.appendChild(el('small', { text: unit }));
    parent.appendChild(el('div', { 'class': 'kpi' }, [el('span', { 'class': 'label', text: label }), v, el('span', { 'class': 'note', text: note })]));
  }

  // Comparison of reported trade: more than 10% apart, or recorded by one side only.
  function needsReview(r) { return r.difference_share == null || Math.abs(r.difference_share) > 0.1; }
  function recorded(t) { return t == null ? 'not recorded' : num(t, 0); }

  function by(rows, key, value) { return rows.filter(function (r) { return r[key] === value; }); }
  function yearsOf(first, last) { var out = []; for (var y = first; y <= last; y++) out.push(y); return out; }
  function topWithOther(rows, n, valueKey, colorFn) {
    var top = rows.slice(0, n), rest = 1 - top.reduce(function (a, r) { return a + r[valueKey]; }, 0);
    var items = top.map(function (r) { return { label: name(r.partner_name), value: r[valueKey], color: colorFn(r) }; });
    if (rows.length > n && rest > 0.0005) items.push({ label: 'All other countries', value: rest, color: '#B4B8C6' });
    return items;
  }

  /* ================= story 1: wheat ================= */
  function renderWheat(d) {
    var T = d.tables, Y = d.meta.latest_year, years = yearsOf(d.meta.first_year, Y), labels = years.map(String);
    var range = d.meta.first_year + ' to ' + Y;
    function series(rows, key) {
      return years.map(function (y) { var r = by(rows, 'year', y)[0]; return r && r[key] != null ? r[key] : null; });
    }
    var imp = T.mart_wheat_imports_year, impVals = series(imp, 'million_tonnes');
    var sup = by(T.mart_wheat_suppliers, 'year', Y);
    var conc = by(T.mart_wheat_concentration, 'year', Y)[0] || {};
    function shareOf(iso) {
      return years.map(function (y) {
        if (!by(imp, 'year', y).length) return null;
        var r = T.mart_wheat_suppliers.filter(function (x) { return x.year === y && x.partner === iso; })[0];
        return r ? r.share : 0;
      });
    }
    var aus = shareOf('AUS'), usa = shareOf('USA');
    var flour = by(T.mart_wheat_product_exports, 'hs', '1101'), noodles = by(T.mart_wheat_product_exports, 'hs', '190230');
    var flourV = series(flour, 'value_usd_million'), noodleV = series(noodles, 'value_usd_million');
    var last = years.length - 1;
    // Years with a value but no tonnes: too much of the value is in records without a weight.
    var noWeight = imp.filter(function (r) { return r.million_tonnes == null && r.value_usd_million != null; });
    function noWeightNote(what) {
      return noWeight.map(function (r) {
        return what + ' for ' + r.year + ' are not available: ' + pct(r.value_share_without_weight) +
          ' of that year’s import value is in records without a weight. The gap has not been estimated.';
      }).join(' ');
    }

    var k = document.getElementById('kpis');
    kpi(k, 'Wheat imported', num(impVals[last], 1), 'million tonnes', 'Calendar year ' + Y);
    kpi(k, 'Share supplied by Australia', pct(aus[last]), '', 'Share of tonnes, ' + Y);
    kpi(k, 'Share supplied by the three largest countries', pct(conc.top3_share), '', (conc.supplier_count || 0) + ' supplier countries in ' + Y);
    kpi(k, 'Exports of flour, noodles and prepared pasta', num((flourV[last] || 0) + (noodleV[last] || 0), 0), 'US$ million', 'Calendar year ' + Y);

    var s1 = document.getElementById('s1');
    figure(s1, {
      headline: 'Indonesia imported ' + num(impVals[last], 1) + ' million tonnes of wheat in ' + Y,
      sub: 'Wheat imports, Indonesia, ' + range + ', million tonnes',
      chart: barChart({ labels: labels, values: impVals, color: COLOR.AUS, unit: 'Million tonnes', aria: 'Bar chart of Indonesia’s wheat imports by year, ' + range + '. The table below gives every value.', format: function (v) { return num(v, 1) + ' million tonnes'; } }),
      note: noWeightNote('Tonnes'),
      table: { cols: ['Year', 'Million tonnes', 'Value (US$ million)', 'US$ per tonne'], rows: imp.map(function (r) { return [String(r.year), num(r.million_tonnes, 2), num(r.value_usd_million, 0), num(r.usd_per_tonne, 0)]; }) }
    });
    figure(s1, {
      headline: sup.length ? name(sup[0].partner_name) + ' was the largest supplier in ' + Y + ', with ' + pct(sup[0].share) + ' of imports' : 'No supplier data for ' + Y,
      sub: 'Share of wheat imports by supplier country, Indonesia, ' + Y + ', per cent of tonnes',
      chart: hbars(topWithOther(sup, 6, 'share', function (r) { return COLOR[r.partner] && r.partner !== 'IDN' ? COLOR[r.partner] : COLOR.other; }), 'Bar chart of supplier shares in ' + Y + '. The table below gives every value.'),
      table: { cols: ['Country', 'Million tonnes', 'Share'], rows: sup.map(function (r) { return [name(r.partner_name), num(r.million_tonnes, 2), pct(r.share, 1)]; }) }
    });
    figure(s1, {
      wide: true,
      headline: 'Australia supplied ' + pct(aus[last]) + ' and the United States ' + pct(usa[last]) + ' of wheat imports in ' + Y,
      sub: 'Share of wheat imports supplied by Australia and the United States, Indonesia, ' + range + ', per cent of tonnes',
      legend: [{ name: 'Australia', color: COLOR.AUS }, { name: 'United States', color: COLOR.USA }],
      chart: lineChart({ labels: labels, unit: 'Per cent of tonnes', aria: 'Line chart of the share of wheat imports from Australia and the United States, ' + range + '. The table below gives every value.',
        series: [{ name: 'Australia', color: COLOR.AUS, values: aus }, { name: 'United States', color: COLOR.USA, values: usa }],
        tick: function (v) { return num(v * 100, 0) + '%'; }, format: function (v) { return pct(v); } }),
      note: noWeightNote('Shares'),
      table: { cols: ['Year', 'Australia', 'United States'], rows: years.map(function (y, i) { return [String(y), pct(aus[i], 1), pct(usa[i], 1)]; }) }
    });

    var s2 = document.getElementById('s2');
    function destinations(hs) {
      var rows = T.mart_wheat_product_destinations.filter(function (r) { return r.year === Y && r.hs === hs && r.rank_in_year <= 3; });
      if (!rows.length) return '';
      return 'Largest destinations in ' + Y + ': ' + rows.map(function (r) { return name(r.partner_name) + ' (' + pct(r.share_of_value) + ')'; }).join(', ') + '.';
    }
    function exportFigure(rows, vals, what, hs) {
      figure(s2, {
        headline: what.charAt(0).toUpperCase() + what.slice(1) + ' exports were worth US$' + num(vals[last], 0) + ' million in ' + Y,
        sub: 'Value of ' + what + ' exports, Indonesia, ' + range + ', US$ million',
        chart: barChart({ labels: labels, values: vals, color: hs === '1101' ? COLOR.IDN : COLOR.USA, unit: 'US$ million', aria: 'Bar chart of the value of Indonesia’s ' + what + ' exports by year, ' + range + '. The table below gives every value.', format: function (v) { return 'US$' + num(v, 0) + ' million'; } }),
        note: destinations(hs),
        table: { cols: ['Year', 'Value (US$ million)', 'Thousand tonnes'], rows: rows.map(function (r) { return [String(r.year), num(r.value_usd_million, 1), num(r.thousand_tonnes, 1)]; }) }
      });
    }
    exportFigure(flour, flourV, 'wheat flour', '1101');
    exportFigure(noodles, noodleV, 'noodle and prepared pasta', '190230');

    var mir = T.mart_wheat_mirror, over = mir.filter(needsReview).length;
    document.getElementById('mirror-summary').textContent = mir.length
      ? 'The two figures differ by more than 10% in ' + over + ' of ' + mir.length + ' years.'
      : 'No years are available for comparison.';
    document.getElementById('mirror').appendChild(table(
      ['Year', 'Indonesia recorded (tonnes)', 'Australia recorded (tonnes)', 'Difference', 'Status'],
      mir.slice().reverse().map(function (r) {
        return [String(r.year), recorded(r.indonesia_reported_tonnes), recorded(r.australia_reported_tonnes), signedPct(r.difference_share),
          needsReview(r) ? { flag: 'Review' } : 'OK'];
      })));
  }

  /* ================= story 2: coal ================= */
  function renderCoal(d) {
    var T = d.tables, Y = d.meta.latest_year, years = yearsOf(d.meta.first_year, Y), labels = years.map(String);
    var range = d.meta.first_year + ' to ' + Y, last = years.length - 1;
    function series(iso, key) {
      return years.map(function (y) {
        var r = T.mart_coal_exports_year.filter(function (x) { return x.reporter === iso && x.year === y; })[0];
        return r && r[key] != null ? r[key] : null;
      });
    }
    function buyers(iso) { return T.mart_coal_buyers.filter(function (r) { return r.reporter === iso && r.year === Y; }); }
    function toChina(iso) {
      return years.map(function (y) {
        var rows = T.mart_coal_buyers.filter(function (x) { return x.reporter === iso && x.year === y; });
        if (!rows.length) return null;
        var r = rows.filter(function (x) { return x.partner === 'CHN'; })[0];
        return r ? r.share : 0;
      });
    }
    var two = [{ iso: 'IDN', name: 'Indonesia', color: COLOR.IDN }, { iso: 'AUS', name: 'Australia', color: COLOR.AUS }];
    var vol = { IDN: series('IDN', 'million_tonnes'), AUS: series('AUS', 'million_tonnes') };
    var price = { IDN: series('IDN', 'usd_per_tonne'), AUS: series('AUS', 'usd_per_tonne') };
    var china = { IDN: toChina('IDN'), AUS: toChina('AUS') };
    var lg = two.map(function (c) { return { name: c.name, color: c.color }; });
    function lines(src) { return two.map(function (c) { return { name: c.name, color: c.color, values: src[c.iso] }; }); }
    function twoColTable(src, fmt) { return years.map(function (y, i) { return [String(y), fmt(src.IDN[i]), fmt(src.AUS[i])]; }); }

    var k = document.getElementById('kpis');
    kpi(k, 'Coal exported by Indonesia', num(vol.IDN[last], 0), 'million tonnes', 'Calendar year ' + Y);
    kpi(k, 'Coal exported by Australia', num(vol.AUS[last], 0), 'million tonnes', 'Calendar year ' + Y);
    two.forEach(function (c) {
      var b = buyers(c.iso)[0];
      kpi(k, 'Share of ' + (c.iso === 'IDN' ? 'Indonesia’s' : 'Australia’s') + ' exports sent to its largest market', b ? pct(b.share) : 'not available', '', b ? name(b.partner_name) + ', ' + Y : '');
    });

    var s1 = document.getElementById('s1');
    figure(s1, {
      headline: 'Indonesia exported ' + num(vol.IDN[last], 0) + ' million tonnes of coal in ' + Y + ' and Australia ' + num(vol.AUS[last], 0) + ' million',
      sub: 'Coal exports, Australia and Indonesia, ' + range + ', million tonnes',
      legend: lg,
      chart: lineChart({ labels: labels, unit: 'Million tonnes', series: lines(vol), aria: 'Line chart of coal exports from Indonesia and Australia, ' + range + '. The table below gives every value.', format: function (v) { return num(v, 0) + ' million tonnes'; } }),
      table: { cols: ['Year', 'Indonesia (million tonnes)', 'Australia (million tonnes)'], rows: twoColTable(vol, function (v) { return num(v, 1); }) }
    });
    figure(s1, {
      headline: 'Australian coal averaged US$' + num(price.AUS[last], 0) + ' a tonne in ' + Y + ' and Indonesian coal US$' + num(price.IDN[last], 0),
      sub: 'Average export value of coal, Australia and Indonesia, ' + range + ', US$ per tonne',
      legend: lg,
      chart: lineChart({ labels: labels, unit: 'US$ per tonne', series: lines(price), aria: 'Line chart of the average export value of coal per tonne for Indonesia and Australia, ' + range + '. The table below gives every value.', format: function (v) { return 'US$' + num(v, 0); } }),
      note: 'The two countries export different grades of coal, so the two values are not a like-for-like price comparison.',
      table: { cols: ['Year', 'Indonesia (US$ per tonne)', 'Australia (US$ per tonne)'], rows: twoColTable(price, function (v) { return num(v, 0); }) }
    });

    var s2 = document.getElementById('s2');
    two.forEach(function (c) {
      var b = buyers(c.iso);
      figure(s2, {
        headline: b.length ? name(b[0].partner_name) + ' took ' + pct(b[0].share) + ' of ' + c.name + '’s coal exports in ' + Y : 'No destination data for ' + c.name + ' in ' + Y,
        sub: 'Share of coal exports by destination, ' + c.name + ', ' + Y + ', per cent of tonnes',
        chart: hbars(topWithOther(b, 6, 'share', function () { return c.color; }), 'Bar chart of the destinations of ' + c.name + '’s coal exports in ' + Y + '. The table below gives every value.'),
        table: { cols: ['Destination', 'Million tonnes', 'Share'], rows: b.map(function (r) { return [name(r.partner_name), num(r.million_tonnes, 1), pct(r.share, 1)]; }) }
      });
    });
    figure(s2, {
      wide: true,
      headline: 'China took ' + pct(china.IDN[last]) + ' of Indonesia’s coal exports and ' + pct(china.AUS[last]) + ' of Australia’s in ' + Y,
      sub: 'Share of coal exports sent to China, Australia and Indonesia, ' + range + ', per cent of tonnes',
      legend: lg,
      chart: lineChart({ labels: labels, unit: 'Per cent of tonnes', series: lines(china), aria: 'Line chart of the share of coal exports sent to China from Indonesia and Australia, ' + range + '. The table below gives every value.', tick: function (v) { return num(v * 100, 0) + '%'; }, format: function (v) { return pct(v); } }),
      table: { cols: ['Year', 'Indonesia', 'Australia'], rows: twoColTable(china, function (v) { return pct(v, 1); }) }
    });

    var mir = T.mart_coal_mirror, over = mir.filter(needsReview).length;
    document.getElementById('mirror-summary').textContent = mir.length
      ? 'The two figures differ by more than 10% in ' + over + ' of ' + mir.length + ' comparisons.'
      : 'No years are available for comparison.';
    document.getElementById('mirror').appendChild(table(
      ['Exporter', 'Year', 'Exporter recorded (tonnes)', 'China recorded (tonnes)', 'Difference', 'Status'],
      mir.slice().sort(function (a, b) { return a.exporter < b.exporter ? -1 : a.exporter > b.exporter ? 1 : b.year - a.year; }).map(function (r) {
        return [COUNTRY[r.exporter] || r.exporter, String(r.year), recorded(r.exporter_reported_tonnes), recorded(r.china_reported_tonnes), signedPct(r.difference_share),
          needsReview(r) ? { flag: 'Review' } : 'OK'];
      })));
  }

  /* ================= start ================= */
  function start() {
    var story = document.body.getAttribute('data-story');
    if (!story) return;
    document.body.appendChild(tip);
    fetch('../data/' + story + '.json').then(function (r) {
      if (!r.ok) throw new Error('no data file');
      return r.json();
    }).then(function (d) {
      var m = d.meta;
      document.getElementById('meta').textContent = 'Source: UN Comtrade. Period covered: ' + m.first_year + ' to ' + m.latest_year +
        '. Data retrieved: ' + (m.data_retrieved || 'not recorded') + '. Figures for ' + m.latest_year + ' may be revised as countries update their reports.';
      (story === 'wheat' ? renderWheat : renderCoal)(d);
    }).catch(function (err) {
      var box = el('div', { 'class': 'empty', text: 'No data has been loaded yet. Run the data pipeline (see the README) to fill this dashboard.' });
      var main = document.getElementById('kpis');
      main.parentNode.insertBefore(box, main);
      if (window.console) console.error(err);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
