// Grid & world geometry
export const TILE_SIZE = 11.37;
export const DEFAULT_GRID_WIDTH = 24;
export const DEFAULT_GRID_HEIGHT = 24;

// Building dimensions
export const STORY_HEIGHT = 3;
export const MIN_STORIES_DOWNTOWN = 6;
export const MAX_STORIES_DOWNTOWN = 12;
export const MIN_STORIES_COMMERCIAL = 2;
export const MAX_STORIES_COMMERCIAL = 8;
export const MIN_STORIES_RESIDENTIAL = 1;
export const MAX_STORIES_RESIDENTIAL = 4;

// Camera
export const CAMERA_START_Y = 150;
export const CAMERA_PITCH_DEG = 60;

// Debug
export const DEBUG_KEY = 'Backquote';

// Zone distance thresholds (grid cells from center)
export const DOWNTOWN_RADIUS = 4;
export const COMMERCIAL_RADIUS = 8;

// Road generation
export const MIN_ROAD_SPACING = 3;
export const MAX_ROAD_SPACING = 6;

// Secondary roads are rendered this fraction of a full cell width
export const SECONDARY_ROAD_WIDTH = 0.5;

// Building lot
export const LOT_INSET = 0.5;
export const WINDOW_ROWS_PER_STORY = 2;
export const WINDOW_SPACING = 2.5;

// Color palettes (hex)
export const WALL_COLORS_DOWNTOWN = [
  0x4a5568, 0x2d3748, 0x1a202c, 0x718096, 0x5a6778,
];
export const WALL_COLORS_COMMERCIAL = [
  0x9b8b7a, 0x8b7d6b, 0xa0927e, 0xb8a898, 0x7a6c5d,
];
export const WALL_COLORS_RESIDENTIAL = [
  0xc5b8a5, 0xd4c5b0, 0xb8a99a, 0xe0d5c5, 0xa89888,
];
export const WINDOW_COLORS = [
  0xfff9c4, 0xe3f2fd, 0xf3e5f5, 0xffe0b2, 0xc8e6c9,
];
export const ROAD_COLOR = 0x3a3a3a;
export const SIDEWALK_COLOR = 0x9e9e9e;
export const GROUND_COLOR = 0x4a7c4f;
export const SKY_COLOR = 0x87ceeb;

// Rooftop props
export const AC_UNIT_SIZE = 1.2;
export const ANTENNA_HEIGHT = 4;
export const WATER_TANK_RADIUS = 1;
export const ROOFTOP_PROP_CHANCE = 0.6;

// Palette color indices (row * 16 + col)
export const ROAD_COLOR_INDEX = 42;
export const INTERSECTION_COLOR_INDEX = 42; // same as road, just slightly different shade handled in palette
export const ROAD_MARKING_COLOR_INDEX = 0;
export const SIDEWALK_COLOR_INDEX = 10;
export const TRUNK_COLOR_INDEX = 96;
export const CANOPY_COLORS = [112, 113, 114];
export const GRASS_COLOR_INDEX = 115;
export const GROUND_COLOR_INDEX = 128;

// Lot subdivision
export const LOT_MIN_CELLS = 1;
export const LOT_MAX_CELLS = 4; // 2x2 max = ~22m lot side

// Zone radius aliases
export const ZONE_DOWNTOWN_RADIUS = DOWNTOWN_RADIUS;
export const ZONE_COMMERCIAL_RADIUS = COMMERCIAL_RADIUS;

// Building generation
export const BUILDING_HEIGHTS: Record<string, [number, number]> = {
  downtown: [MIN_STORIES_DOWNTOWN, MAX_STORIES_DOWNTOWN],
  commercial: [MIN_STORIES_COMMERCIAL, MAX_STORIES_COMMERCIAL],
  residential: [MIN_STORIES_RESIDENTIAL, MAX_STORIES_RESIDENTIAL],
};

export const BUILDING_FILL_RANGE: [number, number] = [0.65, 0.88];
export const BUILDING_ROAD_MARGIN = 1.5; // meters inset from road-facing edges (lot bounds already have 1.5m roadInset)

export const VACANCY_RATE: Record<string, number> = {
  downtown: 0.02,
  commercial: 0.08,
  residential: 0.06,
};

// Palette indices for building walls by zone
export const WALL_COLOR_INDICES: Record<string, number[]> = {
  downtown: [32, 33, 34, 35, 36],   // Row 2: cool blue-gray slate
  commercial: [21, 22, 23, 24, 25], // Row 1: warm beige/tan (offset)
  residential: [16, 17, 18, 19, 20], // Row 1: warm beige/tan
};

// Palette indices for window colors (Row 3)
export const WINDOW_COLOR_INDICES = [50, 51, 52, 53, 54];

// Palette index for rooftop props (dark gray)
export const ROOFTOP_PROP_COLOR_INDEX = 13;

// Vegetation
export const MAX_CANOPY_RADIUS = 3.5;
export const TREES_PER_LOT_RANGE: Record<string, [number, number]> = {
  downtown: [0, 1],
  commercial: [0, 2],
  residential: [1, 3],
};
export const ROAD_TREE_INTERVAL = 2;
export const PARK_TREE_RANGE: [number, number] = [4, 8];
export const GRASS_PER_LOT_RANGE: [number, number] = [3, 8];

// Street furniture
export const LIGHT_OFFSET = 5;
export const BENCH_INTERVAL = 4;
export const LIGHT_POLE_COLOR_INDEX = 64;
export const LIGHT_LAMP_COLOR_INDEX = 65;
export const SIGN_COLOR_INDEX = 66;
export const BENCH_COLOR_INDEX = 67;

// Lot details
export const FENCE_COLOR_INDEX = 68;
export const DRIVEWAY_COLOR_INDEX = 69;
