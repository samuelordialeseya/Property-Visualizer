// Architectural Multi-Story Building Templates & Agent-Side Blueprint JSON Parser

export const ARCHITECTURAL_PRESETS = [
  {
    id: "walkup_dorm_3f",
    name: "3-Story Walk-Up Dormitory / Apartment",
    subtitle: "15 Units · Exterior Walk-Up Balcony Corridors · Side Stairwell Core",
    badge: "PH Standard Walk-Up",
    description:
      "Classic 3-story Philippine apartment/dormitory layout with 5 studio rooms per floor, continuous front walk-up balcony corridors with safety railings, and an east-wing stairwell.",
    generateRooms: () => {
      const rooms = [];
      const ts = Date.now();
      let seq = 1;
      const roomW = 2.8;
      const roomD = 3.4;
      const totalSpanW = roomW * 5; // 14m

      for (let floor = 1; floor <= 3; floor++) {
        // 5 Rentable Studio Units side-by-side along X
        for (let i = 0; i < 5; i++) {
          const x = -totalSpanW / 2 + roomW / 2 + i * roomW;
          const unitNum = `${floor}0${i + 1}`;
          rooms.push({
            id: `new-temp-${ts}-${seq++}`,
            unit_label: `Unit ${unitNum}`,
            floor,
            element_type: "unit",
            status: "vacant",
            monthly_rent: 6500,
            x: Math.round(x * 10) / 10,
            z: -0.8,
            width: roomW,
            depth: roomD,
            height: 2.2,
            rotation: 0,
            roof_type: floor === 3 ? "parapet" : "flat",
            material_type: "stucco",
            wall_color: "#d9ccbc",
            has_balcony: false,
            balcony_side: "S",
            balcony_depth: 1.0,
            tenant: null,
          });
        }

        // Front Walk-Up Exterior Corridor with Railing
        rooms.push({
          id: `new-temp-${ts}-${seq++}`,
          unit_label: `F${floor} Walk-Up Corridor`,
          floor,
          element_type: "balcony_walkway",
          status: "vacant",
          monthly_rent: 0,
          x: 0,
          z: -0.8 + roomD / 2 + 0.7,
          width: totalSpanW,
          depth: 1.4,
          height: 2.2,
          rotation: 0,
          roof_type: "flat",
          material_type: "concrete",
          wall_color: "#334155",
          has_balcony: false,
          balcony_side: "S",
          balcony_depth: 1.0,
          tenant: null,
        });

        // East Wing Stairwell Core
        rooms.push({
          id: `new-temp-${ts}-${seq++}`,
          unit_label: `F${floor} Stairs`,
          floor,
          element_type: "stairwell",
          status: "vacant",
          monthly_rent: 0,
          x: totalSpanW / 2 + 1.2,
          z: -0.1,
          width: 2.4,
          depth: roomD + 1.4,
          height: 2.2,
          rotation: 0,
          roof_type: "flat",
          material_type: "concrete",
          wall_color: "#475569",
          has_balcony: false,
          balcony_side: "S",
          balcony_depth: 1.0,
          tenant: null,
        });
      }
      return rooms;
    },
  },
  {
    id: "central_hall_3f",
    name: "Central-Hallway Apartment Complex",
    subtitle: "18 Units · Central Interior Corridor · Private Balconies · Parapet Roof",
    badge: "Double-Loaded Mid-Rise",
    description:
      "3-story mid-rise apartment with a central double-loaded interior hallway, 6 units per floor (3 North, 3 South) featuring private cantilevered balconies, and a west stairwell core.",
    generateRooms: () => {
      const rooms = [];
      const ts = Date.now();
      let seq = 1;
      const roomW = 3.2;
      const roomD = 3.2;
      const hallD = 1.6;
      const spanW = roomW * 3; // 9.6m

      for (let floor = 1; floor <= 3; floor++) {
        // Central Interior Hallway
        rooms.push({
          id: `new-temp-${ts}-${seq++}`,
          unit_label: `F${floor} Central Hallway`,
          floor,
          element_type: "hallway",
          status: "vacant",
          monthly_rent: 0,
          x: 0,
          z: 0,
          width: spanW,
          depth: hallD,
          height: 2.2,
          rotation: 0,
          roof_type: "flat",
          material_type: "concrete",
          wall_color: "#334155",
          has_balcony: false,
          balcony_side: "S",
          balcony_depth: 1.0,
          tenant: null,
        });

        // West Stairwell Core
        rooms.push({
          id: `new-temp-${ts}-${seq++}`,
          unit_label: `F${floor} Main Stairs`,
          floor,
          element_type: "stairwell",
          status: "vacant",
          monthly_rent: 0,
          x: -spanW / 2 - 1.2,
          z: 0,
          width: 2.4,
          depth: roomD * 2 + hallD,
          height: 2.2,
          rotation: 0,
          roof_type: "parapet",
          material_type: "concrete",
          wall_color: "#475569",
          has_balcony: false,
          balcony_side: "S",
          balcony_depth: 1.0,
          tenant: null,
        });

        // North Row Units (3 units facing North with North private balconies)
        for (let i = 0; i < 3; i++) {
          const x = -spanW / 2 + roomW / 2 + i * roomW;
          const unitNum = `${floor}0${i + 1}`;
          rooms.push({
            id: `new-temp-${ts}-${seq++}`,
            unit_label: `Unit ${unitNum}`,
            floor,
            element_type: "unit",
            status: "vacant",
            monthly_rent: 9500,
            x: Math.round(x * 10) / 10,
            z: -(hallD / 2 + roomD / 2),
            width: roomW,
            depth: roomD,
            height: 2.2,
            rotation: 0,
            roof_type: floor === 3 ? "parapet" : "flat",
            material_type: "stucco",
            wall_color: "#ffffff",
            has_balcony: true,
            balcony_side: "N",
            balcony_depth: 1.0,
            tenant: null,
          });
        }

        // South Row Units (3 units facing South with South private balconies)
        for (let i = 0; i < 3; i++) {
          const x = -spanW / 2 + roomW / 2 + i * roomW;
          const unitNum = `${floor}0${i + 4}`;
          rooms.push({
            id: `new-temp-${ts}-${seq++}`,
            unit_label: `Unit ${unitNum}`,
            floor,
            element_type: "unit",
            status: "vacant",
            monthly_rent: 9500,
            x: Math.round(x * 10) / 10,
            z: hallD / 2 + roomD / 2,
            width: roomW,
            depth: roomD,
            height: 2.2,
            rotation: 0,
            roof_type: floor === 3 ? "parapet" : "flat",
            material_type: "stucco",
            wall_color: "#ffffff",
            has_balcony: true,
            balcony_side: "S",
            balcony_depth: 1.0,
            tenant: null,
          });
        }
      }
      return rooms;
    },
  },
  {
    id: "courtyard_l_2f",
    name: "L-Shaped Courtyard Residences",
    subtitle: "12 Units · Corner Stairwell · Courtyard Walkways & Balconies",
    badge: "Boutique Courtyard",
    description:
      "2-story L-shaped boutique apartment complex wrapping an open courtyard, with 6 units per floor, corner stair access, and courtyard-facing walkways.",
    generateRooms: () => {
      const rooms = [];
      const ts = Date.now();
      let seq = 1;

      for (let floor = 1; floor <= 2; floor++) {
        // North Wing (4 units along X)
        for (let i = 0; i < 4; i++) {
          const x = -3.0 + i * 3.0;
          rooms.push({
            id: `new-temp-${ts}-${seq++}`,
            unit_label: `Unit ${floor}0${i + 1}`,
            floor,
            element_type: "unit",
            status: "vacant",
            monthly_rent: 8500,
            x,
            z: -3.0,
            width: 3.0,
            depth: 3.2,
            height: 2.2,
            rotation: 0,
            roof_type: floor === 2 ? "parapet" : "flat",
            material_type: "stucco",
            wall_color: "#4a5a66",
            has_balcony: true,
            balcony_side: "S",
            balcony_depth: 0.9,
            tenant: null,
          });
        }

        // West Wing (2 units extending South)
        for (let j = 0; j < 2; j++) {
          const z = 0.2 + j * 3.0;
          rooms.push({
            id: `new-temp-${ts}-${seq++}`,
            unit_label: `Unit ${floor}0${j + 5}`,
            floor,
            element_type: "unit",
            status: "vacant",
            monthly_rent: 9000,
            x: -3.0,
            z,
            width: 3.2,
            depth: 3.0,
            height: 2.2,
            rotation: 0,
            roof_type: floor === 2 ? "parapet" : "flat",
            material_type: "stucco",
            wall_color: "#4a5a66",
            has_balcony: true,
            balcony_side: "E",
            balcony_depth: 0.9,
            tenant: null,
          });
        }

        // Corner Stairwell at Northwest Junction
        rooms.push({
          id: `new-temp-${ts}-${seq++}`,
          unit_label: `F${floor} Corner Stairs`,
          floor,
          element_type: "stairwell",
          status: "vacant",
          monthly_rent: 0,
          x: -6.0,
          z: -3.0,
          width: 2.8,
          depth: 3.2,
          height: 2.2,
          rotation: 0,
          roof_type: "parapet",
          material_type: "concrete",
          wall_color: "#334155",
          has_balcony: false,
          balcony_side: "S",
          balcony_depth: 1.0,
          tenant: null,
        });
      }
      return rooms;
    },
  },
];

