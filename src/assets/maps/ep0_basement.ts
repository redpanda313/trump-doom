import { gridFromStrings, type GameMap } from '../../engine/map';

/**
 * Episode 0 — The Basement of Ambition
 * Tutorial map: move, plaques, gavel, mic, Karen, key, secret, exit.
 */
const layout = gridFromStrings([
  // 20 wide x 16 deep
  '11111111111111111111',
  '1........1.........1',
  '1..4..4..1...3...3.1',
  '1........1.........1',
  '1..1..1..11111311111', // 3 = Red Tie door (needs key)
  '1..1..1......1.....1',
  '1..1..1111...1..5..1',
  '1............1.....1',
  '1111.11111...111.111',
  '1........1.........1',
  '1..2..2..1...6.....1', // 6 = secret wall
  '1........1.........1',
  '1...11...11111.11..1',
  '1...11.............1',
  '1........7.........1', // near exit gold
  '11111111111111111111',
]);

export const ep0Basement: GameMap = {
  id: 'ep0_basement',
  name: 'The Basement of Ambition',
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
      x: 14.5,
      y: 10.5,
      id: 'P21',
      title: 'Secret Ambition',
      text: '“The best rooms are the ones they said you couldn’t open.”',
    },
    { type: 'karen', x: 8.5, y: 6.5 },
    { type: 'karen', x: 12.5, y: 9.5 },
    { type: 'karen', x: 5.5, y: 13.5 },
    { type: 'pickup', x: 6.5, y: 2.5, kind: 'resolve' },
    { type: 'pickup', x: 17.5, y: 2.5, kind: 'voice' },
    { type: 'pickup', x: 2.5, y: 9.5, kind: 'brand' },
    { type: 'pickup', x: 10.5, y: 5.5, kind: 'key_red' },
    {
      type: 'secret_trigger',
      x: 14.5,
      y: 10.5,
      wallX: 14,
      wallY: 10,
    },
    { type: 'exit', x: 9.5, y: 14.5 },
  ],
};
