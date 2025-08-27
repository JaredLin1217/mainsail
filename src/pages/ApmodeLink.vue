<template>
  <div class="p-6">
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

  async mounted() {
    await this.openAndReturn()
  }

  async openAndReturn() {
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
}
</script>
