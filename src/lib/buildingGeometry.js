import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const SNAP = 0.02; // 2cm coordinate snapping tolerance
const snapVal = (v) => Math.round(Number(v || 0) / SNAP) * SNAP;

const CIRCULATION_TYPES = new Set([
  "hallway",
  "balcony_walkway",
  "porch",
  "stairwell",
  "lobby",
]);

const OPEN_AIR_TYPES = new Set(["balcony_walkway", "porch"]);

/**
 * Safely merges an array of THREE.BufferGeometry instances by converting all
 * to non-indexed geometries with consistent (position, normal, uv) attributes.
 */
export function safeMergeGeometries(geometries) {
  if (!geometries || geometries.length === 0) return null;
  const normalized = [];

  for (const geo of geometries) {
    if (!geo) continue;
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const pos = g.getAttribute("position");
    if (!pos || pos.count === 0) {
      g.dispose();
      continue;
    }
    if (!g.getAttribute("normal")) {
      g.computeVertexNormals();
    }
    if (!g.getAttribute("uv")) {
      const uvs = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uvs[i * 2] = pos.getX(i) * 0.5;
        uvs[i * 2 + 1] = pos.getY(i) * 0.5;
      }
      g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    }
    // Keep only standard attributes so mergeGeometries never mismatches
    const allowed = new Set(["position", "normal", "uv"]);
    for (const key of Object.keys(g.attributes)) {
      if (!allowed.has(key)) {
        g.deleteAttribute(key);
      }
    }
    normalized.push(g);
  }

  if (normalized.length === 0) return null;
  if (normalized.length === 1) return normalized[0];

  const merged = mergeGeometries(normalized, false);
  for (const g of normalized) {
    g.dispose();
  }
  return merged;
}

/**
 * Normalizes a space (unit, hallway, stairwell, porch, etc.) so it always has
 * both center-based { x, z, width, depth } and corner-based { x1, z1, x2, z2 }.
 */
export function normalizeSpace(raw) {
  let x1, z1, x2, z2;
  if (Array.isArray(raw.bounds) && raw.bounds.length === 4) {
    const [bx1, bz1, bx2, bz2] = raw.bounds.map(Number);
    x1 = snapVal(Math.min(bx1, bx2));
    x2 = snapVal(Math.max(bx1, bx2));
    z1 = snapVal(Math.min(bz1, bz2));
    z2 = snapVal(Math.max(bz1, bz2));
  } else {
    const cx = Number(raw.x || 0);
    const cz = Number(raw.z || 0);
    const rot = ((Number(raw.rotation || 0) % 180) + 180) % 180;
    const isRotated90 = Math.abs(rot - 90) < 15;
    const rawW = Math.max(0.8, Number(raw.width || 2.8));
    const rawD = Math.max(0.8, Number(raw.depth || 3.2));
    const w = isRotated90 ? rawD : rawW;
    const d = isRotated90 ? rawW : rawD;
    x1 = snapVal(cx - w / 2);
    x2 = snapVal(cx + w / 2);
    z1 = snapVal(cz - d / 2);
    z2 = snapVal(cz + d / 2);
  }

  const width = snapVal(Math.max(0.6, x2 - x1));
  const depth = snapVal(Math.max(0.6, z2 - z1));
  const x = snapVal((x1 + x2) / 2);
  const z = snapVal((z1 + z2) / 2);

  return {
    ...raw,
    x,
    z,
    width,
    depth,
    x1,
    z1,
    x2,
    z2,
    bounds: [x1, z1, x2, z2],
    floor: Number(raw.floor) || 1,
    element_type: raw.element_type || "unit",
  };
}

/**
 * Welds near-collinear coordinates within `tolerance` meters so slightly
 * misaligned rooms snap cleanly onto shared partition lines.
 */
function weldCoordinateList(values, tolerance = 0.09) {
  const sorted = [...values].sort((a, b) => a - b);
  const clusters = [];
  for (const v of sorted) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(v - last.mean) > tolerance) {
      clusters.push({ sum: v, count: 1, mean: v, members: [v] });
    } else {
      last.sum += v;
      last.count += 1;
      last.mean = snapVal(last.sum / last.count);
      last.members.push(v);
    }
  }
  const map = new Map();
  for (const c of clusters) {
    for (const m of c.members) {
      map.set(m, c.mean);
    }
  }
  return (val) => map.get(val) ?? snapVal(val);
}

/**
 * Solves the complete 2D/3D architectural topology for a single floor:
 * - Deduplicates shared interior walls
 * - Automatically places unit entry doors on hallway/walkway-facing walls
 * - Punches exterior windows, sills, canopies, and AC condensers
 * - Generates open railings and support columns on exterior walkways/porches
 * - Computes floor slab bounds and subtracts stairwell shaft voids from below
 */
