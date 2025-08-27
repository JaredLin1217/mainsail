import Vue from 'vue'
import Vuetify from 'vuetify'
import { Touch, Ripple } from 'vuetify/lib/directives'

Vue.use(Vuetify, {
    directives: { Touch, Ripple },
})

export default new Vuetify({
  theme: {
    dark: false,
    options: { customProperties: false },
    themes: {
      light: {
        background: '#f5f5f5', // 背景
        surface: '#f5f5f5',
        primary: '#d66c47',
        secondary: '#424242',
        accent: '#82B1FF',
        error: '#CF6679',
        info: '#2196F3',
        success: '#4CAF50',
        warning: '#FB8C00',
      },
      dark: {
        background: '#121212', // 背景
        surface: '#1E1E1E',
        primary: '#d66c47',
        secondary: '#03DAC6',
        accent: '#82B1FF',
        error: '#CF6679',
        info: '#2196F3',
        success: '#4CAF50',
        warning: '#FB8C00',
      },
    },
  },
  icons: {
    iconfont: 'mdiSvg',
  },
  breakpoint: {
    mobileBreakpoint: 768,
  },
})