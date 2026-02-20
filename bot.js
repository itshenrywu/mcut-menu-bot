require('dotenv').config({quite: true})
const line = require('@line/bot-sdk')
const express = require('express')
const config = { channelSecret: process.env.CHANNEL_SECRET }
const client = new line.messagingApi.MessagingApiClient({ channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN })
const app = express()
const path = require('path')
const fs = require('fs')

const ONE_DAY = 86400000
const ONE_HOUR = 3600000

let COLOR_PRIMARY = '#3498db'
let COLOR_TITLE = '#2c3e50'
let COLOR_SUBTITLE = '#34495e'
let COLOR_GRAY = '#7f8c8d'
let COLOR_RED = '#e74c3c'
let COLOR_LIGHT_GRAY = '#ecf0f1'

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
	text: '請輸入 早餐、午餐、或 晚餐 以查詢菜單',
	quickReply: {
		items: [
			{
				type: 'action',
				action: {
					type: 'message',
					label: '早餐',
					text: '早餐'
				}
			},
			{
				type: 'action',
				action: {
					type: 'message',
					label: '午餐',
					text: '午餐'
				}
			},
			{
				type: 'action',
				action: {
					type: 'message',
					label: '晚餐',
					text: '晚餐'
				}
			},
		]
	}
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

fs.readdirSync(path.join(__dirname, 'public', 'multi_size_image')).forEach(file => {
	app.get(`/image/${file.split('.')[0]}/:size(\\d+)`, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'multi_size_image', file)) })
})
fs.readdirSync(path.join(__dirname, 'public', 'image')).forEach(file => {
	app.get(`/image/${file}`, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'image', file)) })
})

app.get('/', (req, res) => {
	res.send('owo')
})

app.post('/webhook', line.middleware(config), (req, res) => {
	Promise
	.all(req.body.events.map(handleEvent))
	.then((result) => res.json(result))
	.catch((err) => {
		console.error(err)
		res.status(500).end()
	})
})

function dateStr(date, show_weekday=0) {
	return `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getDate().toString().padStart(2,'0')}` + (show_weekday ? ` (${['日','一','二','三','四','五','六'][date.getDay()]})` : '')
}

function getRestaurantMenuFlex(menu, date, mealId, restaurant) {
	return {
		type: 'bubble',
		body: {
			type: 'box',
			layout: 'vertical',
			contents: [
				{
					type: 'text',
					text: `${restaurant.name} ${date.getMonth()+1}/${date.getDate()} (${['日','一','二','三','四','五','六'][date.getDay()]}) ${meals[mealId].title}菜單`,
					weight: 'bold',
					align: 'center',
					color: COLOR_TITLE,
					wrap: true
				},
				{
					type: 'text',
					text: `${restaurant.location}・${meals[mealId].open_time} 供應`,
					align: 'center',
					color: COLOR_GRAY,
					size: 'xxs',
					margin: 'sm'
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
									(row.type && row.type != '主食') ? {
										type: 'text',
										text: row.type,
										size: 'sm',
										color: COLOR_SUBTITLE
									} : null,
									{
										type: 'text',
										text: row.foods,
										wrap: true,
										size: 'xs'
									}
								].filter(i => i !== null)
							}
						)) :
						[
							{
								type: 'box',
								height: '160px',
								justifyContent: 'center',
								layout: 'vertical',
								contents: [
									{
										type: 'text',
										text: mealId == 4 ? '今日未提供段考週免費宵夜' : '廠商尚未上傳菜單',
										size: 'sm',
										color: COLOR_RED,
										align: 'center'
									}
								]
							}
						]
				},
				{
					type: 'text',
					text: '菜單僅供參考，實際供應內容以現場供應為準。\n輸入「設定」可以調整顯示方式。',
					color: COLOR_GRAY,
					size: 'xxs',
					margin: 'xl',
					wrap: true
				}
			]
		}
	}
}

