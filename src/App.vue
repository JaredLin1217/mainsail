<template>
  <v-app :style="cssVars">
    <template v-if="socketIsConnected && guiIsReady">
      <the-sidebar />
      <the-topbar />
      <v-main id="content" :style="mainStyle">
        <v-container id="page-container" fluid :class="containerClasses">
          <router-view />
        </v-container>
      </v-main>
      <the-service-worker />
      <the-update-dialog />
      <the-editor />
      <the-timelapse-rendering-snackbar />
      <the-fullscreen-upload />
      <the-upload-snackbar />
      <the-manual-probe-dialog />
      <the-bed-screws-dialog />
      <the-screws-tilt-adjust-dialog />
      <the-macro-prompt />
    </template>
    <the-select-printer-dialog v-else-if="instancesDB !== 'moonraker'" />
    <the-connecting-dialog v-else />
  </v-app>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Watch } from 'vue-property-decorator'

import TheSidebar from '@/components/TheSidebar.vue'
import BaseMixin from '@/components/mixins/base'
import ThemeMixin from './components/mixins/theme'
import TheTopbar from '@/components/TheTopbar.vue'
import TheUpdateDialog from '@/components/TheUpdateDialog.vue'
import TheConnectingDialog from '@/components/TheConnectingDialog.vue'
import TheSelectPrinterDialog from '@/components/TheSelectPrinterDialog.vue'
import TheEditor from '@/components/TheEditor.vue'
import { panelToolbarHeight, topbarHeight, navigationItemHeight } from '@/store/variables'
import TheTimelapseRenderingSnackbar from '@/components/TheTimelapseRenderingSnackbar.vue'
import TheFullscreenUpload from '@/components/TheFullscreenUpload.vue'
import TheUploadSnackbar from '@/components/TheUploadSnackbar.vue'
import TheManualProbeDialog from '@/components/dialogs/TheManualProbeDialog.vue'
import TheBedScrewsDialog from '@/components/dialogs/TheBedScrewsDialog.vue'
import TheScrewsTiltAdjustDialog from '@/components/dialogs/TheScrewsTiltAdjustDialog.vue'
import { setAndLoadLocale } from './plugins/i18n'
import TheMacroPrompt from '@/components/dialogs/TheMacroPrompt.vue'
import { AppRoute } from '@/routes'

Component.registerHooks(['metaInfo'])

@Component({
  components: {
    TheMacroPrompt,
    TheTimelapseRenderingSnackbar,
    TheEditor,
    TheSelectPrinterDialog,
    TheConnectingDialog,
    TheUpdateDialog,
    TheTopbar,
    TheSidebar,
    TheFullscreenUpload,
    TheUploadSnackbar,
    TheManualProbeDialog,
    TheBedScrewsDialog,
    TheScrewsTiltAdjustDialog,
  },
})
export default class App extends Mixins(BaseMixin, ThemeMixin) {
  // ---- 新增：系統偏好監聽器 ----
  private _mq: MediaQueryList | null = null
  private _onSystemPrefChange = (_e?: MediaQueryListEvent) => {
    if (this.mode === 'system') this.applyTheme('system')
  }

  public metaInfo(): any {
    let title = this.$store.getters['getTitle']
    if (this.isPrinterPowerOff) title = this.$t('App.Titles.PrinterOff')
    return { title, titleTemplate: '%s' }
  }

  // === getters ===
  get title(): string { return this.$store.getters['getTitle'] }
  get naviDrawer(): boolean { return this.$store.state.naviDrawer }
  get navigationStyle() { return this.$store.state.gui.uiSettings.navigationStyle }
  get customStylesheet() { return this.$store.getters['files/getCustomStylesheet'] }
  get customFavicons(): string | null { return this.$store.getters['files/getCustomFavicons'] ?? null }
  get language(): string { return this.$store.state.gui.general.language }
  get current_file(): string { return this.$store.state.printer.print_stats?.filename ?? '' }
  get mode(): string { return this.$store.state.gui.uiSettings.mode } // 'light' | 'dark' | 'system'
  get logoColor(): string { return this.$store.state.gui.uiSettings.logo }
  get primaryColor(): string { return this.$store.state.gui.uiSettings.primary }
  get warningColor(): string { return this.$vuetify?.theme?.currentTheme?.warning?.toString() ?? '#ff8300' }

