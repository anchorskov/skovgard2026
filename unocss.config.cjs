const { defineConfig } = require('unocss')
const presetUno    = require('@unocss/preset-uno').default

module.exports = defineConfig({
  presets: [
    presetUno(),
  ],
})
