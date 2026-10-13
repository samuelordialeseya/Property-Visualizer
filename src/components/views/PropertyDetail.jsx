"use client";
import { useState, useMemo } from "react";
import { ArrowLeft, Box, Wrench, Users, Building2, FileText, Search, X } from "lucide-react";
import UnitPanel from "@/components/UnitPanel";
import StaffTab from "@/components/views/tabs/StaffTab";
import MaintenanceTab from "@/components/views/tabs/MaintenanceTab";
import PropertyOverviewTab from "@/components/views/tabs/PropertyOverviewTab";
import DocumentsTab from "@/components/views/tabs/DocumentsTab";
import { useMaintenanceTickets, useStaff, usePropertyDocuments } from "@/hooks/useFirestore";

const STATUS_STYLES = {
  vacant:   { pill: "bg-[#f4f4f5] text-[#52525b] border border-zinc-200",   dot: "bg-[#6e8592]",   label: "VACANT" },
  occupied: { pill: "bg-[#fef3c7] text-[#92400e] border border-[#f59e0b]/30", dot: "bg-[#d98a53]",   label: "OCCUPIED" },
  overdue:  { pill: "bg-[#fee2e2] text-[#991b1b] border border-[#ef4444]/30", dot: "bg-[#e05c5c]",   label: "OVERDUE" },
};

const TABS = [
  { key: "overview",    label: "Overview",           icon: <Building2 size={14} /> },
  { key: "units",       label: "Units Directory",    icon: <Box size={14} /> },
  { key: "documents",   label: "Property Documents", icon: <FileText size={14} /> },
  { key: "maintenance", label: "Maintenance",        icon: <Wrench size={14} /> },
  { key: "staff",       label: "Staff & Payroll",    icon: <Users size={14} /> },
];

