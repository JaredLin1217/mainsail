<template>
    <div class="pa-4">
        <v-alert dense text type="info">{{ $t('LayerHistory.Approximate') }}</v-alert>
        <v-progress-linear v-if="loading" indeterminate class="mb-3" />
        <v-alert v-if="error" dense text type="warning">{{ error }}</v-alert>
        <v-alert v-if="!loading && !available && !error" dense text type="info">{{ $t('LayerHistory.Empty') }}</v-alert>
        <template v-if="available">
            <v-row dense class="mb-2">
                <v-col cols="12" sm="6">
                    <strong>{{ $t('LayerHistory.Coverage') }}:</strong>
                    {{ metadata.closed_layers ?? 0 }} / {{ total }} / {{ metadata.expected_layers ?? '—' }}
                </v-col>
                <v-col cols="12" sm="6">
                    <strong>{{ $t('LayerHistory.Status') }}:</strong>
                    {{ statusLabel }}
                </v-col>
                <v-col cols="12" sm="6">
                    {{ $t('LayerHistory.Active') }}: {{ formatPrintTime(summary.active_seconds ?? 0) }} ·
                    {{ $t('LayerHistory.Pause') }}: {{ formatPrintTime(summary.pause_seconds ?? 0) }}
                </v-col>
                <v-col cols="12" sm="6">
                    T0: {{ metricRange(summary, 't0') }} °C · T1: {{ metricRange(summary, 't1') }} °C
                </v-col>
                <v-col cols="12" sm="6">
                    {{ $t('LayerHistory.Filament') }}: T0 {{ value(summary.filament?.t0?.mm) }} mm · T1
                    {{ value(summary.filament?.t1?.mm) }} mm
                </v-col>
                <v-col cols="12" sm="6">{{ $t('LayerHistory.Gap') }}: {{ value(summary.gap_seconds) }} s</v-col>
            </v-row>
            <div v-if="qualityFlags.length" class="text-caption mb-3">
                {{ $t('LayerHistory.Quality') }}: {{ qualityFlags.map(flagLabel).join(' · ') }}
            </div>
            <v-row dense align="center">
                <v-col cols="12" sm="5">
                    <v-btn-toggle v-model="mode" mandatory dense>
                        <v-btn value="series">{{ $t('LayerHistory.Charts') }}</v-btn>
                        <v-btn value="table">{{ $t('LayerHistory.Table') }}</v-btn>
                    </v-btn-toggle>
                </v-col>
                <v-col cols="6" sm="4">
                    <v-select v-if="mode === 'series'" v-model="category" :items="categories" dense hide-details />
                    <v-text-field
                        v-else
                        v-model.number="jump"
                        type="number"
                        :min="1"
                        :max="total"
                        :label="$t('LayerHistory.Jump')"
                        dense
                        hide-details
                        @keydown.enter="jumpLayer" />
                </v-col>
                <v-col cols="6" sm="3" class="text-right">
                    <v-btn small text :disabled="loading" @click="refresh(false)">
                        <v-icon small>{{ mdiRefresh }}</v-icon>
                        {{ $t('LayerHistory.Refresh') }}
                    </v-btn>
                </v-col>
            </v-row>
            <v-row v-if="mode === 'series'" dense>
                <v-col v-for="chart in charts" :key="chart.key" cols="12" :md="charts.length > 1 ? 6 : 12">
                    <div class="text-subtitle-2 mt-2">{{ chart.title }}</div>
                    <e-chart
                        :option="chart.option"
                        :group="chartGroup"
                        :init-options="{ renderer: 'svg' }"
                        autoresize
                        style="height: 280px" />
                </v-col>
            </v-row>
            <v-data-table
                v-else
                :headers="headers"
                :items="tableRows"
                :items-per-page="100"
                :page.sync="page"
                :server-items-length="total"
                :footer-props="{ 'items-per-page-options': [100] }"
                :loading="loading"
                item-key="layer"
                dense
                @update:page="refresh(false)">
                <template #item.t0="{ item }">{{ metricRange(item, 't0') }}</template>
                <template #item.t1="{ item }">{{ metricRange(item, 't1') }}</template>
                <template #item.bed="{ item }">{{ metricRange(item, 'bed') }}</template>
                <template #item.chamber="{ item }">{{ metricRange(item, 'chamber') }}</template>
                <template
                    v-for="key in ['t0_target', 't1_target', 'bed_target', 'chamber_target']"
                    #[`item.${key}`]="{ item }">
                    {{ metricRange(item, key) }}
                </template>
                <template #item.fan="{ item }">{{ value(item.metrics?.fan?.mean) }}</template>
                <template #item.hotend_fan="{ item }">{{ value(item.metrics?.hotend_fan?.mean) }}</template>
                <template #item.print_speed="{ item }">{{ metricRange(item, 'print_speed') }}</template>
                <template #item.travel_speed="{ item }">{{ metricRange(item, 'travel_speed') }}</template>
                <template #item.t0_mm="{ item }">{{ value(item.filament?.t0?.mm) }}</template>
                <template #item.t1_mm="{ item }">{{ value(item.filament?.t1?.mm) }}</template>
                <template #item.t0_volume="{ item }">{{ value(item.filament?.t0?.mm3) }}</template>
                <template #item.t1_volume="{ item }">{{ value(item.filament?.t1?.mm3) }}</template>
                <template #item.t0_flow="{ item }">{{ value(item.filament?.t0?.mean_flow) }}</template>
                <template #item.t1_flow="{ item }">{{ value(item.filament?.t1?.mean_flow) }}</template>
                <template #item.z="{ item }">{{ value(item.z) }}</template>
                <template #item.height="{ item }">{{ value(item.height) }}</template>
                <template #item.active_seconds="{ item }">{{ value(item.active_seconds) }}</template>
                <template #item.pause_seconds="{ item }">{{ value(item.pause_seconds) }}</template>
                <template #item.gap_seconds="{ item }">{{ value(item.gap_seconds) }}</template>
                <template #item.flags="{ item }">{{ item.flags.map(flagLabel).join(' · ') }}</template>
            </v-data-table>
            <div class="text-right mt-3">
                <v-btn small outlined :loading="exporting" @click="exportCsv">{{ $t('LayerHistory.Csv') }}</v-btn>
            </div>
        </template>
    </div>
