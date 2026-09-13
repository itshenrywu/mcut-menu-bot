const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { parseMenuHtml } = require('../crawler/menu')

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8')

test('parseMenuHtml 合併同類型、去掉反斜線、略過空欄位', () => {
	const menu = parseMenuHtml(fixture('menu-lunch.html'))

	assert.deepStrictEqual(menu, [
		{ type: '自助餐', foods: '滷雞腿、炒高麗菜、糖醋排骨' },
		{ type: '麵食', foods: '牛肉麵' }
	])
})

test('parseMenuHtml 依固定順序排序', () => {
	const html = `<table>
		<tr><th>表頭</th><th></th><th></th><th></th><th></th></tr>
		<tr><td>1</td><td></td><td>湯</td><td></td><td>貢丸湯</td></tr>
		<tr><td>2</td><td></td><td>快餐</td><td></td><td>雞排飯</td></tr>
		<tr><td>3</td><td></td><td>自助餐</td><td></td><td>三菜一肉</td></tr>
	</table>`

	assert.deepStrictEqual(
		parseMenuHtml(html).map((row) => row.type),
		['自助餐', '快餐', '湯']
	)
})

test('parseMenuHtml 把不在清單裡的類型排到最後', () => {
	const html = `<table>
		<tr><th>表頭</th><th></th><th></th><th></th><th></th></tr>
		<tr><td>1</td><td></td><td>湯</td><td></td><td>貢丸湯</td></tr>
		<tr><td>2</td><td></td><td>特餐</td><td></td><td>新類型</td></tr>
		<tr><td>3</td><td></td><td>自助餐</td><td></td><td>三菜一肉</td></tr>
		<tr><td>4</td><td></td><td>快餐</td><td></td><td>雞排飯</td></tr>
	</table>`

	assert.deepStrictEqual(
		parseMenuHtml(html).map((row) => row.type),
		['自助餐', '快餐', '湯', '特餐']
	)
})

test('parseMenuHtml 遇到錯誤頁回傳空陣列，型別與正常路徑一致', () => {
	const menu = parseMenuHtml(fixture('menu-error.html'))

	assert.ok(Array.isArray(menu))
	assert.strictEqual(menu.length, 0)
})

test('parseMenuHtml 對空頁面回傳空陣列', () => {
	assert.deepStrictEqual(parseMenuHtml('<html><body></body></html>'), [])
})
