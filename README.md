# Statik-Berechnungstool — Durchlaufträger nach SIA 265

Ein browserbasiertes Statik-Tool für die Berechnung von Durchlaufträgern (1 bis 8 Felder)
mit Nachweisen nach **SIA 265:2021 (Holzbau)** bzw. vereinfacht nach SIA 263 (Stahl).
Vollständig clientseitig, kein Backend nötig — direkt als GitHub-Page / Vercel-Site nutzbar.

> Live-Demo: nach Aktivierung der GitHub Pages verfügbar unter
> `https://<owner>.github.io/static-berechnungstool-fadrim/`

## Funktionalitäten

- **System**: 1 bis 8 Felder, beliebige Spannweiten
- **Auflager**: Fest (Einspannung), Gelenkig, Rollen, **Federauflager** (vertikal `K_v` und/oder Drehfeder `K_φ`), prescr. Senkungen
- **Lasten**: Linienlasten (konstant oder trapezförmig), Punktlasten, applizierte Momente — beliebig viele
- **Lastkombinationen**: γ_G / γ_Q nach SIA 260, ψ-Faktoren für GZG (quasi-ständig)
- **Material**: SIA-265-Datenbank (C16–C40 Vollholz, GL20h–GL32h BSH, GL24c/GL28c) sowie S235/S355
- **Querschnitte**: Rechteck, Kreis, IPE/HEA/HEB-Stahlprofile (Datenbank), benutzerdefiniert (A, I, W)
- **FEM-Solver**: Euler-Bernoulli-Balken, Hermite-Element (cubic), Gauss-Elimination mit Pivotierung
- **Diagramme**: Statisches System & Lastskizze, M(x), V(x), Biegelinie w(x)
- **Nachweise**:
  - Biegung: σ_m,d / f_m,d ≤ 1 (SIA 265 Art. 4.2)
  - Schub: τ_d / f_v,d ≤ 1 (SIA 265 Art. 4.5)
  - Verformung: w_fin = w_inst·(1+k_def) ≤ L/300 (anpassbar)
- **PDF-Export**: vollständiger Prüfbericht mit Eingaben, Diagrammen, Formeln und detailliertem Rechnungsweg

## Architektur

```
index.html              UI
styles.css              Stylesheet
js/linalg.js            Lineare Algebra (Matrix, Gauss-Solver)
js/materials.js         Materialwerte SIA 265 + Stahl
js/sections.js          Querschnittswerte (Rechteck/Kreis/IPE/HEA/HEB/custom)
js/fem.js               FEM-Solver (Hermite-Element, K-Aufbau, Lösung)
js/sia265.js            SIA-265-Nachweise (Biegung, Schub, Verformung)
js/charts.js            SVG-Diagramme (System, M, V, w)
js/pdf-export.js        PDF-Generierung mit jsPDF
js/app.js               UI-Steuerung & Berechnungs-Orchestrierung
```

Externe Bibliotheken (per CDN):
- [jsPDF 2.5.1](https://github.com/parallax/jsPDF) — PDF-Generierung
- [html2canvas 1.4.1](https://github.com/niklasvh/html2canvas) — Diagramm-Rasterisierung

## Nutzung

1. `index.html` im Browser öffnen (oder GitHub-Pages-URL).
2. Anzahl Felder & Spannweiten einstellen.
3. Auflagertyp pro Stütze wählen (Feder mit Steifigkeit möglich).
4. Material + Querschnitt definieren.
5. Lasten hinzufügen (Linie / Punkt / Moment) mit γ_F und ψ.
6. Auf **Berechnen** klicken — Resultate erscheinen rechts.
7. Auf **PDF Export** klicken für den vollständigen Prüfbericht.

## Verifikation

Die Software ist verifiziert gegen analytische Lösungen:

- **Einfeldträger SSB unter Gleichlast q**: M_max = q·L²/8, V_max = q·L/2, w_max = 5qL⁴/(384EI)
- **Zweifeldträger unter Gleichlast q**: R_mitte = 5qL/4, M_stütze = −qL²/8, M_feld = 9qL²/128

Diese Vergleichswerte erscheinen im PDF-Bericht als Eigenkontrollpunkt.

## Bezug auf SIA-Normen

- **SIA 260**: Lastkombinationen, γ-Beiwerte, Verformungsanforderungen
- **SIA 261**: Lastansätze (Eigengewicht, Nutzlast, Schnee, Wind) — vom Anwender einzugeben
- **SIA 265**: Holzbau-Bemessung (charakteristische Werte, k_mod, k_def, γ_M)

**Hinweis zur Haftung**: Die Software ist ein Werkzeug. Die Verantwortung für korrekte Eingabe,
Modellbildung und Plausibilitätsprüfung der Resultate liegt beim Anwender (Tragwerksplaner:in).
Resultate sind vor baulicher Umsetzung manuell zu prüfen.

## Lokal entwickeln

Keine Build-Schritte erforderlich — reines HTML/JS:

```bash
# Einfacher lokaler Server (Python)
python3 -m http.server 8000
# oder mit Node.js
npx serve .
```

Dann `http://localhost:8000` aufrufen.

## Deployment

### GitHub Pages
Workflow ist in `.github/workflows/deploy-pages.yml` konfiguriert. Aktivieren:
1. Repository → Settings → Pages
2. Source: "GitHub Actions"
3. Push auf `main` triggert das Deployment automatisch.

### Vercel
1. Repository auf [vercel.com](https://vercel.com) importieren.
2. Framework Preset: "Other" (statische Site).
3. Build Command leer lassen, Output Directory `.`.
4. Deployen.

## Lizenz

MIT — siehe `LICENSE`. Verwendung auf eigene Verantwortung.
