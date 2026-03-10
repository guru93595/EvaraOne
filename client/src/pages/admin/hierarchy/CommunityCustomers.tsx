import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  User,
  Smartphone,
  AlertCircle,
  ArrowLeft,
  Edit2,
  Trash2,
  Plus,
} from "lucide-react";
import { adminService } from "../../../services/admin";
import type { Zone, Community } from "../../../types/entities";
import { Modal } from "../../../components/ui/Modal";
import { AddCustomerForm } from "../../../components/admin/forms/AddCustomerForm";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../components/ToastProvider";

const CommunityCustomers = () => {
  const { communityId } = useParams();
  const navigate = useNavigate();
  const [community, setCommunity] = useState<Community | null>(null);
  const [regionData, setRegionData] = useState<Zone | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const { user } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      if (!communityId) return;
      try {
        const commData = await adminService.getCommunity(communityId);
        const clientRes = await adminService.getClients(communityId);

        if (commData) {
          setCommunity(commData);
          setRegionData((commData as any).zones as Zone);
        }
        setClients(clientRes as any[]);
      } catch (error) {
        console.error("Failed to fetch community clients:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [communityId]);

  const fetchData = async () => {
    if (!communityId) return;
    setLoading(true);
    try {
      const commData = await adminService.getCommunity(communityId);
      const clientRes = await adminService.getClients(communityId);

      if (commData) {
        setCommunity(commData);
        setRegionData((commData as any).zones as Zone);
      }
      setClients(clientRes as any[]);
    } catch (error) {
      console.error("Failed to fetch community clients:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCustomer = async (
    e: React.MouseEvent,
    customerId: string,
  ) => {
    e.stopPropagation();
    if (
      !window.confirm(
        "Are you sure you want to delete this customer? This will remove their access and all assigned devices.",
      )
    )
      return;

    try {
      await adminService.deleteCustomer(customerId);
      showToast("Customer deleted successfully", "success");
      fetchData();
    } catch (err: any) {
      showToast(err.message || "Failed to delete customer", "error");
    }
  };


  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-4 tracking-wide font-medium">
        <span
          onClick={() => navigate("/superadmin/zones")}
          className="hover:text-blue-600 cursor-pointer transition-colors"
        >
          Zones
        </span>
        <ChevronRight size={14} className="text-slate-400" />
        <span
          onClick={() => navigate(`/superadmin/zones/${regionData?.id}`)}
          className="hover:text-blue-600 cursor-pointer transition-colors truncate max-w-[150px]"
        >
          {regionData?.zoneName || "Zone"}
        </span>
        <ChevronRight size={14} className="text-slate-400" />
        <span className="font-bold text-slate-800">
          {community?.name || "Community"}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">
            {community?.name || "..."}
          </h2>
          <p className="text-slate-500 mt-1">
            Manage residents and their assigned devices in this community.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user?.role === "superadmin" && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#1F2937] text-white text-sm font-bold rounded-xl hover:bg-[#111827] shadow-md transition-all"
            >
              <Plus size={16} />
              Add Customer
            </button>
          )}
          <button
            onClick={() => navigate(`/superadmin/zones/${regionData?.id}`)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-white/30 text-sm font-bold shadow-sm transition-all hover:shadow"
          >
            <ArrowLeft size={16} /> Back to Zone
          </button>
        </div>
      </div>

      <div className="apple-glass-card rounded-3xl border border-slate-200/80 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="apple-glass-inner border-b border-slate-200/80 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">
              <th className="px-6 py-5">Customer Profile</th>
              <th className="px-6 py-5">Contact Details</th>
              <th className="px-6 py-5">Assigned Hardware</th>
              <th className="px-6 py-5">Network Status</th>
              <th className="px-6 py-5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.map((client) => (
              <tr
                key={client.id}
                onClick={() => navigate(`/superadmin/customers/${client.id}`)}
                className="group hover:bg-blue-50/50 transition-colors cursor-pointer"
              >
                <td className="px-6 py-5">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 flex items-center justify-center text-indigo-600 border border-indigo-200/50 shadow-inner group-hover:scale-105 transition-transform">
                      <User size={20} />
                    </div>
                    <div>
                      <span className="font-extrabold text-slate-800 text-[15px] group-hover:text-indigo-600 transition-colors block">
                        {client.name || "Unnamed Client"}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div>
                    <p className="text-[13px] text-slate-700 font-bold">
                      {client.email || "No email"}
                    </p>
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mt-0.5">
                      {client.phone || "No Phone"}
                    </p>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-2 text-[13px] font-bold text-slate-600">
                    <div className="w-8 h-8 rounded-lg apple-glass-inner border border-slate-100 flex items-center justify-center">
                      <Smartphone size={14} className="text-slate-400" />
                    </div>
                    {client.devices?.length || 0} Nodes
                  </div>
                </td>
                <td className="px-6 py-5">
                  {client.devices &&
                  client.devices.length > 0 &&
                  client.devices.some((d: any) => d.status === "alert") ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-xs font-bold border border-red-100">
                      <AlertCircle size={12} /> Alert
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-600 text-xs font-bold border border-green-100">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500" />{" "}
                      Active
                    </span>
                  )}
                </td>
                <td className="px-6 py-5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {user?.role === "superadmin" && (
                      <div className="flex items-center gap-1 mr-2 invisible group-hover:visible">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCustomer(client);
                          }}
                          className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteCustomer(e, client.id)}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-red-600 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                    <ChevronRight
                      size={18}
                      className="text-slate-300 group-hover:text-indigo-600 transition-colors"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {clients.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            No customers found in this community.
          </div>
        )}
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
            ? `Edit Customer: ${editingCustomer.name}`
            : "Create New Customer"
        }
      >
        <AddCustomerForm
          onSubmit={() => {
            setShowCreateModal(false);
            setEditingCustomer(null);
            fetchData();
          }}
          onCancel={() => {
            setShowCreateModal(false);
            setEditingCustomer(null);
          }}
          initialData={
            editingCustomer
              ? {
                  ...editingCustomer,
                  display_name: editingCustomer.name,
                  full_name: editingCustomer.full_name || editingCustomer.name,
                  // email and other fields should already match the schema if they were created correctly
                }
              : null
          }
        />
      </Modal>
    </div>
  );
};

export default CommunityCustomers;
