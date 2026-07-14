import type { ActionTree } from 'vuex'
import type { RootState } from '@/store/types'
import type { WifiStatus } from '@/types/moonraker/MachineRPC'
import type { ServerWifiState, WifiScanPayload } from './types'

export const actions: ActionTree<ServerWifiState, RootState> = {
    reset({ commit }) {
        commit('reset')
    },

    updateStatus({ commit }, payload: WifiStatus) {
        commit('setStatus', payload)
    },

    updateScan({ commit }, payload: WifiScanPayload) {
        commit('setStatus', payload.status)
        commit('setNetworks', payload.networks)
    },
}
