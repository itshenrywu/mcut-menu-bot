const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const {
	parseAnnouncementDetailAttachments,
	itemsToPositionedArray,
	toSlashDate,
	parseMenuByDates
} = require('../crawler/snack')

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8')

test('parseAnnouncementDetailAttachments 取出附件並補上完整網址', () => {
	const attachments = parseAnnouncementDetailAttachments(fixture('announcement-detail.html'))

	// 檔案2 的 href 是空的，要被略過
	assert.strictEqual(attachments.length, 1)
	assert.deepStrictEqual(attachments[0], {
		label: '檔案1下載',
		name: '夜點菜單.pdf',
		url: 'http://elder.mcut.edu.tw/website1/uploads/snack.pdf'
	})
})

test('toSlashDate 用今年，但 12 月看到 1 月的公告算明年', (t) => {
	t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 8, 14) })
	assert.strictEqual(toSlashDate('9月14日'), '2026/09/14')
	assert.strictEqual(toSlashDate('1月5日'), '2026/01/05')

	t.mock.timers.setTime(new Date(2026, 11, 20).getTime())
	assert.strictEqual(toSlashDate('1月5日'), '2027/01/05')
	assert.strictEqual(toSlashDate('12月25日'), '2026/12/25')
})

test('toSlashDate 對非日期列回傳 null', () => {
	assert.strictEqual(toSlashDate('第一餐廳'), null)
	assert.strictEqual(toSlashDate(''), null)
})

test('parseMenuByDates 取日期列上下兩列作為兩間餐廳的餐點', (t) => {
	t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 8, 14) })

	const rows = [
		['第一餐廳', '第二餐廳'],
		['滷肉飯', '雞排飯'],
		['9月14日'],
		['貢丸湯', '紅茶']
	]

	const result = parseMenuByDates(rows)

	assert.strictEqual(result.length, 1)
	assert.strictEqual(result[0].date, '2026/09/14')
	assert.deepStrictEqual(result[0].menu, {
		menu_1: [{ type: '主食', foods: '滷肉飯、貢丸湯' }],
		menu_2: [{ type: '主食', foods: '雞排飯、紅茶' }]
	})
})

test('parseMenuByDates 把斜線換成頓號', (t) => {
	t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 8, 14) })

	const result = parseMenuByDates([
		['滷肉飯/雞腿飯', '牛肉麵/陽春麵'],
		['9月15日']
	])

	assert.strictEqual(result[0].menu.menu_1[0].foods, '滷肉飯、雞腿飯')
	assert.strictEqual(result[0].menu.menu_2[0].foods, '牛肉麵、陽春麵')
})

test('parseMenuByDates 沒有餐點時給空陣列，不會產生空字串', (t) => {
	t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 8, 14) })

	// 日期列前後都沒有可用的餐點列
	const noNeighbours = parseMenuByDates([['9月16日']])
	assert.deepStrictEqual(noNeighbours[0].menu, { menu_1: [], menu_2: [] })

	// 有列但兩欄都是空字串
	const blankCells = parseMenuByDates([
		['', ''],
		['9月17日']
	])
	assert.deepStrictEqual(blankCells[0].menu, { menu_1: [], menu_2: [] })

	// 只有第一餐廳有餐點時，第二餐廳應該是空陣列而不是空字串
	const onlyFirst = parseMenuByDates([
		['滷肉飯', ''],
		['9月18日']
	])
	assert.deepStrictEqual(onlyFirst[0].menu.menu_1, [{ type: '主食', foods: '滷肉飯' }])
	assert.deepStrictEqual(onlyFirst[0].menu.menu_2, [])
})

test('itemsToPositionedArray 依座標把文字分行分欄', () => {
	const items = [
		{ str: '滷肉飯', x: 100, y: 500 },
		{ str: '雞排飯', x: 300, y: 500 },
		{ str: '9月14日', x: 100, y: 400 }
	]

	assert.deepStrictEqual(itemsToPositionedArray(items), [
		['滷肉飯', '雞排飯'],
		['9月14日']
	])
})

test('itemsToPositionedArray 對空輸入回傳空陣列', () => {
	assert.deepStrictEqual(itemsToPositionedArray([]), [])
})
