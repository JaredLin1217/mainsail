import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    canRunInitialWifiScan,
    canRunWifiBackgroundScan,
    getVisibleWifiError,
    getWifiConnectionSignature,
    isCurrentWifiNetwork,
    isValidWifiPassword,
    shouldDisplayWifiBackendError,
    shouldDisplayWifiOperation,
    shouldFinalizeWifiUserOperation,
    sortWifiNetworks,
    WifiPageLifecycle,
    WifiScanScheduler,
    WifiSingleFlight,
} from '@/plugins/wifi'
import type { WifiNetwork, WifiStatus } from '@/types/moonraker/MachineRPC'

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

const network = (ssid: string, strength: number): WifiNetwork => ({
    ssid,
    security: 'wpa-psk',
    strength,
    saved: false,
    connected: false,
    frequency: 2412,
})

afterEach(() => {
    vi.useRealTimers()
})

describe('Wifi password validation', () => {
    it('accepts WPA passphrases within the valid byte range', () => {
        expect(isValidWifiPassword('12345678')).toBe(true)
        expect(isValidWifiPassword('1234567')).toBe(false)
        expect(isValidWifiPassword('x'.repeat(63))).toBe(true)
        expect(isValidWifiPassword('x'.repeat(64))).toBe(false)
    })

    it('validates Unicode passphrases by UTF-8 byte length', () => {
        expect(isValidWifiPassword('密'.repeat(21))).toBe(true)
        expect(isValidWifiPassword('密'.repeat(22))).toBe(false)
    })

    it('accepts 64-character hexadecimal keys without trimming user input', () => {
        expect(isValidWifiPassword('a'.repeat(64))).toBe(true)
        expect(isValidWifiPassword(' 123456 ')).toBe(true)
    })
})

describe('Wifi live network presentation', () => {
    it('uses live status for current-network checks and deterministic ordering', () => {
        const networks = [network('Zulu', 70), network('Alpha', 70), network('Workshop', 10)]

        expect(isCurrentWifiNetwork(status, networks[2])).toBe(true)
        expect(sortWifiNetworks(status, networks).map((item) => item.ssid)).toEqual(['Workshop', 'Alpha', 'Zulu'])
    })

    it('only changes the connection signature for fields that require a settled refresh', () => {
        const signature = getWifiConnectionSignature(status)

        expect(getWifiConnectionSignature({ ...status, strength: 5, connectivity: 'limited' })).toBe(signature)
        expect(getWifiConnectionSignature({ ...status, state: 'connecting' })).not.toBe(signature)
        expect(getWifiConnectionSignature({ ...status, ssid: 'Office' })).not.toBe(signature)
        expect(getWifiConnectionSignature({ ...status, ip_address: '192.168.1.21' })).not.toBe(signature)
    })

    it('keeps background scan operation state and backend errors out of the visible UI', () => {
        const scanOperation = {
            id: 'scan-1',
            type: 'scan' as const,
            ssid: null,
            state: 'failed' as const,
            started_at: 1,
        }
        const failedScanStatus: WifiStatus = {
            ...status,
            operation: scanOperation,
            last_error: {
                code: 'timeout',
                message: 'scan timed out',
                recovered_ssid: null,
            },
        }

        expect(shouldDisplayWifiOperation(scanOperation, false)).toBe(false)
        expect(shouldDisplayWifiOperation(scanOperation, true)).toBe(true)
        expect(shouldDisplayWifiBackendError(failedScanStatus)).toBe(false)
        expect(shouldDisplayWifiBackendError({ ...failedScanStatus, operation: null })).toBe(true)
        const foregroundError = { code: 'timeout', message: 'manual scan timed out', recovered_ssid: null }
        expect(getVisibleWifiError(null, failedScanStatus)).toBeNull()
        expect(getVisibleWifiError(foregroundError, failedScanStatus)).toBe(foregroundError)
        expect(shouldFinalizeWifiUserOperation(scanOperation)).toBe(false)
        expect(
            shouldFinalizeWifiUserOperation({
                ...scanOperation,
                type: 'connect',
                state: 'succeeded',
                ssid: 'Workshop',
            })
        ).toBe(true)
    })
})

