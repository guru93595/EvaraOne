import { useState, useEffect } from "react";
import { deviceService, type MapDevice } from "../services/DeviceService";
import { useAuth } from "../context/AuthContext";

export type { MapDevice };

/**
 * Hook to fetch all devices for map display with real-time updates directly from Firestore
 */
export const useMapDevices = () => {
  const { user } = useAuth();
  const [devices, setDevices] = useState<MapDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const communityId = user?.role === "customer" ? user.community_id : undefined;

  useEffect(() => {
    // No more blocking loading state - persistence will provide cached data instantly
    const unsubscribe = deviceService.subscribeToMapNodes((data) => {
      setDevices(data);
      setIsLoading(false);
    }, communityId);

    return () => unsubscribe();
  }, [communityId]);

  return { data: devices, isLoading };
};
