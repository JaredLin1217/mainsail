import { describe, expect, it, vi } from 'vitest'
import type { WifiNetwork, WifiNetworksSnapshot, WifiStatus } from '@/types/moonraker/MachineRPC'
import { getDefaultState } from '@/store/server/wifi'
import { actions } from '@/store/server/wifi/actions'
import { mutations } from '@/store/server/wifi/mutations'
import { actions as socketActions } from '@/store/socket/actions'

const connectedStatus: WifiStatus = {
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

const workshop: WifiNetwork = {
    ssid: 'Workshop',
    security: 'wpa-psk',
    strength: 72,
    saved: true,
    connected: false,
    frequency: 2412,
}

const office: WifiNetwork = {
    ssid: 'Office',
    security: 'wpa-psk',
    strength: 64,
    saved: true,
    connected: true,
    frequency: 2437,
}

describe('server/wifi state consistency', () => {
    it('reconciles a status-first automatic switch without creating synthetic rows', () => {
        const state = getDefaultState()
        state.networks = [office, workshop]

        mutations.setStatus(state, connectedStatus)

        expect(state.revision).toBe(1)
        expect(state.status).toEqual(connectedStatus)
        expect(state.networks).toEqual([
            { ...office, connected: false },
            { ...workshop, connected: true, strength: 82 },
        ])

        mutations.setStatus(state, { ...connectedStatus, ssid: 'NotInScan', strength: 91 })
        expect(state.revision).toBe(2)
        expect(state.networks).toHaveLength(2)
        expect(state.networks.every((network) => !network.connected)).toBe(true)
    })

    it('clears every connected marker when the adapter disconnects', () => {
        const state = getDefaultState()
        state.networks = [{ ...workshop, connected: true }]

        mutations.setStatus(state, {
            ...connectedStatus,
            state: 'disconnected',
            connected: false,
            ssid: null,
            strength: null,
            ip_address: null,
        })

        expect(state.networks[0].connected).toBe(false)
    })

    it('applies a scan or event snapshot with one atomic mutation', () => {
        const snapshot: WifiNetworksSnapshot = {
            status: connectedStatus,
            networks: [office, workshop],
        }
        const state = getDefaultState()
        const commit = vi.fn()
        const updateSnapshot = actions.updateSnapshot

        expect(typeof updateSnapshot).toBe('function')
        if (typeof updateSnapshot !== 'function') return
        updateSnapshot.call({} as never, { commit } as never, snapshot)

        expect(commit).toHaveBeenCalledTimes(1)
        expect(commit).toHaveBeenCalledWith('setSnapshot', snapshot)

        mutations.setSnapshot(state, snapshot)
        expect(state.revision).toBe(1)
        expect(state.status).toEqual(connectedStatus)
        expect(state.networks[0]).toEqual({ ...office, connected: false })
        expect(state.networks[1]).toEqual({ ...workshop, connected: true, strength: 82 })
    })

    it('routes network-list notifications to the atomic snapshot action', () => {
        const snapshot: WifiNetworksSnapshot = {
            status: connectedStatus,
            networks: [workshop],
        }
        const dispatch = vi.fn()
        const onMessage = socketActions.onMessage

        expect(typeof onMessage).toBe('function')
        if (typeof onMessage !== 'function') return
        onMessage.call(
            {} as never,
            { dispatch, commit: vi.fn() } as never,
            { method: 'notify_wifi_networks_changed', params: [snapshot] }
        )

        expect(dispatch).toHaveBeenCalledWith('server/wifi/updateSnapshot', snapshot, { root: true })
    })

    it('rejects an in-flight status response after a newer snapshot changes the revision', async () => {
        const state = getDefaultState()
        const requestRevision = state.revision
        let resolveStatus: ((status: WifiStatus) => void) | undefined
        const statusResponse = new Promise<WifiStatus>((resolve) => {
            resolveStatus = resolve
        })
        const newerStatus = { ...connectedStatus, ssid: 'Office', strength: 64 }
        const newerSnapshot: WifiNetworksSnapshot = {
            status: newerStatus,
            networks: [office, workshop],
        }
        const commit = vi.fn()
        const updateStatusIfRevision = actions.updateStatusIfRevision

        expect(typeof updateStatusIfRevision).toBe('function')
        if (typeof updateStatusIfRevision !== 'function') return
        const applyResponse = statusResponse.then((response) =>
            updateStatusIfRevision.call(
                {} as never,
                { commit, state } as never,
                { status: response, revision: requestRevision }
            )
        )
        mutations.setSnapshot(state, newerSnapshot)
        resolveStatus?.(connectedStatus)

        await expect(applyResponse).resolves.toBe(false)
        expect(commit).not.toHaveBeenCalled()
        expect(state.status).toEqual(newerStatus)
        expect(state.networks[0].ssid).toBe('Office')
        expect(state.networks[0].connected).toBe(true)
    })

    it('applies a status response only when its captured revision is still current', () => {
        const state = getDefaultState()
        const commit = vi.fn()
        const updateStatusIfRevision = actions.updateStatusIfRevision

        expect(typeof updateStatusIfRevision).toBe('function')
        if (typeof updateStatusIfRevision !== 'function') return
        const applied = updateStatusIfRevision.call(
            {} as never,
            { commit, state } as never,
            { status: connectedStatus, revision: state.revision }
        )

        expect(applied).toBe(true)
        expect(commit).toHaveBeenCalledWith('setStatus', connectedStatus)
    })

    it('resets status and networks together', () => {
        const state = getDefaultState()
        mutations.setSnapshot(state, { status: connectedStatus, networks: [workshop] })
        const revisionBeforeReset = state.revision

        mutations.reset(state)

        expect(state.status).toBeNull()
        expect(state.networks).toEqual([])
        expect(state.revision).toBe(revisionBeforeReset + 1)
    })
})
