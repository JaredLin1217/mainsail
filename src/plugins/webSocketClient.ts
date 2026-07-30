import { Store } from 'vuex'
import _Vue from 'vue'
import { RootState } from '@/store/types'
import { initableServerComponents } from '@/store/variables'
import type { RPCMethods, RPCParams, RPCResult } from '@/types/moonraker'

export class WebSocketClient {
    url = ''
    instance: WebSocket | null = null
    maxReconnects = 0
    reconnectInterval = 1000
    maxReconnectInterval = 15000
    reconnects = 0
    keepAliveTimeout = 1000
    messageId: number = 0
    store: Store<RootState> | null = null
    waits: Wait[] = []
    heartbeatTimer: ReturnType<typeof setTimeout> | null = null
    reconnectTimer: ReturnType<typeof setTimeout> | null = null
    connectionGeneration = 0
    closeRequested = false

    constructor(options: WebSocketPluginOptions) {
        this.url = options.url
        this.maxReconnects = options.maxReconnects ?? 0
        this.reconnectInterval = options.reconnectInterval ?? 1000
        this.maxReconnectInterval = options.maxReconnectInterval ?? 15000
        this.store = options.store
    }

    setUrl(url: string): void {
        this.url = url
    }

    handleMessage(data: SocketIncomingMessage): void {
        const wait = typeof data.id === 'number' ? this.getWaitById(data.id) : null

        // reject promise if it exists
        if (data.error && wait?.reject) {
            wait.reject(data.error)
            this.removeWaitById(wait.id)
            return
        }

        // report error messages
        if (data.error?.message) {
            // only report errors, if not disconnected and no init component
            if (data.error?.message !== 'Klippy Disconnected') {
                window.console.error(`Response Error: ${data.error.message} (${wait?.action ?? 'no action'})`)
            }

            if (wait) {
                const modulename = wait.action?.split('/')[1] ?? null

                if (
                    modulename &&
                    wait.action?.startsWith('server/') &&
                    initableServerComponents.includes(modulename) &&
                    this.store?.state.socket?.initializationList.length
                ) {
                    const component = wait.action.replace('server/', '').split('/')[0]
                    window.console.error(`init server component ${component} failed`)
                    this.store?.dispatch('server/addFailedInitComponent', component)
                    this.store?.dispatch('socket/removeInitComponent', `server/${component}/`)
                }

                this.removeWaitById(wait.id)
            }

            return
        }

        // pass it to socket/onMessage, if no wait exists
        if (!wait) {
            this.store?.dispatch('socket/onMessage', data)
            return
        }

        // resolve promise if it exists
        if (wait.resolve) wait.resolve(data.result ?? {})

        // pass result to action
        if (wait.action) {
            let result = data.result
            if (result === 'ok') result = { result }
            if (typeof result === 'string') result = { result }

            const preload: Record<string, unknown> = {}
            if (wait.actionPayload) Object.assign(preload, wait.actionPayload)
            Object.assign(preload, { requestParams: wait.params })
            Object.assign(preload, result as Record<string, unknown>)
            this.store?.dispatch(wait.action, preload)
        }

        this.removeWaitById(wait.id)
    }

    async connect(): Promise<void> {
        this.closeRequested = false
        this.reconnects = 0
        this.clearReconnectTimer()
        this.store?.dispatch('socket/setData', {
            isConnecting: true,
        })
        this.openSocket()
    }

    openSocket(): void {
        this.disposeSocket()
        const generation = ++this.connectionGeneration
        const socket = new WebSocket(this.url)
        this.instance = socket

        socket.onopen = (event) => {
            if (!this.isCurrentSocket(socket, generation)) return
            this.reconnects = 0
            this.store?.dispatch('socket/onOpen', event)
        }

        socket.onclose = (event) => {
            if (!this.isCurrentSocket(socket, generation)) return

            this.clearHeartbeatTimer()
            this.disposeSocket()
            this.clearWaits(new Error('WebSocket connection closed'))
            this.store?.dispatch('socket/onClose', event)

            if (this.closeRequested) return
            this.scheduleReconnect()
        }

        socket.onerror = () => {
            if (!this.isCurrentSocket(socket, generation)) return
            socket.close()
        }

        socket.onmessage = (msg) => {
            if (!this.isCurrentSocket(socket, generation)) return
            if (this.store === null) return

            // websocket is alive
            this.heartbeat()

            const data = JSON.parse(msg.data)
            if (Array.isArray(data)) {
                for (const message of data) {
                    this.handleMessage(message)
                }

                return
            }

            this.handleMessage(data)
        }
    }

    close(): void {
        this.closeRequested = true
        this.clearReconnectTimer()
        this.clearHeartbeatTimer()
        this.clearWaits(new Error('WebSocket connection closed'))
        this.disposeSocket()
        this.store?.dispatch('socket/onClose')
    }

