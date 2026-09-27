const axios = require('axios')
const cheerio = require('cheerio')
const fs = require('fs').promises
const path = require('path')
const {
	BASE_URL,
	axiosConfig,
	parseAnnouncementDate,
	fetchAnnouncements
} = require('./announcements')

// 學校主機又慢又不穩，內頁同時打太多會逾時。一次最多 2 個，失敗重試 1 次；
// 最壞情況（8 則全逾時）約 8 / 2 × 2 × 15 秒 = 2 分鐘，仍在 workflow 的時限內。
const DETAIL_CONCURRENCY = 2
const DETAIL_RETRIES = 1
const RETRY_DELAY_MS = 2_000

const normalizeText = (value) => value.replace(/\s+/g, ' ').trim()

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const emptyDetail = () => ({
	title: '',
	content: '',
	relatedUrl: '',
	attachments: []
})

const parseAnnouncementDetail = (html) => {
	const $ = cheerio.load(html)
	const detail = emptyDetail()

	$('table').each((_, table) => {
		const rows = $(table).find('tr')
		if (rows.length === 0) return

		const hasAnnouncementFields = rows.toArray().some((row) => {
			const label = normalizeText($(row).find('td').eq(0).text())
			return /公告主旨|公告內容|檔案\d+下載|相關網址/.test(label)
		})

		if (!hasAnnouncementFields) return

		rows.each((_, row) => {
			const tds = $(row).find('td')
			if (tds.length < 2) return

			const label = normalizeText($(tds).eq(0).text())
			const valueCell = $(tds).eq(1)
			const text = normalizeText(valueCell.text())

			if (label.includes('公告主旨')) {
				detail.title = text
				return
			}

			if (label.includes('公告內容')) {
				detail.content = text
				return
			}

			if (label.includes('相關網址')) {
				const linkEl = valueCell.find('a[href]').first()
				const href = linkEl.attr('href') || ''
				detail.relatedUrl = href ? (href.startsWith('http') ? href : new URL(href, BASE_URL).href) : text
				return
			}

			if (/^檔案\d+下載$/.test(label)) {
				const linkEl = valueCell.find('a[href]').first()
				const href = linkEl.attr('href') || ''
				if (!href) return

				detail.attachments.push({
					label,
					name: normalizeText(linkEl.text()) || text,
					url: href.startsWith('http') ? href : new URL(href, BASE_URL).href
				})
			}
		})
	})

	return detail
}

const fetchAnnouncementDetail = async (announcement) => {
	const response = await axios.get(announcement.detailUrl, axiosConfig)
	const detail = parseAnnouncementDetail(response.data)
	// 真正的公告一定有主旨；沒有就是錯誤頁（學校網站出錯時照樣回 200）
	if (!detail.title) throw new Error('內頁沒有公告主旨')
	return detail
}

const withRetry = async (fn, retries = DETAIL_RETRIES, delayMs = RETRY_DELAY_MS) => {
	for (let attempt = 0; ; attempt++) {
		try {
			return await fn()
		} catch (error) {
			if (attempt >= retries) throw error
			await sleep(delayMs)
		}
	}
}

const mapWithConcurrency = async (items, limit, fn) => {
	const results = new Array(items.length)
	let next = 0
	const worker = async () => {
		while (next < items.length) {
			const index = next++
			results[index] = await fn(items[index])
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
	return results
}

const fetchDetailWithRetry = (announcement) => withRetry(() => fetchAnnouncementDetail(announcement))

// 上次發布的 news.json，以 detailUrl 對應到成功抓到的 detail。
// 舊版會把抓失敗的結果（帶 error、內容空白）也發布出去，那些不能拿來沿用。
const loadPreviousDetails = async (filePath) => {
	const details = new Map()
	if (!filePath) return details

	try {
		const previous = JSON.parse(await fs.readFile(filePath, 'utf-8'))
		for (const item of Array.isArray(previous) ? previous : []) {
			if (item?.detailUrl && item.detail?.title && !item.detail.error) {
				details.set(item.detailUrl, item.detail)
			}
		}
	} catch (error) {
		console.warn(`⚠️  讀不到上次發布的公告（${error.message}），抓不到的內頁只能留空`)
	}

	return details
}

// 內頁抓不到時沿用上次的內容，否則已發布的內文與附件會被空白蓋掉，
// gh-pages 也會每小時在「有內容 / 沒內容」之間來回翻。
const expandAnnouncements = (announcements, previousDetails, fetchDetail = fetchDetailWithRetry) =>
	mapWithConcurrency(announcements, DETAIL_CONCURRENCY, async (announcement) => {
		try {
			return { ...announcement, detail: await fetchDetail(announcement) }
		} catch (error) {
			const previous = previousDetails.get(announcement.detailUrl)
			console.warn(`⚠️  抓取內頁失敗（${error.message}），${previous ? '沿用上次的內容' : '留空'}：${announcement.detailUrl}`)
			return { ...announcement, detail: previous || emptyDetail() }
		}
	})

const writeNewsList = async (announcements) => {
	const outDir = path.join(__dirname, '..', 'data', 'menu')
	const outPath = path.join(outDir, 'news.json')

	await fs.mkdir(outDir, { recursive: true })
	await fs.writeFile(outPath, JSON.stringify(announcements, null, 2), 'utf-8')
	console.log(`已寫入 ${outPath}`)
}

const processAnnouncement = async (previousPath) => {
	const [announcements, previousDetails] = await Promise.all([
		fetchAnnouncements(),
		loadPreviousDetails(previousPath)
	])
	const sorted = [...announcements].sort((a, b) => {
		const aDate = parseAnnouncementDate(a.startDate)
		const bDate = parseAnnouncementDate(b.startDate)
		return (bDate ? bDate.getTime() : 0) - (aDate ? aDate.getTime() : 0)
	})
	const expanded = await expandAnnouncements(sorted, previousDetails)

	await writeNewsList(expanded)
	return expanded
}

// 用法：node crawler/news.js [上次發布的 news.json]
if (require.main === module) {
	processAnnouncement(process.argv[2]).catch((err) => {
		console.error(err)
		process.exitCode = 1
	})
}

module.exports = {
	parseAnnouncementDetail,
	fetchAnnouncementDetail,
	withRetry,
	loadPreviousDetails,
	expandAnnouncements
}
