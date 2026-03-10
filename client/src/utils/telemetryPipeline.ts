import { computeDeviceStatus } from '../services/DeviceService';

export const computeOnlineStatus = (lastSeen: string | null): 'Online' | 'Offline' => {
    return computeDeviceStatus(lastSeen);
};
