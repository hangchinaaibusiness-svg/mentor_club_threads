'use strict';
/*
 * post-threads.js — Đăng bài lên THREADS (Meta) từ bảng "14.7 Đăng Threads" trong Lark Base.
 * Chạy được cả trên GitHub Actions (cloud) lẫn máy cá nhân. Cấu hình 100% qua biến môi trường.
 *
 *   node src/post-threads.js            đăng thật các dòng đủ điều kiện
 *   node src/post-threads.js --dry-run  liệt kê, không đăng
 *   node src/post-threads.js --host-only tải file Lark + host lấy URL, KHÔNG đăng (test)
 *
 * Điều kiện 1 dòng: Trạng thái ≠ "Thành công" + có Nội dung (hoặc media) + (Lịch đăng trống/đã tới giờ).
 * Threads đăng 2 bước: tạo container /threads -> publish /threads_publish. Ảnh/Video PHẢI là URL công khai
 * (script tự host file Lark lên MEDIA_BASE qua FTP nếu chỉ có file đính kèm).
 */
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const L = require('./lark');
const cfg = L.cfg;
const TH = `https://graph.threads.net/${cfg.TH_VER}`;
const DRY = process.argv.includes('--dry-run');
const HOST_ONLY = process.argv.includes('--host-only');
// Nút bấm 1 dòng: đăng ĐÚNG record này (bỏ qua canh giờ). Lấy từ env RECORD_ID hoặc --record <id>.
const argRec = process.argv.includes('--record') ? process.argv[process.argv.indexOf('--record') + 1] : '';
const ONLY_REC = (process.env.RECORD_ID || argRec || '').trim();

const F = { content: 'Nội dung', type: 'Loại', comment: 'Comment ebook', mediaAtt: 'Ảnh/video', mediaUrl: 'Ảnh URL (công khai)',
            schedule: 'Lịch đăng bài', status: 'Trạng thái', linkPost: 'Link bài đăng', postId: 'Threads post ID',
            log: 'Log', postedAt: 'Đăng lúc' };
const seenComments = new Set(); // comment PHẢI khác nhau từng dòng (Threads chặn reply trùng)
const DONE = 'Thành công', FAIL = 'Thất bại';
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(now(), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const plain = L.plain;
const isVid = a => /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(a.name || '') || /^video/i.test(a.type || '');

function hostMedia(localPath, name) {
  if (!cfg.FTP_HOST || !cfg.FTP_USER || !cfg.FTP_PASS) throw new Error('thiếu HANGCHINA_FTP_* để host ảnh/video (chỉ đăng được TEXT hoặc URL công khai)');
  const remote = `${Date.now()}_${(name || 'm').replace(/[^\w.]/g, '')}`;
  const url = `ftp://${cfg.FTP_HOST}/${cfg.MEDIA_DIR}/${remote}`;
  execFileSync('curl', ['-sS', '--ftp-create-dirs', '-T', localPath, url, '--user', `${cfg.FTP_USER}:${cfg.FTP_PASS}`], { stdio: 'pipe' });
  return `${cfg.MEDIA_BASE}/${cfg.MEDIA_DIR}/${remote}`;
}

async function thFetch(url, params, method = 'POST') {
  const body = new URLSearchParams(params || {});
  const full = method === 'GET' ? url + '?' + body.toString() : url;
  const r = await fetch(full, method === 'GET' ? { method: 'GET' } : { method: 'POST', body });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { _raw: t }; }
  if (!r.ok || j.error) throw new Error('Threads ' + r.status + ': ' + JSON.stringify(j.error || j._raw || j));
  return j;
}
async function threadsUserId(tok) {
  // LUÔN lấy id qua /me — user_id từ OAuth KHÔNG dùng để đăng được.
  const j = await thFetch(`${TH}/me`, { fields: 'id,username', access_token: tok }, 'GET');
  log(`   Threads user: @${j.username || '?'} (${j.id})`);
  return j.id;
}
async function createContainer(uid, tok, { mediaType, text, imageUrl, videoUrl }) {
  const p = { media_type: mediaType, access_token: tok };
  if (text) p.text = text;
  if (mediaType === 'IMAGE' && imageUrl) p.image_url = imageUrl;
  if (mediaType === 'VIDEO' && videoUrl) p.video_url = videoUrl;
  const j = await thFetch(`${TH}/${uid}/threads`, p, 'POST');
  if (!j.id) throw new Error('không tạo được container');
  return j.id;
}
async function waitReady(cid, tok, maxSec = 120) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxSec * 1000) {
    const j = await thFetch(`${TH}/${cid}`, { fields: 'status,error_message', access_token: tok }, 'GET');
    if (j.status === 'FINISHED') return;
    if (j.status === 'ERROR' || j.status === 'EXPIRED') throw new Error('container ' + j.status + ': ' + (j.error_message || ''));
    await sleep(3000);
  }
  throw new Error('container chưa sẵn sàng sau ' + maxSec + 's');
}
async function publish(uid, tok, cid) {
  const j = await thFetch(`${TH}/${uid}/threads_publish`, { creation_id: cid, access_token: tok }, 'POST');
  if (!j.id) throw new Error('publish không trả id');
  return j.id;
}
async function permalink(mediaId, tok) {
  try { const j = await thFetch(`${TH}/${mediaId}`, { fields: 'permalink', access_token: tok }, 'GET'); return j.permalink || ''; }
  catch { return ''; }
}
// Comment đầu = reply TEXT vào chính bài (giống "Comment ebook" của 14.3).
async function postReply(uid, tok, replyToId, text) {
  // Chờ Threads propagate bài vừa đăng rồi mới reply (tránh lỗi 427900 "resource does not exist").
  await sleep(6000);
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const cont = await thFetch(`${TH}/${uid}/threads`, { media_type: 'TEXT', text: text.slice(0, 500), reply_to_id: replyToId, access_token: tok }, 'POST');
      if (!cont.id) throw new Error('không tạo được reply container');
      return await publish(uid, tok, cont.id);
    } catch (e) { lastErr = e; await sleep(6000); }
  }
  throw lastErr;
}
function scheduleMs(cell) {
  if (cell == null) return null; if (typeof cell === 'number') return cell;
  const t = plain(cell).trim(); if (!t) return null;
  const m = t.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  const d = new Date(t); return isNaN(d) ? null : d.getTime();
}

