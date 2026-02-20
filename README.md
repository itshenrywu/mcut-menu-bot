# 明志科技大學學餐菜單機器人

[<img src="https://scdn.line-apps.com/n/line_add_friends/btn/zh-Hant.png" width=100>](https://lin.ee/1CY9bEW)

## 功能
- 查詢近七天內的菜單
- 使用者可設定偏好顯示方式

## To-do
- 免費宵夜目前是靠人工從公告裡的 PDF 生出 JSON 後傳到 Prod Server，之後想做成可以自動 parse

## 菜單 API
目前僅提供前後 7 日的資料
```
https://mcut-menu-api.henrywu.tw/{YYYY}/{MM}/{DD}/{MEAL_ID}.json
```
MEAL_ID：`1` = 早餐，`2` = 午餐，`3` = 晚餐

Response: 
```json
{
    "menu_1": [
        {
            "type": "主食",
            "foods": "特製三明治、豬排漢堡、焙果、蔥抓餅、火腿蛋餅"
        }
    ],
    "menu_2": [
        {
            "type": "主食",
            "foods": "昱品麵包、現做三明治、雞肉蛋漢堡、肉鬆蛋餅"
        }
    ]
}
```
`menu_1` = 第一餐廳，`menu_2` = 第二餐廳
