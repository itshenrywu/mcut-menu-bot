const axios = require('axios')
const cheerio = require('cheerio')
const { PDFParse } = require('pdf-parse')
const fs = require('fs').promises
const path = require('path')
const {
	BASE_URL,
	axiosConfig,
	isAnnouncementWithinDays,
	fetchAnnouncements
} = require('./announcements')

const RECENT_ONLY = process.argv.includes('recent-only')
const RECENT_DAYS = 7

const parseAnnouncementDetailAttachments = (html) => {
	const $ = cheerio.load(html)
	const attachments = []

	$('table tr').each((_, row) => {
		const tds = $(row).find('td')
		if (tds.length < 2) return

		const label = $(tds).eq(0).text().trim()
		const linkEl = $(tds).eq(1).find('a[href]').first()

		if (!label.startsWith('檔案') || !label.includes('下載')) return

		const href = linkEl.attr('href')
		if (!href || !href.trim()) return

		const url = href.startsWith('http') ? href : new URL(href, BASE_URL).href
		const name = linkEl.text().trim() || label
		attachments.push({ label, name, url })
	})

	return attachments
}

const extractPdfWithTables = async (buffer) => {
	let parser
	try {
		parser = new PDFParse({ data: buffer })
		const result = await parser.getTable()

		const tables = []
		let fullText = ''

		for (const page of result.pages || []) {
			for (const table of page.tables || []) {
				const rows = Array.isArray(table) ? table : (table.rows || [])
				tables.push(rows)

				for (const row of rows) {
					const cells = Array.isArray(row) ? row : Object.values(row)
					fullText += cells.join(' ') + '\n'
				}
			}
		}

		await parser.destroy()
		parser = null

		if (tables.length > 0) {
			const flatRows = tables.flatMap((t) => (Array.isArray(t) ? t : []))
			const menuByDates = parseMenuByDates(flatRows)
			return {
				text: fullText.trim(),
				tables,
				rows: flatRows,
				menuByDates,
				numPages: result.pages?.length || 0
			}
		}

		const positioned = await extractPdfToPositionedArray(buffer)
		const menuByDates = parseMenuByDates(positioned.rows)
		return {
			text: positioned.text,
			tables: [],
			rows: positioned.rows,
			menuByDates,
			numPages: positioned.numPages
		}
	} finally {
		if (parser) await parser.destroy()
	}
}

const itemsToPositionedArray = (items, options = {}) => {
	const { yTolerance = 8, xGapThreshold = 60 } = options

	if (items.length === 0) return []

	const withCoords = items.map((item) => ({
		str: item.str,
		x: item.x,
		y: item.y
	}))

	const sorted = [...withCoords].sort((a, b) => b.y - a.y || a.x - b.x)

	const rows = []
	let currentRow = { y: sorted[0].y, items: [sorted[0]] }

	for (let i = 1; i < sorted.length; i++) {
		const item = sorted[i]
		if (Math.abs(item.y - currentRow.y) <= yTolerance) {
			currentRow.items.push(item)
		} else {
			rows.push(currentRow.items)
			currentRow = { y: item.y, items: [item] }
		}
	}
	rows.push(currentRow.items)

	return rows.map((rowItems) => {
		const sortedX = [...rowItems].sort((a, b) => a.x - b.x)
		const cells = []
		let cellStr = sortedX[0].str
		let lastX = sortedX[0].x

		for (let i = 1; i < sortedX.length; i++) {
			const item = sortedX[i]
			if (item.x - lastX > xGapThreshold) {
				cells.push(cellStr.trim())
				cellStr = item.str
			} else {
				cellStr += item.str
			}
			lastX = item.x
		}
		cells.push(cellStr.trim())
		return cells.filter(Boolean)
	})
}

const extractPdfToPositionedArray = async (buffer) => {
	const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
	const { getDocument } = pdfjs.default ?? pdfjs

	if (typeof getDocument !== 'function') {
		throw new Error('pdfjs-dist getDocument not found')
	}

	const uint8 = buffer instanceof Buffer ? new Uint8Array(buffer) : buffer
	const loadingTask = getDocument({ data: uint8 })
	const doc = await loadingTask.promise
	const numPages = doc.numPages
	const allItems = []

	for (let p = 1; p <= numPages; p++) {
		const page = await doc.getPage(p)
		const textContent = await page.getTextContent({
			normalizeWhitespace: false,
			disableCombineTextItems: false
		})

		for (const item of textContent.items) {
			if (item.str != null) {
				allItems.push({
					str: item.str,
					x: item.transform[4],
					y: item.transform[5],
					page: p
				})
			}
		}
	}

	doc.destroy()

	const rows = itemsToPositionedArray(allItems)
	const text = rows.map((r) => r.join(' ')).join('\n')

	return { text, rows, numPages }
}

const DATE_ROW_REG = /^(\d+)月(\d+)日$/

const toSlashDate = (dateStr) => { // 年份都當作今年，但如果在 12 月時查到公告寫 1 月，當作明年
	const match = dateStr.match(DATE_ROW_REG)
	if (!match) return null
	const month = parseInt(match[1], 10)
	const day = parseInt(match[2], 10)

	const now = new Date()
	const currentMonth = now.getMonth() + 1
	const currentYear = now.getFullYear()

	const year =
		currentMonth === 12 && month === 1 ? currentYear + 1 : currentYear

	return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
}

