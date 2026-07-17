# ForgeHeart on Roblox — Port Plan

**Status:** Planning only (not started)  
**Related product:** ForgeHeart on `feature/steampunk-vertical-slice` (Three.js / TypeScript browser game)  
**Saved:** 2026-07-16 — refer back if deciding to rebuild on Roblox  

---

## Bottom line

This is a **rebuild on Roblox**, not a code port. The Three.js/TypeScript prototype is an excellent **design + systems prototype**. Almost none of that runtime transfers; the *design* (tutorial beats, plasma EQ, ally loop, story) does.

Treat the browser game as **GDD + playable vertical slice**, not the production codebase.

---

## Why Roblox fits (and where it fights)

### Strong fit

| ForgeHeart pillar | Roblox strength |
|-------------------|-----------------|
| Story tutorial (Elias, door siege, boat) | Scripted sequences, ProximityPrompts, cutscene cameras |
| Ally robots + demons | Humanoid NPCs, PathfindingService, server AI modules |
| 3D workshop + sky docks | Parts/meshes, large open maps |
| Jump / platforming | Built-in Humanoid physics |
| Multiplayer later | Free networking, friends join by default |
| Discovery / audience | Large younger + teen audience for steampunk adventure |
| Monetization | Game Passes, Developer Products, Premium Payouts |

### Friction

| Challenge | Reality |
|-----------|---------|
| Language / engine | Luau + Roblox DataModel — rewrite all systems |
| First-person feel | Default FP is rough; needs custom camera / viewmodels |
| Soul / demons / brother death | Content maturity + age-band rules; keep bloodless |
| Exact plasma formula polish | Easy in code; harder to teach on mobile-first UI |
| Web-only art pipeline | Replace box-kits with Studio models or imported meshes |
| Publishing to all ages | Evaluation processes for younger accounts (platform rules evolve) |

---

## Recommended product shape

Don’t clone “single-player browser FPS” 1:1. Roblox players expect **session-friendly multiplayer**.

**Pitch:** *ForgeHeart* — story co-op adventure. Solo *or* 1–4 players. Wake a sibling’s soul into a frame, fight demon-ridden scrap, escape sky docks. Soft multiplayer: host’s story progresses; friends help fight / carry objectives.

**Modes**

1. **Campaign / Story** — tutorial workshop → later chapters (queue or teleport between places)
2. **Sandbox Lab** (optional post-launch) — free play with robots, cosmetics
3. **Daily Sky Run** (later) — short co-op wave on docks

**Camera**

- **Primary:** third-person (more Roblox-native, better for allies on screen)
- **Optional:** first-person toggle for combat purists

---

## Architecture

```
Git repo (source of truth for scripts)
  Rojo / Argon → sync → Roblox Studio

ServerScriptService          StarterPlayerScripts
  (authority: AI, plasma,      (input, camera, FX,
   reprogram, door siege,       prompts, music)
   save)

ReplicatedStorage (shared modules, configs, remotes)
Workspace (maps, prompts, boats)
DataStoreService (progress, brass/gears, chapters)
```

**Hard rule:** combat damage, reprogram success, ally count, door breach, boat win = **server-authoritative**. Client predicts FX only.

### Tooling (industry standard)

- **Roblox Studio** — build maps, test Play / Solo / Start Server
- **Rojo** (or Argon) + **VS Code** — Luau in Git, PRs, branches
- **Wally** — package manager for community modules
- **Selene / StyLua** — lint / format
- **Creator Hub** (`create.roblox.com`) — publish, analytics, monetization, thumbnails

Typical pro loop: edit Luau locally → Rojo live-sync → Studio Play → commit → publish place.

---

## System mapping (web → Roblox)

