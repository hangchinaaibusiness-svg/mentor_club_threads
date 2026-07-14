'use strict';
/*
 * get-token.js — Đổi "code" (sau khi bấm Cho phép ở link OAuth) thành TOKEN Threads dài hạn 60 ngày.
 * CHẠY CỤC BỘ (không dùng trong workflow). In token ra để bạn dán vào GitHub Secret THREADS_ACCESS_TOKEN.
 *
 *   node src/get-token.js <THREADS_APP_ID> <THREADS_APP_SECRET> <REDIRECT_URI> <CODE>
 *
 * Link lấy code (mở trên trình duyệt, dùng THREADS App ID, MIỀN threads.com):
 *   https://www.threads.com/oauth/authorize?client_id=<THREADS_APP_ID>&redirect_uri=<REDIRECT_URI>&scope=threads_basic,threads_content_publish&response_type=code
 */
const GT = 'https://graph.threads.net';
const [, , APP_ID, SECRET, REDIRECT, RAW] = process.argv;
const CODE = (RAW || '').replace(/#_$/, '').trim();
if (!APP_ID || !SECRET || !REDIRECT || !CODE) {
  console.error('Dùng: node src/get-token.js <THREADS_APP_ID> <THREADS_APP_SECRET> <REDIRECT_URI> <CODE>');
  process.exit(1);
}
(async () => {
  let r = await fetch(`${GT}/oauth/access_token`, {
    method: 'POST',
    body: new URLSearchParams({ client_id: APP_ID, client_secret: SECRET, grant_type: 'authorization_code', redirect_uri: REDIRECT, code: CODE }),
  });
  let j = await r.json();
  if (!j.access_token) { console.error('Đổi code lỗi:', JSON.stringify(j)); process.exit(2); }
  const shortTok = j.access_token;
  r = await fetch(`${GT}/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(SECRET)}&access_token=${encodeURIComponent(shortTok)}`);
  j = await r.json();
  if (!j.access_token) { console.error('Đổi token dài hạn lỗi:', JSON.stringify(j)); process.exit(3); }
  const longTok = j.access_token, days = Math.round((j.expires_in || 0) / 86400);
  let uid = '';
  try { const me = await (await fetch(`${GT}/v1.0/me?fields=id,username&access_token=${encodeURIComponent(longTok)}`)).json(); uid = me.id || ''; if (me.username) console.error(`Threads user: @${me.username} (${me.id})`); } catch {}
  console.error(`✔ Token dài hạn ~${days} ngày. Đặt 2 giá trị sau vào GitHub:`);
  console.error('  Secret THREADS_ACCESS_TOKEN =');
  console.log(longTok);
  if (uid) console.error('  Variable THREADS_USER_ID = ' + uid);
})().catch(e => { console.error('FATAL', e.message || e); process.exit(1); });