    scheduleReconnect(): void {
        if (this.closeRequested || this.reconnectTimer !== null) return
        if (this.maxReconnects > 0 && this.reconnects >= this.maxReconnects) return

        this.reconnects++
        const exponent = Math.min(this.reconnects - 1, 30)
        const delay = Math.min(this.reconnectInterval * 2 ** exponent, this.maxReconnectInterval)
        this.store?.dispatch('socket/setData', { isConnecting: true })
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            if (this.closeRequested) return
            this.openSocket()
        }, delay)
    }

    disposeSocket(): void {
        const socket = this.instance
        this.instance = null
        this.connectionGeneration++
        if (socket === null) return

        socket.onopen = null
        socket.onclose = null
        socket.onerror = null
        socket.onmessage = null
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close()
    }

    isCurrentSocket(socket: WebSocket, generation: number): boolean {
        return this.instance === socket && this.connectionGeneration === generation
    }

    clearReconnectTimer(): void {
        if (this.reconnectTimer === null) return
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
    }

    clearHeartbeatTimer(): void {
        if (this.heartbeatTimer === null) return
        clearTimeout(this.heartbeatTimer)
        this.heartbeatTimer = null
    }

    getWaitById(id: number): Wait | null {
        return this.waits.find((wait: Wait) => wait.id === id) ?? null
    }

    removeWaitById(id: number | null): void {
        const index = this.waits.findIndex((wait: Wait) => wait.id === id)
        if (index >= 0) {
            const wait = this.waits[index]
            if (wait.loading) this.store?.dispatch('socket/removeLoading', { name: wait.loading })
            wait.params = {}
            wait.actionPayload = {}
            wait.resolve = undefined
            wait.reject = undefined
            this.waits.splice(index, 1)
        }
    }

    clearWaits(reason: Error): void {
        const pending = this.waits.splice(0)
        for (const wait of pending) {
            if (wait.loading) this.store?.dispatch('socket/removeLoading', { name: wait.loading })
            wait.params = {}
            wait.actionPayload = {}
            wait.reject?.(reason)
            wait.resolve = undefined
            wait.reject = undefined
        }
    }

    emit(method: string, params: Params, options: emitOptions = {}): void {
        if (this.instance?.readyState !== WebSocket.OPEN) return

        const id = this.messageId++
        this.waits.push({
            id: id,
            params: params,
            action: options.action ?? null,
            actionPayload: options.actionPayload ?? {},
            loading: options.loading ?? null,
        })

        if (options.loading) this.store?.dispatch('socket/addLoading', { name: options.loading })

        this.instance?.send(
            JSON.stringify({
                jsonrpc: '2.0',
                method,
                params,
                id,
            })
        )
    }

    emitAndWait<M extends RPCMethods>(
        method: M,
        params?: RPCParams<M>,
        options: emitOptions = {}
    ): Promise<RPCResult<M>> {
        return new Promise<RPCResult<M>>((resolve, reject) => {
            if (this.instance?.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket is not connected'))
                return
            }

            const id = this.messageId++
            this.waits.push({
                id: id,
                params: params,
                action: options.action ?? null,
                actionPayload: options.actionPayload ?? {},
                loading: options.loading ?? null,
                resolve: resolve as (value: unknown) => void,
                reject,
            })

            if (options.loading) this.store?.dispatch('socket/addLoading', { name: options.loading })

            this.instance?.send(
                JSON.stringify({
                    jsonrpc: '2.0',
                    method,
                    params,
                    id,
                })
            )
        })
    }

    emitBatch(messages: BatchMessage[]): void {
        if (messages.length === 0) return
        if (this.instance?.readyState !== WebSocket.OPEN) return

        const body = []
        for (const { method, params, emitOptions = {} } of messages) {
            const id = this.messageId++
            this.waits.push({
                id: id,
                params: params,
                action: emitOptions.action ?? null,
                actionPayload: emitOptions.actionPayload ?? {},
                loading: emitOptions.loading ?? null,
            })

            if (emitOptions.loading) this.store?.dispatch('socket/addLoading', { name: emitOptions.loading })
            body.push({
                jsonrpc: '2.0',
                method,
                params,
                id,
            })
        }

        this.instance.send(JSON.stringify(body))
    }

    heartbeat(): void {
        this.clearHeartbeatTimer()

        this.heartbeatTimer = setTimeout(() => {
            if (this.instance?.readyState !== WebSocket.OPEN || !this.store) return

            this.instance.close()
        }, 10000)
    }
}

export function WebSocketPlugin(Vue: typeof _Vue, options: WebSocketPluginOptions): void {
    const socket = new WebSocketClient(options)
    Vue.prototype.$socket = socket
    Vue.$socket = socket
}

export interface WebSocketPluginOptions {
    url: string
    maxReconnects?: number
    reconnectInterval?: number
    maxReconnectInterval?: number
    store: Store<RootState>
}

export interface BatchMessage {
    method: string
    params: Params
    emitOptions: emitOptions
}

interface SocketError {
    code?: number
    message?: string
    [key: string]: unknown
}

interface SocketIncomingMessage {
    id?: number
    result?: unknown
    error?: SocketError
    method?: string
    params?: unknown[]
    [key: string]: unknown
}

export interface Wait {
    id: number
    params: unknown
    action?: string | null
    actionPayload?: Params
    loading?: string | null
    resolve?: (value: unknown) => void
    reject?: (reason?: unknown) => void
}

type Params = object

interface emitOptions {
    action?: string | null
    actionPayload?: Params
    loading?: string | null
}