export function solveFloorTopology(
  rawFloorSpaces = [],
  floorNumber = 1,
  allRawSpaces = [],
  architecture = {}
) {
  const normalizedRaw = rawFloorSpaces.map(normalizeSpace);
  if (normalizedRaw.length === 0) {
    return {
      floorNumber,
      spaces: [],
      walls: [],
      railings: [],
      columns: [],
      doors: [],
      windows: [],
      slabPolygons: [],
      stairVoids: [],
      bounds: { minX: -5, maxX: 5, minZ: -4, maxZ: 4, width: 10, depth: 8 },
    };
  }

  // 1. Weld close X and Z lines so adjacent rooms share exact coordinates
  const rawXs = [];
  const rawZs = [];
  for (const s of normalizedRaw) {
    rawXs.push(s.x1, s.x2);
    rawZs.push(s.z1, s.z2);
  }
  const mapX = weldCoordinateList(rawXs, 0.09);
  const mapZ = weldCoordinateList(rawZs, 0.09);

  const spaces = normalizedRaw.map((s) => {
    const x1 = mapX(s.x1);
    const x2 = Math.max(x1 + 0.6, mapX(s.x2));
    const z1 = mapZ(s.z1);
    const z2 = Math.max(z1 + 0.6, mapZ(s.z2));
    return {
      ...s,
      x1,
      x2,
      z1,
      z2,
      x: snapVal((x1 + x2) / 2),
      z: snapVal((z1 + z2) / 2),
      width: snapVal(x2 - x1),
      depth: snapVal(z2 - z1),
      bounds: [x1, z1, x2, z2],
    };
  });

  // Collect all unique split coordinates
  const allXs = Array.from(
    new Set(spaces.flatMap((s) => [s.x1, s.x2]))
  ).sort((a, b) => a - b);
  const allZs = Array.from(
    new Set(spaces.flatMap((s) => [s.z1, s.z2]))
  ).sort((a, b) => a - b);

  const minX = allXs[0] ?? -5;
  const maxX = allXs[allXs.length - 1] ?? 5;
  const minZ = allZs[0] ?? -4;
  const maxZ = allZs[allZs.length - 1] ?? 4;

  // 2. Decompose each space's 4 edges into atomic collinear segments
  // Horizontal edges at constant Z:
  //   North edge of space (z = s.z1): space is on the +Z side (sidePos)
  //   South edge of space (z = s.z2): space is on the -Z side (sideNeg)
  // Vertical edges at constant X:
  //   West edge of space (x = s.x1): space is on the +X side (sidePos)
  //   East edge of space (x = s.x2): space is on the -X side (sideNeg)
  const hMap = new Map(); // key: `${z}_${xA}_${xB}`
  const vMap = new Map(); // key: `${x}_${zA}_${zB}`

  const getHSeg = (z, xA, xB) => {
    const key = `${z.toFixed(2)}_${xA.toFixed(2)}_${xB.toFixed(2)}`;
    if (!hMap.has(key)) {
      hMap.set(key, {
        orientation: "H",
        coord: z,
        start: xA,
        end: xB,
        sideNeg: null, // Space on North (-Z) side
        sidePos: null, // Space on South (+Z) side
      });
    }
    return hMap.get(key);
  };

  const getVSeg = (x, zA, zB) => {
    const key = `${x.toFixed(2)}_${zA.toFixed(2)}_${zB.toFixed(2)}`;
    if (!vMap.has(key)) {
      vMap.set(key, {
        orientation: "V",
        coord: x,
        start: zA,
        end: zB,
        sideNeg: null, // Space on West (-X) side
        sidePos: null, // Space on East (+X) side
      });
    }
    return vMap.get(key);
  };

  for (const s of spaces) {
    const xs = allXs.filter((x) => x >= s.x1 - 0.001 && x <= s.x2 + 0.001);
    for (let i = 0; i < xs.length - 1; i++) {
      const xA = xs[i];
      const xB = xs[i + 1];
      if (xB - xA < 0.02) continue;
      // North edge of s -> s occupies z > z1 (sidePos)
      const nSeg = getHSeg(s.z1, xA, xB);
      if (!nSeg.sidePos || s.element_type === "unit") nSeg.sidePos = s;
      // South edge of s -> s occupies z < z2 (sideNeg)
      const sSeg = getHSeg(s.z2, xA, xB);
      if (!sSeg.sideNeg || s.element_type === "unit") sSeg.sideNeg = s;
    }

    const zs = allZs.filter((z) => z >= s.z1 - 0.001 && z <= s.z2 + 0.001);
    for (let i = 0; i < zs.length - 1; i++) {
      const zA = zs[i];
      const zB = zs[i + 1];
      if (zB - zA < 0.02) continue;
      // West edge of s -> s occupies x > x1 (sidePos)
      const wSeg = getVSeg(s.x1, zA, zB);
      if (!wSeg.sidePos || s.element_type === "unit") wSeg.sidePos = s;
      // East edge of s -> s occupies x < x2 (sideNeg)
      const eSeg = getVSeg(s.x2, zA, zB);
      if (!eSeg.sideNeg || s.element_type === "unit") eSeg.sideNeg = s;
    }
  }

  // 3. Merge contiguous atomic segments that share the exact same (sideNeg, sidePos) pair
  const mergeAtomicSegments = (atomicList) => {
    const grouped = new Map();
    for (const seg of atomicList) {
      const k = `${seg.orientation}_${seg.coord.toFixed(2)}_${seg.sideNeg?.id || "ext"}_${seg.sidePos?.id || "ext"}`;
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k).push(seg);
    }

    const merged = [];
    for (const list of grouped.values()) {
      list.sort((a, b) => a.start - b.start);
      let curr = { ...list[0] };
      for (let i = 1; i < list.length; i++) {
        const next = list[i];
        if (Math.abs(next.start - curr.end) < 0.03) {
          curr.end = next.end;
        } else {
          curr.length = snapVal(curr.end - curr.start);
          curr.mid = snapVal((curr.start + curr.end) / 2);
          merged.push(curr);
          curr = { ...next };
        }
      }
      curr.length = snapVal(curr.end - curr.start);
      curr.mid = snapVal((curr.start + curr.end) / 2);
      merged.push(curr);
    }
    return merged;
  };

  const allSegments = [
    ...mergeAtomicSegments(Array.from(hMap.values())),
    ...mergeAtomicSegments(Array.from(vMap.values())),
  ];

  // 4. Determine which wall segment gets the entry door for each rentable unit / room
  const unitDoorSegmentMap = new Map(); // unitId -> segment

  // Helper to get compass side ("N" | "S" | "W" | "E") of a segment relative to a space
  const getCompassSideForSpace = (seg, space) => {
    if (seg.orientation === "H") {
      return seg.sidePos?.id === space.id ? "N" : "S";
    }
    return seg.sidePos?.id === space.id ? "W" : "E";
  };

  for (const space of spaces) {
    if (CIRCULATION_TYPES.has(space.element_type)) continue;

    // Find all segments bordering this unit
    const candidateSegs = allSegments.filter(
      (seg) =>
        (seg.sideNeg?.id === space.id || seg.sidePos?.id === space.id) &&
        seg.length >= 0.85
    );
    if (candidateSegs.length === 0) continue;

    // Score segments:
    // Priority 1: Explicit `space.door_wall` ("N", "S", "E", "W")
    // Priority 2: Shared with a hallway / balcony_walkway / porch / lobby
    // Priority 3: Shared with a common_area (e.g. bedroom opening into living room in a house)
    // Priority 4: On Floor 1, exterior street-facing wall ("S") if no hallway exists
    let bestSeg = null;
    let bestScore = -999;

    for (const seg of candidateSegs) {
      const other =
        seg.sideNeg?.id === space.id ? seg.sidePos : seg.sideNeg;
      const compass = getCompassSideForSpace(seg, space);
      let score = seg.length * 0.5;

      if (space.door_wall && compass === space.door_wall.toUpperCase()) {
        score += 100;
      }
      if (other) {
        if (
          other.element_type === "hallway" ||
          other.element_type === "balcony_walkway" ||
          other.element_type === "porch" ||
          other.element_type === "lobby"
        ) {
          score += 50;
        } else if (other.element_type === "common_area") {
          score += 35;
        } else if (other.element_type === "stairwell") {
          score += 20;
        } else {
          // Shared between two private units: avoid putting a door unless explicitly requested
          score -= 40;
        }
      } else {
        // Exterior wall: only put a door on Floor 1 or if unit has a balcony on this side
        if (floorNumber === 1) {
          score += compass === "S" ? 18 : 8;
        } else {
          score -= 30;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestSeg = seg;
      }
    }

    if (bestSeg && bestScore > 0) {
      unitDoorSegmentMap.set(space.id, bestSeg);
    }
  }

  // Track which units have already received an AC condenser so each unit gets at most 1
  const unitsWithAC = new Set();

  // 5. Classify segments into Walls, Doors, Windows, and Open Railings
  const walls = [];
  const railings = [];
  const doors = [];
  const windows = [];
  const columnCoords = new Map();

  const addColumn = (x, z, style = "concrete") => {
    const key = `${x.toFixed(2)}_${z.toFixed(2)}`;
    if (!columnCoords.has(key)) {
      columnCoords.set(key, { x, z, style });
    }
  };

  for (const seg of allSegments) {
    const { sideNeg, sidePos, orientation, coord, start, end, length, mid } = seg;

    // CASE A: Internal edge between two spaces
    if (sideNeg && sidePos) {
      const negCirc = CIRCULATION_TYPES.has(sideNeg.element_type);
      const posCirc = CIRCULATION_TYPES.has(sidePos.element_type);

      // 1. Two circulation spaces touching (e.g. hallway + stairwell, or hallway + hallway):
      // Leave completely open so people can walk seamlessly between them!
      if (negCirc && posCirc) {
        continue;
      }

      // 2. Interior wall (either Unit <-> Circulation or Unit <-> Unit)
      const isExteriorWalkwayBoundary =
        OPEN_AIR_TYPES.has(sideNeg.element_type) ||
        OPEN_AIR_TYPES.has(sidePos.element_type);

      const wallThickness = isExteriorWalkwayBoundary ? 0.16 : 0.12;
      const openings = [];

      // Check if either space has assigned its entry door to this segment
      const doorOwner =
        unitDoorSegmentMap.get(sideNeg.id) === seg
          ? sideNeg
          : unitDoorSegmentMap.get(sidePos.id) === seg
            ? sidePos
            : null;

      if (doorOwner && length >= 0.85) {
        const doorW = Math.min(0.9, length - 0.2);
        const doorH = 2.05;
        // Offset slightly if segment is wide enough to leave room for a window next to door
        const doorCenter =
          isExteriorWalkwayBoundary && length >= 2.3
            ? start + Math.min(0.85, length * 0.32)
            : mid;

        const swingDir = doorOwner.id === sideNeg.id ? -1 : 1;
        const doorObj = {
          id: `door_${doorOwner.id}`,
          unitId: doorOwner.id,
          unitLabel: doorOwner.unit_label,
          orientation,
          coord,
          center: snapVal(doorCenter),
          width: doorW,
          height: doorH,
          sill: 0,
          swingDir,
          isExterior: isExteriorWalkwayBoundary,
        };
        openings.push({ type: "door", ...doorObj });
        doors.push(doorObj);

        // If this wall faces an open exterior walk-up corridor and is wide enough,
        // also punch a bedroom window alongside the door!
        if (isExteriorWalkwayBoundary && length >= 2.3) {
          const winW = Math.min(1.05, length - doorW - 0.55);
          const winCenter = end - Math.max(0.75, winW / 2 + 0.25);
          if (winW >= 0.65 && Math.abs(winCenter - doorCenter) > (doorW + winW) / 2 + 0.12) {
            const winObj = {
              id: `win_walkway_${doorOwner.id}`,
              unitId: doorOwner.id,
              orientation,
              coord,
              center: snapVal(winCenter),
              width: winW,
              height: 1.05,
              sill: 0.9,
              outwardSign: doorOwner.id === sideNeg.id ? 1 : -1,
              hasCanopy: false,
              hasAC: false,
            };
            openings.push({ type: "window", ...winObj });
            windows.push(winObj);
          }
        }
      }

      walls.push({
        orientation,
        coord,
        start,
        end,
        length,
        mid,
        thickness: wallThickness,
        isExterior: isExteriorWalkwayBoundary,
        color:
          sideNeg.wall_color ||
          sidePos.wall_color ||
          architecture.exterior_color ||
          "#e2d9ce",
        materialType:
          sideNeg.material_type ||
          sidePos.material_type ||
          architecture.wall_material ||
          "stucco",
        openings,
        sideNegId: sideNeg.id,
        sidePosId: sidePos.id,
      });
      continue;
    }

    // CASE B: Exterior boundary edge (only one side has a space)
    const space = sideNeg || sidePos;
    if (!space) continue;
    // Outward normal sign (+1 means +Z or +X points outside the building)
    const outwardSign = sideNeg ? 1 : -1;
    const compass =
      orientation === "H"
        ? outwardSign === 1
          ? "S"
          : "N"
        : outwardSign === 1
          ? "E"
          : "W";

    // 1. Open-air Walk-Up Corridor or Porch exterior edge -> Railing + Structural Columns!
    if (OPEN_AIR_TYPES.has(space.element_type)) {
      const hasGroundEntryGap =
        floorNumber === 1 && compass === "S" && length >= 2.4;

      railings.push({
        orientation,
        coord,
        start,
        end,
        length,
        mid,
        outwardSign,
        compass,
        style: architecture.railing_style || "steel_grill",
        hasEntryGap: hasGroundEntryGap,
        spaceId: space.id,
      });

      // Place structural support columns at corners and every ~3.5m bay
      const bayCount = Math.max(1, Math.round(length / 3.4));
      for (let i = 0; i <= bayCount; i++) {
        const pos = start + (length * i) / bayCount;
        if (orientation === "H") {
          addColumn(pos, coord - outwardSign * 0.1);
        } else {
          addColumn(coord - outwardSign * 0.1, pos);
        }
      }
      continue;
    }

    // 2. Solid Exterior Wall (Unit, Common Area, Interior Hallway, or Stairwell)
    const openings = [];
    const hasDoorHere = unitDoorSegmentMap.get(space.id) === seg;

    // Check if unit has a private cantilevered balcony on this exterior face
    const hasPrivateBalconyHere =
      space.element_type === "unit" &&
      space.has_balcony &&
      (space.balcony_side || "S").toUpperCase() === compass;

    if (hasDoorHere && length >= 0.9) {
      const doorW = Math.min(0.92, length - 0.24);
      const doorH = 2.08;
      const doorCenter = length >= 2.5 ? start + 0.85 : mid;
      const doorObj = {
        id: `door_ext_${space.id}`,
        unitId: space.id,
        unitLabel: space.unit_label,
        orientation,
        coord,
        center: snapVal(doorCenter),
        width: doorW,
        height: doorH,
        sill: 0,
        swingDir: -outwardSign,
        isExterior: true,
      };
      openings.push({ type: "door", ...doorObj });
      doors.push(doorObj);

      if (length >= 2.5) {
        const winW = Math.min(1.15, length - doorW - 0.6);
        const winCenter = end - Math.max(0.8, winW / 2 + 0.3);
        const winObj = {
          id: `win_ext_${space.id}_${compass}`,
          unitId: space.id,
          orientation,
          coord,
          center: snapVal(winCenter),
          width: winW,
          height: 1.15,
          sill: 0.88,
          outwardSign,
          hasCanopy: true,
          hasAC: !unitsWithAC.has(space.id),
        };
        if (winObj.hasAC) unitsWithAC.add(space.id);
        openings.push({ type: "window", ...winObj });
        windows.push(winObj);
      }
    } else if (hasPrivateBalconyHere && length >= 1.4) {
      // Sliding glass balcony door
      const glassW = Math.min(1.5, length - 0.4);
      const winObj = {
        id: `balcony_door_${space.id}_${compass}`,
        unitId: space.id,
        orientation,
        coord,
        center: mid,
        width: glassW,
        height: 2.02,
        sill: 0.06,
        outwardSign,
        isSlidingDoor: true,
        hasCanopy: false,
        hasAC: !unitsWithAC.has(space.id) && length >= 2.5,
      };
      if (winObj.hasAC) unitsWithAC.add(space.id);
      openings.push({ type: "window", ...winObj });
      windows.push(winObj);
    } else if (
      (space.element_type === "unit" || space.element_type === "common_area") &&
      length >= 1.3
    ) {
      const isStorefront = space.window_style === "storefront";
      // Standard exterior architectural windows (1 window or 2 symmetric windows on wide walls)
      const numWindows = isStorefront ? 1 : length >= 4.4 ? 2 : 1;
      const winW = isStorefront
        ? Math.max(1.2, length - 0.5)
        : numWindows === 2
          ? 1.25
          : Math.min(1.45, length * 0.48);
      const winH = isStorefront ? 2.12 : 1.25;
      const sill = isStorefront ? 0.12 : 0.82;

      for (let wIdx = 0; wIdx < numWindows; wIdx++) {
        const winCenter =
          numWindows === 1
            ? mid
            : start + (length * (wIdx + 1)) / (numWindows + 1);
        const assignAC =
          !isStorefront &&
          wIdx === 0 &&
          !unitsWithAC.has(space.id) &&
          space.element_type === "unit";
        if (assignAC) unitsWithAC.add(space.id);

        const winObj = {
          id: `win_${space.id}_${compass}_${wIdx}`,
          unitId: space.id,
          orientation,
          coord,
          center: snapVal(winCenter),
          width: winW,
          height: winH,
          sill,
          outwardSign,
          isStorefront,
          hasCanopy: isStorefront && floorNumber === 1,
          hasAC: assignAC,
        };
        openings.push({ type: "window", ...winObj });
        windows.push(winObj);
      }
    } else if (space.element_type === "stairwell" && length >= 1.2) {
      // Tall vertical stairwell lighting window
      if (floorNumber === 1 && compass === "S") {
        // Ground-floor stairwell entrance opening
        const doorObj = {
          id: `stair_entry_${space.id}`,
          unitId: space.id,
          unitLabel: "STAIRS",
          orientation,
          coord,
          center: mid,
          width: Math.min(1.1, length - 0.3),
          height: 2.1,
          sill: 0,
          swingDir: -outwardSign,
          isExterior: true,
        };
        openings.push({ type: "door", ...doorObj });
        doors.push(doorObj);
      } else {
        const winObj = {
          id: `win_stair_${space.id}_${compass}`,
          unitId: space.id,
          orientation,
          coord,
          center: mid,
          width: Math.min(0.75, length * 0.4),
          height: 1.45,
          sill: 0.65,
          outwardSign,
          hasCanopy: false,
          hasAC: false,
        };
        openings.push({ type: "window", ...winObj });
        windows.push(winObj);
      }
    } else if (space.element_type === "hallway" && length >= 1.1) {
      // End-of-corridor ventilation window
      const winObj = {
        id: `win_hall_${space.id}_${compass}`,
        unitId: space.id,
        orientation,
        coord,
        center: mid,
        width: Math.min(0.85, length * 0.5),
        height: 0.95,
        sill: 1.05,
        outwardSign,
        hasCanopy: false,
        hasAC: false,
      };
      openings.push({ type: "window", ...winObj });
      windows.push(winObj);
    }

    const isAccent =
      space.material_type === "brick" ||
      space.element_type === "stairwell" ||
      space.wall_color === "#3b4048" ||
      space.wall_color === "#2c3238" ||
      space.wall_color === "#374151";

    walls.push({
      orientation,
      coord,
      start,
      end,
      length,
      mid,
      thickness: isAccent ? 0.25 : 0.18,
      isExterior: true,
      isAccent,
      outwardSign,
      compass,
      color: space.wall_color || architecture.exterior_color || "#e2d9ce",
      materialType:
        space.material_type || architecture.wall_material || "stucco",
      openings,
      spaceId: space.id,
    });
  }

  // 5B. Trim wall junctions so perpendicular intersecting walls butt cleanly
  // with ZERO 3D volumetric or top-cap overlap, eliminating depth fighting completely.
  const trimmedWalls = trimWallJunctions(walls);

  // 6. Identify Stairwell Voids punched into this floor's slab (from stairwells on floorNumber - 1 or same floor)
  const normalizedAll = allRawSpaces.map(normalizeSpace);
  const stairVoids = normalizedAll
    .filter(
      (s) =>
        s.element_type === "stairwell" &&
        floorNumber > 1 &&
        (s.floor === floorNumber - 1 || s.floor === floorNumber)
    )
    .map((s) => ({
      x1: mapX(s.x1),
      x2: mapX(s.x2),
      z1: mapZ(s.z1),
      z2: mapZ(s.z2),
      x: s.x,
      z: s.z,
      width: s.width,
      depth: s.depth,
    }));

  return {
    floorNumber,
    spaces,
    walls: trimmedWalls,
    railings,
    columns: Array.from(columnCoords.values()),
    doors,
    windows,
    stairVoids,
    bounds: {
      minX,
      maxX,
      minZ,
      maxZ,
      width: snapVal(maxX - minX),
      depth: snapVal(maxZ - minZ),
    },
  };
}

