"use client";

import React, { useState, useRef, useMemo } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Wrench, Box, MapPin, User } from "lucide-react";
import { solveFloorTopology } from "@/lib/buildingGeometry";

const STATUS_CONFIG = {
  occupied: { border: "#d98a53", bg: "rgba(217, 138, 83, 0.18)", label: "Occupied", pillBg: "#d98a53" },
  overdue:  { border: "#e05c5c", bg: "rgba(224, 92, 92, 0.18)",   label: "Overdue",  pillBg: "#e05c5c" },
  vacant:   { border: "#4a5a66", bg: "rgba(74, 90, 102, 0.18)",   label: "Vacant",   pillBg: "#6e8592" },
};

const PIXELS_PER_METER = 48; // Base scale: 1 meter = 48 SVG pixels

export default function Blueprint2DView({
  units = [],
  tickets = [],
  selectedUnitId,
  onSelectUnit,
  activeFloor = "All",
  searchQuery = "",
  statusFilter = "all",
  hoveredUnitId,
  onHover,
  onEnterEditMode,
  siteContext = {},
  buildingAddress = "",
}) {
  const streetLabel =
    siteContext?.streetName?.trim() ||
    (buildingAddress ? buildingAddress.split(",")[0].trim() : "Front Street (Main Road)");
  const showMainGate = siteContext?.showMainGate !== false;
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Filter units by floor
  const floorUnits = useMemo(() => {
    return units.filter((u) => {
      if (activeFloor === "All") return true;
      return (u.floor || 1) === activeFloor;
    });
  }, [units, activeFloor]);

  // Separate structural elements (render underneath) from rentable units
  const { structuralUnits, rentableUnits, topology } = useMemo(() => {
    const targetFloorNum = activeFloor === "All" ? 1 : Number(activeFloor) || 1;
    const topo = solveFloorTopology(floorUnits, targetFloorNum, units);
    const structural = [];
    const rentable = [];
    topo.spaces.forEach((u) => {
      if (u.element_type && u.element_type !== "unit") {
        structural.push(u);
      } else {
        rentable.push(u);
      }
    });
    return { structuralUnits: structural, rentableUnits: rentable, topology: topo };
  }, [floorUnits, activeFloor, units]);

  // Calculate bounding box in world meters (including balconies)
  const bounds = useMemo(() => {
    if (floorUnits.length === 0) return { minX: -5, maxX: 5, minZ: -5, maxZ: 5, width: 10, depth: 10, centerX: 0, centerZ: 0 };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    floorUnits.forEach((u) => {
      const x = u.x || 0;
      const z = u.z || 0;
      const rot = u.rotation || 0;
      const isRot = rot === 90 || rot === 270;
      const w = isRot ? (u.depth || 3.2) : (u.width || 2.6);
      const d = isRot ? (u.width || 2.6) : (u.depth || 3.2);
      const bPad = u.has_balcony ? (u.balcony_depth || 1.0) : 0;
      minX = Math.min(minX, x - w / 2 - bPad);
      maxX = Math.max(maxX, x + w / 2 + bPad);
      minZ = Math.min(minZ, z - d / 2 - bPad);
      maxZ = Math.max(maxZ, z + d / 2 + bPad);
    });
    // Add padding around building
    minX -= 2;
    maxX += 2;
    minZ -= 2;
    maxZ += 2;
    return {
      minX, maxX, minZ, maxZ,
      width: maxX - minX,
      depth: maxZ - minZ,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
    };
  }, [floorUnits]);

  // Touch / mouse panning handlers
  const handlePointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handlePointerMove = (e) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  };

  const handlePointerUp = () => {
    setIsPanning(false);
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleZoom = (delta) => {
    setZoom((prev) => Math.min(2.5, Math.max(0.4, prev + delta)));
  };

  const q = searchQuery.trim().toLowerCase();

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#0b0f13] overflow-hidden select-none cursor-grab active:cursor-grabbing font-sans touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* ── Blueprint Grid & Rooms Canvas ───────────────────────── */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transformOrigin: "center center",
          transition: isPanning ? "none" : "transform 140ms ease-out",
          willChange: "transform",
        }}
      >
        <svg
          className="overflow-visible pointer-events-auto"
          width={Math.max(600, bounds.width * PIXELS_PER_METER)}
          height={Math.max(500, bounds.depth * PIXELS_PER_METER)}
          viewBox={`${bounds.minX * PIXELS_PER_METER} ${bounds.minZ * PIXELS_PER_METER} ${bounds.width * PIXELS_PER_METER} ${bounds.depth * PIXELS_PER_METER}`}
        >
          <defs>
            {/* Engineering millimeter grid */}
            <pattern id="smallGrid" width={PIXELS_PER_METER / 2} height={PIXELS_PER_METER / 2} patternUnits="userSpaceOnUse">
              <path d={`M ${PIXELS_PER_METER / 2} 0 L 0 0 0 ${PIXELS_PER_METER / 2}`} fill="none" stroke="#161e27" strokeWidth="0.8" />
            </pattern>
            <pattern id="grid" width={PIXELS_PER_METER} height={PIXELS_PER_METER} patternUnits="userSpaceOnUse">
              <rect width={PIXELS_PER_METER} height={PIXELS_PER_METER} fill="url(#smallGrid)" />
              <path d={`M ${PIXELS_PER_METER} 0 L 0 0 0 ${PIXELS_PER_METER}`} fill="none" stroke="#222f3d" strokeWidth="1.2" />
            </pattern>
            {/* Architectural diagonal hatch for hallways */}
            <pattern id="corridorHatch" width="12" height="12" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="12" stroke="#334155" strokeWidth="1.5" opacity="0.45" />
            </pattern>
          </defs>

          {/* Background grid rect */}
          <rect
            x={bounds.minX * PIXELS_PER_METER}
            y={bounds.minZ * PIXELS_PER_METER}
            width={bounds.width * PIXELS_PER_METER}
            height={bounds.depth * PIXELS_PER_METER}
            fill="url(#grid)"
          />

          {/* Coordinate Origin Axis Marker */}
          <line x1="-30" y1="0" x2="30" y2="0" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
          <line x1="0" y1="-30" x2="0" y2="30" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />

          {/* 0. Street & Main Entrance Gate Context Strip (Bottom / Front +Z) */}
          <g transform={`translate(${bounds.minX * PIXELS_PER_METER}, ${(bounds.maxZ - 0.9) * PIXELS_PER_METER})`}>
            <rect
              x="0"
              y="0"
              width={bounds.width * PIXELS_PER_METER}
              height={46}
              rx="8"
              fill="#141d29"
              stroke="#334155"
              strokeWidth="1.5"
            />
            <line
              x1="16"
              y1="23"
              x2={bounds.width * PIXELS_PER_METER - 16}
              y2="23"
              stroke="#eab308"
              strokeWidth="2"
              strokeDasharray="14 10"
              opacity="0.7"
            />
            <foreignObject x="0" y="0" width={bounds.width * PIXELS_PER_METER} height={46}>
              <div className="w-full h-full flex items-center justify-between px-4 pointer-events-none select-none">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-sky-300 bg-[#0b3860]/90 border border-[#479de9]/50 px-2.5 py-0.5 rounded-full">
                  <MapPin size={10} className="text-[#479de9]" />
                  <span>{streetLabel}</span>
                </span>
                {showMainGate && (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300 bg-amber-950/90 border border-amber-400/50 px-2.5 py-0.5 rounded-full">
                    ▲ MAIN ENTRANCE GATE ▲
                  </span>
                )}
                <span className="text-[10px] font-mono text-slate-400">
                  FRONT ELEVATION (SOUTH +Z)
                </span>
              </div>
            </foreignObject>
          </g>

          {/* 1. Render Structural Elements (Hallways, Walk-Up Corridors, Stairwells) */}
          {structuralUnits.map((el) => {
            const rot = el.rotation || 0;
            const isRot = rot === 90 || rot === 270;
            const w = isRot ? (el.depth || 2.0) : (el.width || 6.0);
            const d = isRot ? (el.width || 6.0) : (el.depth || 2.0);

            const pxW = w * PIXELS_PER_METER;
            const pxD = d * PIXELS_PER_METER;
            const pxX = (el.x || 0) * PIXELS_PER_METER - pxW / 2;
            const pxZ = (el.z || 0) * PIXELS_PER_METER - pxD / 2;

            const isStairs = el.element_type === "stairwell";
            const isBalconyWalkway = el.element_type === "balcony_walkway";

            // Generate stair treads if stairwell
            const stepCount = 7;
            const stairLines = [];
            if (isStairs) {
              const alongX = pxW >= pxD;
              for (let i = 1; i < stepCount; i++) {
                const frac = i / stepCount;
                if (alongX) {
                  stairLines.push(
                    <line
                      key={i}
                      x1={pxW * frac}
                      y1={4}
                      x2={pxW * frac}
                      y2={pxD - 4}
                      stroke="#64748b"
                      strokeWidth="1.5"
                    />
                  );
                } else {
                  stairLines.push(
                    <line
                      key={i}
                      x1={4}
                      y1={pxD * frac}
                      x2={pxW - 4}
                      y2={pxD * frac}
                      stroke="#64748b"
                      strokeWidth="1.5"
                    />
                  );
                }
              }
            }

            return (
              <g key={el.id} transform={`translate(${pxX}, ${pxZ})`} style={{ opacity: q ? 0.35 : 0.9 }}>
                <rect
                  x="0"
                  y="0"
                  width={pxW}
                  height={pxD}
                  rx="4"
                  fill={isStairs ? "rgba(30, 41, 59, 0.75)" : "rgba(15, 23, 42, 0.7)"}
                  stroke={isStairs ? "#64748b" : "#334155"}
                  strokeWidth="1.5"
                  strokeDasharray={isBalconyWalkway ? "6 3" : "none"}
                />
                {!isStairs && (
                  <rect x="0" y="0" width={pxW} height={pxD} rx="4" fill="url(#corridorHatch)" />
                )}
                {isStairs && (
                  <>
                    {stairLines}
                    {/* Stair direction centerline */}
                    <line
                      x1={pxW * 0.2}
                      y1={pxD * 0.5}
                      x2={pxW * 0.8}
                      y2={pxD * 0.5}
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                    />
                  </>
                )}
                <foreignObject x="2" y="2" width={Math.max(20, pxW - 4)} height={Math.max(16, pxD - 4)}>
                  <div className="w-full h-full flex flex-col items-center justify-center text-center select-none pointer-events-none">
                    <span className="text-[9.5px] font-bold uppercase tracking-widest text-slate-300 bg-[#0b0f13]/80 px-1.5 py-0.5 rounded border border-white/10">
                      {el.unit_label || (isStairs ? "STAIRS UP" : isBalconyWalkway ? "WALK-UP BALCONY" : "CORRIDOR")}
                    </span>
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {/* 2. Render Rentable Units + Attached Balconies */}
          {rentableUnits.map((unit) => {
            const rot = unit.rotation || 0;
            const isRot = rot === 90 || rot === 270;
            const w = isRot ? (unit.depth || 3.2) : (unit.width || 2.6);
            const d = isRot ? (unit.width || 2.6) : (unit.depth || 3.2);

            const pxW = w * PIXELS_PER_METER;
            const pxD = d * PIXELS_PER_METER;
            const pxX = (unit.x || 0) * PIXELS_PER_METER - pxW / 2;
            const pxZ = (unit.z || 0) * PIXELS_PER_METER - pxD / 2;

            const isSelected = selectedUnitId === unit.id;
            const isHovered = hoveredUnitId === unit.id;
            const hasTicket = tickets.some((t) => (t.unit_id === unit.id || t.unitId === unit.id) && t.status !== "settled");

            const isSearchDimmed = q.length > 0 && !(
              (unit.unit_label || "").toLowerCase().includes(q) ||
              (unit.tenant?.name || "").toLowerCase().includes(q)
            );
            const isFilterDimmed =
              statusFilter &&
              statusFilter !== "all" &&
              (statusFilter === "maintenance"
                ? !hasTicket
                : (unit.status || "vacant") !== statusFilter);
            const isDimmed = isSearchDimmed || isFilterDimmed;

            const status = STATUS_CONFIG[unit.status] || STATUS_CONFIG.vacant;

            // Balcony projection calculation in SVG pixels
            const hasBalcony = !!unit.has_balcony;
            const bSide = unit.balcony_side || "S";
            const bDepthPx = (unit.balcony_depth || 1.0) * PIXELS_PER_METER;
            let bRect = null;
            if (hasBalcony) {
              if (bSide === "S") bRect = { x: 4, y: pxD, w: Math.max(16, pxW - 8), h: bDepthPx };
              else if (bSide === "N") bRect = { x: 4, y: -bDepthPx, w: Math.max(16, pxW - 8), h: bDepthPx };
              else if (bSide === "E") bRect = { x: pxW, y: 4, w: bDepthPx, h: Math.max(16, pxD - 8) };
              else if (bSide === "W") bRect = { x: -bDepthPx, y: 4, w: bDepthPx, h: Math.max(16, pxD - 8) };
            }

            return (
              <g
                key={unit.id}
                transform={`translate(${pxX}, ${pxZ})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectUnit?.(unit);
                }}
                onPointerEnter={() => onHover?.(unit.id)}
                onPointerLeave={() => onHover?.(null)}
                className="cursor-pointer transition-opacity duration-150"
                style={{ opacity: isDimmed ? 0.2 : 1 }}
              >
                {/* Private Balcony Projection (if enabled) */}
                {bRect && (
                  <g>
                    <rect
                      x={bRect.x}
                      y={bRect.y}
                      width={bRect.w}
                      height={bRect.h}
                      rx="3"
                      fill="rgba(56, 189, 248, 0.08)"
                      stroke="#38bdf8"
                      strokeWidth="1.4"
                      strokeDasharray="4 2"
                    />
                    <text
                      x={bRect.x + bRect.w / 2}
                      y={bRect.y + bRect.h / 2 + 3}
                      textAnchor="middle"
                      fill="#7dd3fc"
                      fontSize="8"
                      fontFamily="Manrope, sans-serif"
                      fontWeight="700"
                      letterSpacing="0.08em"
                    >
                      BALCONY
                    </text>
                  </g>
                )}

                {/* Room Outer Wall / Fill */}
                <rect
                  x="0"
                  y="0"
                  width={pxW}
                  height={pxD}
                  rx="6"
                  fill={isSelected ? "rgba(34, 112, 184, 0.25)" : isHovered ? "rgba(255, 255, 255, 0.08)" : status.bg}
                  stroke={isSelected ? "#479de9" : status.border}
                  strokeWidth={isSelected ? "3" : isHovered ? "2.5" : "1.8"}
                  strokeDasharray={unit.status === "vacant" ? "4 2" : "none"}
                />

                {/* Status Indicator Bar at Top Edge */}
                <rect
                  x="3"
                  y="3"
                  width={Math.max(10, pxW - 6)}
                  height="4"
                  rx="2"
                  fill={status.pillBg}
                />

                {/* Room Center Content: SVG ForeignObject */}
                <foreignObject x="4" y="10" width={Math.max(40, pxW - 8)} height={Math.max(30, pxD - 14)}>
                  <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center select-none overflow-hidden">
                    {/* Unit Label */}
                    <span className="text-[12px] font-bold text-white font-['Sora'] tracking-tight truncate max-w-full leading-tight drop-shadow-sm">
                      {unit.unit_label || "Room"}
                    </span>

                    {/* Dimensions & Floor */}
                    <span className="text-[9.5px] font-['Sora'] tabular-nums font-medium text-zinc-400 mt-0.5 leading-none">
                      {w.toFixed(1)}m × {d.toFixed(1)}m
                    </span>

                    {/* Tenant or Rent if space permits */}
                    {pxD > 75 && (
                      <div className="mt-1 flex flex-col items-center max-w-full">
                        {unit.tenant?.name ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-200 truncate max-w-[90%] bg-black/40 px-1.5 py-0.5 rounded leading-tight">
                            <User size={9.5} className="text-[#479de9] shrink-0" />
                            <span className="truncate">{unit.tenant.name}</span>
                          </span>
                        ) : (
                          <span className="text-[9.5px] font-semibold font-['Sora'] tabular-nums text-zinc-400">
                            {unit.monthly_rent ? `₱${Number(unit.monthly_rent).toLocaleString()}` : "Vacant"}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Maintenance Ticket Alert */}
                    {hasTicket && (
                      <div className="mt-1 flex items-center gap-1 text-[9px] font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded">
                        <Wrench size={10} /> Needs Fix
                      </div>
                    )}
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {/* 3. Topological CAD Overlay: Door Swing Arcs, Exterior Windows & Columns */}
          <g className="pointer-events-none">
            {/* Exterior Window Double-Line CAD Symbols */}
            {(topology?.windows || []).map((w) => {
              const isH = w.orientation === "H";
              const lenPx = w.width * PIXELS_PER_METER;
              const cx = (isH ? w.center : w.coord) * PIXELS_PER_METER;
              const cz = (isH ? w.coord : w.center) * PIXELS_PER_METER;
              return (
                <g key={w.id} transform={`translate(${cx}, ${cz})`}>
                  <rect
                    x={isH ? -lenPx / 2 : -4}
                    y={isH ? -4 : -lenPx / 2}
                    width={isH ? lenPx : 8}
                    height={isH ? 8 : lenPx}
                    rx="1.5"
                    fill="#0b0f13"
                    stroke="#38bdf8"
                    strokeWidth="1.4"
                  />
                  <line
                    x1={isH ? -lenPx / 2 + 2 : 0}
                    y1={isH ? 0 : -lenPx / 2 + 2}
                    x2={isH ? lenPx / 2 - 2 : 0}
                    y2={isH ? 0 : lenPx / 2 - 2}
                    stroke="#7dd3fc"
                    strokeWidth="1.2"
                  />
                </g>
              );
            })}

            {/* Architectural Door Thresholds + 90-Degree Swing Arcs */}
            {(topology?.doors || []).map((d) => {
              const isH = d.orientation === "H";
              const rPx = d.width * PIXELS_PER_METER * 0.88;
              const cx = (isH ? d.center : d.coord) * PIXELS_PER_METER;
              const cz = (isH ? d.coord : d.center) * PIXELS_PER_METER;
              const dir = d.swingDir || -1;

              // Hinge at one end of doorway, swinging 90 degrees into the room
              const hx = isH ? cx - rPx / 2 : cx;
              const hz = isH ? cz : cz - rPx / 2;
              const openX = isH ? hx : hx + dir * rPx;
              const openZ = isH ? hz + dir * rPx : hz;
              const closedX = isH ? hx + rPx : hx;
              const closedZ = isH ? hz : hz + rPx;
              const sweepFlag = isH ? (dir > 0 ? 1 : 0) : dir > 0 ? 0 : 1;

              return (
                <g key={d.id}>
                  {/* Wall break clear threshold */}
                  <rect
                    x={isH ? cx - rPx / 2 : cx - 4}
                    y={isH ? cz - 4 : cz - rPx / 2}
                    width={isH ? rPx : 8}
                    height={isH ? 8 : rPx}
                    fill="#0b0f13"
                  />
                  {/* Open Door Leaf */}
                  <line
                    x1={hx}
                    y1={hz}
                    x2={openX}
                    y2={openZ}
                    stroke="#fbbf24"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  {/* 90-Degree Quarter-Circle Swing Arc */}
                  <path
                    d={`M ${closedX} ${closedZ} A ${rPx} ${rPx} 0 0 ${sweepFlag} ${openX} ${openZ}`}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="1.1"
                    strokeDasharray="3 2"
                    opacity="0.85"
                  />
                </g>
              );
            })}

            {/* Structural Walkway & Porch Columns */}
            {(topology?.columns || []).map((col, idx) => (
              <rect
                key={`col_${idx}`}
                x={col.x * PIXELS_PER_METER - 4}
                y={col.z * PIXELS_PER_METER - 4}
                width="8"
                height="8"
                rx="1.5"
                fill="#e2e8f0"
                stroke="#0f172a"
                strokeWidth="1.2"
              />
            ))}
          </g>
        </svg>
      </div>

      {/* ── Empty State if no rooms exist on this floor ────────────── */}
      {floorUnits.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6 text-center z-10">
          <div className="pointer-events-auto max-w-sm rounded-2xl bg-zinc-900 border border-white/10 p-6 shadow-2xl">
            <div className="h-12 w-12 mx-auto rounded-2xl bg-[#2270b8]/20 border border-[#2270b8]/30 flex items-center justify-center text-[#479de9] mb-3">
              <Box size={24} />
            </div>
            <h3 className="text-[16px] font-bold text-white font-['Sora']">
              {activeFloor !== "All" ? `No Rooms on Floor ${activeFloor}` : "No Rooms Added Yet"}
            </h3>
            <p className="text-[11px] text-zinc-400 mt-1.5 font-['Manrope']">
              Add rooms and configure your building layout in the layout designer.
            </p>
            {onEnterEditMode && (
              <button
                type="button"
                onClick={onEnterEditMode}
                className="mt-4 w-full py-2.5 px-4 rounded-xl bg-[#2270b8] hover:bg-[#3186d6] text-white text-[14px] font-bold font-['Manrope'] transition shadow-lg active:scale-95 flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Start Building Layout →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Floating Zoom / Pan Controls (Below Top Header Bar) ────── */}
      <div className="absolute top-20 right-4 z-20 flex items-center gap-1 hud-surface rounded-2xl p-1">
        <button
          type="button"
          onClick={() => handleZoom(0.2)}
          aria-label="Zoom in blueprint"
          title="Zoom In"
          className="press-scale h-8 w-8 rounded-xl text-[#8b949e] hover:text-white hover:bg-white/[0.08] flex items-center justify-center relative after:absolute after:-inset-1.5 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8] cursor-pointer"
        >
          <ZoomIn size={15} />
        </button>
        <button
          type="button"
          onClick={() => handleZoom(-0.2)}
          aria-label="Zoom out blueprint"
          title="Zoom Out"
          className="press-scale h-8 w-8 rounded-xl text-[#8b949e] hover:text-white hover:bg-white/[0.08] flex items-center justify-center relative after:absolute after:-inset-1.5 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8] cursor-pointer"
        >
          <ZoomOut size={15} />
        </button>
        <div className="h-4 w-px bg-[#262f38] mx-0.5" />
        <button
          type="button"
          onClick={handleResetView}
          aria-label="Reset view position"
          title="Reset View"
          className="press-scale h-8 w-8 rounded-xl text-[#8b949e] hover:text-white hover:bg-white/[0.08] flex items-center justify-center relative after:absolute after:-inset-1.5 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8] cursor-pointer"
        >
          <RotateCcw size={13.5} />
        </button>
      </div>

      {/* ── Mode Info Badge (Bottom-Right) ─────────────────────────── */}
      <div className="absolute bottom-4 right-4 z-20 pointer-events-none hidden lg:flex items-center gap-2 hud-surface rounded-xl px-3 py-1.5 text-[10.5px] text-[#8b949e] font-['Manrope']">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <span>2D Architectural Blueprint · Drag to pan</span>
      </div>
    </div>
  );
}
