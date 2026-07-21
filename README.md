# Heliophile — website

A standalone, bilingual (FR/EN) marketing site for **Heliophile**, an independent
French renewable-energy producer (photovoltaic + battery storage / BESS).

This is a real, framework-free implementation of the Claude Design prototype
`Heliophile.dc.html` (project `f7e7f2af-…`). All the design-tool constructs
(`<x-dc>`, `sc-if`, `sc-for`, `x-import`, `{{templating}}`, the `DCLogic` script)
have been ported to plain HTML / CSS / JS.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure. Both languages live in the DOM; `data-lang="fr\|en"` spans are toggled with a body class. |
| `styles.css` | All styling. The accent colour and other tokens are CSS custom properties on `:root`. |
| `app.js` | Language switch (persisted to `localStorage`), the animated hero "flux" grid, the peak-shaving chart, accent-contrast calc, and the mobile menu. |
| `uploads/hero.jpg` | Hero photo (downloaded from the original Unsplash source in the prototype). |

## Run it

```bash
python3 -m http.server 8000 --directory .
# then open http://localhost:8000
```
(It's fully static — any web server or host works.)

## Theming

Change one line in `styles.css` to re-theme the whole site:

```css
:root { --accent: #E2930E; }   /* amber (default) · #1E9E63 green · #2F5FE0 blue */
```

`app.js` recomputes the readable text colour on the accent automatically.

## Hero variant

The `<header class="hero" data-hero="photo">` element supports two looks:

- `data-hero="photo"` (default) — the real photograph.
- `data-hero="abstract"` — the animated "HELIOPHILE / FLUX" energy grid (no image needed).

## Images

The real project photos from the design project are included in `uploads/`:

| File | Used for |
|------|----------|
| `hero.jpg` / `hero.avif` | Hero photo |
| `fursac.jpg` | Fursac project card |
| `loudeac.jpg` | Loudéac project card |
| `guegon.jpg` | Guégon project card |
| `bess.jpg` | BESS storage section |

(The project photos were exported from the design project at full resolution and
downscaled to ~1400px / JPEG for the web — the whole `uploads/` folder is ~1.5 MB.)

The only remaining placeholder is the **founder portrait** — it renders the "PP"
monogram for Philippe Perrette, since the prototype had no portrait uploaded. To add
one, drop the file in `uploads/` and replace the `<div class="slot__mono">PP</div>`
inside the `.founder__avatar` slot in `index.html` with `<img src="uploads/…" alt="…">`.

Any image slot uses the same pattern: a `<div class="slot">` wrapping either an
`<img>` or an on-brand `<div class="slot__ph">` placeholder.

The logo is an inline SVG wordmark (sun mark + "Heliophile" in Space Grotesk) so it
stays crisp and re-themes with the accent; swap it for the official logo if there is one.
