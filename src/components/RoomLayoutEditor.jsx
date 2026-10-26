"use client";
import { useState, useRef, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Edges } from "@react-three/drei";
import * as THREE from "three";
import { applyMaterialToRef } from "@/lib/textureGenerator";

const UNIT_H = 2.2;
const MIN_DIM = 0.8;
const GRID_SNAP = 0.5;
const ADJACENCY_THR = 0.14;  // within this distance → walls are "touching"
const MAGNET_SNAP = 0.9;     // snap-to-edge radius while dragging

const STATUS_COLOR = { occupied: "#d98a53", overdue: "#e05c5c", vacant: "#6e8592" };

function snapV(v) {
  return Math.round(v / GRID_SNAP) * GRID_SNAP;
}

// Which walls of `room` are shared with any other room on the same floor?
function getSharedWalls(room, allRooms) {
  const shared = { N: false, S: false, E: false, W: false };

  const rx1 = room.x - room.width / 2;
  const rx2 = room.x + room.width / 2;
  const rz1 = room.z - room.depth / 2;
  const rz2 = room.z + room.depth / 2;

  for (const o of allRooms) {
    if (o.id === room.id || (o.floor || 1) !== (room.floor || 1)) continue;

    const ox1 = o.x - o.width / 2;
    const ox2 = o.x + o.width / 2;
    const oz1 = o.z - o.depth / 2;
    const oz2 = o.z + o.depth / 2;

    const zOvlp = Math.min(rz2, oz2) - Math.max(rz1, oz1);
    const xOvlp = Math.min(rx2, ox2) - Math.max(rx1, ox1);

    if (Math.abs(rx2 - ox1) < ADJACENCY_THR && zOvlp > 0.18) shared.E = true;
    if (Math.abs(rx1 - ox2) < ADJACENCY_THR && zOvlp > 0.18) shared.W = true;
    if (Math.abs(rz2 - oz1) < ADJACENCY_THR && xOvlp > 0.18) shared.S = true;
    if (Math.abs(rz1 - oz2) < ADJACENCY_THR && xOvlp > 0.18) shared.N = true;
  }

  return shared;
}

// Returns true if two rooms on the same floor truly overlap (not just touch)
function roomsOverlap(r1, r2) {
  if (r1.id === r2.id || (r1.floor || 1) !== (r2.floor || 1)) return false;
  const M = 0.05;
  return (
    r1.x - r1.width / 2 + M < r2.x + r2.width / 2 &&
    r1.x + r1.width / 2 - M > r2.x - r2.width / 2 &&
    r1.z - r1.depth / 2 + M < r2.z + r2.depth / 2 &&
    r1.z + r1.depth / 2 - M > r2.z - r2.depth / 2
  );
}

// Magnetic snap: pull room edges toward neighbouring room edges
function magnetSnap(candidate, allRooms) {
  let { x, z, width: w, depth: d, floor: f } = candidate;

  for (const o of allRooms) {
    if (o.id === candidate.id || (o.floor || 1) !== (f || 1)) continue;
    const ox1 = o.x - o.width / 2;
    const ox2 = o.x + o.width / 2;
    const oz1 = o.z - o.depth / 2;
    const oz2 = o.z + o.depth / 2;

    const cx1 = x - w / 2, cx2 = x + w / 2;
    const cz1 = z - d / 2, cz2 = z + d / 2;

    // X snap
    if (Math.abs(cx2 - ox1) < MAGNET_SNAP) x = ox1 - w / 2;
    else if (Math.abs(cx1 - ox2) < MAGNET_SNAP) x = ox2 + w / 2;

    // Z snap
    if (Math.abs(cz2 - oz1) < MAGNET_SNAP) z = oz1 - d / 2;
    else if (Math.abs(cz1 - oz2) < MAGNET_SNAP) z = oz2 + d / 2;
  }

  return { ...candidate, x, z };
}

