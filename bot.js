require('dotenv').config({ quiet: true })
const line = require('@line/bot-sdk')
const express = require('express')
const rateLimit = require('express-rate-limit')
const config = { channelSecret: process.env.CHANNEL_SECRET }
const client = new line.messagingApi.MessagingApiClient({ channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN })
const app = express()
app.set('trust proxy', 1)
const path = require('path')
const fs = require('fs')
const fsPromises = require('fs/promises')
const { createCanvas, loadImage, registerFont } = require('canvas')

const ONE_DAY = 86400000
const ONE_HOUR = 3600000
const ONE_MINUTE = 60000

const API_BASE = process.env.MENU_API_BASE || 'https://mcut-menu-api.henrywu.tw'
const DATA_DIR = path.join(__dirname, 'data')
const MENU_DIR = path.join(DATA_DIR, 'menu')
const SETTING_DIR = path.join(DATA_DIR, 'setting')
const FONT_PATH = path.join(__dirname, 'fonts', 'NotoSansTC-Regular.ttf')
const MULTI_SIZE_IMAGE_DIR = path.join(__dirname, 'public', 'multi_size_image')
const IMAGE_DIR = path.join(__dirname, 'public', 'image')

const REQUIRED_ENV = ['CHANNEL_SECRET', 'CHANNEL_ACCESS_TOKEN', 'URL']
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key])
if (missingEnv.length > 0) {
	console.error(`❌ 缺少必要的環境變數：${missingEnv.join(', ')}`)
	process.exit(1)
}
try {
	new URL(process.env.URL)
} catch (e) {
	console.error(`❌ 環境變數 URL 不是合法的網址：${process.env.URL}`)
	process.exit(1)
}

const getColors = (isDark) => ({
	PRIMARY: '#3498db',
	TITLE: isDark ? '#e8ecef' : '#2c3e50',
	SUBTITLE: isDark ? '#b1bbc5' : '#34495e',
	GRAY: isDark ? '#9aacb8' : '#7f8c8d',
	RED: '#e74c3c',
	RADIO_BG: isDark ? '#2c3e50' : '#ecf0f1',
	RADIO_UNSELECTED: isDark ? '#ffffff55' : '#ffffff',
	BG: isDark ? '#1c2026' : null,
})

const meals = {
	1: {
		name: '早餐',
		title: '早餐',
		open_time: '06:30 ~ 09:00' 
	},
	2: {
		name: '午餐',
		title: '午餐',
		open_time: '11:00 ~ 13:00'
	},
	3: {
		name: '晚餐',
		title: '晚餐',
		open_time: '16:30 ~ 18:30'
	},
	4: {
		name: '宵夜',
		title: '\n段考週免費宵夜',
		open_time: '20:00'
	},
}

const restaurants = [
	{
		id: 1,
		name: '第一餐廳',
		location: '一、二宿中間 2F',
	},
	{
		id: 2,
		name: '第二餐廳',
		location: '圖資大樓 B1、B2',
	}
]

const welcome_message = {
	type: 'text',
	text: '請選擇要查詢的菜單',
}

const setting_options_display_type = [
	{
		label: '橫式',
		value: 'horizontal'
	},
	{
		label: '直式',
		value: 'vertical'
	}
]

const setting_options_display_order = [
	{
		label: '第一餐廳 → 第二餐廳',
		value: '1_2'
	},
	{
		label: '第二餐廳 → 第一餐廳',
		value: '2_1'
	}
]

const setting_options_dark_mode = [
	{
		label: '淺色模式',
		value: 'off'
	},
	{
		label: '深色模式',
		value: 'on'
	}
]

const toShortDate = (str) => {
	if(!/^\d+$/.test(str)) return null
	if(str?.length === 8) {
		str = str.slice(-4)
	}
	if(str?.length !== 4) return null
	return `${parseInt(str.slice(0, 2))}/${parseInt(str.slice(2, 4))}`
}

registerFont(FONT_PATH, { family: 'NotoSansTC' })

