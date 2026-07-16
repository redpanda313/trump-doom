# ForgeHeart: Gift of the Brass Gods

**Status:** Vertical slice on `feature/steampunk-vertical-slice`  
**Relation to Trump Doom:** **Separate product.** Trump Doom remains on `main` / GitHub Pages. This branch does not alter that live game.

---

## Elevator pitch

You are a **foundry engineer** in a heartfelt steampunk world of plasma, brass, and loyal automata. Rogue frames threaten the annex. With **arc wrench** and **reprogram hand**, you disable, scrap, or rewrite them — and climb two-story workshops under open sky and under iron beams.

---

## Engine decision (important)

### Why not the classic raycaster?
The Wolf/Doom-style column raycaster is excellent for flat corridors (Trump Doom). It is a **poor fit** for solid vertical platforming:

| Need | Raycaster | Full 3D (Three.js) |
|------|-----------|---------------------|
| Platform **side walls** | Faked / missing | Real meshes |
| Correct **ceilings** at player height | Often wrong | Correct |
| Two-story **walkable** floors | Painful / fragile | Natural |
| Jump landing feel | Approximate | Solid collision |
| Looking up slightly | Rarely | Optional later |

**Decision:** ForgeHeart uses **Three.js (WebGL)** with simple box geometry, capsule-style player collision, and gravity. Aesthetic stays low-poly brass — readable and shippable in a browser.

Trump Doom keeps its raycaster forever on `main`.

---

## Robot combat (v2 — dramatic loop)

### Integrity vs Scramble (two paths)

| Path | How | Result |
|------|-----|--------|
| **Knock out (rapid hits)** | ~4–5 arc hits before self-repair recovers HP | **Disabled** (kneel) → scrap or reprogram |
| **Rewrite (spaced hits)** | Scramble builds & **stays**; HP repairs between swings | **Scramble full** → **eyes go dark**, still chases/fights → **Hand reprogram** without knockout |

- Arc: ~24 damage + ~28 scramble per hit; robots repair ~14 HP/s.  
- **Rapid** melée: net damage wins → knockout.  
- **Spaced** melée: HP heals, scramble reaches 100 → dark eyes, reprogram-ready while active.  
- Scrap only on **disabled** husk path (E). Bonus brass if scramble was full.

### Attacks

1. **Self-destruct (close)**  
   Within ~2.1 m: stop, flash faster for **2.6 s**, explode **~3.2 m** radius, heavy damage.  
   If the player leaves past blast range mid-fuse → **cancel**, resume chase.

2. **Spark bolt (ranged)**  
   Every ~4 s at mid range: pause, crouch, fire a **slow** bolt that tracks with a **low turn rate** (dodgeable).

3. No separate “melee swipe” while fuse exists — the fuse **is** the close threat.

### Allies
- Follow, **draw aggro**, fight hostiles, **repair** allies + engineer.  
- Enable valve seals / crate pry (player still presses E when ally is near).

---

## Vertical slice goals

- [x] Named product + separate from Trump Doom  
- [x] Real 3D room with **two stories**, stairs/ramps, open sky courtyard  
- [x] Jump ≈ half wall height  
- [x] Arc wrench + reprogram hand  
- [x] Robots: walk, attack, disable, husk, ally  
- [x] Scrap → resources  
- [ ] Full campaign (later redesign)

---

## Tone

Pure, heartfelt steampunk adventure. Wonder, craft, loyalty of machines, light melancholy of the foundry — **not** political satire.

---

## Controls (slice)

| Action | Input |
|--------|--------|
| Move / look | WASD + mouse |
| Jump | Space |
| Arc wrench | 2 + LMB |
| Reprogram hand | 1 + LMB (on disabled) |
| Scrap husk | E (on disabled) |
| Interact plaque / valve | E |
| Pause | Esc |