// A single directed arrow-cone, pointing outward from a wall
function WallArrow({ pos, dir, onDragStart }) {
  const [hov, setHov] = useState(false);

  const rotMap = {
    E: [0, 0, -Math.PI / 2],
    W: [0, 0, Math.PI / 2],
    S: [-Math.PI / 2, 0, 0],
    N: [Math.PI / 2, 0, 0],
  };

  return (
    <mesh
      position={pos}
      rotation={rotMap[dir]}
      onPointerEnter={(e) => { e.stopPropagation(); setHov(true); document.body.style.cursor = "crosshair"; }}
      onPointerLeave={(e) => { e.stopPropagation(); setHov(false); document.body.style.cursor = "auto"; }}
      onPointerDown={(e) => { e.stopPropagation(); onDragStart(e); }}
    >
      <coneGeometry args={[0.22, 0.5, 8]} />
      <meshStandardMaterial
        color={hov ? "#ffffff" : "#f2c98a"}
        emissive={hov ? "#f2c98a" : "#7a5010"}
        emissiveIntensity={hov ? 0.8 : 0.35}
        roughness={0.3}
      />
    </mesh>
  );
}

// 3D Balcony attachment for EditableRoom
function EditableBalcony3D({ bw, bd, bh, side = "S", depth = 1.0 }) {
  const railH = 0.85;
  const slabH = 0.12;
  const baseY = -bh / 2 + slabH / 2;

  let pos = [0, baseY, bd / 2 + depth / 2];
  let size = [bw - 0.1, slabH, depth];
  let railFrontPos = [0, baseY + railH / 2, bd / 2 + depth - 0.04];
  let railFrontSize = [bw - 0.1, railH, 0.05];

  if (side === "N") {
    pos = [0, baseY, -bd / 2 - depth / 2];
    size = [bw - 0.1, slabH, depth];
    railFrontPos = [0, baseY + railH / 2, -bd / 2 - depth + 0.04];
    railFrontSize = [bw - 0.1, railH, 0.05];
  } else if (side === "E") {
    pos = [bw / 2 + depth / 2, baseY, 0];
    size = [depth, slabH, bd - 0.1];
    railFrontPos = [bw / 2 + depth - 0.04, baseY + railH / 2, 0];
    railFrontSize = [0.05, railH, bd - 0.1];
  } else if (side === "W") {
    pos = [-bw / 2 - depth / 2, baseY, 0];
    size = [depth, slabH, bd - 0.1];
    railFrontPos = [-bw / 2 - depth + 0.04, baseY + railH / 2, 0];
    railFrontSize = [0.05, railH, bd - 0.1];
  }

  return (
    <group>
      {/* Cantilevered Slab */}
      <mesh position={pos}>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#334155" roughness={0.7} />
        <Edges scale={1.001} threshold={20} color="#475569" />
      </mesh>
      {/* Glass/Metal Front Balustrade */}
      <mesh position={railFrontPos}>
        <boxGeometry args={railFrontSize} />
        <meshStandardMaterial color="#94a3b8" roughness={0.3} transparent opacity={0.45} />
        <Edges scale={1.001} threshold={20} color="#1e293b" />
      </mesh>
    </group>
  );
}

