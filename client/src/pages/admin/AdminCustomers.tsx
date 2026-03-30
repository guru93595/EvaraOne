import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { User, Search, MapPin, Plus, X } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { AddCustomerForm } from "../../components/admin/forms/AddCustomerForm";
import { db } from "../../lib/firebase";
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy 
} from "firebase/firestore";
import type { 
  Customer as UserProfileRow, 
  Zone as RegionRow 
} from "../../types/entities";

const AdminCustomers = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialZoneId = searchParams.get("zoneId");

  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState(initialZoneId || "all");
  
  const [clients, setClients] = useState<UserProfileRow[]>([]);
  const [zones, setZones] = useState<RegionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // 1. Real-Time Customers Sync
  useEffect(() => {
    const q = query(collection(db, "customers"), orderBy("full_name", "asc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as UserProfileRow[];
      setClients(data);
      setLoading(false);
    }, (err) => {
      console.error("Customers listener failed:", err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. Real-Time Zones Sync (for filter dropdown)
  useEffect(() => {
    const q = query(collection(db, "zones"), orderBy("zoneName", "asc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as RegionRow[];
      setZones(data);
    }, (err) => {
      console.error("Zones listener failed:", err);
    });
    return () => unsub();
  }, []);

  // Update URL when filter changes
  useEffect(() => {
    if (zoneFilter && zoneFilter !== "all") {
      setSearchParams({ zoneId: zoneFilter });
    } else {
      setSearchParams({});
    }
  }, [zoneFilter]);

  const zoneMap = useMemo(
    () => Object.fromEntries(zones.map((z) => [z.id, z])),
    [zones],
  );

  const filteredClients = clients.filter((c) => {
    const name = (c.display_name || c.full_name || "").toLowerCase();
    const email = (c.email || "").toLowerCase();
    const matchesSearch = name.includes(search.toLowerCase()) || email.includes(search.toLowerCase());
    const matchesZone = zoneFilter === "all" || c.zone_id === zoneFilter || c.regionFilter === zoneFilter;
    return matchesSearch && matchesZone;
  });


  return (
    <div className="min-h-screen p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-[24px]">
        <div>
          <h2 className="text-[28px] font-[600] tracking-[-0.5px] text-[#1F2937] leading-tight">
            Customer Management
          </h2>
          <p className="glass-secondary mt-1">
            Global list of registered customers across all zones.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1F2937] opacity-40"
              size={18}
            />
            <input
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 bg-[rgba(255,255,255,0.3)] border border-[rgba(255,255,255,0.4)] rounded-xl text-sm focus:ring-2 focus:ring-[rgba(58,122,254,0.3)] focus:border-[#3A7AFE] outline-none w-64 shadow-sm text-[#1F2937] placeholder:text-[#1F2937] placeholder:opacity-40 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="px-4 py-2 bg-[rgba(255,255,255,0.3)] border border-[rgba(255,255,255,0.4)] rounded-xl text-sm text-[#1F2937] outline-none shadow-sm focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All Zones</option>
              {zones.map(z => (
                <option key={z.id} value={z.id}>{z.zoneName}</option>
              ))}
            </select>
            {zoneFilter !== "all" && (
              <button 
                onClick={() => setZoneFilter("all")}
                className="p-2 bg-red-50 text-red-500 rounded-xl border border-red-100 font-bold hover:bg-red-100 transition-all"
                title="Clear Filter"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {user?.role === "superadmin" && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-[12px] bg-[#3A7AFE] text-white font-[700] text-[13px] shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Plus size={16} /> Add Customer
            </button>
          )}
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-2xl rounded-3xl border border-white/20 overflow-hidden shadow-xl">
        <div className="p-6">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.1)] text-[11px] font-[600] text-[#1F2937] opacity-70 uppercase tracking-wider">
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Location Context</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Devices</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.1)]">
              {filteredClients.map((client) => (
                <tr
                  key={client.id}
                  onClick={() => navigate(`/superadmin/customers/${client.id}`)}
                  className="group hover:bg-[rgba(255,255,255,0.2)] transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[rgba(255,255,255,0.3)] flex items-center justify-center text-[#1F2937] border border-[rgba(255,255,255,0.4)] shadow-sm">
                        <User size={18} className="opacity-70" />
                      </div>
                      <div>
                        <p className="text-[14px] font-[600] text-[#1F2937] group-hover:text-[#3A7AFE] transition-colors">
                          {client.display_name ||
                            client.full_name ||
                            "Unnamed Customer"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-[13px]">
                      <MapPin size={14} className="text-[#1F2937] opacity-50" />
                      <div>
                        <span className="text-[#1F2937] font-[500]">
                          {client.zone_id ? (zoneMap as any)[client.zone_id]?.zoneName : "No Zone Assigned"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-[13px] text-[#1F2937]">
                      <p className="font-[500] opacity-90">
                        {client.email || "—"}
                      </p>
                      <p className="opacity-60">{client.phone_number || "N/A"}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[13px] font-[600] text-[#1F2937] bg-[rgba(255,255,255,0.4)] border border-[rgba(255,255,255,0.5)] px-2.5 py-1 rounded-[8px] shadow-sm">
                      {client.deviceCount || 0} / {client.device_ids?.length || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/superadmin/customers/${client.id}`);
                      }}
                      className="text-[12px] font-[700] text-[#3A7AFE] border border-[rgba(58,122,254,0.3)] bg-[rgba(58,122,254,0.1)] px-4 py-2 rounded-[10px] hover:bg-[rgba(58,122,254,0.15)] hover:shadow-md transition-all shadow-sm"
                    >
                      Manage Profile
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredClients.length === 0 && (
          <div className="p-12 text-center">
            <User className="mx-auto text-slate-300 mb-4" size={48} />
            <p className="text-slate-500 font-medium">
              {loading
                ? "Loading..."
                : "No customers yet. Add your first customer."}
            </p>
          </div>
        )}
      </div>

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Customer"
      >
        <AddCustomerForm
          onSubmit={() => {
            setShowAddModal(false);
          }}
          onCancel={() => setShowAddModal(false)}
        />
      </Modal>
    </div>
  );
};

export default AdminCustomers;