| Web (now) | Roblox equivalent |
|-----------|-------------------|
| Three.js meshes / box colliders | Parts, MeshParts, Unions; collision groups |
| PointerLock + WASD jump | ContextActionService / UserInputService + Humanoid |
| `RobotUnit` class | Server NPC model + Humanoid + AI module (state machine) |
| Ally follow / leash | PathfindingService or simple move-toward-player with spacing |
| Scramble / integrity | Attributes + server combat module |
| Reprogram Hand | ProximityPrompt or tool + remote `RequestReprogram` |
| Arc Wrench | Tool with raycast hit detection (server validates) |
| Plasma EQ formula | Server `PlasmaService`: `dP/dt = k*(P* - P)` per ally count |
| Door bangs / breach | Timeline module + SoundService + destroy door |
| Interact E prompts | **ProximityPrompt** |
| 1920s music | Uploaded audio assets; Sound regions |
| Boat win | Seat + prompt → teleport / win GUI |
| HUD plasma/integrity | ScreenGui + Billboards |
| Save | DataStore (chapter flags, brass, cosmetics) |

**Ally AI tip:** start simple (chase player + attack nearest hostile). PathfindingService for stairs/docks later; agents can jump if configured.

---

## Phased workflow

### Phase 0 — Foundations (1–2 weeks)

- Create Roblox group / experience under Creator Hub
- Age guidance: bloodless possession, grief themes → plan for 9+ or 13+ messaging
- Design doc: Roblox GDD distilled from current tutorial
- Repo: `forgeheart-roblox` with Rojo layout
- Art direction: steampunk blocky-readable vs high-detail meshes

**Deliverable:** empty published private place + Git + team roles.

### Phase 1 — Vertical slice = current tutorial (6–10 weeks solo / 3–5 weeks small team)

1. Workshop map  
2. Elias disabled NPC + Hand reprogram  
3. Scrap → 3 trays → rebuild  
4. Lore ProximityPrompts (photo, notes)  
5. Siege bang timeline + door breach  
6. 2 demon NPCs  
7. Wrench tool unlock  
8. Exterior dock + walkway + boat win  
9. Plasma EQ + ally power  
10. Basic UI + music  

**Success metric:** a stranger finishes tutorial in &lt;15 min without a guide.

### Phase 2 — Multiplayer hardening (3–5 weeks)

- Host migration / solo fallback  
- Ally ownership (shared story Elias vs per-player)  
- Anti-exploit: remotes rate-limited, server hit validation  
- Replication of robot state  
- Performance: stream maps, cap NPC count  

### Phase 3 — Content loop beyond tutorial (ongoing)

- Chapter 2–N places  
- Progression: plasma upgrades, talisman cosmetics  
- Scrap economy, ally loadouts  
- Retention: daily, badges, friends invites  

### Phase 4 — Soft launch & live ops

- Private → friends → public  
- Thumbnails, icon, trailer  
- Analytics (funnel: read photo → reprogram → breach → boat)  
- Monetization  

---

## Team & effort (honest ranges)

| Scope | Solo skilled Roblox dev | 2–3 person team |
|-------|-------------------------|-----------------|
| Tutorial vertical slice | 2–3 months | 4–6 weeks |
| + multiplayer polish | +1 month | +2–3 weeks |
| Full short campaign (5 chapters) | 6–12 months | 3–6 months |

**Roles if not solo:** scripter (critical), builder/environment, animator, sound, producer.

The TS prototype cuts **design risk** substantially; it does **not** cut Roblox implementation by the same amount.

---

## Monetization (story-friendly)

Keep story free; sell **convenience & expression**, not “win tutorial.”

| Type | Use for ForgeHeart |
|------|-------------------|
| **Game Passes** (one-time) | Cosmetic outfits, talisman skins, workshop lighting pack |
| **Developer Products** (repeatable) | Brass packs, plasma cells (if not P2W) |
| **Premium Payouts** | Passive from Premium subscribers playing |
| **UGC** (later) | Limited catalog gear |

**Avoid:** pay-to-win arc damage in story.  
**Prefer:** cosmetics for Elias’s eyes/gear, emotes, sky-skiff skins.