  get primaryTextColor(): string {
    const splits = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(this.primaryColor)
    if (splits) {
      const r = parseInt(splits[1], 16) * 0.2126
      const g = parseInt(splits[2], 16) * 0.7152
      const b = parseInt(splits[3], 16) * 0.0722
      const perceivedLightness = (r + g + b) / 255
      return perceivedLightness > 0.7 ? '#222' : '#fff'
    }
    return '#ffffff'
  }

  get cssVars(): { [key: string]: string } {
    return {
      '--v-btn-text-primary': this.primaryTextColor,
      '--color-logo': this.logoColor,
      '--color-primary': this.primaryColor,
      '--color-warning': this.warningColor,
      '--panel-toolbar-icon-btn-width': panelToolbarHeight + 'px',
      '--panel-toolbar-text-btn-height': panelToolbarHeight + 'px',
      '--topbar-icon-btn-width': topbarHeight + 'px',
      '--sidebar-menu-item-height': navigationItemHeight + 'px',
    }
  }

  get print_percent(): number {
    return Math.floor(this.$store.getters['printer/getPrintPercent'] * 100)
  }

  get containerClasses() {
    const currentRouteOptions = this.$router.options.routes?.find(
      (route) => route.name === this.$route.name
    ) as AppRoute

    return {
      'px-3': true,
      'px-sm-6': true,
      'py-sm-6': true,
      'mx-auto': true,
      fullscreen: currentRouteOptions?.fullscreen ?? false,
    }
  }

  get progressAsFavicon() { return this.$store.state.gui.uiSettings.progressAsFavicon }

  get mainStyle() {
    const style: any = { paddingLeft: '0' }
    if (this.mainBgImage !== null) {
      style.backgroundImage = 'url(' + this.mainBgImage + ')'
    }
    // overwrite padding left for the sidebar
    if (this.naviDrawer && !this.$vuetify.breakpoint.mdAndDown) {
      if (this.navigationStyle === 'iconsAndText') style.paddingLeft = '220px'
      if (this.navigationStyle === 'iconsOnly') style.paddingLeft = '56px'
    }
    return style
  }

  // === lifecycle ===
  created() {
    // 監聽系統偏好（淺色）
    try {
      this._mq = window.matchMedia('(prefers-color-scheme: light)')
      if ((this._mq as any).addEventListener) {
        (this._mq as any).addEventListener('change', this._onSystemPrefChange)
      } else if ((this._mq as any).addListener) {
        (this._mq as any).addListener(this._onSystemPrefChange) // 老瀏覽器
      }
    } catch (e) { /* no-op */ }
  }

  beforeDestroy() {
    if (this._mq) {
      if ((this._mq as any).removeEventListener) {
        (this._mq as any).removeEventListener('change', this._onSystemPrefChange)
      } else if ((this._mq as any).removeListener) {
        (this._mq as any).removeListener(this._onSystemPrefChange)
      }
    }
  }

  mounted(): void {
    this.drawFavicon(this.print_percent)
    this.appHeight()
    window.addEventListener('resize', this.appHeight)
    window.addEventListener('orientationchange', this.appHeight)
  }

  // === watchers ===
  @Watch('language')
  async languageChanged(newVal: string): Promise<void> {
    await setAndLoadLocale(newVal)
  }

  @Watch('customStylesheet')
  customStylesheetChanged(newVal: string | null): void {
    const style = document.getElementById('customStylesheet')
    if (newVal !== null && style === null) {
      const newStyle = document.createElement('link')
      newStyle.id = 'customStylesheet'
      newStyle.type = 'text/css'
      newStyle.rel = 'stylesheet'
      newStyle.href = newVal
      document.head.appendChild(newStyle)
    } else if (newVal !== null && style) {
      style.setAttribute('href', newVal)
    } else if (style) {
      style.remove()
    }
  }

