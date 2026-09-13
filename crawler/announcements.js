const axios = require('axios')
const cheerio = require('cheerio')

const BASE_URL = 'http://elder.mcut.edu.tw/website1/'
const INDEX_URL = BASE_URL + 'index.aspx'
const REQUEST_TIMEOUT_MS = 15_000

const headers = {
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
}

const axiosConfig = { headers, timeout: REQUEST_TIMEOUT_MS }

// 公告日期可能是民國年（114/09/11）或西元年（2026/09/11）
const parseAnnouncementDate = (dateStr) => {
	if (!dateStr) return null

	const match = dateStr.match(/(\d{3,4})[/.-](\d{1,2})[/.-](\d{1,2})/)
	if (!match) return null

	let year = parseInt(match[1], 10)
	const month = parseInt(match[2], 10)
	const day = parseInt(match[3], 10)

	if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null

	if (year < 1000) {
		year += 1911
	}

	return new Date(year, month - 1, day)
}

// 只看 startDate（公告張貼日）。endDate 是網站的顯示截止日，動輒好幾個月後，
// 無法用來判斷相關性。窗口的兩邊代價不對稱：太寬只是重複處理舊公告（內容相同 →
// 不會產生 diff → 不會開 PR），太窄則會讓菜單永久漏掉，所以寧可寬一點。
const isAnnouncementWithinDays = (dateStr, days = 7) => {
	const date = parseAnnouncementDate(dateStr)
	if (!date) return true

	const now = new Date()
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
	const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())

	const diffMs = Math.abs(startOfToday - target)
	const limitMs = days * 24 * 60 * 60 * 1000

	return diffMs <= limitMs
}

const parseAnnouncementTable = (html) => {
	const $ = cheerio.load(html)
	const announcements = []

	$('table').each((_, table) => {
		const rows = $(table).find('tr')
		if (rows.length < 2) return

		const firstRowText = $(rows).eq(0).text()
		if (!firstRowText.includes('公告主旨')) return

		rows.each((index, element) => {
			if (index === 0) return

			const tds = $(element).find('td')
			if (tds.length < 3) return

			const title = $(tds).eq(0).text().trim()
			const startDate = $(tds).eq(1).text().trim()
			const endDate = $(tds).eq(2).text().trim()

			if (!title || /^[\d\s]+$/.test(title)) return

			const linkEl = $(tds).eq(3).find('a[href*="index_post.aspx"]').first()
			const href = linkEl.attr('href') || ''
			const detailUrl = href.startsWith('http')
				? href
				: new URL(href, INDEX_URL).href

			announcements.push({
				title,
				startDate,
				endDate,
				detailUrl
			})
		})
	})

	return announcements
}

const fetchAnnouncements = async () => {
	try {
		const response = await axios.get(INDEX_URL, axiosConfig)
		return parseAnnouncementTable(response.data)
	} catch (error) {
		console.error('❌ 抓取公告失敗:', error.message)
		throw error
	}
}

module.exports = {
	BASE_URL,
	INDEX_URL,
	REQUEST_TIMEOUT_MS,
	headers,
	axiosConfig,
	parseAnnouncementDate,
	isAnnouncementWithinDays,
	parseAnnouncementTable,
	fetchAnnouncements
}
