// bot.js — Telegram Bot для Barbaleo Club
const https = require('https');
const http = require('http');

const BOT_TOKEN  = process.env.BOT_TOKEN;
const ADMIN_ID   = process.env.ADMIN_ID;
const WEBAPP_URL = process.env.WEBAPP_URL;
const SB_URL     = process.env.SB_URL;
const SB_KEY     = process.env.SB_KEY;
const PORT       = process.env.PORT || 3000;

function tgApi(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let s = '';
      res.on('data', c => s += c);
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch(e) { resolve({}); } });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

function sendMessage(chatId, text, extra = {}) {
  return tgApi('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', ...extra });
}

function sbReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: new URL(SB_URL).hostname,
      path: '/rest/v1/' + path,
      method,
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        'Prefer': method === 'PATCH' ? 'return=minimal' : '',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let s = '';
      res.on('data', c => s += c);
      res.on('end', () => { try { resolve(s ? JSON.parse(s) : null); } catch(e) { resolve(null); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatTime(t) { return t ? t.slice(0, 5) : ''; }

async function notifyAdmin(booking) {
  const services = (booking.services || []).map(s => `  • ${s.name} — ${s.price} ₽`).join('\n');
  const client = booking.client_telegram_username
    ? `${booking.client_name} (@${booking.client_telegram_username})`
    : booking.client_name || 'Клиент';
  const phone = booking.client_phone ? `\n📞 ${booking.client_phone}` : '';
  await sendMessage(ADMIN_ID,
    `🗓 *Новая запись!*\n\n👤 ${client}${phone}\n📅 ${formatDate(booking.date)}\n🕐 ${formatTime(booking.time)}\n\n*Услуги:*\n${services}\n\n💰 Итого: *${booking.total_price} ₽*\n⏱ Длительность: ~${booking.total_duration} мин`
  );
}

async function notifyAdminCancel(booking) {
  const client = booking.client_telegram_username
    ? `${booking.client_name} (@${booking.client_telegram_username})`
    : booking.client_name || 'Клиент';
  const phone = booking.client_phone ? `\n📞 ${booking.client_phone}` : '';
  const services = (booking.services || []).map(s => `  • ${s.name}`).join('\n');
  await sendMessage(ADMIN_ID,
    `❌ *Клиент отменил запись*\n\n👤 ${client}${phone}\n📅 ${formatDate(booking.date)}\n🕐 ${formatTime(booking.time)}\n\n*Услуги:*\n${services}\n\n💰 Сумма: *${booking.total_price} ₽*`
  );
}

async function notifyClient(booking) {
  if (!booking.client_telegram_id) return;
  const services = (booking.services || []).map(s => `  • ${s.name}`).join('\n');
  await sendMessage(booking.client_telegram_id,
    `✅ *Вы записаны в Barbaleo Club!*\n\n📅 ${formatDate(booking.date)}\n🕐 ${formatTime(booking.time)}\n\n*Услуги:*\n${services}\n\n💰 Сумма: *${booking.total_price} ₽*\n\nМы напомним за 3 часа до приёма. До встречи! ✂`,
    { reply_markup: { inline_keyboard: [[{ text: '✂ Записаться ещё', web_app: { url: WEBAPP_URL } }]] } }
  );
}

async function sendReminders() {
  if (!SB_URL || !SB_KEY) return;
  try {
    const now = new Date();
    const from = new Date(now.getTime() + 170 * 60000);
    const to   = new Date(now.getTime() + 190 * 60000);
    const fromDate = from.toISOString().slice(0, 10);
    const toDate   = to.toISOString().slice(0, 10);
    const fromTime = from.toISOString().slice(11, 19);
    const toTime   = to.toISOString().slice(11, 19);

    let query;
    if (fromDate === toDate) {
      query = `bookings?date=eq.${fromDate}&time=gte.${fromTime}&time=lte.${toTime}&status=eq.pending&reminder_sent=eq.false&client_telegram_id=not.is.null`;
    } else {
      query = `bookings?date=in.(${fromDate},${toDate})&status=eq.pending&reminder_sent=eq.false&client_telegram_id=not.is.null`;
    }

    const rows = await sbReq('GET', query) || [];
    for (const booking of rows) {
      const bookingDt = new Date(`${booking.date}T${booking.time}`);
      const diffMin = (bookingDt - now) / 60000;
      if (diffMin < 170 || diffMin > 190) continue;
      try {
        const services = (booking.services || []).map(s => `  • ${s.name}`).join('\n');
        await sendMessage(booking.client_telegram_id,
          `⏰ *Напоминание: вы записаны через 3 часа!*\n\n✂ *Barbaleo Club*\n📅 ${formatDate(booking.date)}\n🕐 ${formatTime(booking.time)}\n\n*Услуги:*\n${services}\n\nБудем ждать вас! ♛`
        );
        await sbReq('PATCH', `bookings?id=eq.${booking.id}`, { reminder_sent: true });
        console.log(`Reminder sent: booking ${booking.id} → tg ${booking.client_telegram_id}`);
      } catch(e) {
        console.error(`Reminder failed for booking ${booking.id}:`, e.message);
      }
    }
  } catch(e) {
    console.error('Reminder scheduler error:', e.message);
  }
}

async function handleUpdate(update) {
  const msg = update.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const isAdmin = String(chatId) === String(ADMIN_ID);

  if (text.startsWith('/start')) {
    const param = text.split(' ')[1];
    if (param === 'admin' && isAdmin) {
      await sendMessage(chatId, '👑 *Добро пожаловать в админку Barbaleo*', {
        reply_markup: { inline_keyboard: [[{ text: '⚙ Открыть админку', web_app: { url: WEBAPP_URL + '?admin=1' } }]] },
      });
    } else {
      await sendMessage(chatId, `✂ *Barbaleo Club* — мужской барбершоп\n\nЗаписывайтесь онлайн — быстро и удобно!`, {
        reply_markup: { inline_keyboard: [[{ text: '✂ Записаться', web_app: { url: WEBAPP_URL } }]] },
      });
    }
    return;
  }

  if (text === '/admin' && isAdmin) {
    await sendMessage(chatId, '👑 Панель управления:', {
      reply_markup: { inline_keyboard: [[{ text: '⚙ Открыть админку', web_app: { url: WEBAPP_URL + '?admin=1' } }]] },
    });
    return;
  }

  await sendMessage(chatId, 'Нажмите кнопку ниже чтобы записаться:', {
    reply_markup: { inline_keyboard: [[{ text: '✂ Записаться в Barbaleo', web_app: { url: WEBAPP_URL } }]] },
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const data = JSON.parse(body);
      if (req.url === '/webhook') {
        await handleUpdate(data);
        res.writeHead(200); res.end('ok');
        return;
      }
      if (req.url === '/notify') {
        const booking = data.booking || data;
        await Promise.allSettled([notifyAdmin(booking), notifyClient(booking)]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.url === '/notify-cancel') {
        const booking = data.booking || data;
        await notifyAdminCancel(booking);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.writeHead(404); res.end();
    } catch(e) {
      console.error('Server error:', e.message);
      res.writeHead(500); res.end();
    }
  });
});

server.listen(PORT, async () => {
  console.log(`Barbaleo bot running on port ${PORT}`);
  await tgApi('setMyCommands', { commands: [{ command: 'start', description: 'Записаться в барбершоп' }] });
  console.log('Bot ready.');
});

setInterval(sendReminders, 10 * 60 * 1000);
setTimeout(sendReminders, 30 * 1000);
console.log('Reminder scheduler active (every 10 min).');
