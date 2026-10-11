"use client";
import { useState, useMemo, useEffect } from "react";
import {
  Wrench, Plus, X, AlertTriangle, AlertCircle, ChevronDown, Filter,
  Camera, Trash2, CheckCircle, Check, Clock, Hammer, DollarSign,
  Building, User, Package, CreditCard
} from "lucide-react";
import {
  useMaintenanceTickets, useStaff,
  addMaintenanceTicketDoc, updateMaintenanceTicketDoc, deleteMaintenanceTicketDoc,
  uploadFile
} from "@/hooks/useFirestore";

const STATUSES = [
  { key: "reported",      label: "Reported",       color: "bg-red-100 text-red-700",    dot: "bg-red-500" },
  { key: "approved",      label: "Approved",       color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  { key: "work_finished", label: "Work Finished",  color: "bg-blue-100 text-blue-700",   dot: "bg-blue-500" },
  { key: "settled",       label: "Settled",        color: "bg-green-100 text-green-700", dot: "bg-green-500" },
];

const PRIORITIES = [
  { key: "urgent",  label: "Urgent",  color: "bg-red-600 text-white" },
  { key: "high",    label: "High",    color: "bg-orange-500 text-white" },
  { key: "medium",  label: "Medium",  color: "bg-amber-500 text-white" },
  { key: "low",     label: "Low",     color: "bg-zinc-400 text-white" },
];

const BILLING_TYPES = [
  { key: "landlord_expense",        label: "Landlord Expense",       desc: "You absorb the cost",           icon: <Building size={14} />,   requiresTenant: false },
  { key: "billed_to_rent",          label: "Bill to Tenant Rent",    desc: "Deduct from next month's rent", icon: <User size={14} />,       requiresTenant: true },
  { key: "deduct_security_deposit", label: "Deduct from Deposit",    desc: "Charge against security deposit", icon: <Package size={14} />,    requiresTenant: true },
  { key: "separate_tenant_bill",    label: "Direct Tenant Bill",     desc: "Tenant pays separately now",    icon: <CreditCard size={14} />,  requiresTenant: true },
];

const WORKFORCE_TYPES = [
  { key: "diy",      label: "DIY",             desc: "You handle it yourself" },
  { key: "vendor",   label: "Vendor / Contractor", desc: "External service provider" },
  { key: "staff",    label: "Staff Member",    desc: "Your assigned staff" },
];

function statusCfg(key) { return STATUSES.find(s => s.key === key) || STATUSES[0]; }
function priorityCfg(key) { return PRIORITIES.find(p => p.key === key) || PRIORITIES[2]; }

// ─── New / Edit Ticket Modal ──────────────────────────────────────────────────
function TicketModal({ buildingId, units = [], userId, ticket, onClose, staffList = [] }) {
  const editing = !!ticket;
  const [unitId, setUnitId] = useState(ticket?.unit_id || "");
  const [unitLabel, setUnitLabel] = useState(ticket?.unit_label || "");
  const [title, setTitle] = useState(ticket?.title || "");
  const [description, setDescription] = useState(ticket?.description || "");
  const [priority, setPriority] = useState(ticket?.priority || "medium");
  const [workforce, setWorkforce] = useState(ticket?.workforce || "diy");
  const [vendorName, setVendorName] = useState(ticket?.vendor_name || "");
  const [assignedStaffId, setAssignedStaffId] = useState(ticket?.assigned_staff_id || "");
  const [materialCost, setMaterialCost] = useState(ticket?.material_cost ?? "");
  const [laborCost, setLaborCost] = useState(ticket?.labor_cost ?? "");
  const [billingType, setBillingType] = useState(ticket?.billing_type || "landlord_expense");
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);

  const total = (Number(materialCost) || 0) + (Number(laborCost) || 0);

  const selectedUnit = useMemo(() => {
    if (!unitId || unitId === "common_area") return null;
    return units.find(u => u.id === unitId) || null;
  }, [units, unitId]);

  const isVacantOrNoTenant = useMemo(() => {
    if (unitId === "common_area") return true;
    if (!selectedUnit) return false;
    const isVacantStatus = selectedUnit.status === "vacant";
    const hasNoTenant = !selectedUnit.tenant?.name && !selectedUnit.tenant_name;
    return isVacantStatus || hasNoTenant;
  }, [unitId, selectedUnit]);

  // Enforce landlord_expense if unit is vacant or has no tenant
  useEffect(() => {
    if (isVacantOrNoTenant && billingType !== "landlord_expense") {
      setBillingType("landlord_expense");
    }
  }, [isVacantOrNoTenant, billingType]);

  const handleUnitSelect = (e) => {
    const val = e.target.value;
    if (val === "common_area") {
      setUnitId("common_area");
      setUnitLabel("Common Area");
      setBillingType("landlord_expense");
    } else {
      const u = units.find(u => u.id === val);
      setUnitId(val);
      setUnitLabel(u?.unit_label || "");
      const isVacant = u?.status === "vacant" || (!u?.tenant?.name && !u?.tenant_name);
      if (isVacant) {
        setBillingType("landlord_expense");
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let photoUrls = ticket?.receipt_urls ? [...ticket.receipt_urls] : [];
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i];
        const safeName = file.name ? file.name.replace(/[^a-zA-Z0-9.-]/g, "_") : "photo";
        const url = await uploadFile(`maintenance/${buildingId}/${Date.now()}_${i}_${safeName}`, file);
        if (url) photoUrls.push(url);
      }
      const isVacantUnit = unitId === "common_area" || selectedUnit?.status === "vacant" || (!selectedUnit?.tenant?.name && !selectedUnit?.tenant_name);
      const finalBillingType = isVacantUnit ? "landlord_expense" : billingType;

      const data = {
        building_id: buildingId,
        user_id: userId,
        unit_id: unitId,
        unit_label: unitLabel,
        title: title.trim(),
        description: description.trim(),
        priority,
        workforce,
        vendor_name: workforce === "vendor" ? vendorName.trim() : null,
        assigned_staff_id: workforce === "staff" ? assignedStaffId : null,
        material_cost: Number(materialCost) || 0,
        labor_cost: Number(laborCost) || 0,
        total_cost: total,
        billing_type: finalBillingType,
        receipt_urls: photoUrls,
        status: ticket?.status || "reported",
      };
      if (editing) {
        await updateMaintenanceTicketDoc(ticket.id, data);
      } else {
        await addMaintenanceTicketDoc(data);
      }
      onClose();
    } catch (err) {
      console.error("Failed to save maintenance ticket:", err);
      alert("Failed to save maintenance ticket: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[580px] max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 sticky top-0 bg-white z-10">
          <h2 className="text-[16px] font-bold text-zinc-900 font-['Sora']">{editing ? "Edit Ticket" : "Report Issue"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 transition cursor-pointer"><X size={16} /></button>
        </div>

        <form onSubmit={handleSave} className="px-6 py-5 space-y-5">
          {/* Unit + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Unit / Area *</label>
              <select required value={unitId} onChange={handleUnitSelect}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[13px] outline-none focus:border-[#2270b8] transition">
                <option value="">Select unit…</option>
                <option value="common_area">Common Area (No tenant)</option>
                {units.map(u => {
                  const isVacant = u.status === "vacant" || (!u.tenant?.name && !u.tenant_name);
                  return (
                    <option key={u.id} value={u.id}>
                      {u.unit_label} {isVacant ? "· Vacant (Landlord Expense)" : `· ${u.tenant?.name || "Occupied"}`}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Priority</label>
              <div className="grid grid-cols-4 gap-1">
                {PRIORITIES.map(p => (
                  <button key={p.key} type="button" onClick={() => setPriority(p.key)}
                    className={`py-2 rounded-xl text-[10px] font-bold transition ${priority === p.key ? p.color : "border border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Issue title */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Issue Title *</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Leaking pipe in bathroom"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[13px] outline-none focus:border-[#2270b8] transition" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Description</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the issue in detail…"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] outline-none focus:border-[#2270b8] transition resize-none" />
          </div>

          {/* Workforce */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Who Will Handle It?</label>
            <div className="grid grid-cols-3 gap-2">
              {WORKFORCE_TYPES.map(w => (
                <button key={w.key} type="button" onClick={() => { setWorkforce(w.key); if(w.key !== "staff") setAssignedStaffId(""); }}
                  className={`rounded-xl border p-3 text-left transition ${workforce === w.key ? "border-[#2270b8] bg-[#2270b8]/5" : "border-zinc-200 hover:border-zinc-300"}`}>
                  <div className="text-[12px] font-bold text-zinc-900">{w.label}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{w.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {workforce === "staff" && staffList && staffList.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Assign to Staff Member *</label>
              <select required value={assignedStaffId} onChange={e => setAssignedStaffId(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[13px] outline-none focus:border-[#2270b8] transition">
                <option value="">Select staff member...</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
              </select>
            </div>
          )}

          {workforce === "vendor" && (
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Vendor / Contractor Name</label>
              <input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="e.g. ABC Plumbing Services"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[13px] outline-none focus:border-[#2270b8] transition" />
            </div>
          )}

          {/* Costs */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Costs</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-zinc-500 mb-1">Materials (₱)</div>
                <input type="number" min="0" value={materialCost} onChange={e => setMaterialCost(e.target.value)} placeholder="0"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[13px] outline-none focus:border-[#2270b8] transition" />
              </div>
              <div>
                <div className="text-[11px] text-zinc-500 mb-1">Labor (₱)</div>
                <input type="number" min="0" value={laborCost} onChange={e => setLaborCost(e.target.value)} placeholder="0"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[13px] outline-none focus:border-[#2270b8] transition" />
              </div>
            </div>
            {total > 0 && (
              <div className="mt-2 rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-2.5 flex items-center justify-between">
                <span className="text-[12px] text-zinc-500">Total Estimated Cost</span>
                <span className="text-[16px] font-bold text-zinc-900 font-['Sora']">₱{total.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Billing */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Smart Billing</label>
              {isVacantOrNoTenant && unitId && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  Vacant · Landlord Expense Only
                </span>
              )}
            </div>

            {isVacantOrNoTenant && unitId && (
              <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200/80 p-3 mb-2.5 text-[12px] text-amber-900 font-['Manrope']">
                <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <strong>{unitId === "common_area" ? "Common Area" : `Unit ${unitLabel || ""}`}</strong> has no active tenant. Direct tenant billing, rent deductions, and deposit charges cannot be applied. All costs are assigned to <strong>Landlord Expense</strong>.
                </div>
              </div>
            )}

            <div className="space-y-2">
              {BILLING_TYPES.map(b => {
                const isDisabled = isVacantOrNoTenant && b.requiresTenant;
                return (
                  <label
                    key={b.key}
                    onClick={() => {
                      if (!isDisabled) setBillingType(b.key);
                    }}
                    title={isDisabled ? "Cannot bill tenant on a vacant unit or common area" : undefined}
                    className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                      isDisabled
                        ? "opacity-40 bg-zinc-50 border-zinc-200 cursor-not-allowed select-none"
                        : billingType === b.key
                        ? "border-[#2270b8] bg-[#2270b8]/5 cursor-pointer shadow-xs"
                        : "border-zinc-200 hover:border-zinc-300 cursor-pointer"
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg ${
                      isDisabled
                        ? "bg-zinc-200 text-zinc-400"
                        : billingType === b.key
                        ? "bg-[#2270b8] text-white"
                        : "bg-zinc-100 text-zinc-500"
                    }`}>
                      {b.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[12px] font-bold ${isDisabled ? "text-zinc-400" : "text-zinc-900"}`}>
                          {b.label}
                        </span>
                        {isDisabled && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-200/80 text-zinc-500">
                            Unavailable (No Tenant)
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500 truncate">{b.desc}</div>
                    </div>
                    <div className={`ml-auto h-4 w-4 rounded-full border-2 transition shrink-0 ${
                      isDisabled
                        ? "border-zinc-200 bg-zinc-100"
                        : billingType === b.key
                        ? "border-[#2270b8] bg-[#2270b8]"
                        : "border-zinc-300"
                    }`} />
                  </label>
                );
              })}
            </div>
          </div>

          {/* Photo upload */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Photos / Evidence</label>
            <input type="file" accept="image/*" multiple onChange={e => setPhotos(Array.from(e.target.files))}
              className="w-full text-[12px] text-zinc-600 file:mr-2 file:rounded-full file:border-0 file:bg-zinc-200 file:px-3 file:py-1 file:text-[11px] file:font-semibold" />
            {ticket?.receipt_urls?.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {ticket.receipt_urls.map((url, i) => (
                  <img key={i} src={url} alt="" className="h-14 w-14 object-cover rounded-lg border border-zinc-200" />
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="rounded-xl border border-zinc-200 px-4 py-2.5 text-[13px] font-semibold text-zinc-600 hover:bg-zinc-50 transition">Cancel</button>
            <button type="submit" disabled={saving || !title.trim() || !unitId}
              className="flex-1 rounded-xl bg-[#0b3860] py-2.5 text-[13px] font-bold text-white hover:bg-[#154e83] transition disabled:opacity-50">
              {saving ? "Saving…" : editing ? "Save Changes" : "Report Issue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Ticket Card ──────────────────────────────────────────────────────────────
function TicketCard({ ticket, units = [], onEdit, onDelete, onStatusChange, staffList }) {
  const sc = statusCfg(ticket.status);
  const pc = priorityCfg(ticket.priority);
  const ticketUnit = units.find(u => u.id === ticket.unit_id);
  const isVacantUnit = ticket.unit_id === "common_area" || ticketUnit?.status === "vacant" || (!ticketUnit?.tenant?.name && !ticketUnit?.tenant_name);
  const effectiveBillingType = isVacantUnit ? "landlord_expense" : ticket.billing_type;
  const billing = BILLING_TYPES.find(b => b.key === effectiveBillingType) || BILLING_TYPES[0];
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payFile, setPayFile] = useState(null);
  const [payFilePrev, setPayFilePrev] = useState(null);
  const [submittingPay, setSubmittingPay] = useState(false);
  const rawIdx = STATUSES.findIndex(s => s.key === ticket.status);
  const currentIdx = rawIdx !== -1 ? rawIdx : 0;

  useEffect(() => {
    if (!payFile) {
      setPayFilePrev(null);
      return;
    }
    const url = URL.createObjectURL(payFile);
    setPayFilePrev(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [payFile]);

  const advanceStatus = async () => {
    if (currentIdx >= STATUSES.length - 1) return;
    setUpdatingStatus(true);
    try {
      await updateMaintenanceTicketDoc(ticket.id, { status: STATUSES[currentIdx + 1].key });
    } catch (err) {
      console.error("Failed to advance maintenance ticket status:", err);
      alert("Failed to update status: " + (err.message || "Unknown error"));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handlePaySubmit = async (e) => {
    e.preventDefault();
    setSubmittingPay(true);
    try {
      let url = null;
      if (payFile) {
        url = await uploadFile(`maintenance_payments/${ticket.building_id || 'general'}/${ticket.id}_${Date.now()}`, payFile);
      }
      const updateData = { is_paid: true, status: "settled" };
      if (url) {
        updateData.payment_receipt_url = url;
      }
      await updateMaintenanceTicketDoc(ticket.id, updateData);
      setShowPayForm(false);
    } catch (err) {
      console.error("Failed to settle ticket payment:", err);
      alert("Failed to process payment settlement: " + (err.message || "Unknown error"));
    } finally {
      setSubmittingPay(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm hover:shadow-md transition">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-100">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-bold text-zinc-900 font-['Sora']">{ticket.title}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pc.color}`}>{pc.label}</span>
            </div>
            <div className="text-[12px] text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-zinc-700 flex items-center gap-1.5">
                {ticket.unit_label || "Common Area"}
                {isVacantUnit && ticket.unit_id !== "common_area" && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                    Vacant
                  </span>
                )}
              </span>
              <span>·</span>
              <span>{ticket.created_at ? new Date(ticket.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—"}</span>
              {ticket.workforce === "vendor" && ticket.vendor_name && <span>· {ticket.vendor_name}</span>}
              {ticket.workforce === "diy" && <span>· DIY</span>}
              {ticket.workforce === "staff" && <span>· {staffList?.find(s => s.id === ticket.assigned_staff_id)?.name || "Staff"}</span>}
            </div>
            {ticket.description && <p className="text-[12px] text-zinc-500 mt-1 line-clamp-2">{ticket.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <button onClick={() => onEdit(ticket)} className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition" title="Edit">
            <Wrench size={14} />
          </button>
          <button onClick={() => onDelete(ticket)} className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Status Stepper */}
      <div className="px-5 py-3.5 border-b border-zinc-100 bg-zinc-50/70">
        <div className="flex items-center gap-1">
          {STATUSES.map((s, i) => {
            const done = i <= currentIdx;
            const active = i === currentIdx;
            return (
              <div key={s.key} className="flex items-center flex-1">
                <div className={`flex-1 h-2 rounded-full transition-colors ${done ? "bg-[#2270b8]" : "bg-zinc-200"}`} />
                <div className={`mx-1.5 h-4 w-4 rounded-full shrink-0 border-2 flex items-center justify-center transition-all ${
                  active 
                    ? "border-[#2270b8] bg-[#2270b8] scale-110 shadow-sm" 
                    : done 
                    ? "border-[#2270b8] bg-[#2270b8]" 
                    : "border-zinc-300 bg-white"
                }`}>
                  {done && <Check size={10} className="text-white stroke-[3]" />}
                </div>
              </div>
            );
          })}
          <div className={`h-2 rounded-full flex-1 ${currentIdx === STATUSES.length - 1 ? "bg-[#2270b8]" : "bg-zinc-200"}`} />
        </div>
        <div className="flex justify-between mt-1.5 px-0.5">
          {STATUSES.map((s, i) => (
            <span key={s.key} className={`text-[10px] font-bold uppercase tracking-wider ${i <= currentIdx ? "text-[#0b3860]" : "text-zinc-400"}`}>{s.label}</span>
          ))}
        </div>
      </div>

      {/* Costs + Billing + Advance */}
      <div className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          {ticket.material_cost > 0 && (
            <div className="text-center">
              <div className="text-[11px] text-zinc-400">Materials</div>
              <div className="text-[13px] font-bold text-zinc-700">₱{(ticket.material_cost || 0).toLocaleString()}</div>
            </div>
          )}
          {ticket.labor_cost > 0 && (
            <div className="text-center">
              <div className="text-[11px] text-zinc-400">Labor</div>
              <div className="text-[13px] font-bold text-zinc-700">₱{(ticket.labor_cost || 0).toLocaleString()}</div>
            </div>
          )}
          {(ticket.material_cost > 0 || ticket.labor_cost > 0) && (
            <div className="text-center border-l border-zinc-200 pl-4">
              <div className="text-[11px] text-zinc-400">Total</div>
              <div className="text-[14px] font-bold text-zinc-900 font-['Sora']">₱{(ticket.total_cost || 0).toLocaleString()}</div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {billing && (
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-[#0b3860]/8 text-[#0b3860] border border-[#0b3860]/15 flex items-center gap-1">
              {billing.icon} {isVacantUnit && ticket.unit_id !== "common_area" ? "Landlord Expense (Vacant Unit)" : billing.label}
            </span>
          )}
          {ticket.is_paid && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
              ✓ PAID
            </span>
          )}
          {currentIdx < 2 && (
            <button onClick={advanceStatus} disabled={updatingStatus}
              className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-[#0b3860] text-white hover:bg-[#154e83] transition disabled:opacity-50 flex items-center gap-1.5 shadow-xs cursor-pointer">
              <CheckCircle size={12} /> Mark as {STATUSES[currentIdx + 1]?.label}
            </button>
          )}
          {currentIdx === 2 && (
            <button onClick={ticket.is_paid || ticket.total_cost === 0 ? advanceStatus : () => setShowPayForm(!showPayForm)} disabled={updatingStatus}
              className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-[#0b3860] text-white hover:bg-[#154e83] transition disabled:opacity-50 flex items-center gap-1.5 shadow-xs cursor-pointer">
              <CheckCircle size={12} /> {showPayForm ? "Cancel Payment" : (ticket.is_paid || (ticket.total_cost || 0) === 0 ? "Mark Settled" : "Pay & Settle")}
            </button>
          )}
        </div>
      </div>

      {/* Payment Form */}
      {showPayForm && !ticket.is_paid && (
        <form onSubmit={handlePaySubmit} className="px-5 py-4 border-t border-zinc-100 bg-zinc-50/80 flex flex-col gap-3">
          <div className="text-[11px] font-semibold text-zinc-700 uppercase tracking-wide">Settle Payment</div>
          <div>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Payment Evidence / Receipt (Optional)</label>
            <input type="file" accept="image/*" onChange={e => {
              setPayFile(e.target.files[0] || null);
            }} className="w-full text-[11px] text-zinc-600 file:mr-2 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-[10px] file:font-semibold border border-zinc-200 rounded-xl p-1 bg-white cursor-pointer hover:border-zinc-300 transition" />
          </div>
          {payFilePrev && (
            <img src={payFilePrev} alt="Preview" className="h-24 w-auto object-cover rounded-xl border border-zinc-200 shadow-sm" />
          )}
          <button type="submit" disabled={submittingPay} className="rounded-xl bg-[#0b3860] py-2.5 text-[12px] font-bold text-white hover:bg-[#154e83] transition disabled:opacity-50 mt-1 shadow-sm">
            {submittingPay ? "Processing..." : "Confirm & Mark Settled"}
          </button>
        </form>
      )}

      {/* Photos */}
      {(ticket.receipt_urls?.length > 0 || ticket.payment_receipt_url) && (
        <div className="px-5 pb-4 flex gap-2 flex-wrap pt-2">
          {ticket.receipt_urls?.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
              <img src={url} alt="Evidence" className="h-12 w-12 object-cover rounded-xl border border-zinc-200 hover:opacity-80 transition shadow-sm" />
            </a>
          ))}
          {ticket.payment_receipt_url && (
            <a href={ticket.payment_receipt_url} target="_blank" rel="noopener noreferrer" className="relative group ml-1">
              <div className="absolute -top-1.5 -right-1.5 bg-green-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm z-10">PAID</div>
              <img src={ticket.payment_receipt_url} alt="Payment Receipt" className="h-12 w-12 object-cover rounded-xl border-2 border-green-400 hover:opacity-80 transition shadow-sm" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Maintenance Tab ─────────────────────────────────────────────────────
export default function MaintenanceTab({ building, units, userId }) {
  const buildingId = building?.id;
  const { tickets, loading } = useMaintenanceTickets(buildingId, userId);
  const { staff } = useStaff(userId, buildingId);
  const [showModal, setShowModal] = useState(false);
  const [editingTicket, setEditingTicket] = useState(null);
  const [unitFilter, setUnitFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  const openTickets = tickets.filter(t => t.status !== "settled");
  const totalCost = tickets.reduce((s, t) => s + (t.total_cost || 0), 0);
  const pendingCost = openTickets.reduce((s, t) => s + (t.total_cost || 0), 0);

  const filtered = useMemo(() => {
    return tickets.filter(t => {
      if (unitFilter !== "all" && t.unit_id !== unitFilter) return false;
      if (statusFilter === "active") {
        if (t.status === "settled") return false;
      } else if (statusFilter !== "all") {
        if (t.status !== statusFilter) return false;
      }
      return true;
    });
  }, [tickets, unitFilter, statusFilter]);

  const handleDelete = async (t) => {
    if (!confirm(`Delete ticket "${t.title}"?`)) return;
    try {
      await deleteMaintenanceTicketDoc(t.id);
    } catch (err) {
      console.error("Failed to delete ticket:", err);
      alert("Failed to delete ticket: " + (err.message || "Unknown error"));
    }
  };

  const handleEdit = (t) => {
    setEditingTicket(t);
    setShowModal(true);
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 sm:px-6 md:px-8 py-4 border-b border-zinc-100 shrink-0 bg-[#f4f4f5] animate-fade-down">
        {[
          { icon: <Wrench size={16} className="text-[#2270b8]" />, label: "Open Tickets", value: openTickets.length, iconBg: "bg-[#e1ebf4]", delay: "delay-50" },
          { icon: <AlertTriangle size={16} className="text-amber-600" />, label: "Urgent / High", value: tickets.filter(t => ["urgent","high"].includes(t.priority) && t.status !== "settled").length, iconBg: "bg-amber-100", delay: "delay-100" },
          { icon: <DollarSign size={16} className="text-green-600" />, label: "Pending Cost", value: `₱${pendingCost.toLocaleString()}`, iconBg: "bg-green-100", delay: "delay-150" },
        ].map(({ icon, label, value, iconBg, delay }) => (
          <div key={label} className={`rounded-2xl bg-white px-4 sm:px-5 py-3.5 sm:py-4 flex items-center gap-3 sm:gap-4 shadow-[var(--shadow-card)] border border-zinc-200/70 relative overflow-hidden animate-fade-up ${delay}`}>
            <div className={`p-2.5 ${iconBg} rounded-xl shadow-sm shrink-0`}>{icon}</div>
            <div>
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-['Manrope']">{label}</div>
              <div className="text-[18px] sm:text-[20px] font-[800] text-zinc-900 font-['Sora'] leading-tight">{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2.5 sm:gap-3 px-4 sm:px-6 md:px-8 py-3 border-b border-zinc-100 bg-white shrink-0 flex-wrap animate-fade-in">
        <Filter size={14} className="text-zinc-300 shrink-0" />
        <select value={unitFilter} onChange={e => setUnitFilter(e.target.value)}
          className="rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 sm:px-3 py-1.5 text-[12px] font-[600] text-zinc-600 outline-none focus:border-[#2270b8] font-['Manrope'] cursor-pointer">
          <option value="all">All Units</option>
          <option value="common_area">Common Area</option>
          {units.map(u => {
            const isVacant = u.status === "vacant" || (!u.tenant?.name && !u.tenant_name);
            return (
              <option key={u.id} value={u.id}>
                {u.unit_label} {isVacant ? "(Vacant)" : ""}
              </option>
            );
          })}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 sm:px-3 py-1.5 text-[12px] font-[600] text-zinc-600 outline-none focus:border-[#2270b8] font-['Manrope'] cursor-pointer">
          <option value="active">Active Tickets</option>
          <option value="settled">Settled Tickets</option>
          <option value="all">All History</option>
        </select>
        <div className="flex-1" />
        <button onClick={() => { setEditingTicket(null); setShowModal(true); }}
          className="flex items-center gap-1.5 sm:gap-2 bg-[#0b3860] hover:bg-[#051b30] text-white px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[12px] font-[700] transition shadow-sm font-['Manrope'] cursor-pointer active:scale-95">
          <Plus size={14} /> Report Issue
        </button>
      </div>

      {/* Ticket List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-3.5 sm:space-y-4">
        {loading ? (
          <div className="py-10 text-center text-zinc-400 text-[14px] animate-fade-in">Loading tickets…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-400 animate-scale-in">
            <div className="p-5 bg-zinc-100 rounded-full mb-4"><Wrench size={32} className="text-zinc-300" /></div>
            <div className="text-[15px] font-semibold text-zinc-500">No tickets found</div>
            <div className="text-[13px] mt-1">Report an issue to create the first maintenance ticket</div>
          </div>
        ) : filtered.map((t, idx) => (
          <div key={t.id} style={{ animationDelay: `${Math.min(idx * 50, 300)}ms` }} className="animate-fade-up">
            <TicketCard
              ticket={t}
              units={units}
              staffList={staff}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onStatusChange={() => {}}
            />
          </div>
        ))}
      </div>

      {showModal && (
        <TicketModal
          buildingId={buildingId}
          units={units}
          userId={userId}
          staffList={staff}
          ticket={editingTicket}
          onClose={() => { setShowModal(false); setEditingTicket(null); }}
        />
      )}
    </div>
  );
}