  @Watch('current_file')
  current_fileChanged(newVal: string): void {
    if (newVal === '') return
    this.$socket.emit('server.files.metadata', { filename: newVal }, { action: 'files/getMetadataCurrentFile' })
  }

  @Watch('primaryColor')
  primaryColorChanged(newVal: string): void {
    this.$nextTick(() => {
      this.$vuetify.theme.currentTheme.primary = newVal
    })
  }

  // ★ 重要：首次載入也會執行
  @Watch('mode', { immediate: true })
  modeChanged(newVal: string): void {
    this.applyTheme(newVal)
  }

  @Watch('customFavicons')
  customFaviconsChanged(): void {
    this.drawFavicon(this.print_percent)
  }

  @Watch('progressAsFavicon')
  progressAsFaviconChanged(): void {
    this.drawFavicon(this.print_percent)
  }

  @Watch('logoColor')
  logoColorChanged(): void {
    this.drawFavicon(this.print_percent)
  }

  @Watch('themeCss')
  themeCssChanged(newVal: string | null): void {
    // remove linked CSS file if it exists
    const style = document.getElementById('theme-css')
    if (style) style.remove()

    // if themeCss does not exist, stop here and load no CSS file
    if (newVal === null) return

    // fetch the CSS file and append it to the head
    fetch(newVal)
      .then((response) => response.text())
      .then((css) => {
        const newStyle = document.createElement('style')
        newStyle.id = 'theme-css'
        newStyle.innerHTML = css
        document.head.appendChild(newStyle)
      })
  }

  @Watch('print_percent')
  print_percentChanged(newVal: number): void {
    this.drawFavicon(newVal)
    this.refreshSpoolman()
  }

  @Watch('printerIsPrinting')
  printerIsPrintingChanged(): void {
    this.drawFavicon(this.print_percent)
  }

  // === methods ===
  private applyTheme(mode: string) {
    const prefersLight = this._mq ? this._mq.matches : true
    const effective = mode === 'system' ? (prefersLight ? 'light' : 'dark') : mode
    const isDark = effective === 'dark'

    // 1) Vuetify 主題同步
    this.$vuetify.theme.dark = isDark

    // 2) <html> class（避免覆蓋其它 class）
    const doc = document.documentElement
    doc.classList.toggle('theme--dark', isDark)
    doc.classList.toggle('theme--light', !isDark)

    // 3) color-scheme 提示瀏覽器原生元件
    ;(doc as HTMLElement).style.colorScheme = effective

    // 4) 持久化使用者選擇（非 effective）
    try { localStorage.setItem('theme', mode) } catch (e) { /* ignore */ }
  }

