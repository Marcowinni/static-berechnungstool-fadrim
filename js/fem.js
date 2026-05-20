/* ============================================================
 * fem.js - Finite Element Method solver for continuous beams
 * ============================================================
 * Euler-Bernoulli beam theory, cubic Hermite interpolation.
 *
 * SIGN CONVENTION:
 *   x:       along the beam, positive to right (m)
 *   w:       transverse displacement, POSITIVE DOWN (m or mm)
 *   theta:   rotation = dw/dx (rad)
 *   q:       distributed transverse load, POSITIVE DOWN (kN/m)
 *   P:       point load, POSITIVE DOWN (kN)
 *   M_app:   applied external moment, positive sagging (kNm)
 *   M(x):    internal bending moment, POSITIVE = SAGGING (kNm)
 *   V(x):    internal shear, POSITIVE = upward on left face (kN)
 *   R:       support reaction, POSITIVE UP (kN)
 *
 * Unit system used INTERNALLY in the FEM solver:
 *   length: m
 *   force:  N
 *   moment: Nm
 *   E:      N/m^2 = Pa  (= MPa * 1e6)
 *   I:      m^4         (= mm^4 / 1e12)
 *   EI:     Nm^2
 *   stiffness K is in N/m or Nm/rad
 *
 * Input from app.js arrives in mixed units; the FEM converts to SI inside
 * and converts results back to kN, kNm, mm, etc.
 *
 * ============================================================
 */
