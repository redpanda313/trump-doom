# ForgeHeart: Gift of the Brass Gods

**Status:** Vertical slice on `feature/steampunk-vertical-slice`  
**Relation to Trump Doom:** **Separate product.** Trump Doom remains on `main` / GitHub Pages. This branch does not alter that live game.

---

## Elevator pitch

You are an engineer who lost a brother. In a brass workshop above a floating city, you discover how to seat **souls** in automata — and call **Elias** home with a talisman. Demons can wear frames too. With **reprogram hand** and **arc wrench**, you wake allies, fight possessed scrap, and flee across sky docks.

## Tutorial (first level)

1. **Workshop** — hand only; read photo + journal notes; Elias deactivated on the bench.  
2. **Wake** — Hand reprogram (or accidental E scrap → collect 3 trays → rebuild).  
3. **Siege** — 10 door bangs / 3s; claim arc wrench from rack.  
4. **Breach** — 2 demon bots enter; fight with Elias.  
5. **Escape** — exterior floating walkway → boat controls (E) to win.

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

### Allies (power budget)
- Max **3** powered allies at once.  
- Each ally drains **plasma** continuously (~3.2/s each).  
- At **0 plasma**, links destabilize; after ~2.8s the furthest ally **turns rogue** (hostile again).  
- Reprogram blocked when grid is full — scrap or let one starve first.  
- Wander autonomously near the engineer (soft leash with hysteresis); face walk direction.  
- Wall collision + separation; draw aggro, fight, repair; enable valves/crates.

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
