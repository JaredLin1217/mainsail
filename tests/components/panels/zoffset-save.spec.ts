import { describe, expect, it, vi } from 'vitest'
import ZoffsetControl from '@/components/panels/ToolheadControls/ZoffsetControl.vue'

vi.mock('@/components/mixins/base', async () => {
    const { default: Vue } = await import('vue')
    return { default: Vue.extend({}) }
})
vi.mock('@/components/mixins/zoffset', async () => {
    const { default: Vue } = await import('vue')
    return { default: Vue.extend({}) }
})
vi.mock('@/components/ui/Panel.vue', () => ({ default: {} }))
vi.mock('@/components/ui/Responsive.vue', () => ({ default: {} }))

type Context = {
    commands: Record<string, object>
    offsetZSaveOption: string | null
    autoSaveZOffsetOption: string
    supportsLiveZOffsetSave: boolean
    printerIsPrinting: boolean
    saveOffsetDialog: boolean
    loadings: string[]
    $store: { dispatch: ReturnType<typeof vi.fn> }
    $socket: { emit: ReturnType<typeof vi.fn>; emitAndWait: ReturnType<typeof vi.fn> }
}

const options = (
    ZoffsetControl as unknown as {
        options: {
            computed: Record<string, { get: (this: Context) => unknown }>
            methods: {
                saveZOffset: (this: Context) => void
                saveConfig: (this: Context) => Promise<void>
            }
        }
    }
).options

const context = (): Context => ({
    commands: { Z_OFFSET_SAVE_ENDSTOP: {}, _Z_OFFSET_SAVE_ENDSTOP: {} },
    offsetZSaveOption: null,
    autoSaveZOffsetOption: 'Z_OFFSET_APPLY_ENDSTOP',
    supportsLiveZOffsetSave: true,
    printerIsPrinting: false,
    saveOffsetDialog: true,
    loadings: [],
    $store: { dispatch: vi.fn() },
    $socket: { emit: vi.fn(), emitAndWait: vi.fn().mockResolvedValue('ok') },
})

describe('Z offset saving', () => {
    it('requires the dedicated macro and the ENDSTOP destination', () => {
        const vm = context()
        expect(options.computed.supportsLiveZOffsetSave.get.call(vm)).toBe(true)
        delete vm.commands._Z_OFFSET_SAVE_ENDSTOP
        expect(options.computed.supportsLiveZOffsetSave.get.call(vm)).toBe(false)
        vm.commands._Z_OFFSET_SAVE_ENDSTOP = {}
        vm.offsetZSaveOption = 'Z_OFFSET_APPLY_PROBE'
        expect(options.computed.supportsLiveZOffsetSave.get.call(vm)).toBe(false)
        vm.offsetZSaveOption = null
        vm.commands = {}
        expect(options.computed.supportsLiveZOffsetSave.get.call(vm)).toBe(false)
    })

    it('opens confirmation without calculating an offset before confirmation', () => {
        const vm = context()
        vm.saveOffsetDialog = false
        options.methods.saveZOffset.call(vm)
        expect(vm.saveOffsetDialog).toBe(true)
        expect(vm.$socket.emit).not.toHaveBeenCalled()
    })

    it('uses a deferred explanation while printing or paused', () => {
        const vm = context()
        expect(options.computed.saveInfoDescription.get.call(vm)).toBe(
            'Panels.ZoffsetPanel.SaveInfoDescriptionNoRestart'
        )
        vm.printerIsPrinting = true
        expect(options.computed.saveInfoDescription.get.call(vm)).toBe(
            'Panels.ZoffsetPanel.SaveInfoDescriptionNoRestartPrint'
        )
    })

    it('waits for the backend result before closing confirmation', async () => {
        const vm = context()
        let complete: (value: string) => void = () => undefined
        vm.$socket.emitAndWait.mockImplementation(() => new Promise<string>((resolve) => (complete = resolve)))
        const saving = options.methods.saveConfig.call(vm)
        expect(vm.saveOffsetDialog).toBe(true)
        expect(vm.$socket.emitAndWait).toHaveBeenCalledWith(
            'printer.gcode.script',
            { script: 'Z_OFFSET_SAVE_ENDSTOP' },
            { loading: 'zOffsetSaveConfig' }
        )
        complete('ok')
        await saving
        expect(vm.saveOffsetDialog).toBe(false)
    })

    it('allows the same persistence command while printing', async () => {
        const vm = context()
        vm.printerIsPrinting = true
        await options.methods.saveConfig.call(vm)
        expect(vm.$socket.emitAndWait.mock.calls[0][1]).toEqual({ script: 'Z_OFFSET_SAVE_ENDSTOP' })
    })

    it('keeps confirmation open when persistence or homing fails', async () => {
        const vm = context()
        vm.$socket.emitAndWait.mockRejectedValue(new Error('Disk failure'))
        await options.methods.saveConfig.call(vm)
        expect(vm.saveOffsetDialog).toBe(true)
    })

    it('rejects duplicate clicks while a save is pending', async () => {
        const vm = context()
        vm.loadings = ['zOffsetSaveConfig']
        await options.methods.saveConfig.call(vm)
        expect(vm.$socket.emitAndWait).not.toHaveBeenCalled()
    })

    it('preserves the legacy SAVE_CONFIG path without the dedicated macro', async () => {
        const vm = context()
        vm.supportsLiveZOffsetSave = false
        await options.methods.saveConfig.call(vm)
        expect(vm.$socket.emit).toHaveBeenCalledWith(
            'printer.gcode.script',
            { script: 'SAVE_CONFIG' },
            { loading: 'topbarSaveConfig' }
        )
        expect(vm.saveOffsetDialog).toBe(false)
        expect(vm.$socket.emitAndWait).not.toHaveBeenCalled()
    })
})
