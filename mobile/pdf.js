/*
 * The digest PDF on the phone: a port of digest-tool/newsdigest/render.py.
 *
 * The desktop draws the 12-page colour edition with reportlab in Python. A
 * WebView has neither, so this file holds a small PDF writer (the two built-in
 * Helvetica fonts, rectangles, circles, paths and wrapped text) and the same
 * page layout: navy header with the section number, orange headline bar, the
 * paragraph box, figure tiles, the story cards or flowchart, key points and
 * full forms, the three bottom boxes and the sources footer. Every text box
 * shrinks its font until the text fits, exactly as render.py does.
 */
(function () {
  'use strict';

  window.SSB = window.SSB || {};

  // Glyph widths (1/1000 em) for character codes 32..255 in WinAnsi encoding,
  // taken from reportlab's Helvetica metrics so text wraps the same way.
  var W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
  var W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];

  // Unicode -> WinAnsi for the 0x80-0x9F block; everything else maps 1:1 up to 255.
  var CP1252 = { 8364: 128, 8218: 130, 402: 131, 8222: 132, 8230: 133, 8224: 134, 8225: 135, 710: 136, 8240: 137,
    352: 138, 8249: 139, 338: 140, 381: 142, 8216: 145, 8217: 146, 8220: 147, 8221: 148, 8226: 149, 8211: 150,
    8212: 151, 732: 152, 8482: 153, 353: 154, 8250: 155, 339: 156, 382: 158, 376: 159 };

  // Characters the built-in font cannot show, as render.py's ODD_CHARS and the ₹ fallback.
  function tidy(s) {
    return String(s == null ? '' : s)
      .replace(/₹\s?/g, 'Rs ')
      .replace(/[‐-‒―−]/g, '-')
      .replace(/[     ]/g, ' ')
      .replace(/[​­]/g, '')
      .replace(/●/g, '•');
  }

  function code(ch) {
    var c = ch.charCodeAt(0);
    if (c >= 32 && c < 127) return c;
    if (CP1252[c]) return CP1252[c];
    if (c >= 160 && c <= 255) return c;
    return 63; // '?'
  }

  function width(text, bold, size) {
    var w = bold ? W_BOLD : W_REG;
    var t = 0;
    for (var i = 0; i < text.length; i++) {
      var c = code(text[i]);
      t += w[c - 32] || 556;
    }
    return (t * size) / 1000;
  }

  function pdfString(text) {
    var out = '(';
    for (var i = 0; i < text.length; i++) {
      var c = code(text[i]);
      if (c === 40 || c === 41 || c === 92) out += '\\' + String.fromCharCode(c);
      else if (c < 127) out += String.fromCharCode(c);
      else out += '\\' + ('00' + c.toString(8)).slice(-3);
    }
    return out + ')';
  }

  function rgb(hex) {
    var n = parseInt(String(hex).replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function num(v) {
    return (Math.round(v * 100) / 100).toString();
  }

  /* --------------------------------------------------------- the canvas */

  function Canvas(w, h) {
    this.W = w;
    this.H = h;
    this.pages = [];
    this.ops = [];
  }

  Canvas.prototype.fill = function (hex) {
    var c = rgb(hex);
    this.ops.push(num(c[0]) + ' ' + num(c[1]) + ' ' + num(c[2]) + ' rg');
  };
  Canvas.prototype.stroke = function (hex, lw) {
    var c = rgb(hex);
    this.ops.push(num(c[0]) + ' ' + num(c[1]) + ' ' + num(c[2]) + ' RG ' + num(lw || 1) + ' w');
  };
  Canvas.prototype.rect = function (x, y, w, h) {
    this.ops.push(num(x) + ' ' + num(y) + ' ' + num(w) + ' ' + num(h) + ' re f');
  };
  // reportlab's roundRect: (x, y) is the bottom-left corner.
  Canvas.prototype.roundRect = function (x, y, w, h, r, mode) {
    var k = 0.5523 * r;
    var o = this.ops;
    o.push(num(x + r) + ' ' + num(y) + ' m');
    o.push(num(x + w - r) + ' ' + num(y) + ' l');
    o.push(num(x + w - r + k) + ' ' + num(y) + ' ' + num(x + w) + ' ' + num(y + r - k) + ' ' + num(x + w) + ' ' + num(y + r) + ' c');
    o.push(num(x + w) + ' ' + num(y + h - r) + ' l');
    o.push(num(x + w) + ' ' + num(y + h - r + k) + ' ' + num(x + w - r + k) + ' ' + num(y + h) + ' ' + num(x + w - r) + ' ' + num(y + h) + ' c');
    o.push(num(x + r) + ' ' + num(y + h) + ' l');
    o.push(num(x + r - k) + ' ' + num(y + h) + ' ' + num(x) + ' ' + num(y + h - r + k) + ' ' + num(x) + ' ' + num(y + h - r) + ' c');
    o.push(num(x) + ' ' + num(y + r) + ' l');
    o.push(num(x) + ' ' + num(y + r - k) + ' ' + num(x + r - k) + ' ' + num(y) + ' ' + num(x + r) + ' ' + num(y) + ' c');
    o.push(mode || 'f');
  };
  Canvas.prototype.circle = function (cx, cy, r) {
    var k = 0.5523 * r;
    var o = this.ops;
    o.push(num(cx + r) + ' ' + num(cy) + ' m');
    o.push(num(cx + r) + ' ' + num(cy + k) + ' ' + num(cx + k) + ' ' + num(cy + r) + ' ' + num(cx) + ' ' + num(cy + r) + ' c');
    o.push(num(cx - k) + ' ' + num(cy + r) + ' ' + num(cx - r) + ' ' + num(cy + k) + ' ' + num(cx - r) + ' ' + num(cy) + ' c');
    o.push(num(cx - r) + ' ' + num(cy - k) + ' ' + num(cx - k) + ' ' + num(cy - r) + ' ' + num(cx) + ' ' + num(cy - r) + ' c');
    o.push(num(cx + k) + ' ' + num(cy - r) + ' ' + num(cx + r) + ' ' + num(cy - k) + ' ' + num(cx + r) + ' ' + num(cy) + ' c');
    o.push('f');
  };
  Canvas.prototype.line = function (x1, y1, x2, y2) {
    this.ops.push(num(x1) + ' ' + num(y1) + ' m ' + num(x2) + ' ' + num(y2) + ' l S');
  };
  Canvas.prototype.poly = function (pts) {
    var o = this.ops;
    o.push(num(pts[0][0]) + ' ' + num(pts[0][1]) + ' m');
    for (var i = 1; i < pts.length; i++) o.push(num(pts[i][0]) + ' ' + num(pts[i][1]) + ' l');
    o.push('h f');
  };
  Canvas.prototype.text = function (x, y, str, bold, size, hex) {
    var c = rgb(hex);
    this.ops.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + num(size) + ' Tf ' + num(c[0]) + ' ' + num(c[1]) + ' ' + num(c[2]) +
      ' rg ' + num(x) + ' ' + num(y) + ' Td ' + pdfString(str) + ' Tj ET');
  };
  Canvas.prototype.showPage = function () {
    this.pages.push(this.ops.join('\n'));
    this.ops = [];
  };

  Canvas.prototype.bytes = function (title) {
    var objs = [];
    var add = function (s) { objs.push(s); return objs.length; };
    var catalog = add('');
    var pagesObj = add('');
    var f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    var f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    var kids = [];
    var self = this;
    this.pages.forEach(function (stream) {
      var content = add('<< /Length ' + latin1Length(stream) + ' >>\nstream\n' + stream + '\nendstream');
      kids.push(add('<< /Type /Page /Parent ' + pagesObj + ' 0 R /MediaBox [0 0 ' + num(self.W) + ' ' + num(self.H) +
        '] /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >> >> /Contents ' + content + ' 0 R >>'));
    });
    objs[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesObj + ' 0 R >>';
    objs[pagesObj - 1] = '<< /Type /Pages /Kids [' + kids.map(function (k) { return k + ' 0 R'; }).join(' ') +
      '] /Count ' + kids.length + ' >>';
    var info = add('<< /Title ' + pdfString(tidy(title)) + ' /Producer (SSB Prep Trainer) >>');

    var out = '%PDF-1.4\n';
    var offsets = [];
    objs.forEach(function (o, i) {
      offsets.push(latin1Length(out));
      out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n';
    });
    var xref = latin1Length(out);
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach(function (off) { out += ('0000000000' + off).slice(-10) + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    var bytes = new Uint8Array(out.length);
    for (var i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return bytes;
  };

  // Content streams only ever hold single-byte characters (pdfString escapes the rest).
  function latin1Length(s) {
    return s.length;
  }

  /* ------------------------------------------------------- rich paragraphs */

  // A paragraph is a list of items (bullets or lines); an item is a list of
  // runs {t: text, b: bold, c: colour}. "**x**" in plain text marks bold.
  function runs(text, color, boldAll) {
    var out = [];
    String(text).split(/(\*\*[^*]+\*\*)/).forEach(function (part) {
      if (!part) return;
      var m = /^\*\*([^*]+)\*\*$/.exec(part);
      out.push({ t: tidy(m ? m[1] : part), b: !!m || !!boldAll, c: color });
    });
    return out;
  }

  // Splits the runs of one item into lines no wider than w at this size.
  function wrapItem(item, w, size) {
    var lines = [];
    var line = [];
    var lineW = 0;
    item.forEach(function (run) {
      run.t.split(/(\s+)/).forEach(function (word) {
        if (!word) return;
        var space = /^\s+$/.test(word);
        if (space && !line.length) return;
        var ww = width(space ? ' ' : word, run.b, size);
        if (!space && lineW + ww > w && line.length) {
          while (line.length && /^\s+$/.test(line[line.length - 1].t)) {
            lineW -= width(' ', line[line.length - 1].b, size);
            line.pop();
          }
          lines.push(line);
          line = [];
          lineW = 0;
        }
        line.push({ t: space ? ' ' : word, b: run.b, c: run.c, w: ww });
        lineW += ww;
      });
    });
    if (line.length) lines.push(line);
    return lines;
  }

  function layout(items, w, size, lead) {
    var lines = [];
    items.forEach(function (item) { lines = lines.concat(wrapItem(item, w, size)); });
    return { lines: lines, h: lines.length * size * lead };
  }

  /* ------------------------------------------------------------ the page */

  var M = 22;
  var WHITE = '#ffffff';

  function Page(c, colors) {
    this.c = c;
    this.col = colors;
  }

  // render.py fit_para: shrink to fit, then drop whole items, then sentences, then words.
  Page.prototype.fitPara = function (items, x, top, w, h, o) {
    o = o || {};
    var size = o.size || 10.5;
    var min = o.min || 5.5;
    var lead = o.lead || 1.25;
    var s = size;
    var lay;
    for (;;) {
      lay = layout(items, w, s, lead);
      if (lay.h <= h || s <= min) break;
      s -= 0.25;
    }
    if (lay.h > h) {
      var its = items.slice();
      while (lay.h > h && its.length > 1) {
        its.pop();
        lay = layout(its, w, s, lead);
      }
      while (lay.h > h && lay.lines.length > 1) {
        lay.lines.pop();
        lay.h = lay.lines.length * s * lead;
        var last = lay.lines[lay.lines.length - 1];
        last.push({ t: ' ...', b: false, c: last[0].c, w: width(' ...', false, s) });
      }
    }
    var dy = o.valign === 'middle' ? (h - lay.h) / 2 : 0;
    var c = this.c;
    lay.lines.forEach(function (line, i) {
      var lw = line.reduce(function (n, r) { return n + r.w; }, 0);
      var lx = o.align === 'center' ? x + (w - lw) / 2 : x;
      var y = top - dy - s - i * s * lead + s * 0.18;
      line.forEach(function (r) {
        if (r.t !== ' ') c.text(lx, y, r.t, r.b, s, r.c);
        lx += r.w;
      });
    });
    return lay.h;
  };

  Page.prototype.fitLine = function (text, x, y, w, size, min, bold, color, align) {
    text = tidy(text);
    var s = size;
    while (width(text, bold, s) > w && s > min) s -= 0.25;
    while (width(text, bold, s) > w && text.length > 4) text = text.slice(0, -4).replace(/\s+$/, '') + '...';
    var x0 = align === 'center' ? x + (w - width(text, bold, s)) / 2 : x;
    this.c.text(x0, y, text, bold, s, color);
    return s;
  };

  Page.prototype.box = function (x, top, w, h, fill, stroke, r, lw) {
    var c = this.c;
    c.fill(fill);
    if (stroke) {
      c.stroke(stroke, lw || 1);
      c.roundRect(x, top - h, w, h, r == null ? 5 : r, 'B');
    } else {
      c.roundRect(x, top - h, w, h, r == null ? 5 : r, 'f');
    }
  };

  // Bullets with a coloured dot, and a bold "Label:" lead-in, as render.py bullets().
  Page.prototype.bullets = function (list, color) {
    var dot = this.col[color];
    var text = this.col.text;
    var out = [];
    (Array.isArray(list) ? list : [list]).forEach(function (raw) {
      var t = tidy(raw).trim();
      if (!t) return;
      var item = [{ t: '•  ', b: true, c: dot }];
      var m = /^([A-Za-z][^:<>#]{1,29}):\s/.exec(t);
      if (m) {
        item.push({ t: m[1] + ': ', b: true, c: text });
        t = t.slice(m[0].length);
      }
      out.push(item.concat(runs(t, text)));
    });
    return out.length ? out : [[{ t: '-', b: false, c: text }]];
  };

  Page.prototype.barBox = function (x, top, w, h, title, barColor, items, size) {
    var c = this.c;
    var bh = 16;
    this.box(x, top, w, h, this.col.grey, null, 4);
    c.fill(barColor);
    c.roundRect(x, top - bh, w, bh, 4, 'f');
    c.rect(x, top - bh, w, bh / 2);
    this.fitLine(title, x + 7, top - 11.5, w - 14, 8.5, 6, true, WHITE);
    this.fitPara(items, x + 7, top - bh - 5, w - 14, h - bh - 9, { size: size, min: 5 });
  };

  Page.prototype.header = function (draft, p, total) {
    var c = this.c;
    var W = c.W;
    var H = c.H;
    var h = 80;
    c.fill(this.col.navy);
    c.rect(0, H - h, W, h);
    var r = 25;
    var cx = W - M - r;
    var cy = H - h / 2;
    c.fill(this.col.orange);
    c.circle(cx, cy, r);
    this.fitLine(String(p.n), cx - r, cy - 9, 2 * r, 26, 12, true, WHITE, 'center');
    this.fitLine(String(p.name).toUpperCase(), M, H - 44, W - 2 * M - 2 * r - 16, 30, 12, true, WHITE);
    var sub = (draft.title || 'Daily News Digest') + ' | ' + draft.day + ' | Category ' + p.n + ' of ' + total;
    this.fitLine(sub, M, H - 64, W - 2 * M - 2 * r - 16, 10.5, 7, false, '#cfd9e6');
    return H - h;
  };

  Page.prototype.headline = function (p, top) {
    var W = this.c.W;
    var h = 28;
    this.box(M, top, W - 2 * M, h, this.col.orange, null, 4);
    this.fitLine(p.headline + (p.headline_verify ? '  (verify)' : ''), M + 10, top - 18.5, W - 2 * M - 20, 13, 7.5, true, WHITE);
    return top - h;
  };

  Page.prototype.mainBox = function (p, top, h) {
    var c = this.c;
    var w = c.W - 2 * M;
    this.box(M, top, w, h, this.col.light, null, 6);
    c.fill(this.col.navy);
    c.rect(M, top - h, 4, h);
    var items = [runs(p.paragraph, this.col.text)];
    if (p.notes && p.notes.length) {
      items.push([{ t: 'Note: ', b: true, c: this.col.orange }].concat(runs(p.notes.join(' | '), this.col.orange)));
    }
    this.fitPara(items, M + 12, top - 8, w - 22, h - 14, { size: 10.5, min: 6, lead: 1.3 });
    return top - h;
  };

  Page.prototype.tiles = function (p, top, h) {
    var tiles = p.tiles || [];
    if (!tiles.length) return top;
    var n = tiles.length;
    var gap = 8;
    var w = (this.c.W - 2 * M - gap * (n - 1)) / n;
    var self = this;
    tiles.forEach(function (t, i) {
      var x = M + i * (w + gap);
      self.box(x, top, w, h, self.col.navy, null, 6);
      self.fitLine(String(t.value || ''), x + 6, top - 27, w - 12, 20, 9, true, self.col.orange, 'center');
      self.fitPara([runs(t.label || '', WHITE)], x + 6, top - 33, w - 12, h - 36, { size: 8, min: 5.5, align: 'center' });
    });
    return top - h;
  };

  Page.prototype.flow = function (p, top, h) {
    var c = this.c;
    var W = c.W;
    var fl = p.flow || {};
    var steps = (fl.steps || []).filter(function (s) { return String(s).trim(); }).slice(0, 8);
    var isFlow = fl.mode === 'flow';
    this.fitLine((fl.title || (isFlow ? 'FLOWCHART' : 'SNAPSHOT')).toUpperCase(), M, top - 10, 300, 9, 7, true, this.col.teal);
    if (!steps.length) {
      this.fitPara([runs('No extra stories for this box today.', this.col.muted)], M, top - 18, 300, 20, { size: 8 });
      return top - h;
    }
    var cards = !isFlow && steps.some(function (s) { return String(s).indexOf('\n') >= 0; });
    var rows = [];
    if (cards) {
      for (var i = 0; i < steps.length; i += 2) rows.push(steps.slice(i, i + 2));
    } else if (steps.length <= 5) {
      rows = [steps];
    } else {
      var half = Math.ceil(steps.length / 2);
      rows = [steps.slice(0, half), steps.slice(half)];
    }
    var areaTop = top - 16;
    var areaH = h - 16;
    var rowGap = rows.length > 1 ? 12 : 0;
    var bh = (areaH - rowGap * (rows.length - 1)) / rows.length;
    var arrowW = isFlow ? 20 : 8;
    var n0 = rows[0].length;
    var bw = (W - 2 * M - arrowW * (n0 - 1)) / n0;
    var counter = 0;
    var self = this;
    var teal = this.col.teal;
    var orange = this.col.orange;
    rows.forEach(function (row, ri) {
      var yTop = areaTop - ri * (bh + rowGap);
      row.forEach(function (s, j) {
        counter += 1;
        var x = M + j * (bw + arrowW);
        self.box(x, yTop, bw, bh, WHITE, teal, 5, 1.3);
        var padLeft = 6;
        if (isFlow) {
          c.fill(teal);
          c.circle(x + 11, yTop - 11, 8);
          self.fitLine(String(counter), x + 3, yTop - 14.5, 16, 9, 6, true, WHITE, 'center');
          padLeft = 22;
        }
        if (cards) {
          var parts = String(s).split('\n');
          var items = [runs(parts[0], self.col.text, true)];
          if ((parts[1] || '').trim()) items.push(runs(parts.slice(1).join(' '), self.col.text));
          self.fitPara(items, x + 7, yTop - 5, bw - 14, bh - 9, { size: 8, min: 5.5 });
          return;
        }
        var m = /^([^:]{2,30}):\s+([\s\S]*)$/.exec(String(s));
        if (m && width(m[1], true, 6) > bw - padLeft - 6) m = null;
        if (m) {
          self.fitLine(m[1], x + padLeft, yTop - 14.5, bw - padLeft - 6, 9, 6, true, self.col.text);
          self.fitPara([runs(m[2], self.col.text)], x + 6, yTop - 21, bw - 11, bh - 24, { size: 8, min: 5 });
        } else {
          self.fitPara([runs(s, self.col.text)], x + padLeft, yTop - 4, bw - padLeft - 5, bh - 8, { size: 8.5, min: 5, valign: 'middle' });
        }
        if (isFlow && j < row.length - 1) {
          var ay = yTop - bh / 2;
          c.stroke(orange, 2);
          c.line(x + bw + 2, ay, x + bw + arrowW - 8, ay);
          c.fill(orange);
          c.poly([[x + bw + arrowW - 1, ay], [x + bw + arrowW - 9, ay + 6], [x + bw + arrowW - 9, ay - 6]]);
        }
      });
      if (isFlow && ri === 0 && rows.length > 1) {
        var xEnd = M + (row.length - 1) * (bw + arrowW) + bw / 2;
        var y1 = yTop - bh;
        var y2 = yTop - bh - rowGap;
        c.stroke(orange, 1.6);
        c.line(xEnd, y1 - 1, xEnd, y1 - rowGap / 2);
        c.line(xEnd, y1 - rowGap / 2, M + bw / 2, y1 - rowGap / 2);
        c.line(M + bw / 2, y1 - rowGap / 2, M + bw / 2, y2 + 4);
        c.fill(orange);
        c.poly([[M + bw / 2, y2 + 1], [M + bw / 2 - 3.5, y2 + 5.5], [M + bw / 2 + 3.5, y2 + 5.5]]);
      }
    });
    return top - h;
  };

  Page.prototype.columns = function (p, top, h) {
    var gap = 10;
    var w = (this.c.W - 2 * M - gap) / 2;
    this.barBox(M, top, w, h, 'KEY POINTS', this.col.teal, this.bullets(p.key_points || [], 'teal'), 8.5);
    var dot = this.col.orange;
    var text = this.col.text;
    var ff = (p.full_forms || []).map(function (f) {
      var same = String(f.full).toLowerCase() === String(f.abbr).toLowerCase();
      return [{ t: '•  ', b: true, c: dot }, { t: tidy(f.abbr), b: true, c: text }]
        .concat(runs(same ? ' - ' + f.does : ' - ' + f.full + ' (' + f.does + ')', text));
    });
    if (!ff.length) ff = [runs('No abbreviations on this page.', text)];
    this.barBox(M + w + gap, top, w, h, 'FULL FORMS (WHAT IT DOES)', this.col.navy, ff, 8.5);
    return top - h;
  };

  Page.prototype.bottom = function (p, top, h) {
    var gap = 8;
    var w = (this.c.W - 2 * M - 2 * gap) / 3;
    this.barBox(M, top, w, h, String(p.benefit_label || 'BENEFIT FOR INDIA').toUpperCase(), this.col.green,
      this.bullets(p.benefit || [], 'green'), 8);
    this.barBox(M + w + gap, top, w, h, 'ADVANCED POINT', this.col.orange,
      this.bullets(p.advanced && p.advanced.length ? p.advanced : ['-'], 'orange'), 8);
    this.barBox(M + 2 * (w + gap), top, w, h, 'ALSO IN THE NEWS', this.col.navy, this.bullets(p.also || [], 'navy'), 8);
    return top - h;
  };

  Page.prototype.footer = function (p, total, top, h) {
    var w = this.c.W - 2 * M;
    var muted = this.col.muted;
    this.box(M, top, w, h, this.col.light, null, 4);
    var item = [{ t: 'Sources: ', b: true, c: muted }]
      .concat(runs(((p.sources || []).join(', ') || '-') + '. ', muted))
      .concat([{ t: 'Confidence: ', b: true, c: muted }])
      .concat(runs(p.confidence || '-', muted));
    this.fitPara([item], M + 8, top - 5, w - 16, h - 9, { size: 7.5, min: 5, valign: 'middle' });
    this.fitLine('Page ' + p.n + ' of ' + total, M, top - h - 12, w, 7.5, 6, false, muted, 'center');
  };

  Page.prototype.draw = function (draft, p, total) {
    var steps = (p.flow && p.flow.steps) || [];
    var cards = p.flow && p.flow.mode !== 'flow' && steps.some(function (s) { return String(s).indexOf('\n') >= 0; }) ? 1 : 0;
    var top = this.header(draft, p, total) - 8;
    top = this.headline(p, top) - 8;
    top = this.mainBox(p, top, 152 - 12 * cards) - 8;
    top = this.tiles(p, top, 58 - 6 * cards) - 8;
    top = this.flow(p, top, 120 + 40 * cards) - 8;
    top = this.columns(p, top, 174 - 16 * cards) - 8;
    top = this.bottom(p, top, 106 - 6 * cards) - 6;
    this.footer(p, total, top, Math.min(34, top - 26));
  };

  // config.py "colors"
  var COLORS = { navy: '#14365d', orange: '#f08a24', light: '#eef3f8', teal: '#0b8aa6', green: '#2e8b57',
    grey: '#f3f4f6', text: '#1d2733', muted: '#5b6675' };

  SSB.pdf = {
    // A draft (the same shape draft.py writes) -> the bytes of an A4 PDF.
    render: function (draft) {
      var c = new Canvas(595.2756, 841.8898);
      var pages = draft.pages || [];
      pages.forEach(function (p) {
        new Page(c, COLORS).draw(draft, p, pages.length);
        c.showPage();
      });
      return c.bytes((draft.title || 'Daily News Digest') + ' - ' + draft.date);
    },
    width: width
  };
})();
