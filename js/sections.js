/* ============================================================
 * sections.js - Cross section properties
 * ============================================================
 * Provides A [mm^2], I_y [mm^4], W_y [mm^3], h [mm], b [mm]
 * for given shapes / standard profiles.
 *
 * Public:
 *   Sections.rect(b, h)                -> {A, I, W, h, b, type}
 *   Sections.circle(d)                 -> {A, I, W, h, b, type}
 *   Sections.profile(name)             -> standard steel profile
 *   Sections.computeShear(section)     -> A_v (effective shear area)
 * ============================================================ */
(function (global) {
  "use strict";

  function rect(b, h) {
    var A = b * h;
    var I = (b * Math.pow(h, 3)) / 12;
    var W = (b * h * h) / 6;
    var Av = (5 / 6) * A; // shear area factor for rectangular: kappa = 5/6
    return { type: "rect", b: b, h: h, A: A, I: I, W: W, Av: Av, label: "Rechteck " + b + "x" + h + " mm" };
  }

  function circle(d) {
    var A = Math.PI * d * d / 4;
    var I = Math.PI * Math.pow(d, 4) / 64;
    var W = Math.PI * Math.pow(d, 3) / 32;
    var Av = 0.9 * A;
    return { type: "circle", d: d, h: d, b: d, A: A, I: I, W: W, Av: Av, label: "Kreis d=" + d + " mm" };
  }

  /* Standard European steel profiles (IPE, HEA, HEB)
   * Values in: h[mm], b[mm], tw[mm], tf[mm], A[mm2], I[mm4], W[mm3], Av[mm2]
   * Source: Eurocode steel tables / SZS C5.
   */
  var IPE = {
    "IPE 100": {h:100, b:55, tw:4.1, tf:5.7, A:1032, I:1710000, W:34200, Av:508},
    "IPE 120": {h:120, b:64, tw:4.4, tf:6.3, A:1321, I:3180000, W:53000, Av:629},
    "IPE 140": {h:140, b:73, tw:4.7, tf:6.9, A:1643, I:5410000, W:77300, Av:763},
    "IPE 160": {h:160, b:82, tw:5.0, tf:7.4, A:2009, I:8690000, W:108700, Av:912},
    "IPE 180": {h:180, b:91, tw:5.3, tf:8.0, A:2395, I:13170000, W:146300, Av:1063},
    "IPE 200": {h:200, b:100, tw:5.6, tf:8.5, A:2848, I:19430000, W:194300, Av:1401},
    "IPE 220": {h:220, b:110, tw:5.9, tf:9.2, A:3337, I:27720000, W:252000, Av:1591},
    "IPE 240": {h:240, b:120, tw:6.2, tf:9.8, A:3912, I:38920000, W:324300, Av:1909},
    "IPE 270": {h:270, b:135, tw:6.6, tf:10.2, A:4595, I:57900000, W:428900, Av:2214},
    "IPE 300": {h:300, b:150, tw:7.1, tf:10.7, A:5381, I:83560000, W:557100, Av:2568},
    "IPE 330": {h:330, b:160, tw:7.5, tf:11.5, A:6261, I:117700000, W:713100, Av:3081},
    "IPE 360": {h:360, b:170, tw:8.0, tf:12.7, A:7273, I:162700000, W:903600, Av:3514},
    "IPE 400": {h:400, b:180, tw:8.6, tf:13.5, A:8446, I:231300000, W:1156000, Av:4269},
    "IPE 450": {h:450, b:190, tw:9.4, tf:14.6, A:9882, I:337400000, W:1500000, Av:5085},
    "IPE 500": {h:500, b:200, tw:10.2, tf:16.0, A:11550, I:482000000, W:1928000, Av:5987},
    "IPE 550": {h:550, b:210, tw:11.1, tf:17.2, A:13440, I:671200000, W:2441000, Av:7234},
    "IPE 600": {h:600, b:220, tw:12.0, tf:19.0, A:15600, I:920800000, W:3069000, Av:8378}
  };

  var HEA = {
    "HEA 100": {h:96, b:100, tw:5.0, tf:8.0, A:2124, I:3492000, W:72760, Av:733},
    "HEA 120": {h:114, b:120, tw:5.0, tf:8.0, A:2534, I:6062000, W:106400, Av:889},
    "HEA 140": {h:133, b:140, tw:5.5, tf:8.5, A:3142, I:10330000, W:155400, Av:1031},
    "HEA 160": {h:152, b:160, tw:6.0, tf:9.0, A:3877, I:16730000, W:220100, Av:1321},
    "HEA 180": {h:171, b:180, tw:6.0, tf:9.5, A:4525, I:25100000, W:293600, Av:1453},
    "HEA 200": {h:190, b:200, tw:6.5, tf:10.0, A:5383, I:36920000, W:388600, Av:1809},
    "HEA 220": {h:210, b:220, tw:7.0, tf:11.0, A:6434, I:54100000, W:515200, Av:2074},
    "HEA 240": {h:230, b:240, tw:7.5, tf:12.0, A:7684, I:77630000, W:675100, Av:2515},
    "HEA 260": {h:250, b:260, tw:7.5, tf:12.5, A:8682, I:104500000, W:836400, Av:2828},
    "HEA 280": {h:270, b:280, tw:8.0, tf:13.0, A:9726, I:136700000, W:1013000, Av:3151},
    "HEA 300": {h:290, b:300, tw:8.5, tf:14.0, A:11250, I:182600000, W:1260000, Av:3724},
    "HEA 320": {h:310, b:300, tw:9.0, tf:15.5, A:12440, I:229300000, W:1479000, Av:4138},
    "HEA 340": {h:330, b:300, tw:9.5, tf:16.5, A:13350, I:276900000, W:1678000, Av:4495},
    "HEA 360": {h:350, b:300, tw:10.0, tf:17.5, A:14280, I:330900000, W:1891000, Av:4860},
    "HEA 400": {h:390, b:300, tw:11.0, tf:19.0, A:15900, I:450700000, W:2311000, Av:5740},
    "HEA 450": {h:440, b:300, tw:11.5, tf:21.0, A:17800, I:637200000, W:2896000, Av:6543},
    "HEA 500": {h:490, b:300, tw:12.0, tf:23.0, A:19750, I:869700000, W:3550000, Av:7430},
    "HEA 550": {h:540, b:300, tw:12.5, tf:24.0, A:21180, I:1119000000, W:4146000, Av:8262},
    "HEA 600": {h:590, b:300, tw:13.0, tf:25.0, A:22650, I:1412000000, W:4787000, Av:9106}
  };

  var HEB = {
    "HEB 100": {h:100, b:100, tw:6.0, tf:10.0, A:2604, I:4495000, W:89910, Av:903},
    "HEB 120": {h:120, b:120, tw:6.5, tf:11.0, A:3401, I:8644000, W:144070, Av:1097},
    "HEB 140": {h:140, b:140, tw:7.0, tf:12.0, A:4296, I:15090000, W:215600, Av:1306},
    "HEB 160": {h:160, b:160, tw:8.0, tf:13.0, A:5425, I:24920000, W:311500, Av:1738},
    "HEB 180": {h:180, b:180, tw:8.5, tf:14.0, A:6525, I:38310000, W:425700, Av:2024},
    "HEB 200": {h:200, b:200, tw:9.0, tf:15.0, A:7808, I:56960000, W:569600, Av:2400},
    "HEB 220": {h:220, b:220, tw:9.5, tf:16.0, A:9104, I:80910000, W:735500, Av:2789},
    "HEB 240": {h:240, b:240, tw:10.0, tf:17.0, A:10600, I:112600000, W:938300, Av:3324},
    "HEB 260": {h:260, b:260, tw:10.0, tf:17.5, A:11840, I:149200000, W:1148000, Av:3753},
    "HEB 280": {h:280, b:280, tw:10.5, tf:18.0, A:13140, I:192700000, W:1376000, Av:4185},
    "HEB 300": {h:300, b:300, tw:11.0, tf:19.0, A:14910, I:251700000, W:1678000, Av:4747},
    "HEB 320": {h:320, b:300, tw:11.5, tf:20.5, A:16130, I:308600000, W:1929000, Av:5151},
    "HEB 340": {h:340, b:300, tw:12.0, tf:21.5, A:17090, I:366600000, W:2156000, Av:5523},
    "HEB 360": {h:360, b:300, tw:12.5, tf:22.5, A:18060, I:431900000, W:2400000, Av:5904},
    "HEB 400": {h:400, b:300, tw:13.5, tf:24.0, A:19780, I:576800000, W:2884000, Av:6996},
    "HEB 450": {h:450, b:300, tw:14.0, tf:26.0, A:21800, I:798900000, W:3551000, Av:7977},
    "HEB 500": {h:500, b:300, tw:14.5, tf:28.0, A:23860, I:1072000000, W:4287000, Av:8979},
    "HEB 550": {h:550, b:300, tw:15.0, tf:29.0, A:25410, I:1367000000, W:4971000, Av:9882},
    "HEB 600": {h:600, b:300, tw:15.5, tf:30.0, A:27000, I:1710000000, W:5701000, Av:10820}
  };

  function profile(family, name) {
    var p;
    if (family === "IPE") p = IPE[name];
    else if (family === "HEA") p = HEA[name];
    else if (family === "HEB") p = HEB[name];
    if (!p) return null;
    return Object.assign({ type: family, label: name }, p);
  }

  function listProfiles(family) {
    if (family === "IPE") return Object.keys(IPE);
    if (family === "HEA") return Object.keys(HEA);
    if (family === "HEB") return Object.keys(HEB);
    return [];
  }

  function custom(A, I, W, h) {
    var Av = h ? (5 / 6) * A : A;
    return { type: "custom", A: A, I: I, W: W, h: h || 0, b: 0, Av: Av, label: "benutzerdef." };
  }

  global.Sections = {
    rect: rect, circle: circle, profile: profile,
    custom: custom, listProfiles: listProfiles,
    IPE: IPE, HEA: HEA, HEB: HEB
  };
})(typeof window !== "undefined" ? window : globalThis);
