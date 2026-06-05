<template>
  <div v-if="showMessage" class="p-6">
    <p class="mb-2">{{ $t(messageKey) }}</p>
    <p v-if="showManualLink && href">
      {{ $t('APmode.PopupBlocked') }}
      <a :href="href" target="_blank" rel="noopener">
        {{ $t('APmode.OpenManually') }}
      </a>
    </p>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'

type ApmodeLinkStatus = 'checking' | 'opening' | 'failed'

@Component
export default class ApmodeLink extends Vue {
  href: string = 'http://10.123.0.1:8181/'
  opened: boolean = false
  showMessage: boolean = true
  showManualLink: boolean = false
  status: ApmodeLinkStatus = 'checking'
  timer: number | null = null
  connectionTimeout: number = 3000

  get messageKey(): string {
    if (this.status === 'failed') return 'APmode.ConnectionFailed'
    if (this.status === 'opening') return 'APmode.Opening'
    return 'APmode.Checking'
  }

  async mounted() {
    await this.openAndReturn()
  }

  async openAndReturn() {
    this.status = 'checking'
    this.showMessage = true
    this.showManualLink = false

    const canConnect = await this.canReachApmode(this.href)
    if (!canConnect) {
      this.status = 'failed'
      return
    }

    if (!this.opened && this.href) {
      this.opened = true
      this.status = 'opening'
      this.showMessage = false

      // 10 秒后还没离开本页 → 显示提示
      this.timer = window.setTimeout(() => {
        this.showMessage = true
        this.showManualLink = true
      }, 10000)

      // 尝试直接跳转
      window.location.replace(this.href)
    }
  }

  beforeDestroy() {
    if (this.timer) {
      clearTimeout(this.timer)
    }
  }

  async canReachApmode(url: string): Promise<boolean> {
    if (!url) return false

    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), this.connectionTimeout)

    try {
      await fetch(url, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      })
      return true
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }
}
</script>
