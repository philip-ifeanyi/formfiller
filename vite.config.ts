import { defineConfig } from 'vite'
import { resolve } from 'path'
import { crx } from '@crxjs/vite-plugin'
import manifest from './public/manifest.json'

export default defineConfig({
	plugins: [
		crx({ manifest })
	],
	build: {
		rollupOptions: {
			input: {
				popup: resolve(__dirname, 'src/popup/index.html'),
				options: resolve(__dirname, 'src/options/index.html'),
				content: resolve(__dirname, 'src/content/index.ts'),
				background: resolve(__dirname, 'src/background/index.ts')
			},
			output: {
				entryFileNames: '[name].js',
				chunkFileNames: 'chunks/[name].[hash].js',
				assetFileNames: 'assets/[name].[ext]'
			}
		}
	},
	resolve: {
		alias: {
			'@': resolve(__dirname, 'src'),
		}
	}
})