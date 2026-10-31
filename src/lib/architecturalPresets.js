// Architectural BIM-Lite v3.0 Templates & Agent Blueprint JSON Parser
import { normalizeSpace } from "./buildingGeometry.js";

export const ARCHITECTURAL_PRESETS = [
  {
    id: "maple_106_apartment_4f",
    name: "106 Maple — 4-Story Modern Boutique Apartment",
    subtitle: "39 Suites · Glazed Corner Lobby · Brick Piers & Glass Balconies · Flat Parapet Roof",
    badge: "From Your Photo",
    description:
      "Exact 4-story mid-rise apartment replication featuring a Ground-Left glazed storefront lobby ('106') with entrance marquee canopy, full-height dark charcoal brick vertical piers, cantilevered glass-railing balconies with 4th-floor roof brows, double-loaded interior corridors, and dual stairwell cores.",
    architecture: {
      floors: 4,
      floor_height: 2.6,
      wall_material: "stucco",
      exterior_color: "#dce0e5",
      trim_color: "#1e293b",
      railing_style: "glass",
      roof_type: "flat_parapet",
      roofs: [
        {
          type: "flat_parapet",
          floor: 4,
          bounds: [-9.0, -6.2, 9.0, 6.2],
          parapet_height: 0.72,
          overhang: 0.18,
          color: "#262f3a",
        },
      ],
    },
    generateRooms: () => {
      const ts = Date.now();
      let seq = 1;
      const rooms = [];
      const mk = (data) =>
        normalizeSpace({
          id: `new-temp-${ts}-${seq++}`,
          status: "vacant",
          monthly_rent: 0,
          height: 2.6,
          rotation: 0,
          roof_type: "parapet",
          material_type: "stucco",
          wall_color: "#dce0e5",
          has_balcony: false,
          balcony_side: "S",
          balcony_depth: 1.35,
          tenant: null,
          ...data,
        });

      for (let f = 1; f <= 4; f++) {
        // 1. Central Double-Loaded Interior Hallway (East-West Core)
        rooms.push(
          mk({
            unit_label: `F${f} Central Corridor`,
            floor: f,
            element_type: "hallway",
            bounds: [-6.2, -1.0, 6.2, 1.0],
          })
        );

        // 2. West & East Vertical Brick Stairwell / Elevator Cores
        rooms.push(
          mk({
            unit_label: `West Stair Core F${f}`,
            floor: f,
            element_type: "stairwell",
            material_type: "brick",
            wall_color: "#3b4048",
            bounds: [-9.0, -1.6, -6.2, 1.6],
          })
        );
        rooms.push(
          mk({
            unit_label: `East Stair Core F${f}`,
            floor: f,
            element_type: "stairwell",
            material_type: "brick",
            wall_color: "#3b4048",
            bounds: [6.2, -1.6, 9.0, 1.6],
          })
        );

        // ── SOUTH (FRONT FACADE, +Z) — 5 Architectural Bays ──
        // Bay S1 (Front-Left Corner): Ground Floor Glazed Storefront Lobby ("106"), Upper Corner Suites
        if (f === 1) {
          rooms.push(
            mk({
              unit_label: "106 Main Lobby",
              floor: 1,
              element_type: "common_area",
              window_style: "storefront",
              door_wall: "S",
              bounds: [-9.0, 1.6, -5.2, 6.2],
            })
          );
        } else {
          rooms.push(
            mk({
              unit_label: `${f}01`,
              floor: f,
              element_type: "unit",
              monthly_rent: 16500,
              door_wall: "N",
              bounds: [-9.0, 1.6, -5.2, 6.2],
            })
          );
        }

        // Bay S2 (Front Center-Left): Cantilevered Glass-Railing Balcony Stack
        rooms.push(
          mk({
            unit_label: f === 1 ? "101" : `${f}02`,
            floor: f,
            element_type: "unit",
            monthly_rent: 15800,
            door_wall: "N",
            has_balcony: true,
            balcony_side: "S",
            balcony_depth: 1.35,
            bounds: [-5.2, 1.0, -1.6, 6.2],
          })
        );

        // Bay S3 (Front Center Dark Brick Vertical Pier): Full-height dark brick accent bay
        rooms.push(
          mk({
            unit_label: f === 1 ? "102" : `${f}03`,
            floor: f,
            element_type: "unit",
            monthly_rent: 14500,
            material_type: "brick",
            wall_color: "#3b4048",
            door_wall: "N",
            bounds: [-1.6, 1.0, 1.6, 6.2],
          })
        );

        // Bay S4 (Front Center-Right): Stucco bay (with dark brick ground plinth on F1)
        rooms.push(
          mk({
            unit_label: f === 1 ? "103" : `${f}04`,
            floor: f,
            element_type: "unit",
            monthly_rent: 15200,
            material_type: f === 1 ? "brick" : "stucco",
            wall_color: f === 1 ? "#3b4048" : "#dce0e5",
            door_wall: "N",
            bounds: [1.6, 1.0, 5.2, 6.2],
          })
        );

        // Bay S5 (Front-Right Corner): Corner Cantilevered Glass-Railing Balcony Stack + 4F Roof Brow
        rooms.push(
          mk({
            unit_label: f === 1 ? "104" : `${f}05`,
            floor: f,
            element_type: "unit",
            monthly_rent: 17500,
            door_wall: "N",
            has_balcony: true,
            balcony_side: "S",
            balcony_depth: 1.35,
            bounds: [5.2, 1.6, 9.0, 6.2],
          })
        );

        // ── NORTH (BACK VIEW FACADE, -Z) — 5 Architectural Bays ──
        // Bay N1 (Rear-West Corner): Cantilevered Glass-Railing Balcony Stack + 4F Roof Brow
        rooms.push(
          mk({
            unit_label: f === 1 ? "105" : `${f}06`,
            floor: f,
            element_type: "unit",
            monthly_rent: 16800,
            door_wall: "S",
            has_balcony: true,
            balcony_side: "N",
            balcony_depth: 1.35,
            bounds: [-9.0, -6.2, -5.2, -1.6],
          })
        );

        // Bay N2 (Rear Center-West): Stucco bay (dark brick plinth on F1)
        rooms.push(
          mk({
            unit_label: f === 1 ? "106" : `${f}07`,
            floor: f,
            element_type: "unit",
            monthly_rent: 14900,
            material_type: f === 1 ? "brick" : "stucco",
            wall_color: f === 1 ? "#3b4048" : "#dce0e5",
            door_wall: "S",
            bounds: [-5.2, -6.2, -1.6, -1.0],
          })
        );

        // Bay N3 (Rear Center Dark Brick Vertical Pier): Full-height dark brick accent bay
        rooms.push(
          mk({
            unit_label: f === 1 ? "107" : `${f}08`,
            floor: f,
            element_type: "unit",
            monthly_rent: 14500,
            material_type: "brick",
            wall_color: "#3b4048",
            door_wall: "S",
            bounds: [-1.6, -6.2, 1.6, -1.0],
          })
        );

        // Bay N4 (Rear Center-East): Cantilevered Glass-Railing Balcony Stack
        rooms.push(
          mk({
            unit_label: f === 1 ? "108" : `${f}09`,
            floor: f,
            element_type: "unit",
            monthly_rent: 15800,
            door_wall: "S",
            has_balcony: true,
            balcony_side: "N",
            balcony_depth: 1.35,
            bounds: [1.6, -6.2, 5.2, -1.0],
          })
        );

        // Bay N5 (Rear-East Corner): Corner Suite (dark brick plinth on F1, stucco upper)
        rooms.push(
          mk({
            unit_label: f === 1 ? "109" : `${f}10`,
            floor: f,
            element_type: "unit",
            monthly_rent: 16200,
            material_type: f === 1 ? "brick" : "stucco",
            wall_color: f === 1 ? "#3b4048" : "#dce0e5",
            door_wall: "S",
            bounds: [5.2, -6.2, 9.0, -1.6],
          })
        );
      }

      return rooms;
    },
  },
  {
    id: "house_duplex_2f",
    name: "2-Story Residential Rental House / Townhouse",
    subtitle: "5 Rentable Rooms · Hip Roof + Porch Canopy · Living Hall & Indoor Stairs",
    badge: "Residential House",
    description:
      "Complete 2-story residential house/duplex with a 4-sloped Hip Roof, covered front porch with columns, ground-floor living/common area, indoor dog-leg staircase with upper slab cutout, and 5 rentable rooms.",
    architecture: {
      floor_height: 2.7,
      wall_material: "stucco",
      exterior_color: "#efe6d8",
      trim_color: "#2c353d",
      railing_style: "balusters",
      roof_type: "hip",
      roofs: [
        {
          type: "hip",
          floor: 2,
          bounds: [-5.6, -4.2, 5.6, 2.6],
          pitch_height: 1.75,
          overhang: 0.55,
          color: "#3b2f2f",
        },
        {
          type: "shed",
          floor: 1,
          bounds: [-3.2, 2.6, 3.2, 4.4],
          high_side: "N",
          pitch_height: 0.75,
          overhang: 0.35,
          color: "#3b2f2f",
        },
      ],
    },
    generateRooms: () => {
      const ts = Date.now();
      let seq = 1;
      const mk = (data) =>
        normalizeSpace({
          id: `new-temp-${ts}-${seq++}`,
          status: "vacant",
          monthly_rent: 0,
          height: 2.7,
          rotation: 0,
          roof_type: "hip",
          material_type: "stucco",
          wall_color: "#efe6d8",
          has_balcony: false,
          balcony_side: "S",
          balcony_depth: 1.0,
          tenant: null,
          ...data,
        });

      return [
        // ── FLOOR 1: Front Porch, Central Living Hall, Staircase & 2 Ground Rooms ──
        mk({
          unit_label: "Front Porch",
          floor: 1,
          element_type: "porch",
          bounds: [-3.2, 2.6, 3.2, 4.4],
          wall_color: "#cbd5e1",
        }),
        mk({
          unit_label: "Living & Dining Hall",
          floor: 1,
          element_type: "common_area",
          bounds: [-2.0, -1.2, 3.2, 2.6],
          door_wall: "S",
        }),
        mk({
          unit_label: "Indoor Stairs",
          floor: 1,
          element_type: "stairwell",
          bounds: [-2.0, -4.2, 0.6, -1.2],
        }),
        mk({
          unit_label: "Room 101 (Ground West)",
          floor: 1,
          element_type: "unit",
          monthly_rent: 8500,
          bounds: [-5.6, -4.2, -2.0, 2.6],
          door_wall: "E",
        }),
        mk({
          unit_label: "Room 102 (Ground East)",
          floor: 1,
          element_type: "unit",
          monthly_rent: 8000,
          bounds: [3.2, -4.2, 5.6, 2.6],
          door_wall: "W",
        }),
        mk({
          unit_label: "Kitchen & Utility",
          floor: 1,
          element_type: "common_area",
          bounds: [0.6, -4.2, 3.2, -1.2],
          door_wall: "S",
        }),

        // ── FLOOR 2: Upper Hallway, Open Stair Shaft & 3 Upper Bedrooms ──
        mk({
          unit_label: "F2 Upper Hallway",
          floor: 2,
          element_type: "hallway",
          bounds: [-2.0, -1.2, 2.2, 0.4],
        }),
        mk({
          unit_label: "F2 Stair Landing",
          floor: 2,
          element_type: "stairwell",
          bounds: [-2.0, -4.2, 0.6, -1.2],
        }),
        mk({
          unit_label: "Room 201 (Master Front)",
          floor: 2,
          element_type: "unit",
          monthly_rent: 11000,
          bounds: [-2.0, 0.4, 3.2, 2.6],
          door_wall: "N",
          has_balcony: true,
          balcony_side: "S",
          balcony_depth: 1.2,
        }),
        mk({
          unit_label: "Room 202 (West Wing)",
          floor: 2,
          element_type: "unit",
          monthly_rent: 9500,
          bounds: [-5.6, -4.2, -2.0, 2.6],
          door_wall: "E",
        }),
        mk({
          unit_label: "Room 203 (East Wing)",
          floor: 2,
          element_type: "unit",
          monthly_rent: 9000,
          bounds: [2.2, -4.2, 5.6, 2.6],
          door_wall: "W",
        }),
        mk({
          unit_label: "Room 204 (North Study)",
          floor: 2,
          element_type: "unit",
          monthly_rent: 7500,
          bounds: [0.6, -4.2, 2.2, -1.2],
          door_wall: "S",
        }),
      ];
    },
  },
  {
    id: "walkup_dorm_3f",
    name: "3-Story Walk-Up Dormitory (Gable Roof)",
    subtitle: "15 Studio Units · Cantilevered Walk-Up Corridors · Pitched Gable Roof",
    badge: "PH Standard Walk-Up",
    description:
      "3-story walk-up apartment/dormitory with a unified Pitched Gable Roof, 5 studio rooms per floor sharing exact interior partitions, continuous front exterior walk-up corridors with steel railings and support columns, and an east stairwell core.",
    architecture: {
      floor_height: 2.6,
      wall_material: "stucco",
      exterior_color: "#e5dacb",
      trim_color: "#1e293b",
      railing_style: "steel_grill",
      roof_type: "gable",
      roofs: [
        {
          type: "gable",
          floor: 3,
          bounds: [-7.0, -2.5, 9.4, 2.3],
          ridge_axis: "X",
          pitch_height: 1.65,
          overhang: 0.5,
          color: "#334155",
        },
      ],
    },
    generateRooms: () => {
      const rooms = [];
      const ts = Date.now();
      let seq = 1;
      const roomW = 2.8;

      for (let floor = 1; floor <= 3; floor++) {
        for (let i = 0; i < 5; i++) {
          const x1 = -7.0 + i * roomW;
          const x2 = x1 + roomW;
          const unitNum = `${floor}0${i + 1}`;
          rooms.push(
            normalizeSpace({
              id: `new-temp-${ts}-${seq++}`,
              unit_label: `Unit ${unitNum}`,
              floor,
              element_type: "unit",
              status: "vacant",
              monthly_rent: 6500,
              bounds: [x1, -2.5, x2, 0.9],
              height: 2.6,
              door_wall: "S",
              roof_type: "gable",
              material_type: "stucco",
              wall_color: "#e5dacb",
              has_balcony: false,
              tenant: null,
            })
          );
        }

        // Continuous Front Exterior Walk-Up Balcony Corridor
        rooms.push(
          normalizeSpace({
            id: `new-temp-${ts}-${seq++}`,
            unit_label: `F${floor} Walk-Up Corridor`,
            floor,
            element_type: "balcony_walkway",
            status: "vacant",
            monthly_rent: 0,
            bounds: [-7.0, 0.9, 7.0, 2.3],
            height: 2.6,
            material_type: "concrete",
            wall_color: "#334155",
            tenant: null,
          })
        );

        // East Wing Stairwell Core connecting smoothly to the corridor
        rooms.push(
          normalizeSpace({
            id: `new-temp-${ts}-${seq++}`,
            unit_label: `F${floor} Stairs`,
            floor,
            element_type: "stairwell",
            status: "vacant",
            monthly_rent: 0,
            bounds: [7.0, -2.5, 9.4, 2.3],
            height: 2.6,
            material_type: "concrete",
            wall_color: "#cbd5e1",
            tenant: null,
          })
        );
      }
      return rooms;
    },
  },
  {
    id: "central_hall_3f",
    name: "Central-Hallway Apartment Complex",
    subtitle: "18 Units · Double-Loaded Interior Hallway · Parapet Roof & Bulkhead",
    badge: "Mid-Rise Apartment",
    description:
      "3-story apartment building with a central interior hallway, 6 units per floor (3 North, 3 South) with doors automatically opening into the central corridor, private outer balconies, and a commercial parapet roof with stair bulkhead.",
    architecture: {
      floor_height: 2.6,
      wall_material: "concrete",
      exterior_color: "#dbe2e9",
      trim_color: "#1e293b",
      railing_style: "steel_grill",
      roof_type: "flat_parapet",
      roofs: [
        {
          type: "flat_parapet",
          floor: 3,
          bounds: [-7.2, -4.1, 4.8, 4.1],
          pitch_height: 0.85,
          overhang: 0.15,
          color: "#334155",
        },
      ],
    },
    generateRooms: () => {
      const rooms = [];
      const ts = Date.now();
      let seq = 1;
      const roomW = 3.2;

      for (let floor = 1; floor <= 3; floor++) {
        // Central Interior Hallway
        rooms.push(
          normalizeSpace({
            id: `new-temp-${ts}-${seq++}`,
            unit_label: `F${floor} Central Hallway`,
            floor,
            element_type: "hallway",
            status: "vacant",
            monthly_rent: 0,
            bounds: [-4.8, -0.8, 4.8, 0.8],
            height: 2.6,
            material_type: "concrete",
            wall_color: "#dbe2e9",
            tenant: null,
          })
        );

        // West Wing Stairwell Core
        rooms.push(
          normalizeSpace({
            id: `new-temp-${ts}-${seq++}`,
            unit_label: `F${floor} Stair Core`,
            floor,
            element_type: "stairwell",
            status: "vacant",
            monthly_rent: 0,
            bounds: [-7.2, -2.4, -4.8, 2.4],
            height: 2.6,
            material_type: "concrete",
            wall_color: "#cbd5e1",
            tenant: null,
          })
        );

        // 3 North Units (doors open South into Central Hallway, balconies on North)
        for (let i = 0; i < 3; i++) {
          const x1 = -4.8 + i * roomW;
          const x2 = x1 + roomW;
          rooms.push(
            normalizeSpace({
              id: `new-temp-${ts}-${seq++}`,
              unit_label: `Unit ${floor}0${i + 1}N`,
              floor,
              element_type: "unit",
              status: "vacant",
              monthly_rent: 8500,
              bounds: [x1, -4.1, x2, -0.8],
              height: 2.6,
              door_wall: "S",
              material_type: "concrete",
              wall_color: "#dbe2e9",
              has_balcony: floor > 1,
              balcony_side: "N",
              balcony_depth: 1.0,
              tenant: null,
            })
          );
        }

        // 3 South Units (doors open North into Central Hallway, balconies on South)
        for (let i = 0; i < 3; i++) {
          const x1 = -4.8 + i * roomW;
          const x2 = x1 + roomW;
          rooms.push(
            normalizeSpace({
              id: `new-temp-${ts}-${seq++}`,
              unit_label: `Unit ${floor}0${i + 4}S`,
              floor,
              element_type: "unit",
              status: "vacant",
              monthly_rent: 9000,
              bounds: [x1, 0.8, x2, 4.1],
              height: 2.6,
              door_wall: "N",
              material_type: "concrete",
              wall_color: "#dbe2e9",
              has_balcony: floor > 1,
              balcony_side: "S",
              balcony_depth: 1.1,
              tenant: null,
            })
          );
        }
      }
      return rooms;
    },
  },
  {
    id: "l_shape_compound_2f",
    name: "L-Shape Courtyard Commercial & Apartment Compound",
    subtitle: "12 Units · Multi-Wing Hip Roofs · Courtyard Breezeway & Corner Stairs",
    badge: "Courtyard Compound",
    description:
      "2-story L-shaped compound with multi-wing Hip Roofs, corner stairwell tower, wrap-around courtyard walkways with support columns, ground-floor commercial/studio units, and upper residential suites.",
    architecture: {
      floor_height: 2.7,
      wall_material: "brick",
      exterior_color: "#d8c3b0",
      trim_color: "#1e293b",
      railing_style: "steel_grill",
      roof_type: "hip",
      roofs: [
        {
          type: "hip",
          floor: 2,
          bounds: [-6.6, -5.4, 5.4, -0.8],
          pitch_height: 1.55,
          overhang: 0.45,
          color: "#475569",
        },
        {
          type: "hip",
          floor: 2,
          bounds: [-6.6, -0.8, -2.0, 5.2],
          pitch_height: 1.45,
          overhang: 0.45,
          color: "#475569",
        },
      ],
    },
    generateRooms: () => {
      const rooms = [];
      const ts = Date.now();
      let seq = 1;

      for (let floor = 1; floor <= 2; floor++) {
        // Corner Stairwell Core at NW Junction
        rooms.push(
          normalizeSpace({
            id: `new-temp-${ts}-${seq++}`,
            unit_label: `F${floor} Corner Stairs`,
            floor,
            element_type: "stairwell",
            status: "vacant",
            monthly_rent: 0,
            bounds: [-6.6, -5.4, -3.4, -0.8],
            height: 2.7,
            material_type: "concrete",
            wall_color: "#cbd5e1",
            tenant: null,
          })
        );

        // North Wing: 3 Units + Courtyard Walkway
        for (let i = 0; i < 3; i++) {
          const x1 = -3.4 + i * 2.93;
          const x2 = x1 + 2.93;
          rooms.push(
            normalizeSpace({
              id: `new-temp-${ts}-${seq++}`,
              unit_label: `Unit N${floor}0${i + 1}`,
              floor,
              element_type: "unit",
              status: "vacant",
              monthly_rent: floor === 1 ? 9500 : 7800,
              bounds: [x1, -5.4, x2, -2.1],
              height: 2.7,
              door_wall: "S",
              window_style: floor === 1 ? "storefront" : "standard",
              material_type: "brick",
              wall_color: "#d8c3b0",
              tenant: null,
            })
          );
        }

        rooms.push(
          normalizeSpace({
            id: `new-temp-${ts}-${seq++}`,
            unit_label: `F${floor} North Walkway`,
            floor,
            element_type: "balcony_walkway",
            status: "vacant",
            monthly_rent: 0,
            bounds: [-3.4, -2.1, 5.4, -0.8],
            height: 2.7,
            material_type: "concrete",
            wall_color: "#334155",
            tenant: null,
          })
        );

        // West Wing: 2 Units + Courtyard Walkway
        for (let j = 0; j < 2; j++) {
          const z1 = -0.8 + j * 3.0;
          const z2 = z1 + 3.0;
          rooms.push(
            normalizeSpace({
              id: `new-temp-${ts}-${seq++}`,
              unit_label: `Unit W${floor}0${j + 1}`,
              floor,
              element_type: "unit",
              status: "vacant",
              monthly_rent: 7500,
              bounds: [-6.6, z1, -3.3, z2],
              height: 2.7,
              door_wall: "E",
              material_type: "brick",
              wall_color: "#d8c3b0",
              tenant: null,
            })
          );
        }

        rooms.push(
          normalizeSpace({
            id: `new-temp-${ts}-${seq++}`,
            unit_label: `F${floor} West Walkway`,
            floor,
            element_type: "balcony_walkway",
            status: "vacant",
            monthly_rent: 0,
            bounds: [-3.3, -0.8, -2.0, 5.2],
            height: 2.7,
            material_type: "concrete",
            wall_color: "#334155",
            tenant: null,
          })
        );
      }
      return rooms;
    },
  },
];