export default function PropertyDetail({ 
  building, 
  units = [], 
  buildings = [], 
  updateUnit, 
  updateBuilding, 
  onLaunch3D, 
  onDeleteProperty, 
  onBack, 
  userId 
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [statusFilter, setStatusFilter] = useState("all");
  const [floorFilter, setFloorFilter] = useState("all");
  const [unitSearchQuery, setUnitSearchQuery] = useState("");
  const [selectedUnit, setSelectedUnit] = useState(null);

  const { tickets } = useMaintenanceTickets(building?.id, userId);
  const { staff } = useStaff(userId, building?.id);
  const { documents } = usePropertyDocuments(building?.id);

  const openTicketCount = tickets.filter(t => t.status !== "settled").length;
  const staffCount = staff.length;
  const documentCount = documents.length;

  const activeUnit = useMemo(() => {
    if (!selectedUnit) return null;
    return units.find((u) => u.id === selectedUnit.id) || selectedUnit;
  }, [units, selectedUnit]);

  const availableFloors = useMemo(() => {
    const set = new Set();
    units.forEach((u) => {
      if (u.floor !== undefined && u.floor !== null) set.add(Number(u.floor));
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [units]);

  const filteredUnits = useMemo(() => {
    let list = [...(units || [])];
    if (statusFilter !== "all") list = list.filter((u) => u.status === statusFilter);
    if (floorFilter !== "all") list = list.filter((u) => String(u.floor) === String(floorFilter));
    if (unitSearchQuery.trim()) {
      const q = unitSearchQuery.toLowerCase().trim();
      list = list.filter(
        (u) =>
          u.unit_label?.toLowerCase().includes(q) ||
          u.tenant?.name?.toLowerCase().includes(q) ||
          u.tenant?.contact?.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => {
      if (a.position_index !== undefined && b.position_index !== undefined) {
        return a.position_index - b.position_index;
      }
      if (a.floor !== b.floor) {
        return (a.floor || 0) - (b.floor || 0);
      }
      return (a.unit_label || "").localeCompare(b.unit_label || "", undefined, { numeric: true });
    });
  }, [units, statusFilter, floorFilter, unitSearchQuery]);

  const tabBadge = (key) => {
    if (key === "units" && units.length > 0) return units.length;
    if (key === "documents" && documentCount > 0) return documentCount;
    if (key === "maintenance" && openTicketCount > 0) return openTicketCount;
    if (key === "staff" && staffCount > 0) return staffCount;
    return null;
  };

  return (
    <div className="flex h-full w-full relative overflow-hidden bg-[#f4f4f5]">
      <div className="flex-1 flex flex-col w-full h-full overflow-hidden">
        {/* Header Bar */}
        <div className="border-b border-zinc-200/80 bg-white px-4 sm:px-6 md:px-8 pt-3.5 sm:pt-4 pb-3 sm:pb-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] shrink-0 relative">
          <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button 
                type="button"
                onClick={onBack}
                aria-label="Back to properties list"
                className="flex items-center gap-1 sm:gap-1.5 text-[14px] font-semibold text-zinc-500 hover:text-zinc-900 transition font-['Manrope'] shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8] rounded-lg p-1"
              >
                <ArrowLeft size={16} />
                <span>Properties</span>
              </button>
              <span className="text-zinc-300 shrink-0">/</span>
              <span className="text-[14px] font-[700] text-[#0b3860] font-['Sora'] truncate max-w-[150px] sm:max-w-xs md:max-w-sm">
                {building?.name || "Untitled Property"}
              </span>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onLaunch3D}
                aria-label={`Launch 3D view for ${building?.name || "property"}`}
                className="flex items-center gap-1.5 rounded-xl bg-[#0b3860] hover:bg-[#051b30] px-3.5 sm:px-4 py-1.5 text-[14px] font-[700] text-white transition shadow-sm font-['Manrope'] cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8]"
              >
                <Box size={15} />
                <span>Launch 3D</span>
              </button>
            </div>
          </div>

          {/* Sub Navigation Pills */}
          <div className="flex items-center overflow-x-auto no-scrollbar -mx-1 px-1">
            <div className="inline-flex items-center gap-1 p-1 bg-[#f4f4f5] rounded-[14px] border border-zinc-200/70">
              {TABS.map(tab => {
                const badge = tabBadge(tab.key);
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    aria-label={`${tab.label} tab${badge !== null ? ` with ${badge} items` : ""}`}
                    className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-[11px] text-[14px] transition-all duration-150 font-['Manrope'] whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8] ${
                      active
                        ? "bg-white text-[#0b3860] font-[700] shadow-sm border border-zinc-200/80"
                        : "text-zinc-500 font-medium hover:text-zinc-900 hover:bg-zinc-200/50 border border-transparent"
                    }`}
                  >
                    <span className={`shrink-0 transition-colors ${active ? "text-[#0b3860]" : "text-zinc-400"}`}>
                      {tab.icon}
                    </span>
                    <span>{tab.label}</span>
                    {badge !== null && (
                      <span
                        className={`ml-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full transition-colors font-['Manrope'] ${
                          active
                            ? "bg-[#0b3860] text-white shadow-xs"
                            : "bg-zinc-200 text-zinc-600"
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div key="overview" className="flex-1 flex flex-col overflow-hidden animate-fade-in">
            <PropertyOverviewTab
              building={building}
              units={units}
              updateBuilding={updateBuilding}
              onNavigateTab={(tabKey) => setActiveTab(tabKey)}
              onLaunch3D={onLaunch3D}
              openTicketCount={openTicketCount}
              documentCount={documentCount}
              onDeleteProperty={onDeleteProperty}
            />
          </div>
        )}

        {activeTab === "documents" && (
          <div key="documents" className="flex-1 flex flex-col overflow-hidden animate-fade-in">
            <DocumentsTab building={building} />
          </div>
        )}

        {activeTab === "units" && (
          <div key="units" className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 animate-fade-in">
            <div className="rounded-2xl bg-white shadow-[var(--shadow-card)] border border-zinc-200/70 overflow-hidden">
              {/* Header with Title, Search, and Filters */}
              <div className="border-b border-zinc-100 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-[16px] font-bold text-zinc-900 font-['Sora'] tracking-tight">Units Directory</h2>
                  <span className="text-[12px] font-semibold text-zinc-400 font-['Manrope'] bg-zinc-100 px-2.5 py-0.5 rounded-full">
                    {filteredUnits.length} of {units.length}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Search Input */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={unitSearchQuery}
                      onChange={(e) => setUnitSearchQuery(e.target.value)}
                      placeholder="Search unit or tenant…"
                      className="w-48 sm:w-56 rounded-xl border border-zinc-200/90 bg-zinc-50 pl-8 pr-7 py-1.5 text-[12px] font-medium text-zinc-800 placeholder-zinc-400 outline-none transition focus:border-[#2270b8] focus:ring-2 focus:ring-[#2270b8]/15 focus:bg-white font-['Manrope']"
                    />
                    {unitSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setUnitSearchQuery("")}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-0.5 rounded cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {/* Floor Filter */}
                  {availableFloors.length > 1 && (
                    <select
                      className="rounded-xl border border-zinc-200/90 bg-zinc-50 px-3 py-1.5 text-[12px] font-bold text-zinc-700 outline-none focus:border-[#2270b8] focus:bg-white cursor-pointer font-['Manrope']"
                      value={floorFilter}
                      onChange={(e) => setFloorFilter(e.target.value)}
                    >
                      <option value="all">All Floors</option>
                      {availableFloors.map((fl) => (
                        <option key={fl} value={fl}>Floor {fl}</option>
                      ))}
                    </select>
                  )}

                  {/* Status Filter */}
                  <select
                    className="rounded-xl border border-zinc-200/90 bg-zinc-50 px-3 py-1.5 text-[12px] font-bold text-zinc-700 outline-none focus:border-[#2270b8] focus:bg-white cursor-pointer font-['Manrope']"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All Status</option>
                    <option value="occupied">Occupied</option>
                    <option value="vacant">Vacant</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-[14px]">
                  <thead>
                    <tr className="border-b border-zinc-200/80 bg-zinc-50/80 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 font-['Manrope']">
                      <th className="px-3 sm:px-6 py-3">UNIT</th>
                      <th className="px-3 sm:px-6 py-3">STATUS</th>
                      <th className="px-3 sm:px-6 py-3">TENANT</th>
                      <th className="px-3 sm:px-6 py-3">RENT / MO</th>
                      <th className="hidden sm:table-cell px-6 py-3">LEASE END</th>
                      <th className="px-3 sm:px-6 py-3 text-right">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-['Manrope']">
                    {filteredUnits.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-4 sm:px-6 py-12 text-center text-zinc-400">
                          <p className="font-bold text-[14px] text-zinc-700 font-['Sora']">No units found</p>
                          <p className="text-[12px] mt-1 font-['Manrope']">No units matched your filter or search query.</p>
                          {(unitSearchQuery || statusFilter !== "all" || floorFilter !== "all") && (
                            <button
                              type="button"
                              onClick={() => {
                                setUnitSearchQuery("");
                                setStatusFilter("all");
                                setFloorFilter("all");
                              }}
                              className="mt-3 text-[12px] font-bold text-[#0b3860] hover:underline cursor-pointer font-['Manrope']"
                            >
                              Reset filters
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredUnits.map((u, idx) => {
                        const s = STATUS_STYLES[u.status] || STATUS_STYLES.vacant;
                        const hasTenant = u.status !== "vacant" && !!u.tenant?.name;
                        return (
                          <tr
                            key={u.id}
                            onClick={() => setSelectedUnit(u)}
                            style={{ animationDelay: `${Math.min(idx * 25, 250)}ms` }}
                            className={`cursor-pointer transition hover:bg-zinc-50/80 animate-fade-up ${selectedUnit?.id === u.id ? "bg-zinc-100/70" : ""}`}
                          >
                            <td className="px-3 sm:px-6 py-3 sm:py-3.5 font-bold text-zinc-900 font-['Sora']">
                              <span>{u.unit_label || "—"}</span>
                              {u.floor !== undefined && (
                                <span className="ml-1.5 sm:ml-2 text-[10px] sm:text-[11px] font-semibold text-zinc-400 font-['Manrope']">
                                  F{u.floor}
                                </span>
                              )}
                            </td>
                            <td className="px-3 sm:px-6 py-3 sm:py-3.5">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 sm:px-2.5 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${s.pill} font-['Manrope']`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                                {s.label}
                              </span>
                            </td>
                            <td className="px-3 sm:px-6 py-3 sm:py-3.5 text-zinc-700 font-medium text-[12px] sm:text-[14px]">
                              {u.tenant?.name || <span className="text-zinc-400 italic">Vacant</span>}
                            </td>
                            <td className="px-3 sm:px-6 py-3 sm:py-3.5 font-bold text-zinc-900 font-['Sora'] tabular-nums text-[12px] sm:text-[14px]">
                              ₱{(u.monthly_rent || 0).toLocaleString()}
                            </td>
                            <td className="hidden sm:table-cell px-6 py-3.5 text-zinc-600 text-[13px]">
                              {u.tenant?.lease_end || <span className="text-zinc-400">—</span>}
                            </td>
                            <td className="px-3 sm:px-6 py-3 sm:py-3.5 text-right">
                              <div className="flex justify-end gap-2">
                                <button 
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setSelectedUnit(u); }}
                                  aria-label={`Edit unit ${u.unit_label || "details"}`}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-bold text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 transition shadow-2xs cursor-pointer font-['Manrope'] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8]"
                                >
                                  Edit
                                </button>
                                {hasTenant && (
                                  <button 
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setSelectedUnit(u); }}
                                    aria-label={`Record payment for unit ${u.unit_label || ""}`}
                                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] font-bold text-emerald-700 hover:bg-emerald-100 transition shadow-2xs cursor-pointer font-['Manrope'] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                                  >
                                    Pay
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "maintenance" && (
          <div key="maintenance" className="flex-1 min-h-0 overflow-hidden animate-fade-in">
            <MaintenanceTab building={building} units={units} userId={userId} />
          </div>
        )}

        {activeTab === "staff" && (
          <div key="staff" className="flex-1 min-h-0 overflow-hidden animate-fade-in">
            <StaffTab building={building} buildings={buildings} userId={userId} />
          </div>
        )}
      </div>

      {/* Slide-in Unit Panel */}
      {activeUnit && (
        <UnitPanel 
          unit={activeUnit} 
          onClose={() => setSelectedUnit(null)} 
          isDrawerMode={true} 
          onNavigateToMaintenance={() => {
            setActiveTab("maintenance");
            setSelectedUnit(null);
          }}
        />
      )}
    </div>
  );
}
