'use strict'

const { uglify } = require('rollup-plugin-uglify')
const config = require('./rollup.config')

config.output.file = config.output.file.replace(/js$/, 'min.js')
config.plugins = config.plugins.concat(uglify())

module.exports = config