// 底圖只有 8 張，而 LINE 每張 imagemap 會抓多個尺寸，快取 Promise 避免每次請求都讀磁碟
const baseImageCache = new Map()
const loadBaseImage = (baseName) => {
	if (!baseImageCache.has(baseName)) {
		baseImageCache.set(baseName, loadImage(path.join(MULTI_SIZE_IMAGE_DIR, `${baseName}.png`)))
	}
	return baseImageCache.get(baseName)
}

fs.readdirSync(MULTI_SIZE_IMAGE_DIR).forEach(file => {
	const baseName = file.split('.')[0]
	const isDarkImage = baseName.includes('_dark')
	app.get([
		`/image/${baseName}/:size`,
		`/image/${baseName}/:prev/:next/:size`
	], async (req, res) => {
		// express 5 改用 path-to-regexp v8，不再支援 :size(\d+) 這種參數內嵌正則，
		// 改在這裡驗證，維持非數字尺寸回 404 的行為
		if (!/^\d+$/.test(req.params.size)) {
			return res.status(404).end()
		}

		const prev = '« ' + (toShortDate(req.params.prev) || '前一天')
		const next = (toShortDate(req.params.next) || '後一天') + ' »'
		const baseImage = await loadBaseImage(baseName)
		const canvas = createCanvas(baseImage.width, baseImage.height)
		const ctx = canvas.getContext('2d')
		ctx.drawImage(baseImage, 0, 0)

		ctx.font = '38px NotoSansTC'
		ctx.fillStyle = isDarkImage ? '#f5f6f6' : '#34495e'
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'
		ctx.fillText(prev, 248, 135)
		if(baseName.includes('no_next')) {
			ctx.fillStyle = isDarkImage ? '#505560' : '#838c95'
		}
		ctx.fillText(next, 792, 135)
		res.setHeader('Content-Type', 'image/png')
		canvas.createPNGStream().pipe(res)
	})
})

fs.readdirSync(IMAGE_DIR).forEach(file => {
	app.get(`/image/${file}`, (req, res) => { res.sendFile(path.join(IMAGE_DIR, file)) })
})

const webhookLimiter = rateLimit({
	windowMs: 60000,
	max: 100,
	standardHeaders: true,
	legacyHeaders: false
})

app.post('/webhook', webhookLimiter, line.middleware(config), (req, res) => {
	Promise
		.all(req.body.events.map(handleEvent))
		.then((result) => res.json(result))
		.catch((err) => {
			console.error(err)
			res.status(500).end()
		})
})

const toYYYYMMDD = (date) => {
	return `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`
}

const toSlashFormat = (input) => {
	if (input instanceof Date) {
		return `${input.getFullYear()}/${(input.getMonth() + 1).toString().padStart(2, '0')}/${input.getDate().toString().padStart(2, '0')}`
	}
	return `${String(input).slice(0, 4)}/${String(input).slice(4, 6)}/${String(input).slice(6, 8)}`
}

