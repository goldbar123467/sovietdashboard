export type CellType = 'empty' | 'road' | 'intersection';
export type RoadDirection = 'ns' | 'ew';
export type Zone = 'downtown' | 'commercial' | 'residential';

export interface Cell {
  type: CellType;
  x: number;
  z: number;
  road?: { direction: RoadDirection; secondary?: boolean };
  intersection?: { connections: Set<RoadDirection> };
}

export interface Grid {
  width: number;
  height: number;
  cells: Cell[][];
}

export interface Block {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  area: number;
  exterior: boolean;
}

export interface Lot {
  gridBounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  worldBounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  area: number;
  zone: Zone;
  roadFacingEdges: Array<'north' | 'south' | 'east' | 'west'>;
}

export interface BuildingSection {
  width: number;
  depth: number;
  height: number;
  offsetY: number;
}

export interface BuildingDef {
  lot: Lot;
  sections: BuildingSection[];
  wallColor: number;
  windowColor: number;
  rooftopProps: Array<{ type: 'ac' | 'antenna' | 'tank'; x: number; z: number }>;
}
