const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const {
	parseAnnouncementDate,
	isAnnouncementWithinDays,
	parseAnnouncementTable
} = require('../crawler/announcements')

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8')

test('parseAnnouncementDate 把民國年換算成西元年', () => {
	const date = parseAnnouncementDate('115/09/10')
	assert.strictEqual(date.getFullYear(), 2026)
	assert.strictEqual(date.getMonth(), 8)
	assert.strictEqual(date.getDate(), 10)
})

test('parseAnnouncementDate 支援西元年與不同分隔符號', () => {
	for (const input of ['2026/09/10', '2026-09-10', '2026.9.10']) {
		const date = parseAnnouncementDate(input)
		assert.strictEqual(date.getFullYear(), 2026, input)
		assert.strictEqual(date.getMonth(), 8, input)
		assert.strictEqual(date.getDate(), 10, input)
	}
})

test('parseAnnouncementDate 對無法解析的輸入回傳 null', () => {
	assert.strictEqual(parseAnnouncementDate(''), null)
	assert.strictEqual(parseAnnouncementDate(null), null)
	assert.strictEqual(parseAnnouncementDate('沒有日期'), null)
})

const daysAgo = (offsetDays) => {
	const d = new Date()
	d.setDate(d.getDate() + offsetDays)
	return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

test('isAnnouncementWithinDays 預設窗口是 7 天', () => {
	assert.strictEqual(isAnnouncementWithinDays(daysAgo(0)), true)
	assert.strictEqual(isAnnouncementWithinDays(daysAgo(-7)), true)
	assert.strictEqual(isAnnouncementWithinDays(daysAgo(-8)), false)
	assert.strictEqual(isAnnouncementWithinDays(daysAgo(30)), false)
})

test('isAnnouncementWithinDays 可以指定天數', () => {
	assert.strictEqual(isAnnouncementWithinDays(daysAgo(-3), 3), true)
	assert.strictEqual(isAnnouncementWithinDays(daysAgo(-4), 3), false)
	assert.strictEqual(isAnnouncementWithinDays(daysAgo(-14), 30), true)
})

test('isAnnouncementWithinDays 解析不出日期時保守視為在範圍內', () => {
	// 寧可多處理一則，也不要因為日期格式沒見過就漏掉公告
	assert.strictEqual(isAnnouncementWithinDays('沒有日期'), true)
	assert.strictEqual(isAnnouncementWithinDays(''), true)
})

test('parseAnnouncementTable 只解析有「公告主旨」表頭的表格', () => {
	const announcements = parseAnnouncementTable(fixture('announcement-list.html'))

	// 純數字的標題（分頁列）與欄位不足的列都要略過
	assert.strictEqual(announcements.length, 2)
	assert.deepStrictEqual(announcements[0], {
		title: '115學年度第1學期夜點供應',
		startDate: '115/09/10',
		endDate: '115/09/20',
		detailUrl: 'http://elder.mcut.edu.tw/website1/index_post.aspx?id=123'
	})
	assert.strictEqual(announcements[1].detailUrl, 'http://example.com/index_post.aspx?id=456')
})

test('parseAnnouncementTable 對沒有公告的頁面回傳空陣列', () => {
	assert.deepStrictEqual(parseAnnouncementTable('<html><body><p>維護中</p></body></html>'), [])
})
