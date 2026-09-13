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

const normalizeText = (value) => value.replace(/\s+/g, ' ').trim()

const parseAnnouncementDetail = (html) => {
	const $ = cheerio.load(html)
	const detail = {
		title: '',
		content: '',
		relatedUrl: '',
		attachments: []
	}

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
	try {
		const response = await axios.get(announcement.detailUrl, axiosConfig)
		return parseAnnouncementDetail(response.data)
	} catch (error) {
		return {
			title: '',
			content: '',
			relatedUrl: '',
			attachments: [],
			error: error.message
		}
	}
}

const writeNewsList = async (announcements) => {
	const outDir = path.join(__dirname, '..', 'data', 'menu')
	const outPath = path.join(outDir, 'news.json')

	await fs.mkdir(outDir, { recursive: true })
	await fs.writeFile(outPath, JSON.stringify(announcements, null, 2), 'utf-8')
	console.log(`已寫入 ${outPath}`)
}

const processAnnouncement = async () => {
	const announcements = await fetchAnnouncements()
	const sorted = [...announcements].sort((a, b) => {
		const aDate = parseAnnouncementDate(a.startDate)
		const bDate = parseAnnouncementDate(b.startDate)
		return (bDate ? bDate.getTime() : 0) - (aDate ? aDate.getTime() : 0)
	})
	const expanded = await Promise.all(
		sorted.map(async (announcement) => ({
			...announcement,
			detail: await fetchAnnouncementDetail(announcement)
		}))
	)

	await writeNewsList(expanded)
	return expanded
}

if (require.main === module) {
	processAnnouncement().catch((err) => {
		console.error(err)
		process.exitCode = 1
	})
}

module.exports = { parseAnnouncementDetail }