describe('Wifi background refresh scheduling', () => {
    it('does not start refresh work after an async mount is destroyed', async () => {
        const lifecycle = new WifiPageLifecycle()
        const startTimers = vi.fn()
        let finishInitialRequest: (() => void) | undefined
        const initialRequest = new Promise<void>((resolve) => {
            finishInitialRequest = resolve
        })
        const finishMount = async () => {
            await initialRequest
            if (lifecycle.active) startTimers()
        }

        const mounting = finishMount()
        lifecycle.destroy()
        finishInitialRequest?.()
        await mounting

        expect(lifecycle.active).toBe(false)
        expect(startTimers).not.toHaveBeenCalled()
    })

    it('does not run the automatic initial scan while the page is hidden', () => {
        const ready = {
            pageVisible: true,
            operationRunning: false,
            adapterAvailable: true,
            hasError: false,
        }

        expect(canRunInitialWifiScan(ready)).toBe(true)
        expect(canRunInitialWifiScan({ ...ready, pageVisible: false })).toBe(false)
    })

    it('coalesces rapid connection changes into one settled scan request', () => {
        vi.useFakeTimers()
        const onPending = vi.fn()
        const scheduler = new WifiScanScheduler(onPending)

        scheduler.requestAfterSettle()
        vi.advanceTimersByTime(1000)
        scheduler.requestAfterSettle()
        vi.advanceTimersByTime(1000)
        scheduler.requestAfterSettle()
        vi.advanceTimersByTime(1999)
        expect(onPending).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)
        expect(onPending).toHaveBeenCalledTimes(1)
        expect(scheduler.pending).toBe(true)
    })

    it('retains a pending scan while any safety condition blocks it', () => {
        const scheduler = new WifiScanScheduler(vi.fn())
        scheduler.requestNow()
        const ready = {
            localKiosk: true,
            pageVisible: true,
            socketConnected: true,
            adapterAvailable: true,
            connectionStable: true,
            dialogOpen: false,
            busy: false,
            hasError: false,
            cooldownComplete: true,
        }

        for (const blocked of [
            { ...ready, pageVisible: false },
            { ...ready, socketConnected: false },
            { ...ready, adapterAvailable: false },
            { ...ready, connectionStable: false },
            { ...ready, dialogOpen: true },
            { ...ready, busy: true },
            { ...ready, hasError: true },
            { ...ready, cooldownComplete: false },
        ]) {
            expect(scheduler.consume(canRunWifiBackgroundScan(blocked))).toBe(false)
            expect(scheduler.pending).toBe(true)
        }

        expect(scheduler.consume(canRunWifiBackgroundScan(ready))).toBe(true)
        expect(scheduler.pending).toBe(false)
    })

    it('does not let a periodic request bypass the connection settle delay', () => {
        vi.useFakeTimers()
        const onPending = vi.fn()
        const scheduler = new WifiScanScheduler(onPending)

        scheduler.requestAfterSettle()
        vi.advanceTimersByTime(1000)
        scheduler.requestNow()

        expect(scheduler.pending).toBe(true)
        expect(scheduler.settling).toBe(true)
        expect(
            scheduler.consume(
                canRunWifiBackgroundScan({
                    localKiosk: true,
                    pageVisible: true,
                    socketConnected: true,
                    adapterAvailable: true,
                    connectionStable: !scheduler.settling,
                    dialogOpen: false,
                    busy: false,
                    hasError: false,
                    cooldownComplete: true,
                })
            )
        ).toBe(false)

        vi.advanceTimersByTime(1000)
        expect(scheduler.settling).toBe(false)
        expect(onPending).toHaveBeenCalledTimes(2)
    })

    it('keeps status polling single-flight until the active request settles', async () => {
        let resolveRequest: ((value: WifiStatus) => void) | undefined
        const request = new Promise<WifiStatus>((resolve) => {
            resolveRequest = resolve
        })
        const task = vi.fn(() => request)
        const singleFlight = new WifiSingleFlight<WifiStatus>()

        const first = singleFlight.run(task)
        const second = singleFlight.run(task)
        expect(first).toBe(second)
        expect(task).toHaveBeenCalledTimes(1)
        expect(singleFlight.running).toBe(true)

        resolveRequest?.(status)
        await expect(first).resolves.toEqual(status)
        await Promise.resolve()
        expect(singleFlight.running).toBe(false)

        void singleFlight.run(task)
        expect(task).toHaveBeenCalledTimes(2)
    })
})