const getRestaurantMenuFlex = (menu, date, mealId, restaurant, colors) => {
	// 人工修改過的菜單可能少掉某一邊的 key，缺少時當作沒有菜單而不是整則回覆失敗
	const rows = Array.isArray(menu?.[`menu_${restaurant.id}`]) ? menu[`menu_${restaurant.id}`] : []
	return {
		type: 'bubble',
		...(colors.BG ? { styles: { body: { backgroundColor: colors.BG } } } : {}),
		body: {
			type: 'box',
			layout: 'vertical',
			justifyContent: 'space-between',
			contents: [
				{
					type: 'box',
					layout: 'vertical',
					contents: [
						{
							type: 'text',
							text: `${restaurant.name} ${date.getFullYear() === new Date().getFullYear() ? '' : `${date.getFullYear().toString().slice(2, 4)}/`}${date.getMonth()+1}/${date.getDate()} (${['日','一','二','三','四','五','六'][date.getDay()]}) ${meals[mealId].title}`,
							weight: 'bold',
							align: 'center',
							color: colors.TITLE,
							wrap: true
						},
						{
							type: 'text',
							text: `${restaurant.location}・${meals[mealId].open_time} 供應`,
							align: 'center',
							color: colors.GRAY,
							size: 'xxs',
							margin: 'sm'
						},
					]
				},
				{
					type: 'box',
					layout: 'vertical',
					margin: 'lg',
					spacing: 'md',
					contents:
						rows.length > 0 ?
							rows.map((row) => (
								{
									type: 'box',
									layout: 'vertical',
									contents: [
										(row.type && rows.length > 1) ? {
											type: 'text',
											text: row.type,
											size: 'sm',
											color: colors.SUBTITLE
										} : null,
										{
											type: 'text',
											text: row.foods,
											wrap: true,
											size: 'xs',
											color: colors.TITLE
										}
									].filter(Boolean)
								}
							)) :
							[
								{
									type: 'box',
									height: '60px',
									justifyContent: 'center',
									layout: 'vertical',
									contents: [
										{
											type: 'text',
											text: Number(mealId) === 4 ? '今日未提供段考週免費宵夜' : '廠商尚未上傳菜單',
											size: 'sm',
											color: colors.RED,
											align: 'center'
										}
									]
								}
							]
				},
				{
					type: 'text',
					text: '菜單僅供參考，實際供應內容以現場為準。',
					color: colors.GRAY,
					size: 'xxs',
					margin: 'xl',
					wrap: true
				}
			]
		}
	}
}

const getUserSettingFlex = (user_setting) => {
	const isDark = user_setting.dark_mode === 'on'
	const colors = getColors(isDark)

	const makeRadioRow = (options, currentValue, postbackKey) => ({
		type: 'box',
		layout: 'vertical',
		spacing: 'md',
		contents: options.map(option => ({
			type: 'box',
			layout: 'horizontal',
			action: {
				type: 'postback',
				label: '偏好設定',
				data: postbackKey + '=' + option.value
			},
			alignItems: 'center',
			spacing: 'md',
			contents: [
				{
					type: 'box',
					layout: 'vertical',
					contents: [
						{
							type: 'box',
							layout: 'vertical',
							contents: [],
							width: '8px',
							height: '8px',
							backgroundColor: currentValue === option.value ? colors.PRIMARY : colors.RADIO_UNSELECTED,
							cornerRadius: '8px'
						}
					],
					width: '16px',
					height: '16px',
					backgroundColor: colors.RADIO_BG,
					cornerRadius: '16px',
					justifyContent: 'center',
					alignItems: 'center'
				},
				{
					type: 'text',
					text: option.label,
					size: 'xs',
					color: colors.TITLE
				}
			]
		}))
	})

	return {
		type: 'flex',
		altText: '偏好設定',
		contents: {
			type: 'bubble',
			...(colors.BG ? { styles: { body: { backgroundColor: colors.BG } } } : {}),
			body: {
				type: 'box',
				layout: 'vertical',
				spacing: 'xxl',
				contents: [
					{
						type: 'text',
						text: '偏好設定',
						weight: 'bold',
						align: 'center',
						color: colors.TITLE
					},
					{
						type: 'box',
						layout: 'vertical',
						spacing: 'sm',
						contents: [
							{
								type: 'text',
								text: '顯示方式',
								size: 'sm',
								color: colors.SUBTITLE
							},
							{
								type: 'box',
								layout: 'horizontal',
								spacing: 'md',
								contents: setting_options_display_type.map(option => ({
									type: 'box',
									layout: 'vertical',
									action: {
										type: 'postback',
										label: '偏好設定',
										data: 'display_type=' + option.value
									},
									flex: 1,
									spacing: 'sm',
									contents: [
										{
											type: 'image',
											url: `${process.env.URL}/image/display_type_${option.value}.png?v=3`,
											size: 'full',
											aspectRatio: '1:1'
										},
										{
											type: 'box',
											layout: 'horizontal',
											alignItems: 'center',
											spacing: 'md',
											contents: [
												{
													type: 'box',
													layout: 'vertical',
													contents: [
														{
															type: 'box',
															layout: 'vertical',
															contents: [],
															width: '8px',
															height: '8px',
															backgroundColor: user_setting.display_type === option.value ? colors.PRIMARY : colors.RADIO_UNSELECTED,
															cornerRadius: '8px'
														}
													],
													width: '16px',
													height: '16px',
													backgroundColor: colors.RADIO_BG,
													cornerRadius: '16px',
													justifyContent: 'center',
													alignItems: 'center'
												},
												{
													type: 'text',
													text: option.label,
													size: 'xs',
													color: colors.TITLE
												}
											]
										}
									]
								}))
							}
						]
					},
					{
						type: 'box',
						layout: 'vertical',
						spacing: 'sm',
						contents: [
							{
								type: 'text',
								text: '餐廳順序',
								size: 'sm',
								color: colors.SUBTITLE
							},
							makeRadioRow(setting_options_display_order, user_setting.display_order, 'display_order')
						]
					},
					{
						type: 'box',
						layout: 'vertical',
						spacing: 'sm',
						contents: [
							{
								type: 'text',
								text: '主題',
								size: 'sm',
								color: colors.SUBTITLE
							},
							makeRadioRow(setting_options_dark_mode, user_setting.dark_mode, 'dark_mode')
						]
					}
				]
			}
		}
	}
}

