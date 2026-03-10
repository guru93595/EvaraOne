import { useEffect, useState } from "react";
import { socket } from "../services/api";
import { deviceService } from "../services/DeviceService";

export const useRealtimeTelemetry = (nodeId: string, initialData: any = null) => {
    const [telemetry, setTelemetry] = useState<any>(initialData);
    const [lastSync, setLastSync] = useState<string>("");

    useEffect(() => {
        if (!nodeId) return;

        // SaaS Architecture: Join the specific room for this device
        // This prevents the server from broadcasting to ALL connected clients
        socket.emit("subscribe_device", nodeId);

        if (initialData) {
            setTelemetry(initialData);
            setLastSync(new Date().toLocaleTimeString());
        }

        // ─── Instant Polling Backup (5s) ───
        // ensures data is fresh even if WebSocket pulse is missed
        const poll = async () => {
            try {
                const data = await deviceService.getNodeTelemetry(nodeId);
                if (data) {
                    setTelemetry(data);
                    setLastSync(new Date().toLocaleTimeString());
                }
            } catch (err) {}
        };
        
        // Initial fetch
        poll();
        const pollInterval = setInterval(poll, 5000);

        const handleUpdate = (data: any) => {
            // Validate the payload is for this node
            if (data.device_id === nodeId || data.node_id === nodeId) {
                setTelemetry(data);
                setLastSync(new Date().toLocaleTimeString());
            }
        };

        const eventName = "telemetry_update";
        socket.on(eventName, handleUpdate);

        return () => {
            socket.emit("unsubscribe_device", nodeId);
            socket.off(eventName, handleUpdate);
            clearInterval(pollInterval);
        };
    }, [nodeId, initialData]);

    return { telemetry, lastSync };
};
