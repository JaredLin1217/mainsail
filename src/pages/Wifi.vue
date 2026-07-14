<template>
    <v-container class="wifi-page py-6" fluid>
        <v-alert v-if="!isLocalKiosk" class="mx-auto" max-width="840" type="info" prominent>
            <div class="text-h6 mb-2">{{ $t('Wifi.LocalOnlyTitle') }}</div>
            <div>{{ $t('Wifi.LocalOnlyDescription') }}</div>
        </v-alert>

        <template v-else>
            <v-card class="mx-auto mb-5" max-width="840" outlined>
                <v-card-title class="wifi-card-title py-5">
                    <v-icon class="mr-3" color="primary" size="32">{{ mdiWifi }}</v-icon>
                    <span>{{ $t('Wifi.Title') }}</span>
                    <v-spacer />
                    <v-btn
                        class="touch-button"
                        color="primary"
                        large
                        :disabled="!canScan"
                        :loading="localRequest === 'scan'"
                        @click="scanNetworks">
                        <v-icon left>{{ mdiRefresh }}</v-icon>
                        {{ $t('Wifi.Rescan') }}
                    </v-btn>
                </v-card-title>

                <v-divider />

                <v-card-text class="pa-5 pa-sm-6">
                    <div class="d-flex flex-wrap align-center mb-5 wifi-status-row">
                        <v-chip :color="statusColor" dark large>
                            <v-progress-circular v-if="isConnecting" class="mr-2" indeterminate size="18" width="2" />
                            <v-icon v-else left>{{ statusIcon }}</v-icon>
                            {{ statusText }}
                        </v-chip>
                        <span v-if="wifiStatus" class="ml-sm-3 mt-2 mt-sm-0 text--secondary">
                            {{ wifiStatus.interface }}
                        </span>
                    </div>

                    <v-skeleton-loader v-if="initialLoading && !wifiStatus" type="article" />

                    <template v-else>
                        <v-alert v-if="!wifiStatus || !wifiStatus.available" type="error" prominent text>
                            {{ $t('Wifi.AdapterUnavailable') }}
                        </v-alert>

                        <div class="wifi-current-grid">
                            <div class="wifi-current-field">
                                <div class="text-caption text-uppercase text--secondary">
                                    {{ $t('Wifi.CurrentNetwork') }}
                                </div>
                                <div class="text-h6 text-break">{{ currentSsid }}</div>
                            </div>
                            <div class="wifi-current-field">
                                <div class="text-caption text-uppercase text--secondary">{{ $t('Wifi.Signal') }}</div>
                                <div class="text-h6 d-flex align-center">
                                    <v-icon class="mr-2">{{ signalIcon(wifiStatus && wifiStatus.strength) }}</v-icon>
                                    {{ currentStrength }}
                                </div>
                            </div>
                            <div class="wifi-current-field">
                                <div class="text-caption text-uppercase text--secondary">
                                    {{ $t('Wifi.IpAddress') }}
                                </div>
                                <div class="text-h6 text-break">{{ currentIp }}</div>
                            </div>
                            <div class="wifi-current-field">
                                <div class="text-caption text-uppercase text--secondary">{{ $t('Wifi.Internet') }}</div>
                                <div class="text-h6">{{ connectivityText }}</div>
                            </div>
                        </div>

                        <v-alert v-if="hasLimitedConnectivity" class="mt-5 mb-0" type="warning" prominent text>
                            {{ $t('Wifi.NoInternet') }}
                        </v-alert>
                        <v-alert v-if="operationText" class="mt-5 mb-0" type="info" prominent text>
                            <v-progress-circular class="mr-3" indeterminate size="20" width="2" />
                            {{ operationText }}
                        </v-alert>
                        <v-alert v-if="visibleError" class="mt-5 mb-0" type="error" prominent dismissible>
                            <div>{{ errorText }}</div>
                            <div v-if="visibleError.recovered_ssid" class="mt-2 font-weight-medium">
                                {{ $t('Wifi.RecoveredNetwork', { ssid: visibleError.recovered_ssid }) }}
                            </div>
                            <div v-else-if="visibleError.code === 'rollback_failed'" class="mt-2 font-weight-medium">
                                {{ $t('Wifi.RecoveryFailed') }}
                            </div>
                        </v-alert>
                    </template>
                </v-card-text>
            </v-card>

            <v-card class="mx-auto" max-width="840" outlined>
                <v-card-title class="py-5">
                    <v-icon class="mr-3">{{ mdiAccessPointNetwork }}</v-icon>
                    {{ $t('Wifi.AvailableNetworks') }}
                </v-card-title>
                <v-divider />

                <v-list v-if="sortedNetworks.length" class="py-0" two-line>
                    <template v-for="(network, index) in sortedNetworks">
                        <v-divider v-if="index" :key="`${network.ssid}-divider`" />
                        <v-list-item
                            :key="`${network.ssid}-${network.security}`"
                            class="wifi-network-row px-4 px-sm-6"
                            :disabled="isBusy"
                            :class="{ 'wifi-network-current': network.connected }"
                            @click="selectNetwork(network)">
                            <v-list-item-icon class="my-auto mr-4">
                                <v-icon size="30" :color="network.connected ? 'success' : undefined">
                                    {{ signalIcon(network.strength) }}
                                </v-icon>
                            </v-list-item-icon>

                            <v-list-item-content>
                                <v-list-item-title class="text-subtitle-1 font-weight-medium text-break">
                                    {{ network.ssid }}
                                </v-list-item-title>
                                <v-list-item-subtitle class="wifi-network-details mt-1">
                                    <v-icon small class="mr-1">
                                        {{ network.security === 'open' ? mdiLockOpenOutline : mdiWifiLock }}
                                    </v-icon>
                                    {{ securityText(network) }}
                                    <v-chip v-if="network.saved" class="ml-2" x-small outlined>
                                        {{ $t('Wifi.Saved') }}
                                    </v-chip>
                                    <v-chip v-if="network.connected" class="ml-2" color="success" x-small dark>
                                        {{ $t('Wifi.Connected') }}
                                    </v-chip>
                                </v-list-item-subtitle>
                            </v-list-item-content>

                            <v-list-item-action v-if="network.saved" class="my-auto ml-2">
                                <v-btn
                                    class="wifi-forget-button"
                                    icon
                                    :aria-label="$t('Wifi.ForgetNetwork').toString()"
                                    :disabled="isBusy"
                                    @click.stop="openForgetDialog(network)">
                                    <v-icon color="error">{{ mdiDeleteOutline }}</v-icon>
                                </v-btn>
                            </v-list-item-action>
                            <v-list-item-action v-else class="my-auto ml-2">
                                <v-icon>{{ mdiChevronRight }}</v-icon>
                            </v-list-item-action>
                        </v-list-item>
                    </template>
                </v-list>

                <v-card-text v-else class="pa-8 text-center text--secondary">
                    <v-progress-circular v-if="localRequest === 'scan'" class="mb-4" indeterminate />
                    <v-icon v-else class="mb-4" size="44">{{ mdiWifiOff }}</v-icon>
                    <div>{{ emptyNetworksText }}</div>
                </v-card-text>
            </v-card>
        </template>

        <v-dialog v-model="passwordDialog" max-width="560" persistent>
            <v-card>
                <v-card-title class="text-break">{{ $t('Wifi.PasswordTitle', { ssid: selectedSsid }) }}</v-card-title>
                <v-card-text class="pt-4">
                    <v-text-field
                        v-model="password"
                        autofocus
                        outlined
                        :append-icon="showPassword ? mdiEyeOff : mdiEye"
                        autocomplete="off"
                        :hint="$t('Wifi.PasswordHint')"
                        :label="$t('Wifi.Password')"
                        persistent-hint
                        :type="showPassword ? 'text' : 'password'"
                        @click:append="showPassword = !showPassword"
                        @keydown.enter="submitPassword" />
                    <v-alert v-if="printerIsPrinting" class="mb-0" type="warning" prominent>
                        {{ $t('Wifi.PrintingWarning') }}
                    </v-alert>
                </v-card-text>
                <v-card-actions class="pa-4 wifi-dialog-actions">
                    <v-btn class="touch-button" text large @click="closePasswordDialog">
                        {{ $t('Wifi.Cancel') }}
                    </v-btn>
                    <v-btn
                        class="touch-button"
                        color="primary"
                        large
                        :disabled="!passwordIsValid"
                        @click="submitPassword">
                        {{ $t('Wifi.Connect') }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <v-dialog v-model="connectConfirmDialog" max-width="560" persistent>
            <v-card>
                <v-card-title>{{ $t('Wifi.ConfirmConnectTitle') }}</v-card-title>
                <v-card-text class="pt-4 text-body-1">
                    <p>{{ connectConfirmationText }}</p>
                    <v-alert v-if="printerIsPrinting" class="mb-0" type="warning" prominent>
                        {{ $t('Wifi.PrintingWarning') }}
                    </v-alert>
                </v-card-text>
                <v-card-actions class="pa-4 wifi-dialog-actions">
                    <v-btn class="touch-button" text large @click="closeConnectConfirmDialog">
                        {{ $t('Wifi.Cancel') }}
                    </v-btn>
                    <v-btn class="touch-button" color="primary" large @click="confirmConnection">
                        {{ $t('Wifi.Connect') }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <v-dialog v-model="forgetDialog" max-width="560" persistent>
            <v-card>
                <v-card-title class="text-break">{{ $t('Wifi.ForgetTitle', { ssid: selectedSsid }) }}</v-card-title>
                <v-card-text class="pt-4 text-body-1">
                    <p>{{ $t('Wifi.ForgetDescription') }}</p>
                    <v-alert v-if="selectedNetwork && selectedNetwork.connected" type="warning" prominent>
                        {{ $t('Wifi.ForgetCurrentWarning') }}
                    </v-alert>
                    <v-alert
                        v-if="printerIsPrinting && selectedNetwork && selectedNetwork.connected"
                        class="mb-0"
                        type="warning"
                        prominent>
                        {{ $t('Wifi.PrintingWarning') }}
                    </v-alert>
                </v-card-text>
                <v-card-actions class="pa-4 wifi-dialog-actions">
                    <v-btn class="touch-button" text large @click="closeForgetDialog">
                        {{ $t('Wifi.Cancel') }}
                    </v-btn>
                    <v-btn class="touch-button" color="error" large @click="confirmForget">
                        {{ $t('Wifi.Forget') }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </v-container>
</template>

<script lang="ts">
import { Component, Mixins, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { isValidWifiPassword } from '@/plugins/wifi'
import type { WifiError, WifiErrorCode, WifiNetwork, WifiStatus } from '@/types/moonraker/MachineRPC'
import {
    mdiAccessPointNetwork,
    mdiAlertOutline,
    mdiCheckCircle,
    mdiChevronRight,
    mdiDeleteOutline,
    mdiEye,
    mdiEyeOff,
    mdiLockOpenOutline,
    mdiRefresh,
    mdiWifi,
    mdiWifiLock,
    mdiWifiOff,
    mdiWifiStrength1,
    mdiWifiStrength2,
    mdiWifiStrength3,
    mdiWifiStrength4,
    mdiWifiStrengthOutline,
} from '@mdi/js'

type LocalRequest = 'status' | 'scan' | 'connect' | 'forget' | null

const POLL_INTERVAL_MS = 2000
const SCAN_COOLDOWN_MS = 10000

type DisplayWifiErrorCode = WifiErrorCode | 'backend_unavailable' | 'unknown'

interface DisplayWifiError {
    code: DisplayWifiErrorCode
    message: string
    recovered_ssid: null
}

const DISPLAY_ERROR_CODES: readonly DisplayWifiErrorCode[] = [
    'adapter_unavailable',
    'backend_unavailable',
    'busy',
    'internal_error',
    'invalid_password',
    'invalid_request',
    'network_not_found',
    'network_not_saved',
    'permission_denied',
    'rollback_failed',
    'timeout',
    'unknown',
    'unsupported_security',
]

@Component
export default class Wifi extends Mixins(BaseMixin) {
    mdiAccessPointNetwork = mdiAccessPointNetwork
    mdiChevronRight = mdiChevronRight
    mdiDeleteOutline = mdiDeleteOutline
    mdiEye = mdiEye
    mdiEyeOff = mdiEyeOff
    mdiLockOpenOutline = mdiLockOpenOutline
    mdiRefresh = mdiRefresh
    mdiWifi = mdiWifi
    mdiWifiLock = mdiWifiLock
    mdiWifiOff = mdiWifiOff

    localRequest: LocalRequest = null
    initialLoading = true
    passwordDialog = false
    connectConfirmDialog = false
    forgetDialog = false
    showPassword = false
    password = ''
    selectedNetwork: WifiNetwork | null = null
    requestError: DisplayWifiError | null = null
    handledOperationId: string | null = null
    scanAvailableAt = 0
    scanAfterOperation = false
    clock = Date.now()
    pollTimer: number | null = null

    get isLocalKiosk(): boolean {
        const hostname = window.location.hostname.toLowerCase()
        return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)
    }

    get wifiStatus(): WifiStatus | null {
        return this.$store.state.server.wifi?.status ?? null
    }

    get networks(): WifiNetwork[] {
        return this.$store.state.server.wifi?.networks ?? []
    }

    get sortedNetworks(): WifiNetwork[] {
        return [...this.networks].sort((a, b) => {
            if (a.connected !== b.connected) return a.connected ? -1 : 1
            return b.strength - a.strength
        })
    }

    get isOperationRunning(): boolean {
        return this.wifiStatus?.operation?.state === 'running'
    }

    get isBusy(): boolean {
        return this.localRequest !== null || this.isOperationRunning
    }

    get isConnecting(): boolean {
        return (
            this.wifiStatus?.state === 'connecting' ||
            (this.wifiStatus?.operation?.type === 'connect' && this.isOperationRunning)
        )
    }

    get canScan(): boolean {
        return Boolean(this.wifiStatus?.available) && !this.isBusy && this.clock >= this.scanAvailableAt
    }

    get statusText(): string {
        if (!this.wifiStatus?.available) return this.$t('Wifi.StatusUnavailable').toString()
        return this.$t(`Wifi.Status.${this.wifiStatus.state}`).toString()
    }

    get statusColor(): string {
        if (!this.wifiStatus?.available || this.wifiStatus?.state === 'error') return 'error'
        if (this.wifiStatus?.state === 'connected') return 'success'
        if (this.wifiStatus?.state === 'connecting') return 'warning'
        return 'grey'
    }

    get statusIcon(): string {
        if (!this.wifiStatus?.available || this.wifiStatus?.state === 'disconnected') return mdiWifiOff
        if (this.wifiStatus?.state === 'error') return mdiAlertOutline
        if (this.wifiStatus?.state === 'connected') return mdiCheckCircle
        return mdiWifi
    }

    get currentSsid(): string {
        return this.wifiStatus?.ssid || this.$t('Wifi.NotConnected').toString()
    }

    get currentStrength(): string {
        const strength = this.wifiStatus?.strength
        return typeof strength === 'number' ? `${strength}%` : '—'
    }

    get currentIp(): string {
        return this.wifiStatus?.ip_address || '—'
    }

    get connectivityText(): string {
        const connectivity = this.wifiStatus?.connectivity ?? 'unknown'
        return this.$t(`Wifi.Connectivity.${connectivity}`).toString()
    }

    get hasLimitedConnectivity(): boolean {
        return Boolean(
            this.wifiStatus?.connected && ['none', 'portal', 'limited'].includes(this.wifiStatus.connectivity)
        )
    }

    get operationText(): string {
        const operation = this.wifiStatus?.operation
        if (!operation || operation.state !== 'running') return ''

        if (operation.type === 'connect')
            return this.$t('Wifi.OperationConnecting', { ssid: operation.ssid }).toString()
        if (operation.type === 'forget') return this.$t('Wifi.OperationForgetting', { ssid: operation.ssid }).toString()
        return this.$t('Wifi.OperationScanning').toString()
    }

    get visibleError(): WifiError | DisplayWifiError | null {
        return this.requestError ?? this.wifiStatus?.last_error ?? null
    }

    get errorText(): string {
        if (!this.visibleError) return ''
        const key = `Wifi.Errors.${this.visibleError.code}`
        return this.$te(key) ? this.$t(key).toString() : this.$t('Wifi.Errors.unknown').toString()
    }

    get selectedSsid(): string {
        return this.selectedNetwork?.ssid ?? ''
    }

    get passwordIsValid(): boolean {
        return isValidWifiPassword(this.password)
    }

    get connectConfirmationText(): string {
        if (this.selectedNetwork?.security === 'open') {
            return this.$t('Wifi.OpenNetworkWarning', { ssid: this.selectedSsid }).toString()
        }

        return this.$t('Wifi.ConfirmSwitch', { ssid: this.selectedSsid }).toString()
    }

    get emptyNetworksText(): string {
        if (this.localRequest === 'scan') return this.$t('Wifi.Scanning').toString()
        return this.$t('Wifi.NoNetworks').toString()
    }

    @Watch('wifiStatus', { deep: true })
    wifiStatusChanged(status: WifiStatus | null) {
        const operation = status?.operation
        if (!operation || operation.state === 'running' || operation.id === this.handledOperationId) return

        this.handledOperationId = operation.id
        if (operation.state === 'succeeded') {
            this.requestError = null
            this.selectedNetwork = null

            if (operation.type === 'connect') this.$toast.success(this.$t('Wifi.ConnectSucceeded').toString())
            if (operation.type === 'forget') this.$toast.success(this.$t('Wifi.ForgetSucceeded').toString())
            if (operation.type !== 'scan') {
                this.scanAfterOperation = true
                this.runPendingScan()
            }
            return
        }

        if (operation.state === 'failed' && status?.last_error?.code === 'invalid_password' && operation.ssid) {
            this.selectedNetwork = this.networks.find((network) => network.ssid === operation.ssid) ?? {
                ssid: operation.ssid,
                security: 'wpa-psk',
                strength: 0,
                saved: true,
                connected: false,
                frequency: 0,
            }
            this.clearPassword()
            this.passwordDialog = true
        }
    }

    async mounted() {
        if (!this.isLocalKiosk) return

        await this.refreshStatus(true)
        if (
            !this.isOperationRunning &&
            this.wifiStatus?.available &&
            !this.wifiStatus.last_error
        ) {
            await this.scanNetworks()
        }

        this.pollTimer = window.setInterval(() => {
            this.clock = Date.now()
            void this.refreshStatus(false)
            this.runPendingScan()
        }, POLL_INTERVAL_MS)
    }

    beforeDestroy() {
        if (this.pollTimer !== null) window.clearInterval(this.pollTimer)
        this.clearPassword()
    }

    signalIcon(strength: number | null): string {
        if (strength === null || strength <= 0) return mdiWifiStrengthOutline
        if (strength < 35) return mdiWifiStrength1
        if (strength < 60) return mdiWifiStrength2
        if (strength < 80) return mdiWifiStrength3
        return mdiWifiStrength4
    }

    securityText(network: WifiNetwork): string {
        return this.$t(network.security === 'open' ? 'Wifi.SecurityOpen' : 'Wifi.SecurityProtected').toString()
    }

    async refreshStatus(initial: boolean) {
        if (!this.isLocalKiosk || !this.$store.state.socket?.isConnected) {
            if (initial) this.initialLoading = false
            return
        }

        if (initial) this.localRequest = 'status'
        try {
            const status = await this.$socket.emitAndWait('machine.wifi.status')
            if (initial && status.operation?.state === 'succeeded') {
                this.handledOperationId = status.operation.id
            }
            await this.$store.dispatch('server/wifi/updateStatus', status)
            if (initial && status.operation?.state === 'failed') {
                this.wifiStatusChanged(status)
            }
            if (this.requestError?.code === 'backend_unavailable') this.requestError = null
        } catch (error: unknown) {
            if (initial) this.requestError = this.normalizeRpcError(error, 'backend_unavailable')
        } finally {
            if (initial) this.localRequest = null
            this.initialLoading = false
        }
    }

    async scanNetworks() {
        if (!this.isLocalKiosk || !this.wifiStatus?.available || this.isBusy || this.clock < this.scanAvailableAt)
            return

        this.localRequest = 'scan'
        this.requestError = null
        this.scanAvailableAt = Date.now() + SCAN_COOLDOWN_MS
        try {
            const result = await this.$socket.emitAndWait('machine.wifi.scan')
            await this.$store.dispatch('server/wifi/updateScan', result)
        } catch (error: unknown) {
            this.requestError = this.normalizeRpcError(error)
        } finally {
            this.localRequest = null
            this.runPendingScan()
        }
    }

    selectNetwork(network: WifiNetwork) {
        if (this.isBusy || network.connected) return
        this.requestError = null
        this.selectedNetwork = network

        if (network.security === 'open') {
            this.connectConfirmDialog = true
            return
        }

        if (network.saved) {
            if (this.printerIsPrinting) this.connectConfirmDialog = true
            else void this.connectToSelectedNetwork()
            return
        }

        this.clearPassword()
        this.passwordDialog = true
    }

    submitPassword() {
        if (!this.passwordIsValid || !this.selectedNetwork) return
        const password = this.password
        this.passwordDialog = false
        this.clearPassword()
        void this.connectToSelectedNetwork(password)
    }

    confirmConnection() {
        this.connectConfirmDialog = false
        void this.connectToSelectedNetwork()
    }

    async connectToSelectedNetwork(password?: string) {
        const network = this.selectedNetwork
        if (!this.isLocalKiosk || !network || this.isBusy) return

        this.localRequest = 'connect'
        this.requestError = null
        try {
            const params: { ssid: string; security: 'open' | 'wpa-psk'; password?: string } = {
                ssid: network.ssid,
                security: network.security,
            }
            if (password !== undefined) params.password = password

            await this.$socket.emitAndWait('machine.wifi.connect', params)
            this.handledOperationId = null
            await this.refreshStatus(false)
        } catch (error: unknown) {
            this.requestError = this.normalizeRpcError(error)
        } finally {
            this.localRequest = null
            this.runPendingScan()
        }
    }

    openForgetDialog(network: WifiNetwork) {
        if (this.isBusy) return
        this.selectedNetwork = network
        this.forgetDialog = true
    }

    async confirmForget() {
        const network = this.selectedNetwork
        this.forgetDialog = false
        if (!this.isLocalKiosk || !network || this.isBusy) return

        this.localRequest = 'forget'
        this.requestError = null
        try {
            await this.$socket.emitAndWait('machine.wifi.forget', { ssid: network.ssid })
            this.handledOperationId = null
            await this.refreshStatus(false)
        } catch (error: unknown) {
            this.requestError = this.normalizeRpcError(error)
        } finally {
            this.localRequest = null
            this.runPendingScan()
        }
    }

    closePasswordDialog() {
        this.passwordDialog = false
        this.clearPassword()
        this.selectedNetwork = null
    }

    closeConnectConfirmDialog() {
        this.connectConfirmDialog = false
        this.selectedNetwork = null
    }

    closeForgetDialog() {
        this.forgetDialog = false
        this.selectedNetwork = null
    }

    clearPassword() {
        this.password = ''
        this.showPassword = false
    }

    runPendingScan() {
        if (!this.scanAfterOperation || this.isBusy || this.clock < this.scanAvailableAt) return

        this.scanAfterOperation = false
        void this.scanNetworks()
    }

    normalizeRpcError(error: unknown, fallbackCode: DisplayWifiErrorCode = 'unknown'): DisplayWifiError {
        let code = fallbackCode
        let message = ''
        let explicitCode = ''

        if (typeof error === 'string') message = error
        else if (error && typeof error === 'object') {
            const record = error as Record<string, unknown>
            if (typeof record.message === 'string') message = record.message
            if (typeof record.code === 'string') explicitCode = record.code

            if (record.data && typeof record.data === 'object') {
                const data = record.data as Record<string, unknown>
                if (typeof data.code === 'string') explicitCode = data.code
            }
        }

        const matchedCode = DISPLAY_ERROR_CODES.find(
            (candidate) => explicitCode === candidate || message.includes(candidate)
        )
        if (matchedCode) code = matchedCode

        return { code, message, recovered_ssid: null }
    }
}
</script>

<style scoped>
.wifi-page {
    min-height: 100%;
}

.wifi-card-title {
    gap: 8px;
}

.wifi-status-row {
    min-height: 42px;
}

.wifi-current-grid {
    display: grid;
    gap: 20px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.wifi-current-field {
    min-width: 0;
}

.wifi-network-row {
    min-height: 72px;
}

.wifi-network-current {
    border-left: 4px solid var(--v-success-base);
}

.wifi-network-details {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
}

.touch-button {
    min-height: 52px;
}

.wifi-forget-button {
    height: 52px;
    width: 52px;
}

.wifi-dialog-actions {
    gap: 12px;
    justify-content: flex-end;
}

@media (max-width: 599px) {
    .wifi-card-title {
        align-items: stretch;
        flex-direction: column;
    }

    .wifi-card-title .v-btn {
        width: 100%;
    }

    .wifi-current-grid {
        grid-template-columns: 1fr;
    }

    .wifi-dialog-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
    }
}
</style>
