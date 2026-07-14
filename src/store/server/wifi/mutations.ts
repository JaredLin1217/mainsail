import type { MutationTree } from 'vuex'
import type { WifiNetwork, WifiStatus } from '@/types/moonraker/MachineRPC'
import type { ServerWifiState } from './types'
import { getDefaultState } from './index'

export const mutations: MutationTree<ServerWifiState> = {
    reset(state) {
        Object.assign(state, getDefaultState())
    },

    setStatus(state, payload: WifiStatus) {
        state.status = payload
    },

    setNetworks(state, payload: WifiNetwork[]) {
        state.networks = payload
    },
}
