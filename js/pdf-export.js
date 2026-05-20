/* ============================================================
 * pdf-export.js - Generates a verifiable PDF report
 * ============================================================
 * Includes:
 *   - Project info (title, engineer, date)
 *   - System sketch + supports
 *   - Material & section parameters
 *   - Loads list (characteristic + design)
 *   - Diagrams: System, M(x), V(x), w(x)
 *   - Reactions table
 *   - SIA 265 verifications (bending, shear, deflection) with formulas
 *   - Detailed step-by-step calculation trace
 *   - Signature/check fields, software disclaimer
 * ============================================================ */
(function (global) {
  "use strict";

  function svgToPng(svgEl, scale, callback) {
    var ser = new XMLSerializer();
    var svgStr = ser.serializeToString(svgEl);
    var bb = svgEl.viewBox.baseVal;
    var W = (bb && bb.width) ? bb.width : (svgEl.width.baseVal && svgEl.width.baseVal.value) || 700;
    var H = (bb && bb.height) ? bb.height : (svgEl.height.baseVal && svgEl.height.baseVal.value) || 200;
    scale = scale || 2;
    var canvas = document.createElement("canvas");
    canvas.width = W * scale; canvas.height = H * scale;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var img = new Image();
    img.onload = function () {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL("image/png"), W, H);
    };
    img.onerror = function (e) { callback(null, W, H, e); };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
  }

  /**
   * Build a multi-page PDF report and trigger download.
   * @param {object} ctx full computed context from app.js
   */
  function exportPDF(ctx) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "mm", format: "a4" });
    var pageW = 210, pageH = 297, margin = 18;
    var y = margin;

    /* --- Page header --- */
    function header(title) {
      doc.setFontSize(8); doc.setTextColor(120, 120, 120);
      doc.text(ctx.project.name + " - " + ctx.project.position, margin, 10);
      doc.text("Seite " + doc.internal.getNumberOfPages(), pageW - margin, 10, { align: "right" });
      doc.setDrawColor(11, 95, 255); doc.setLineWidth(0.5);
      doc.line(margin, 12, pageW - margin, 12);
      doc.setFontSize(13); doc.setTextColor(20, 30, 50);
      doc.text(title, margin, 18);
      y = 24;
    }
    function newPage(title) {
      doc.addPage();
      header(title);
    }
    function rule() {
      doc.setDrawColor(220, 225, 230); doc.setLineWidth(0.2);
      doc.line(margin, y, pageW - margin, y);
      y += 4;
    }
    function checkY(needed) {
      if (y + needed > pageH - margin - 10) newPage(currentTitle);
    }
    var currentTitle = "Statik-Berechnung";

    function h1(text) {
      checkY(10);
      doc.setFontSize(11); doc.setTextColor(11, 95, 255);
      doc.text(text, margin, y); y += 5;
      rule();
    }
    function txt(text, opts) {
      opts = opts || {};
      doc.setFontSize(opts.size || 9);
      doc.setTextColor(opts.color || 30, opts.color2 || 30, opts.color3 || 30);
      if (opts.bold) doc.setFont(undefined, "bold");
      else doc.setFont(undefined, "normal");
      checkY(4 + (opts.padding || 0));
      var lines = doc.splitTextToSize(text, pageW - 2 * margin);
      for (var i = 0; i < lines.length; i++) {
        checkY(4);
        doc.text(lines[i], opts.x || margin, y);
        y += (opts.lineHeight || 4);
      }
    }
    function formulaTxt(text) {
      doc.setFont("courier", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(40, 40, 40);
      var lines = doc.splitTextToSize(text, pageW - 2 * margin - 4);
      for (var i = 0; i < lines.length; i++) {
        checkY(4);
        doc.text(lines[i], margin + 4, y);
        y += 4;
      }
      doc.setFont(undefined, "normal");
    }
    function table(headers, rows, colW) {
      var x0 = margin;
      doc.setFontSize(9); doc.setFont(undefined, "bold");
      doc.setFillColor(240, 243, 247);
      doc.rect(x0, y, pageW - 2*margin, 6, "F");
      var cx = x0 + 1.5;
      for (var c = 0; c < headers.length; c++) {
        doc.setTextColor(60, 70, 90);
        doc.text(headers[c], cx, y + 4);
        cx += colW[c];
      }
      y += 6;
      doc.setFont(undefined, "normal"); doc.setTextColor(30, 30, 30);
      for (var r = 0; r < rows.length; r++) {
        checkY(5);
        cx = x0 + 1.5;
        var row = rows[r];
        for (var c2 = 0; c2 < row.length; c2++) {
          doc.text(String(row[c2]), cx, y + 4);
          cx += colW[c2];
        }
        doc.setDrawColor(225, 230, 235); doc.line(x0, y + 5, pageW - margin, y + 5);
        y += 5;
      }
      y += 2;
    }

    /* ====================== PAGE 1: COVER ====================== */
    header("Statische Berechnung");

    // Big LANDOLT ENGINEERING brand banner on top
    doc.setFillColor(29, 39, 51);
    doc.rect(margin, y, pageW - 2*margin, 22, "F");
    doc.setFontSize(20); doc.setTextColor(255, 255, 255); doc.setFont(undefined, "bold");
    doc.text("LANDOLT ENGINEERING", pageW/2, y + 10, { align: "center" });
    doc.setFontSize(9); doc.setTextColor(214, 93, 44); doc.setFont(undefined, "normal");
    doc.text("Tragwerksplanung  |  Statische Berechnungen  |  SIA-konform", pageW/2, y + 17, { align: "center" });
    y += 30;

    doc.setFontSize(18); doc.setTextColor(11, 95, 255); doc.setFont(undefined, "bold");
    doc.text("Statik-Bericht", margin, y + 6); y += 12;
    doc.setFontSize(14); doc.setTextColor(30, 30, 50);
    doc.text("Durchlauftraeger - Berechnung nach SIA 265", margin, y); y += 10;
    doc.setFont(undefined, "normal");
    doc.setDrawColor(11, 95, 255); doc.setLineWidth(0.8);
    doc.line(margin, y, pageW - margin, y); y += 6;

    // Project block
    doc.setFontSize(10); doc.setTextColor(80, 80, 80);
    doc.text("Projekt", margin, y); y += 4;
    doc.setFontSize(12); doc.setTextColor(20, 30, 50); doc.setFont(undefined, "bold");
    doc.text(ctx.project.name, margin, y); y += 6;
    doc.setFont(undefined, "normal"); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
    doc.text("Position / Bauteil: " + ctx.project.position, margin, y); y += 5;
    doc.text("Ingenieur/in: " + (ctx.project.engineer || "Fadri Landolt"), margin, y); y += 5;
    doc.text("Datum: " + (ctx.project.date || "-"), margin, y); y += 5;
    doc.text("Berechnet mit: Statik-Tool Landolt Engineering v1.0 (FEM-Solver, Hermite-Element)", margin, y); y += 5;
    doc.setFontSize(9); doc.setTextColor(214, 93, 44); doc.setFont(undefined, "bold");
    doc.text("Erstellt und entwickelt von Fadri Landolt - Landolt Engineering", margin, y); y += 8;
    doc.setFont(undefined, "normal"); doc.setTextColor(60, 60, 60);

    h1("1. System & Belastung (Übersicht)");
    txt("Anzahl Felder: " + ctx.spec.spans.length + "    Gesamtlänge: " + ctx.spec.spans.reduce(function(a,b){return a+b;},0).toFixed(2) + " m");
    txt("Spannweiten: L = [" + ctx.spec.spans.map(function(L){return L.toFixed(2);}).join(", ") + "] m");
    txt("Material: " + ctx.material.name + " (" + ctx.material.type + ")");
    txt("Querschnitt: " + ctx.section.label + "   A = " + (ctx.section.A/100).toFixed(1) + " cm², I_y = " + (ctx.section.I/1e4).toFixed(1) + " cm⁴, W_y = " + (ctx.section.W/1e3).toFixed(1) + " cm³");
    txt("Nutzungsklasse: " + ctx.serviceClass + "   Lastdauer (massgebend): " + ctx.loadDuration);
    txt("k_mod = " + ctx.verification.kmod.toFixed(2) + "   gamma_M = " + ctx.verification.gamma_M.toFixed(2));

    /* ====================== PAGE 2: DIAGRAMS ====================== */
    newPage("System, Schnittgrössen & Biegelinie");

    var diagrams = [
      { id: "diagram-system", title: "Statisches System" },
      { id: "diagram-M",      title: "Biegemomentenverlauf M [kNm]" },
      { id: "diagram-V",      title: "Querkraftverlauf V [kN]" },
      { id: "diagram-w",      title: "Biegelinie w [mm]" }
    ];

    // We need to render diagrams sequentially (async svgToPng), so we use a chain
    var didx = 0;
    function nextDiagram() {
      if (didx >= diagrams.length) {
        afterDiagrams();
        return;
      }
      var d = diagrams[didx];
      var svgEl = document.querySelector("#" + d.id + " svg");
      didx++;
      if (!svgEl) { nextDiagram(); return; }
      svgToPng(svgEl, 2, function (dataUrl, W, H) {
        if (dataUrl) {
          var imgW = pageW - 2 * margin;
          var imgH = imgW * H / W;
          checkY(imgH + 12);
          doc.setFontSize(10); doc.setTextColor(40, 40, 40); doc.setFont(undefined, "bold");
          doc.text(d.title, margin, y); y += 4;
          doc.setFont(undefined, "normal");
          doc.addImage(dataUrl, "PNG", margin, y, imgW, imgH);
          y += imgH + 4;
        }
        nextDiagram();
      });
    }
    nextDiagram();

    function afterDiagrams() {
      /* ====================== PAGE: INPUTS ====================== */
      newPage("Eingaben - Lasten, Material, Querschnitt");

      h1("2. Auflager");
      var supRows = ctx.spec.supports.map(function (s, i) {
        return [ String.fromCharCode(65 + i), s.x.toFixed(2) + " m", s.type, (s.Kv ? s.Kv.toExponential(2) : "-"), (s.Kphi ? s.Kphi.toExponential(2) : "-") ];
      });
      table(["Bez.", "x", "Typ", "K_v [N/m]", "K_phi [Nm/rad]"], supRows, [16, 30, 30, 50, 50]);

      h1("3. Lasten (charakteristisch)");
      var ldRows = ctx.specRaw.loads.map(function (l, i) {
        if (l.kind === "point")
          return [i+1, "Punkt", l.action, fmt2(l.P) + " kN", "-", fmt2(l.x), "-", l.gammaF.toFixed(2), (l.psi || 1).toFixed(2)];
        if (l.kind === "line")
          return [i+1, "Linie", l.action, fmt2(l.q1) + " kN/m", fmt2(l.q2) + " kN/m", fmt2(l.x1), fmt2(l.x2), l.gammaF.toFixed(2), (l.psi || 1).toFixed(2)];
        if (l.kind === "moment")
          return [i+1, "Moment", l.action, fmt2(l.M) + " kNm", "-", fmt2(l.x), "-", l.gammaF.toFixed(2), (l.psi || 1).toFixed(2)];
        return [i+1, "-", "-", "-", "-", "-", "-", "-", "-"];
      });
      table(["#", "Typ", "Wirkung", "Wert 1", "Wert 2", "x1", "x2", "g_F", "psi"], ldRows, [8, 14, 22, 26, 26, 18, 18, 12, 12]);

      h1("4. Material - charakteristische Werte (SIA 265)");
      var m = ctx.material;
      if (ctx.verification.isWood) {
        formulaTxt("f_m,k    = " + (m.fm_k.toFixed(1)) + " N/mm^2     (Biegefestigkeit)");
        formulaTxt("f_v,k    = " + (m.fv_k.toFixed(1)) + " N/mm^2     (Schubfestigkeit)");
        formulaTxt("f_t0,k   = " + (m.ft0_k.toFixed(1)) + " N/mm^2     (Zug parallel zur Faser)");
        formulaTxt("f_c0,k   = " + (m.fc0_k.toFixed(1)) + " N/mm^2     (Druck parallel zur Faser)");
        formulaTxt("E_0,mean = " + (m.E0_mean.toFixed(0)) + " N/mm^2");
        formulaTxt("E_0,05   = " + (m.E0_05.toFixed(0)) + " N/mm^2");
        formulaTxt("G_mean   = " + (m.Gmean.toFixed(0)) + " N/mm^2");
        formulaTxt("rho_k    = " + (m.rho_k.toFixed(0)) + " kg/m^3");
      } else if (ctx.verification.isSteel) {
        formulaTxt("f_y,k = " + (m.fy_k.toFixed(0)) + " N/mm^2");
        formulaTxt("f_u,k = " + (m.fu_k.toFixed(0)) + " N/mm^2");
        formulaTxt("E     = " + (m.E.toFixed(0)) + " N/mm^2");
        formulaTxt("G     = " + (m.G.toFixed(0)) + " N/mm^2");
      }

      h1("5. Querschnitt");
      formulaTxt("A    = " + ctx.section.A.toFixed(1) + " mm^2  (= " + (ctx.section.A/100).toFixed(1) + " cm^2)");
      formulaTxt("I_y  = " + ctx.section.I.toFixed(0) + " mm^4  (= " + (ctx.section.I/1e4).toFixed(1) + " cm^4)");
      formulaTxt("W_y  = " + ctx.section.W.toFixed(0) + " mm^3  (= " + (ctx.section.W/1e3).toFixed(1) + " cm^3)");
      if (ctx.section.Av) formulaTxt("A_v  = " + ctx.section.Av.toFixed(0) + " mm^2  (effektive Schubflaeche)");

      /* ====================== PAGE: RESULTS ====================== */
      newPage("Schnittgrössen & Auflagerreaktionen");

      h1("6. Maximale Schnittgrössen (Bemessungslasten GZT)");
      var V = ctx.verification;
      formulaTxt("M+ max = " + (V.Mmax_pos/1000).toFixed(2) + " kNm  bei x = " + V.Mmax_pos_x.toFixed(2) + " m");
      formulaTxt("M- max = " + (V.Mmax_neg/1000).toFixed(2) + " kNm  bei x = " + V.Mmax_neg_x.toFixed(2) + " m");
      formulaTxt("|V| max = " + (V.Vmax_abs/1000).toFixed(2) + " kN   bei x = " + V.Vmax_x.toFixed(2) + " m");

      h1("7. Auflagerreaktionen");
      var rxRows = ctx.solution.reactions.map(function (r, i) {
        return [String.fromCharCode(65 + i), r.x.toFixed(2) + " m", (r.Rv/1000).toFixed(2) + " kN", (r.Mz/1000).toFixed(2) + " kNm"];
      });
      table(["Bez.", "x", "R_v (auf)", "M (eingespannt)"], rxRows, [18, 28, 40, 40]);

      /* ====================== PAGE: VERIFICATION ====================== */
      newPage("Nachweise nach SIA 265");
      h1("8. Biegenachweis (SIA 265, Art. 4.2)");
      formulaTxt("sigma_m,d = M_d / W_y");
      formulaTxt("          = " + (V.Mmax_abs).toFixed(0) + " Nm * 1000 mm/m / " + V.section.W.toFixed(0) + " mm^3");
      formulaTxt("          = " + V.sigma_m_d.toFixed(2) + " N/mm^2");
      formulaTxt("f_m,d     = k_mod * f_m,k / gamma_M");
      formulaTxt("          = " + V.kmod.toFixed(2) + " * " + V.f_m_k.toFixed(2) + " / " + V.gamma_M.toFixed(2));
      formulaTxt("          = " + V.f_m_d.toFixed(2) + " N/mm^2");
      formulaTxt("eta_m     = sigma_m,d / f_m,d = " + V.bending_eta.toFixed(3));
      doc.setFont(undefined, "bold");
      doc.setTextColor.apply(doc, V.bending_ok ? [30, 140, 74] : [196, 48, 48]);
      txt(V.bending_ok ? "==> Nachweis erfuellt." : "==> Nachweis NICHT erfuellt!", { bold: true });
      doc.setTextColor(30, 30, 30);

      h1("9. Schubnachweis (SIA 265, Art. 4.5)");
      formulaTxt("tau_d  = " + V.tau_formula);
      formulaTxt("       = " + V.tau_d.toFixed(2) + " N/mm^2");
      formulaTxt("f_v,d  = k_mod * f_v,k / gamma_M");
      formulaTxt("       = " + V.kmod.toFixed(2) + " * " + V.f_v_k.toFixed(2) + " / " + V.gamma_M.toFixed(2));
      formulaTxt("       = " + V.f_v_d.toFixed(2) + " N/mm^2");
      formulaTxt("eta_v  = tau_d / f_v,d = " + V.shear_eta.toFixed(3));
      doc.setFont(undefined, "bold");
      doc.setTextColor.apply(doc, V.shear_ok ? [30, 140, 74] : [196, 48, 48]);
      txt(V.shear_ok ? "==> Nachweis erfuellt." : "==> Nachweis NICHT erfuellt!", { bold: true });
      doc.setTextColor(30, 30, 30);

      h1("10. Verformungsnachweis (SIA 260 / SIA 265)");
      formulaTxt("k_def = " + V.kdef.toFixed(2) + "    (Kriechfaktor NKL " + ctx.serviceClass + ")");
      formulaTxt("w_fin = w_inst * (1 + k_def)");
      var defRows = V.deflection.map(function (d) {
        return [d.span, d.L.toFixed(2)+" m", d.w_inst_mm.toFixed(2)+" mm", d.w_fin_mm.toFixed(2)+" mm",
                "L/"+ctx.spec.w_lim_div + " = " + d.w_allow_mm.toFixed(2)+" mm",
                d.ratio.toFixed(3), d.ok ? "OK" : "FAIL"];
      });
      table(["Feld", "L", "w_inst", "w_fin", "w_zul", "eta", "Status"], defRows,
            [10, 22, 24, 24, 36, 16, 18]);

      /* ====================== PAGE: DETAILED TRACE ====================== */
      newPage("Rechnungsweg (Prüfdokumentation)");
      h1("11. Rechnungsweg im Detail");
      var trace = ctx.traceLines || [];
      for (var i = 0; i < trace.length; i++) {
        if (trace[i].kind === "title") {
          checkY(6);
          doc.setFontSize(10); doc.setTextColor(11, 95, 255); doc.setFont(undefined, "bold");
          doc.text(trace[i].text, margin, y); y += 5;
        } else {
          formulaTxt(trace[i].text);
        }
      }

      /* ====================== PAGE: FOOTER / DISCLAIMER ====================== */
      newPage("Prüfung & Hinweise");
      h1("12. Pruefung & Unterschrift");
      txt("Berechnet von:    Fadri Landolt - Landolt Engineering    ____________________________      Datum: __________");
      y += 4;
      txt("Geprueft von:                                            ____________________________      Datum: __________");
      y += 4;
      txt("Visiert / Freigegeben:                                   ____________________________      Datum: __________");
      y += 8;
      h1("13. Hinweise zur Verifikation");
      txt("Die Berechnung wurde mit einem Browser-basierten FEM-Solver (Euler-Bernoulli, Hermite Element) "
        + "durchgefuehrt. Die Resultate sind reproduzierbar und durch Handrechnung pruefbar. "
        + "Die Software verwendet die Steifigkeitsmethode mit folgenden Annahmen:");
      txt("- linear-elastisches Materialverhalten");
      txt("- kleine Verformungen (Theorie I. Ordnung)");
      txt("- starre Querschnitte (Bernoulli-Hypothese), Schubdeformation vernachlaessigt");
      txt("- Auflager als Punktbedingungen (w=0, ggf. phi=0)");
      txt("- charakteristische Werte aus SIA 265:2021 Tab. 1");
      txt("- Bemessungswerte gemaess SIA 265 Art. 4.2 mit k_mod und gamma_M");
      txt("");
      txt("Verifikations-Pruefpunkt (Eigenkontrolle): Fuer einen Einfeldtraeger der Spannweite L = " + ctx.spec.spans[0].toFixed(2) + " m "
        + "mit konstanter Linienlast q ergibt sich:");
      formulaTxt("M_max = q * L^2 / 8");
      formulaTxt("V_max = q * L / 2");
      txt("Diese Werte koennen mit dem in dieser Berechnung gezeigten Verlauf von M(x) und V(x) verglichen werden.");
      y += 6;
      h1("14. Software-Haftung");
      txt("Diese Software ist ein Hilfsmittel zur Tragwerksberechnung. Die Verantwortung fuer die korrekte Eingabe, "
        + "die Wahl des statischen Systems, der Lastansaetze und die Plausibilitaet der Resultate liegt "
        + "ausschliesslich beim Anwender / der Tragwerksplanerin. Vor der baulichen Umsetzung sind die Resultate "
        + "durch fachkundige Personen zu pruefen.");

      // Footer on every page: software disclaimer + author brand
      var totalPages = doc.internal.getNumberOfPages();
      for (var p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setDrawColor(214, 93, 44); doc.setLineWidth(0.4);
        doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
        doc.setFontSize(8); doc.setTextColor(214, 93, 44); doc.setFont(undefined, "bold");
        doc.text("LANDOLT ENGINEERING", margin, pageH - 8);
        doc.setFont(undefined, "normal"); doc.setFontSize(7); doc.setTextColor(120, 120, 120);
        doc.text("Erstellt von Fadri Landolt  -  Statik-Tool v1.0  -  SIA 265:2021  -  Resultate manuell pruefen.", margin + 38, pageH - 8);
        doc.setTextColor(60, 60, 60);
        doc.text(p + " / " + totalPages, pageW - margin, pageH - 8, { align: "right" });
      }

      var fileName = (ctx.project.position || "Statik") + " - " + (ctx.project.name || "Bericht") + ".pdf";
      doc.save(fileName.replace(/[\\/:*?"<>|]/g, "_"));
    }
  }

  function fmt2(v) { if (v == null || !isFinite(v)) return "-"; return Math.abs(v) < 1e-4 ? "0" : v.toFixed(2); }

  global.PDFExport = { exportPDF: exportPDF };
})(typeof window !== "undefined" ? window : globalThis);
