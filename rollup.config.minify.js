'use strict'

const terser = require('@rollup/plugin-terser')
const config = require('./rollup.config')

config.output.file = config.output.file.replace(/js$/, 'min.js')
config.plugins = config.plugins.concat(terser())

module.exports = config
