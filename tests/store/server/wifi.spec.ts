import { describe, expect, it } from 'vitest'
import type { WifiNetwork, WifiStatus } from '@/types/moonraker/MachineRPC'
import { getDefaultState } from '@/store/server/wifi'
import { mutations } from '@/store/server/wifi/mutations'

const status: WifiStatus = {
    interface: 'wlp1s0',
    available: true,
    state: 'connected',
    connected: true,
    ssid: 'Workshop',
    strength: 82,
    ip_address: '192.168.1.20',
    connectivity: 'full',
    operation: null,
    last_error: null,
}

const networks: WifiNetwork[] = [
    {
        ssid: 'Workshop',
        security: 'wpa-psk',
        strength: 82,
        saved: true,
        connected: true,
        frequency: 2412,
    },
]

describe('server/wifi mutations', () => {
    it('stores status notifications independently from scan results', () => {
        const state = getDefaultState()

        mutations.setStatus(state, status)

        expect(state.status).toEqual(status)
        expect(state.networks).toEqual([])
    })

    it('stores and resets scanned networks', () => {
        const state = getDefaultState()

        mutations.setNetworks(state, networks)
        expect(state.networks).toEqual(networks)

        mutations.reset(state)
        expect(state).toEqual(getDefaultState())
    })
})