(async () => {
  if (!DRY && !HOST_ONLY && !cfg.TH_TOKEN) { console.error('!! Thiếu THREADS_ACCESS_TOKEN.'); process.exit(2); }
  const tk = await L.token();
  const tid = cfg.TABLE_ID || await L.findTableByName(tk, cfg.TABLE_NAME);
  if (!tid) throw new Error(`Không thấy bảng "${cfg.TABLE_NAME}" trong Base — chạy init-tables trước.`);
  let rows;
  if (ONLY_REC) {
    const rec = await L.getRecord(tk, tid, ONLY_REC);
    rows = rec ? [rec] : [];
    log(`Đăng 1 dòng theo record_id=${ONLY_REC} (bỏ qua canh giờ).` + (HOST_ONLY ? ' [HOST-ONLY]' : DRY ? ' [DRY-RUN]' : ''));
  } else {
    rows = await L.listRecords(tk, tid);
    log(`Đọc ${rows.length} dòng từ bảng ${cfg.TABLE_NAME} (${tid}).` + (HOST_ONLY ? ' [HOST-ONLY]' : DRY ? ' [DRY-RUN]' : ''));
  }

  let uid = '';
  if (!DRY && !HOST_ONLY) uid = await threadsUserId(cfg.TH_TOKEN);

  const nowMs = Date.now();
  let ok = 0, err = 0, wait = 0, skip = 0;
  for (const row of rows) {
    const recId = row.record_id;
    // LUÔN DUYỆT: chỉ đăng dòng "Chờ đăng" (đã được người duyệt). Trạng thái khác đều bỏ qua.
    const st = plain(row.fields[F.status]).trim();
    if (st !== 'Chờ đăng') { skip++; if (ONLY_REC) log(`  [BỎ QUA] ${recId}: Trạng thái="${st || '(trống)'}" ≠ "Chờ đăng" → duyệt rồi mới đăng.`); continue; }
    const text = plain(row.fields[F.content]).trim();
    const loai = plain(row.fields[F.type]).trim();
    const atts = Array.isArray(row.fields[F.mediaAtt]) ? row.fields[F.mediaAtt] : [];
    const urlCell = plain(row.fields[F.mediaUrl]).trim();
    const hasMedia = atts.length > 0 || !!urlCell;
    if (!text && !hasMedia) { skip++; continue; }
    if (cfg.RESPECT_SCHEDULE && !ONLY_REC) { const s = scheduleMs(row.fields[F.schedule]); if (s && s > nowMs) { log(`  [CHỜ GIỜ] ${recId}: ${new Date(s).toISOString().slice(0, 16)}`); wait++; continue; } }

    let kind = /video/i.test(loai) ? 'VIDEO' : /ảnh|hình|image|photo/i.test(loai) ? 'IMAGE'
      : hasMedia ? (atts.some(isVid) ? 'VIDEO' : 'IMAGE') : 'TEXT';
    let txt = text.length > 500 ? text.slice(0, 500) : text;
    log(`  >> ${recId} | ${kind} | "${txt.slice(0, 50).replace(/\n/g, ' ')}"${txt.length !== text.length ? ' [cắt 500]' : ''}`);
    if (DRY) { if (hasMedia) log(`     [DRY] media: ${urlCell || atts.map(a => a.name).join(', ')}`); continue; }

    const tmp = [];
    try {
      let imageUrl = '', videoUrl = '';
      if (kind !== 'TEXT') {
        if (urlCell) { if (kind === 'VIDEO') videoUrl = urlCell; else imageUrl = urlCell; }
        else {
          const f = kind === 'VIDEO' ? (atts.find(isVid) || atts[0]) : (atts.find(a => !isVid(a)) || atts[0]);
          const p = path.join(os.tmpdir(), `th_${recId}_${(f.name || 'm').replace(/[^\w.]/g, '')}`);
          await L.downloadMedia(tk, tid, f.file_token, p); tmp.push(p);
          const hosted = hostMedia(p, f.name); log(`     ↑ host: ${hosted}`);
          if (kind === 'VIDEO') videoUrl = hosted; else imageUrl = hosted;
        }
      }
      if (HOST_ONLY) { log(`     [host-only] URL: ${imageUrl || videoUrl || '(text)'} — KHÔNG đăng`); continue; }
      const cid = await createContainer(uid, cfg.TH_TOKEN, { mediaType: kind, text: txt, imageUrl, videoUrl });
      if (kind !== 'TEXT') await waitReady(cid, cfg.TH_TOKEN);
      const mediaId = await publish(uid, cfg.TH_TOKEN, cid);
      const link = await permalink(mediaId, cfg.TH_TOKEN);
      // Comment đầu (reply) — nội dung PHẢI khác nhau từng dòng, tránh Threads chặn spam.
      let cmtNote = '';
      const commentText = plain(row.fields[F.comment]).trim();
      if (commentText) {
        const key = commentText.toLowerCase();
        if (seenComments.has(key)) { cmtNote = ' (⚠ comment TRÙNG — bỏ qua)'; log(`     ⚠ comment trùng dòng trước, KHÔNG đăng comment.`); }
        else {
          seenComments.add(key);
          try { await postReply(uid, cfg.TH_TOKEN, mediaId, commentText); cmtNote = ' +cmt'; }
          catch (e) { cmtNote = ' (cmt lỗi)'; log(`     ! comment lỗi: ${String(e.message || e).slice(0, 120)}`); }
        }
      }
      await L.updateRow(tk, tid, recId, {
        [F.status]: DONE, [F.postId]: String(mediaId), [F.postedAt]: Date.now(),
        [F.linkPost]: link ? { link, text: 'Xem trên Threads' } : undefined,
        [F.log]: `${now()} - OK - ${mediaId}${cmtNote}`,
      });
      log(`     ✔ ĐÃ ĐĂNG: ${link || mediaId}${cmtNote}`); ok++;
    } catch (e) {
      const msg = String(e.message || e).slice(0, 300); log(`     ✖ LỖI: ${msg}`);
      try { await L.updateRow(tk, tid, recId, { [F.status]: FAIL, [F.log]: `${now()} - LỖI - ${msg}` }); } catch {}
      err++;
    } finally { tmp.forEach(p => { try { fs.unlinkSync(p); } catch {} }); }
  }
  log(`Xong. Đăng: ${ok}, Lỗi: ${err}, Chờ giờ: ${wait}, Bỏ qua: ${skip}.`);
})().catch(e => { console.error('FATAL', e.message || e); process.exit(1); });