/**
 * Parses and normalizes an Agent-drafted Blueprint JSON string (v2 or v3-bim)
 * into normalized rooms + building-level `architecture` metadata.
 */
export function parseAgentBlueprintJSON(rawJson) {
  const parsed = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
  const rawList = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.spaces)
      ? parsed.spaces
      : Array.isArray(parsed?.rooms)
        ? parsed.rooms
        : Array.isArray(parsed?.units)
          ? parsed.units
          : null;

  if (!rawList || rawList.length === 0) {
    throw new Error(
      "Blueprint JSON must contain an array of spaces/rooms/units."
    );
  }

  const ts = Date.now();
  const validElementTypes = new Set([
    "unit",
    "hallway",
    "balcony_walkway",
    "stairwell",
    "porch",
    "common_area",
    "lobby",
  ]);

  // First pass: normalize all bounds
  const initialSpaces = rawList.map((item, idx) => {
    const elType = validElementTypes.has(item.element_type)
      ? item.element_type
      : "unit";
    return normalizeSpace({
      id: item.id?.startsWith("new-temp-")
        ? item.id
        : `new-temp-${ts}-${idx + 1}`,
      unit_label: String(
        item.unit_label ||
          item.label ||
          item.name ||
          (elType === "unit" ? `Unit ${idx + 1}` : elType.toUpperCase())
      ),
      floor: Number(item.floor) || 1,
      element_type: elType,
      status: ["occupied", "overdue", "vacant"].includes(item.status)
        ? item.status
        : "vacant",
      monthly_rent: Number(item.monthly_rent ?? item.rent) || 0,
      x: item.x,
      z: item.z,
      width: item.width,
      depth: item.depth,
      bounds: item.bounds,
      height: Math.max(
        1.8,
        Number(item.height || parsed?.architecture?.floor_height || 2.6)
      ),
      rotation: Number(item.rotation) || 0,
      door_wall: item.door_wall || null,
      window_style: item.window_style || "standard",
      roof_type: ["flat", "triangle", "gable", "hip", "shed", "parapet", "open"].includes(
        item.roof_type
      )
        ? item.roof_type
        : parsed?.architecture?.roof_type || "gable",
      material_type:
        item.material_type || parsed?.architecture?.wall_material || "stucco",
      texture_url: item.texture_url || null,
      wall_color:
        item.wall_color || parsed?.architecture?.exterior_color || "#e2d9ce",
      has_balcony: Boolean(item.has_balcony),
      balcony_side: ["S", "N", "E", "W"].includes(item.balcony_side)
        ? item.balcony_side
        : "S",
      balcony_depth: Math.max(0.6, Number(item.balcony_depth) || 1.0),
      tenant: item.tenant || null,
    });
  });

  // Auto-center the building footprint around (0, 0) if the Agent defined coordinates
  // starting from [0, 0] in positive quadrant
  const minX = Math.min(...initialSpaces.map((s) => s.x1));
  const maxX = Math.max(...initialSpaces.map((s) => s.x2));
  const minZ = Math.min(...initialSpaces.map((s) => s.z1));
  const maxZ = Math.max(...initialSpaces.map((s) => s.z2));
  const offsetX = Math.abs((minX + maxX) / 2) > 1.5 ? -(minX + maxX) / 2 : 0;
  const offsetZ = Math.abs((minZ + maxZ) / 2) > 1.5 ? -(minZ + maxZ) / 2 : 0;

  const centeredSpaces =
    offsetX !== 0 || offsetZ !== 0
      ? initialSpaces.map((s) =>
          normalizeSpace({
            ...s,
            bounds: [
              s.x1 + offsetX,
              s.z1 + offsetZ,
              s.x2 + offsetX,
              s.z2 + offsetZ,
            ],
          })
        )
      : initialSpaces;

  // Also shift explicit roof bounds if auto-centered
  let architecture = parsed?.architecture ? { ...parsed.architecture } : null;
  if (architecture && Array.isArray(architecture.roofs) && (offsetX !== 0 || offsetZ !== 0)) {
    architecture.roofs = architecture.roofs.map((r) =>
      Array.isArray(r.bounds)
        ? {
            ...r,
            bounds: [
              r.bounds[0] + offsetX,
              r.bounds[1] + offsetZ,
              r.bounds[2] + offsetX,
              r.bounds[3] + offsetZ,
            ],
          }
        : r
    );
  }

  return {
    buildingName: parsed?.name || parsed?.building_name || null,
    buildingAddress: parsed?.address || null,
    architecture,
    rooms: centeredSpaces,
  };
}

