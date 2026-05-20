/* ============================================================
 * linalg.js - Linear algebra utilities for FEM
 * ============================================================
 * Provides: matrix construction, addition, LU/Gauss solve.
 * All matrices are stored as flat Float64Array (row-major).
 * ============================================================ */
(function (global) {
  "use strict";

  /** Create a zero-filled dense matrix as Float64Array of length n*m. */
  function zeros(n, m) {
    if (m === undefined) m = n;
    return new Float64Array(n * m);
  }

  /** Add a small (block) matrix into a global matrix at given DOF indices. */
  function assemble(K, n, ke, dofs) {
    var k = dofs.length;
    for (var i = 0; i < k; i++) {
      var gi = dofs[i];
      for (var j = 0; j < k; j++) {
        var gj = dofs[j];
        K[gi * n + gj] += ke[i * k + j];
      }
    }
  }

  /** Add a vector value f into global F at dof index. */
  function assembleF(F, fe, dofs) {
    for (var i = 0; i < dofs.length; i++) F[dofs[i]] += fe[i];
  }

  /**
   * Solve K * x = b using Gauss elimination with partial pivoting.
   * K is mutated. Returns x as Float64Array of length n.
   * Throws if singular.
   */
  function solve(K, b, n) {
    var A = new Float64Array(n * (n + 1));
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) A[i * (n + 1) + j] = K[i * n + j];
      A[i * (n + 1) + n] = b[i];
    }
    // Forward elimination with partial pivoting
    for (var col = 0; col < n; col++) {
      var maxRow = col;
      var maxVal = Math.abs(A[col * (n + 1) + col]);
      for (var r = col + 1; r < n; r++) {
        var v = Math.abs(A[r * (n + 1) + col]);
        if (v > maxVal) { maxVal = v; maxRow = r; }
      }
      if (maxVal < 1e-14) {
        throw new Error("Singulaere Steifigkeitsmatrix - System unterbestimmt (fehlende Auflager?)");
      }
      if (maxRow !== col) {
        for (var k = col; k <= n; k++) {
          var tmp = A[col * (n + 1) + k];
          A[col * (n + 1) + k] = A[maxRow * (n + 1) + k];
          A[maxRow * (n + 1) + k] = tmp;
        }
      }
      var piv = A[col * (n + 1) + col];
      for (var rr = col + 1; rr < n; rr++) {
        var f = A[rr * (n + 1) + col] / piv;
        if (f === 0) continue;
        for (var cc = col; cc <= n; cc++) {
          A[rr * (n + 1) + cc] -= f * A[col * (n + 1) + cc];
        }
      }
    }
    // Back substitution
    var x = new Float64Array(n);
    for (var i2 = n - 1; i2 >= 0; i2--) {
      var s = A[i2 * (n + 1) + n];
      for (var j2 = i2 + 1; j2 < n; j2++) {
        s -= A[i2 * (n + 1) + j2] * x[j2];
      }
      x[i2] = s / A[i2 * (n + 1) + i2];
    }
    return x;
  }

  /**
   * Multiply matrix K (n*n) by vector x (n) -> vector y (n).
   * Useful to compute reactions K*u (without applied loads contribution).
   */
  function matvec(K, x, n) {
    var y = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var s = 0;
      for (var j = 0; j < n; j++) s += K[i * n + j] * x[j];
      y[i] = s;
    }
    return y;
  }

  global.LinAlg = { zeros: zeros, assemble: assemble, assembleF: assembleF, solve: solve, matvec: matvec };
})(typeof window !== "undefined" ? window : globalThis);