(function (global) {
  "use strict";

  /* ----- Hermite shape functions in xi = x/Le [0,1] ----- */
  function N1(xi) { return 1 - 3*xi*xi + 2*xi*xi*xi; }
  function N2(xi, Le) { return Le * (xi - 2*xi*xi + xi*xi*xi); }
  function N3(xi) { return 3*xi*xi - 2*xi*xi*xi; }
  function N4(xi, Le) { return Le * (-xi*xi + xi*xi*xi); }
  // Derivatives wrt x: dN/dx = (1/Le)*dN/dxi
  function dN1(xi, Le) { return (-6*xi + 6*xi*xi) / Le; }
  function dN2(xi)     { return (1 - 4*xi + 3*xi*xi); }
  function dN3(xi, Le) { return (6*xi - 6*xi*xi) / Le; }
  function dN4(xi)     { return (-2*xi + 3*xi*xi); }

  /* ----- Element stiffness matrix (4x4 row-major) ----- */
  function elementStiffness(EI, L) {
    var c = EI / (L*L*L);
    var L2 = L*L;
    return new Float64Array([
       12*c,    6*L*c,   -12*c,    6*L*c,
       6*L*c,  4*L2*c,   -6*L*c,  2*L2*c,
      -12*c,   -6*L*c,    12*c,   -6*L*c,
       6*L*c,  2*L2*c,   -6*L*c,  4*L2*c
    ]);
  }

  /* ----- Equivalent nodal forces for a partial uniform load -----
   * Apply q (constant, in N/m, downward+) from xa to xb (0<=xa<xb<=Le)
   * Returns [F_w_i, F_theta_i, F_w_j, F_theta_j] in N, Nm
   */
  function feqUniformPartial(q, xa, xb, Le) {
    // Integrate q*N_i(x) from xa to xb, where N_i are the cubic Hermite functions
    // Using xi = x/Le, dx = Le * dxi, so:
    //   F_i = q * Le * ∫_{xa/Le}^{xb/Le} N_i(xi) dxi
    var xia = xa / Le, xib = xb / Le;
    function intN1(a, b) { // ∫ (1 - 3ξ² + 2ξ³) dξ = ξ - ξ³ + ξ⁴/2
      function p(x){return x - x*x*x + 0.5*x*x*x*x;}
      return p(b) - p(a);
    }
    function intN2(a, b) { // ∫ (ξ - 2ξ² + ξ³) dξ * Le = (ξ²/2 - 2ξ³/3 + ξ⁴/4)*Le
      function p(x){return 0.5*x*x - (2/3)*x*x*x + 0.25*x*x*x*x;}
      return Le * (p(b) - p(a));
    }
    function intN3(a, b) { // ∫ (3ξ² - 2ξ³) dξ = ξ³ - ξ⁴/2
      function p(x){return x*x*x - 0.5*x*x*x*x;}
      return p(b) - p(a);
    }
    function intN4(a, b) { // ∫ (-ξ² + ξ³) dξ * Le = (-ξ³/3 + ξ⁴/4)*Le
      function p(x){return -x*x*x/3 + 0.25*x*x*x*x;}
      return Le * (p(b) - p(a));
    }
    return [
      q * Le * intN1(xia, xib),
      q * Le * intN2(xia, xib),
      q * Le * intN3(xia, xib),
      q * Le * intN4(xia, xib)
    ];
  }

  /* ----- Equivalent nodal forces for a partial trapezoidal load q1->q2 -----
   * q goes linearly from q1 at xa to q2 at xb (over partial element segment).
   * Decompose into uniform q1 + linear (q2-q1)/(xb-xa) * (x-xa)
   * Compute integrals over [xa, xb] of q(x)*N_i(x).
   */
  function feqTrapezoidalPartial(q1, q2, xa, xb, Le) {
    // q(x) over [xa, xb]: q(x) = q1 + (q2-q1)*(x - xa)/(xb - xa)
    // Split: q(x) = A + B*x, where A = q1 - B*xa, B = (q2-q1)/(xb-xa)
    // Then integrals of A*N_i + B*x*N_i over [xa, xb]
    if (Math.abs(xb - xa) < 1e-12) return [0,0,0,0];
    var fA = feqUniformPartial(1.0, xa, xb, Le); // ∫ N_i dx over [xa,xb], coefficients
    // For B*x*N_i, change variable to xi: x = Le*xi, dx = Le dxi
    // ∫ B*Le*xi*N_i(xi)*Le dxi = B*Le^2 * ∫ xi*N_i(xi) dxi
    var xia = xa / Le, xib = xb / Le;
    function intxN1(a, b) { // ∫ ξ*(1 - 3ξ² + 2ξ³) dξ = ξ²/2 - 3ξ⁴/4 + 2ξ⁵/5
      function p(x){return 0.5*x*x - 0.75*x*x*x*x + 0.4*x*x*x*x*x;}
      return p(b) - p(a);
    }
    function intxN2(a, b) { // ∫ ξ*(ξ - 2ξ² + ξ³) dξ * Le = (ξ³/3 - ξ⁴/2 + ξ⁵/5)*Le
      function p(x){return x*x*x/3 - 0.5*x*x*x*x + 0.2*x*x*x*x*x;}
      return Le * (p(b) - p(a));
    }
    function intxN3(a, b) { // ∫ ξ*(3ξ² - 2ξ³) dξ = 3ξ⁴/4 - 2ξ⁵/5
      function p(x){return 0.75*x*x*x*x - 0.4*x*x*x*x*x;}
      return p(b) - p(a);
    }
    function intxN4(a, b) { // ∫ ξ*(-ξ² + ξ³) dξ * Le = (-ξ⁴/4 + ξ⁵/5)*Le
      function p(x){return -0.25*x*x*x*x + 0.2*x*x*x*x*x;}
      return Le * (p(b) - p(a));
    }
    var B = (q2 - q1) / (xb - xa);
    var A = q1 - B * xa;
    // Note: fA returned for q=1.0 means it's just the integral of N_i over [xa,xb] in m or m^2
    // So A * fA[i] = A * ∫ N_i dx ... = ∫ A * N_i dx (correct dimensions: A is force/length, fA in m -> N)
    var bxN = [
      Le * Le * intxN1(xia, xib),
      Le * Le * intxN2(xia, xib),
      Le * Le * intxN3(xia, xib),
      Le * Le * intxN4(xia, xib)
    ];
    return [
      A * fA[0] + B * bxN[0],
      A * fA[1] + B * bxN[1],
      A * fA[2] + B * bxN[2],
      A * fA[3] + B * bxN[3]
    ];
  }

  /* ----- Equivalent nodal forces for a point load at x=a within element ----- */
  function feqPointForce(P, a, Le) {
    var xi = a / Le;
    return [
      P * N1(xi),
      P * N2(xi, Le),
      P * N3(xi),
      P * N4(xi, Le)
    ];
  }

  /* ----- Equivalent nodal forces for an applied moment at x=a within element ----- */
  function feqPointMoment(M, a, Le) {
    var xi = a / Le;
    return [
      M * dN1(xi, Le),
      M * dN2(xi),
      M * dN3(xi, Le),
      M * dN4(xi)
    ];
  }

  /* ============================================================
   * MAIN SOLVER
   * ============================================================
   * Input: spec = {
   *   spans:        [L1, L2, ..., Ln]  in m
   *   supports:     [{ x, type, Kv, Kphi, settlement }]
   *      type ∈ {'fixed','pinned','roller','spring','free'}
   *      Kv:    vertical spring stiffness in N/m  (0 means none)
   *      Kphi:  rotational spring stiffness in Nm/rad (0 means none)
   *      settlement: prescribed settlement [m] (positive down)
   *   loads:        [{ kind, ... }]
   *      kind ∈ {'point','line','moment'}
   *      common: x (point) or x1, x2 (line) in m
   *      magnitudes: P [N], q1/q2 [N/m], M [Nm] -- after combination
   *   nElemPerSpan: integer, default 30
   *   EI:           N*m^2  (constant along beam)
   *   EI_perSpan:   optional array of EI per span (overrides EI)
   * }
   * Returns: {
   *   nodes:    Float64Array of node x positions [m]
   *   nDof:     2 * nodes.length
   *   u:        Float64Array of DOF values [w (m), theta (rad), ...]
   *   reactions: array of { x, Rv (N up), Mz (Nm) }
   *   support_dofs: { dofW, dofPhi, x } for each support
   *   sample: { x: [...], M: [...], V: [...], w: [...] }
   * }
   * ============================================================ */
  function solve(spec) {
    var spans = spec.spans;
    var nspans = spans.length;
    var nEPS = spec.nElemPerSpan || 30;
    var EI = spec.EI;
    var EI_span = spec.EI_perSpan || null;

    /* ---- Build node grid: each span has nEPS elements ---- */
    var nodeXs = [0];
    var xCur = 0;
    var spanOfElem = []; // span index for each element
    for (var s = 0; s < nspans; s++) {
      var L_i = spans[s];
      var dx = L_i / nEPS;
      for (var j = 1; j <= nEPS; j++) {
        nodeXs.push(xCur + j * dx);
        spanOfElem.push(s);
      }
      xCur += L_i;
    }
    var nNodes = nodeXs.length;
    var nDof = 2 * nNodes;
    var nElems = nNodes - 1;

    /* ---- Build elements ---- */
    var elements = [];
    for (var e = 0; e < nElems; e++) {
      var Le = nodeXs[e + 1] - nodeXs[e];
      var EI_e = EI_span ? EI_span[spanOfElem[e]] : EI;
      elements.push({ n1: e, n2: e + 1, Le: Le, EI: EI_e, span: spanOfElem[e] });
    }

    /* ---- Assemble global stiffness K ---- */
    var K = LinAlg.zeros(nDof, nDof);
    for (var ei = 0; ei < nElems; ei++) {
      var el = elements[ei];
      var ke = elementStiffness(el.EI, el.Le);
      var dofs = [2*el.n1, 2*el.n1+1, 2*el.n2, 2*el.n2+1];
      LinAlg.assemble(K, nDof, ke, dofs);
    }

    /* ---- Build global force vector F from applied loads ---- */
    var F = new Float64Array(nDof);
    for (var li = 0; li < spec.loads.length; li++) {
      applyLoadToF(F, spec.loads[li], elements, nodeXs);
    }
    // Save copy for residual reaction computation later
    var F_applied = new Float64Array(F);

    /* ---- Identify supports & assemble spring stiffness ---- */
    var supportInfo = [];
    var constrainedDofs = [];
    var constraintValues = {};
    for (var si = 0; si < spec.supports.length; si++) {
      var sup = spec.supports[si];
      var ni = findNearestNode(nodeXs, sup.x);
      var dofW = 2 * ni, dofPhi = 2 * ni + 1;
      var info = { x: nodeXs[ni], nodeIndex: ni, dofW: dofW, dofPhi: dofPhi, type: sup.type, Kv: sup.Kv||0, Kphi: sup.Kphi||0 };
      supportInfo.push(info);

      // Vertical constraint
      if (sup.type === 'fixed' || sup.type === 'pinned' || sup.type === 'roller') {
        constrainedDofs.push(dofW);
        constraintValues[dofW] = (sup.settlement || 0);
      } else if (sup.type === 'spring' && sup.Kv > 0) {
        K[dofW * nDof + dofW] += sup.Kv;
        info.Kv = sup.Kv;
      }
      // If user adds Kv > 0 even with 'pinned' etc., we still treat as rigid (constraint wins)

      // Rotational constraint
      if (sup.type === 'fixed') {
        constrainedDofs.push(dofPhi);
        constraintValues[dofPhi] = 0;
      } else if (sup.Kphi && sup.Kphi > 0) {
        K[dofPhi * nDof + dofPhi] += sup.Kphi;
        info.Kphi = sup.Kphi;
      }
    }

    /* ---- Apply BCs by static condensation (eliminate constrained DOFs) ---- */
    var isCon = new Array(nDof).fill(false);
    var conVal = new Float64Array(nDof);
    for (var c = 0; c < constrainedDofs.length; c++) {
      isCon[constrainedDofs[c]] = true;
      conVal[constrainedDofs[c]] = constraintValues[constrainedDofs[c]] || 0;
    }

    /* Build mapping free-dof index */
    var freeIdx = [];
    for (var d = 0; d < nDof; d++) if (!isCon[d]) freeIdx.push(d);
    var nFree = freeIdx.length;

    /* F_eff = F - K * u_constrained */
    var Feff = new Float64Array(nDof);
    for (var i = 0; i < nDof; i++) {
      Feff[i] = F[i];
      for (var jj = 0; jj < nDof; jj++) {
        if (isCon[jj]) Feff[i] -= K[i * nDof + jj] * conVal[jj];
      }
    }

    /* Extract reduced K and F */
    var Kf = LinAlg.zeros(nFree, nFree);
    var Ff = new Float64Array(nFree);
    for (var ii = 0; ii < nFree; ii++) {
      Ff[ii] = Feff[freeIdx[ii]];
      for (var jjj = 0; jjj < nFree; jjj++) {
        Kf[ii * nFree + jjj] = K[freeIdx[ii] * nDof + freeIdx[jjj]];
      }
    }

    /* Solve */
    var ufree = LinAlg.solve(Kf, Ff, nFree);

    /* Reassemble full u */
    var u = new Float64Array(nDof);
    for (var iii = 0; iii < nDof; iii++) {
      if (isCon[iii]) u[iii] = conVal[iii];
    }
    for (var iv = 0; iv < nFree; iv++) u[freeIdx[iv]] = ufree[iv];

    /* ---- Compute reactions: R = K * u - F at every DOF ----
     * (this gives 0 at unconstrained DOFs by construction, reactions at constrained ones)
     */
    var Ku = LinAlg.matvec(K, u, nDof);
    var residual = new Float64Array(nDof);
    for (var z = 0; z < nDof; z++) residual[z] = Ku[z] - F_applied[z];

    /* ---- Build reactions per support ----
     * Convention: w positive DOWN.
     * Rv (reported positive UP) = -residual[dofW]
     * Mz (reported in sagging convention, matching internal M(x) at support) =
     *     +residual[dofPhi] for fixed supports,
     *     -Kphi * u[dofPhi] for rotational springs.
     * (verified against cantilever-with-tip-load test: M(0+) = -P*L hogging.)
     */
    var reactions = [];
    for (var si2 = 0; si2 < supportInfo.length; si2++) {
      var sup2 = supportInfo[si2];
      var Rv = 0, Mz = 0;
      if (sup2.type === 'fixed' || sup2.type === 'pinned' || sup2.type === 'roller') {
        Rv = -residual[sup2.dofW];
      } else if (sup2.type === 'spring' && sup2.Kv > 0) {
        Rv = sup2.Kv * u[sup2.dofW];
      }
      if (sup2.type === 'fixed') {
        Mz = residual[sup2.dofPhi];
      } else if (sup2.Kphi && sup2.Kphi > 0) {
        Mz = -sup2.Kphi * u[sup2.dofPhi];
      }
      reactions.push({ x: sup2.x, Rv: Rv, Mz: Mz, type: sup2.type, info: sup2 });
    }

    /* ---- Sample internal forces & deflection along the beam ----
     * Strategy: walk element by element, compute V(x) and M(x) by:
     *   - Element end forces from f_end = ke * u_el  -- gives nodal forces from displacements
     *   - WITHOUT loads contribution -- so we then need to add loads
     *
     * Better: Use global equilibrium method:
     *   - Walk from x=0, accumulate reactions (encountered so far) and loads (encountered so far)
     *   - V(x) = Sum(R_up so far) - Sum(P_down so far) - integral of q_down from 0 to x
     *   - M(x) = Sum(R*(x - x_R)) - Sum(P*(x - x_P)) - double integral of q + Sum(M_app)
     *
     * We'll use the global equilibrium approach because it's simple and robust.
     * Sample at many x points (every node + intermediate points within elements).
     */
    var samplesPerElement = 6;
    var sampleXs = [];
    for (var en = 0; en < nElems; en++) {
      var x0 = nodeXs[en];
      var Le2 = elements[en].Le;
      for (var k = 0; k < samplesPerElement; k++) {
        sampleXs.push(x0 + (k / samplesPerElement) * Le2);
      }
    }
    sampleXs.push(nodeXs[nNodes - 1]);

    /* For deflection: interpolate using Hermite shape functions per element */
    function interpDeflection(x) {
      for (var en2 = 0; en2 < nElems; en2++) {
        if (x >= nodeXs[en2] - 1e-12 && x <= nodeXs[en2 + 1] + 1e-12) {
          var el2 = elements[en2];
          var Le3 = el2.Le;
          var xi = (x - nodeXs[en2]) / Le3;
          if (xi < 0) xi = 0;
          if (xi > 1) xi = 1;
          var w1 = u[2*el2.n1], t1 = u[2*el2.n1+1];
          var w2 = u[2*el2.n2], t2 = u[2*el2.n2+1];
          return N1(xi)*w1 + N2(xi, Le3)*t1 + N3(xi)*w2 + N4(xi, Le3)*t2;
        }
      }
      return 0;
    }

    /* For V(x), M(x): global equilibrium */
    function computeVM(x) {
      var Vx = 0, Mx = 0;
      // Reactions to the left of x (inclusive)
      for (var ri = 0; ri < reactions.length; ri++) {
        var r = reactions[ri];
        if (r.x <= x + 1e-9) {
          Vx += r.Rv;
          Mx += r.Rv * (x - r.x);
          Mx += r.Mz;  // applied reaction moment (e.g., fixed support)
        }
      }
      // Loads to the left of x
      for (var lj = 0; lj < spec.loads.length; lj++) {
        var ld = spec.loads[lj];
        if (ld.kind === 'point') {
          if (ld.x <= x + 1e-9) {
            Vx -= ld.P;                  // downward load reduces shear
            Mx -= ld.P * (x - ld.x);     // contributes -P*(x-x_P) to sagging M
          }
        } else if (ld.kind === 'moment') {
          if (ld.x <= x + 1e-9) {
            Mx += ld.M;  // applied moment adds directly
          }
        } else if (ld.kind === 'line') {
          if (ld.x1 < x - 1e-9) {
            var xb = Math.min(ld.x2, x);
            var xa = ld.x1;
            var Ll = ld.x2 - ld.x1;
            var L_eff = xb - xa;
            // q(x) linear: q1 at x1, q2 at x2
            // Integral of q over [xa, xb]: trapezoid
            var qa = ld.q1 + (ld.q2 - ld.q1) * (xa - ld.x1) / Ll;
            var qb = ld.q1 + (ld.q2 - ld.q1) * (xb - ld.x1) / Ll;
            var Qtot = 0.5 * (qa + qb) * L_eff;
            // Centroid of trapezoidal load from xa
            var xcg;
            if (Math.abs(qa + qb) < 1e-12) xcg = (xa + xb) / 2;
            else xcg = xa + L_eff * (qa + 2*qb) / (3 * (qa + qb));
            Vx -= Qtot;
            Mx -= Qtot * (x - xcg);
          }
        }
      }
      return { V: Vx, M: Mx };
    }

    var sM = [], sV = [], sW = [];
    for (var sk = 0; sk < sampleXs.length; sk++) {
      var x = sampleXs[sk];
      var vm = computeVM(x);
      sM.push(vm.M);
      sV.push(vm.V);
      sW.push(interpDeflection(x));
    }

    return {
      nodeXs: nodeXs,
      elements: elements,
      u: u,
      reactions: reactions,
      sample: { x: sampleXs, M: sM, V: sV, w: sW },
      Ltot: xCur
    };
  }

  /* ----- Apply a load to global F ----- */
  function applyLoadToF(F, load, elements, nodeXs) {
    if (load.kind === 'point') {
      // Find the element containing load.x
      var x = load.x;
      var P = load.P;
      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        if (x >= nodeXs[el.n1] - 1e-12 && x <= nodeXs[el.n2] + 1e-12) {
          var a = x - nodeXs[el.n1];
          var fe = feqPointForce(P, a, el.Le);
          var dofs = [2*el.n1, 2*el.n1+1, 2*el.n2, 2*el.n2+1];
          LinAlg.assembleF(F, fe, dofs);
          return;
        }
      }
    } else if (load.kind === 'moment') {
      var xM = load.x;
      var M = load.M;
      for (var i2 = 0; i2 < elements.length; i2++) {
        var el2 = elements[i2];
        if (xM >= nodeXs[el2.n1] - 1e-12 && xM <= nodeXs[el2.n2] + 1e-12) {
          var aM = xM - nodeXs[el2.n1];
          var feM = feqPointMoment(M, aM, el2.Le);
          var dofsM = [2*el2.n1, 2*el2.n1+1, 2*el2.n2, 2*el2.n2+1];
          LinAlg.assembleF(F, feM, dofsM);
          return;
        }
      }
    } else if (load.kind === 'line') {
      // Distribute over all elements intersected by [x1, x2]
      var x1 = load.x1, x2 = load.x2;
      var q1 = load.q1, q2 = load.q2;
      var Ll = x2 - x1;
      if (Ll <= 0) return;
      for (var i3 = 0; i3 < elements.length; i3++) {
        var el3 = elements[i3];
        var ex1 = nodeXs[el3.n1], ex2 = nodeXs[el3.n2];
        var xa = Math.max(ex1, x1);
        var xb = Math.min(ex2, x2);
        if (xb <= xa + 1e-12) continue;
        // Local coordinates within element
        var loca = xa - ex1;
        var locb = xb - ex1;
        // q at xa and xb
        var qa = q1 + (q2 - q1) * (xa - x1) / Ll;
        var qb = q1 + (q2 - q1) * (xb - x1) / Ll;
        var fe3;
        if (Math.abs(qa - qb) < 1e-12) {
          fe3 = feqUniformPartial(qa, loca, locb, el3.Le);
        } else {
          fe3 = feqTrapezoidalPartial(qa, qb, loca, locb, el3.Le);
        }
        var dofs3 = [2*el3.n1, 2*el3.n1+1, 2*el3.n2, 2*el3.n2+1];
        LinAlg.assembleF(F, fe3, dofs3);
      }
    }
  }

  function findNearestNode(nodeXs, x) {
    var best = 0, bestD = Infinity;
    for (var i = 0; i < nodeXs.length; i++) {
      var d = Math.abs(nodeXs[i] - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /* ----- Public API ----- */
  global.FEM = {
    solve: solve,
    elementStiffness: elementStiffness,
    feqPointForce: feqPointForce,
    feqUniformPartial: feqUniformPartial,
    feqTrapezoidalPartial: feqTrapezoidalPartial,
    findNearestNode: findNearestNode
  };
})(typeof window !== "undefined" ? window : globalThis);
