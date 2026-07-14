import type { WifiError, WifiNetwork, WifiOperation, WifiStatus } from '@/types/moonraker/MachineRPC'

const WPA_PASSPHRASE_MIN_BYTES = 8
const WPA_PASSPHRASE_MAX_BYTES = 63
const WPA_HEX_KEY_PATTERN = /^[0-9a-f]{64}$/i

export const isValidWifiPassword = (password: string): boolean => {
    if (WPA_HEX_KEY_PATTERN.test(password)) return true

    const byteLength = new TextEncoder().encode(password).length
    return byteLength >= WPA_PASSPHRASE_MIN_BYTES && byteLength <= WPA_PASSPHRASE_MAX_BYTES
}

export const isCurrentWifiNetwork = (status: WifiStatus | null, network: Pick<WifiNetwork, 'ssid'>): boolean =>
    Boolean(status?.connected && status.ssid && status.ssid === network.ssid)

export const getWifiConnectionSignature = (status: WifiStatus | null): string =>
    JSON.stringify([
        status?.available ?? false,
        status?.state ?? 'unavailable',
        status?.ssid ?? null,
        status?.ip_address ?? null,
    ])

export const sortWifiNetworks = (status: WifiStatus | null, networks: WifiNetwork[]): WifiNetwork[] =>
    [...networks].sort((a, b) => {
        const aCurrent = isCurrentWifiNetwork(status, a)
        const bCurrent = isCurrentWifiNetwork(status, b)
        if (aCurrent !== bCurrent) return aCurrent ? -1 : 1
        if (a.strength !== b.strength) return b.strength - a.strength
        if (a.ssid !== b.ssid) return a.ssid < b.ssid ? -1 : 1
        if (a.security === b.security) return 0
        return a.security < b.security ? -1 : 1
    })

export const shouldDisplayWifiOperation = (
    operation: WifiOperation | null | undefined,
    foregroundScan: boolean
): boolean => Boolean(operation && (operation.type !== 'scan' || foregroundScan))

export const shouldDisplayWifiBackendError = (status: WifiStatus | null): boolean =>
    Boolean(status?.last_error && status.operation?.type !== 'scan')

export const getVisibleWifiError = <T>(requestError: T | null, status: WifiStatus | null): T | WifiError | null => {
    if (requestError) return requestError
    return shouldDisplayWifiBackendError(status) ? status?.last_error ?? null : null
}

export const shouldFinalizeWifiUserOperation = (operation: WifiOperation): boolean =>
    operation.state === 'succeeded' && operation.type !== 'scan'

export interface WifiInitialScanReadiness {
    pageVisible: boolean
    operationRunning: boolean
    adapterAvailable: boolean
    hasError: boolean
}

export const canRunInitialWifiScan = (readiness: WifiInitialScanReadiness): boolean =>
    readiness.pageVisible && !readiness.operationRunning && readiness.adapterAvailable && !readiness.hasError

export interface WifiBackgroundScanReadiness {
    localKiosk: boolean
    pageVisible: boolean
    socketConnected: boolean
    adapterAvailable: boolean
    connectionStable: boolean
    dialogOpen: boolean
    busy: boolean
    hasError: boolean
    cooldownComplete: boolean
}

export const canRunWifiBackgroundScan = (readiness: WifiBackgroundScanReadiness): boolean =>
    readiness.localKiosk &&
    readiness.pageVisible &&
    readiness.socketConnected &&
    readiness.adapterAvailable &&
    readiness.connectionStable &&
    !readiness.dialogOpen &&
    !readiness.busy &&
    !readiness.hasError &&
    readiness.cooldownComplete

export class WifiSingleFlight<T> {
    private current: Promise<T> | null = null

    get running(): boolean {
        return this.current !== null
    }

    run(task: () => Promise<T>): Promise<T> {
        if (this.current !== null) return this.current

        const request = Promise.resolve(task())
        this.current = request
        void request.then(
            () => {
                if (this.current === request) this.current = null
            },
            () => {
                if (this.current === request) this.current = null
            }
        )
        return request
    }
}

export class WifiPageLifecycle {
    private destroyed = false

    get active(): boolean {
        return !this.destroyed
    }

    destroy() {
        this.destroyed = true
    }
}

export class WifiScanScheduler {
    private settleTimer: ReturnType<typeof setTimeout> | null = null

    pending = false

    get settling(): boolean {
        return this.settleTimer !== null
    }

    constructor(
        private readonly onPending: () => void,
        private readonly settleDelayMs = 2000
    ) {}

    requestNow() {
        this.pending = true
        this.onPending()
    }

    requestAfterSettle() {
        if (this.settleTimer !== null) clearTimeout(this.settleTimer)
        this.settleTimer = setTimeout(() => {
            this.settleTimer = null
            this.requestNow()
        }, this.settleDelayMs)
    }

    consume(canRun: boolean): boolean {
        if (!this.pending || !canRun) return false
        this.pending = false
        return true
    }

    cancelPending() {
        if (this.settleTimer !== null) clearTimeout(this.settleTimer)
        this.settleTimer = null
        this.pending = false
    }

    destroy() {
        this.cancelPending()
    }
}