/**
 * Trims wall endpoints at intersections & T-junctions so perpendicular walls
 * butt cleanly against each other with ZERO 3D volumetric or top-cap overlap.
 *
 * Priority hierarchy:
 * 1. Accent walls (heavy masonry piers, stairwell cores, brick shafts) - Priority 3
 * 2. Exterior facade envelope walls - Priority 2
 * 3. Interior room partition walls - Priority 1
 */
function trimWallJunctions(walls) {
  const getPriority = (w) => (w.isAccent ? 3 : w.isExterior ? 2 : 1);

  const hWalls = walls.filter((w) => w.orientation === "H");
  const vWalls = walls.filter((w) => w.orientation === "V");

  for (const h of hWalls) {
    for (const v of vWalls) {
      const hPri = getPriority(h);
      const vPri = getPriority(v);

      const hHalfT = h.thickness / 2;
      const vHalfT = v.thickness / 2;

      const hMinZ = h.coord - hHalfT;
      const hMaxZ = h.coord + hHalfT;
      const vMinX = v.coord - vHalfT;
      const vMaxX = v.coord + vHalfT;

      const tolH = hHalfT + 0.04;
      const tolV = vHalfT + 0.04;

      const vMeetsH = v.start <= h.coord + tolH && v.end >= h.coord - tolH;
      const hMeetsV = h.start <= v.coord + tolV && h.end >= v.coord - tolV;

      if (!vMeetsH || !hMeetsV) continue;

      const vDominates =
        vPri > hPri ||
        (vPri === hPri && v.thickness > h.thickness) ||
        (vPri === hPri && v.thickness === h.thickness && false);

      if (vDominates) {
        if (h.start < v.coord - 0.02 && h.end >= vMinX - 0.04 && h.end <= vMaxX + 0.06) {
          h.end = Math.min(h.end, vMinX);
        } else if (h.end > v.coord + 0.02 && h.start >= vMinX - 0.06 && h.start <= vMaxX + 0.04) {
          h.start = Math.max(h.start, vMaxX);
        }
        h.length = snapVal(Math.max(0, h.end - h.start));
        h.mid = snapVal((h.start + h.end) / 2);
      } else {
        if (v.start < h.coord - 0.02 && v.end >= hMinZ - 0.04 && v.end <= hMaxZ + 0.06) {
          v.end = Math.min(v.end, hMinZ);
        } else if (v.end > h.coord + 0.02 && v.start >= hMinZ - 0.06 && v.start <= hMaxZ + 0.04) {
          v.start = Math.max(v.start, hMaxZ);
        }
        v.length = snapVal(Math.max(0, v.end - v.start));
        v.mid = snapVal((v.start + v.end) / 2);
      }
    }
  }

  return walls.filter((w) => w.length > 0.04);
}

