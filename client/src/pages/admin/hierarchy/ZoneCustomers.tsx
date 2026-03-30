import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import {
  ChevronRight,
  User,
  MapPin,
  ArrowLeft,
  AlertCircle,
  Plus,
} from "lucide-react";
import { Modal } from "../../../components/ui/Modal";
import { AddCustomerForm } from "../../../components/admin/forms/AddCustomerForm";
import { useToast } from "../../../components/ToastProvider";
import { db } from "../../../lib/firebase";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc
} from "firebase/firestore";
import type {
  Zone as RegionRow,
  Customer as UserProfileRow,
  Device as DeviceRow,
} from "../../../types/entities";


const RegionCustomers = () => {
  const { zoneId } = useParams(); // Using standardized zoneId from URL
  const navigate = useNavigate();
  const { user } = useAuth();
  const [customers, setCustomers] = useState<UserProfileRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [regionData, setRegionData] = useState<RegionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const { showToast } = useToast();

  // 🎯 DEBUG LOGS
  useEffect(() => {
    console.log("ZoneCustomers Component Active - Zone ID:", zoneId);
  }, [zoneId]);

  // 1. Fetch Zone Metadata (Real-Time)
  useEffect(() => {
    if (!zoneId) return;

    const unsub = onSnapshot(doc(db, "zones", zoneId), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as RegionRow;
        setRegionData({ ...data, id: snap.id });
        console.log(`[Firestore] Zone Meta Sync: ${data.zoneName}`);
      } else {
        console.error("Zone not found in registry:", zoneId);
        setRegionData(null);
      }
      setLoading(false);
    }, (err) => {
      console.error("Zone listener failed:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [zoneId]);

  // 2. Fetch Customers for this Zone (Real-Time)
  useEffect(() => {
    if (!zoneId) return;

    const q = query(
      collection(db, "customers"),
      where("zone_id", "==", zoneId)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const custData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserProfileRow[];

      console.log(`[Firestore] Zone Customers Sync: ${custData.length} records`);
      setCustomers(custData);
    }, (err) => {
      console.error("Customers listener failed:", err);
      showToast("Real-time sync lost. Please refresh.", "error");
    });

    return () => unsub();
  }, [zoneId]);

  // 3. Fetch Devices for this Zone (Real-Time) to show icons/counts
  useEffect(() => {
    if (!zoneId) return;

    const q = query(
      collection(db, "devices"),
      where("zone_id", "==", zoneId)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const allDevices = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DeviceRow[];

      console.log(`[Firestore] Zone Devices Sync: ${allDevices.length} assets`);
      setDevices(allDevices);
    }, (err) => {
      console.error("Devices listener failed:", err);
    });

    return () => unsub();
  }, [zoneId]);

  // 🎯 REACTIVE DATA JOIN: Join Customers and Devices for the table
  const regionCustomers = useMemo(() => {
    return customers.map(cust => ({
      ...cust,
      devices: devices.filter(d => d.customer_id === cust.id)
    }));
  }, [customers, devices]);



  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-8 h-8 border-[3px] border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-slate-500 font-medium font-mono text-xs uppercase tracking-widest">
          Sycnhronizing Cloud Registry...
        </p>
      </div>
    );
  }

  return (
    <div className="glass-dashboard min-h-screen p-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-[8px] text-[13px] text-[#1F2937] opacity-60 mb-[16px] font-[500] tracking-wide">
        <span
          onClick={() => navigate("/superadmin/zones")}
          className="hover:opacity-100 cursor-pointer transition-opacity"
        >
          Zones
        </span>
        <ChevronRight size={14} className="opacity-50" />
        <span className="font-[600] text-[#1F2937] opacity-100">
          {regionData?.zoneName || "Loading Zone..."}
        </span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-[24px]">
        <div>
          <h2 className="text-[28px] font-[600] tracking-[-0.5px] text-[#1F2937] leading-tight">
            {regionData?.zoneName || "Unknown Zone"} Customers
          </h2>
          <p className="glass-secondary mt-1">
            Managing all subscribers in the {regionData?.zoneName || "selected"}{" "}
            operational area.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user?.role === "superadmin" && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-[12px] bg-[#3A7AFE] text-white font-[700] text-[13px] shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Plus size={16} />
              Add Customer
            </button>
          )}
          <button
            onClick={() => navigate("/superadmin/zones")}
            className="flex items-center gap-[8px] px-4 py-2 rounded-[12px] border border-[rgba(255,255,255,0.4)] bg-[rgba(255,255,255,0.3)] text-[#1F2937] opacity-80 hover:bg-[rgba(255,255,255,0.5)] text-[13px] font-[600] shadow-sm transition-all"
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </div>

      <div className="apple-glass-card">
        <div className="apple-glass-content">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.1)] text-[11px] font-[600] text-[#1F2937] opacity-70 uppercase tracking-wider">
                <th className="px-6 py-5">Customer Profile</th>
                <th className="px-6 py-5">Zone Alignment</th>
                <th className="px-6 py-5">Platform Status</th>
                <th className="px-6 py-5">Provisioned Devices</th>
                <th className="px-6 py-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.1)]">
              {regionCustomers.map((customer: any) => {
                const hasAlert = (customer.devices || []).some(
                  (d: any) => d.status !== "Online"
                );

                return (
                  <tr
                    key={customer.id}
                    onClick={() =>
                      navigate(`/superadmin/customers/${customer.id}`)
                    }
                    className="group hover:bg-[rgba(255,255,255,0.2)] transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-[12px] bg-[rgba(255,255,255,0.3)] flex items-center justify-center text-[#1F2937] opacity-80 border border-[rgba(255,255,255,0.4)] shadow-sm group-hover:scale-105 transition-transform">
                          <User size={20} className="opacity-70" />
                        </div>
                        <div>
                          <p className="font-[600] text-slate-800 text-[14px] group-hover:text-[#3A7AFE] transition-colors block">
                            {customer.full_name ||
                              customer.display_name ||
                              "Unnamed Client"}
                          </p>
                          <p className="text-[11px] text-[#1F2937] opacity-50 font-mono tracking-tighter uppercase mt-0.5">
                            {customer.email || "No email provided"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-[8px] bg-[rgba(255,255,255,0.3)] border border-[rgba(255,255,255,0.4)] flex items-center justify-center opacity-80 shadow-sm">
                          <MapPin size={14} className="text-[#1F2937]" />
                        </div>
                        <div>
                          <p className="text-[13px] font-[500] text-[#1F2937] opacity-90">
                            {regionData?.zoneName || "Assigned Zone"}
                          </p>
                          <p className="text-[10px] text-[#1F2937] opacity-50 font-mono uppercase tracking-widest">
                            {regionData?.state || "Geographic Context"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {hasAlert ? (
                        <span className="inline-flex items-center gap-[6px] px-2.5 py-1 rounded-[8px] bg-[rgba(239,68,68,0.1)] text-[#EF4444] text-[11px] font-[600] border border-[rgba(239,68,68,0.2)] shadow-sm">
                          <AlertCircle size={12} /> CRITICAL
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-[6px] px-2.5 py-1 rounded-[8px] bg-[rgba(22,163,74,0.1)] text-[#16A34A] text-[11px] font-[600] border border-[rgba(22,163,74,0.2)] shadow-sm">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />{" "}
                          STABLE
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {(customer.devices || []).map((dev: any) => (
                            <div
                              key={dev.id}
                              className={`w-7 h-7 rounded-[8px] border border-[rgba(255,255,255,0.4)] shadow-sm flex items-center justify-center text-[10px] text-white font-[600] ${
                                dev.analytics_template === "EvaraTank"
                                  ? "bg-[#3A7AFE]"
                                  : dev.analytics_template === "EvaraFlow"
                                    ? "bg-[#06B6D4]"
                                    : "bg-[#6366F1]"
                              }`}
                              title={dev.analytics_template || undefined}
                            >
                              {dev.analytics_template?.[5] || "D"}
                            </div>
                          ))}
                        </div>
                        <span className="text-[12px] font-[500] text-[#1F2937] opacity-60 ml-1">
                          {customer.devices?.length || 0} Nodes
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() =>
                            navigate(`/superadmin/customers/${customer.id}`)
                          }
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-[11px] font-[700] transition-all active:scale-95 group-hover:shadow-sm"
                        >
                          Manage Profile
                          <ChevronRight
                            size={14}
                            className="text-blue-600 opacity-60 group-hover:translate-x-0.5 transition-transform"
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {regionCustomers.length === 0 && (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-[rgba(255,255,255,0.3)] border border-[rgba(255,255,255,0.4)] shadow-sm rounded-[16px] flex items-center justify-center mx-auto mb-4">
                <User size={32} className="text-[#1F2937] opacity-50" />
              </div>
              <h4 className="text-[18px] font-[600] text-[#1F2937]">
                No Customers Found
              </h4>
              <p className="glass-secondary max-w-xs mx-auto mt-1">
                There are no customers registered in this zone yet.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Customer Modal */}
      <Modal
        isOpen={showCreateModal || !!editingCustomer}
        onClose={() => {
          setShowCreateModal(false);
          setEditingCustomer(null);
        }}
        title={
          editingCustomer
            ? `Edit Customer: ${editingCustomer.full_name || editingCustomer.display_name}`
            : "Create New Customer"
        }
      >
        <AddCustomerForm
          onSubmit={() => {
            setShowCreateModal(false);
            setEditingCustomer(null);
            // No manual fetch needed anymore due to onSnapshot!
          }}
          onCancel={() => {
            setShowCreateModal(false);
            setEditingCustomer(null);
          }}
          initialData={editingCustomer}
        />
      </Modal>
    </div>
  );
};

export default RegionCustomers;
