# Play Trump Doom (easy share)

## One-click (best for friends)

**Live game:** https://redpanda313.github.io/trump-doom/

1. Open the link in Chrome, Firefox, Safari, or Edge  
2. Click **NEW GAME** (or **CONTINUE** if they already played on that browser)  
3. Click the game once to lock the mouse, then play  

No install. No Node. No download.

> First deploy: after you enable GitHub Pages (Settings → Pages → Source: **GitHub Actions**), the link goes live within a minute of pushing to `main`.

---

## Play on your machine (developers)

```bash
git clone https://github.com/redpanda313/trump-doom.git
cd trump-doom
npm install
npm run dev
```

Open **http://localhost:5180**

---

## Share a ZIP (offline / no GitHub Pages)

```bash
npm run build
# zip the dist folder and send it
```

Friend unzip, then either:

```bash
npx --yes serve dist
```

…or open the folder in VS Code / any static server.  
**Note:** Double-clicking `index.html` may not work (browsers block ES modules on `file://`). Use a tiny local server.

---

## Controls (quick)

| Action | Key |
|--------|-----|
| Move / look | WASD + mouse |
| Dash | Double-tap direction + hold |
| Fire | LMB / Space |
| Weapons | 1–7 |
| Bomb / Freeze / Repel | F / C / V |
| Shop / interact | E |
| Pause / volume | Esc |
