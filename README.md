# Trump Doom: The Road to the Oval

**A Doom-inspired browser FPS where young Donald Trump fights satire-spawned chaos with pure rhetoric.**

Weapons are debates, framing, logic, and mic drops — not bullets. Enemies are cartoon archetypes (Karens, Woke Mobs, Autopen, Election Fraud, Rogue Judges). Read story plaques on the walls. Upgrade your argument. Claim the Oval.

> **Satire disclaimer:** Arcade political comedy. Non-violent “argument combat.” Exaggerated caricatures only.

---

## Status

**Phase:** M1 vertical slice (playable)  
**Vision lock:** [`docs/VISION_LOCK.md`](docs/VISION_LOCK.md)  
**Design doc:** [`docs/GAME_DESIGN_DOCUMENT.md`](docs/GAME_DESIGN_DOCUMENT.md)

| Milestone | Description |
|-----------|-------------|
| M0 | Repo, GDD, shell |
| **M1** | Ep 0 vertical slice |
| **Campaign** | **Ep 0–7 full path · multi-track music · 6 endings · death ladder** |

### Vision (locked)
- **Tone:** Mythic self-legend (Doomguy of destiny)
- **Tech:** Classic 2.5D raycaster
- **Art:** Hybrid in-engine + Imagine stamps
- **Hero:** Always adult Legend Donald (childhood = plaques only)
- **Defeat:** Zero blood — **JOINED THE TRUMP-TRAIN!**
- **Audio:** Synth rock (procedural for now)
- **Wishlist:** Leaderboard, local co-op, local vs

---

## Play (when built)

```bash
cd ~/trump-doom
npm install
npm run dev
```

Open the URL Vite prints — **http://localhost:5180** (not 5173; that port is often used by other projects).

If you see a blank white page on 5173, you are almost certainly hitting a *different* app. Use **5180** for Trump Doom.

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
| **Dash** | Double-tap W/A/S/D, then hold |
| Fire / alt-fire | LMB / RMB |
| Interact (plaques) | E |
| Weapons | 1–2 (more later) |
| **Pause / volumes** | Esc or Tab |

---

## Contributing / vision

This project is driven by a locked design doc. Open questions for the creator are tracked in the GDD and answered in discussion / issues before major content branches.

---

## License

TBD — all rights reserved until declared.

---

*Make arguments great again.*
