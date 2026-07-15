# Trump Doom: The Road to the Oval

**A Doom-inspired browser FPS where young Donald Trump fights satire-spawned chaos with pure rhetoric.**

Weapons are debates, framing, logic, and mic drops — not bullets. Enemies are cartoon archetypes (Karens, Woke Mobs, Autopen, Election Fraud, Rogue Judges). Read story plaques on the walls. Upgrade your argument. Claim the Oval.

> **Satire disclaimer:** Arcade political comedy. Non-violent “argument combat.” Exaggerated caricatures only.

---

## Status

**Phase:** Design + project scaffold  
**Design doc:** [`docs/GAME_DESIGN_DOCUMENT.md`](docs/GAME_DESIGN_DOCUMENT.md)

| Milestone | Description |
|-----------|-------------|
| M0 | Repo, GDD, playable shell |
| M1 | Vertical slice (1 map, 2 weapons, Karen, plaques) |
| M2+ | Full episodes, bosses, progression |

---

## Play (when built)

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).

---

## Tech

- **TypeScript** + **Vite**
- Browser WebGL / Canvas FPS (Three.js candidate for speed)
- Static deploy (GitHub Pages-ready)

---

## Project layout

```
trump-doom/
  docs/                 # Game design document & lore
  public/               # Static shell
  src/
    engine/             # Renderer, input, collision, maps
    game/               # Weapons, enemies, progression, UI
    assets/             # Sprites, audio, map data
  tools/                # Asset & map helpers
```

---

## Art pipeline

Hybrid approach:

1. **In-engine** geometry, VFX, animations for creatures and attacks  
2. **Imagine-generated** micro-sprites / icons with removable backgrounds for pickups, UI stamps, title flair  

See GDD §10 for palette and style rules.

---

## Controls (planned)

| Action | Default |
|--------|---------|
| Move / look | WASD + mouse |
| Fire / alt-fire | LMB / RMB |
| Interact (plaques) | E |
| Weapons | 1–8 / scroll |
| Pause | Esc |

---

## Contributing / vision

This project is driven by a locked design doc. Open questions for the creator are tracked in the GDD and answered in discussion / issues before major content branches.

---

## License

TBD — all rights reserved until declared.

---

*Make arguments great again.*
