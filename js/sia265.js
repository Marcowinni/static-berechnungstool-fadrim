/* ============================================================
 * sia265.js - SIA 265:2021 Verifications (Holzbau)
 * ============================================================
 * Bending check:
 *   sigma_m,d = M_d / W   <=   f_m,d = k_mod * f_m,k / gamma_M
 *
 * Shear check (rectangular section per SIA 265 Art. 4.5):
 *   tau_d = 1.5 * V_d / A   (rect)   OR  V_d / A_v
 *   tau_d   <=   f_v,d = k_mod * f_v,k / gamma_M
 *
 * Deflection (SIA 260, 265):
 *   w_inst,Q (frequent combination):  E0_mean used
 *   w_fin = w_inst * (1 + k_def)
 *   Allowable: L / w_lim_net  (default L/300)
 *
 * For steel (S235, S355) -- simplified SIA 263:
 *   sigma_x,d = M_d / W <= f_y,d = f_y_k / gamma_M0  (gamma_M0 = 1.05)
 *   tau_d   <= f_v,d = f_y_k / (sqrt(3) * gamma_M0)
 *   w_lim per SIA 260 Tab. 5
 *
 * Inputs/outputs in SI: forces N, moments Nm, stresses N/mm^2 (MPa)
 * NOTE: from solver M is in Nm. W is in mm^3. So sigma = M[Nm]*1000 / W[mm^3] gives N/mm^2.
 *       V is in N. A is in mm^2. tau = 1.5*V/A is in N/mm^2.
 * ============================================================ */