</template>

<script lang="ts">
import { Component, Mixins, Prop, Watch } from 'vue-property-decorator'
import { connect, disconnect, use } from 'echarts/core'
import { DataZoomComponent } from 'echarts/components'
import type { ECBasicOption } from 'echarts/types/dist/shared.d'
import { mdiRefresh } from '@mdi/js'
import BaseMixin from '@/components/mixins/base'
import { formatPrintTime } from '@/plugins/helpers'
import { ServerHistoryStateJob } from '@/store/server/history/types'
import messages from './layer-history.messages'

interface Statistic {
    mean: number | null
    min: number | null
    max: number | null
    seconds: number
    samples: number
}

interface LayerRow {
    layer: number
    layer_end: number
    z: number | null
    height: number | null
    active_seconds: number
    pause_seconds: number
    gap_seconds: number
    metrics: Record<string, Statistic>
    filament: Record<string, { mm: number | null; mm3: number | null; mean_flow: number | null }>
    flags: string[]
    complete: boolean
}

interface LayerResponse {
    available: boolean
    total: number
    status?: string
    metadata?: { closed_layers?: number; expected_layers?: number; flags?: string[] }
    summary?: LayerRow
    rows: LayerRow[]
}

const CSV_METRICS = [
    't0',
    't0_target',
    't1',
    't1_target',
    'bed',
    'bed_target',
    'chamber',
    'chamber_target',
    'fan',
    'hotend_fan',
    'print_speed',
    'travel_speed',
]
const PAGE_SIZE = 100
const MAX_CHART_POINTS = 2000
use([DataZoomComponent])

@Component({ i18n: { messages, fallbackLocale: 'en' } })
export default class LayerHistory extends Mixins(BaseMixin) {
    @Prop({ type: Object, required: true }) readonly job!: ServerHistoryStateJob

    mdiRefresh = mdiRefresh
    formatPrintTime = formatPrintTime
    mode = 'series'
    category = 'temperature'
    available = false
    loading = false
    exporting = false
    error = ''
    status = ''
    metadata: NonNullable<LayerResponse['metadata']> = {}
    summary = {} as LayerRow
    seriesRows: LayerRow[] = []
    tableRows: LayerRow[] = []
    total = 0
    page = 1
    jump = 1
    epoch = 0
    serial = 0
    destroyed = false
    poller: ReturnType<typeof setInterval> | null = null
    chartGroup = `layer-history-${Date.now()}-${Math.random().toString(36).slice(2)}`

    get jobExists(): boolean {
        const jobs: ServerHistoryStateJob[] = this.$store.state.server.history.jobs ?? []
        return jobs.some((job) => job.job_id === this.job.job_id && job.start_time === this.job.start_time)
    }

