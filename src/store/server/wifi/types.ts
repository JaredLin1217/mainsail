import type { WifiNetwork, WifiStatus } from '@/types/moonraker/MachineRPC'

export interface ServerWifiState {
    status: WifiStatus | null
    networks: WifiNetwork[]
}

export interface WifiScanPayload {
    status: WifiStatus
    networks: WifiNetwork[]
}