/**
 * Creates a 2.5D extruded wall segment BufferGeometry using THREE.Shape + .holes
 * so windows and doors are cleanly punched out in a single manifold mesh.
 */
function buildWallSegmentGeometry(wall, wallHeight, isCutaway) {
  const { orientation, coord, start, end, length, thickness, openings = [] } = wall;
  if (length <= 0.04) return null;

  // In Cutaway mode, slice doors all the way through the top of the 1.22m cutaway wall
  // so doorways read clearly as open walk-through passages!
  if (isCutaway) {
    const doorOpenings = openings
      .filter((op) => op.type === "door")
      .sort((a, b) => a.center - b.center);

    const subSpans = [];
    let cursor = start;
    for (const d of doorOpenings) {
      const dStart = Math.max(start, d.center - d.width / 2);
      const dEnd = Math.min(end, d.center + d.width / 2);
      if (dStart - cursor > 0.05) {
        subSpans.push([cursor, dStart]);
      }
      cursor = Math.max(cursor, dEnd);
    }
    if (end - cursor > 0.05) {
      subSpans.push([cursor, end]);
    }

    const parts = [];
    for (const [sA, sB] of subSpans) {
      const spanLen = sB - sA;
      const spanMid = (sA + sB) / 2;
      const box =
        orientation === "H"
          ? new THREE.BoxGeometry(spanLen, wallHeight, thickness)
          : new THREE.BoxGeometry(thickness, wallHeight, spanLen);
      box.translate(
        orientation === "H" ? spanMid : coord,
        wallHeight / 2,
        orientation === "H" ? coord : spanMid
      );
      parts.push(box);
    }
    return safeMergeGeometries(parts);
  }

  // Solid Exterior Shell Mode: Use 2.5D THREE.Shape + .holes for true window & door cutouts!
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, 0);
  shape.lineTo(length / 2, 0);
  shape.lineTo(length / 2, wallHeight);
  shape.lineTo(-length / 2, wallHeight);
  shape.closePath();

  for (const op of openings) {
    const localCenter = op.center - (start + end) / 2;
    const halfW = Math.min(op.width / 2, length / 2 - 0.08);
    // Keep a minimum 0.04m bottom threshold so hole stays strictly inside polygon boundary
    const botY = Math.max(0.04, op.sill || 0);
    const topY = Math.min(wallHeight - 0.08, (op.sill || 0) + op.height);
    if (halfW > 0.1 && topY - botY > 0.15) {
      const hole = new THREE.Path();
      hole.moveTo(localCenter - halfW, botY);
      hole.lineTo(localCenter + halfW, botY);
      hole.lineTo(localCenter + halfW, topY);
      hole.lineTo(localCenter - halfW, topY);
      hole.closePath();
      shape.holes.push(hole);
    }
  }

  const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 1,
  });
  // Center extrusion along Z from [0, thickness] to [-thickness/2, +thickness/2]
  extrudeGeo.translate(0, 0, -thickness / 2);

  if (orientation === "V") {
    extrudeGeo.rotateY(Math.PI / 2);
    extrudeGeo.translate(coord, 0, (start + end) / 2);
  } else {
    extrudeGeo.translate((start + end) / 2, 0, coord);
  }

  return extrudeGeo;
}

