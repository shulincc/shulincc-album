// 2026-09-17 Hashtag 功能,搬自主站 shulincc-site 的 src/lib/tags.ts(核心正規表示式
// 邏輯完全比照抄過來,理由跟主站一樣:同仁在「簡介文字」或「內文」裡打字時,
// 像社群貼文一樣自然打 #親子、#戶外教學 這種標籤,不用另外學一個新欄位,存檔後
// 系統自動抓出來、連到 /tags/{tag}/ 彙整頁。
//
// 跟主站不同的地方:主站掃描對象是十幾種不同 collection 的文章本文;相簿站的
// 「內文」只有兩個地方會出現同仁自己打的文字——相簿式版面的 intro(純文字,
// 不是 HTML)跟文章式版面的 body(markdown,經 render() 轉成 HTML)。extractTags/
// linkifyHashtags 這兩個函式本身不用改(設計上本來就是處理「純文字或HTML混雜」
// 的字串,intro 這種完全沒有 HTML 標籤的純文字也相容),只有 getAllTagRows() 蒐集
// 資料的邏輯要換成掃 classalbum。
import { getCollection, render } from 'astro:content';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { albumUrlSlug } from './slug';

const TAG_SPLIT_PATTERN = '(<[^>]*>)';
const HASHTAG_PATTERN = '(?<!&)#([^\\s#<>"\'/&;，。！？、；：]+)';
const TRAILING_PUNCT_PATTERN = /[，。！？～、；：,.!?~;:)）】」』〉》]+$/;

function cleanTagToken(raw: string): string | null {
	const t = raw.replace(TRAILING_PUNCT_PATTERN, '').trim();
	if (!t) return null;
	// 十六進位色碼(3/4/6/8 碼)長得跟短標籤很像,保險起見擋掉。
	if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{4}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(t)) return null;
	if (/^\d+$/.test(t)) return null;
	if (t.length > 30) return null;
	return t;
}

function forEachTextSegment(html: string, transform: (segment: string) => string): string {
	const parts = html.split(new RegExp(TAG_SPLIT_PATTERN, 'g'));
	return parts.map((part, i) => (i % 2 === 1 ? part : transform(part))).join('');
}

export function extractTags(html: string | undefined): string[] {
	if (!html) return [];
	const found = new Set<string>();
	forEachTextSegment(html, (segment) => {
		const re = new RegExp(HASHTAG_PATTERN, 'g');
		let m: RegExpExecArray | null;
		while ((m = re.exec(segment))) {
			const tag = cleanTagToken(m[1]);
			if (tag) found.add(tag);
		}
		return segment;
	});
	return Array.from(found);
}

export function linkifyHashtags(html: string): string {
	return forEachTextSegment(html, (segment) =>
		segment.replace(new RegExp(HASHTAG_PATTERN, 'g'), (match, rawTag) => {
			const tag = cleanTagToken(rawTag);
			if (!tag) return match;
			return `<a class="post-tag" href="/tags/${encodeURIComponent(tag)}/">#${tag}</a>`;
		})
	);
}

// 純文字轉成能安全塞進 HTML 的字串(intro 欄位是同仁打的純文字,不是 markdown/HTML,
// 直接原樣塞進 HTML 有 XSS 疑慮,例如同仁不小心打了 "<script>" 這幾個字面字元)。
// 先跳脫特殊字元,linkifyHashtags 只會在文字段落裡插入我們自己產生的 <a> 標籤,
// 兩者順序:先跳脫、再插入標籤,不會互相干擾。
function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function introToSafeHtml(intro: string): string {
	return linkifyHashtags(escapeHtml(intro));
}

export interface TagRow {
	title: string;
	date: string;
	url: string;
	cover?: string;
}

// 2026-09-17 掃描全部 classalbum 內容(intro 純文字 + article 版面的 body markdown)
// 抓出所有 #hashtag,回傳 tag -> 相簿列表的對照表,給 /tags/ 系列頁面用。
export async function getAllTagRows(): Promise<Map<string, TagRow[]>> {
	const map = new Map<string, TagRow[]>();
	const add = (tag: string, row: TagRow) => {
		const list = map.get(tag) ?? [];
		list.push(row);
		map.set(tag, list);
	};

	const albums = await getCollection('classalbum');
	const container = await AstroContainer.create();

	for (const entry of albums) {
		const url = `/${entry.data.year}/${albumUrlSlug(entry.id, entry.data.year)}/`;
		const row: TagRow = {
			title: entry.data.title,
			date: entry.data.date.toISOString().slice(0, 10),
			url,
			cover: entry.data.cover,
		};

		const tagsFromIntro = extractTags(entry.data.intro);
		tagsFromIntro.forEach((tag) => add(tag, row));

		// article 版面才有 body 內文,gallery 版面沒有(見 content.config.ts 的說明,
		// body 不是 frontmatter 欄位,要用 render() 取得實際內容)——避免每篇 gallery
		// 版面的相簿都白白 render 一次。
		if (entry.data.layout === 'article') {
			const { Content } = await render(entry);
			const bodyHtml = await container.renderToString(Content);
			const tagsFromBody = extractTags(bodyHtml);
			tagsFromBody.forEach((tag) => {
				// 同一篇文章 intro 跟 body 都打了同一個標籤時,不要把同一篇相簿重複列兩次。
				const existing = map.get(tag);
				if (!existing?.some((r) => r.url === row.url)) add(tag, row);
			});
		}
	}

	for (const rows of map.values()) {
		rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
	}

	return map;
}