const workingDaysCache = {}

const fetchWorkingDaysFromAPI = async (year) => {
	const url = `${API_BASE}/${year}/working-day.json`
	const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
	if (!res.ok) throw new Error(`Failed to fetch working days: ${res.status}`)
	const data = await res.json()
	if (!Array.isArray(data)) throw new Error('Invalid working days format')
	return data
}

const getWorkingDaysForYear = async (year) => {
	const today = toYYYYMMDD(new Date())
	const cached = workingDaysCache[year]
	if (cached && cached.fetchedDate === today) {
		return cached.list
	}
	const list = await fetchWorkingDaysFromAPI(year)
	workingDaysCache[year] = { list, fetchedDate: today }
	return list
}

const getWorkingDaysForYearOrEmpty = async (year) => {
	try {
		return await getWorkingDaysForYear(year)
	} catch (e) {
		console.error(e)
		return []
	}
}

const getAdjacentWorkingDays = async (date) => {
	const compactDate = toYYYYMMDD(date)
	const year = date.getFullYear()

	let workingDays
	try {
		workingDays = [...await getWorkingDaysForYear(year)].sort()
	} catch (e) {
		console.error(e)
		// 查不到上班日時退回單純的前後一天，key 必須與呼叫端解構的名稱一致
		return {
			next_day: toSlashFormat(new Date(date.getTime() + ONE_DAY)),
			prev_day: toSlashFormat(new Date(date.getTime() - ONE_DAY))
		}
	}

	let nextStr = workingDays.find((d) => d > compactDate)
	let prevStr = [...workingDays].reverse().find((d) => d < compactDate)

	// 跨年連假可能長到當年度找不到相鄰上班日，這時才去載相鄰年份
	if (!nextStr) {
		nextStr = [...await getWorkingDaysForYearOrEmpty(year + 1)].sort().find((d) => d > compactDate)
	}
	if (!prevStr) {
		prevStr = [...await getWorkingDaysForYearOrEmpty(year - 1)].sort().reverse().find((d) => d < compactDate)
	}

	return {
		next_day: nextStr ? toSlashFormat(nextStr) : null,
		prev_day: prevStr ? toSlashFormat(prevStr) : null
	}
}

const getCurrentMealId = () => {
	const time = new Date().getHours() * 100 + new Date().getMinutes()
	if (time < 900) return 1
	if (time < 1300) return 2
	return 3
}

