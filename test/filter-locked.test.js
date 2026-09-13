const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const SCRIPT = path.join(__dirname, '..', '.github', 'scripts', 'filter-locked.js')

const write = (file, content) => {
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, content)
}

const setup = () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-test-'))
	return {
		root,
		source: path.join(root, 'source'),
		published: path.join(root, 'published')
	}
}

const run = (source, published) =>
	spawnSync(process.execPath, [SCRIPT, source, published], { encoding: 'utf-8' })

test('保留未鎖定的檔案，刪掉已鎖定的檔案', () => {
	const { source, published } = setup()

	write(path.join(source, '2026/09/14/1.json'), '{"menu_1":[],"menu_2":[]}')
	write(path.join(source, '2026/09/14/2.json'), '{"menu_1":[],"menu_2":[]}')
	write(path.join(published, '2026/09/14/1.json'), '{"menu_1":[],"menu_2":[]}')
	write(path.join(published, '2026/09/14/2.json'), '{"lock":true,"menu_1":[]}')

	const result = run(source, published)

	assert.strictEqual(result.status, 0, result.stderr)
	assert.ok(fs.existsSync(path.join(source, '2026/09/14/1.json')))
	assert.ok(!fs.existsSync(path.join(source, '2026/09/14/2.json')))
})

test('已發布的檔案是壞掉的 JSON 時保守視為已鎖定', () => {
	const { source, published } = setup()

	write(path.join(source, '2026/09/14/1.json'), '{"menu_1":[],"menu_2":[]}')
	write(path.join(published, '2026/09/14/1.json'), '{"lock":true,}')

	const result = run(source, published)

	assert.strictEqual(result.status, 0, result.stderr)
	assert.ok(!fs.existsSync(path.join(source, '2026/09/14/1.json')))
})

test('gh-pages 上沒有的新檔案會被保留', () => {
	const { source, published } = setup()

	write(path.join(source, '2026/09/14/4.json'), '{"menu_1":[],"menu_2":[]}')
	fs.mkdirSync(published, { recursive: true })

	const result = run(source, published)

	assert.strictEqual(result.status, 0, result.stderr)
	assert.ok(fs.existsSync(path.join(source, '2026/09/14/4.json')))
})

test('宵夜（4.json）與 news.json 同樣會被檢查', () => {
	const { source, published } = setup()

	write(path.join(source, '2026/09/14/4.json'), '{"menu_1":[],"menu_2":[]}')
	write(path.join(source, 'news.json'), '[]')
	write(path.join(published, '2026/09/14/4.json'), '{"lock":true}')
	write(path.join(published, 'news.json'), '[]')

	const result = run(source, published)

	assert.strictEqual(result.status, 0, result.stderr)
	assert.ok(!fs.existsSync(path.join(source, '2026/09/14/4.json')))
	assert.ok(fs.existsSync(path.join(source, 'news.json')))
})

test('找不到 gh-pages 內容時以非 0 結束，不讓部署繼續', () => {
	const { source, published } = setup()

	write(path.join(source, '2026/09/14/1.json'), '{"menu_1":[],"menu_2":[]}')

	const result = run(source, path.join(published, 'missing'))

	assert.strictEqual(result.status, 1)
	assert.ok(fs.existsSync(path.join(source, '2026/09/14/1.json')))
})
