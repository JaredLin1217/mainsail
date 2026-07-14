import type { WifiNetwork, WifiNetworksSnapshot, WifiStatus } from '@/types/moonraker/MachineRPC'

export interface ServerWifiState {
    status: WifiStatus | null
    networks: WifiNetwork[]
    revision: number
}

export type WifiScanPayload = WifiNetworksSnapshot

export interface WifiStatusRevisionPayload {
    status: WifiStatus
    revision: number
}
