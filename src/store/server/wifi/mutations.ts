import type { MutationTree } from 'vuex'
import type { WifiNetwork, WifiNetworksSnapshot, WifiStatus } from '@/types/moonraker/MachineRPC'
import type { ServerWifiState } from './types'
import { getDefaultState } from './index'

export const normalizeWifiNetworks = (status: WifiStatus, networks: WifiNetwork[]): WifiNetwork[] =>
    networks.map((network) => {
        const connected = Boolean(status.connected && status.ssid && network.ssid === status.ssid)

        return {
            ...network,
            connected,
            strength: connected && status.strength !== null ? status.strength : network.strength,
        }
    })

export const mutations: MutationTree<ServerWifiState> = {
    reset(state) {
        const revision = state.revision + 1
        Object.assign(state, getDefaultState())
        state.revision = revision
    },

    setStatus(state, payload: WifiStatus) {
        state.status = payload
        state.networks = normalizeWifiNetworks(payload, state.networks)
        state.revision += 1
    },

    setSnapshot(state, payload: WifiNetworksSnapshot) {
        state.status = payload.status
        state.networks = normalizeWifiNetworks(payload.status, payload.networks)
        state.revision += 1
    },
}
