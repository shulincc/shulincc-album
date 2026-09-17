import { defineConfig } from 'astro/config';

// 樹林社大相簿(album.shulincc.org)
// 獨立的 Astro 專案,跟主站(shulincc-site)分開部署——理由見規劃討論:
// 這個站是同仁高頻率、多人上傳照片的地方,build/deploy 風險要跟主站隔開,
// 主站出問題不該連累相簿站,反之亦然。2026-07-29 已確認連 GitHub repo 都
// 拆成獨立的(shulincc/shulincc-album,不是 monorepo),兩邊各自獨立的
// repo、各自獨立的 Cloudflare Pages 專案,唯一共用的是通用型的 Sveltia CMS
// GitHub OAuth Worker(不綁定特定 repo,詳見 admin/config.yml 的註解)。
//
// build.format 用 'directory',網址結尾不加 .html,符合這個新站的定位
// (完全是新內容,沒有舊網址要保留的包袱,不需要主站那套 legacyPath 機制)。
export default defineConfig({
	site: 'https://album.shulincc.org',
	trailingSlash: 'ignore',
	build: {
		format: 'directory',
	},
});
