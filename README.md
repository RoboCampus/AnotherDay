# Argaman: Mission Kirya

Browser stealth game about Argaman getting to his office in the Kirya (Tel Aviv). Three.js from a CDN, no build step.

```
npm start        # http://localhost:5173
npm test         # combat, story, phone, input, and ultimate checks
```

Open `http://localhost:5173/?debug` to expose `window.game` for testing:
- `game.hold = true` freezes real time (so `game.step` alone drives the game); `game.start()` presses Play, `game.step(n)` advances n frames (1/60 s) without rendering, `game.render()` draws one frame
- `game.story.skipTo('sneak' | 'line' | 'gate' | 'inside' | 'lobby' | 'elevator' | 'boss' | 'boss-call' | 'ultimate' | 'recovery' | 'round2' | 'finisher' | 'office' | 'crash')` jumps to a part of the story
- `?debug&skip=gate` does the same straight from the Play button
- `?debug&skip=boss` starts the boss fight; `boss-call` rings ADAM immediately; `ultimate` starts with three kipa hits already charged; `recovery` previews the desk animation; `round2` starts the healed round; `finisher` charges Shaikale Poopale
- If the browser cannot capture the mouse, choose **CONTINUE WITH DRAG LOOK**, hold the right mouse button to look, and press **Esc** to pause

## The story
1. Get off the train at Tel Aviv HaShalom (Ayalon trench), go up to the bridge. Cutscene: the Kirya and the Matcal tower.
2. Sneak along Begin Road to the Kaplan gate. **Meteorologists** patrol (yellow vision cones, also on the minimap). If one
   spots you he lunges, spins you and throws you away from the Kirya at 200 km/h, back to the last checkpoint.
   Hold **C** to sneak (shorter sight range); crouch inside a bush to be invisible; running is noisy; honking cars draw attention.
   Use **F / left click** to throw the kipa in this first stage: it stuns meteorologists, ricochets between nearby targets,
   and returns to Argaman. It has a 4 s cooldown after returning; bushes and cover still help you slip past patrols.
3. Join the end of the huge line at the gate (**E**). While you wait, "DO NOT ANSWER" keeps calling (**Y** / **N**): "Are you already in?"
   Every 22-36 s a ballistic missile hits Argaman's building (you can see it from the line). Nobody in line cares.
   The same kipa cooldown applies during the later boss fight (badge bottom right).
4. The gate guards: "You can't enter. There's no permission." A nice soldier comes over, a storm rolls in, lightning blasts the gate open.
   "Wait! Do you have sivug? ...Never mind." **New ability: Q summons Andrey**, who sprints where you look, runs in circles
   yelling "Khlobchik! Khlobchik!" for 9 s, and every meteorologist within 24 m stops to stare at him (15 s cooldown).
5. Go right to your building: it is under construction (scaffolding, netting, a bare concrete frame on the roof, a tower crane).
   Next door, a building with a hole torn through three floors. Meteorologists guard the entrance and the lobby;
   inside the Kirya they throw you back out through the gate.
6. The ground floor is a big hall full of soldiers (chatting groups, tables, a coffee queue), three of them meteorologists.
   On the left (south wall) is the entrance to **the Pit**, guarded by **Amir**, the officer with red eyes. He looks left, then
   right; his view (red on the floor and the minimap) stops at pillars, the security booth and groups of soldiers. Andrey does not interest him: hide in a shadow and move while he looks the other way. If he sees you
   (or you get near the Pit) his eyes zap you out through the front door at 200 km/h.
