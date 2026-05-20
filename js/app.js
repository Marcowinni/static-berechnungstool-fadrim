/* ============================================================
 * app.js - Main UI controller for Statik-Tool
 * ============================================================
 * Responsibilities:
 *   - Build/maintain dynamic tables (spans, supports, loads)
 *   - Read inputs, build a "raw spec" object
 *   - Run FEM solver via FEM.solve (both for GZT and GZG)
 *   - Run SIA 265 verification
 *   - Render diagrams, results, calc trace
 *   - PDF export and Save/Load JSON
 * ============================================================ */
(function () {
  "use strict";

  /* ---------------- Data state ---------------- */
  var state = {
    spans: [4.0, 4.0],
    supports: [
      { x: 0.0, type: "pinned", Kv: 0, Kphi: 0, settlement: 0 },
      { x: 4.0, type: "pinned", Kv: 0, Kphi: 0, settlement: 0 },
      { x: 8.0, type: "pinned", Kv: 0, Kphi: 0, settlement: 0 }
    ],
    loads: [
      { kind: "line", action: "G", q1: 2.5, q2: 2.5, x1: 0, x2: 8.0, gammaF: 1.35, psi: 1.0 },
      { kind: "line", action: "Q", q1: 4.0, q2: 4.0, x1: 0, x2: 8.0, gammaF: 1.50, psi: 0.3 }
    ],
    nElemPerSpan: 30,
    project: { name: "Beispielprojekt", position: "Position B1", engineer: "Fadri Landolt", date: new Date().toISOString().slice(0,10) },
    material: { name: "C24" },
    serviceClass: "1",
    loadDuration: "medium",
    gamma_M: 1.7,
    gamma_G: 1.35,
    gamma_Q: 1.50,
    w_lim_div: 300,
    section: { shape: "rect", b: 120, h: 240, d: 200, A: null, I: null, W: null, profile: "" }
  };

  /* ---------------- Helpers ---------------- */
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }
  function ce(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------------- Build spans table ---------------- */
  function renderSpansTable() {
    var tbody = $("#tbl-spans tbody");
    tbody.innerHTML = "";
    for (var i = 0; i < state.spans.length; i++) {
      var tr = ce("tr");
      tr.appendChild(ce("td", null, "L" + (i + 1)));
      var td = ce("td");
      var input = ce("input", { type: "number", step: "0.05", min: "0.1", value: state.spans[i] });
      input.dataset.idx = i;
      input.addEventListener("input", function (e) {
        var idx = +e.target.dataset.idx;
        state.spans[idx] = parseFloat(e.target.value) || 0;
        recomputeSupportPositions();
      });
      td.appendChild(input);
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  function recomputeSupportPositions() {
    var x = 0;
    for (var i = 0; i < state.supports.length; i++) {
      state.supports[i].x = x;
      if (i < state.spans.length) x += state.spans[i];
    }
    renderSupportsTable();
    renderSystemDiagram();
  }

  /* ---------------- Build supports table ---------------- */
  function renderSupportsTable() {
    var tbody = $("#tbl-supports tbody");
    tbody.innerHTML = "";
    for (var i = 0; i < state.supports.length; i++) {
      var sup = state.supports[i];
      var tr = ce("tr");
      tr.appendChild(ce("td", null, String.fromCharCode(65 + i)));
      // x
      var tdX = ce("td");
      var inputX = ce("input", { type: "number", step: "0.05", value: sup.x.toFixed(3) });
      inputX.dataset.idx = i;
      inputX.addEventListener("input", function (e) { state.supports[+e.target.dataset.idx].x = parseFloat(e.target.value) || 0; renderSystemDiagram(); });
      tdX.appendChild(inputX);
      tr.appendChild(tdX);
      // type
      var tdT = ce("td");
      var sel = ce("select");
      ["fixed", "pinned", "roller", "spring", "free"].forEach(function (t) {
        var o = ce("option", { value: t }, ({fixed:"Fest", pinned:"Gelenkig", roller:"Rollen", spring:"Feder", free:"Frei"})[t]);
        if (t === sup.type) o.selected = true;
        sel.appendChild(o);
      });
      sel.dataset.idx = i;
      sel.addEventListener("change", function (e) { state.supports[+e.target.dataset.idx].type = e.target.value; renderSystemDiagram(); });
      tdT.appendChild(sel);
      tr.appendChild(tdT);
      // Kv (kN/m)
      var tdKv = ce("td");
      var inputKv = ce("input", { type: "number", step: "100", value: sup.Kv / 1000 || 0, placeholder: "0" });
      inputKv.dataset.idx = i;
      inputKv.addEventListener("input", function (e) { state.supports[+e.target.dataset.idx].Kv = (parseFloat(e.target.value) || 0) * 1000; });
      tdKv.appendChild(inputKv);
      tr.appendChild(tdKv);
      // Kphi (kNm/rad)
      var tdKp = ce("td");
      var inputKp = ce("input", { type: "number", step: "100", value: sup.Kphi / 1000 || 0, placeholder: "0" });
      inputKp.dataset.idx = i;
      inputKp.addEventListener("input", function (e) { state.supports[+e.target.dataset.idx].Kphi = (parseFloat(e.target.value) || 0) * 1000; });
      tdKp.appendChild(inputKp);
      tr.appendChild(tdKp);
      // settlement (mm)
      var tdS = ce("td");
      var inputS = ce("input", { type: "number", step: "0.5", value: sup.settlement * 1000 || 0, placeholder: "0" });
      inputS.dataset.idx = i;
      inputS.addEventListener("input", function (e) { state.supports[+e.target.dataset.idx].settlement = (parseFloat(e.target.value) || 0) / 1000; });
      tdS.appendChild(inputS);
      tr.appendChild(tdS);
      tbody.appendChild(tr);
    }
  }

  /* ---------------- Build loads table ---------------- */
  function renderLoadsTable() {
    var tbody = $("#tbl-loads tbody");
    tbody.innerHTML = "";
    for (var i = 0; i < state.loads.length; i++) {
      var ld = state.loads[i];
      var tr = ce("tr");
      tr.appendChild(ce("td", null, String(i + 1)));
      // Type label
      tr.appendChild(ce("td", null, ({line:"Linie", point:"Punkt", moment:"Moment"})[ld.kind]));
      // Action (G/Q/W/S)
      var tdA = ce("td");
      var selA = ce("select");
      ["G","Q","W","S","A"].forEach(function (a) {
        var o = ce("option", { value: a }, a);
        if (a === ld.action) o.selected = true;
        selA.appendChild(o);
      });
      selA.dataset.idx = i;
      selA.addEventListener("change", function (e) {
        var idx = +e.target.dataset.idx;
        state.loads[idx].action = e.target.value;
        if (e.target.value === "G") { state.loads[idx].gammaF = state.gamma_G; state.loads[idx].psi = 1.0; }
        else if (e.target.value === "Q") { state.loads[idx].gammaF = state.gamma_Q; state.loads[idx].psi = 0.3; }
        else if (e.target.value === "W" || e.target.value === "S") { state.loads[idx].gammaF = state.gamma_Q; state.loads[idx].psi = 0.0; }
        renderLoadsTable(); renderSystemDiagram();
      });
      tdA.appendChild(selA);
      tr.appendChild(tdA);
      // Value 1
      var tdV1 = ce("td");
      var inV1 = ce("input", { type: "number", step: "0.1" });
      inV1.dataset.idx = i; inV1.dataset.field = "v1";
      if (ld.kind === "line") inV1.value = ld.q1;
      else if (ld.kind === "point") inV1.value = ld.P;
      else if (ld.kind === "moment") inV1.value = ld.M;
      inV1.addEventListener("input", onLoadFieldChange);
      tdV1.appendChild(inV1);
      tr.appendChild(tdV1);
      // Value 2 (q2 for line)
      var tdV2 = ce("td");
      if (ld.kind === "line") {
        var inV2 = ce("input", { type: "number", step: "0.1", value: ld.q2 });
        inV2.dataset.idx = i; inV2.dataset.field = "v2";
        inV2.addEventListener("input", onLoadFieldChange);
        tdV2.appendChild(inV2);
      } else { tdV2.textContent = "-"; }
      tr.appendChild(tdV2);
      // x1 / x
      var tdX1 = ce("td");
      var inX1 = ce("input", { type: "number", step: "0.05" });
      inX1.dataset.idx = i; inX1.dataset.field = "x1";
      if (ld.kind === "line") inX1.value = ld.x1;
      else inX1.value = ld.x;
      inX1.addEventListener("input", onLoadFieldChange);
      tdX1.appendChild(inX1);
      tr.appendChild(tdX1);
      // x2
      var tdX2 = ce("td");
      if (ld.kind === "line") {
        var inX2 = ce("input", { type: "number", step: "0.05", value: ld.x2 });
        inX2.dataset.idx = i; inX2.dataset.field = "x2";
        inX2.addEventListener("input", onLoadFieldChange);
        tdX2.appendChild(inX2);
      } else { tdX2.textContent = "-"; }
      tr.appendChild(tdX2);
      // gammaF
      var tdG = ce("td");
      var inG = ce("input", { type: "number", step: "0.05", value: ld.gammaF.toFixed(2) });
      inG.dataset.idx = i; inG.dataset.field = "gammaF";
      inG.addEventListener("input", onLoadFieldChange);
      tdG.appendChild(inG);
      tr.appendChild(tdG);
      // psi
      var tdP = ce("td");
      var inP = ce("input", { type: "number", step: "0.05", value: ld.psi.toFixed(2) });
      inP.dataset.idx = i; inP.dataset.field = "psi";
      inP.addEventListener("input", onLoadFieldChange);
      tdP.appendChild(inP);
      tr.appendChild(tdP);
      // Delete button
      var tdD = ce("td");
      var btnDel = ce("button", { type: "button", class: "row-del" }, "X");
      btnDel.dataset.idx = i;
      btnDel.addEventListener("click", function (e) {
        state.loads.splice(+e.target.dataset.idx, 1);
        renderLoadsTable(); renderSystemDiagram();
      });
      tdD.appendChild(btnDel);
      tr.appendChild(tdD);

      tbody.appendChild(tr);
    }
  }
  function onLoadFieldChange(e) {
    var idx = +e.target.dataset.idx;
    var field = e.target.dataset.field;
    var v = parseFloat(e.target.value) || 0;
    var ld = state.loads[idx];
    if (field === "v1") {
      if (ld.kind === "line") ld.q1 = v;
      else if (ld.kind === "point") ld.P = v;
      else if (ld.kind === "moment") ld.M = v;
    } else if (field === "v2") {
      ld.q2 = v;
    } else if (field === "x1") {
      if (ld.kind === "line") ld.x1 = v;
      else ld.x = v;
    } else if (field === "x2") {
      ld.x2 = v;
    } else if (field === "gammaF") ld.gammaF = v;
    else if (field === "psi") ld.psi = v;
    renderSystemDiagram();
  }

  /* ---------------- System diagram ---------------- */
  function renderSystemDiagram() {
    // Decorate loads with display values (characteristic)
    var displayLoads = state.loads.map(function (ld) {
      var o = Object.assign({}, ld);
      if (o.kind === "line") { o.q1_disp = ld.q1; o.q2_disp = ld.q2; }
      else if (o.kind === "point") { o.P_disp = ld.P; }
      else if (o.kind === "moment") { o.M_disp = ld.M; }
      return o;
    });
    Charts.system($("#diagram-system"), {
      spans: state.spans,
      supports: state.supports,
      loads: displayLoads
    });
  }

  /* ---------------- Section properties ---------------- */
  function computeSection() {
    var shape = $("#sec-shape").value;
    var sec;
    state.section.shape = shape;
    if (shape === "rect") {
      var b = parseFloat($("#sec-b").value) || 0;
      var h = parseFloat($("#sec-h").value) || 0;
      state.section.b = b; state.section.h = h;
      sec = Sections.rect(b, h);
    } else if (shape === "circle") {
      var d = parseFloat($("#sec-d").value) || 0;
      state.section.d = d;
      sec = Sections.circle(d);
    } else if (shape === "IPE" || shape === "HEA" || shape === "HEB") {
      var profile = ($("#sec-profile").value || "").trim();
      if (!profile) profile = (shape === "IPE") ? "IPE 240" : (shape === "HEA") ? "HEA 200" : "HEB 200";
      var p = Sections.profile(shape, profile);
      if (!p) {
        // Try matching capitalized
        var candidate = profile.toUpperCase().replace(/\s+/g, " ");
        p = Sections.profile(shape, candidate);
      }
      if (!p) { sec = Sections.rect(0, 0); sec.label = "Profil unbekannt"; }
      else sec = p;
      state.section.profile = profile;
    } else { // custom
      var A = parseFloat($("#sec-A").value) || 0;
      var Iy = parseFloat($("#sec-I").value) || 0;
      var Wy = parseFloat($("#sec-W").value) || 0;
      sec = Sections.custom(A * 100, Iy * 1e4, Wy * 1e3, parseFloat($("#sec-h").value) || 0);
      state.section.A = A; state.section.I = Iy; state.section.W = Wy;
    }
    // Reflect in custom fields when not custom
    if (shape !== "custom") {
      $("#sec-A").value = (sec.A / 100).toFixed(2);
      $("#sec-I").value = (sec.I / 1e4).toFixed(2);
      $("#sec-W").value = (sec.W / 1e3).toFixed(2);
    }
    var disp = "A = " + (sec.A/100).toFixed(2) + " cm^2   I_y = " + (sec.I/1e4).toFixed(2) + " cm^4   W_y = " + (sec.W/1e3).toFixed(2) + " cm^3";
    $("#section-display").textContent = disp;
    return sec;
  }

  function updateMaterialDisplay() {
    var name = $("#mat-class").value;
    state.material.name = name;
    state.serviceClass = $("#mat-sc").value;
    state.loadDuration = $("#mat-ld").value;
    state.gamma_M = parseFloat($("#mat-gm").value) || 1.7;
    try {
      var m = Materials.get(name);
      var isWood = (m.type === "VH" || m.type === "BSH");
      var kmod = isWood ? Materials.kmod(state.serviceClass, state.loadDuration) : 1.0;
      var kdef = isWood ? Materials.kdef(m.type, state.serviceClass) : 0;
      var disp;
      if (isWood) {
        disp = m.name + " (" + m.type + ")  f_m,k=" + m.fm_k + " f_v,k=" + m.fv_k + " E0,mean=" + m.E0_mean
             + " | k_mod=" + kmod.toFixed(2) + " gamma_M=" + state.gamma_M.toFixed(2) + " k_def=" + kdef.toFixed(2);
      } else {
        disp = m.name + " (Stahl)  f_y,k=" + m.fy_k + " E=" + m.E + " | gamma_M=" + state.gamma_M.toFixed(2);
      }
      $("#material-display").textContent = disp;
    } catch (e) {
      $("#material-display").textContent = "Material nicht erkannt";
    }
  }

  /* ---------------- CALCULATION ---------------- */
  var lastResult = null;
  function calculate() {
    try {
      // Read project
      state.project.name = $("#prj-name").value;
      state.project.position = $("#prj-pos").value;
      state.project.engineer = $("#prj-eng").value;
      state.project.date = $("#prj-date").value;
      state.nElemPerSpan = parseInt($("#elem-per-span").value, 10) || 30;
      state.gamma_G = parseFloat($("#gam-G").value) || 1.35;
      state.gamma_Q = parseFloat($("#gam-Q").value) || 1.50;
      state.w_lim_div = parseInt($("#w-lim-net").value, 10) || 300;

      updateMaterialDisplay();
      var section = computeSection();
      var material = Materials.get(state.material.name);
      var isWood = (material.type === "VH" || material.type === "BSH");

      // EI in SI: E [N/mm^2 = MPa] * I [mm^4] -> N*mm^2 -> convert to N*m^2 (divide by 1e6)
      // Actually: E in N/mm^2 = N/mm^2, I in mm^4 -> EI in N*mm^2. To get N*m^2: divide by 1e6.
      var E = isWood ? material.E0_mean : material.E;     // N/mm^2
      var EI = E * section.I / 1e6;   // N*m^2

      // Load combinations
      // GZT: gamma * F_k (using each load's gammaF)
      // GZG quasi-permanent: psi * F_k (using each load's psi)
      var loadsGZT = state.loads.map(function (ld) {
        var copy = Object.assign({}, ld);
        copy.gammaF_actual = ld.gammaF;
        if (ld.kind === "line") {
          copy.q1 = ld.q1 * ld.gammaF * 1000;  // kN/m -> N/m
          copy.q2 = ld.q2 * ld.gammaF * 1000;
          copy.q1_k = ld.q1; copy.q2_k = ld.q2;
        }
        if (ld.kind === "point") {
          copy.P = ld.P * ld.gammaF * 1000;    // kN -> N
          copy.P_k = ld.P;
        }
        if (ld.kind === "moment") {
          copy.M = ld.M * ld.gammaF * 1000;
          copy.M_k = ld.M;
        }
        return copy;
      });
      var loadsGZG = state.loads.map(function (ld) {
        var copy = Object.assign({}, ld);
        var psi = (ld.action === "G") ? 1.0 : (ld.psi || 0);
        copy.psi_actual = psi;
        if (ld.kind === "line") { copy.q1 = ld.q1 * psi * 1000; copy.q2 = ld.q2 * psi * 1000; }
        if (ld.kind === "point") { copy.P = ld.P * psi * 1000; }
        if (ld.kind === "moment") { copy.M = ld.M * psi * 1000; }
        return copy;
      });

      // Build supports for FEM (Kv, Kphi in N/m and Nm/rad)
      var supportsFEM = state.supports.map(function (s) {
        return { x: s.x, type: s.type, Kv: s.Kv, Kphi: s.Kphi, settlement: s.settlement };
      });

      // Solve GZT
      var specGZT = {
        spans: state.spans,
        supports: supportsFEM,
        loads: loadsGZT,
        nElemPerSpan: state.nElemPerSpan,
        EI: EI
      };
      var solGZT = FEM.solve(specGZT);

      // Solve GZG
      var specGZG = {
        spans: state.spans,
        supports: supportsFEM,
        loads: loadsGZG,
        nElemPerSpan: state.nElemPerSpan,
        EI: EI
      };
      var solGZG = FEM.solve(specGZG);

      // SIA 265 verification
      var verification = SIA265.verify({
        solution: solGZT,
        solution_gzg: solGZG,
        material: material,
        section: section,
        serviceClass: state.serviceClass,
        loadDuration: state.loadDuration,
        gamma_M: state.gamma_M,
        spans: state.spans,
        w_lim_div: state.w_lim_div
      });

      // Render diagrams
      renderResults(solGZT, solGZG, verification);

      // Build trace
      var traceLines = buildCalcTrace(state, material, section, EI, solGZT, solGZG, verification, loadsGZT);
      renderTrace(traceLines);

      lastResult = {
        spec: { spans: state.spans, supports: state.supports, w_lim_div: state.w_lim_div },
        specRaw: { loads: state.loads, ...state },
        project: state.project,
        material: material,
        section: section,
        EI: EI,
        solution: solGZT,
        solutionGZG: solGZG,
        verification: verification,
        traceLines: traceLines,
        serviceClass: state.serviceClass,
        loadDuration: state.loadDuration
      };
    } catch (err) {
      $("#summary").innerHTML = '<div style="color:#c43030;font-weight:600">Fehler: ' + err.message + "</div>";
      console.error(err);
    }
  }

  /* ---------------- Render results ---------------- */
  function renderResults(solGZT, solGZG, V) {
    // Summary
    var html = "";
    html += '<div class="metric"><div class="label">M+ max</div><div class="value">' + (V.Mmax_pos/1000).toFixed(2) + '<span class="unit"> kNm</span></div></div>';
    html += '<div class="metric"><div class="label">M- max</div><div class="value">' + (V.Mmax_neg/1000).toFixed(2) + '<span class="unit"> kNm</span></div></div>';
    html += '<div class="metric"><div class="label">|V| max</div><div class="value">' + (Math.abs(V.Vmax_abs)/1000).toFixed(2) + '<span class="unit"> kN</span></div></div>';
    var wmax = 0;
    for (var i = 0; i < V.deflection.length; i++) if (Math.abs(V.deflection[i].w_inst_mm) > Math.abs(wmax)) wmax = V.deflection[i].w_inst_mm;
    var wfin = wmax * (1 + V.kdef);
    html += '<div class="metric"><div class="label">w (inst.)</div><div class="value">' + Math.abs(wmax).toFixed(2) + '<span class="unit"> mm</span></div></div>';
    html += '<div class="metric"><div class="label">w (final)</div><div class="value">' + Math.abs(wfin).toFixed(2) + '<span class="unit"> mm</span></div></div>';
    html += '<div class="metric"><div class="label">eta Biegung</div><div class="value">' + V.bending_eta.toFixed(3) + '<span class="unit"> -</span></div></div>';
    html += '<div class="metric"><div class="label">eta Schub</div><div class="value">' + V.shear_eta.toFixed(3) + '<span class="unit"> -</span></div></div>';
    $("#summary").innerHTML = html;

    // M diagram (sample in N*m -> kN*m)
    var Mvals = solGZT.sample.M.map(function (m) { return m / 1000; });
    Charts.line($("#diagram-M"), solGZT.sample.x, Mvals, { unit: "kNm", color: "#0b5fff", invertY: true, label: "M [kNm]" });

    // V diagram
    var Vvals = solGZT.sample.V.map(function (v) { return v / 1000; });
    Charts.line($("#diagram-V"), solGZT.sample.x, Vvals, { unit: "kN", color: "#d65d2c", label: "V [kN]" });

    // w diagram (m -> mm), use GZG
    var Wvals = solGZG.sample.w.map(function (w) { return w * 1000 * (1 + V.kdef); });  // final deflection
    Charts.line($("#diagram-w"), solGZG.sample.x, Wvals, { unit: "mm", color: "#7a4fbf", label: "w [mm] (Endverformung)" });

    // Reactions table
    var tbody = $("#tbl-reactions tbody");
    tbody.innerHTML = "";
    for (var ri = 0; ri < solGZT.reactions.length; ri++) {
      var r = solGZT.reactions[ri];
      var tr = ce("tr");
      tr.appendChild(ce("td", null, String.fromCharCode(65 + ri) + " (x=" + r.x.toFixed(2) + " m)"));
      tr.appendChild(ce("td", null, (r.Rv / 1000).toFixed(2)));
      tr.appendChild(ce("td", null, (r.Mz / 1000).toFixed(2)));
      tbody.appendChild(tr);
    }

    // Verification block
    var vHtml = "";
    vHtml += verifyBlock("Biegenachweis (SIA 265 Art. 4.2)",
      "sigma_m,d = M_d / W_y = " + V.sigma_m_d.toFixed(2) + " N/mm^2\n" +
      "f_m,d     = k_mod * f_m,k / gamma_M = " + V.kmod.toFixed(2) + " * " + V.f_m_k.toFixed(2) + " / " + V.gamma_M.toFixed(2) + " = " + V.f_m_d.toFixed(2) + " N/mm^2\n" +
      "eta_m     = sigma_m,d / f_m,d = " + V.bending_eta.toFixed(3),
      V.bending_eta, V.bending_ok);
    vHtml += verifyBlock("Schubnachweis (SIA 265 Art. 4.5)",
      "tau_d  = " + V.tau_formula + " = " + V.tau_d.toFixed(2) + " N/mm^2\n" +
      "f_v,d  = k_mod * f_v,k / gamma_M = " + V.kmod.toFixed(2) + " * " + V.f_v_k.toFixed(2) + " / " + V.gamma_M.toFixed(2) + " = " + V.f_v_d.toFixed(2) + " N/mm^2\n" +
      "eta_v  = tau_d / f_v,d = " + V.shear_eta.toFixed(3),
      V.shear_eta, V.shear_ok);
    // Deflection
    var defText = "";
    for (var d = 0; d < V.deflection.length; d++) {
      var dd = V.deflection[d];
      defText += "Feld " + dd.span + " (L = " + dd.L.toFixed(2) + " m):  w_inst = " + dd.w_inst_mm.toFixed(2)
              + " mm  w_fin = " + dd.w_fin_mm.toFixed(2) + " mm  w_zul = L/" + state.w_lim_div + " = "
              + dd.w_allow_mm.toFixed(2) + " mm  eta = " + dd.ratio.toFixed(3) + "  " + (dd.ok ? "OK" : "FAIL") + "\n";
    }
    vHtml += verifyBlock("Verformungsnachweis (SIA 260, SIA 265 Art. 4.6)", defText, 0, V.deflection_ok);
    $("#verification-result").innerHTML = vHtml;
  }

  function verifyBlock(title, formulaText, eta, ok) {
    var cls = ok ? "ok" : "err";
    var statusTxt = ok ? "OK" : "NICHT ERFUELLT";
    return '<div class="verify-block ' + cls + '">'
         + '<div class="title">' + title + ' <span class="status ' + cls + '">' + statusTxt + '</span></div>'
         + '<pre class="formula">' + formulaText + '</pre>'
         + '</div>';
  }

  /* ---------------- Trace builder ---------------- */
  function buildCalcTrace(s, mat, sec, EI, solGZT, solGZG, V, loadsGZT) {
    var lines = [];
    function title(t) { lines.push({ kind: "title", text: t }); }
    function add(t) { lines.push({ kind: "line", text: t }); }

    title("Schritt 1 - System & Diskretisierung");
    add("Anzahl Felder: " + s.spans.length);
    add("Spannweiten L_i: " + s.spans.map(function(L){return L.toFixed(2);}).join(", ") + " m");
    add("Gesamtlaenge L_tot: " + s.spans.reduce(function(a,b){return a+b;},0).toFixed(2) + " m");
    add("FEM-Elemente pro Feld: " + s.nElemPerSpan + " (Hermite, Euler-Bernoulli)");
    add("Anzahl Knoten total: " + solGZT.nodeXs.length + ", DOFs total: " + (2 * solGZT.nodeXs.length));

    title("Schritt 2 - Materialwerte (SIA 265 Tab. 1)");
    add("Bezeichnung: " + mat.name);
    if (V.isWood) {
      add("f_m,k = " + mat.fm_k.toFixed(2) + " N/mm^2");
      add("f_v,k = " + mat.fv_k.toFixed(2) + " N/mm^2");
      add("E_0,mean = " + mat.E0_mean.toFixed(0) + " N/mm^2");
      add("rho_k = " + mat.rho_k.toFixed(0) + " kg/m^3");
      add("k_mod (NKL " + s.serviceClass + ", " + s.loadDuration + ") = " + V.kmod.toFixed(2));
      add("k_def (NKL " + s.serviceClass + ") = " + V.kdef.toFixed(2));
    } else {
      add("f_y,k = " + mat.fy_k.toFixed(0) + " N/mm^2");
      add("E = " + mat.E + " N/mm^2");
    }
    add("gamma_M = " + V.gamma_M.toFixed(2));

    title("Schritt 3 - Querschnittswerte");
    add("Querschnitt: " + sec.label);
    add("A   = " + sec.A.toFixed(1) + " mm^2 (" + (sec.A/100).toFixed(2) + " cm^2)");
    add("I_y = " + sec.I.toFixed(0) + " mm^4 (" + (sec.I/1e4).toFixed(2) + " cm^4)");
    add("W_y = " + sec.W.toFixed(0) + " mm^3 (" + (sec.W/1e3).toFixed(2) + " cm^3)");
    if (sec.type === "rect")  add("Pruefen: I_y = b*h^3/12 = " + sec.b + " * " + sec.h + "^3 / 12 = " + (sec.b * Math.pow(sec.h, 3) / 12).toFixed(0) + " mm^4");
    if (sec.type === "rect")  add("Pruefen: W_y = b*h^2/6  = " + sec.b + " * " + sec.h + "^2 /  6 = " + (sec.b * Math.pow(sec.h, 2) / 6).toFixed(0) + " mm^3");
    add("EI  = E * I_y = " + (V.isWood ? mat.E0_mean : mat.E) + " * " + sec.I.toFixed(0) + " = " + (EI*1e6).toFixed(0) + " N*mm^2 = " + EI.toFixed(0) + " N*m^2");

    title("Schritt 4 - Bemessungslasten (GZT)");
    for (var i = 0; i < s.loads.length; i++) {
      var ld = s.loads[i];
      if (ld.kind === "line") {
        add("Last #" + (i+1) + " (Linie, " + ld.action + "): q_k = " + ld.q1.toFixed(2) + " bis " + ld.q2.toFixed(2)
            + " kN/m, x ∈ [" + ld.x1.toFixed(2) + ", " + ld.x2.toFixed(2) + "]");
        add("   gamma_F = " + ld.gammaF.toFixed(2) + " => q_d = " + (ld.q1 * ld.gammaF).toFixed(2) + " bis " + (ld.q2 * ld.gammaF).toFixed(2) + " kN/m");
      } else if (ld.kind === "point") {
        add("Last #" + (i+1) + " (Punkt, " + ld.action + "): P_k = " + ld.P.toFixed(2) + " kN bei x = " + ld.x.toFixed(2) + " m");
        add("   gamma_F = " + ld.gammaF.toFixed(2) + " => P_d = " + (ld.P * ld.gammaF).toFixed(2) + " kN");
      } else if (ld.kind === "moment") {
        add("Last #" + (i+1) + " (Moment, " + ld.action + "): M_k = " + ld.M.toFixed(2) + " kNm bei x = " + ld.x.toFixed(2) + " m");
        add("   gamma_F = " + ld.gammaF.toFixed(2) + " => M_d = " + (ld.M * ld.gammaF).toFixed(2) + " kNm");
      }
    }

    title("Schritt 5 - FEM Steifigkeitsmatrix (Hermite-Element)");
    add("Elementsteifigkeit fuer ein Balkenelement der Laenge L_e:");
    add("k_e = (EI/L_e^3) * | 12   6L_e  -12   6L_e |");
    add("                   |  6L_e 4L^2 -6L_e 2L^2|");
    add("                   | -12  -6L_e  12  -6L_e |");
    add("                   |  6L_e 2L^2 -6L_e 4L^2|");
    add("DOF-Reihenfolge pro Element: [w_i, theta_i, w_j, theta_j]");
    add("Globalmatrix K wird durch Superposition aller k_e mit Knotenmapping aufgebaut.");

    title("Schritt 6 - Auflager / Randbedingungen");
    for (var si = 0; si < s.supports.length; si++) {
      var sup = s.supports[si];
      var line = "Auflager " + String.fromCharCode(65 + si) + " (x=" + sup.x.toFixed(2) + " m): " + sup.type;
      if (sup.Kv) line += "  K_v=" + sup.Kv.toExponential(2) + " N/m";
      if (sup.Kphi) line += "  K_phi=" + sup.Kphi.toExponential(2) + " Nm/rad";
      if (sup.settlement) line += "  Senkung=" + (sup.settlement * 1000).toFixed(2) + " mm";
      add(line);
    }
    add("Loesung des linearen Gleichungssystems K * u = F (Gauss-Elimination mit Pivotierung).");

    title("Schritt 7 - Auflagerreaktionen");
    for (var ri = 0; ri < solGZT.reactions.length; ri++) {
      var r = solGZT.reactions[ri];
      var t = "R" + String.fromCharCode(65 + ri) + " (x=" + r.x.toFixed(2) + " m): R_v = " + (r.Rv / 1000).toFixed(2) + " kN";
      if (Math.abs(r.Mz) > 1e-3) t += "  M = " + (r.Mz / 1000).toFixed(2) + " kNm";
      add(t);
    }
    // Sum check
    var sumR = solGZT.reactions.reduce(function (a, r) { return a + r.Rv; }, 0);
    var sumLoad = 0;
    for (var lk = 0; lk < s.loads.length; lk++) {
      var ld2 = s.loads[lk];
      if (ld2.kind === "line") sumLoad += 0.5 * (ld2.q1 + ld2.q2) * (ld2.x2 - ld2.x1) * ld2.gammaF * 1000;
      else if (ld2.kind === "point") sumLoad += ld2.P * ld2.gammaF * 1000;
    }
    add("Gleichgewichts-Pruefung: Sum R_v = " + (sumR/1000).toFixed(2) + " kN, Sum Lasten = " + (sumLoad/1000).toFixed(2) + " kN");
    add("                        Diff = " + ((sumR - sumLoad)/1000).toExponential(2) + " kN (sollte ~ 0)");

    title("Schritt 8 - Schnittgroessen (Maxima)");
    add("M_max (positiv, Feldmoment) = " + (V.Mmax_pos/1000).toFixed(2) + " kNm  bei x = " + V.Mmax_pos_x.toFixed(2) + " m");
    add("M_max (negativ, Stuetzmoment) = " + (V.Mmax_neg/1000).toFixed(2) + " kNm  bei x = " + V.Mmax_neg_x.toFixed(2) + " m");
    add("|V|_max = " + (Math.abs(V.Vmax_abs)/1000).toFixed(2) + " kN  bei x = " + V.Vmax_x.toFixed(2) + " m");

    title("Schritt 9 - Biegenachweis (SIA 265 Art. 4.2)");
    add("Massgeb. Bemessungsmoment: M_d = " + (V.Mmax_abs/1000).toFixed(2) + " kNm = " + V.Mmax_abs.toFixed(0) + " Nm");
    add("Spannung: sigma_m,d = M_d * 1000 / W_y");
    add("                   = " + V.Mmax_abs.toFixed(0) + " * 1000 / " + sec.W.toFixed(0) + " mm^3");
    add("                   = " + V.sigma_m_d.toFixed(2) + " N/mm^2");
    add("Bemessungswert:    f_m,d = k_mod * f_m,k / gamma_M");
    add("                         = " + V.kmod.toFixed(2) + " * " + V.f_m_k.toFixed(2) + " / " + V.gamma_M.toFixed(2));
    add("                         = " + V.f_m_d.toFixed(2) + " N/mm^2");
    add("Ausnutzung:        eta_m = sigma_m,d / f_m,d = " + V.bending_eta.toFixed(4));
    add(V.bending_ok ? "==> Nachweis erfuellt (eta < 1.0)" : "==> ACHTUNG: Nachweis NICHT erfuellt (eta > 1.0)!");

    title("Schritt 10 - Schubnachweis (SIA 265 Art. 4.5)");
    add("Massgeb. Querkraft: V_d = " + (Math.abs(V.Vmax_abs)/1000).toFixed(2) + " kN = " + Math.abs(V.Vmax_abs).toFixed(0) + " N");
    add("Schubspannung:      tau_d = " + V.tau_formula + " = " + V.tau_d.toFixed(2) + " N/mm^2");
    if (sec.type === "rect") add("                    = 1.5 * " + Math.abs(V.Vmax_abs).toFixed(0) + " / " + sec.A.toFixed(0) + " = " + V.tau_d.toFixed(2) + " N/mm^2");
    add("Bemessungswert:     f_v,d = k_mod * f_v,k / gamma_M");
    add("                          = " + V.kmod.toFixed(2) + " * " + V.f_v_k.toFixed(2) + " / " + V.gamma_M.toFixed(2));
    add("                          = " + V.f_v_d.toFixed(2) + " N/mm^2");
    add("Ausnutzung:         eta_v = tau_d / f_v,d = " + V.shear_eta.toFixed(4));
    add(V.shear_ok ? "==> Nachweis erfuellt (eta < 1.0)" : "==> ACHTUNG: Nachweis NICHT erfuellt!");

    title("Schritt 11 - Verformungsnachweis (SIA 260)");
    add("k_def = " + V.kdef.toFixed(2) + " (Kriechfaktor)");
    add("w_fin = w_inst * (1 + k_def)");
    add("Grenzwert: w_zul = L / " + s.w_lim_div);
    for (var di = 0; di < V.deflection.length; di++) {
      var d = V.deflection[di];
      add("Feld " + d.span + " (L=" + d.L.toFixed(2) + " m):");
      add("   w_inst = " + d.w_inst_mm.toFixed(2) + " mm");
      add("   w_fin  = " + d.w_inst_mm.toFixed(2) + " * (1 + " + V.kdef.toFixed(2) + ") = " + d.w_fin_mm.toFixed(2) + " mm");
      add("   w_zul  = " + (d.L*1000).toFixed(0) + " / " + s.w_lim_div + " = " + d.w_allow_mm.toFixed(2) + " mm");
      add("   eta_w  = " + d.w_fin_mm.toFixed(2) + " / " + d.w_allow_mm.toFixed(2) + " = " + d.ratio.toFixed(4) + "  " + (d.ok ? "OK" : "FAIL"));
    }

    title("Schritt 12 - Gesamtergebnis");
    add("Biegung:      eta_m = " + V.bending_eta.toFixed(4) + (V.bending_ok ? "  OK" : "  FAIL"));
    add("Schub:        eta_v = " + V.shear_eta.toFixed(4) + (V.shear_ok ? "  OK" : "  FAIL"));
    add("Verformung:   max eta_w = " + V.deflection.reduce(function(m,d){return Math.max(m,d.ratio);},0).toFixed(4) + (V.deflection_ok ? "  OK" : "  FAIL"));
    add("Bauteil " + (V.ok_overall ? "ERFUELLT alle Nachweise." : "ERFUELLT NICHT alle Nachweise!"));

    return lines;
  }

  function renderTrace(lines) {
    var el = $("#calc-trace");
    el.innerHTML = "";
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      var c = ce("span", { class: (l.kind === "title") ? "step-title" : "formula-line" });
      c.textContent = l.text;
      el.appendChild(c);
    }
  }

  /* ---------------- Add / Remove / Save / Load ---------------- */
  function addLineLoad() {
    var L = state.spans.reduce(function(a,b){return a+b;}, 0);
    state.loads.push({ kind: "line", action: "Q", q1: 2.0, q2: 2.0, x1: 0, x2: L, gammaF: state.gamma_Q, psi: 0.3 });
    renderLoadsTable(); renderSystemDiagram();
  }
  function addPointLoad() {
    var L = state.spans.reduce(function(a,b){return a+b;}, 0);
    state.loads.push({ kind: "point", action: "Q", P: 10.0, x: L/2, gammaF: state.gamma_Q, psi: 0.3 });
    renderLoadsTable(); renderSystemDiagram();
  }
  function addMoment() {
    var L = state.spans.reduce(function(a,b){return a+b;}, 0);
    state.loads.push({ kind: "moment", action: "Q", M: 5.0, x: L/2, gammaF: state.gamma_Q, psi: 0.3 });
    renderLoadsTable(); renderSystemDiagram();
  }
  function saveJSON() {
    var data = JSON.stringify(state, null, 2);
    var blob = new Blob([data], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (state.project.position || "statik") + ".json";
    a.click();
  }
  function loadJSON(file) {
    var fr = new FileReader();
    fr.onload = function (e) {
      try {
        var d = JSON.parse(e.target.result);
        Object.assign(state, d);
        applyStateToUI();
      } catch (err) { alert("Datei nicht lesbar: " + err.message); }
    };
    fr.readAsText(file);
  }

  /* ---------------- Apply state to UI ---------------- */
  function applyStateToUI() {
    $("#num-spans").value = state.spans.length;
    $("#elem-per-span").value = state.nElemPerSpan;
    $("#prj-name").value = state.project.name;
    $("#prj-pos").value = state.project.position;
    $("#prj-eng").value = state.project.engineer;
    $("#prj-date").value = state.project.date;
    $("#mat-class").value = state.material.name;
    $("#mat-sc").value = state.serviceClass;
    $("#mat-ld").value = state.loadDuration;
    $("#mat-gm").value = state.gamma_M;
    $("#sec-shape").value = state.section.shape;
    $("#sec-b").value = state.section.b;
    $("#sec-h").value = state.section.h;
    $("#sec-d").value = state.section.d || 200;
    if (state.section.A) $("#sec-A").value = state.section.A;
    if (state.section.I) $("#sec-I").value = state.section.I;
    if (state.section.W) $("#sec-W").value = state.section.W;
    if (state.section.profile) $("#sec-profile").value = state.section.profile;
    $("#gam-G").value = state.gamma_G;
    $("#gam-Q").value = state.gamma_Q;
    $("#w-lim-net").value = state.w_lim_div;
    renderSpansTable();
    renderSupportsTable();
    renderLoadsTable();
    renderSystemDiagram();
    updateMaterialDisplay();
    computeSection();
  }

  /* ---------------- Example loader ---------------- */
  function loadExample() {
    state = {
      spans: [4.5, 4.5, 4.5],
      supports: [
        { x: 0, type: "pinned", Kv: 0, Kphi: 0, settlement: 0 },
        { x: 4.5, type: "pinned", Kv: 0, Kphi: 0, settlement: 0 },
        { x: 9.0, type: "pinned", Kv: 0, Kphi: 0, settlement: 0 },
        { x: 13.5, type: "pinned", Kv: 0, Kphi: 0, settlement: 0 }
      ],
      loads: [
        { kind: "line", action: "G", q1: 1.8, q2: 1.8, x1: 0, x2: 13.5, gammaF: 1.35, psi: 1.0 },
        { kind: "line", action: "Q", q1: 4.0, q2: 4.0, x1: 0, x2: 13.5, gammaF: 1.50, psi: 0.3 },
        { kind: "point", action: "Q", P: 8.0, x: 6.75, gammaF: 1.50, psi: 0.3 }
      ],
      nElemPerSpan: 30,
      project: { name: "Beispiel - Holzbalken Etagendecke", position: "Hauptbalken HB1", engineer: "Fadri Landolt", date: new Date().toISOString().slice(0,10) },
      material: { name: "GL24h" },
      serviceClass: "1",
      loadDuration: "medium",
      gamma_M: 1.7,
      gamma_G: 1.35,
      gamma_Q: 1.50,
      w_lim_div: 300,
      section: { shape: "rect", b: 160, h: 360, d: 200 }
    };
    applyStateToUI();
  }

  /* ---------------- Reset ---------------- */
  function resetAll() {
    if (!confirm("Alle Eingaben zuruecksetzen?")) return;
    state = {
      spans: [4.0, 4.0],
      supports: [
        { x: 0, type: "pinned", Kv: 0, Kphi: 0, settlement: 0 },
        { x: 4.0, type: "pinned", Kv: 0, Kphi: 0, settlement: 0 },
        { x: 8.0, type: "pinned", Kv: 0, Kphi: 0, settlement: 0 }
      ],
      loads: [
        { kind: "line", action: "G", q1: 2.5, q2: 2.5, x1: 0, x2: 8.0, gammaF: 1.35, psi: 1.0 },
        { kind: "line", action: "Q", q1: 4.0, q2: 4.0, x1: 0, x2: 8.0, gammaF: 1.50, psi: 0.3 }
      ],
      nElemPerSpan: 30,
      project: { name: "Beispielprojekt", position: "Position B1", engineer: "Fadri Landolt", date: new Date().toISOString().slice(0,10) },
      material: { name: "C24" },
      serviceClass: "1",
      loadDuration: "medium",
      gamma_M: 1.7,
      gamma_G: 1.35,
      gamma_Q: 1.50,
      w_lim_div: 300,
      section: { shape: "rect", b: 120, h: 240, d: 200 }
    };
    applyStateToUI();
  }

  /* ---------------- Initialize ---------------- */
  function init() {
    // Set today
    if (!state.project.date) state.project.date = new Date().toISOString().slice(0,10);
    if (!state.project.engineer) state.project.engineer = "Fadri Landolt";
    $("#prj-date").value = state.project.date;
    $("#prj-eng").value = state.project.engineer;

    // Render initial tables
    applyStateToUI();

    // Wire up events
    $("#num-spans").addEventListener("input", function (e) {
      var n = Math.max(1, Math.min(8, parseInt(e.target.value, 10) || 1));
      while (state.spans.length < n) state.spans.push(state.spans[state.spans.length-1] || 4);
      while (state.spans.length > n) state.spans.pop();
      while (state.supports.length < n + 1) state.supports.push({ x: 0, type: "pinned", Kv:0, Kphi:0, settlement:0 });
      while (state.supports.length > n + 1) state.supports.pop();
      recomputeSupportPositions();
      renderSpansTable();
    });
    $("#elem-per-span").addEventListener("input", function (e) {
      state.nElemPerSpan = Math.max(10, Math.min(100, parseInt(e.target.value, 10) || 30));
    });

    // Material
    $("#mat-class").addEventListener("change", function (e) {
      state.material.name = e.target.value;
      var m = Materials.get(e.target.value);
      // Auto-adjust gamma_M
      if (m.type === "VH" || m.type === "BSH") { state.gamma_M = 1.7; }
      else if (m.type === "STAHL") { state.gamma_M = 1.05; }
      $("#mat-gm").value = state.gamma_M.toFixed(2);
      updateMaterialDisplay();
    });
    $("#mat-sc").addEventListener("change", updateMaterialDisplay);
    $("#mat-ld").addEventListener("change", updateMaterialDisplay);
    $("#mat-gm").addEventListener("input", function (e) { state.gamma_M = parseFloat(e.target.value) || 1.7; updateMaterialDisplay(); });

    // Section
    function syncSection() {
      var shape = $("#sec-shape").value;
      // Show/hide fields
      var showRect = (shape === "rect");
      var showCircle = (shape === "circle");
      var showProfile = (shape === "IPE" || shape === "HEA" || shape === "HEB");
      var showCustom = (shape === "custom");
      $("#sec-b").parentElement.style.display = showRect ? "" : "none";
      $("#sec-h").parentElement.style.display = (showRect || showCustom) ? "" : "none";
      $("#sec-d").parentElement.style.display = showCircle ? "" : "none";
      $("#sec-profile").parentElement.style.display = showProfile ? "" : "none";
      $("#sec-A").parentElement.style.display = showCustom ? "" : "none";
      $("#sec-I").parentElement.style.display = showCustom ? "" : "none";
      $("#sec-W").parentElement.style.display = showCustom ? "" : "none";
      computeSection();
    }
    $("#sec-shape").addEventListener("change", syncSection);
    ["#sec-b","#sec-h","#sec-d","#sec-profile","#sec-A","#sec-I","#sec-W"].forEach(function(s){
      $(s).addEventListener("input", computeSection);
    });
    syncSection();

    // Load combinations
    $("#gam-G").addEventListener("input", function(e) { state.gamma_G = parseFloat(e.target.value) || 1.35; });
    $("#gam-Q").addEventListener("input", function(e) { state.gamma_Q = parseFloat(e.target.value) || 1.50; });
    $("#w-lim-net").addEventListener("input", function(e) { state.w_lim_div = parseInt(e.target.value, 10) || 300; });

    // Loads
    $("#btn-add-line").addEventListener("click", addLineLoad);
    $("#btn-add-point").addEventListener("click", addPointLoad);
    $("#btn-add-moment").addEventListener("click", addMoment);

    // Top actions
    $("#btn-calc").addEventListener("click", calculate);
    $("#btn-pdf").addEventListener("click", function () {
      if (!lastResult) {
        alert("Bitte zuerst auf 'Berechnen' klicken.");
        return;
      }
      PDFExport.exportPDF(lastResult);
    });
    $("#btn-reset").addEventListener("click", resetAll);
    $("#btn-load-example").addEventListener("click", loadExample);
    $("#btn-save").addEventListener("click", saveJSON);
    $("#btn-load").addEventListener("click", function () { $("#file-load").click(); });
    $("#file-load").addEventListener("change", function (e) {
      if (e.target.files.length) loadJSON(e.target.files[0]);
    });

    // Run initial calculation so user sees a result
    setTimeout(function(){ calculate(); }, 50);
    // Re-render diagrams on resize
    window.addEventListener("resize", function () {
      renderSystemDiagram();
      if (lastResult) {
        renderResults(lastResult.solution, lastResult.solutionGZG, lastResult.verification);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
