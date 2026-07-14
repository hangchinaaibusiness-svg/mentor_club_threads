'use strict';
/*
 * pull-insights.js — Kéo SỐ LIỆU Threads về bảng 14.7 (CHỈ ĐỌC Threads + ghi số vào Lark, KHÔNG đăng).
 * Mỗi dòng có "Threads post ID" → GET /{id}/insights (views,likes,replies,reposts,quotes)
 * → ghi Views/Likes/Replies/Reposts/Quotes + "Cập nhật số liệu".
 * An toàn để chạy theo lịch (read-only, không public gì).
 */
const L = require('./lark');
const cfg = L.cfg;
const TH = `https://graph.threads.net/${cfg.TH_VER}`;
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(now(), ...a);
const plain = L.plain;

async function insights(postId) {
  const r = await fetch(`${TH}/${postId}/insights?metric=views,likes,replies,reposts,quotes&access_token=${cfg.TH_TOKEN}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  const out = {};
  for (const m of (j.data || [])) {
    out[m.name] = (m.total_value && m.total_value.value != null) ? m.total_value.value : (m.values && m.values[0] ? m.values[0].value : 0);
  }
  return out;
}

(async () => {
  if (!cfg.TH_TOKEN) { console.error('Thiếu THREADS_ACCESS_TOKEN'); process.exit(1); }
  const tk = await L.token();
  const tid = cfg.TABLE_ID || await L.findTableByName(tk, cfg.TABLE_NAME);
  if (!tid) throw new Error('Không thấy bảng ' + cfg.TABLE_NAME);
  const rows = await L.listRecords(tk, tid);
  let done = 0, skip = 0, err = 0;
  for (const r of rows) {
    const pid = plain(r.fields['Threads post ID']).trim();
    if (!pid) { skip++; continue; }
    try {
      const m = await insights(pid);
      await L.updateRow(tk, tid, r.record_id, {
        'Views': m.views || 0, 'Likes': m.likes || 0, 'Replies': m.replies || 0,
        'Reposts': m.reposts || 0, 'Quotes': m.quotes || 0, 'Cập nhật số liệu': Date.now(),
      });
      log(`  ✔ ${pid}: views=${m.views || 0} likes=${m.likes || 0} replies=${m.replies || 0}`); done++;
    } catch (e) { log(`  ✖ ${pid}: ${String(e.message || e).slice(0, 120)}`); err++; }
  }
  log(`Xong. Cập nhật: ${done}, Bỏ qua: ${skip}, Lỗi: ${err}.`);
})().catch(e => { console.error('FATAL', e.message || e); process.exit(1); });
