import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WebSocketClient, type Wait } from '@/plugins/webSocketClient'

class MockWebSocket {
    static instances: MockWebSocket[] = []
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSING = 2
    static readonly CLOSED = 3

    readyState = MockWebSocket.CONNECTING
    onopen: ((event: Event) => void) | null = null
    onclose: ((event: CloseEvent) => void) | null = null
    onerror: ((event: Event) => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null
    close = vi.fn(() => {
        this.readyState = MockWebSocket.CLOSED
    })
    send = vi.fn()

    constructor(public readonly url: string) {
        MockWebSocket.instances.push(this)
    }

    open(): void {
        this.readyState = MockWebSocket.OPEN
        this.onopen?.(new Event('open'))
    }

    serverClose(wasClean = true): void {
        this.readyState = MockWebSocket.CLOSED
        this.onclose?.({ wasClean } as CloseEvent)
    }
}

function createClient() {
    const dispatch = vi.fn()
    const client = new WebSocketClient({
        url: 'ws://localhost/websocket',
        store: { dispatch } as never,
    })

    return { client, dispatch }
}

beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

describe('WebSocketClient pending requests', () => {
    it('removes the first pending request and clears its parameters', () => {
        const { client } = createClient()
        const wait: Wait = {
            id: 0,
            params: { password: 'must-not-remain' },
            actionPayload: { password: 'must-not-remain' },
        }
        client.waits.push(wait)

        client.removeWaitById(0)

        expect(client.waits).toHaveLength(0)
        expect(wait.params).toEqual({})
        expect(wait.actionPayload).toEqual({})
    })

    it('rejects and clears every pending request when the socket closes', () => {
        const { client, dispatch } = createClient()
        const reject = vi.fn()
        const wait: Wait = {
            id: 7,
            params: { password: 'must-not-remain' },
            loading: 'wifi-operation',
            reject,
        }
        client.waits.push(wait)
        const reason = new Error('closed')

        client.clearWaits(reason)

        expect(client.waits).toHaveLength(0)
        expect(wait.params).toEqual({})
        expect(reject).toHaveBeenCalledWith(reason)
        expect(dispatch).toHaveBeenCalledWith('socket/removeLoading', { name: 'wifi-operation' })
    })
})

describe('WebSocketClient reconnects', () => {
    it('reconnects after a clean server close', async () => {
        const { client, dispatch } = createClient()
        await client.connect()
        const firstSocket = MockWebSocket.instances[0]
        firstSocket.open()

        firstSocket.serverClose(true)
        expect(dispatch).toHaveBeenCalledWith('socket/onClose', expect.anything())
        expect(firstSocket.onopen).toBeNull()
        expect(firstSocket.onclose).toBeNull()
        expect(firstSocket.onerror).toBeNull()
        expect(firstSocket.onmessage).toBeNull()
        expect(MockWebSocket.instances).toHaveLength(1)

        await vi.advanceTimersByTimeAsync(1000)
        expect(MockWebSocket.instances).toHaveLength(2)
    })

    it('uses a bounded exponential delay between failed connections', async () => {
        const { client } = createClient()
        await client.connect()
        MockWebSocket.instances[0].serverClose(false)

        await vi.advanceTimersByTimeAsync(1000)
        MockWebSocket.instances[1].serverClose(false)
        await vi.advanceTimersByTimeAsync(1999)
        expect(MockWebSocket.instances).toHaveLength(2)

        await vi.advanceTimersByTimeAsync(1)
        expect(MockWebSocket.instances).toHaveLength(3)
    })

    it('cancels pending reconnects when explicitly closed', async () => {
        const { client } = createClient()
        await client.connect()
        MockWebSocket.instances[0].serverClose(false)

        client.close()
        await vi.advanceTimersByTimeAsync(30000)

        expect(MockWebSocket.instances).toHaveLength(1)
    })
})
