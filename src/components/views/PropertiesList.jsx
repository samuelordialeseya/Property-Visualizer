"use client";

import { useState, useMemo } from "react";
import { 
  Building2, MapPin, Search, X, Plus, Layers, 
  ArrowRight, AlertTriangle, CheckCircle2, ArrowUpDown 
} from "lucide-react";

const AVATAR_PALETTE = [
  "bg-[#0b3860]",
  "bg-[#2270b8]",
  "bg-indigo-700",
  "bg-teal-700",
  "bg-slate-700",
];

export default function PropertiesList({ 
  buildings = [], 
  units = [], 
  onSelectProperty, 
  onAddBuilding, 
  onOpen3D 
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'occupied' | 'vacant' | 'overdue'
  const [sortBy, setSortBy] = useState("name"); // 'name' | 'units' | 'occupancy'

  // Precompute building statistics for quick scan & sort
  const buildingStatsMap = useMemo(() => {
    const map = {};
    buildings.forEach((b) => {
      const bUnits = units.filter((u) => u.buildingId === b.id);
      const total = bUnits.length;
      const occupied = bUnits.filter((u) => u.status === "occupied").length;
      const overdue = bUnits.filter((u) => u.status === "overdue").length;
      const vacant = bUnits.filter((u) => u.status === "vacant").length;
      const monthlyIncome = bUnits
        .filter((u) => u.status === "occupied")
        .reduce((sum, u) => sum + (Number(u.monthly_rent) || 0), 0);
      const occupancyPct = total > 0 ? Math.round(((occupied + overdue) / total) * 100) : 0;

      map[b.id] = {
        total,
        occupied,
        overdue,
        vacant,
        monthlyIncome,
        occupancyPct,
        floors: b.floors || 1,
      };
    });
    return map;
  }, [buildings, units]);

  // Aggregate stats for filter pills
  const filterCounts = useMemo(() => {
    let withVacancies = 0;
    let withOverdue = 0;
    let fullyOccupied = 0;

    buildings.forEach((b) => {
      const stats = buildingStatsMap[b.id];
      if (stats) {
        if (stats.vacant > 0) withVacancies++;
        if (stats.overdue > 0) withOverdue++;
        if (stats.total > 0 && stats.vacant === 0) fullyOccupied++;
      }
    });

    return { withVacancies, withOverdue, fullyOccupied };
  }, [buildings, buildingStatsMap]);

  // Filter & sort list
  const filteredBuildings = useMemo(() => {
    return buildings
      .filter((b) => {
        const query = searchQuery.toLowerCase().trim();
        const matchesQuery = 
          !query || 
          b.name?.toLowerCase().includes(query) ||
          b.address?.toLowerCase().includes(query);

        if (!matchesQuery) return false;

        const stats = buildingStatsMap[b.id] || { total: 0, occupied: 0, overdue: 0, vacant: 0 };
        if (statusFilter === "vacant") return stats.vacant > 0;
        if (statusFilter === "overdue") return stats.overdue > 0;
        if (statusFilter === "occupied") return stats.total > 0 && stats.vacant === 0;

        return true;
      })
      .sort((a, b) => {
        const statsA = buildingStatsMap[a.id] || { total: 0, occupancyPct: 0 };
        const statsB = buildingStatsMap[b.id] || { total: 0, occupancyPct: 0 };

        if (sortBy === "units") return statsB.total - statsA.total;
        if (sortBy === "occupancy") return statsB.occupancyPct - statsA.occupancyPct;
        return (a.name || "").localeCompare(b.name || "");
      });
  }, [buildings, searchQuery, statusFilter, sortBy, buildingStatsMap]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f4f4f5]">
      
      {/* ── Top Header Section ───────────────────────────────────────────── */}
      <div className="px-4 sm:px-8 md:px-12 pt-6 sm:pt-8 pb-4 shrink-0 animate-fade-down">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-[28px] sm:text-[32px] md:text-[36px] font-[800] text-[#0b3860] tracking-[-0.03em] font-['Sora'] leading-tight">
              Properties
            </h1>
            <p className="text-[13px] sm:text-[14px] text-zinc-500 mt-1 font-['Manrope'] font-medium">
              Portfolio directory, spatial models, and tenancy distribution
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-zinc-200/80 text-zinc-600 text-[12px] font-semibold font-['Manrope'] shadow-xs">
              <span>{buildings.length} {buildings.length === 1 ? "Property" : "Properties"}</span>
              <span>•</span>
              <span>{units.length} {units.length === 1 ? "Unit" : "Units"}</span>
            </span>

            {onAddBuilding && (
              <button
                type="button"
                onClick={onAddBuilding}
                className="inline-flex items-center gap-2 bg-[#0b3860] hover:bg-[#051b30] text-white px-4 py-2.5 rounded-xl text-[14px] font-bold shadow-xs transition active:scale-[0.98] cursor-pointer font-['Manrope']"
              >
                <Plus size={16} />
                <span>New Property</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Search & Filter Controls ──────────────────────────────────── */}
        {buildings.length > 0 && (
          <div className="mt-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-4 border-t border-zinc-200/60">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by property name or address..."
                className="w-full rounded-xl border border-zinc-200/90 bg-white pl-10 pr-9 py-2 text-[13px] font-medium text-zinc-800 placeholder-zinc-400 outline-none transition focus:border-[#2270b8] focus:ring-2 focus:ring-[#2270b8]/15 font-['Manrope'] shadow-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-0.5 rounded cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter Pills and Sort */}
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <div className="flex items-center bg-white p-1 rounded-xl border border-zinc-200/90 shadow-xs max-w-full overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`px-3 py-1 rounded-lg text-[12px] font-bold transition font-['Manrope'] cursor-pointer shrink-0 ${
                    statusFilter === "all"
                      ? "bg-[#0b3860] text-white shadow-xs"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  All ({buildings.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("occupied")}
                  className={`px-3 py-1 rounded-lg text-[12px] font-bold transition font-['Manrope'] cursor-pointer shrink-0 ${
                    statusFilter === "occupied"
                      ? "bg-[#0b3860] text-white shadow-xs"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  Full ({filterCounts.fullyOccupied})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("vacant")}
                  className={`px-3 py-1 rounded-lg text-[12px] font-bold transition font-['Manrope'] cursor-pointer shrink-0 ${
                    statusFilter === "vacant"
                      ? "bg-[#0b3860] text-white shadow-xs"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  Vacant ({filterCounts.withVacancies})
                </button>
                {filterCounts.withOverdue > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter("overdue")}
                    className={`px-3 py-1 rounded-lg text-[12px] font-bold transition font-['Manrope'] cursor-pointer shrink-0 ${
                      statusFilter === "overdue"
                        ? "bg-red-600 text-white shadow-xs"
                        : "text-red-600 hover:text-red-700"
                    }`}
                  >
                    Overdue ({filterCounts.withOverdue})
                  </button>
                )}
              </div>

              {/* Sort Selector */}
              <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-zinc-200/90 shadow-xs">
                <ArrowUpDown size={13} className="text-zinc-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-transparent text-[12px] font-bold text-zinc-700 outline-none cursor-pointer font-['Manrope']"
                >
                  <option value="name">Sort: Name (A-Z)</option>
                  <option value="units">Sort: Most Units</option>
                  <option value="occupancy">Sort: Occupancy</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Properties Grid Content ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-12 pb-8 sm:pb-12 pt-2">
        {buildings.length === 0 ? (
          /* Empty State - No Buildings */
          <div className="flex min-h-[320px] items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 bg-white p-8 animate-scale-in text-center">
            <div className="max-w-md mx-auto space-y-4">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-[#0b3860]/10 flex items-center justify-center text-[#0b3860]">
                <Building2 size={28} />
              </div>
              <div>
                <h3 className="text-[18px] font-bold text-zinc-900 font-['Sora']">No properties in portfolio yet</h3>
                <p className="text-[13px] text-zinc-500 font-['Manrope'] mt-1 leading-relaxed">
                  Add your first residential or commercial building to manage floors, units, leases, and explore interactive 3D spatial models.
                </p>
              </div>
              {onAddBuilding && (
                <button
                  type="button"
                  onClick={onAddBuilding}
                  className="inline-flex items-center gap-2 bg-[#0b3860] hover:bg-[#051b30] text-white px-5 py-2.5 rounded-xl text-[14px] font-bold shadow-xs transition active:scale-[0.98] cursor-pointer font-['Manrope']"
                >
                  <Plus size={16} />
                  <span>Create First Property</span>
                </button>
              )}
            </div>
          </div>
        ) : filteredBuildings.length === 0 ? (
          /* Empty State - Search/Filter Result */
          <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-zinc-200 bg-white p-8 animate-fade-in text-center">
            <div className="max-w-sm mx-auto space-y-3">
              <div className="mx-auto w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-400">
                <Search size={22} />
              </div>
              <h3 className="text-[16px] font-bold text-zinc-900 font-['Sora']">No matching properties</h3>
              <p className="text-[13px] text-zinc-500 font-['Manrope']">
                No properties matched your current search & filter criteria.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
                className="mt-2 text-[13px] font-bold text-[#0b3860] hover:underline font-['Manrope'] cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          </div>
        ) : (
          /* Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {filteredBuildings.map((b, idx) => {
              const stats = buildingStatsMap[b.id] || {
                total: 0,
                occupied: 0,
                overdue: 0,
                vacant: 0,
                monthlyIncome: 0,
                occupancyPct: 0,
                floors: 1,
              };

              const avatarColor = AVATAR_PALETTE[idx % AVATAR_PALETTE.length];

              return (
                <div
                  key={b.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open property ${b.name}`}
                  onClick={() => onSelectProperty(b.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectProperty(b.id);
                    }
                  }}
                  style={{ animationDelay: `${Math.min(idx * 50, 300)}ms` }}
                  className="group rounded-2xl bg-white p-5 sm:p-6 shadow-[var(--shadow-card)] border border-zinc-200/80 transition-all duration-300 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1 cursor-pointer flex flex-col relative overflow-hidden animate-fade-up focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8] focus-visible:ring-offset-2"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${avatarColor} text-white font-extrabold text-[17px] font-['Sora'] shadow-sm ring-4 ring-zinc-50 transition-transform duration-300 group-hover:scale-105`}>
                        {b.name ? b.name.charAt(0).toUpperCase() : "P"}
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-[17px] font-bold text-zinc-900 group-hover:text-[#2270b8] transition-colors font-['Sora'] truncate leading-tight">
                          {b.name}
                        </h2>
                        <div className="flex items-center gap-1.5 mt-1 text-[12px] text-zinc-500 font-medium font-['Manrope'] truncate">
                          <MapPin size={13} className="shrink-0 text-zinc-400" />
                          <span className="truncate">{b.address || "No address specified"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status Pill Badge */}
                    <div className="shrink-0">
                      {stats.overdue > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200/60 font-['Manrope']">
                          <AlertTriangle size={12} className="shrink-0 text-red-600" />
                          {stats.overdue} Overdue
                        </span>
                      ) : stats.total > 0 && stats.vacant === 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-['Manrope']">
                          <CheckCircle2 size={12} className="shrink-0 text-emerald-600" />
                          100% Full
                        </span>
                      ) : stats.total > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#e1ebf4] text-[#0b3860] font-['Manrope']">
                          {stats.occupancyPct}% Occupied
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-500 font-['Manrope']">
                          0 Units
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Occupancy Proportion Bar */}
                  {stats.total > 0 && (
                    <div className="my-3">
                      <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden flex">
                        {stats.occupied > 0 && (
                          <div
                            style={{ width: `${(stats.occupied / stats.total) * 100}%` }}
                            className="bg-[#2270b8] h-full transition-all"
                            title={`${stats.occupied} occupied`}
                          />
                        )}
                        {stats.overdue > 0 && (
                          <div
                            style={{ width: `${(stats.overdue / stats.total) * 100}%` }}
                            className="bg-red-500 h-full transition-all"
                            title={`${stats.overdue} overdue`}
                          />
                        )}
                        {stats.vacant > 0 && (
                          <div
                            style={{ width: `${(stats.vacant / stats.total) * 100}%` }}
                            className="bg-zinc-200 h-full transition-all"
                            title={`${stats.vacant} vacant`}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* 4-Stat Architectural Grid */}
                  <div className="mt-auto grid grid-cols-4 gap-2 border-t border-zinc-100 pt-3 text-center">
                    <div>
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-['Manrope']">Units</div>
                      <div className="text-[15px] font-[800] text-zinc-800 font-['Sora'] mt-0.5">{stats.total}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-['Manrope']">Occupied</div>
                      <div className="text-[15px] font-[800] text-[#0b3860] font-['Sora'] mt-0.5">{stats.occupied}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-['Manrope']">Vacant</div>
                      <div className="text-[15px] font-[800] text-zinc-500 font-['Sora'] mt-0.5">{stats.vacant}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-['Manrope']">Floors</div>
                      <div className="text-[15px] font-[800] text-zinc-700 font-['Sora'] mt-0.5">{stats.floors}</div>
                    </div>
                  </div>

                  {/* Monthly Income Strip (if revenue active) */}
                  {stats.monthlyIncome > 0 && (
                    <div className="mt-3 flex items-center justify-between px-3 py-1.5 rounded-xl bg-zinc-50 border border-zinc-100 text-[11px] font-['Manrope']">
                      <span className="text-zinc-500 font-medium">Monthly Active Rent</span>
                      <span className="font-bold text-[#0b3860]">₱{stats.monthlyIncome.toLocaleString()}</span>
                    </div>
                  )}

                  {/* Interactive Footer */}
                  <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between">
                    {onOpen3D ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen3D(b.id);
                        }}
                        title="Open interactive 3D spatial model"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-[#0b3860] hover:text-white text-zinc-700 text-[12px] font-bold transition duration-200 active:scale-95 font-['Manrope'] cursor-pointer"
                      >
                        <Layers size={13} />
                        <span>3D View</span>
                      </button>
                    ) : <div />}

                    <div className="inline-flex items-center gap-1 text-[12px] font-bold text-[#0b3860] group-hover:text-[#2270b8] transition-colors font-['Manrope']">
                      <span>Manage Units</span>
                      <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
