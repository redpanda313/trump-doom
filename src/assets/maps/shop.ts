import { gridFromStrings, type GameMap } from '../../engine/map';

/** Shared Trump Tower Lobby shop room; nextMapId set per visit. */
export function makeShopMap(id: string, nextMapId: string, sectionLabel: string): GameMap {
  const layout = gridFromStrings([
    '1111111111111111',
    '1..............1',
    '1..2........2..1',
    '1..............1',
    '1......88......1',
    '1..............1',
    '1..4........4..1',
    '1..............1',
    '1......7.......1',
    '1..............1',
    '1111111111111111',
  ]);
  return {
    id,
    name: `Trump Tower Lobby — ${sectionLabel}`,
    episode: Number(id.replace('shop_', '')) || 0,
    nextMapId,
    width: layout.width,
    height: layout.height,
    grid: layout.grid,
    floorColor: '#2a2438',
    ceilingColor: '#0a1f44',
    spawn: { x: 8, y: 8.5, angle: -Math.PI / 2 },
    entities: [
      {
        type: 'plaque',
        x: 3.5,
        y: 2.5,
        id: `SHOP_${id}`,
        title: 'Art of the Deal',
        text: '“Spend Brand. Buy destiny. Exit south when ready.”',
      },
      { type: 'pickup', x: 12.5, y: 2.5, kind: 'brand' },
      { type: 'exit', x: 8, y: 8.5 },
    ],
  };
}

export const SHOP_MAPS: GameMap[] = [
  makeShopMap('shop_0', 'ep1_parking', 'After Basement'),
  makeShopMap('shop_1', 'ep2_quad', 'After Strip Mall'),
  makeShopMap('shop_2', 'ep3_forms', 'After Campus'),
  makeShopMap('shop_3', 'ep4_warehouse', 'After Bureau'),
  makeShopMap('shop_4', 'ep5_court', 'After Catacombs'),
  makeShopMap('shop_5', 'ep6_studio', 'After Tribunal'),
  makeShopMap('shop_6', 'ep7_approach', 'Before the Endgame'),
];
