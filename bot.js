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
	if(str?.length == 8) {
		str = str.slice(-4)
	}
	if(str?.length != 4) return null
	return `${parseInt(str.slice(0, 2))}/${parseInt(str.slice(2, 4))}`
}

registerFont('./fonts/NotoSansTC-Regular.ttf', { family: 'NotoSansTC' })
fs.readdirSync(path.join(__dirname, 'public', 'multi_size_image')).forEach(file => {
	const baseName = file.split('.')[0]
	const isDarkImage = baseName.includes('_dark')
	app.get([
		`/image/${baseName}/:size(\\d+)`,
		`/image/${baseName}/:prev/:next/:size(\\d+)`
	], async (req, res) => {
		const prev = '« ' + (toShortDate(req.params.prev) || '前一天')
		const next = (toShortDate(req.params.next) || '後一天') + ' »'
		const baseImage = await loadImage(`./public/multi_size_image/${baseName}.png`)
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

fs.readdirSync(path.join(__dirname, 'public', 'image')).forEach(file => {
	app.get(`/image/${file}`, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'image', file)) })
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
							text: `${restaurant.name} ${date.getFullYear() == new Date().getFullYear() ? '' : `${date.getFullYear().toString().slice(2, 4)}/`}${date.getMonth()+1}/${date.getDate()} (${['日','一','二','三','四','五','六'][date.getDay()]}) ${meals[mealId].title}`,
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
						menu[`menu_${restaurant.id}`].length > 0 ?
						menu[`menu_${restaurant.id}`].map((row) => (
							{
								type: 'box',
								layout: 'vertical',
								contents: [
									(row.type && menu[`menu_${restaurant.id}`].length > 1) ? {
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
								].filter(i => i !== null)
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
										text: mealId == 4 ? '今日未提供段考週免費宵夜' : '廠商尚未上傳菜單',
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
					text: '菜單僅供參考，實際供應內容以現場為準。\n輸入「設定」可以調整顯示方式/餐廳順序/主題。',
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
							backgroundColor: currentValue == option.value ? colors.PRIMARY : colors.RADIO_UNSELECTED,
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
															backgroundColor: user_setting.display_type == option.value ? colors.PRIMARY : colors.RADIO_UNSELECTED,
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
	const url = `https://mcut-menu-api.henrywu.tw/${year}/working-day.json`
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

const getAdjacentWorkingDays = async (date) => {
	const compactDate = toYYYYMMDD(date)
	const year = date.getFullYear()
	const years = [year]
	if (date.getMonth() === 11 && date.getDate() >= 28) years.push(year + 1)
	if (date.getMonth() === 0 && date.getDate() <= 3) years.unshift(year - 1)

	let allWorkingDays = []
	for (const y of years) {
		try {
			const list = await getWorkingDaysForYear(y)
			allWorkingDays = allWorkingDays.concat(list)
		} catch (e) {
			console.error(e)
			return {
				next: toSlashFormat(new Date(date.getTime() + ONE_DAY)),
				previous: toSlashFormat(new Date(date.getTime() - ONE_DAY))
			}
		}
	}
	allWorkingDays.sort()

	const nextStr = allWorkingDays.find((d) => d > compactDate)
	const prevStr = [...allWorkingDays].reverse().find((d) => d < compactDate)
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
				text: `${prev_day} ${meals[mealId].name}`,
				area: { x: 127, y: 102, width: 225, height: 70 }
			},
			{
				type: 'message',
				text: meals[mealId].name,
				area: { x: 426, y: 102, width: 187, height: 70 }
			},
			menu_image_url !== 'menu_no_next' ? {
				type: 'message',
				text: `${next_day} ${meals[mealId].name}`,
				area: { x: 682, y: 102, width: 225, height: 70 }
			} : null,
		].filter(i => i !== null)
	}
}

const getDefaultNavImagemap = async (isDark = false) => {
	const date = new Date()
	const mealId = getCurrentMealId()
	let has_snack = false
	try {
		await fsPromises.access(`data/menu/${toSlashFormat(date)}/4.json`)
		has_snack = true
	} catch (e) {
		if (e.code !== 'ENOENT') throw e
	}
	const { prev_day, next_day } = await getAdjacentWorkingDays(date)
	return buildMenuNavImagemap(date, mealId, prev_day, next_day, has_snack, true, isDark)
}

const getMenuFromFile = async (date, mealId) => {
	const menu_path = `data/menu/${toSlashFormat(date)}/${mealId}.json`
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
	const menu_path = `data/menu/${toSlashFormat(date)}/${mealId}.json`
	try {
		const res = await fetch(`https://mcut-menu-api.henrywu.tw/${toSlashFormat(date)}/${mealId}.json`, {
			signal: AbortSignal.timeout(5000)
		})
		if (res.ok) {
			const menu = await res.json()
			await fsPromises.mkdir(path.dirname(menu_path), { recursive: true })
			await fsPromises.writeFile(menu_path, JSON.stringify(menu))
			return menu
		}
	} catch (e) {
		return {
			menu_1: {},
			menu_2: {},
		}
	}
	return {
		menu_1: {},
		menu_2: {},
	}
}

const handleEvent = async (event) => {
	const userId = event.source?.userId
	if (!userId || !/^[a-zA-Z0-9_-]+$/.test(userId)) {
		return Promise.resolve(null)
	}
	const user_setting_path = `data/setting/${userId}.json`
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
	else if (event.type == 'postback') {
		const data = event.postback.data.split('=')
		if (data.length >= 2 && data[0] == 'display_type' && setting_options_display_type.some(option => option.value == data[1])) {
			user_setting.display_type = data[1]
			await fsPromises.writeFile(user_setting_path, JSON.stringify(user_setting))
		}
		else if (data.length >= 2 && data[0] == 'display_order' && setting_options_display_order.some(option => option.value == data[1])) {
			user_setting.display_order = data[1]
			await fsPromises.writeFile(user_setting_path, JSON.stringify(user_setting))
		}
		else if (data.length >= 2 && data[0] == 'dark_mode' && setting_options_dark_mode.some(option => option.value == data[1])) {
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
	else if (event.message?.type == 'text') {
		if(event.message.text.includes('設定')) {
			return client.replyMessage({
				replyToken: event.replyToken,
				messages: [
					getUserSettingFlex(user_setting)
				]
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

		if( mealId == 0 ) {
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
		const date_from_message = event.message.text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
		if( date_from_message ) {
			const year = parseInt(date_from_message[1])
			const month = parseInt(date_from_message[2]) - 1
			const day = parseInt(date_from_message[3])
			const date_in_message = new Date(year, month, day)
			if( date_in_message.toString() !== 'Invalid Date' ) {
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
			await client.showLoadingAnimation({
				chatId: userId,
				loadingSeconds: 5 
			})
			menu = await getMenuFromAPI(date, mealId)
		}

		let has_snack = false
		try {
			await fsPromises.access(`data/menu/${toSlashFormat(date)}/4.json`)
			has_snack = true
		} catch (e) {
			if (e.code !== 'ENOENT') throw e
		}

		const is_today = new Date().toDateString() == date.toDateString()
		const { prev_day, next_day } = await getAdjacentWorkingDays(date)

		const colors = getColors(isDark)
		const orderedRestaurants = user_setting.display_order == '2_1' ? [...restaurants].reverse() : restaurants

		let messages = []
		if(user_setting.display_type == 'horizontal') {
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
	await fsPromises.mkdir('data/setting', { recursive: true })
	console.log(`MCUT Menu Bot listening on ${port}`)
})