/* ============================================================
 * charts.js - SVG diagram rendering for beam analysis
 * ============================================================
 * Public:
 *   Charts.system(container, spec, supports, loads)
 *   Charts.line(container, xs, ys, opts)
 *   Charts.deflection(container, xs, ws, opts)
 *   Charts.combined(...)
 * ============================================================ */
(function (global) {
  "use strict";

  /* --- Helpers --- */
  function svg(tag, attrs, children) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (children) for (var i = 0; i < children.length; i++) el.appendChild(children[i]);
    return el;
  }
  function ns() { return "http://www.w3.org/2000/svg"; }
  function fmt(v, d) { d = d || 2; if (!isFinite(v)) return "0"; if (Math.abs(v) < 1e-4) return "0"; return v.toFixed(d); }

  /* --- System diagram --- */
  function system(container, spec) {
    container.innerHTML = "";
    var Ltot = spec.spans.reduce(function(a,b){return a+b;}, 0);
    if (!Ltot) return;
    var W = container.clientWidth || 700;
    var H = 200;
    var margin = { top: 30, right: 40, bottom: 40, left: 40 };
    var pw = W - margin.left - margin.right;
    var ph = H - margin.top - margin.bottom;
    var sc = pw / Ltot;
    var yBeam = margin.top + ph * 0.55;
    var s = svg("svg", {
      viewBox: "0 0 " + W + " " + H,
      preserveAspectRatio: "xMidYMid meet",
      width: W, height: H
    });
    // Beam line
    s.appendChild(svg("line", {
      x1: margin.left, x2: margin.left + Ltot * sc,
      y1: yBeam, y2: yBeam,
      stroke: "#1d2733", "stroke-width": 4
    }));
    // Span dividers (dotted)
    var xCur = 0;
    for (var i = 0; i < spec.spans.length - 1; i++) {
      xCur += spec.spans[i];
      s.appendChild(svg("line", {
        x1: margin.left + xCur*sc, x2: margin.left + xCur*sc,
        y1: yBeam - 6, y2: yBeam + 6,
        stroke: "#888", "stroke-dasharray": "2 2"
      }));
    }
    // Supports
    for (var sIdx = 0; sIdx < spec.supports.length; sIdx++) {
      var sup = spec.supports[sIdx];
      var sx = margin.left + sup.x * sc;
      var sy = yBeam;
      var color = "#0b5fff";
      if (sup.type === 'fixed') {
        // fixed: hatched wall + small block
        s.appendChild(svg("rect", { x: sx-12, y: sy, width: 24, height: 6, fill: color }));
        for (var hh = 0; hh < 6; hh++) {
          s.appendChild(svg("line", {
            x1: sx-12 + hh*4, x2: sx-12 + hh*4 - 4,
            y1: sy + 6, y2: sy + 12,
            stroke: color, "stroke-width": 1
          }));
        }
        s.appendChild(svg("text", { x: sx, y: sy + 24, "text-anchor": "middle", "font-size": 10, fill: color }, [document.createTextNode("Fest")]));
      } else if (sup.type === 'pinned') {
        // triangle
        var pts = (sx) + "," + sy + " " + (sx-8) + "," + (sy+12) + " " + (sx+8) + "," + (sy+12);
        s.appendChild(svg("polygon", { points: pts, fill: color }));
        s.appendChild(svg("line", { x1: sx-12, x2: sx+12, y1: sy+14, y2: sy+14, stroke: color, "stroke-width": 1 }));
        for (var hp = 0; hp < 5; hp++) {
          s.appendChild(svg("line", {
            x1: sx-12 + hp*6, x2: sx-12 + hp*6 - 4,
            y1: sy + 14, y2: sy + 20,
            stroke: color, "stroke-width": 1
          }));
        }
        s.appendChild(svg("text", { x: sx, y: sy + 30, "text-anchor": "middle", "font-size": 10, fill: color }, [document.createTextNode("Gel.")]));
      } else if (sup.type === 'roller') {
        var ptsr = (sx) + "," + sy + " " + (sx-8) + "," + (sy+10) + " " + (sx+8) + "," + (sy+10);
        s.appendChild(svg("polygon", { points: ptsr, fill: color }));
        s.appendChild(svg("circle", { cx: sx-4, cy: sy+13, r: 2, fill: color }));
        s.appendChild(svg("circle", { cx: sx+4, cy: sy+13, r: 2, fill: color }));
        s.appendChild(svg("line", { x1: sx-12, x2: sx+12, y1: sy+16, y2: sy+16, stroke: color, "stroke-width": 1 }));
        s.appendChild(svg("text", { x: sx, y: sy + 30, "text-anchor": "middle", "font-size": 10, fill: color }, [document.createTextNode("Roll")]));
      } else if (sup.type === 'spring') {
        // zigzag spring
        var zx = sx, zy = sy;
        var ptsZ = "";
        var n = 6;
        for (var z = 0; z < n; z++) {
          ptsZ += (zx + ((z % 2 === 0) ? -4 : 4)) + "," + (zy + 2 + z*3) + " ";
        }
        s.appendChild(svg("polyline", { points: ptsZ, fill: "none", stroke: color, "stroke-width": 1.5 }));
        s.appendChild(svg("line", { x1: sx-10, x2: sx+10, y1: sy+24, y2: sy+24, stroke: color, "stroke-width": 2 }));
        s.appendChild(svg("text", { x: sx, y: sy + 36, "text-anchor": "middle", "font-size": 10, fill: color }, [document.createTextNode("Feder")]));
      }
      // x label
      s.appendChild(svg("text", {
        x: sx, y: H - 5,
        "text-anchor": "middle", "font-size": 10, fill: "#555"
      }, [document.createTextNode("x=" + fmt(sup.x, 2) + " m")]));
    }
    // Span labels
    xCur = 0;
    for (var sp = 0; sp < spec.spans.length; sp++) {
      var L_s = spec.spans[sp];
      var xMid = margin.left + (xCur + L_s/2) * sc;
      s.appendChild(svg("text", {
        x: xMid, y: yBeam - 12,
        "text-anchor": "middle", "font-size": 11, fill: "#333", "font-weight": "600"
      }, [document.createTextNode("L" + (sp+1) + " = " + L_s.toFixed(2) + " m")]));
      xCur += L_s;
    }
    // Loads
    for (var li = 0; li < spec.loads.length; li++) {
      var ld = spec.loads[li];
      if (ld.kind === 'line') {
        var x1px = margin.left + ld.x1 * sc;
        var x2px = margin.left + ld.x2 * sc;
        var qScale = 0.6; // arrow length scale
        var q1Px = Math.min(30, Math.max(8, Math.abs(ld.q1_disp || ld.q1) * qScale));
        var q2Px = Math.min(30, Math.max(8, Math.abs(ld.q2_disp || ld.q2) * qScale));
        // Polygon area
        s.appendChild(svg("polygon", {
          points: x1px+","+(yBeam-q1Px)+" "+x2px+","+(yBeam-q2Px)+" "+x2px+","+yBeam+" "+x1px+","+yBeam,
          fill: "#0b5fff30", stroke: "#0b5fff", "stroke-width": 0.8
        }));
        // Arrows
        var nArrows = Math.max(3, Math.min(20, Math.round((ld.x2 - ld.x1) * 4 / spec.spans[0])));
        for (var ai = 0; ai <= nArrows; ai++) {
          var f = ai / nArrows;
          var ax = x1px + f * (x2px - x1px);
          var alen = q1Px + f * (q2Px - q1Px);
          s.appendChild(svg("line", { x1: ax, x2: ax, y1: yBeam - alen, y2: yBeam - 2, stroke: "#0b5fff", "stroke-width": 1 }));
          s.appendChild(svg("polygon", { points: ax+","+yBeam+" "+(ax-2)+","+(yBeam-4)+" "+(ax+2)+","+(yBeam-4), fill: "#0b5fff" }));
        }
        // Label
        var lbl = fmt(ld.q1_disp || ld.q1, 1);
        if (Math.abs((ld.q1_disp||ld.q1) - (ld.q2_disp||ld.q2)) > 1e-3) lbl += " / " + fmt(ld.q2_disp || ld.q2, 1);
        lbl += " kN/m";
        s.appendChild(svg("text", { x: (x1px+x2px)/2, y: yBeam - Math.max(q1Px,q2Px) - 5, "text-anchor": "middle", "font-size": 10, fill: "#0b5fff" }, [document.createTextNode(lbl)]));
      } else if (ld.kind === 'point') {
        var xPpx = margin.left + ld.x * sc;
        var arrowLen = Math.min(40, Math.max(15, Math.abs(ld.P_disp || ld.P) * 2));
        s.appendChild(svg("line", { x1: xPpx, x2: xPpx, y1: yBeam - arrowLen, y2: yBeam - 2, stroke: "#d65d2c", "stroke-width": 2 }));
        s.appendChild(svg("polygon", { points: xPpx+","+yBeam+" "+(xPpx-4)+","+(yBeam-7)+" "+(xPpx+4)+","+(yBeam-7), fill: "#d65d2c" }));
        s.appendChild(svg("text", { x: xPpx + 4, y: yBeam - arrowLen + 2, "font-size": 10, fill: "#d65d2c" }, [document.createTextNode(fmt(ld.P_disp || ld.P, 1) + " kN")]));
      } else if (ld.kind === 'moment') {
        var xMpx = margin.left + ld.x * sc;
        // Curved arrow
        var r = 10;
        s.appendChild(svg("path", {
          d: "M " + (xMpx - r) + " " + yBeam + " A " + r + " " + r + " 0 1 1 " + (xMpx + r) + " " + yBeam,
          fill: "none", stroke: "#7a4fbf", "stroke-width": 2
        }));
        s.appendChild(svg("text", { x: xMpx + 12, y: yBeam - 5, "font-size": 10, fill: "#7a4fbf" }, [document.createTextNode(fmt(ld.M_disp || ld.M, 1) + " kNm")]));
      }
    }
    container.appendChild(s);
  }

  /* --- Line diagram (M, V) with shaded fill ---
   * xs: array of x positions (m)
   * ys: array of values
   * opts.unit, opts.label, opts.color, opts.fill (true/false), opts.invertY (true to flip for M)
   */
  function line(container, xs, ys, opts) {
    opts = opts || {};
    container.innerHTML = "";
    var W = container.clientWidth || 700;
    var H = opts.height || 180;
    var margin = { top: 25, right: 30, bottom: 30, left: 55 };
    var pw = W - margin.left - margin.right;
    var ph = H - margin.top - margin.bottom;
    if (!xs.length) return;
    var xMin = xs[0], xMax = xs[xs.length - 1];
    var yMin = Math.min.apply(null, ys);
    var yMax = Math.max.apply(null, ys);
    var yAbs = Math.max(Math.abs(yMin), Math.abs(yMax), 1e-6);
    yMin = -yAbs * 1.15;
    yMax = +yAbs * 1.15;
    function sx(x) { return margin.left + (x - xMin) / (xMax - xMin) * pw; }
    function sy(y) {
      var t = (y - yMin) / (yMax - yMin);
      var yPx = margin.top + (1 - t) * ph;
      return opts.invertY ? (2 * margin.top + ph - yPx) : yPx;
    }
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid meet", width: W, height: H });
    // x-axis (y=0 line)
    var y0 = sy(0);
    s.appendChild(svg("line", { x1: margin.left, x2: margin.left + pw, y1: y0, y2: y0, stroke: "#888", "stroke-width": 1 }));
    // y-axis ticks
    var ticks = [yMin, yMin/2, 0, yMax/2, yMax];
    for (var t = 0; t < ticks.length; t++) {
      var ty = sy(ticks[t]);
      s.appendChild(svg("line", { x1: margin.left - 4, x2: margin.left, y1: ty, y2: ty, stroke: "#888" }));
      s.appendChild(svg("text", { x: margin.left - 6, y: ty + 3, "text-anchor": "end", "font-size": 9, fill: "#666" }, [document.createTextNode(fmt(ticks[t], 1))]));
    }
    // x ticks every 1 m approx
    var xRange = xMax - xMin;
    var dxTick = (xRange < 5) ? 1 : (xRange < 15) ? 2 : 5;
    for (var xt = Math.ceil(xMin); xt <= Math.floor(xMax); xt += dxTick) {
      s.appendChild(svg("line", { x1: sx(xt), x2: sx(xt), y1: margin.top + ph, y2: margin.top + ph + 4, stroke: "#888" }));
      s.appendChild(svg("text", { x: sx(xt), y: margin.top + ph + 14, "text-anchor": "middle", "font-size": 9, fill: "#666" }, [document.createTextNode(xt + "")]));
    }
    // Filled polygon
    if (opts.fill !== false) {
      var pts = "";
      pts += sx(xs[0]) + "," + y0 + " ";
      for (var i = 0; i < xs.length; i++) pts += sx(xs[i]) + "," + sy(ys[i]) + " ";
      pts += sx(xs[xs.length-1]) + "," + y0;
      s.appendChild(svg("polygon", { points: pts, fill: (opts.color || "#0b5fff") + "30", stroke: "none" }));
    }
    // Line curve
    var d = "M ";
    for (var ii = 0; ii < xs.length; ii++) d += sx(xs[ii]) + " " + sy(ys[ii]) + " ";
    s.appendChild(svg("path", { d: d, fill: "none", stroke: opts.color || "#0b5fff", "stroke-width": 1.6 }));
    // Max / min annotations
    var iMax = 0, iMin = 0;
    for (var k = 0; k < ys.length; k++) {
      if (ys[k] > ys[iMax]) iMax = k;
      if (ys[k] < ys[iMin]) iMin = k;
    }
    function annotate(idx, color) {
      var v = ys[idx], xv = xs[idx];
      s.appendChild(svg("circle", { cx: sx(xv), cy: sy(v), r: 3, fill: color }));
      var tx = sx(xv) + 5;
      var ty = sy(v) - 6;
      if (sy(v) < margin.top + 10) ty = sy(v) + 14;
      s.appendChild(svg("text", { x: tx, y: ty, "font-size": 10, "font-weight": "600", fill: color }, [document.createTextNode(fmt(v, 2) + " " + (opts.unit||""))]));
    }
    if (Math.abs(ys[iMax]) > 1e-4) annotate(iMax, "#1f8c4a");
    if (Math.abs(ys[iMin]) > 1e-4) annotate(iMin, "#c43030");
    // Title / label
    if (opts.label) {
      s.appendChild(svg("text", { x: margin.left, y: margin.top - 8, "font-size": 11, "font-weight": "600", fill: "#333" }, [document.createTextNode(opts.label)]));
    }
    container.appendChild(s);
    return s;
  }

  global.Charts = { system: system, line: line, svg: svg, fmt: fmt };
})(typeof window !== "undefined" ? window : globalThis);