function getUserSettingFlex(user_setting) {
	return {
		type: 'flex',
		altText: '偏好設定',
		contents: {
			type: 'bubble',
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
						color: COLOR_TITLE
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
								color: COLOR_SUBTITLE
							},
							{
								type: 'box',
								layout: 'horizontal',
								spacing: 'md',
								contents: setting_options_display_type.map(option => {
									return {
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
												url: `https://mcut-menu-bot.henrywu.tw/image/display_type_${option.value}.png?v=3`,
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
																backgroundColor: user_setting.display_type == option.value ? COLOR_PRIMARY : '#ffffff',
																cornerRadius: '8px'
															}
														],
														width: '16px',
														height: '16px',
														backgroundColor: COLOR_LIGHT_GRAY,
														cornerRadius: '16px',
														justifyContent: 'center',
														alignItems: 'center'
													},
													{
														type: 'text',
														text: option.label,
														size: 'xs'
													}
												]
											}
										]
									}
								})
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
								text: '顯示順序',
								size: 'sm',
								color: COLOR_SUBTITLE
							},
							{
								type: 'box',
								layout: 'vertical',
								contents: [
									{
										type: 'box',
										layout: 'vertical',
										spacing: 'md',
										contents: setting_options_display_order.map(option => {
											return {
												type: 'box',
												layout: 'horizontal',
												action: {
													type: 'postback',
													label: '偏好設定',
													data: 'display_order=' + option.value
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
																backgroundColor: user_setting.display_order == option.value ? COLOR_PRIMARY : '#ffffff',
																cornerRadius: '8px'
															}
														],
														width: '16px',
														height: '16px',
														backgroundColor: '#ecf0f1',
														cornerRadius: '16px',
														justifyContent: 'center',
														alignItems: 'center'
													},
													{
														type: 'text',
														text: option.label,
														size: 'xs'
													}
												]
											}
										}),
									}
								]
							}
						]
					}
				]
			}
		}
	}
}

function isAdmin(userId) {
	const admins = (process.env.ADMINS || '').split(',')
	return admins.includes(userId)
}

async function getMenuFromFile(date, mealId) {
	const menu_path = `data/menu/${dateStr(date)}/${mealId}.json`
	if( fs.existsSync(menu_path) ) {
		const filemtime = fs.statSync(menu_path).mtime.getTime()
		if((new Date().getTime() - filemtime) < ONE_HOUR) {
			const menu_from_file = JSON.parse(fs.readFileSync(menu_path))
			return menu_from_file
		}
	}

	return false
}

async function getMenuFromAPI(date, mealId) {
	const menu_path = `data/menu/${dateStr(date)}/${mealId}.json`
	const res = await fetch(`https://mcut-menu-api.henrywu.tw/${dateStr(date)}/${mealId}.json`, {
		signal: AbortSignal.timeout(5000)
	})
	if (res.ok) {
		const menu = await res.json()
		fs.mkdirSync(`data/menu/${dateStr(date)}`, { recursive: true })
		fs.writeFileSync(menu_path, JSON.stringify(menu))
		return menu
	}

	return {
		menu_1: {},
		menu_2: {},
	}
}