---

## Technical milestones checklist

```
M0  Rojo project + private experience published
M1  Character spawn in workshop, ProximityPrompts on lore
M2  Elias NPC disabled pose + Hand reprogram remote
M3  PlasmaService (EQ formula ported from design)
M4  Scrap/trays/rebuild branch
M5  SiegeController (10 bangs, sounds, door destroy)
M6  Demon AI (2 units) + Wrench tool
M7  Exterior dock path + boat win + DataStore tutorial_done
M8  Multiplayer smoke test (2 players)
M9  UI polish, music, thumbnails
M10 Soft launch + funnel metrics
```

---

## Day-to-day workflow

```
Design (web prototype / GDD)
        │
        ▼
Luau modules in Git  ◄──►  Rojo sync  ◄──►  Studio map/art
        │
        ▼
Studio Play Solo / Local Server
        │
        ▼
QA on device (desktop + mobile)
        │
        ▼
Publish private place → friend playtest
        │
        ▼
Creator Hub analytics → iterate
        │
        ▼
Public release + Game Passes
```

**Studio habit:** saving ≠ publishing; shipping to players is a separate publish step.

---

## Keep vs leave behind

**Keep as design**

- Tutorial scripted beats  
- Plasma equilibrium model  
- Hand vs wrench roles  
- Bloodless souls / possession fantasy  
- Mistake-scrap → trays recovery  

**Rebuild / rethink**

- First-person → likely third-person default  
- Single-player only → co-op story  
- Box-art aesthetic → Roblox-readable silhouettes  
- Procedural Web Audio → uploaded soundtrack  

**Don’t try**

- Auto-transpiling TypeScript → Luau  
- Running Three.js inside Roblox  

---

## Risks

1. **Tone vs audience** — brother death + demons can work if gentle and non-graphic; age settings matter.  
2. **Mobile combat** — arc melee needs large hit feedback; test thumb controls early.  
3. **Ally pathfinding on floating docks** — gaps/rails need careful nav or stuck-rescue.  
4. **Story pacing in multiplayer** — shared Elias vs one per player.  
5. **Scope creep** — sky city is a backdrop first; not a full open world for v1.  

---

## Decision framework

| If your goal is… | Recommendation |
|------------------|----------------|
| Max players / social / Robux | Yes — Roblox rebuild |
| Exact cinematic FP auteur game | Stay web / Unreal / Unity |
| Learn Roblox + ship tutorial fast | Port tutorial only as M1 |
| Keep web + Roblox | Web = design lab; Roblox = live product |

**Practical recommendation:** Treat browser ForgeHeart as the **living design doc**. Start a **separate Roblox experience** that clones the tutorial 1:1, third-person, co-op-ready. Do not freeze web work—use it to prototype chapters before rebuilding them in Luau.

---

## First concrete next steps (if greenlit)

1. Create Roblox account group + private experience  
2. Scaffold Rojo repo (`src/server`, `src/client`, `src/shared`)  
3. Build workshop blockout in Studio in 1–2 days  
4. Implement ProximityPrompt lore + Elias reprogram only  
5. Playtest that 5-minute beat with 3 friends  
6. Only then: siege, demons, boat  

---

## Open questions (from original discussion)

1. Solo or hire Roblox scripter/builder?  
2. Target: pure solo story, or co-op from day one?  
3. Camera: third-person OK as default?  
4. Monetization: cosmetics only vs any power boosts?  
5. Timeline: hobby side project vs ship in a quarter?  

---

## References / research notes

- Roblox Creator Hub monetization: Game Passes vs Developer Products  
- Rojo external Git workflow is standard for multi-file Luau projects  
- NPC systems should be server-authoritative with client FX  
- Ports from other engines are always rewrites into Luau  
- Publishing requirements for younger age bands can include evaluation processes (check current Creator Hub policy before launch)  

---

*End of plan. Browser ForgeHeart continues as the active product until a Roblox greenlight.*