(function (global) {
  "use strict";

  /**
   * Verify a beam analyzed by FEM under design loads.
   * @param {object} args
   *   args.solution         FEM solve result (sample arrays in N, Nm units)
   *   args.solution_gzg     FEM solve result for GZG (quasi-perm.) combination
   *   args.material         from Materials.get(...)
   *   args.section          from Sections.rect/circle/profile
   *   args.serviceClass     "1" | "2" | "3"
   *   args.loadDuration     "permanent"|"long"|"medium"|"short"|"instant"
   *   args.gamma_M          gamma_M (default 1.7 for wood, 1.05 for steel)
   *   args.spans            array of span lengths [m]
   *   args.w_lim_div        e.g. 300 (means L/300)
   * @returns Object containing detailed verification results.
   */
  function verify(args) {
    var mat = args.material;
    var sec = args.section;
    var isWood = (mat.type === "VH" || mat.type === "BSH");
    var isSteel = (mat.type === "STAHL");
    var gamma_M = args.gamma_M;
    if (gamma_M == null) gamma_M = isWood ? 1.7 : 1.05;

    var kmod = isWood ? Materials.kmod(args.serviceClass, args.loadDuration) : 1.0;
    var kdef = isWood ? Materials.kdef(mat.type, args.serviceClass) : 0;

    /* ---- Extract max M and V from solution sample (units: Nm and N) ---- */
    var M = args.solution.sample.M;
    var V = args.solution.sample.V;
    var xs = args.solution.sample.x;
    var Mmax_pos = 0, Mmax_pos_x = 0;
    var Mmax_neg = 0, Mmax_neg_x = 0;
    var Vmax_abs = 0, Vmax_x = 0;
    for (var i = 0; i < M.length; i++) {
      if (M[i] > Mmax_pos) { Mmax_pos = M[i]; Mmax_pos_x = xs[i]; }
      if (M[i] < Mmax_neg) { Mmax_neg = M[i]; Mmax_neg_x = xs[i]; }
      if (Math.abs(V[i]) > Math.abs(Vmax_abs)) { Vmax_abs = V[i]; Vmax_x = xs[i]; }
    }
    var Mmax_abs = Math.max(Math.abs(Mmax_pos), Math.abs(Mmax_neg));
    var Mmax_abs_x = (Math.abs(Mmax_pos) > Math.abs(Mmax_neg)) ? Mmax_pos_x : Mmax_neg_x;

    /* ---- BENDING CHECK ---- */
    var W = sec.W;     // mm^3
    var sigma_m_d = (Mmax_abs * 1000) / W;   // Nm -> N*mm: factor 1000; result in N/mm^2 = MPa
    var f_m_k = isWood ? mat.fm_k : (isSteel ? mat.fy_k : 0);
    var f_m_d = (isSteel ? f_m_k : kmod * f_m_k) / gamma_M;
    var bending_eta = sigma_m_d / f_m_d;
    var bending_ok = bending_eta <= 1.0;

    /* ---- SHEAR CHECK ----
     * For rectangular wood section per SIA 265 Art. 4.5.2:
     *   tau_d = 1.5 * V_d / A_eff  where A_eff = b_eff * h with k_cr factor
     *   For simplicity here we use A_eff = A and apply 1.5 factor for rect.
     *   For other shapes: tau_d = V_d / A_v
     */
    var A = sec.A;     // mm^2
    var tau_d;
    var tau_formula;
    if (sec.type === "rect") {
      tau_d = 1.5 * Math.abs(Vmax_abs) / A;
      tau_formula = "1.5 * V_d / A";
    } else if (sec.type === "circle") {
      tau_d = (4/3) * Math.abs(Vmax_abs) / A;
      tau_formula = "(4/3) * V_d / A";
    } else if (sec.Av) {
      tau_d = Math.abs(Vmax_abs) / sec.Av;
      tau_formula = "V_d / A_v";
    } else {
      tau_d = Math.abs(Vmax_abs) / A;
      tau_formula = "V_d / A";
    }
    var f_v_k = isWood ? mat.fv_k : (isSteel ? f_m_k / Math.sqrt(3) : 0);
    var f_v_d = (isSteel ? f_v_k : kmod * f_v_k) / gamma_M;
    var shear_eta = tau_d / f_v_d;
    var shear_ok = shear_eta <= 1.0;

    /* ---- DEFLECTION CHECK ----
     * Allowable: L / w_lim_div per span (using max(L) is simpler, but per span is correct)
     */
    var divLim = args.w_lim_div || 300;
    var spans = args.spans;
    var deflectionResults = [];
    var deflection_ok = true;
    var maxRatio = 0;
    var w_sample = args.solution_gzg ? args.solution_gzg.sample.w : args.solution.sample.w;
    var x_sample = args.solution_gzg ? args.solution_gzg.sample.x : args.solution.sample.x;

    var xCur = 0;
    for (var s = 0; s < spans.length; s++) {
      var L_s = spans[s];
      var x0 = xCur, x1 = xCur + L_s;
      var w_max = 0, w_x = 0;
      for (var ix = 0; ix < x_sample.length; ix++) {
        if (x_sample[ix] >= x0 - 1e-9 && x_sample[ix] <= x1 + 1e-9) {
          if (Math.abs(w_sample[ix]) > Math.abs(w_max)) {
            w_max = w_sample[ix];
            w_x = x_sample[ix];
          }
        }
      }
      // w_max is in m -> convert to mm
      var w_max_mm = w_max * 1000;
      var w_fin_mm = w_max_mm * (1 + kdef);
      var w_allow_mm = (L_s * 1000) / divLim;
      var ratio = Math.abs(w_fin_mm) / w_allow_mm;
      if (ratio > maxRatio) maxRatio = ratio;
      var ok = ratio <= 1.0;
      if (!ok) deflection_ok = false;
      deflectionResults.push({
        span: s + 1,
        L: L_s,
        w_inst_mm: w_max_mm,
        w_fin_mm: w_fin_mm,
        w_allow_mm: w_allow_mm,
        ratio: ratio,
        ok: ok,
        x: w_x
      });
      xCur = x1;
    }

    /* ---- COMBINED BENDING + SHEAR (for steel, interaction check) ---- */
    var interaction_eta = null;
    if (isSteel) {
      // Simplified: SIA 263 (M-V interaction): if V_d <= 0.5 V_pl,d, no reduction.
      var Vpl_d = (mat.fy_k / Math.sqrt(3)) * A / gamma_M;
      if (Math.abs(Vmax_abs) > 0.5 * Vpl_d) {
        var rho = Math.pow((2 * Math.abs(Vmax_abs) / Vpl_d - 1), 2);
        interaction_eta = bending_eta * (1 - rho) + rho; // simplified placeholder
      }
    }

    return {
      // Input echo
      material: mat, section: sec, gamma_M: gamma_M, kmod: kmod, kdef: kdef,
      // Internal forces
      Mmax_abs: Mmax_abs, Mmax_abs_x: Mmax_abs_x,
      Mmax_pos: Mmax_pos, Mmax_pos_x: Mmax_pos_x,
      Mmax_neg: Mmax_neg, Mmax_neg_x: Mmax_neg_x,
      Vmax_abs: Vmax_abs, Vmax_x: Vmax_x,
      // Bending
      sigma_m_d: sigma_m_d, f_m_k: f_m_k, f_m_d: f_m_d,
      bending_eta: bending_eta, bending_ok: bending_ok,
      // Shear
      tau_d: tau_d, tau_formula: tau_formula,
      f_v_k: f_v_k, f_v_d: f_v_d,
      shear_eta: shear_eta, shear_ok: shear_ok,
      // Deflection
      deflection: deflectionResults, deflection_ok: deflection_ok,
      // Overall
      ok_overall: bending_ok && shear_ok && deflection_ok,
      isWood: isWood, isSteel: isSteel,
      interaction_eta: interaction_eta
    };
  }

  global.SIA265 = { verify: verify };
})(typeof window !== "undefined" ? window : globalThis);