const buildMenuNavImagemap = (date, mealId, prev_day, next_day, has_snack, is_today, isDark = false) => {
	let menu_image_url = 'menu'
	if (has_snack) menu_image_url += '_snack'
	if ((date.getTime() - new Date().getTime()) > 7 * ONE_DAY) menu_image_url += '_no_next'
	if (isDark) menu_image_url += '_dark'
	const imagemapBaseUrl = new URL(
		`image/${menu_image_url}/${prev_day?.replace(/\//g, '') || '0'}/${next_day?.replace(/\//g, '') || '0'}`,
		process.env.URL
	)
	return {
		type: 'imagemap',
		baseUrl: imagemapBaseUrl.toString(),
		altText: `${date.getMonth()+1}/${date.getDate()} (${['日','一','二','三','四','五','六'][date.getDay()]}) ${meals[mealId].title}菜單`,
		baseSize: {
			width: 1040,
			height: 180
		},
		actions: [
			{
				type: 'message',
				text: `${is_today ? '' : `${toSlashFormat(date)} `}早餐`,
				area: { x: has_snack ? 44 : 173, y: 0, width: 179, height: 70 }
			},
			{
				type: 'message',
				text: `${is_today ? '' : `${toSlashFormat(date)} `}午餐`,
				area: { x: has_snack ? 302 : 432, y: 0, width: 179, height: 70 }
			},
			{
				type: 'message',
				text: `${is_today ? '' : `${toSlashFormat(date)} `}晚餐`,
				area: { x: has_snack ? 561 : 688, y: 0, width: 179, height: 70 }
			},
			has_snack ? {
				type: 'message',
				text: `${is_today ? '' : `${toSlashFormat(date)} `}宵夜`,
				area: { x: 821, y: 0, width: 179, height: 70 }
			} : null,
			{
				type: 'message',
				text: prev_day ? `${prev_day} ${meals[mealId].name}` : meals[mealId].name,
				area: { x: 127, y: 102, width: 225, height: 70 }
			},
			{
				type: 'message',
				text: meals[mealId].name,
				area: { x: 426, y: 102, width: 187, height: 70 }
			},
			!menu_image_url.includes('no_next') ? {
				type: 'message',
				text: next_day ? `${next_day} ${meals[mealId].name}` : meals[mealId].name,
				area: { x: 682, y: 102, width: 225, height: 70 }
			} : null,
		].filter(Boolean)
	}
}

// 本機 data/ 只有查詢過的菜單（爬蟲都在 GitHub Actions 執行），
// 所以本機找不到 4.json 時要再向 API 確認一次，並把結果快取起來避免每則訊息都打 API
const snackAvailabilityCache = new Map()
const SNACK_HIT_TTL = ONE_HOUR
const SNACK_MISS_TTL = 10 * ONE_MINUTE

const rememberSnackAvailability = (dateStr, hasSnack) => {
	if (snackAvailabilityCache.size > 200) {
		const now = Date.now()
		for (const [key, value] of snackAvailabilityCache) {
			if (value.expiresAt <= now) snackAvailabilityCache.delete(key)
		}
	}
	snackAvailabilityCache.set(dateStr, {
		hasSnack,
		expiresAt: Date.now() + (hasSnack ? SNACK_HIT_TTL : SNACK_MISS_TTL)
	})
}

const hasSnackMenu = async (date) => {
	const dateStr = toSlashFormat(date)
	try {
		await fsPromises.access(path.join(MENU_DIR, dateStr, '4.json'))
		return true
	} catch (e) {
		if (e.code !== 'ENOENT') throw e
	}

	const cached = snackAvailabilityCache.get(dateStr)
	if (cached && cached.expiresAt > Date.now()) return cached.hasSnack

	let hasSnack = false
	try {
		const res = await fetch(`${API_BASE}/${dateStr}/4.json`, { signal: AbortSignal.timeout(3000) })
		hasSnack = res.ok
	} catch (e) {
		console.error('hasSnackMenu error', e.message || e)
	}
	rememberSnackAvailability(dateStr, hasSnack)
	return hasSnack
}

const showLoading = async (userId) => {
	try {
		await client.showLoadingAnimation({
			chatId: userId,
			loadingSeconds: 5
		})
	} catch (e) {
		// 使用者沒有加 bot 好友（例如群組聊天）時 LINE 會回 400，不該讓真正的回覆消失
		console.error('showLoadingAnimation error', e.message || e)
	}
}

