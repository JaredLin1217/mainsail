<template>
  <div class="p-6">
    <p class="mb-2">{{ $t('Spoolman.Opening') }}</p>
    <p v-if="href">
      {{ $t('Spoolman.PopupBlocked') }}
      <a :href="href" target="_blank" rel="noopener">
        {{ $t('Spoolman.OpenManually') }}
      </a>
    </p>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'

@Component
export default class SpoolmanLink extends Vue {
  href: string = ''
  opened: boolean = false

  async mounted() {
    await this.openAndReturn()
  }

  // ===== 主流程 =====
  async openAndReturn() {
    this.href = await this.resolveSpoolmanUrl()

    if (!this.opened && this.href) {
      this.opened = true
      window.open(this.href, '_blank', 'noopener,noreferrer')

      // 立即導回上一頁（或首頁）
      this.$nextTick(() => {
        if (window.history.length > 1) this.$router.back()
        else this.$router.replace('/')
      })
    }
  }

  // ===== 取得 Spoolman URL（多層來源）=====
  async resolveSpoolmanUrl(): Promise<string> {
    const fromApi = await this.resolveFromConfigApi()
    if (fromApi) return this.normalizeUrl(fromApi)

    const fromConf = await this.resolveFromMoonrakerConf()
    if (fromConf) return this.normalizeUrl(fromConf)

    const envUrl = (process.env as any)?.VUE_APP_SPOOLMAN_URL
      || (import.meta as any)?.env?.VITE_SPOOLMAN_URL
    if (typeof envUrl === 'string' && envUrl) return this.normalizeUrl(envUrl)

    return this.normalizeUrl(`http://${location.hostname}:7912/`)
  }

  // 1) /server/config -> spoolman.server / spoolman.url
  async resolveFromConfigApi(): Promise<string | null> {
    try {
      const res = await fetch('/server/config')
      if (!res.ok) return null
      const json = await res.json()
      const cfg: any = (json && (json.result?.config ?? json.config ?? json)) || {}

      const candidates = [
        cfg?.spoolman,
        cfg?.['section spoolman'],
        cfg?.sections?.spoolman,
        cfg?.config?.spoolman,
      ].filter(Boolean)

      for (const c of candidates as any[]) {
        const v = c?.server ?? c?.url
        if (typeof v === 'string' && v.trim()) return v.trim()
      }
    } catch { /* ignore */ }
    return null
  }

  // 2) 直接抓 moonraker.conf 並解析 [spoolman]
  async resolveFromMoonrakerConf(): Promise<string | null> {
    const tries = [
      '/server/files/config?filename=moonraker.conf',
      '/server/files/config?filename=config/moonraker.conf',
    ]

    for (const url of tries) {
      try {
        const res = await fetch(url)
        if (!res.ok) continue
        const data = await res.json()
        const content: string | undefined =
          data?.result?.contents ?? data?.contents ?? data?.result?.content
        if (typeof content === 'string' && content) {
          const parsed = this.parseSpoolmanUrlFromIni(content)
          if (parsed) return parsed
        }
      } catch { /* continue */ }
    }

    // 再列目錄找 moonraker.conf
    try {
      const res = await fetch('/server/files/list?root=config')
      if (res.ok) {
        const json = await res.json()
        const items: any[] = json?.result?.files ?? []
        const found = items.find((f) => (f?.path || '').endsWith('moonraker.conf'))
        if (found?.path) {
          const res2 = await fetch(`/server/files/config?filename=${encodeURIComponent(found.path)}`)
          if (res2.ok) {
            const j2 = await res2.json()
            const content: string | undefined = j2?.result?.contents ?? j2?.contents
            if (typeof content === 'string' && content) {
              const parsed = this.parseSpoolmanUrlFromIni(content)
              if (parsed) return parsed
            }
          }
        }
      }
    } catch { /* ignore */ }

    return null
  }

  // 解析 INI 的 [spoolman] 區塊，抓 server: / server= / url=
  parseSpoolmanUrlFromIni(iniText: string): string | null {
    const lines = iniText.split(/\r?\n/)
    let section = ''
    for (let raw of lines) {
      const commentIdx = raw.search(/[;#]/)
      if (commentIdx >= 0) raw = raw.slice(0, commentIdx)
      const line = raw.trim()
      if (!line) continue

      const secMatch = line.match(/^\[(.+?)\]$/)
      if (secMatch) {
        section = secMatch[1].trim().toLowerCase()
        continue
      }

      if (section === 'spoolman') {
        const kv = line.match(/^(server|url)\s*[:=]\s*(.+)$/i)
        if (kv) return kv[2].trim()
      }
    }
    return null
  }

  // 規範化 URL
  normalizeUrl(input: string): string {
    let s = input.trim()
    if (!/^https?:\/\//i.test(s)) s = `http://${s}`
    try {
      const u = new URL(s, location.href)
      if (['localhost', '127.0.0.1', '0.0.0.0'].includes(u.hostname)) {
        u.hostname = location.hostname
      }
      const out = u.toString()
      return out.endsWith('/') ? out : out + '/'
    } catch {
      if (!s.endsWith('/')) s += '/'
      return s
    }
  }
}
</script>