  async drawFavicon(val: number): Promise<void> {
    const favicon16: HTMLLinkElement | null = document.querySelector("link[rel*='icon'][sizes='16x16']")
    const favicon32: HTMLLinkElement | null = document.querySelector("link[rel*='icon'][sizes='32x32']")

    if (!favicon16 || !favicon32) return

    if (this.progressAsFavicon && this.printerIsPrinting) {
      const faviconSize = 64
      const canvas = document.createElement('canvas')
      canvas.width = faviconSize
      canvas.height = faviconSize
      const context = canvas.getContext('2d')
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      const radius = 32
      if (!context) return

      // base circle
      context.beginPath()
      context.moveTo(centerX, centerY)
      context.arc(centerX, centerY, radius, 0, 2 * Math.PI, false)
      context.closePath()
      context.fillStyle = '#ddd'
      context.fill()
      context.strokeStyle = 'rgba(200, 208, 218, 0.66)'
      context.stroke()

      // progress arc
      const startAngle = 1.5 * Math.PI
      const unitValue = (Math.PI - 0.5 * Math.PI) / 25
      const endAngle = startAngle + val * unitValue
      context.beginPath()
      context.moveTo(centerX, centerY)
      context.arc(centerX, centerY, radius, startAngle, endAngle, false)
      context.closePath()
      context.fillStyle = this.logoColor
      context.fill()

      const dataURL = canvas.toDataURL('image/png')
      favicon16.href = dataURL
      favicon32.href = dataURL
      return
    }

    if (this.customFavicons) {
      const [favicon16Path, favicon32Path] = this.customFavicons
      favicon16.href = favicon16Path
      favicon32.href = favicon32Path
      return
    }

    if ((this.theme?.logo?.show ?? false) && this.sidebarLogo.endsWith('.svg')) {
      const response = await fetch(this.sidebarLogo)
      if (!response.ok) return
      const text = await response.text()
      const modifiedSvg = text.replace(/fill="var\(--color-logo, #[0-9a-fA-F]{6}\)"/g, `fill="${this.logoColor}"`)
      const blob = new Blob([modifiedSvg], { type: 'image/svg+xml' })
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64data = reader.result as string
        favicon16.href = base64data
        favicon32.href = base64data
      }
      reader.readAsDataURL(blob)
      return
    }

    const fallback =
      'data:image/svg+xml;base64,' +
      window.btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 599.38 523.11">
          <g>
            <rect style="fill:#fff;" width="599.38" height="523.11"/>
            <rect style="fill:#494949;" x="11" y="212.59" width="25.97" height="121.88"/>
            <polygon style="fill:#494949;" points="163.06 212.59 63.82 212.59 59.3 212.59 59.3 334.47 85.27 334.47 85.27 238.56 137.44 238.56 137.44 334.47 163.4 334.47 163.4 212.59 163.06 212.59"/>
            <polygon style="fill:#494949;" points="464.22 212.59 364.98 212.59 360.46 212.59 360.46 334.47 386.43 334.47 386.43 238.56 438.6 238.56 438.6 334.47 464.56 334.47 464.56 212.59 464.22 212.59"/>
            <polygon style="fill:#494949;" points="337.79 212.59 238.56 212.59 234.03 212.59 233.99 286.89 259.95 286.89 259.99 238.56 312.16 238.56 312.16 308.5 282.33 308.5 282.33 334.47 338.13 334.47 338.13 212.59 337.79 212.59"/>
            <polygon style="fill:#494949;" points="565.03 285.89 565.03 308.5 512.87 308.5 512.87 238.56 578.02 238.56 578.02 212.59 486.9 212.59 486.9 334.47 512.87 334.47 565.03 334.47 590.66 334.47 591 334.47 591 285.89 565.03 285.89"/>
            <polygon style="fill:#d66c47;" points="257.7 310.33 207.77 310.33 207.77 187.53 180.96 187.53 180.96 336.47 257.7 336.47 257.7 310.33"/>
          </g>
        </svg>
      `)
    favicon16.href = fallback
    favicon32.href = fallback
  }

  refreshSpoolman(): void {
    if (this.moonrakerComponents.includes('spoolman')) {
      this.$store.dispatch('server/spoolman/refreshActiveSpool', null, { root: true })
    }
  }

  appHeight() {
    this.$nextTick(() => {
      const doc = document.documentElement
      doc.style.setProperty('--app-height', window.innerHeight + 'px')
    })
  }
}
</script>

<style>
@import './assets/styles/fonts.css';
@import './assets/styles/toastr.css';
@import './assets/styles/page.css';
@import './assets/styles/sidebar.css';
@import './assets/styles/utils.css';
@import './assets/styles/updateManager.css';

:root {
  --app-height: 100%;
}

#content {
  background-attachment: fixed;
  background-size: cover;
  background-repeat: no-repeat;
}

/*noinspection CssUnusedSymbol*/
.v-btn:not(.v-btn--outlined).primary {
  /*noinspection CssUnresolvedCustomProperty*/
  color: var(--v-btn-text-primary);
}
</style>
