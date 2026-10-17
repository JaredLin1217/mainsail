import { afterEach, describe, expect, it, vi } from 'vitest'
import LayerHistory from '@/components/panels/History/LayerHistory.vue'
import Vue from 'vue'
import { actions } from '@/store/server/history/actions'

vi.mock('@/components/mixins/base', async () => {
    const { default: Vue } = await import('vue')
    return { default: Vue.extend({}) }
})
vi.mock('@/plugins/helpers', () => ({ formatPrintTime: String }))
vi.mock('echarts/core', () => ({ connect: vi.fn(), disconnect: vi.fn(), use: vi.fn() }))

type Method = (...args: never[]) => unknown
type Context = LayerHistory & { $socket: { emitAndWait: ReturnType<typeof vi.fn> } }
type StoreContext = { commit: ReturnType<typeof vi.fn>; dispatch: ReturnType<typeof vi.fn>; state: { jobs: object[] } }
type HistoryActions = {
    init: () => void
    getChanged: (context: StoreContext, payload: unknown) => void
    getHistory: (context: StoreContext, payload: unknown) => Promise<void>
}

const options = (LayerHistory as unknown as { options: { methods: Record<string, Method> } }).options
const methods = options.methods
const row = (layer = 1, mean = 935, seconds = 1) => ({
    layer,
    layer_end: layer,
    z: 0.3,
    height: 0.3,
    active_seconds: seconds,
    pause_seconds: 0,
    gap_seconds: 0,
    complete: true,
    flags: [],
    metrics: { t1: { mean, min: mean, max: mean, seconds, samples: 1 } },
    filament: { t0: { mm: 1, mm3: 2, mean_flow: 2 / seconds }, t1: { mm: 0, mm3: 0, mean_flow: 0 } },
})
const context = () => {
    const vm = {
        job: { job_id: '000001', start_time: 100, status: 'in_progress' },
        epoch: 0,
        serial: 0,
        destroyed: false,
        exporting: false,
        loading: false,
        poller: null,
        mode: 'series',
        page: 1,
        total: 2,
        seriesRows: [],
        tableRows: [],
        $t: (key: string) => key,
        $te: () => false,
        $socket: { emitAndWait: vi.fn() },
    } as unknown as Context
    const bound = vm as unknown as Record<string, unknown>
    for (const [name, method] of Object.entries(methods)) bound[name] = method.bind(vm)
    return vm
}

afterEach(() => vi.useRealTimers())

describe('layer history presentation', () => {
    it('rejects history list responses sent before a clear and refreshes untagged legacy requests', async () => {
        const emit = vi.fn()
        ;(Vue as unknown as { $socket: { emit: typeof emit } }).$socket = { emit }
        const callbacks = actions as unknown as HistoryActions
        const context = { commit: vi.fn(), dispatch: vi.fn(), state: { jobs: [] } }
        callbacks.init()
        const oldParams = emit.mock.calls[0][1]
        callbacks.getChanged(context, { action: 'deleted', deleted_jobs: ['000001'], all: true })
        context.commit.mockClear()
        await callbacks.getHistory(context, { requestParams: oldParams, jobs: [{ job_id: '000001' }] })
        expect(context.commit).not.toHaveBeenCalled()
        await callbacks.getHistory(context, { requestParams: { start: 0, limit: 100 }, jobs: [{ job_id: '000001' }] })
        expect(context.commit).not.toHaveBeenCalled()
        expect(emit.mock.calls[emit.mock.calls.length - 1][1].history_epoch).not.toBe(oldParams.history_epoch)
    })

    it('preserves abnormal temperature and leaves missing values blank in CSV', () => {
        const vm = context()
        const record = row()
        const cells = vm.csvRow(record).split(',')
        const headers = vm.csvHeader().split(',')
        expect(cells[headers.indexOf('t1_mean')]).toBe('"935"')
        expect(cells[headers.indexOf('t0_mean')]).toBe('')
        expect(vm.metricRange(record, 't1')).toBe('935 (935–935)')
    })

    it('aggregates chart buckets by time while retaining extrema and material totals', () => {
        const vm = context()
        vm.seriesRows = [row(1, 200, 1), row(2, 300, 3)]
        vm.compactSeries()
        expect(vm.seriesRows[0].metrics.t1).toMatchObject({ mean: 275, min: 200, max: 300, seconds: 4 })
        expect(vm.seriesRows[0].filament.t0).toMatchObject({ mm: 2, mm3: 4, mean_flow: 1 })
        expect(vm.seriesRows[0].layer_end).toBe(2)
    })

    it('ignores an in-flight response after closing or history deletion', async () => {
        const vm = context()
        type Response = { available: boolean; total: number; rows: ReturnType<typeof row>[] }
        let resolve!: (value: Response) => void
        vm.$socket.emitAndWait.mockReturnValue(
            new Promise<Response>((done) => {
                resolve = done
            })
        )
        const pending = vm.refresh(false)
        vm.invalidate()
        resolve({ available: true, total: 2, rows: [row()] })
        await pending
        expect(vm.seriesRows).toEqual([])
        expect(vm.destroyed).toBe(true)
    })

    it('stops polling a completed task and sends its full identity', async () => {
        vi.useFakeTimers()
        const vm = context()
        vm.poller = setInterval(() => {}, 5000)
        vm.$socket.emitAndWait.mockResolvedValue({ available: true, total: 1, status: 'completed', rows: [row()] })
        await vm.refresh(false)
        expect(vm.poller).toBe(null)
        expect(vm.$socket.emitAndWait).toHaveBeenCalledWith(
            'server.layer_history.job',
            expect.objectContaining({ uid: '000001', start_time: 100 })
        )
    })

    it('replaces the last incomplete chart range during incremental reads', async () => {
        const vm = context()
        vm.seriesRows = [row(1), row(2, 900)]
        vm.$socket.emitAndWait.mockResolvedValue({
            available: true,
            total: 2,
            status: 'recording',
            rows: [row(2, 950)],
        })
        await vm.refresh(true)
        expect(vm.seriesRows.map((item) => item.layer)).toEqual([1, 2])
        expect(vm.seriesRows[1].metrics.t1.mean).toBe(950)
    })
})