    get statusLabel(): string {
        return this.$t(`LayerHistory.States.${this.status}`).toString()
    }

    get qualityFlags(): string[] {
        return [...new Set([...(this.metadata.flags ?? []), ...(this.summary.flags ?? [])])]
    }

    get categories() {
        return ['temperature', 'fans', 'speed', 'flow', 'duration'].map((value) => ({
            value,
            text: this.$t(`LayerHistory.${value[0].toUpperCase() + value.slice(1)}`).toString(),
        }))
    }

    get headers() {
        const labels = [
            ['layer', 'Layer', ''],
            ['z', 'Z', 'mm'],
            ['height', 'Height', 'mm'],
            ['active_seconds', 'Active', 's'],
            ['pause_seconds', 'Pause', 's'],
            ['t0', 'T0', '°C'],
            ['t1', 'T1', '°C'],
            ['bed', 'Bed', '°C'],
            ['chamber', 'Chamber', '°C'],
            ['t0_target', 'T0 Target', '°C'],
            ['t1_target', 'T1 Target', '°C'],
            ['bed_target', 'BedTarget', '°C'],
            ['chamber_target', 'ChamberTarget', '°C'],
            ['fan', 'Fan', '%'],
            ['hotend_fan', 'HotendFan', '%'],
            ['print_speed', 'PrintSpeed', 'mm/s'],
            ['travel_speed', 'TravelSpeed', 'mm/s'],
            ['t0_mm', 'T0', 'mm'],
            ['t1_mm', 'T1', 'mm'],
            ['t0_flow', 'T0', 'mm³/s'],
            ['t1_flow', 'T1', 'mm³/s'],
            ['t0_volume', 'T0', 'mm³'],
            ['t1_volume', 'T1', 'mm³'],
            ['gap_seconds', 'Gap', 's'],
            ['flags', 'Quality', ''],
        ]
        return labels.map(([value, name, unit]) => ({
            value,
            text: `${/^T[01]/.test(name) ? name.replace('Target', this.$t('LayerHistory.Target').toString()) : this.$t(`LayerHistory.${name}`)}${unit ? ` (${unit})` : ''}`,
            sortable: false,
            width: value === 'flags' ? 250 : 130,
        }))
    }

    get charts(): { key: string; title: string; option: ECBasicOption }[] {
        if (this.category === 'temperature') {
            return ['t0', 't1', 'bed', 'chamber'].map((key) => ({
                key,
                title: key.startsWith('t')
                    ? key.toUpperCase()
                    : this.$t(`LayerHistory.${key === 'bed' ? 'Bed' : 'Chamber'}`).toString(),
                option: this.chart(
                    [
                        { key, name: this.$t('LayerHistory.Average').toString() },
                        { key, field: 'min', name: this.$t('LayerHistory.Minimum').toString() },
                        { key, field: 'max', name: this.$t('LayerHistory.Maximum').toString() },
                        { key: `${key}_target`, name: this.$t('LayerHistory.Target').toString(), target: true },
                    ],
                    '°C'
                ),
            }))
        }
        const definitions: Record<string, { key: string; label: string; unit: string }[]> = {
            fans: [
                { key: 'fan', label: 'Fan', unit: '%' },
                { key: 'hotend_fan', label: 'HotendFan', unit: '%' },
            ],
            speed: [
                { key: 'print_speed', label: 'PrintSpeed', unit: 'mm/s' },
                { key: 'travel_speed', label: 'TravelSpeed', unit: 'mm/s' },
            ],
            flow: [
                { key: 't0_flow', label: 'T0', unit: 'mm³/s' },
                { key: 't1_flow', label: 'T1', unit: 'mm³/s' },
            ],
            duration: [
                { key: 'active_seconds', label: 'Active', unit: 's' },
                { key: 'pause_seconds', label: 'Pause', unit: 's' },
            ],
        }
        const selected = definitions[this.category] ?? definitions.speed
        return [
            {
                key: this.category,
                title: '',
                option: this.chart(
                    selected.map((entry) => ({
                        key: entry.key,
                        name:
                            entry.label.startsWith('T') && entry.label.length === 2
                                ? entry.label
                                : this.$t(`LayerHistory.${entry.label}`).toString(),
                    })),
                    selected[0].unit
                ),
            },
        ]
    }

    @Watch('mode')
    modeChanged(): void {
        this.refresh(false)
    }

    @Watch('jobExists')
    historyChanged(exists: boolean): void {
        if (!exists) {
            this.invalidate()
            this.$emit('deleted')
        }
    }

