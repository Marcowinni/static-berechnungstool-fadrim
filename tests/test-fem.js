/* ============================================================
 * test-fem.js - Validation tests against analytical solutions
 * ============================================================
 * Run: node tests/test-fem.js
 * ============================================================ */

// Minimal browser-shim
const globalScope = globalThis;
require("../js/linalg.js");
require("../js/fem.js");

function approx(actual, expected, tol, name) {
  const err = Math.abs(actual - expected);
  const rel = expected !== 0 ? err / Math.abs(expected) : err;
  const ok = err < tol || rel < tol;
  console.log((ok ? "PASS" : "FAIL") + "  " + name +
    "   actual=" + actual.toFixed(6) +
    "   expected=" + expected.toFixed(6) +
    "   abs.err=" + err.toExponential(2));
  return ok;
}

const FEM = globalScope.FEM;
let allPass = true;

/* ----- Test 1: Simply Supported Beam (SSB) with UDL ----- */
console.log("\n=== Test 1: SSB with uniform load ===");
{
  const L = 6.0;     // m
  const q = 10e3;    // N/m (= 10 kN/m, downward+)
  const EI = 1.0e7;  // N*m^2

  const sol = FEM.solve({
    spans: [L],
    supports: [
      { x: 0, type: "pinned", Kv: 0, Kphi: 0, settlement: 0 },
      { x: L, type: "pinned", Kv: 0, Kphi: 0, settlement: 0 }
    ],
    loads: [
      { kind: "line", q1: q, q2: q, x1: 0, x2: L }
    ],
    nElemPerSpan: 30,
    EI: EI
  });

  const expectedRv = q * L / 2;            // 30 kN
  const expectedMmax = q * L * L / 8;      // 45 kNm
  const expectedVmax = q * L / 2;          // 30 kN
  const expectedWmax = 5 * q * Math.pow(L, 4) / (384 * EI); // m

  allPass &= approx(sol.reactions[0].Rv, expectedRv, 1e-2, "R_A");
  allPass &= approx(sol.reactions[1].Rv, expectedRv, 1e-2, "R_B");
  let MmaxFound = 0, VmaxFound = 0, wmaxFound = 0;
  for (let i = 0; i < sol.sample.M.length; i++) {
    if (sol.sample.M[i] > MmaxFound) MmaxFound = sol.sample.M[i];
    if (Math.abs(sol.sample.V[i]) > Math.abs(VmaxFound)) VmaxFound = sol.sample.V[i];
    if (sol.sample.w[i] > wmaxFound) wmaxFound = sol.sample.w[i];
  }
  allPass &= approx(MmaxFound, expectedMmax, 1e-2, "M_max");
  allPass &= approx(Math.abs(VmaxFound), expectedVmax, 1e-2, "V_max");
  allPass &= approx(wmaxFound, expectedWmax, 1e-3, "w_max");
}

/* ----- Test 2: 2-span continuous beam, equal spans, UDL ----- */
console.log("\n=== Test 2: 2-span continuous beam ===");
{
  const L = 4.0;
  const q = 10e3;
  const EI = 1.0e7;

  const sol = FEM.solve({
    spans: [L, L],
    supports: [
      { x: 0, type: "pinned" },
      { x: L, type: "pinned" },
      { x: 2*L, type: "pinned" }
    ],
    loads: [
      { kind: "line", q1: q, q2: q, x1: 0, x2: 2*L }
    ],
    nElemPerSpan: 40,
    EI: EI
  });

  const expectedRA = 3 * q * L / 8;
  const expectedRB = 10 * q * L / 8;
  const expectedRC = 3 * q * L / 8;
  const expectedMsupport = -q * L * L / 8;
  const expectedMspan = 9 * q * L * L / 128;

  allPass &= approx(sol.reactions[0].Rv, expectedRA, 1e-2, "R_A");
  allPass &= approx(sol.reactions[1].Rv, expectedRB, 1e-2, "R_B (middle)");
  allPass &= approx(sol.reactions[2].Rv, expectedRC, 1e-2, "R_C");

  // Find M at x=L (support B)
  let MatB = 0;
  for (let i = 0; i < sol.sample.x.length; i++) {
    if (Math.abs(sol.sample.x[i] - L) < 0.02) {
      MatB = sol.sample.M[i];
      break;
    }
  }
  allPass &= approx(MatB, expectedMsupport, 1e-1, "M at support B");

  // Find max positive M (field moment in either span)
  let Mfield = 0;
  for (let i = 0; i < sol.sample.M.length; i++) {
    if (sol.sample.M[i] > Mfield) Mfield = sol.sample.M[i];
  }
  allPass &= approx(Mfield, expectedMspan, 1e-1, "M_max field");
}

