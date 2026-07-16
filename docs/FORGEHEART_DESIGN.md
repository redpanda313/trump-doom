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

## Disable / scrap / reprogram (designer choice)

**Stagger → Disabled → Choice**

1. **Active** — robot fights; has Integrity (HP).  
2. **Arc wrench** applies damage **and** fills a **Scramble** meter (EMP build-up).  
3. When Scramble fills **or** Integrity hits 0 → **Disabled** (kneel, sparks, no attack).  
4. Player choice while disabled:  
   - **Reprogram hand** (costs Plasma) → **Ally** (low HP, follows, **draws aggro**, fights, **repairs allies**).  
   - **Scrap** (interact) → **Husk** + **Brass / Gears** resources (more if Scramble-killed cleanly).  
5. Overkill without disable: still husks, but **reduced scrap** (encourages intentional disable).

**Allies**
- Follow the engineer within leash range.  
- Prefer nearest hostile; **pull aggro** when they deal or take damage.  
- **Repair** nearby damaged allies / player slowly (oil aura).  
- Can be ordered later (v2); slice = follow + fight + repair.

**Environmental allies (slice → expand)**
- Ally near a **sealed valve / brass seal** can open **hidden doors** after a short channel.  
- Broken crates near allies rattle open → **health / plasma / brass** drops.

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
