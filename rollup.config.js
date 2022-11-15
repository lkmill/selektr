import babel from '@rollup/plugin-babel'
import nodeResolve from '@rollup/plugin-node-resolve'

export default {
  plugins: [
    babel({
      exclude: 'node_modules/**/*',
    }),
    nodeResolve(),
  ],
  input: 'src/index.js',
  output: {
    file: `dist/selektr.js`,
    format: 'umd',
    name: 'selektr',
    sourcemap: true,
  },
}
