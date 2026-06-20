const main = async () => {
    const today = new Date()
    const checkedDates = []

    console.log(`Base date today (UTC): ${today.toISOString().split('T')[0]}`)
    console.log('Starting to check API data for the next 7 days...\n')

    for (let i = 1; i <= 7; i++) {
        const targetDate = new Date()
        targetDate.setDate(today.getDate() + i)

        const year = targetDate.getFullYear()
        const month = String(targetDate.getMonth() + 1).padStart(2, '0')
        const day = String(targetDate.getDate()).padStart(2, '0')

        const datePath = `${year}/${month}/${day}`
        checkedDates.push(datePath)

        for (let meal = 1; meal <= 3; meal++) {
            const url = `https://mcut-menu-api.henrywu.tw/${datePath}/${meal}.json`

            try {
                const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })

                if (response.status === 200) {
                    const text = await response.text()
                    try {
                        const data = JSON.parse(text)
                        const hasMenu1 = data && Array.isArray(data.menu_1) && data.menu_1.length > 0
                        const hasMenu2 = data && Array.isArray(data.menu_2) && data.menu_2.length > 0

                        if (hasMenu1 && hasMenu2) {
                            console.log(`[+] ${datePath}/${meal}.json: Data exists and is valid (200 OK)`)
                            process.exit(0)
                        } else {
                            console.log(`[-] ${datePath}/${meal}.json: Menu content is empty or incomplete (200 OK)`)
                        }
                    } catch (parseError) {
                        console.log(`[-] ${datePath}/${meal}.json: Invalid JSON format (200 OK)`)
                    }
                } else if (response.status === 404) {
                    console.log(`[-] ${datePath}/${meal}.json: Data not found (404)`)
                } else {
                    console.log(`[-] ${datePath}/${meal}.json: Unexpected status code (${response.status})`)
                }
            } catch (error) {
                console.log(`[-] ${datePath}/${meal}.json: Request failed (${error.message})`)
            }
        }
    }

    const startDate = checkedDates[0]
    const endDate = checkedDates[checkedDates.length - 1]
    const msg = `⚠️ Incomplete data detected for ${startDate} ~ ${endDate}`

    console.error('\n' + msg)
    process.exit(1)
}

main().catch((err) => {
    console.error('Unexpected error occurred during script execution:', err)
    process.exit(1)
})