// Parse and normalize an Agent-drafted Blueprint JSON string into editorRooms
export function parseAgentBlueprintJSON(rawJson) {
  const parsed = JSON.parse(rawJson);
  const rawList = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.rooms)
      ? parsed.rooms
      : Array.isArray(parsed?.units)
        ? parsed.units
        : null;

  if (!rawList || rawList.length === 0) {
    throw new Error("Blueprint JSON must contain an array of rooms/units.");
  }

  const ts = Date.now();
  const normalizedRooms = rawList.map((item, idx) => {
    const elType = ["unit", "hallway", "balcony_walkway", "stairwell"].includes(item.element_type)
      ? item.element_type
      : "unit";
    return {
      id: `new-temp-${ts}-${idx + 1}`,
      unit_label: String(item.unit_label || item.label || item.name || (elType === "unit" ? `Unit ${idx + 1}` : elType.toUpperCase())),
      floor: Number(item.floor) || 1,
      element_type: elType,
      status: ["occupied", "overdue", "vacant"].includes(item.status) ? item.status : "vacant",
      monthly_rent: Number(item.monthly_rent || item.rent) || 0,
      x: Number(item.x) || 0,
      z: Number(item.z) || 0,
      width: Math.max(0.8, Number(item.width) || 2.8),
      depth: Math.max(0.8, Number(item.depth) || 3.2),
      height: Math.max(1.0, Number(item.height) || 2.2),
      rotation: Number(item.rotation) || 0,
      roof_type: ["flat", "triangle", "parapet", "open"].includes(item.roof_type) ? item.roof_type : "flat",
      material_type: item.material_type || "stucco",
      texture_url: item.texture_url || null,
      wall_color: item.wall_color || "#4a5a66",
      has_balcony: Boolean(item.has_balcony),
      balcony_side: ["S", "N", "E", "W"].includes(item.balcony_side) ? item.balcony_side : "S",
      balcony_depth: Math.max(0.6, Number(item.balcony_depth) || 1.0),
      tenant: item.tenant || null,
    };
  });

  return {
    buildingName: parsed?.name || parsed?.building_name || null,
    buildingAddress: parsed?.address || null,
    rooms: normalizedRooms,
  };
}

// Serialize current editorRooms into a clean, shareable Agent Blueprint JSON string
export function serializeBlueprintJSON(building, rooms = []) {
  const payload = {
    name: building?.name || "My Building",
    address: building?.address || "",
    schema_version: "2.0-cutaway",
    rooms: rooms.map((r) => ({
      unit_label: r.unit_label,
      floor: r.floor || 1,
      element_type: r.element_type || "unit",
      status: r.status || "vacant",
      monthly_rent: r.monthly_rent || 0,
      x: Number(Number(r.x || 0).toFixed(2)),
      z: Number(Number(r.z || 0).toFixed(2)),
      width: Number(Number(r.width || 2.6).toFixed(2)),
      depth: Number(Number(r.depth || 3.2).toFixed(2)),
      height: Number(Number(r.height || 2.2).toFixed(2)),
      rotation: r.rotation || 0,
      roof_type: r.roof_type || "flat",
      material_type: r.material_type || "stucco",
      wall_color: r.wall_color || "#4a5a66",
      has_balcony: !!r.has_balcony,
      balcony_side: r.balcony_side || "S",
      balcony_depth: r.balcony_depth || 1.0,
    })),
  };
  return JSON.stringify(payload, null, 2);
}
