import { gridFromStrings, type GameMap } from '../../engine/map';

/**
 * Episode 1 Map A — Strip Mall Parking Lot
 * New: push button opens HOA gate (wall 9 cells).
 */
const layout = gridFromStrings([
  // 24 x 18 — all rows length 24
  '111111111111111111111111',
  '1......................1',
  '1..8..8.....1.....8..8.1',
  '1..........1...........1',
  '1....1.....1.....1.....1',
  '1....1...........1.....1',
  '1....1111...111111.....1',
  '1......................1',
  '1....1..........1......1',
  '111..1...11.....1..11111',
  '1........11.....1......1',
  '1..2...........1...8...1',
  '1......1.......1.......1',
  '111111119....91111111111', // 9 = HOA gate (button opens)
  '1......................1',
  '1...8....7.............1',
  '1......................1',
  '111111111111111111111111',
]);

export const ep1Parking: GameMap = {
  id: 'ep1_parking',
  name: 'Strip Mall Parking',
  episode: 1,
  nextMapId: 'ep1_interior',
  width: layout.width,
  height: layout.height,
  grid: layout.grid,
  floorColor: '#3a3a42',
  ceilingColor: '#5a6a80',
  spawn: { x: 2.5, y: 2.5, angle: Math.PI / 2 },
  entities: [
    {
      type: 'plaque',
      x: 4.5,
      y: 3.5,
      id: 'P03',
      title: 'HOA Scroll',
      text: '“They fined the lawn. The lawn was perfect.”',
    },
    {
      type: 'button',
      x: 11.5,
      y: 11.5,
      flag: 'ep1_hoa_gate',
      label: 'HOA Gate Opener',
      openCells: [
        { x: 8, y: 13 },
        { x: 13, y: 13 },
      ],
    },
    { type: 'karen', x: 6.5, y: 5.5 },
    { type: 'karen', x: 14.5, y: 4.5 },
    { type: 'karen', x: 18.5, y: 8.5 },
    { type: 'karen', x: 10.5, y: 10.5 },
    { type: 'karen', x: 5.5, y: 15.5, elite: true },
    { type: 'pickup', x: 20.5, y: 2.5, kind: 'resolve' },
    { type: 'pickup', x: 3.5, y: 11.5, kind: 'voice' },
    { type: 'pickup', x: 15.5, y: 15.5, kind: 'brand' },
    { type: 'exit', x: 9.5, y: 15.5 },
  ],
};