function EditableRoom({ room, isSelected, rooms, startMoveDrag, startWallDrag, setDragState, cutawayMode }) {
  const floor = room.floor || 1;
  const yOff = (floor - 1) * (UNIT_H + 0.11);
  const h = room.height || UNIT_H;
  const rot = room.rotation || 0;
  const rad = (rot * Math.PI) / 180;
  const isRotated = rot === 90 || rot === 270;
  const localW = isRotated ? room.depth : room.width;
  const localD = isRotated ? room.width : room.depth;
  const bw = localW - 0.05;
  const bh = h - 0.05;
  const bd = localD - 0.05;

  const x1 = room.x - room.width / 2;
  const x2 = room.x + room.width / 2;
  const z1 = room.z - room.depth / 2;
  const z2 = room.z + room.depth / 2;

  const shared = getSharedWalls(room, rooms);
  const elType = room.element_type || "unit";
  const isStructural = elType !== "unit";
  const isCutaway = cutawayMode || room.roof_type === "open";
  const arrowY = yOff + (isStructural ? 0.55 : h * 0.55);
  const aSep = 0.5;

  const wallArrows = [
    { dir: "E", pos: [x2 + aSep, arrowY, room.z], show: !shared.E },
    { dir: "W", pos: [x1 - aSep, arrowY, room.z], show: !shared.W },
    { dir: "S", pos: [room.x, arrowY, z2 + aSep], show: !shared.S },
    { dir: "N", pos: [room.x, arrowY, z1 - aSep], show: !shared.N },
  ];

  // Material & Skinning
  const matRef = useRef();

  useEffect(() => {
    if (!matRef.current) return;
    const repeatX = Math.max(1, (room.width || 2.6) / 1.6);
    const repeatY = Math.max(1, (room.height || 2.2) / 1.6);
    applyMaterialToRef(matRef.current, room.material_type, room.texture_url, repeatX, repeatY, room.wall_color);
  }, [room.texture_url, room.material_type, room.width, room.height, room.wall_color, isSelected, isCutaway, elType]);

  const isDefaultColor = !room.wall_color || room.wall_color === '#4a5a66' || room.wall_color === '#5b6c7d';
  const baseColor = isDefaultColor ? (isSelected ? "#6a7d90" : "#5b6c7d") : room.wall_color;
  const wallT = 0.14;
  const cutH = Math.min(bh, 1.75);

  return (
    <group>
      {/* ── 1. STRUCTURAL HALLWAY / WALKWAY ───────────────────────── */}
      {(elType === "hallway" || elType === "balcony_walkway") && (
        <group position={[room.x, yOff, room.z]} rotation={[0, rad, 0]}>
          <mesh
            position={[0, 0.09, 0]}
            castShadow
            receiveShadow
            onPointerDown={(e) => startMoveDrag(e, room.id)}
          >
            <boxGeometry args={[bw, 0.18, bd]} />
            <meshStandardMaterial
              color={isSelected ? "#3b5268" : "#263240"}
              roughness={0.75}
              emissive={isSelected ? "#32b883" : "#000000"}
              emissiveIntensity={isSelected ? 0.25 : 0}
            />
            <Edges scale={1.002} threshold={15} color={isSelected ? "#32b883" : "#38bdf8"} />
          </mesh>
          {/* Walk-up exterior railing if balcony_walkway */}
          {elType === "balcony_walkway" && (
            <mesh position={[0, 0.18 + 0.45, bd / 2 - 0.04]} onPointerDown={(e) => startMoveDrag(e, room.id)}>
              <boxGeometry args={[bw, 0.9, 0.05]} />
              <meshStandardMaterial color="#94a3b8" transparent opacity={0.45} roughness={0.3} />
              <Edges scale={1.001} threshold={20} color="#1e293b" />
            </mesh>
          )}
        </group>
      )}

      {/* ── 2. STRUCTURAL 3D STAIRWELL ────────────────────────────── */}
      {elType === "stairwell" && (
        <group position={[room.x, yOff, room.z]} rotation={[0, rad, 0]}>
          {/* Base landing slab */}
          <mesh position={[0, 0.08, 0]} onPointerDown={(e) => startMoveDrag(e, room.id)}>
            <boxGeometry args={[bw, 0.16, bd]} />
            <meshStandardMaterial color={isSelected ? "#3b5268" : "#1e293b"} roughness={0.7} />
            <Edges scale={1.002} threshold={15} color={isSelected ? "#32b883" : "#475569"} />
          </mesh>
          {/* Procedural stair steps */}
          {Array.from({ length: 8 }).map((_, idx) => {
            const stepFrac = (idx + 1) / 8;
            const stepY = stepFrac * (UNIT_H - 0.15);
            const stepZ = -bd / 2 + (idx + 0.5) * (bd / 8);
            return (
              <mesh
                key={idx}
                position={[0, stepY / 2 + 0.08, stepZ]}
                onPointerDown={(e) => startMoveDrag(e, room.id)}
              >
                <boxGeometry args={[bw * 0.82, stepY, (bd / 8) * 0.92]} />
                <meshStandardMaterial color="#475569" roughness={0.6} />
                <Edges scale={1.001} threshold={20} color={isSelected ? "#32b883" : "#1e293b"} />
              </mesh>
            );
          })}
        </group>
      )}

      {/* ── 3. RENTABLE UNIT (SOLID OR CUTAWAY DOLLHOUSE) ─────────── */}
      {elType === "unit" && (
        <>
          {isCutaway ? (
            <group position={[room.x, yOff, room.z]} rotation={[0, rad, 0]}>
              {/* Status-Tinted Interior Floor Slab */}
              <mesh
                position={[0, 0.08, 0]}
                receiveShadow
                onPointerDown={(e) => startMoveDrag(e, room.id)}
              >
                <boxGeometry args={[bw, 0.16, bd]} />
                <meshStandardMaterial
                  color={STATUS_COLOR[room.status] || STATUS_COLOR.vacant}
                  roughness={0.65}
                  emissive={isSelected ? "#32b883" : "#000000"}
                  emissiveIntensity={isSelected ? 0.25 : 0}
                />
                <Edges scale={1.001} threshold={20} color={isSelected ? "#32b883" : "#1e293b"} />
              </mesh>
              {/* North Back Wall */}
              <mesh position={[0, cutH / 2 + 0.08, -bd / 2 + wallT / 2]} onPointerDown={(e) => startMoveDrag(e, room.id)}>
                <boxGeometry args={[bw, cutH, wallT]} />
                <meshStandardMaterial color={baseColor} roughness={0.55} />
                <Edges scale={1.001} threshold={20} color={isSelected ? "#32b883" : "#1e293b"} />
              </mesh>
              {/* West Left Wall */}
              <mesh position={[-bw / 2 + wallT / 2, cutH / 2 + 0.08, 0]} onPointerDown={(e) => startMoveDrag(e, room.id)}>
                <boxGeometry args={[wallT, cutH, bd]} />
                <meshStandardMaterial color={baseColor} roughness={0.55} />
                <Edges scale={1.001} threshold={20} color={isSelected ? "#32b883" : "#1e293b"} />
              </mesh>
              {/* East Right Wall */}
              <mesh position={[bw / 2 - wallT / 2, cutH / 2 + 0.08, 0]} onPointerDown={(e) => startMoveDrag(e, room.id)}>
                <boxGeometry args={[wallT, cutH, bd]} />
                <meshStandardMaterial color={baseColor} roughness={0.55} />
                <Edges scale={1.001} threshold={20} color={isSelected ? "#32b883" : "#1e293b"} />
              </mesh>
              {/* South Entrance Wall (Split for Doorway Cutout) */}
              <mesh position={[-bw * 0.32, cutH / 2 + 0.08, bd / 2 - wallT / 2]} onPointerDown={(e) => startMoveDrag(e, room.id)}>
                <boxGeometry args={[bw * 0.36, cutH, wallT]} />
                <meshStandardMaterial color={baseColor} roughness={0.55} />
                <Edges scale={1.001} threshold={20} color={isSelected ? "#32b883" : "#1e293b"} />
              </mesh>
              <mesh position={[bw * 0.32, cutH / 2 + 0.08, bd / 2 - wallT / 2]} onPointerDown={(e) => startMoveDrag(e, room.id)}>
                <boxGeometry args={[bw * 0.36, cutH, wallT]} />
                <meshStandardMaterial color={baseColor} roughness={0.55} />
                <Edges scale={1.001} threshold={20} color={isSelected ? "#32b883" : "#1e293b"} />
              </mesh>
              {/* Balcony if enabled */}
              {room.has_balcony && (
                <group position={[0, h / 2, 0]}>
                  <EditableBalcony3D bw={bw} bd={bd} bh={bh} side={room.balcony_side || "S"} depth={room.balcony_depth || 1.0} />
                </group>
              )}
            </group>
          ) : (
            <group position={[room.x, yOff + h / 2, room.z]} rotation={[0, rad, 0]}>
              <mesh
                castShadow
                receiveShadow
                onPointerDown={(e) => startMoveDrag(e, room.id)}
              >
                <boxGeometry args={[bw, bh, bd]} />
                <meshStandardMaterial
                  ref={matRef}
                  color={baseColor}
                  roughness={0.55}
                  emissive={isSelected ? "#32b883" : "#000"}
                  emissiveIntensity={isSelected ? 0.2 : 0}
                />
                {isSelected && <Edges scale={1.002} threshold={15} color="#32b883" />}
              </mesh>
              {/* Door orientation marker */}
              <mesh position={[0, -bh / 2 + 0.5, bd / 2 + 0.03]}>
                <planeGeometry args={[0.55, 1.0]} />
                <meshStandardMaterial color={isSelected ? "#32b883" : "#479de9"} roughness={0.5} side={THREE.DoubleSide} />
              </mesh>
              {/* Balcony if enabled */}
              {room.has_balcony && (
                <EditableBalcony3D bw={bw} bd={bd} bh={bh} side={room.balcony_side || "S"} depth={room.balcony_depth || 1.0} />
              )}
            </group>
          )}

          {/* Status strip at base (Solid mode) */}
          {!isCutaway && (
            <mesh position={[room.x, yOff + 0.07, room.z]}>
              <boxGeometry args={[room.width - 0.02, 0.14, room.depth - 0.02]} />
              <meshStandardMaterial color={STATUS_COLOR[room.status] || STATUS_COLOR.vacant} roughness={0.6} />
            </mesh>
          )}

          {/* Roof (Solid mode only) */}
          {!isCutaway && (
            room.roof_type === 'triangle' ? (
              <group position={[room.x, yOff + h, room.z]}>
                <mesh position={[0, 0.055, 0]} castShadow receiveShadow>
                  <boxGeometry args={[room.width + 0.2, 0.11, room.depth + 0.2]} />
                  <meshStandardMaterial color="#3d4e5e" roughness={0.6} />
                  {isSelected && <Edges scale={1.001} threshold={20} color="#32b883" />}
                </mesh>
                <mesh position={[0, 0.11 + 0.5, 0]} castShadow receiveShadow rotation={[0, Math.PI / 4, 0]} scale={[(room.width + 0.2) / Math.SQRT2, 1, (room.depth + 0.2) / Math.SQRT2]}>
                  <coneGeometry args={[1, 1, 4]} />
                  <meshStandardMaterial color="#3d4e5e" roughness={0.6} />
                  {isSelected && <Edges scale={1.001} threshold={20} color="#32b883" />}
                </mesh>
              </group>
            ) : room.roof_type === 'parapet' ? (
              <group position={[room.x, yOff + h + 0.055, room.z]}>
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[room.width + 0.12, 0.11, room.depth + 0.12]} />
                  <meshStandardMaterial color="#334155" roughness={0.6} />
                  {isSelected && <Edges scale={1.001} threshold={20} color="#32b883" />}
                </mesh>
                {/* Raised architectural parapet rim */}
                <mesh position={[0, 0.12, 0]}>
                  <boxGeometry args={[room.width + 0.16, 0.16, room.depth + 0.16]} />
                  <meshStandardMaterial color="#475569" roughness={0.5} />
                  <Edges scale={1.001} threshold={20} color="#1e293b" />
                </mesh>
              </group>
            ) : (
              <group position={[room.x, yOff + h + 0.055, room.z]}>
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[room.width + 0.2, 0.11, room.depth + 0.2]} />
                  <meshStandardMaterial color="#3d4e5e" roughness={0.6} />
                  {isSelected && <Edges scale={1.001} threshold={20} color="#32b883" />}
                </mesh>
                <mesh position={[0, 0.06, 0]}>
                  <boxGeometry args={[room.width + 0.04, 0.02, room.depth + 0.04]} />
                  <meshStandardMaterial color="#2d3c4a" roughness={0.5} />
                </mesh>
              </group>
            )
          )}
        </>
      )}

      {/* ── Shared-wall "seam" highlight (visual lock indicator) ── */}
      {shared.E && (
        <mesh position={[x2, yOff + h / 2, room.z]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.04, h * 0.9, room.depth * 0.85]} />
          <meshStandardMaterial color="#32b883" roughness={0.5} emissive="#32b883" emissiveIntensity={0.25} />
        </mesh>
      )}
      {shared.W && (
        <mesh position={[x1, yOff + h / 2, room.z]}>
          <boxGeometry args={[0.04, h * 0.9, room.depth * 0.85]} />
          <meshStandardMaterial color="#32b883" roughness={0.5} emissive="#32b883" emissiveIntensity={0.25} />
        </mesh>
      )}
      {shared.S && (
        <mesh position={[room.x, yOff + h / 2, z2]}>
          <boxGeometry args={[room.width * 0.85, h * 0.9, 0.04]} />
          <meshStandardMaterial color="#32b883" roughness={0.5} emissive="#32b883" emissiveIntensity={0.25} />
        </mesh>
      )}
      {shared.N && (
        <mesh position={[room.x, yOff + h / 2, z1]}>
          <boxGeometry args={[room.width * 0.85, h * 0.9, 0.04]} />
          <meshStandardMaterial color="#32b883" roughness={0.5} emissive="#32b883" emissiveIntensity={0.25} />
        </mesh>
      )}

      {/* ── Wall expand arrows (selected room, exterior walls only) ─ */}
      {isSelected && wallArrows.map(({ dir, pos, show }) =>
        show && (
          <WallArrow
            key={dir}
            pos={pos}
            dir={dir}
            onDragStart={(e) => startWallDrag(e, room.id, dir)}
          />
        )
      )}

      {/* ── Height handle (top cone, for rentable units) ─────────── */}
      {isSelected && elType === "unit" && (
        <mesh
          position={[room.x, yOff + h + 0.35, room.z]}
          onPointerDown={(e) => {
            e.stopPropagation();
            setDragState({ roomId: room.id, type: "height" });
            e.target.setPointerCapture(e.pointerId);
          }}
        >
          <coneGeometry args={[0.18, 0.45, 8]} />
          <meshStandardMaterial color="#a5d8c0" emissive="#32b883" emissiveIntensity={0.4} roughness={0.3} />
        </mesh>
      )}
    </group>
  );
}

