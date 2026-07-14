import { describe, expect, it, vi } from 'vitest'

import { WebSocketClient, type Wait } from '@/plugins/webSocketClient'

function createClient() {
    const dispatch = vi.fn()
    const client = new WebSocketClient({
        url: 'ws://localhost/websocket',
        store: { dispatch } as never,
    })

    return { client, dispatch }
}

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