const parseMenuByDates = (rows) => {
	const dateIndices = []
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]
		if (row.length === 1 && DATE_ROW_REG.test(row[0].trim())) {
			dateIndices.push({ i, dateStr: row[0].trim() })
		}
	}

	const result = []
	for (const { i, dateStr } of dateIndices) {
		const before = rows[i - 1]
		const after = rows[i + 1]

		const foods = []
		if (before && before.length >= 2) {
			foods.push([before[0], before[1]])
		}
		if (after && after.length >= 2) {
			foods.push([after[0], after[1]])
		}

		const date = toSlashDate(dateStr)

		const menu1 = foods.map((f) => f[0]).filter(Boolean)
		const menu2 = foods.map((f) => f[1]).filter(Boolean)

		// LINE Flex 的 text 元件不接受空字串，沒有餐點就給空陣列
		const toRows = (items) => {
			const foodsText = items.join('、').replace(/\//g, '、').trim()
			return foodsText ? [{ type: '主食', foods: foodsText }] : []
		}

		const menu = {
			menu_1: toRows(menu1),
			menu_2: toRows(menu2)
		}

		result.push({ dateStr, date, foods, menu })
	}
	return result
}

const readAttachmentContent = async (url, name) => {
	try {
		const response = await axios.get(url, {
			...axiosConfig,
			responseType: 'arraybuffer'
		})
		const buffer = Buffer.from(response.data)
		const urlPath = new URL(url).pathname
		const ext = (urlPath.split('.').pop() || name.split('.').pop() || '').toLowerCase()

		if (ext === 'pdf') {
			const data = await extractPdfWithTables(buffer)
			return {
				url,
				name,
				text: data.text,
				tables: data.tables,
				rows: data.rows,
				menuByDates: data.menuByDates,
				numPages: data.numPages
			}
		}

		return { url, name, text: '(非 PDF，請手動查看)', rawSize: buffer.length }
	} catch (error) {
		return { url, name, text: null, error: error.message }
	}
}

// shouldProcess 在下載詳細頁與 PDF 之前先篩掉不需要的公告：
// 判斷用的 startDate/endDate 索引頁就有，不必下載就能決定。
// 這樣既不會為了用不到的公告解析 PDF，也不會因為某則舊公告逾時就讓整批 Promise.all 失敗。
const fetchNightSnackAnnouncements = async (keyword = '夜點供應', shouldProcess = () => true) => {
	const all = await fetchAnnouncements()
	const matched = all.filter((a) => a.title.includes(keyword))
	const targets = matched.filter(shouldProcess)

	console.log(`標題含「${keyword}」的公告 ${matched.length} 則，需要處理 ${targets.length} 則`)

	const results = await Promise.all(
		targets.map(async (ann) => {
			const detailRes = await axios.get(ann.detailUrl, axiosConfig)
			const attachments = parseAnnouncementDetailAttachments(detailRes.data)

			const attachmentContents = await Promise.all(
				attachments.map((att) => readAttachmentContent(att.url, att.name))
			)

			return {
				announcement: ann,
				attachments: attachmentContents
			}
		})
	)

	return results
}

const processAnnouncement = async () => {
	const results = await fetchNightSnackAnnouncements('夜點供應', (ann) =>
		!RECENT_ONLY || isAnnouncementWithinDays(ann.startDate || ann.endDate, RECENT_DAYS)
	)

	if (RECENT_ONLY && results.length === 0) {
		console.log(`沒有 ${RECENT_DAYS} 天內的夜點供應公告`)
		return []
	}

	const pdfUrls = []

	for (const { attachments } of results) {
		for (const att of attachments) {
			if (att.error || !att.menuByDates) continue
			if (att.url) pdfUrls.push(att.url)

			for (const { date, menu } of att.menuByDates) {
				if (!date) continue
				if (menu.menu_1.length === 0 && menu.menu_2.length === 0) {
					console.log(`⚠️  ${date} 兩間餐廳都沒有解析到餐點，略過不寫檔`)
					continue
				}
				console.log(date)
				const [y, m, d] = date.split('/')
				const dir = path.join(__dirname, '..', 'data', 'menu', y, m, d)
				await fs.mkdir(dir, { recursive: true })
				const filePath = path.join(dir, '4.json')
				await fs.writeFile(filePath, JSON.stringify(menu))
			}
		}
	}

	const outPath = process.env.GITHUB_OUTPUT
	if (outPath && pdfUrls.length > 0) {
		const unique = [...new Set(pdfUrls)]
		const body = ['## PDF 公告來源', ...unique.map((u) => `- ${u}`)].join('\n')
		await fs.appendFile(outPath, `body<<PRBODY\n${body}\nPRBODY\n`, 'utf-8')
	}

	return results
}

if (require.main === module) {
	processAnnouncement().catch((err) => {
		console.error(err)
		process.exitCode = 1
	})
}

module.exports = {
	fetchNightSnackAnnouncements,
	parseAnnouncementDetailAttachments,
	itemsToPositionedArray,
	toSlashDate,
	parseMenuByDates
}
