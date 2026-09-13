const js = require('@eslint/js')

module.exports = [
	{
		ignores: ['node_modules/**', 'data/**']
	},
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: 'commonjs',
			globals: {
				console: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				URL: 'readonly',
				fetch: 'readonly',
				AbortSignal: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				__dirname: 'readonly',
				module: 'writable',
				require: 'readonly',
				exports: 'writable'
			}
		},
		rules: {
			// `x != null` 是「不是 null 也不是 undefined」的慣用寫法，保留
			eqeqeq: ['error', 'always', { null: 'ignore' }],
			indent: ['error', 'tab', { SwitchCase: 1 }],
			'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
			// 對齊 .editorconfig 的 insert_final_newline
			'eol-last': ['error', 'always']
		}
	}
]
