'use strict'

const babel = require('rollup-plugin-babel')
const nodeResolve = require('rollup-plugin-node-resolve')

module.exports = {
  plugins: [
    babel({
      exclude: 'node_modules/**/*',
    }),
    nodeResolve(),
  ],
  input: 'src/index.mjs',
  output: {
    file: `dist/selektr.js`,
    format: 'umd',
    name: 'selektr',
    sourcemap: true,
  },
}