/**
 * Serializes current building & spaces into a clean, Agent-ready v3.0-bim JSON string.
 */
export function serializeBlueprintJSON(building, rooms = []) {
  const normalized = rooms.map(normalizeSpace);
  const payload = {
    name: building?.name || "My Property",
    address: building?.address || "",
    schema_version: "3.0-bim",
    architecture: building?.architecture || {
      floor_height: 2.6,
      wall_material: "stucco",
      exterior_color: "#e2d9ce",
      railing_style: "steel_grill",
      roof_type: "gable",
    },
    spaces: normalized.map((r) => ({
      unit_label: r.unit_label,
      floor: r.floor || 1,
      element_type: r.element_type || "unit",
      status: r.status || "vacant",
      monthly_rent: r.monthly_rent || 0,
      bounds: [r.x1, r.z1, r.x2, r.z2],
      height: Number(Number(r.height || 2.6).toFixed(2)),
      door_wall: r.door_wall || undefined,
      window_style: r.window_style || undefined,
      material_type: r.material_type || "stucco",
      wall_color: r.wall_color || "#e2d9ce",
      has_balcony: !!r.has_balcony,
      balcony_side: r.has_balcony ? r.balcony_side || "S" : undefined,
      balcony_depth: r.has_balcony ? r.balcony_depth || 1.0 : undefined,
    })),
  };
  return JSON.stringify(payload, null, 2);
}