async function handleEvent(event) {
	const userId = event.source.userId
	const user_setting_path = `data/setting/${userId}.json`
	let user_setting = {}
	if (fs.existsSync(user_setting_path)) {
		user_setting = JSON.parse(fs.readFileSync(user_setting_path))
	}
	user_setting.display_type = user_setting.display_type || 'horizontal'
	user_setting.display_order = user_setting.display_order || '1_2'

	if (event.type === 'follow') {
		return client.replyMessage({
			replyToken: event.replyToken,
			messages: [
				welcome_message
			]
		})
	}
	else if (event.type == 'postback') {
		const data = event.postback.data.split('=')
		if(data[0] == 'display_type' && setting_options_display_type.some(option => option.value == data[1])) {
			user_setting.display_type = data[1]
			fs.writeFileSync(user_setting_path, JSON.stringify(user_setting))
		}
		else if(data[0] == 'display_order' && setting_options_display_order.some(option => option.value == data[1])) {
			user_setting.display_order = data[1]
			fs.writeFileSync(user_setting_path, JSON.stringify(user_setting))
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
					welcome_message
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
						quickReply: {
							items: [
								{
									type: 'action',
									action: {
										type: 'message',
										label: '早餐',
										text: '早餐'
									}
								},
								{
									type: 'action',
									action: {
										type: 'message',
										label: '午餐',
										text: '午餐'
									}
								},
								{
									type: 'action',
									action: {
										type: 'message',
										label: '晚餐',
										text: '晚餐'
									}
								},
							]
						}
					}
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
		if(fs.existsSync(`data/menu/${dateStr(date)}/4.json`)) {
			has_snack = true
		}

		const is_today = new Date().toDateString() == date.toDateString()
		const prev_day = dateStr(new Date(date.getTime() - ONE_DAY))
		const next_day = dateStr(new Date(date.getTime() + ONE_DAY))

		let menu_image_url = 'menu'
		if( has_snack) {
			menu_image_url += '_snack'
		}
		else if( (date.getTime() - new Date().getTime()) < -7 * ONE_DAY ) {
			menu_image_url += '_no_prev'
		}
		else if( (date.getTime() - new Date().getTime()) > 7 * ONE_DAY ) {
			menu_image_url += '_no_next'
		}

		let messages = []
		if(user_setting.display_type == 'horizontal') {
			messages = [{
				type: 'flex',
				altText: '學餐菜單',
				contents: {
					type: 'carousel',
					contents: (user_setting.display_order == '2_1' ? restaurants.toReversed() : restaurants).map(restaurant => getRestaurantMenuFlex(menu, date, mealId, restaurant))
				}
			}]
		}
		else {
			messages = (user_setting.display_order == '2_1' ? restaurants.toReversed() : restaurants).map(restaurant => {
				return {
					type: 'flex',
					altText: '學餐菜單',
					contents: getRestaurantMenuFlex(menu, date, mealId, restaurant)
				}
			})
		}

		return client.replyMessage({
			replyToken: event.replyToken,
			messages: [
				...messages,
				{
					type: 'imagemap',
					baseUrl: `https://mcut-menu-bot.henrywu.tw/image/${menu_image_url}/`,
					altText: `${date.getMonth()+1}/${date.getDate()} (${['日','一','二','三','四','五','六'][date.getDay()]}) ${meals[mealId].title}菜單`,
					baseSize: {
						width: 1040,
						height: 180
					},
					actions: [
						{
							type: 'message',
							text: `${is_today ? '' : `${dateStr(date)} `}早餐`,
							area: {
								x: has_snack ? 44 : 173,
								y: 0,
								width: 179,
								height: 70
							}
						},
						{
							type: 'message',
							text: `${is_today ? '' : `${dateStr(date)} `}午餐`,
							area: {
								x: has_snack ? 302 : 432,
								y: 0,
								width: 179,
								height: 70
							}
						},
						{
							type: 'message',
							text: `${is_today ? '' : `${dateStr(date)} `}晚餐`,
							area: {
								x: has_snack ? 561 : 688,
								y: 0,
								width: 179,
								height: 70
							}
						},
						has_snack ? {
							type: 'message',
							text: `${is_today ? '' : `${dateStr(date)} `}宵夜`,
							area: {
								x: 821,
								y: 0,
								width: 179,
								height: 70
							}
						} : null,
						menu_image_url != 'menu_no_prev' ? {
							type: 'message',
							text: `${prev_day} ${meals[mealId].name}`,
							area: {
								x: 127,
								y: 102,
								width: 225,
								height: 70
							}
						} : null,
						menu_image_url != 'menu_no_today' ? {
							type: 'message',
							text: meals[mealId].name,
							area: {
								x: 426,
								y: 102,
								width: 187,
								height: 70
							}
						} : null,
						menu_image_url != 'menu_no_next' ? {
							type: 'message',
							text: `${next_day} ${meals[mealId].name}`,
							area: {
								x: 682,
								y: 102,
								width: 225,
								height: 70
							}
						} : null,
					].filter(i => i !== null)
				}
			]
		})
	}

	return Promise.resolve(null)
}

const port = process.env.PORT || 3100
app.listen(port, () => {
	if(!fs.existsSync('data/setting')) {
		fs.mkdirSync('data/setting')
	}
	console.log(`MCUT Menu Bot listening on ${port}`)
})