    mounted(): void {
        this.refresh(false)
        this.poller = setInterval(() => {
            if (!this.loading && (this.status === 'recording' || (!this.status && this.job.status === 'in_progress')))
                this.refresh(true)
        }, 5000)
        connect(this.chartGroup)
    }

    beforeDestroy(): void {
        this.invalidate()
        disconnect(this.chartGroup)
    }

    invalidate(): void {
        this.epoch++
        this.destroyed = true
        if (this.poller) clearInterval(this.poller)
        this.poller = null
        this.seriesRows = []
        this.tableRows = []
    }

    value(value: number | null | undefined): string {
        return value == null || !Number.isFinite(value) ? '—' : String(Math.round(value * 1000) / 1000)
    }

    metricRange(row: LayerRow, key: string): string {
        const stat = row.metrics?.[key]
        return stat?.mean == null ? '—' : `${this.value(stat.mean)} (${this.value(stat.min)}–${this.value(stat.max)})`
    }

    flagLabel(flag: string): string {
        const [name, channel] = flag.split(':')
        const key = `LayerHistory.Flags.${name}`
        return `${this.$te(key) ? this.$t(key) : this.$t('LayerHistory.Unknown')}${channel ? ` (${channel})` : ''}`
    }

    jumpLayer(): void {
        this.page = Math.floor((Math.max(1, Math.min(this.total, this.jump)) - 1) / PAGE_SIZE) + 1
        this.refresh(false)
    }

    async request(params: Record<string, unknown>): Promise<LayerResponse> {
        return this.$socket.emitAndWait('server.layer_history.job', {
            uid: this.job.job_id,
            start_time: this.job.start_time,
            ...params,
        }) as Promise<LayerResponse>
    }

    async refresh(incremental: boolean): Promise<void> {
        if (this.destroyed) return
        const epoch = this.epoch
        const serial = ++this.serial
        this.loading = true
        try {
            const after =
                incremental && this.mode === 'series' ? (this.seriesRows[this.seriesRows.length - 1]?.layer ?? 0) : 0
            const result = await this.request({
                view: this.mode,
                offset: (this.page - 1) * PAGE_SIZE,
                limit: PAGE_SIZE,
                after_layer: after,
            })
            if (this.destroyed || epoch !== this.epoch || serial !== this.serial) return
            this.available = result.available
            this.total = result.total
            this.status = result.status ?? ''
            this.metadata = result.metadata ?? {}
            this.summary = result.summary ?? ({} as LayerRow)
            this.error = ''
            if (this.mode === 'table') this.tableRows = result.rows
            else {
                this.seriesRows = after
                    ? [...this.seriesRows.filter((row) => row.layer_end < after), ...result.rows]
                    : result.rows
                if (this.seriesRows.length > MAX_CHART_POINTS) this.compactSeries()
            }
            if (this.status && this.status !== 'recording' && this.poller) {
                clearInterval(this.poller)
                this.poller = null
            }
        } catch {
            if (!this.destroyed && epoch === this.epoch && serial === this.serial)
                this.error = this.$t('LayerHistory.Unavailable').toString()
        } finally {
            if (serial === this.serial) this.loading = false
        }
    }

    compactSeries(): void {
        const rows: LayerRow[] = []
        for (let index = 0; index < this.seriesRows.length; index += 2) {
            const left = this.seriesRows[index]
            const right = this.seriesRows[index + 1]
            if (!right) {
                rows.push(left)
                continue
            }
            const merged = JSON.parse(JSON.stringify(left)) as LayerRow
            merged.layer_end = right.layer_end
            for (const key of Object.keys(right.metrics)) {
                const old = merged.metrics[key]
                const next = right.metrics[key]
                if (!old?.seconds) {
                    merged.metrics[key] = next
                    continue
                }
                if (!next.seconds) continue
                const seconds = old.seconds + next.seconds
                merged.metrics[key] = {
                    mean: ((old.mean ?? 0) * old.seconds + (next.mean ?? 0) * next.seconds) / seconds,
                    min: Math.min(old.min ?? Infinity, next.min ?? Infinity),
                    max: Math.max(old.max ?? -Infinity, next.max ?? -Infinity),
                    seconds,
                    samples: old.samples + next.samples,
                }
            }
            merged.active_seconds += right.active_seconds
            merged.pause_seconds += right.pause_seconds
            merged.gap_seconds += right.gap_seconds
            for (const tool of ['t0', 't1']) {
                const leftLength = merged.filament[tool].mm
                const rightLength = right.filament[tool].mm
                merged.filament[tool].mm = leftLength == null || rightLength == null ? null : leftLength + rightLength
                const first = merged.filament[tool].mm3
                const second = right.filament[tool].mm3
                merged.filament[tool].mm3 = first == null || second == null ? null : first + second
                merged.filament[tool].mean_flow =
                    merged.filament[tool].mm3 != null && merged.active_seconds
                        ? merged.filament[tool].mm3! / merged.active_seconds
                        : null
            }
            merged.flags = [...new Set([...merged.flags, ...right.flags])]
            merged.complete = merged.complete && right.complete
            rows.push(merged)
        }
        this.seriesRows = rows
    }

