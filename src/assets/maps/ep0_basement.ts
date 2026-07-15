import { gridFromStrings, type GameMap } from '../../engine/map';

/**
 * Episode 0 — The Basement of Ambition
 *
 * Bugs fixed:
 * - EXIT is on walkable floor (was on solid gold wall → impossible to trigger)
 * - Secret is a sealed room opened by E on wall texture 6 (was wrong coords / no room)
 */
const layout = gridFromStrings([
  // 20 x 16
  '11111111111111111111', // 0
  '1........1.........1', // 1
  '1..4..4..1...3...3.1', // 2
  '1........1.........1', // 3
  '1..1..1..11111311111', // 4  red door (14,4)
  '1..1..1......1.....1', // 5
  '1..1..1111...1..5..1', // 6
  '1............1.....1', // 7
  '1111.11111...111.111', // 8
  '1........1..11111..1', // 9  north wall of secret room
  '1..2..2..1..6...1..1', // 10 secret door (12,10) + room
  '1........1..6...1..1', // 11 secret door (12,11) + room
  '1...11...1..11111..1', // 12 south wall of secret room
  '1...11.............1', // 13
  '1................7.1', // 14 walkable exit area; gold @ (17,14)
  '11111111111111111111', // 15
]);

export const ep0Basement: GameMap = {
  id: 'ep0_basement',
  name: 'The Basement of Ambition',
  episode: 0,
  nextMapId: 'shop_0',
  width: layout.width,
  height: layout.height,
  grid: layout.grid,
  floorColor: '#2a2e35',
  ceilingColor: '#0a1f44',
  spawn: { x: 2.5, y: 2.5, angle: 0 },
  entities: [
    {
      type: 'plaque',
      x: 3.5,
      y: 2.5,
      id: 'P01',
      title: 'First Deal',
      text: '“I traded my lunch for a better lunch. Capitalism.”',
    },
    {
      type: 'plaque',
      x: 15.5,
      y: 6.5,
      id: 'P02',
      title: 'Radio Prophecy',
      text: '“The static said President. I believed the static.”',
    },
    {
      type: 'plaque',
      x: 11.5,
      y: 10.5,
      id: 'P21',
      title: 'Secret Ambition',
      text: '“The best rooms are the ones they said you couldn’t open. Face the odd wall and press E.”',
    },
    { type: 'karen', x: 8.5, y: 6.5 },
    { type: 'karen', x: 15.5, y: 8.5 },
    { type: 'karen', x: 5.5, y: 13.5 },
    { type: 'pickup', x: 6.5, y: 2.5, kind: 'resolve' },
    { type: 'pickup', x: 17.5, y: 2.5, kind: 'voice' },
    { type: 'pickup', x: 2.5, y: 9.5, kind: 'brand' },
    { type: 'pickup', x: 10.5, y: 5.5, kind: 'key_red' },
    // Secret room loot (only after opening wall 6)
    { type: 'pickup', x: 14.5, y: 10.5, kind: 'brand' },
    { type: 'pickup', x: 14.5, y: 11.5, kind: 'resolve' },
    {
      type: 'secret_trigger',
      x: 11.5,
      y: 10.5,
      wallX: 12,
      wallY: 10,
      flag: 'ep0_secret',
    },
    {
      type: 'secret_trigger',
      x: 11.5,
      y: 11.5,
      wallX: 12,
      wallY: 11,
      flag: 'ep0_secret',
    },
    // GOLD "EXIT" sign is the sprite — stand on this floor tile to leave
    { type: 'exit', x: 15.5, y: 14.5 },
  ],
};
