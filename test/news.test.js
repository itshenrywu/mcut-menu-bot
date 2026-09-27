const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const axios = require('axios')

const {
	parseAnnouncementDetail,
	fetchAnnouncementDetail,
	withRetry,
	loadPreviousDetails,
	expandAnnouncements
} = require('../crawler/news')

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8')

const writeTempJson = (t, data) => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'news-test-'))
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
	const filePath = path.join(dir, 'news.json')
	fs.writeFileSync(filePath, JSON.stringify(data))
	return filePath
}

const goodDetail = (title) => ({
	title,
	content: `${title}的內容`,
	relatedUrl: '',
	attachments: [{ label: '檔案1下載', name: `${title}.pdf`, url: `http://example.com/${title}.pdf` }]
})

const announcement = (id) => ({
	title: `公告${id}`,
	startDate: '2026/09/26',
	endDate: '2027/01/31',
	detailUrl: `http://elder.mcut.edu.tw/website1/index_post.aspx?id=${id}`
})

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

test('fetchAnnouncementDetail 拿到錯誤頁（HTTP 200 但沒有主旨）視為失敗', async (t) => {
	t.mock.method(axios, 'get', async () => ({ data: fixture('menu-error.html') }))

	await assert.rejects(fetchAnnouncementDetail(announcement(974)), /內頁沒有公告主旨/)
})

test('fetchAnnouncementDetail 正常頁面回傳解析結果', async (t) => {
	t.mock.method(axios, 'get', async () => ({ data: fixture('announcement-detail.html') }))

	const detail = await fetchAnnouncementDetail(announcement(974))
	assert.strictEqual(detail.title, '115學年度第1學期夜點供應')
})

test('withRetry 失敗後重試，成功就回傳結果', async () => {
	let calls = 0
	const result = await withRetry(async () => {
		calls++
		if (calls === 1) throw new Error('timeout of 15000ms exceeded')
		return 'ok'
	}, 1, 0)

	assert.strictEqual(result, 'ok')
	assert.strictEqual(calls, 2)
})

test('withRetry 重試次數用完就拋出最後一次的錯誤', async () => {
	let calls = 0
	await assert.rejects(
		withRetry(async () => {
			calls++
			throw new Error(`第 ${calls} 次失敗`)
		}, 1, 0),
		/第 2 次失敗/
	)
	assert.strictEqual(calls, 2)
})

test('loadPreviousDetails 只收成功抓到的 detail', async (t) => {
	const filePath = writeTempJson(t, [
		{ ...announcement(974), detail: goodDetail('退伙名單') },
		// 舊版把逾時結果連同 error 一起發布過，不能沿用
		{ ...announcement(968), detail: { title: '', content: '', relatedUrl: '', attachments: [], error: 'timeout of 15000ms exceeded' } },
		{ ...announcement(967), detail: { title: '', content: '', relatedUrl: '', attachments: [] } },
		{ title: '沒有 detail 的舊資料', detailUrl: 'http://example.com/x' }
	])

	const details = await loadPreviousDetails(filePath)

	assert.deepStrictEqual([...details.keys()], [announcement(974).detailUrl])
	assert.deepStrictEqual(details.get(announcement(974).detailUrl), goodDetail('退伙名單'))
})

test('loadPreviousDetails 檔案不存在或壞掉時回傳空的 Map', async (t) => {
	t.mock.method(console, 'warn', () => {})

	assert.strictEqual((await loadPreviousDetails(undefined)).size, 0)
	assert.strictEqual((await loadPreviousDetails('/nonexistent/news.json')).size, 0)

	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'news-test-'))
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
	const broken = path.join(dir, 'news.json')
	fs.writeFileSync(broken, '{ 不是 JSON')
	assert.strictEqual((await loadPreviousDetails(broken)).size, 0)
})

test('expandAnnouncements 抓不到內頁時沿用上次的內容，抓得到就用新的', async (t) => {
	t.mock.method(console, 'warn', () => {})

	const previousDetails = new Map([
		[announcement(974).detailUrl, goodDetail('舊的退伙名單')],
		[announcement(968).detailUrl, goodDetail('舊的搭伙意願')]
	])
	const fetchDetail = async ({ detailUrl }) => {
		if (detailUrl === announcement(968).detailUrl) return goodDetail('新的搭伙意願')
		throw new Error('timeout of 15000ms exceeded')
	}

	const result = await expandAnnouncements(
		[announcement(974), announcement(968), announcement(967)],
		previousDetails,
		fetchDetail
	)

	// 順序與列表欄位維持不變
	assert.deepStrictEqual(result.map(({ detail: _detail, ...rest }) => rest), [announcement(974), announcement(968), announcement(967)])
	// 974 逾時 → 沿用上次；968 成功 → 用新的；967 逾時且沒有舊資料 → 留空
	assert.deepStrictEqual(result[0].detail, goodDetail('舊的退伙名單'))
	assert.deepStrictEqual(result[1].detail, goodDetail('新的搭伙意願'))
	assert.deepStrictEqual(result[2].detail, { title: '', content: '', relatedUrl: '', attachments: [] })

	// 錯誤訊息只寫 log，不發布到公開的 news.json
	assert.ok(result.every(({ detail }) => !('error' in detail)))
})

test('expandAnnouncements 同時最多只打 2 個內頁', async () => {
	let inFlight = 0
	let maxInFlight = 0
	const fetchDetail = async ({ title }) => {
		inFlight++
		maxInFlight = Math.max(maxInFlight, inFlight)
		await new Promise((resolve) => setTimeout(resolve, 5))
		inFlight--
		return goodDetail(title)
	}

	const announcements = [974, 973, 972, 971, 970, 969, 968, 967].map(announcement)
	const result = await expandAnnouncements(announcements, new Map(), fetchDetail)

	assert.strictEqual(maxInFlight, 2)
	assert.deepStrictEqual(result.map(({ detail }) => detail.title), announcements.map(({ title }) => title))
})
