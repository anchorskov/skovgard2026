// unocss.config.cjs
const { defineConfig } = require('unocss')
const presetUno        = require('@unocss/preset-uno').default

module.exports = defineConfig({
  presets: [
    presetUno(),
  ],

  /* Scan only the folders Hugo actually renders from */
  include: [
    'layouts/**/*.html',   // theme & custom templates
    'content/**/*.md',     // markdown pages/posts
    'assets/**/*.js',      // any inline-class JavaScript
  ],

  /* Skip heavy or generated dirs */
  exclude: [
    'node_modules',
    '.git',
    'public',   // Hugo output
    'dist'      // optional build artefacts
  ],
})
