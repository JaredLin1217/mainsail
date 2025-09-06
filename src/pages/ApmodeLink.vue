<template>
  <div class="p-6" v-if="showMessage">
    <p class="mb-2">{{ $t('APmode.Opening') }}</p>
    <p v-if="href">
      {{ $t('APmode.PopupBlocked') }}
      <a :href="href" target="_blank" rel="noopener">
        {{ $t('APmode.OpenManually') }}
      </a>
    </p>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'

@Component
export default class ApmodeLink extends Vue {
  href: string = 'http://10.123.0.1:8181/'
  opened: boolean = false
  showMessage: boolean = false
  timer: number | null = null

  async mounted() {
    await this.openAndReturn()
  }

  async openAndReturn() {
    if (!this.opened && this.href) {
      this.opened = true

      // 10 秒后还没离开本页 → 显示提示
      this.timer = window.setTimeout(() => {
        this.showMessage = true
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
}
</script>