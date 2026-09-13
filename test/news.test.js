const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { parseAnnouncementDetail } = require('../crawler/news')

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8')

test('parseAnnouncementDetail 取出主旨、內容、相關網址與附件', () => {
	const detail = parseAnnouncementDetail(fixture('announcement-detail.html'))

	assert.strictEqual(detail.title, '115學年度第1學期夜點供應')
	// 連續空白會被壓成一個空格並去頭尾
	assert.strictEqual(detail.content, '段考週 免費宵夜供應')
	assert.strictEqual(detail.relatedUrl, 'http://example.com/more')

	// 沒有 href 的檔案2要被略過
	assert.strictEqual(detail.attachments.length, 1)
	assert.deepStrictEqual(detail.attachments[0], {
		label: '檔案1下載',
		name: '夜點菜單.pdf',
		url: 'http://elder.mcut.edu.tw/website1/uploads/snack.pdf'
	})
})

test('parseAnnouncementDetail 對不相關的頁面回傳空白結構', () => {
	const detail = parseAnnouncementDetail('<html><body><table><tr><td>其他</td><td>內容</td></tr></table></body></html>')

	assert.deepStrictEqual(detail, {
		title: '',
		content: '',
		relatedUrl: '',
		attachments: []
	})
})