/**
 * Compiles all structural 3D geometries for a floor into batched BufferGeometries
 * so an entire floor renders in ~6 draw calls instead of 180+ separate meshes.
 */
export function compileFloorGeometries(
  topology,
  floorHeight = 2.6,
  isCutaway = false,
  architecture = {}
) {
  const wallH = isCutaway ? Math.min(1.22, floorHeight * 0.52) : floorHeight;

  const exteriorWallGeos = [];
  const accentWallGeos = [];
  const interiorWallGeos = [];
  const slabGeos = [];
  const darkMetalGeos = []; // Window mullions, door frames, railings, stair stringers
  const concreteTrimGeos = []; // Sills, lintel canopies, columns, stair steps
  const woodDoorGeos = []; // Door leaves
  const glassGeos = []; // Window glass panes & balcony glass balustrades

  // 1. Build Continuous Floor Slab (subtracting stairwell voids on upper floors!)
  const slabThickness = 0.18;
  for (const space of topology.spaces) {
    // If this space is a stairwell on floor > 1, we leave the central shaft open
    // and only build a landing ledge around the top arrival edge!
    if (space.element_type === "stairwell" && topology.floorNumber > 1) {
      const landingDepth = Math.min(1.0, space.depth * 0.32);
      const landingGeo = new THREE.BoxGeometry(
        space.width,
        slabThickness,
        landingDepth
      );
      landingGeo.translate(
        space.x,
        -slabThickness / 2,
        space.z2 - landingDepth / 2
      );
      slabGeos.push(landingGeo);

      // Guardrail around the open stairwell floor hole
      const railH = isCutaway ? 0.85 : 0.95;
      const backBar = new THREE.BoxGeometry(space.width - 0.1, 0.04, 0.04);
      backBar.translate(space.x, railH, space.z1 + 0.06);
      darkMetalGeos.push(backBar);
      continue;
    }

    // Standard space floor plate (expanded slightly by 0.08m for continuous perimeter slab band)
    const pad = OPEN_AIR_TYPES.has(space.element_type) ? 0.06 : 0.09;
    const box = new THREE.BoxGeometry(
      space.width + pad * 2,
      slabThickness,
      space.depth + pad * 2
    );
    box.translate(space.x, -slabThickness / 2, space.z);
    slabGeos.push(box);
  }

  // 2. Build Punched Exterior, Accent Brick/Charcoal, & Shared Interior Walls
  for (const wall of topology.walls) {
    const geo = buildWallSegmentGeometry(wall, wallH, isCutaway);
    if (!geo) continue;
    if (wall.isExterior) {
      if (wall.isAccent) {
        accentWallGeos.push(geo);
      } else {
        exteriorWallGeos.push(geo);
      }
    } else {
      interiorWallGeos.push(geo);
    }
  }

  // 3. Build Doors (Frames + Wooden Door Leaves)
  for (const d of topology.doors) {
    const doorH = isCutaway ? Math.min(wallH - 0.05, 1.15) : d.height;
    const isH = d.orientation === "H";
    const frameT = 0.15;

    // Left & Right Door Jambs
    const jambL = new THREE.BoxGeometry(
      isH ? 0.05 : frameT,
      doorH,
      isH ? frameT : 0.05
    );
    jambL.translate(
      isH ? d.center - d.width / 2 + 0.025 : d.coord,
      doorH / 2,
      isH ? d.coord : d.center - d.width / 2 + 0.025
    );
    darkMetalGeos.push(jambL);

    const jambR = new THREE.BoxGeometry(
      isH ? 0.05 : frameT,
      doorH,
      isH ? frameT : 0.05
    );
    jambR.translate(
      isH ? d.center + d.width / 2 - 0.025 : d.coord,
      doorH / 2,
      isH ? d.coord : d.center + d.width / 2 - 0.025
    );
    darkMetalGeos.push(jambR);

    if (!isCutaway) {
      const headJamb = new THREE.BoxGeometry(
        isH ? d.width : frameT,
        0.05,
        isH ? frameT : d.width
      );
      headJamb.translate(
        isH ? d.center : d.coord,
        doorH - 0.025,
        isH ? d.coord : d.center
      );
      darkMetalGeos.push(headJamb);
    }

    // Wooden Door Leaf (slightly ajar at 25 degrees in Cutaway mode so doorway flow is unmistakable!)
    const leafW = d.width - 0.08;
    const leafGeo = new THREE.BoxGeometry(leafW, doorH - 0.04, 0.04);
    if (isCutaway) {
      leafGeo.translate(leafW / 2, (doorH - 0.04) / 2, 0);
      const baseAngle = isH ? 0 : Math.PI / 2;
      const openAngle = baseAngle + (d.swingDir || 1) * 0.48;
      leafGeo.rotateY(openAngle);
      const hingeX = isH ? d.center - leafW / 2 : d.coord;
      const hingeZ = isH ? d.coord : d.center - leafW / 2;
      leafGeo.translate(hingeX, 0, hingeZ);
    } else {
      if (!isH) leafGeo.rotateY(Math.PI / 2);
      leafGeo.translate(
        isH ? d.center : d.coord,
        (doorH - 0.04) / 2,
        isH ? d.coord : d.center
      );
    }
    woodDoorGeos.push(leafGeo);
  }

  // 4. Build Exterior Windows, Sills, Canopies & AC Condensers
  if (!isCutaway) {
    for (const w of topology.windows) {
      const isH = w.orientation === "H";
      const cy = w.sill + w.height / 2;
      const outOffset = (w.outwardSign || 1) * 0.09;

      // Glass Pane
      const glass = new THREE.BoxGeometry(
        isH ? w.width - 0.06 : 0.03,
        w.height - 0.06,
        isH ? 0.03 : w.width - 0.06
      );
      glass.translate(
        isH ? w.center : w.coord,
        cy,
        isH ? w.coord : w.center
      );
      glassGeos.push(glass);

      // Multi-Pane Curtain-Wall / Window Mullions
      const numMullions = w.isStorefront ? 2 : 1;
      for (let mIdx = 1; mIdx <= numMullions; mIdx++) {
        const mPos = w.center - w.width / 2 + (w.width * mIdx) / (numMullions + 1);
        const vMullion = new THREE.BoxGeometry(
          isH ? 0.045 : 0.21,
          w.height,
          isH ? 0.21 : 0.045
        );
        vMullion.translate(isH ? mPos : w.coord, cy, isH ? w.coord : mPos);
        darkMetalGeos.push(vMullion);
      }

      // Horizontal Transom Bar for Storefront / Tall Windows
      if (w.isStorefront || w.height >= 1.35) {
        const hTransom = new THREE.BoxGeometry(
          isH ? w.width : 0.21,
          0.045,
          isH ? 0.21 : w.width
        );
        hTransom.translate(
          isH ? w.center : w.coord,
          w.sill + w.height * 0.68,
          isH ? w.coord : w.center
        );
        darkMetalGeos.push(hTransom);
      }

      // Concrete Sill Ledge
      const sillGeo = new THREE.BoxGeometry(
        isH ? w.width + 0.16 : 0.24,
        0.06,
        isH ? 0.24 : w.width + 0.16
      );
      sillGeo.translate(
        isH ? w.center : w.coord + outOffset * 0.5,
        w.sill - 0.02,
        isH ? w.coord + outOffset * 0.5 : w.center
      );
      concreteTrimGeos.push(sillGeo);

      // Upper Entrance Marquee Canopy (for ground storefront lobbies) or Rain Lintel Canopy
      if (w.hasCanopy) {
        const canopyDepth = w.isStorefront ? 1.15 : 0.34;
        const canopyH = w.isStorefront ? 0.16 : 0.07;
        const canopyGeo = new THREE.BoxGeometry(
          isH ? w.width + 0.55 : canopyDepth,
          canopyH,
          isH ? canopyDepth : w.width + 0.55
        );
        const proj = (w.outwardSign || 1) * (canopyDepth / 2);
        canopyGeo.translate(
          isH ? w.center : w.coord + proj,
          w.sill + w.height + 0.1,
          isH ? w.coord + proj : w.center
        );
        if (w.isStorefront) {
          darkMetalGeos.push(canopyGeo);
        } else {
          concreteTrimGeos.push(canopyGeo);
        }
      }

      // Split-Type AC Condenser Unit mounted beside/below window
      if (w.hasAC) {
        const acX = isH
          ? w.center + w.width / 2 + 0.38
          : w.coord + outOffset * 2.1;
        const acZ = isH
          ? w.coord + outOffset * 2.1
          : w.center + w.width / 2 + 0.38;
        const acBox = new THREE.BoxGeometry(
          isH ? 0.52 : 0.24,
          0.38,
          isH ? 0.24 : 0.52
        );
        acBox.translate(acX, w.sill + 0.22, acZ);
        concreteTrimGeos.push(acBox);

        const fanGrill = new THREE.BoxGeometry(
          isH ? 0.26 : 0.26,
          0.26,
          isH ? 0.26 : 0.26
        );
        fanGrill.translate(acX - (isH ? 0.08 : 0), w.sill + 0.22, acZ);
        darkMetalGeos.push(fanGrill);
      }
    }
  }

  // 5. Build Open Walk-Up Corridor / Porch Railings & Structural Support Columns
  for (const r of topology.railings) {
    const isH = r.orientation === "H";
    const railH = isCutaway ? 0.85 : 1.02;

    // Split railing if Ground Floor has a pedestrian entry gap
    const spans = r.hasEntryGap
      ? [
          [r.start, r.mid - 0.75],
          [r.mid + 0.75, r.end],
        ]
      : [[r.start, r.end]];

    for (const [sA, sB] of spans) {
      const len = sB - sA;
      if (len <= 0.15) continue;
      const midPt = (sA + sB) / 2;

      // Bottom concrete curb
      const curb = new THREE.BoxGeometry(
        isH ? len : 0.16,
        0.18,
        isH ? 0.16 : len
      );
      curb.translate(isH ? midPt : r.coord, 0.09, isH ? r.coord : midPt);
      concreteTrimGeos.push(curb);

      // Top & Mid horizontal handrail bars
      const topRail = new THREE.BoxGeometry(
        isH ? len : 0.05,
        0.045,
        isH ? 0.05 : len
      );
      topRail.translate(isH ? midPt : r.coord, railH, isH ? r.coord : midPt);
      darkMetalGeos.push(topRail);

      const midRail = new THREE.BoxGeometry(
        isH ? len : 0.035,
        0.03,
        isH ? 0.035 : len
      );
      midRail.translate(
        isH ? midPt : r.coord,
        railH * 0.55,
        isH ? r.coord : midPt
      );
      darkMetalGeos.push(midRail);

      // Vertical balusters every 0.45m
      const postCount = Math.max(2, Math.floor(len / 0.45));
      for (let i = 0; i <= postCount; i++) {
        const pt = sA + (len * i) / postCount;
        const post = new THREE.BoxGeometry(0.03, railH - 0.15, 0.03);
        post.translate(
          isH ? pt : r.coord,
          0.15 + (railH - 0.15) / 2,
          isH ? r.coord : pt
        );
        darkMetalGeos.push(post);
      }
    }
  }

  // Structural Columns on open walkways & porches
  for (const col of topology.columns) {
    const colH = isCutaway ? wallH : floorHeight;
    const pillar = new THREE.BoxGeometry(0.22, colH, 0.22);
    pillar.translate(col.x, colH / 2, col.z);
    concreteTrimGeos.push(pillar);
  }

  // 6. Build Multi-Landing Dog-Leg Staircases inside Stairwell Spaces
  for (const space of topology.spaces) {
    if (space.element_type !== "stairwell") continue;

    const sw = space.width;
    const sd = space.depth;
    const halfH = floorHeight / 2;
    const landingD = Math.min(0.95, sd * 0.28);
    const runD = Math.max(0.8, sd - landingD * 2);
    const flightW = Math.max(0.45, (sw - 0.36) / 2);
    const numSteps = 7;

    // Intermediate Mid-Landing at North (-Z) end of stairwell
    const midLanding = new THREE.BoxGeometry(sw - 0.16, 0.12, landingD);
    midLanding.translate(space.x, halfH, space.z1 + landingD / 2 + 0.08);
    concreteTrimGeos.push(midLanding);

    // Flight 1 (West side): ascends South -> North from 0 to halfH
    for (let i = 0; i < numSteps; i++) {
      const t = (i + 0.5) / numSteps;
      const stepY = (i + 1) * (halfH / numSteps);
      const stepZ = space.z2 - landingD - t * runD;
      const step = new THREE.BoxGeometry(
        flightW,
        0.07,
        runD / numSteps + 0.02
      );
      step.translate(space.x - flightW / 2 - 0.05, stepY, stepZ);
      concreteTrimGeos.push(step);
    }

    // Flight 2 (East side): ascends North -> South from halfH to floorHeight
    for (let i = 0; i < numSteps; i++) {
      const t = (i + 0.5) / numSteps;
      const stepY = halfH + (i + 1) * (halfH / numSteps);
      const stepZ = space.z1 + landingD + t * runD;
      const step = new THREE.BoxGeometry(
        flightW,
        0.07,
        runD / numSteps + 0.02
      );
      step.translate(space.x + flightW / 2 + 0.05, stepY, stepZ);
      concreteTrimGeos.push(step);
    }

    // Central Stair Handrail Divider
    const railPost1 = new THREE.BoxGeometry(0.04, halfH + 0.7, 0.04);
    railPost1.translate(space.x, (halfH + 0.7) / 2, space.z1 + landingD);
    darkMetalGeos.push(railPost1);

    const railPost2 = new THREE.BoxGeometry(0.04, floorHeight + 0.4, 0.04);
    railPost2.translate(space.x, (floorHeight + 0.4) / 2, space.z2 - landingD);
    darkMetalGeos.push(railPost2);
  }

  // 7. Build Cantilevered Private Unit Balconies (3-Sided Glass Balustrades, Dark Slab Fascia, & Top-Floor Roof Brow)
  const maxBldgFloor = Number(architecture.floors) || 4;
  for (const space of topology.spaces) {
    if (space.element_type !== "unit" || !space.has_balcony) continue;
    const side = (space.balcony_side || "S").toUpperCase();
    const bDepth = Math.max(0.85, Number(space.balcony_depth) || 1.25);
    const isNS = side === "N" || side === "S";
    const sign = side === "S" || side === "E" ? 1 : -1;

    const bx = isNS ? space.x : space.x + sign * (space.width / 2 + bDepth / 2);
    const bz = isNS ? space.z + sign * (space.depth / 2 + bDepth / 2) : space.z;
    const bw = isNS ? space.width - 0.14 : bDepth;
    const bd = isNS ? bDepth : space.depth - 0.14;

    // Dark Charcoal Cantilevered Balcony Slab Fascia
    const bSlab = new THREE.BoxGeometry(bw, 0.18, bd);
    bSlab.translate(bx, -0.02, bz);
    darkMetalGeos.push(bSlab);

    const rH = isCutaway ? 0.72 : 0.96;
    const frontX = isNS ? bx : bx + sign * (bw / 2 - 0.03);
    const frontZ = isNS ? bz + sign * (bd / 2 - 0.03) : bz;

    // Front Tempered Glass Balustrade Panel
    const frontGlass = new THREE.BoxGeometry(
      isNS ? bw - 0.06 : 0.025,
      rH - 0.08,
      isNS ? 0.025 : bd - 0.06
    );
    frontGlass.translate(frontX, rH / 2 + 0.03, frontZ);
    glassGeos.push(frontGlass);

    // Left & Right Side Return Glass Panels
    for (const sDir of [-1, 1]) {
      const sideGlass = new THREE.BoxGeometry(
        isNS ? 0.025 : bw - 0.06,
        rH - 0.08,
        isNS ? bd - 0.06 : 0.025
      );
      sideGlass.translate(
        isNS ? bx + sDir * (bw / 2 - 0.03) : bx,
        rH / 2 + 0.03,
        isNS ? bz : bz + sDir * (bd / 2 - 0.03)
      );
      glassGeos.push(sideGlass);

      // Side Top Handrail Return
      const sideRail = new THREE.BoxGeometry(
        isNS ? 0.045 : bw,
        0.045,
        isNS ? bd : 0.045
      );
      sideRail.translate(
        isNS ? bx + sDir * (bw / 2 - 0.03) : bx,
        rH,
        isNS ? bz : bz + sDir * (bd / 2 - 0.03)
      );
      darkMetalGeos.push(sideRail);

      // Corner Vertical Mullion Post
      const cornerPost = new THREE.BoxGeometry(0.045, rH + 0.04, 0.045);
      cornerPost.translate(
        isNS ? bx + sDir * (bw / 2 - 0.03) : frontX,
        rH / 2,
        isNS ? frontZ : bz + sDir * (bd / 2 - 0.03)
      );
      darkMetalGeos.push(cornerPost);
    }

    // Outer Top Handrail Bar
    const outerRail = new THREE.BoxGeometry(
      isNS ? bw : 0.05,
      0.045,
      isNS ? 0.05 : bd
    );
    outerRail.translate(frontX, rH, frontZ);
    darkMetalGeos.push(outerRail);

    // Top-Floor Cantilevered Roof Brow Overhang (seen on 4th floor balconies in photo!)
    if (!isCutaway && topology.floorNumber === maxBldgFloor) {
      const brow = new THREE.BoxGeometry(bw + 0.16, 0.22, bd + 0.16);
      brow.translate(bx, floorHeight + 0.05, bz);
      darkMetalGeos.push(brow);
    }
  }

  return {
    exteriorWallGeo: safeMergeGeometries(exteriorWallGeos),
    accentWallGeo: safeMergeGeometries(accentWallGeos),
    interiorWallGeo: safeMergeGeometries(interiorWallGeos),
    slabGeo: safeMergeGeometries(slabGeos),
    darkMetalGeo: safeMergeGeometries(darkMetalGeos),
    concreteTrimGeo: safeMergeGeometries(concreteTrimGeos),
    woodDoorGeo: safeMergeGeometries(woodDoorGeos),
    glassGeo: safeMergeGeometries(glassGeos),
  };
}

