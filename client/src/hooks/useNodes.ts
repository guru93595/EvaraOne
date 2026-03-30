import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { NodeService } from "../services/DeviceService";
import { useAuth } from "../context/AuthContext";

export const useNodes = (searchQuery: string = "") => {
  const { user } = useAuth();
  const [nodes, setNodes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    let q;
    if (user.role === "superadmin") {
      // Admins see everything
      q = query(collection(db, "devices"));
    } else {
      // Customers see only active assigned devices
      q = query(
        collection(db, "devices"),
        where("customer_id", "==", user.resolved_customer_id || user.id),
        where("is_active", "==", true)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mappedNodes = snapshot.docs.map(doc => 
        NodeService.mapNodeData({ id: doc.id, ...doc.data() })
      );

      let filteredNodes = mappedNodes;
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        filteredNodes = mappedNodes.filter(
          (n: any) =>
            (n.displayName || "").toLowerCase().includes(searchLower) ||
            (n.hardwareId || "").toLowerCase().includes(searchLower) ||
            (n.label || "").toLowerCase().includes(searchLower) ||
            (n.id || "").toLowerCase().includes(searchLower)
        );
      }

      setNodes(filteredNodes);
      setIsLoading(false);
    }, (err) => {
      console.error("[useNodes] Firestore Error:", err);
      setError(err.message);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user?.id, user?.resolved_customer_id, user?.role, searchQuery]);

  return {
    nodes,
    loading: isLoading,
    error,
    refresh: () => {} // No-op for onSnapshot
  };
};