/* ----- Test 3: Cantilever with point load at tip ----- */
console.log("\n=== Test 3: Cantilever with point load ===");
{
  const L = 3.0;
  const P = 5e3;  // N
  const EI = 1.0e7;

  const sol = FEM.solve({
    spans: [L],
    supports: [
      { x: 0, type: "fixed" },
      { x: L, type: "free" }       // We need to also handle 'free' (no constraint)
    ],
    loads: [
      { kind: "point", P: P, x: L }
    ],
    nElemPerSpan: 30,
    EI: EI
  });

  const expectedMfix = -P * L;       // hogging moment at fix
  const expectedRfix = P;
  const expectedWtip = P * Math.pow(L, 3) / (3 * EI);

  allPass &= approx(sol.reactions[0].Rv, expectedRfix, 1e-2, "R_fix");
  allPass &= approx(sol.reactions[0].Mz, expectedMfix, 1e-2, "M_fix");
  // Tip deflection
  const wTip = sol.sample.w[sol.sample.w.length - 1];
  allPass &= approx(wTip, expectedWtip, 1e-3, "w_tip");
}

/* ----- Test 4: SSB with point load at center ----- */
console.log("\n=== Test 4: SSB with point load at mid ===");
{
  const L = 6.0;
  const P = 10e3;
  const EI = 1.0e7;

  const sol = FEM.solve({
    spans: [L],
    supports: [{ x: 0, type: "pinned" }, { x: L, type: "pinned" }],
    loads: [{ kind: "point", P: P, x: L/2 }],
    nElemPerSpan: 30,
    EI: EI
  });

  const expectedRv = P / 2;
  const expectedMmid = P * L / 4;
  const expectedWmid = P * Math.pow(L, 3) / (48 * EI);

  allPass &= approx(sol.reactions[0].Rv, expectedRv, 1e-2, "R_A");
  allPass &= approx(sol.reactions[1].Rv, expectedRv, 1e-2, "R_B");

  // Find max M
  let Mmax = 0, wmax = 0;
  for (let i = 0; i < sol.sample.M.length; i++) {
    if (sol.sample.M[i] > Mmax) Mmax = sol.sample.M[i];
    if (sol.sample.w[i] > wmax) wmax = sol.sample.w[i];
  }
  allPass &= approx(Mmax, expectedMmid, 1e-2, "M_max");
  allPass &= approx(wmax, expectedWmid, 1e-3, "w_max");
}

/* ----- Test 5: SSB with partial UDL ----- */
console.log("\n=== Test 5: SSB with partial UDL (q over half) ===");
{
  const L = 6.0;
  const q = 10e3;
  const a = L / 2;
  const EI = 1.0e7;

  const sol = FEM.solve({
    spans: [L],
    supports: [{ x: 0, type: "pinned" }, { x: L, type: "pinned" }],
    loads: [{ kind: "line", q1: q, q2: q, x1: 0, x2: a }],
    nElemPerSpan: 40,
    EI: EI
  });

  // Expected: q applied over [0, L/2]
  //   R_A = q*a*(L - a/2)/L = q*(L/2)*(L - L/4)/L = (q/2)*(3L/4) = 3qL/8
  //   R_B = q*a*(a/2)/L = q*(L/2)*(L/4)/L = qL/8
  const expectedRA = 3 * q * L / 8;
  const expectedRB = q * L / 8;
  allPass &= approx(sol.reactions[0].Rv, expectedRA, 1e-2, "R_A (partial UDL)");
  allPass &= approx(sol.reactions[1].Rv, expectedRB, 1e-2, "R_B (partial UDL)");
}

/* ----- Test 6: SSB with vertical spring support at one end ----- */
console.log("\n=== Test 6: SSB with vertical spring support ===");
{
  const L = 6.0;
  const q = 10e3;
  const EI = 1.0e7;
  const Kv = 1e10;  // very stiff -> should behave like pinned

  const sol = FEM.solve({
    spans: [L],
    supports: [
      { x: 0, type: "pinned" },
      { x: L, type: "spring", Kv: Kv, Kphi: 0 }
    ],
    loads: [{ kind: "line", q1: q, q2: q, x1: 0, x2: L }],
    nElemPerSpan: 30,
    EI: EI
  });

  // In the limit of stiff spring, behave like SSB
  allPass &= approx(sol.reactions[0].Rv, q * L / 2, 1e-2, "R_A (stiff spring)");
  allPass &= approx(sol.reactions[1].Rv, q * L / 2, 1e-2, "R_B (stiff spring)");
}

console.log("\n=== " + (allPass ? "ALL PASS" : "SOME FAILED") + " ===");
process.exit(allPass ? 0 : 1);
