/**
 * 一次性腳本：根據現有淺色底圖，生成對應的深色模式底圖
 * 執行方式：node create-dark-images.js
 */
const { loadImage, createCanvas } = require('canvas')
const fs = require('fs')
const path = require('path')

// 淺色模式原始顏色
const LIGHT_BUTTON_BG = [236, 240, 241] // #ecf0f1  按鈕區背景
const LIGHT_NAV_BG    = [233, 251, 255] // #e9fbff  導覽區背景
const LIGHT_FG        = [44,  62,  80]  // #2c3e50  圖示/文字

// 深色模式目標顏色
const DARK_BG         = [28,  32,  38]  // #1c2026  深色背景 (與 getColors BG 一致)
const DARK_NAV_BG     = [32,  36,  40]  // #202428  導覽區深色背景 (中性深灰，無藍色調)
const DARK_FG         = [245, 246, 246] // #f5f6f6  圖示/文字 (近白色，深色背景上高對比)

const lerp = (a, b, t) => Math.round(a + (b - a) * t)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/**
 * 重新著色單一像素
 * 以像素亮度作為插值參數，在深色 FG 與深色 BG 之間插值
 */
function recolorPixel(r, g, b, a, isNavArea) {
	if (a < 10) return [r, g, b, a] // 保留透明像素

	const srcBg  = isNavArea ? LIGHT_NAV_BG : LIGHT_BUTTON_BG
	const dstBg  = isNavArea ? DARK_NAV_BG  : DARK_BG
	const srcFg  = LIGHT_FG
	const dstFg  = DARK_FG

	const srcBgLum  = (srcBg[0] + srcBg[1] + srcBg[2]) / 3
	const srcFgLum  = (srcFg[0] + srcFg[1] + srcFg[2]) / 3
	const pixelLum  = (r + g + b) / 3

	// t=0 → 接近前景色（圖示），t=1 → 接近背景色
	const t = clamp((pixelLum - srcFgLum) / (srcBgLum - srcFgLum), 0, 1)

	return [
		lerp(dstFg[0], dstBg[0], t),
		lerp(dstFg[1], dstBg[1], t),
		lerp(dstFg[2], dstBg[2], t),
		a,
	]
}

async function generateDarkImage(srcFilename) {
	const srcPath = path.join(__dirname, 'public', 'multi_size_image', srcFilename)
	const dstFilename = srcFilename.replace('.png', '_dark.png')
	const dstPath = path.join(__dirname, 'public', 'multi_size_image', dstFilename)

	const img = await loadImage(srcPath)
	const canvas = createCanvas(img.width, img.height)
	const ctx = canvas.getContext('2d')
	ctx.drawImage(img, 0, 0)

	const imageData = ctx.getImageData(0, 0, img.width, img.height)
	const data = imageData.data

	for (let y = 0; y < img.height; y++) {
		// y < 80: 按鈕區（早/午/晚/宵夜），y > 100: 導覽區（前一天/今天/後一天）
		const isNavArea = y > 100

		for (let x = 0; x < img.width; x++) {
			const i = (y * img.width + x) * 4
			const [nr, ng, nb, na] = recolorPixel(data[i], data[i+1], data[i+2], data[i+3], isNavArea)
			data[i]   = nr
			data[i+1] = ng
			data[i+2] = nb
			data[i+3] = na
		}
	}

	ctx.putImageData(imageData, 0, 0)

	await new Promise((resolve, reject) => {
		const out = fs.createWriteStream(dstPath)
		canvas.createPNGStream().pipe(out)
		out.on('finish', resolve)
		out.on('error', reject)
	})

	console.log(`✓ 已生成：${dstFilename}`)
}

;(async () => {
	const srcFiles = [
		'menu.png',
		'menu_no_next.png',
		'menu_snack.png',
		'menu_snack_no_next.png',
	]

	for (const file of srcFiles) {
		await generateDarkImage(file)
	}

	console.log('全部完成！')
})()
