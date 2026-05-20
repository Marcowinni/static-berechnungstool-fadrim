/* ============================================================
 * materials.js - Material database
 * ============================================================
 * Characteristic values per SIA 265:2021 (Holzbau)
 * and SIA 263 (Stahlbau, simplified).
 *
 * Units in DB:
 *   fm.k, fv.k, ft0.k, fc0.k    in [N/mm^2] = [MPa]
 *   E0.mean, E0.05, G.mean       in [N/mm^2] = [MPa]
 *   rho.k                        in [kg/m^3]
 *
 * Application of k_mod and gamma_M follows SIA 265 art. 4.2.
 * ============================================================ */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------
   * Vollholz Nadelholz (Solid timber, softwood) - SIA 265 Tab.1
   * Source values consistent with EN 338, adopted in SIA 265.
   * ------------------------------------------------------------ */
  var SOFTWOOD = {
    "C16": { fm_k:16, ft0_k:10, fc0_k:17, fv_k:3.2, E0_mean:8000,  E0_05:5400, Gmean:500,  rho_k:310, type:"VH" },
    "C20": { fm_k:20, ft0_k:12, fc0_k:19, fv_k:3.6, E0_mean:9500,  E0_05:6400, Gmean:590,  rho_k:330, type:"VH" },
    "C24": { fm_k:24, ft0_k:14, fc0_k:21, fv_k:4.0, E0_mean:11000, E0_05:7400, Gmean:690,  rho_k:350, type:"VH" },
    "C30": { fm_k:30, ft0_k:18, fc0_k:23, fv_k:4.0, E0_mean:12000, E0_05:8000, Gmean:750,  rho_k:380, type:"VH" },
    "C35": { fm_k:35, ft0_k:21, fc0_k:25, fv_k:4.0, E0_mean:13000, E0_05:8700, Gmean:810,  rho_k:400, type:"VH" },
    "C40": { fm_k:40, ft0_k:24, fc0_k:26, fv_k:4.0, E0_mean:14000, E0_05:9400, Gmean:880,  rho_k:420, type:"VH" }
  };

  /* ------------------------------------------------------------
   * Brettschichtholz homogen (GL...h) und kombiniert (GL...c)
   * Werte gemaess SIA 265 / EN 14080
   * ------------------------------------------------------------ */
  var GLULAM = {
    "GL20h": { fm_k:20, ft0_k:16, fc0_k:20, fv_k:3.5, E0_mean:8400,  E0_05:7000, Gmean:650, rho_k:340, type:"BSH" },
    "GL22h": { fm_k:22, ft0_k:17.6,fc0_k:22, fv_k:3.5, E0_mean:10500, E0_05:8800, Gmean:650, rho_k:370, type:"BSH" },
    "GL24h": { fm_k:24, ft0_k:19.2,fc0_k:24, fv_k:3.5, E0_mean:11500, E0_05:9600, Gmean:650, rho_k:385, type:"BSH" },
    "GL26h": { fm_k:26, ft0_k:20.8,fc0_k:26, fv_k:3.5, E0_mean:12100, E0_05:10100,Gmean:650, rho_k:405, type:"BSH" },
    "GL28h": { fm_k:28, ft0_k:22.3,fc0_k:28, fv_k:3.5, E0_mean:12600, E0_05:10500,Gmean:650, rho_k:425, type:"BSH" },
    "GL30h": { fm_k:30, ft0_k:24.0,fc0_k:30, fv_k:3.5, E0_mean:13600, E0_05:11300,Gmean:650, rho_k:430, type:"BSH" },
    "GL32h": { fm_k:32, ft0_k:25.6,fc0_k:32, fv_k:3.5, E0_mean:14200, E0_05:11800,Gmean:650, rho_k:440, type:"BSH" },
    "GL24c": { fm_k:24, ft0_k:17.0,fc0_k:21.5,fv_k:3.5, E0_mean:11000, E0_05:9100, Gmean:650, rho_k:365, type:"BSH" },
    "GL28c": { fm_k:28, ft0_k:19.5,fc0_k:24.0,fv_k:3.5, E0_mean:12500, E0_05:10400,Gmean:650, rho_k:390, type:"BSH" }
  };

  /* ------------------------------------------------------------
   * Stahl (vereinfacht nach SIA 263)
   * ------------------------------------------------------------ */
  var STEEL = {
    "S235": { fy_k:235, fu_k:360, E:210000, G:81000, rho_k:7850, type:"STAHL", fm_k:235, fv_k:135.7, E0_mean:210000, Gmean:81000 },
    "S355": { fy_k:355, fu_k:510, E:210000, G:81000, rho_k:7850, type:"STAHL", fm_k:355, fv_k:205.0, E0_mean:210000, Gmean:81000 }
  };

  /* ------------------------------------------------------------
   * k_mod nach SIA 265 Tab. 2 (klimaklasse x lasteinwirkungsdauer)
   * Werte fuer Vollholz, BSH (gleich):
   * ------------------------------------------------------------ */
  var KMOD = {
    "1": { permanent:0.60, long:0.70, medium:0.80, short:0.90, instant:1.10 },
    "2": { permanent:0.60, long:0.70, medium:0.80, short:0.90, instant:1.10 },
    "3": { permanent:0.50, long:0.55, medium:0.65, short:0.70, instant:0.90 }
  };

  /* ------------------------------------------------------------
   * k_def (Kriechfaktor) nach SIA 265 Tab. 3
   * ------------------------------------------------------------ */
  var KDEF = {
    "VH":   { "1":0.60, "2":0.80, "3":2.00 },
    "BSH":  { "1":0.60, "2":0.80, "3":2.00 },
    "STAHL":{ "1":0.00, "2":0.00, "3":0.00 }
  };

  /* ------------------------------------------------------------
   * Lookup function
   * ------------------------------------------------------------ */
  function get(name) {
    if (SOFTWOOD[name]) return Object.assign({ name: name }, SOFTWOOD[name]);
    if (GLULAM[name])   return Object.assign({ name: name }, GLULAM[name]);
    if (STEEL[name])    return Object.assign({ name: name }, STEEL[name]);
    throw new Error("Unbekanntes Material: " + name);
  }

  function kmod(serviceClass, loadDuration) {
    return KMOD[String(serviceClass)][loadDuration];
  }
  function kdef(type, serviceClass) {
    return KDEF[type][String(serviceClass)];
  }

  global.Materials = {
    get: get,
    kmod: kmod,
    kdef: kdef,
    SOFTWOOD: SOFTWOOD,
    GLULAM: GLULAM,
    STEEL: STEEL,
    KMOD: KMOD,
    KDEF: KDEF
  };
})(typeof window !== "undefined" ? window : globalThis);
