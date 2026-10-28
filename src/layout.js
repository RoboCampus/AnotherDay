// Map layout (metres). x = east, z = south (so north is -z), y = up.
// The real geography, squeezed a little: HaShalom station sits in the Ayalon trench next to the
// Azrieli towers; HaShalom Road crosses it on a bridge and meets Begin Road, and across Begin is
// the Kirya, between HaShalom Road (south) and Kaplan Street (north). The Matcal tower stands at
// its Kaplan / Begin corner; the gate Argaman uses is on Kaplan.

export const BOUNDS = { x0: -340, x1: 280, z0: -300, z1: 220 };

// Ayalon highway + railway, sunk in a trench
export const TRENCH = { x0: 115, x1: 175, y: -7.5 };
export const PLATFORM = { x0: 141, x1: 149, z0: 38, z1: 150, y: -6.5 };
export const STAIRS = { x0: 141, x1: 149, z0: 18, z1: 38 }; // platform (z1) up to the bridge (z0)
export const BRIDGE = { x0: 115, x1: 175, z0: -14, z1: 18 }; // road + both sidewalks
export const TRACK_X = 139.4; // the track Argaman's train stops on (west side of the island platform)
export const TRACK2_X = 150.6;

// Streets
export const BEGIN = { x0: -10, x1: 20 }; // Derech Menachem Begin, runs north-south
export const KAPLAN = { z0: -250, z1: -230 };
export const HASHALOM = { z0: -8, z1: 12 };

// The Kirya compound and its fence
export const KIRYA = { x0: -300, x1: -18, z0: -222, z1: -14 };
export const KIRYA_CENTER = { x: -160, z: -118 };
export const GATE = { x0: -158, x1: -142, z: -222 }; // vehicle gate (the lightning opens it)
export const BOOTH = { x0: -141, x1: -136, z0: -224, z1: -219 };
export const TURNSTILE = { x0: -136, x1: -134 };
export const QUEUE = { x: -133.4, z: -226.6, gap: 1.3 }; // front of the line, the line runs east
export const GATE_GUARDS = [
  { x: -137.2, z: -225.2 },
  { x: -139.6, z: -226.4 },
];

export const MATCAL = { x0: -75, x1: -35, z0: -215, z1: -180, h: 62, tx: -55, tz: -197.5 };
export const AZRIELI = { x0: 28, x1: 110, z0: -130, z1: -16, h: 22 };

// Argaman's building: lobby on the ground floor, his office on level 14
export const BUILDING = { x0: -230, x1: -185, z0: -205, z1: -170, h: 57 };
export const WALL = 0.4;
export const LOBBY_H = 6;
// the ground floor is a big hall, wider than the tower above it (west and south of it)
export const LOBBY = { x0: -246, x1: -185, z0: -205, z1: -148 };
// the Pit ("HaBor", the underground command centre): its entrance is on the hall's south wall
export const PIT = { x: -210, z: -148, w: 6, depth: 7 };
export const AMIR = { x: -210, z: -156.5 }; // the officer guarding it
export const FLOOR_H = 3.5;
export const OFFICE_Y = 49; // 14 * 3.5
export const OFFICE_H = 3.6;
export const DOOR = { z0: -190, z1: -186 }; // in the east wall
export const CORE = { x0: -229.6, x1: -224, z0: -196, z1: -180 }; // elevators + stairs
export const ELEVATOR = { x: -224, z: -188 };
// elevator A is a real (big) cab inside the core, on the ground floor and on level 14; its doors face east
export const CAB = { x0: -228.6, x1: -224, z0: -190.2, z1: -185.8, h: 2.8, door: 1.2 };
// level 14: a small elevator lobby, a corridor east, then right (south) to Argaman's office on the south facade
export const LOBBY14 = { x0: -224, x1: -218, z0: -191, z1: -185 };
export const CORRIDOR = { x0: -218, x1: -197, z0: -189.2, z1: -186.8 };
export const CORRIDOR2 = { x0: -199.4, x1: -197, z0: -189.2, z1: -177 };
export const OFFICE = { x0: -203, x1: -194, z0: -177, z1: -170.4 };
export const CHAIR = { x: -195.6, z: -174.1 }; // Argaman's chair, facing the window (south)
// the line for the elevators, in the hall: the front is at the doors, it runs east
export const ELEV_LINE = { x: -222.4, z: -188, gap: 0.95, n: 8 };

// Where the story starts, and where the meteorologists throw you back to
export const START = { x: TRACK_X, z: 92 };
export const CHECKPOINTS = [
  { x: 145, z: 15, heading: -Math.PI / 2 }, // top of the station stairs, on the bridge
  { x: 26, z: -11, heading: Math.PI }, // the Azrieli corner of Begin / HaShalom
  { x: -150, z: -215, heading: -0.9 }, // just inside the Kirya gate
  { x: -188, z: -188, heading: -Math.PI / 2 }, // inside the hall, by the door (behind the security booth)
];

export const inRect = (x, z, r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
