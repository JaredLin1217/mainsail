import type { Module } from 'vuex'
import type { RootState } from '@/store/types'
import type { ServerWifiState } from './types'
import { actions } from './actions'
import { mutations } from './mutations'

export const getDefaultState = (): ServerWifiState => ({
    status: null,
    networks: [],
    revision: 0,
})

export const wifi: Module<ServerWifiState, RootState> = {
    namespaced: true,
    state: getDefaultState(),
    actions,
    mutations,
}
