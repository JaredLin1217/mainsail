import type { ActionTree } from 'vuex'
import type { RootState } from '@/store/types'
import type { WifiStatus } from '@/types/moonraker/MachineRPC'
import type { ServerWifiState, WifiScanPayload, WifiStatusRevisionPayload } from './types'

export const actions: ActionTree<ServerWifiState, RootState> = {
    reset({ commit }) {
        commit('reset')
    },

    updateStatus({ commit }, payload: WifiStatus) {
        commit('setStatus', payload)
    },

    updateStatusIfRevision({ commit, state }, payload: WifiStatusRevisionPayload) {
        if (state.revision !== payload.revision) return false

        commit('setStatus', payload.status)
        return true
    },

    updateScan({ commit }, payload: WifiScanPayload) {
        commit('setSnapshot', payload)
    },

    updateSnapshot({ commit }, payload: WifiScanPayload) {
        commit('setSnapshot', payload)
    },
}
