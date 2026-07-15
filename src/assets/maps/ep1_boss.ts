import { gridFromStrings, type GameMap } from '../../engine/map';

/**
 * Episode 1 Boss — Manager of Karens
 * Phone silences add spawns temporarily.
 */
const layout = gridFromStrings([
  // 18 x 16 arena
  '111111111111111111',
  '1................1',
  '1..8..........8..1',
  '1................1',
  '1......1111......1',
  '1......1..1......1',
  '1................1',
  '1................1',
  '1................1',
  '1................1',
  '1......1..1......1',
  '1......1111......1',
  '1................1',
  '1..8..........8..1',
  '1........7.......1',
  '111111111111111111',
]);

export const ep1Boss: GameMap = {
  id: 'ep1_boss',
  name: 'Manager of Karens',
  episode: 1,
  nextMapId: 'shop_1',
  width: layout.width,
  height: layout.height,
  grid: layout.grid,
  floorColor: '#3a3030',
  ceilingColor: '#1a1020',
  spawn: { x: 9, y: 13.5, angle: -Math.PI / 2 },
  entities: [
    {
      type: 'plaque',
      x: 3.5,
      y: 2.5,
      id: 'P04b',
      title: 'Customer is Always Wrong',
      text: '“Policy is a shield. Ambition is a sword.”',
    },
    {
      type: 'phone',
      x: 9,
      y: 5.5,
      flag: 'boss_phone_silence',
      label: 'Manager Hotline',
      effect: 'silence',
      message: 'Line jammed — reinforcements delayed!',
    },
    { type: 'boss', variant: 'manager', x: 9, y: 3.5 },
    { type: 'karen', x: 4.5, y: 8.5 },
    { type: 'karen', x: 13.5, y: 8.5 },
    { type: 'pickup', x: 2.5, y: 13.5, kind: 'resolve' },
    { type: 'pickup', x: 15.5, y: 13.5, kind: 'voice' },
    { type: 'exit', x: 9, y: 14.5 },
  ],
};
