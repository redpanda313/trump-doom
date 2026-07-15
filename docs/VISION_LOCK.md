# Vision Lock — Confirmed by Creator

**Date:** 2026-07-15  
**Status:** LOCKED for M0→M1 implementation  

Decisions below override earlier draft ambiguity in the GDD.

---

## 1. Tone — **Mythic Self-Legend** (C)

Trump is **Doomguy of destiny**. Politics is **dungeon flavor**, not a lecture.

- Arcade myth first; partisan spice secondary  
- Enemies = carnival masks / Narrative Demons, not real demographic targeting  
- Boastful, golden, destiny-forward writing  
- Dial target: **9/10 mythic arcade · 5/10 meme spice · 3/10 topical rage**

## 2. Tech — **Classic Doom Raycaster** (A)

- **2.5D raycasting** (Wolfenstein / early Doom DNA)  
- Low-res or crisp canvas scale; pixel-friendly  
- Grid maps, textured walls, billboard sprites  
- No full 3D mesh world for v1  

## 3. Art — **Hybrid** (C)

- Environments, VFX, creature animation: **in-engine**  
- Icons, stamps, title flair, some enemy portraits: **Imagine** (removable BG)  

## 4. Protagonist — **Always Adult Legend** (C)

Like classical art that paints the holy child as a small man: **Donald is always the suited figure of destiny**.

- FPS arms: red tie, gold cuff, adult hands  
- Childhood exists only in **plaques / lore codex**  
- No age-up transformation pipeline for v1  
- Optional cosmetics later (Builder hard-hat, etc.) — same adult body  

## 5. Defeat Language — **Trump-Train Conversion** (zero blood)

| Forbidden | Required fantasy |
|-----------|------------------|
| Blood, gore, guns, corpses | Enemies **join the Trump-Train** |
| Lethal framing | Debunked → converted → confetti / hat / headline poof |

**On enemy defeat:**
- VFX: red-hat confetti, gold sparkles, mini train whistle (audio)
- Floater text: **“JOINED THE TRUMP-TRAIN!”** (variants OK)
- Body removed; optional tiny MAGA hat pickup crumb

## 6. Scope — **Vertical Slice First** (A)

**M1 deliverable:** Ep 0 (Basement) playable end-to-end  
Then expand Ep 1 → full campaign.

## 7. Wishlist (post-campaign / M6+)

| Feature | Priority |
|---------|----------|
| Online leaderboard (time / plaques / conversions) | Wishlist |
| Local co-op (same machine) | Wishlist |
| Local vs (duel / arena) | Wishlist |

Do **not** block campaign on these. Design hooks: score events, split-input architecture notes.

## 8. Repo

**Public** — `https://github.com/redpanda313/trump-doom`

## 9. Audio — **Synth Rock**

- Combat: driving synth-rock loops (stadium + neon)  
- Hits: mic feedback, gavel thuds, train whistle on conversion  
- Boss themes: heavier synth + court/stadium hybrids later  
- Placeholder: Web Audio procedural synth until licensed/custom tracks  

## 10. Content Boundaries

- No hard must-includes beyond locked design  
- No hard bans beyond: **no blood**, **no real firearms**, satire disclaimer on  

---

## Implementation Defaults Derived From Lock

| System | Default |
|--------|---------|
| Engine folder | `src/engine/*` raycaster |
| Player visual | Adult suit arms always |
| Kill feed / toast | “JOINED THE TRUMP-TRAIN!” |
| Music bus | `synthRock` generator |
| First shippable map | `ep0_basement` |
| Co-op/vs | Deferred; input manager stays multi-gamepad-ready where cheap |

---

*Update this file only when the creator re-locks a decision.*