// --- MAIN EDITOR -----------------------------------------------------------
export default function RoomLayoutEditor({ rooms, onChange, selectedRoomId, onSelectRoom, cutawayMode = false }) {
  const { controls, raycaster } = useThree();

  // dragState: { roomId, type: "move" | "wall-E" | "wall-W" | "wall-N" | "wall-S" | "height" }
  const [dragState, setDragState] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, z: 0 });
  const planeRef = useRef(null);

  // Disable orbit while dragging
  useEffect(() => {
    if (controls) controls.enabled = dragState === null;
  }, [dragState, controls]);

  // Helpers ----------------------------------------------------------------
  const getGroundHit = () => {
    if (!planeRef.current) return null;
    const hits = raycaster.intersectObject(planeRef.current);
    return hits.length > 0 ? hits[0].point : null;
  };

  // Pointer handlers -------------------------------------------------------
  const startMoveDrag = (e, roomId) => {
    e.stopPropagation();
    onSelectRoom(roomId);
    const hit = getGroundHit();
    if (!hit) return;
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    setDragOffset({ x: room.x - hit.x, z: room.z - hit.z });
    setDragState({ roomId, type: "move" });
    e.target.setPointerCapture(e.pointerId);
  };

  const startWallDrag = (e, roomId, wall) => {
    e.stopPropagation();
    setDragState({ roomId, type: `wall-${wall}` });
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragState) return;
    const { roomId, type } = dragState;
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    const hit = getGroundHit();
    if (!hit) return;

    let updated = { ...room };

    if (type === "move") {
      const rawX = hit.x + dragOffset.x;
      const rawZ = hit.z + dragOffset.z;
      const snapped = { ...updated, x: snapV(rawX), z: snapV(rawZ) };
      updated = magnetSnap(snapped, rooms);

    } else if (type.startsWith("wall-")) {
      const wall = type.slice(5); // "E"|"W"|"N"|"S"
      let x1 = room.x - room.width / 2;
      let x2 = room.x + room.width / 2;
      let z1 = room.z - room.depth / 2;
      let z2 = room.z + room.depth / 2;

      const sx = snapV(hit.x);
      const sz = snapV(hit.z);

      if (wall === "E") {
        x2 = Math.max(sx, x1 + MIN_DIM);
        for (const o of rooms) {
          if (o.id === roomId || (o.floor || 1) !== (room.floor || 1)) continue;
          const ox1 = o.x - o.width / 2;
          if (Math.abs(x2 - ox1) < MAGNET_SNAP) x2 = ox1;
        }
      } else if (wall === "W") {
        x1 = Math.min(sx, x2 - MIN_DIM);
        for (const o of rooms) {
          if (o.id === roomId || (o.floor || 1) !== (room.floor || 1)) continue;
          const ox2 = o.x + o.width / 2;
          if (Math.abs(x1 - ox2) < MAGNET_SNAP) x1 = ox2;
        }
      } else if (wall === "S") {
        z2 = Math.max(sz, z1 + MIN_DIM);
        for (const o of rooms) {
          if (o.id === roomId || (o.floor || 1) !== (room.floor || 1)) continue;
          const oz1 = o.z - o.depth / 2;
          if (Math.abs(z2 - oz1) < MAGNET_SNAP) z2 = oz1;
        }
      } else if (wall === "N") {
        z1 = Math.min(sz, z2 - MIN_DIM);
        for (const o of rooms) {
          if (o.id === roomId || (o.floor || 1) !== (room.floor || 1)) continue;
          const oz2 = o.z + o.depth / 2;
          if (Math.abs(z1 - oz2) < MAGNET_SNAP) z1 = oz2;
        }
      }

      updated.width = x2 - x1;
      updated.depth = z2 - z1;
      updated.x = (x1 + x2) / 2;
      updated.z = (z1 + z2) / 2;

    } else if (type === "height") {
      const ray = raycaster.ray;
      let t = 0;
      if (Math.abs(ray.direction.x) > 0.01) {
        t = (room.x - ray.origin.x) / ray.direction.x;
      } else if (Math.abs(ray.direction.z) > 0.01) {
        t = (room.z - ray.origin.z) / ray.direction.z;
      }
      const vy = ray.origin.y + t * ray.direction.y;
      const groundLevel = ((room.floor || 1) - 1) * UNIT_H;
      updated.height = Math.round(Math.max(1.0, Math.min(6.0, vy - groundLevel)) / 0.2) * 0.2;
    }

    // Collision guard (allow touching but not overlapping)
    const hasCollision = rooms.some(r => r.id !== roomId && roomsOverlap(updated, r));
    if (!hasCollision) {
      onChange(rooms.map(r => r.id === roomId ? updated : r));
    }
  };

  const handlePointerUp = (e) => {
    if (dragState) {
      try { e.target.releasePointerCapture(e.pointerId); } catch {}
      document.body.style.cursor = "auto";
      setDragState(null);
    }
  };

  return (
    <group
      onPointerMove={dragState ? handlePointerMove : undefined}
      onPointerUp={dragState ? handlePointerUp : undefined}
    >
      {/* Invisible ground plane for XZ raycasting */}
      <mesh ref={planeRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} visible={false}>
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial side={THREE.DoubleSide} />
      </mesh>

      {rooms.map((room) => (
        <EditableRoom 
          key={room.id}
          room={room}
          isSelected={room.id === selectedRoomId}
          rooms={rooms}
          startMoveDrag={startMoveDrag}
          startWallDrag={startWallDrag}
          setDragState={setDragState}
          cutawayMode={cutawayMode}
        />
      ))}
    </group>
  );
}