const getDefaultNavImagemap = async (isDark = false) => {
	const date = new Date()
	const mealId = getCurrentMealId()
	const has_snack = await hasSnackMenu(date)
	const { prev_day, next_day } = await getAdjacentWorkingDays(date)
	return buildMenuNavImagemap(date, mealId, prev_day, next_day, has_snack, true, isDark)
}

const getMenuFromFile = async (date, mealId) => {
	const menu_path = path.join(MENU_DIR, toSlashFormat(date), `${mealId}.json`)
	try {
		const stat = await fsPromises.stat(menu_path)
		if ((new Date().getTime() - stat.mtime.getTime()) < ONE_HOUR) {
			const content = await fsPromises.readFile(menu_path, 'utf8')
			return JSON.parse(content)
		}
	} catch (e) {
		if (e.code !== 'ENOENT' && e.name !== 'SyntaxError') throw e
	}
	return false
}

const getMenuFromAPI = async (date, mealId) => {
	const dateStr = toSlashFormat(date)
	const menu_path = path.join(MENU_DIR, dateStr, `${mealId}.json`)
	try {
		const res = await fetch(`${API_BASE}/${dateStr}/${mealId}.json`, {
			signal: AbortSignal.timeout(5000)
		})
		if (res.ok) {
			const menu = await res.json()
			await fsPromises.mkdir(path.dirname(menu_path), { recursive: true })
			await fsPromises.writeFile(menu_path, JSON.stringify(menu))
			return menu
		}
	} catch (e) {
		console.error('getMenuFromAPI error', e.message || e)
	}
	return {
		menu_1: [],
		menu_2: [],
	}
}

const fetchNewsFromAPI = async () => {
	try {
		const res = await fetch(`${API_BASE}/news.json`, { signal: AbortSignal.timeout(5000) })
		if (res.ok) {
			const data = await res.json()
			if (Array.isArray(data)) return data
		}
	} catch (e) {
		console.error('fetchNewsFromAPI error', e)
	}
	return []
}