/**
 * Builds true whole-building Roof Geometries (Gable, Hip, Mono-Pitch Shed, or Flat Parapet).
 * Supports multi-zone roofs defined in `building.architecture.roofs` or automatically
 * synthesizes unified roof zones covering the top floor spaces.
 */
export function compileBuildingRoofs(
  building,
  allRawSpaces = [],
  maxFloor = 1,
  floorHeight = 2.6
) {
  const normalizedAll = allRawSpaces.map(normalizeSpace);
  const topFloorSpaces = normalizedAll.filter((s) => s.floor === maxFloor);
  if (topFloorSpaces.length === 0) return [];

  const arch = building?.architecture || {};
  let roofZones = Array.isArray(arch.roofs) && arch.roofs.length > 0 ? arch.roofs : null;

  // If no explicit building-level roof array is provided, automatically synthesize
  // a unified roof zone covering the top floor's bounding envelope!
  if (!roofZones) {
    const minX = Math.min(...topFloorSpaces.map((s) => s.x1));
    const maxX = Math.max(...topFloorSpaces.map((s) => s.x2));
    const minZ = Math.min(...topFloorSpaces.map((s) => s.z1));
    const maxZ = Math.max(...topFloorSpaces.map((s) => s.z2));

    // Infer roof type from building.architecture.roof_type or dominant top-floor unit roof_type
    const hasTriangle = topFloorSpaces.some((s) => s.roof_type === "triangle" || s.roof_type === "gable");
    const hasHip = topFloorSpaces.some((s) => s.roof_type === "hip");
    const hasShed = topFloorSpaces.some((s) => s.roof_type === "shed");
    const inferredType =
      arch.roof_type ||
      (hasHip ? "hip" : hasShed ? "shed" : hasTriangle ? "gable" : "flat_parapet");

    roofZones = [
      {
        type: inferredType,
        floor: maxFloor,
        bounds: [minX, minZ, maxX, maxZ],
        ridge_axis: maxX - minX >= maxZ - minZ ? "X" : "Z",
        pitch_height: 1.55,
        overhang: 0.45,
        color: arch.roof_color || "#334155",
      },
    ];
  }

  const compiledRoofs = [];

  for (let idx = 0; idx < roofZones.length; idx++) {
    const zone = roofZones[idx];
    const [bx1, bz1, bx2, bz2] = Array.isArray(zone.bounds)
      ? zone.bounds.map(Number)
      : [-5, -4, 5, 4];
    const targetFloor = Number(zone.floor) || maxFloor;
    const baseY = targetFloor * floorHeight;

    const overhang = zone.type === "flat_parapet" ? 0.12 : Number(zone.overhang ?? 0.45);
    const x1 = Math.min(bx1, bx2) - overhang;
    const x2 = Math.max(bx1, bx2) + overhang;
    const z1 = Math.min(bz1, bz2) - overhang;
    const z2 = Math.max(bz1, bz2) + overhang;

    const w = x2 - x1;
    const d = z2 - z1;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    const pitchH = Number(zone.pitch_height || 1.5);
    const roofType = zone.type || "gable";

    const roofDeckGeos = [];
    const parapetWallGeos = [];
    const trimGeos = [];

    if (roofType === "gable") {
      const alongX = (zone.ridge_axis || (w >= d ? "X" : "Z")).toUpperCase() === "X";
      const span = alongX ? d : w;
      const length = alongX ? w : d;
      const slopeLen = Math.hypot(span / 2, pitchH);
      const slopeAngle = Math.atan2(pitchH, span / 2);

      // Eave soffit fascia deck
      const soffit = new THREE.BoxGeometry(w, 0.1, d);
      soffit.translate(cx, baseY + 0.05, cz);
      trimGeos.push(soffit);

      // Left & Right sloped roof planes
      const planeA = new THREE.BoxGeometry(
        alongX ? length + 0.08 : slopeLen,
        0.1,
        alongX ? slopeLen : length + 0.08
      );
      if (alongX) {
        planeA.rotateX(slopeAngle);
        planeA.translate(cx, baseY + 0.1 + pitchH / 2, cz - span / 4);
      } else {
        planeA.rotateZ(-slopeAngle);
        planeA.translate(cx - span / 4, baseY + 0.1 + pitchH / 2, cz);
      }
      roofDeckGeos.push(planeA);

      const planeB = new THREE.BoxGeometry(
        alongX ? length + 0.08 : slopeLen,
        0.1,
        alongX ? slopeLen : length + 0.08
      );
      if (alongX) {
        planeB.rotateX(-slopeAngle);
        planeB.translate(cx, baseY + 0.1 + pitchH / 2, cz + span / 4);
      } else {
        planeB.rotateZ(slopeAngle);
        planeB.translate(cx + span / 4, baseY + 0.1 + pitchH / 2, cz);
      }
      roofDeckGeos.push(planeB);

      // Ridge Cap Beam
      const ridgeCap = new THREE.BoxGeometry(
        alongX ? length + 0.12 : 0.22,
        0.12,
        alongX ? 0.22 : length + 0.12
      );
      ridgeCap.translate(cx, baseY + 0.1 + pitchH, cz);
      trimGeos.push(ridgeCap);

      // Triangular Gable-End Masonry Walls (inset by overhang so they sit flush on the exterior walls!)
      const wallW = Math.max(1.0, (alongX ? d : w) - overhang * 2);
      const wallLen = Math.max(1.0, (alongX ? w : d) - overhang * 2);
      const gableShape = new THREE.Shape();
      gableShape.moveTo(-wallW / 2, 0);
      gableShape.lineTo(wallW / 2, 0);
      gableShape.lineTo(0, pitchH);
      gableShape.closePath();

      const gableWall1 = new THREE.ExtrudeGeometry(gableShape, {
        depth: 0.18,
        bevelEnabled: false,
      });
      gableWall1.translate(0, 0, -0.09);
      const gableWall2 = gableWall1.clone();

      if (alongX) {
        gableWall1.rotateY(Math.PI / 2);
        gableWall1.translate(cx - wallLen / 2 + 0.09, baseY + 0.05, cz);
        gableWall2.rotateY(Math.PI / 2);
        gableWall2.translate(cx + wallLen / 2 - 0.09, baseY + 0.05, cz);
      } else {
        gableWall1.translate(cx, baseY + 0.05, cz - wallLen / 2 + 0.09);
        gableWall2.translate(cx, baseY + 0.05, cz + wallLen / 2 - 0.09);
      }
      parapetWallGeos.push(gableWall1, gableWall2);
    } else if (roofType === "hip") {
      // 4-Sloped Residential / Apartment Hip Roof
      const soffit = new THREE.BoxGeometry(w, 0.12, d);
      soffit.translate(cx, baseY + 0.06, cz);
      trimGeos.push(soffit);

      const alongX = w >= d;
      const ridgeHalf = alongX
        ? Math.max(0.1, (w - d) / 2)
        : Math.max(0.1, (d - w) / 2);

      // 4 base corners + 2 top ridge endpoints
      const y0 = baseY + 0.12;
      const y1 = y0 + pitchH;
      const r1x = alongX ? cx - ridgeHalf : cx;
      const r1z = alongX ? cz : cz - ridgeHalf;
      const r2x = alongX ? cx + ridgeHalf : cx;
      const r2z = alongX ? cz : cz + ridgeHalf;

      // Corners: NW(x1,z1), NE(x2,z1), SE(x2,z2), SW(x1,z2)
      const verts = [];
      const pushTri = (a, b, c) => {
        verts.push(...a, ...b, ...c);
      };

      const NW = [x1, y0, z1];
      const NE = [x2, y0, z1];
      const SE = [x2, y0, z2];
      const SW = [x1, y0, z2];
      const R1 = [r1x, y1, r1z];
      const R2 = [r2x, y1, r2z];

      if (alongX) {
        // North slope (quad NW, NE, R2, R1)
        pushTri(NW, R1, R2);
        pushTri(NW, R2, NE);
        // South slope (quad SW, R1, R2, SE)
        pushTri(SW, R2, R1);
        pushTri(SW, SE, R2);
        // West hip triangle (NW, SW, R1)
        pushTri(NW, SW, R1);
        // East hip triangle (NE, R2, SE)
        pushTri(NE, R2, SE);
      } else {
        // West slope (NW, SW, R2, R1)
        pushTri(NW, SW, R2);
        pushTri(NW, R2, R1);
        // East slope (NE, R1, R2, SE)
        pushTri(NE, R1, R2);
        pushTri(NE, R2, SE);
        // North hip triangle (NW, R1, NE)
        pushTri(NW, R1, NE);
        // South hip triangle (SW, SE, R2)
        pushTri(SW, SE, R2);
      }

      const hipGeo = new THREE.BufferGeometry();
      hipGeo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(verts, 3)
      );
      hipGeo.computeVertexNormals();
      roofDeckGeos.push(hipGeo);
    } else if (roofType === "shed" || roofType === "mono_pitch") {
      // Single-Sloped Modern Shed Roof
      const highSide = (zone.high_side || "S").toUpperCase();
      const alongZ = highSide === "S" || highSide === "N";
      const span = alongZ ? d : w;
      const slopeLen = Math.hypot(span, pitchH * 0.75);
      const angle = Math.atan2(pitchH * 0.75, span);
      const sign = highSide === "S" || highSide === "E" ? 1 : -1;

      const soffit = new THREE.BoxGeometry(w, 0.1, d);
      soffit.translate(cx, baseY + 0.05, cz);
      trimGeos.push(soffit);

      const deck = new THREE.BoxGeometry(
        alongZ ? w + 0.1 : slopeLen,
        0.12,
        alongZ ? slopeLen : d + 0.1
      );
      if (alongZ) {
        deck.rotateX(-sign * angle);
      } else {
        deck.rotateZ(sign * angle);
      }
      deck.translate(cx, baseY + 0.12 + (pitchH * 0.75) / 2, cz);
      roofDeckGeos.push(deck);
    } else {
      // Flat Parapet Commercial / Apartment Roof
      const parapetH = 0.78;
      const wallT = 0.2;

      const deck = new THREE.BoxGeometry(w - 0.1, 0.16, d - 0.1);
      deck.translate(cx, baseY + 0.08, cz);
      roofDeckGeos.push(deck);

      // 4 Perimeter Parapet Walls + Dark Coping Caps
      const nWall = new THREE.BoxGeometry(w, parapetH, wallT);
      nWall.translate(cx, baseY + parapetH / 2, z1 + wallT / 2);
      const sWall = new THREE.BoxGeometry(w, parapetH, wallT);
      sWall.translate(cx, baseY + parapetH / 2, z2 - wallT / 2);
      const wWall = new THREE.BoxGeometry(wallT, parapetH, d - wallT * 2);
      wWall.translate(x1 + wallT / 2, baseY + parapetH / 2, cz);
      const eWall = new THREE.BoxGeometry(wallT, parapetH, d - wallT * 2);
      eWall.translate(x2 - wallT / 2, baseY + parapetH / 2, cz);
      parapetWallGeos.push(nWall, sWall, wWall, eWall);

      // Bold Architectural Dark Cornice Fascia Band around top of Parapet
      const corniceH = 0.28;
      const nCap = new THREE.BoxGeometry(w + 0.24, corniceH, wallT + 0.24);
      nCap.translate(cx, baseY + parapetH - corniceH / 2 + 0.08, z1 + wallT / 2);
      const sCap = new THREE.BoxGeometry(w + 0.24, corniceH, wallT + 0.24);
      sCap.translate(cx, baseY + parapetH - corniceH / 2 + 0.08, z2 - wallT / 2);
      const wCap = new THREE.BoxGeometry(wallT + 0.24, corniceH, d + 0.24);
      wCap.translate(x1 + wallT / 2, baseY + parapetH - corniceH / 2 + 0.08, cz);
      const eCap = new THREE.BoxGeometry(wallT + 0.24, corniceH, d + 0.24);
      eCap.translate(x2 - wallT / 2, baseY + parapetH - corniceH / 2 + 0.08, cz);
      trimGeos.push(nCap, sCap, wCap, eCap);

      // Raised Vertical Brick Pier Crowns (matches the taller dark brick piers in 106 Maple!)
      const brickSpaces = topFloorSpaces.filter(
        (s) => s.material_type === "brick" || s.element_type === "stairwell"
      );
      for (const bs of brickSpaces) {
        const crownH = bs.element_type === "stairwell" ? 1.35 : 1.05;
        const crown = new THREE.BoxGeometry(bs.width + 0.16, crownH, bs.depth + 0.16);
        crown.translate(bs.x, baseY + crownH / 2, bs.z);
        trimGeos.push(crown);
      }
    }

    compiledRoofs.push({
      id: `roof_zone_${idx}`,
      type: roofType,
      color: zone.color || "#334155",
      roofDeckGeo: safeMergeGeometries(roofDeckGeos),
      parapetWallGeo: safeMergeGeometries(parapetWallGeos),
      trimGeo: safeMergeGeometries(trimGeos),
    });
  }

  return compiledRoofs;
}
