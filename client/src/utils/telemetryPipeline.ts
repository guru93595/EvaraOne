import { computeDeviceStatus } from '../services/DeviceService';

export const computeOnlineStatus = (lastSeen: string | null, deviceId?: string): 'Online' | 'Offline' => {
    return computeDeviceStatus(lastSeen, deviceId);
};