    chart(entries: { key: string; name: string; field?: string; target?: boolean }[], unit: string): ECBasicOption {
        return {
            animation: false,
            tooltip: { trigger: 'axis', confine: true },
            legend: { type: 'scroll' },
            grid: { top: 40, right: 20, bottom: 65, left: 65 },
            xAxis: { type: 'value', name: this.$t('LayerHistory.Layer').toString(), minInterval: 1 },
            yAxis: { type: 'value', name: unit, scale: true },
            dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 10 }],
            series: entries.map((entry) => ({
                type: 'line',
                name: entry.name,
                showSymbol: false,
                connectNulls: false,
                lineStyle: { type: entry.target ? 'dashed' : 'solid', width: entry.field ? 1 : 2 },
                data: this.seriesRows.map((row) => {
                    let value: number | null
                    if (entry.key.endsWith('_flow')) value = row.filament[entry.key.slice(0, 2)]?.mean_flow ?? null
                    else if (entry.key === 'active_seconds') value = row.active_seconds
                    else if (entry.key === 'pause_seconds') value = row.pause_seconds
                    else value = row.metrics[entry.key]?.[(entry.field ?? 'mean') as keyof Statistic] ?? null
                    return [row.layer, value]
                }),
            })),
        }
    }

    csvHeader(): string {
        return [
            'layer',
            'z_mm',
            'height_mm',
            'active_seconds',
            'pause_seconds',
            'gap_seconds',
            'complete',
            'flags',
            ...CSV_METRICS.flatMap((key) =>
                ['mean', 'min', 'max', 'seconds', 'samples'].map((field) => `${key}_${field}`)
            ),
            ...['t0', 't1'].flatMap((key) => [`${key}_mm`, `${key}_mm3`, `${key}_mean_mm3_s`]),
        ].join(',')
    }

    csvRow(row: LayerRow): string {
        const values: (number | string | boolean | null | undefined)[] = [
            row.layer,
            row.z,
            row.height,
            row.active_seconds,
            row.pause_seconds,
            row.gap_seconds,
            row.complete,
            row.flags.join(';'),
        ]
        for (const key of CSV_METRICS) {
            const metric = row.metrics[key]
            values.push(metric?.mean, metric?.min, metric?.max, metric?.seconds, metric?.samples)
        }
        for (const tool of ['t0', 't1']) {
            const filament = row.filament[tool]
            values.push(filament?.mm, filament?.mm3, filament?.mean_flow)
        }
        return values.map((value) => (value == null ? '' : `"${String(value).replace(/"/g, '""')}"`)).join(',')
    }

    async exportCsv(): Promise<void> {
        if (this.exporting) return
        const epoch = this.epoch
        this.exporting = true
        try {
            const chunks = ['\uFEFF', this.csvHeader(), '\r\n']
            let offset = 0
            let total = this.total
            while (offset < total) {
                const result = await this.request({ view: 'table', offset, limit: 500 })
                if (this.destroyed || epoch !== this.epoch) return
                if (!result.available || !result.rows.length) throw new Error('Layer export interrupted')
                total = Math.min(total, result.total)
                chunks.push(...result.rows.map((row) => this.csvRow(row) + '\r\n'))
                offset += result.rows.length
            }
            if (this.destroyed || epoch !== this.epoch) return
            const url = URL.createObjectURL(new Blob(chunks, { type: 'text/csv;charset=utf-8' }))
            const link = document.createElement('a')
            link.href = url
            link.download = `${this.job.job_id}-layers.csv`
            link.click()
            URL.revokeObjectURL(url)
        } catch {
            if (!this.destroyed && epoch === this.epoch) this.error = this.$t('LayerHistory.ExportFailed').toString()
        } finally {
            this.exporting = false
        }
    }
}
</script>