const getFileExtension = (url) => {
	try {
		const pathname = decodeURIComponent(new URL(url).pathname)
		const base = pathname.split('/').pop() || ''
		const idx = base.lastIndexOf('.')
		if (idx > 0 && idx < base.length - 1) return base.slice(idx + 1).toLowerCase()
	} catch (e) {
		const match = /\.([a-zA-Z0-9]+)(?:[?#].*)?$/.exec(url)
		if (match) return match[1].toLowerCase()
	}
	return ''
}

const fileIcons = {
	pdf: '\u{1F4D5}',
	doc: '\u{1F4D8}', docx: '\u{1F4D8}', odt: '\u{1F4D8}',
	xls: '\u{1F4D7}', xlsx: '\u{1F4D7}', csv: '\u{1F4D7}', ods: '\u{1F4D7}',
	ppt: '\u{1F4D9}', pptx: '\u{1F4D9}', odp: '\u{1F4D9}',
	zip: '\u{1F5DC}', rar: '\u{1F5DC}', '7z': '\u{1F5DC}',
	jpg: '\u{1F5BC}', jpeg: '\u{1F5BC}', png: '\u{1F5BC}', gif: '\u{1F5BC}', webp: '\u{1F5BC}',
	txt: '\u{1F4C4}'
}

const buildAttachmentLabel = (attachment) => {
	const ext = getFileExtension(attachment.url || '')
	const name = attachment.name || attachment.label || '下載檔案'
	return ext ? `${name}.${ext}` : name
}

const buildAttachmentBox = (attachment) => ({
	type: 'box',
	layout: 'horizontal',
	spacing: 'sm',
	margin: 'sm',
	paddingAll: 'md',
	cornerRadius: 'md',
	backgroundColor: '#F2F4F7',
	action: {
		type: 'uri',
		label: '下載檔案',
		uri: attachment.url
	},
	contents: [
		{
			type: 'text',
			text: fileIcons[getFileExtension(attachment.url || '')] || '\u{1F4CE}',
			size: 'sm',
			flex: 0
		},
		{
			type: 'text',
			text: buildAttachmentLabel(attachment),
			size: 'sm',
			color: '#1a6fd4',
			wrap: true,
			flex: 1
		}
	]
})

const buildNewsFlex = (newsList) => {
	const items = Array.isArray(newsList) ? newsList.slice(0, 5) : []
	if (items.length === 0) {
		return {
			type: 'text',
			text: '目前沒有公告。'
		}
	}

	return {
		type: 'flex',
		altText: '最新公告',
		contents: {
			type: 'carousel',
			contents: items.map(item => {
				const detail = item.detail || {}
				const attachments = (Array.isArray(detail.attachments) ? detail.attachments : []).filter(attachment => attachment && attachment.url)
				const bodyContents = [
					{
						type: 'text',
						text: item.title || detail.title || '公告',
						weight: 'bold',
						size: 'md',
						wrap: true
					},
					...(item.startDate ? [{
						type: 'text',
						text: `公告時間：${item.startDate}`,
						size: 'xs',
						color: '#7f8c8d',
						margin: 'sm'
					}] : []),
					{
						type: 'text',
						text: (detail.content || '').slice(0, 500) || '（無內容）',
						wrap: true,
						size: 'sm',
						margin: 'sm'
					}
				]

				if (attachments.length > 0) {
					bodyContents.push({
						type: 'separator',
						margin: 'lg'
					})
					bodyContents.push({
						type: 'text',
						text: `附件下載（${attachments.length}）`,
						size: 'xs',
						weight: 'bold',
						color: '#7f8c8d',
						margin: 'lg'
					})
					bodyContents.push(...attachments.map(buildAttachmentBox))
				}

				const footerButtons = []
				if (item.detailUrl) {
					footerButtons.push({
						type: 'button',
						style: 'link',
						action: {
							type: 'uri',
							label: '原公告連結',
							uri: item.detailUrl
						}
					})
				}

				return {
					type: 'bubble',
					body: {
						type: 'box',
						layout: 'vertical',
						spacing: 'sm',
						contents: [
							...bodyContents
						]
					},
					footer: footerButtons.length > 0 ? {
						type: 'box',
						layout: 'vertical',
						spacing: 'sm',
						contents: footerButtons
					} : undefined
				}
			})
		}
	}
}

const handleEvent = async (event) => {
	const userId = event.source?.userId
	if (!userId || !/^[a-zA-Z0-9_-]+$/.test(userId)) {
		return Promise.resolve(null)
	}
	const user_setting_path = path.join(SETTING_DIR, `${userId}.json`)
	let user_setting = {}
	try {
		const content = await fsPromises.readFile(user_setting_path, 'utf8')
		user_setting = JSON.parse(content)
	} catch (e) {
		if (e.code !== 'ENOENT' && e.name !== 'SyntaxError') throw e
	}
	user_setting.display_type = user_setting.display_type || 'horizontal'
	user_setting.display_order = user_setting.display_order || '1_2'
	user_setting.dark_mode = user_setting.dark_mode || 'off'
	const isDark = user_setting.dark_mode === 'on'

	if (event.type === 'follow') {
		return client.replyMessage({
			replyToken: event.replyToken,
			messages: [
				welcome_message,
				await getDefaultNavImagemap(isDark)
			]
		})
	}
	else if (event.type === 'postback') {
		const data = event.postback.data.split('=')
		if (data.length >= 2 && data[0] === 'display_type' && setting_options_display_type.some(option => option.value === data[1])) {
			user_setting.display_type = data[1]
			await fsPromises.writeFile(user_setting_path, JSON.stringify(user_setting))
		}
		else if (data.length >= 2 && data[0] === 'display_order' && setting_options_display_order.some(option => option.value === data[1])) {
			user_setting.display_order = data[1]
			await fsPromises.writeFile(user_setting_path, JSON.stringify(user_setting))
		}
		else if (data.length >= 2 && data[0] === 'dark_mode' && setting_options_dark_mode.some(option => option.value === data[1])) {
			user_setting.dark_mode = data[1]
			await fsPromises.writeFile(user_setting_path, JSON.stringify(user_setting))
		}
		return client.replyMessage({
			replyToken: event.replyToken,
			messages: [
				getUserSettingFlex(user_setting)
			]
		})
	}
	else if (event.message?.type === 'text') {
		if(event.message.text.includes('設定')) {
			return client.replyMessage({
				replyToken: event.replyToken,
				messages: [
					getUserSettingFlex(user_setting)
				]
			})
		}

		if (event.message.text.includes('公告')) {
			await showLoading(userId)
			const news = await fetchNewsFromAPI()
			const flex = buildNewsFlex(news)
			return client.replyMessage({
				replyToken: event.replyToken,
				messages: Array.isArray(flex) ? flex : [flex]
			})
		}

		let mealId = 0
		let matchedCount = 0

		Object.entries(meals).forEach(([id, meal]) => {
			if ( event.message.text.includes(meal.name) ) {
				matchedCount++
				if(mealId === 0) {
					mealId = id
				}
			}
		})

		if( mealId === 0 ) {
			return client.replyMessage({
				replyToken: event.replyToken,
				messages: [
					welcome_message,
					await getDefaultNavImagemap(isDark)
				]
			})
		}

		if (matchedCount > 1 || event.message.text.includes('早午餐') || event.message.text.includes('午晚餐')) {
			return client.replyMessage({
				replyToken: event.replyToken,
				messages: [
					{
						type: 'text',
						text: '你到底想查哪個啦？',
					},
					await getDefaultNavImagemap(isDark)
				]
			})
		}

		let date = new Date()
		const date_from_message = event.message.text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
		if( date_from_message ) {
			const year = parseInt(date_from_message[1])
			const month = parseInt(date_from_message[2]) - 1
			const day = parseInt(date_from_message[3])
			const date_in_message = new Date(year, month, day)
			// new Date(2026, 1, 30) 會自動進位成 3/2 而不是 Invalid Date，要比對建構後的年月日
			if(
				date_in_message.getFullYear() === year &&
				date_in_message.getMonth() === month &&
				date_in_message.getDate() === day
			) {
				date = date_in_message
			}
			else {
				return client.replyMessage({
					replyToken: event.replyToken,
					messages: [
						{
							type: 'text',
							text: '日期格式錯誤，請使用 YYYY/MM/DD 或 YYYY-MM-DD'
						}
					]
				})
			}
		}

		let menu = await getMenuFromFile(date, mealId)
		if( !menu ) {
			await showLoading(userId)
			menu = await getMenuFromAPI(date, mealId)
		}

		const has_snack = await hasSnackMenu(date)

		const is_today = new Date().toDateString() === date.toDateString()
		const { prev_day, next_day } = await getAdjacentWorkingDays(date)

		const colors = getColors(isDark)
		const orderedRestaurants = user_setting.display_order === '2_1' ? [...restaurants].reverse() : restaurants

		let messages = []
		if(user_setting.display_type === 'horizontal') {
			messages = [{
				type: 'flex',
				altText: '學餐菜單',
				contents: {
					type: 'carousel',
					contents: orderedRestaurants.map(restaurant => getRestaurantMenuFlex(menu, date, mealId, restaurant, colors))
				}
			}]
		}
		else {
			messages = orderedRestaurants.map(restaurant => ({
				type: 'flex',
				altText: '學餐菜單',
				contents: getRestaurantMenuFlex(menu, date, mealId, restaurant, colors)
			}))
		}

		return client.replyMessage({
			replyToken: event.replyToken,
			messages: [
				...messages,
				buildMenuNavImagemap(date, mealId, prev_day, next_day, has_snack, is_today, isDark)
			]
		})
	}

	return Promise.resolve(null)
}

const port = process.env.PORT || 80
app.listen(port, async () => {
	await fsPromises.mkdir(SETTING_DIR, { recursive: true })
	console.log(`MCUT Menu Bot listening on ${port}`)
})
