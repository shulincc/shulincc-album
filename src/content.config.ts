import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 班級相簿(對應規劃討論:同仁上傳課程/活動照片,呈現版面可選「相簿式」或「文章式」)。
// 檔案放在 src/content/classalbum/,不特別依年度分子資料夾——年度是資料欄位(year),
// 不是資料夾結構,原因:Sveltia CMS 的 folder collection 一個資料夾對應一個 collection,
// 如果照年度分資料夾,每年都要回來改 config.yml 多開一個 collection,同仁自己沒辦法
// 新增年度。用欄位篩選,年度網址(/115/、/114/...)由 Astro 在建置期依 year 欄位分組
// 產生,同仁只要在 CMS 選對年度,不用管檔案實際放在哪裡。
const classalbum = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/classalbum' }),
	schema: z.object({
		title: z.string(), // 班級/活動名稱,例如「原民風創意巧編」
		year: z.string(), // 民國年度,例如 "115"、"114"——字串而非數字,保留同仁輸入時可能的前導寫法彈性
		// 2026-07-29 使用者指出實際上還有暑期、寒假等學期別(不只春季/秋季/活動三種,
		// 舊站就有「105年暑期班課程相簿」這種先例),固定 z.enum() 會擋掉這些值,
		// 跟 year 欄位同樣的問題——改成開放字串,實際可選清單交給 CMS 的 semesters
		// collection(relation widget)管理,見 config.yml。
		semester: z.string().default('春季'),
		teacher: z.string().optional(),
		date: z.date(), // 排序用,不一定是真正上課日期,通常用貼文/活動日期
		cover: z.string().optional(),
		// 2026-09-17 課程分類——跟 year/semester 同一套 relation 模式,清單交給 CMS 的
		// categories collection 管理(見下方定義跟 config.yml)。選填,理由:82 筆已經
		// 遷移進來的舊資料還沒補這個欄位,不能讓 schema 必填擋掉既有內容的 build。
		category: z.string().optional(),
		intro: z.string().optional(), // 相簿式版面用的一兩句話簡介,顯示在相片牆上方
		layout: z.enum(['gallery', 'article']).default('gallery'),
		photos: z
			.array(
				z.object({
					image: z.string(),
					caption: z.string().optional(),
				})
			)
			.default([]),
		// 注意:文章式版面的內文不放在這個 schema 裡。CMS 的 body(markdown widget)
		// 欄位依 Sveltia/Decap 慣例會寫成 frontmatter 之後的實際 markdown 內容,
		// 不是 frontmatter 裡的一個欄位,所以這裡不宣告 body 欄位——
		// 用 astro:content 的 render(entry) 取得 Content 元件即可,見 [slug].astro。
	}),
});

// 2026-07-29 使用者指出「年度選項要手動改 config.yml 才能新增」很奇怪、不像其他
// 欄位都能直接在後台管理。原本用 select widget 是為了避免同仁打字輸入年度時
// 打錯字(例如多一個空白)導致同一年度被拆成兩組——但 select 的選項本身是寫死在
// config.yml 裡,新增年度還是得回來改程式碼,不是真正的「後台自助管理」。
// 改法:新增這個很小的 years collection,純粹只是一份「有效年度清單」,同仁要新增
// 年度時直接在 CMS 這裡新增一筆(不用碰 config.yml/程式碼);classalbum 的 year
// 欄位改成 widget: relation 指到這個 collection(見 config.yml),CMS 會動態從這裡
// 讀出可選清單,效果跟 select 一樣「不能亂打字、只能選」,但清單來源變成 CMS 可管理
// 的內容,不是寫死的設定檔。
const years = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/site-config/years' }),
	schema: z.object({
		title: z.string(), // 顯示用名稱,例如「115學年度」;檔名(slug)才是實際存進 classalbum.year 的值
	}),
});

// 同樣道理套用在學期別:春季/秋季/暑期/寒假/活動……同仁要新增新的學期別分類時
// 直接在 CMS 這裡新增一筆,不用改程式碼。檔名(slug)刻意直接用中文本身(如「春季」),
// 這樣 relation widget 存進 classalbum.semester 的值就是同仁看得懂的中文,不用另外
// 維護一份代碼對照表;全域設定 slug.encoding: unicode 已經允許中文檔名。
const semesters = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/site-config/semesters' }),
	schema: z.object({
		title: z.string(),
	}),
});

// 2026-09-17 短網址(shortlink)——搬自主站 shulincc-site 同一套設計(見主站
// content.config.ts 的 shortlink 說明)。用途:相簿站的網址本身已經算短
// (/{年度}/{代碼}/),不需要每一筆內容都套短網址;這個 collection是給少數
// 「要特別推廣、要印在文宣/QR code 上」的相簿用,同仁自己想一個好記代稱,
// 存檔後由 scripts/generate-redirects.mjs 在 build 時轉成 Cloudflare Pages 的
// `_redirects` 規則,產生真正的 HTTP 301/302 轉址(不是「先載入頁面再用 JS
// 倒數跳轉」那種爛做法)。網址前綴用 /s/(比主站的 /shortlink/ 更短,呼應這個
// 功能本身要「短」的目的)。
const shortlink = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/shortlink' }),
	schema: z.object({
		label: z.string(), // 同仁在後台列表裡認的名稱,訪客不會看到(訪客只會看到瞬間轉址)
		// 2026-09-17 改成選填——同仁想不到好記的字、或根本不在乎好不好記(單純只是
		// 要「短」),留空就好。留空時 scripts/generate-redirects.mjs 會拿 destination
		// 算一組 5 碼短代碼自動頂上(算法搬自主站 announcements 的 shortCode 機制,
		// 見該腳本 djb2Hash/shortCodeFromId 的說明)。填了就照填的字面值用,不受影響。
		slug: z.string().optional(),
		// 拿掉 `.url()` 驗證,只保留必填——理由跟主站同一個欄位一樣:寧可同仁存檔時
		// 網址格式打錯導致轉址失效,也不要因為格式驗證失敗讓整站 build 直接掛掉。
		destination: z.string(),
		// 301(永久)適合目的地幾乎不會再變的連結;302(暫時)適合像特定活動頁這種
		// 之後可能會換目的地的短連結,預設用 302。
		redirectType: z.enum(['301', '302']).optional().default('302'),
		note: z.string().optional(),
	}),
});

// 2026-09-18 課程分類——改依樹林社大官方文件《115春 課程學群說明》重建。
// 該文件把全校課程分成「四大學群」(環境社區/藝術文化/健康身心/多元技能),
// 每個學群底下再細分兩個「子類別」,共 8 個子類別。這裡的 categories collection
// 實際存放的是這 8 個子類別(比原本猜測的 3 個分類更細、也是學校正式用語),
// 新增的 group 欄位記錄每個子類別屬於哪個學群,用於分類瀏覽頁把 8 個子類別
// 依學群分組顯示。82 筆既有 115 春季資料已依官方文件裡逐課程列出的課程名稱
// 全部核對比對(81/82 筆用課程標題完全比對成功,剩 1 筆標題文字跟官方文件
// 略有出入但授課老師相同,人工核對後一併套用)。
// 同仁之後仍可在後台自由新增/改名子類別,不強制永遠沿用這 8 個。
const categories = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/site-config/categories' }),
	schema: z.object({
		title: z.string(),
		group: z.string().optional(), // 所屬學群,例如「藝術文化」——純顯示用,選填避免擋掉舊資料
	}),
});

export const collections = { classalbum, years, semesters, shortlink, categories };
