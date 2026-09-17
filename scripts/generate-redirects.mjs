#!/usr/bin/env node
/**
 * 2026-09-17 搬自主站 shulincc-site 的同一套機制(見主站 scripts/generate-redirects.mjs
 * 的完整說明,這裡只保留相簿站用得到的部分——沒有主站的 announcements/legacyPath
 * 那些欄位跟邏輯)。
 *
 * 讀取 src/content/shortlink/ 底下每篇文章的 frontmatter(slug/destination/
 * redirectType),產生 Cloudflare Pages 看得懂的 `_redirects` 規則檔,寫進建置輸出
 * 目錄(dist/_redirects)。同仁只要在 Sveltia CMS 的「短網址」分類新增/編輯一篇
 * (填代稱+目的地網址),下次 build 就會自動變成一條真正的 Cloudflare 邊緣轉址規則
 * (HTTP 301/302),不用手動改任何設定檔。
 *
 * 網址前綴用 /s/(不是主站的 /shortlink/)——相簿站的網址本身已經很短
 * (/{年度}/{代碼}/),這個功能只給少數要特別推廣的相簿用,前綴也跟著簡短。
 *
 * 2026-09-17 新增:同仁沒填「網址代稱」時自動產生 5 碼短代碼——算法完全搬自主站
 * announcements 的 shortCode 機制(見主站 scripts/generate-redirects.mjs 同一段
 * 說明),用 destination(目的地網址)本身算雜湊值,不是用檔名。理由跟主站一樣:
 * destination 是同仁自己填、看得到、打得到的欄位值,雜湊這個值才能保證「以後
 * 想在後台預覽面板顯示這篇會產生什麼代碼」時,前台跟這裡 build 時算出來的結果
 * 一致——如果雜湊檔名,Sveltia 存檔時做的檔名清理規則沒辦法在前台精確模擬,
 * 兩邊會兜不起來(目前這個腳本本身還沒做後台即時預覽,只是先把算法定死方便
 * 以後要做的話能直接接上)。
 *
 * 用法(接在 astro build 之後執行,見 package.json 的 "build" script):
 *   node scripts/generate-redirects.mjs
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const shortlinkDir = path.join(root, 'src/content/shortlink');

function parseFrontmatter(content, key) {
	const re = new RegExp(`^${key}:\\s*(.+)$`, 'm');
	const m = content.match(re);
	if (!m) return null;
	return m[1].trim().replace(/^["']|["']$/g, '');
}

// 複製自主站 scripts/generate-redirects.mjs 的 djb2Hash/shortCodeFromId——
// 如果以後改動這個演算法,兩邊要一起改,不然同一種「代稱留空自動產生代碼」的
// 使用者體驗在主站跟相簿站會給出不一樣風格的結果(雖然目前兩邊沒有互相比對的
// 需求,只是保持演算法一致的設計意圖)。
function djb2Hash(str) {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = (hash * 33) ^ str.charCodeAt(i);
	}
	return hash >>> 0;
}
function shortCodeFromId(id, length = 5) {
	return djb2Hash(id).toString(36).padStart(length, '0').slice(-length);
}

function main() {
	if (!existsSync(distDir)) {
		console.error(`找不到 ${path.relative(root, distDir)},請先執行 astro build 再跑這支腳本。`);
		process.exit(1);
	}

	let files = [];
	try {
		files = readdirSync(shortlinkDir).filter((f) => f.endsWith('.md'));
	} catch {
		files = [];
	}

	// 先蒐集每一篇的候選代碼——同仁自己填的代稱(slug)直接照用,沒填的話先算一組
	// 雜湊值當候選。依檔名排序後統一做碰撞檢查(不管是同仁自己填的還是自動算的,
	// 撞在一起都不該讓 build 失敗或互相覆蓋,撞到的那篇自動加上 -2、-3 尾碼)。
	const candidates = [];
	for (const f of files) {
		const content = readFileSync(path.join(shortlinkDir, f), 'utf-8');
		const slug = parseFrontmatter(content, 'slug');
		const destination = parseFrontmatter(content, 'destination');
		const redirectType = parseFrontmatter(content, 'redirectType') || '302';
		if (!destination) {
			console.warn(`⚠️  ${f} 缺少 destination(目的地網址),略過這篇(不會產生轉址規則)。`);
			continue;
		}
		candidates.push({
			file: f,
			destination,
			redirectType,
			baseCode: slug || shortCodeFromId(destination),
			isAuto: !slug,
		});
	}
	candidates.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

	const usedCodes = new Set();
	const lines = [];
	for (const item of candidates) {
		let candidate = item.baseCode;
		let n = 2;
		while (usedCodes.has(candidate)) {
			candidate = `${item.baseCode}-${n}`;
			n++;
		}
		usedCodes.add(candidate);
		if (item.isAuto) {
			console.log(`ℹ️  ${item.file} 沒填網址代稱,自動產生代碼:/s/${candidate}`);
		}
		// Cloudflare Pages 的 _redirects 語法:來源路徑 + 空白 + 目的地網址 + 空白 + 狀態碼
		lines.push(`/s/${candidate}  ${item.destination}  ${item.redirectType}`);
	}

	const redirectsPath = path.join(distDir, '_redirects');
	// 如果 dist/_redirects 已經因為其他原因存在,用附加而不是覆蓋,避免蓋掉其他規則。
	const existing = existsSync(redirectsPath) ? readFileSync(redirectsPath, 'utf-8').trimEnd() + '\n' : '';
	const header =
		'# 以下規則由 scripts/generate-redirects.mjs 根據 src/content/shortlink/ 自動產生,請勿手動編輯這個區塊\n';
	writeFileSync(redirectsPath, existing + header + lines.join('\n') + (lines.length ? '\n' : ''));

	console.log(`已產生 ${lines.length} 條短網址轉址規則到 ${path.relative(root, redirectsPath)}`);
}

main();