7. Get to the **line for the elevators** unseen and join it (**E**). The waiting soldiers board. Argaman walks to the doors and tries to squeeze in, but there is no place left.
   An officer kicks him back into the lobby before the doors close and Amir challenges him.
   **AMIR BOSS FIGHT:** Amir claims the final place and throws meteorologists and officers at Argaman. Watch the landing
   circle lock, then **WASD + Shift** to run clear. When Amir tires and his eyes turn gold, aim at him and use **F / left click**
   to throw the kipa. Each recovery window accepts one hit. Three hits charge the **R** ultimate: **Shonchik**, a big strong
   soldier, arrives carrying a satellite and throws it onto Amir. Amir then runs behind the reception desk to a woman
   officer and sits in a high-backed chair behind the desk facing the player. She crouches in the opening under the desk,
   facing Amir with her back toward the camera. The front oblique camera stays fixed while both shake their heads and his HP refills.
   Amir then runs back for **round two**. Argaman keeps his remaining health.
   Three more kipa hits charge **R: Shaikale Poopale**: a blue officer flies in with brown thrust from his butt, grabs Amir,
   and carries him through the opening lobby doors. The boss is only defeated once they fly outside. The fight has three
   player health points and an **E / Enter** retry; losing round two retries that round without replaying the satellite.
   **ADAM** calls during combat about a new satellite. **Y** answers: Argaman can keep running but cannot throw the kipa or
   use the ultimate until the eight-second conversation ends. **N** declines; ringing or ignoring the call does not block attacks.
8. After Amir is defeated, Argaman gets his place in the lift.
   On floors 1, 2 and 3 the doors open and more soldiers and officers squeeze in (on 3 the doors will not close). Floors 4-13
   are skipped. On 14 the doors open and everybody explodes out into the corridor.
9. Down the corridor, then right: office 1414. Small: three desks, five people (a wide strong guy, a very tall thin guy,
   a monkey, a guy with a kipa, a bearded soldier with a kipa). While you look around (no cutscene),
   the blue officer bursts in through the window on a jet of poop. Sit at your desk (**E**).

## Layout
- `src/layout.js` – every map coordinate (streets, trench, Kirya, gate, building, checkpoints)
- `src/world.js` – collision boxes (block / line-of-sight / camera flags), ground heights, walkable areas, bushes
- `src/city.js` – the map: Ayalon trench + HaShalom station, Azrieli, Begin / Kaplan / HaShalom, the Kirya (fence, gate, Matcal tower, Templer houses), filler city
- `src/building.js` – Argaman's building: lobby, elevators, the level-14 office
- `src/story.js` – the whole story as generator scripts (`yield` seconds / conditions), phase logic, debug `skipTo`
- `src/meteorologists.js` – patrols, vision, suspicion, lunge-grab-throw
- `src/npcs.js` – the line at the gate, gate guards, soldiers inside the Kirya
- `src/player.js` – Argaman: movement, sneaking, the flight after a throw, third-person camera
- `src/andrey.js` – the Andrey distraction ability
- `src/construction.js` – the construction site on Argaman's building, the crane, and the holed building next door
- `src/hall.js` – the ground-floor hall: the Pit entrance, pillars, security booth, kiosk, and the crowd of soldiers
- `src/amir.js` – Amir: the stealth watcher, boss arena, telegraphs, and thrown soldier visuals
- `src/boss-fight.js` – deterministic boss combat rules, landing damage, kipa charge, and ultimate progression
- `src/shonchik.js` – Shonchik and the first-round satellite throw, impact, and debris
- `src/shaikale.js` – Shaikale Poopale: brown thrust, flying grab, carry, and final exit
- `src/elevator.js` – the elevator line, the ride (fake landings for floors 1-3) and the explosion on 14
- `src/floor14.js` – level 14: corridor, Argaman's office, the five coworkers (incl. the monkey), the window
- `src/missiles.js` – the ballistic missiles during the wait at the gate
- `src/kipa.js` – the kipa: knitted texture, the head mesh, and the thrown shield (aim assist, ricochets, return)
- `src/phone.js`, `src/hud.js`, `src/audio.js` (synthesised sound + browser speech for dialogue), `src/fx.js`, `src/traffic.js`, `src/character.js`, `src/textures.js`, `src/geo.js`
