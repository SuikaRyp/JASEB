const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const fetch = require("node-fetch");
const FormData = require("form-data");
const { fileTypeFromBuffer } = require("file-type");
const { spawn } = require("child_process");
const AdmZip = require("adm-zip");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const { BOT_TOKEN, ADMIN_USERS } = require("./config");

// ====== INIT TELEGRAM BOT (dengan proteksi biar gak dobel) ======
if (!global.bot) {
  const TelegramBot = require("node-telegram-bot-api");
  global.bot = new TelegramBot(BOT_TOKEN, { polling: true });
}
const bot = global.bot;

// ================== GROUPS DB ==================
const groupsPath = path.join(__dirname, "groups.js");
let GROUPS = [];

if (!fs.existsSync(groupsPath)) {
  fs.writeFileSync(groupsPath, "module.exports = [];\n", "utf8");
  console.log("✅ File groups.js dibuat otomatis!");
}

function loadGroups() {
  try {
    delete require.cache[require.resolve("./groups")];
    GROUPS = require("./groups");
    if (!Array.isArray(GROUPS)) GROUPS = [];
  } catch {
    GROUPS = [];
  }
}
function saveGroups() {
  const unique = [...new Set(GROUPS)];
  const content = `module.exports = ${JSON.stringify(unique, null, 2)};\n`;
  fs.writeFileSync(groupsPath, content, "utf8");
  loadGroups();
}
loadGroups();

// ================== USERS DB ==================
const usersPath = path.join(__dirname, "user.json");
let USERS = [];

if (!fs.existsSync(usersPath)) {
  fs.writeFileSync(usersPath, JSON.stringify([], null, 2), "utf8");
  console.log("✅ File user.json dibuat otomatis!");
}
function loadUsers() {
  try {
    USERS = JSON.parse(fs.readFileSync(usersPath));
    if (!Array.isArray(USERS)) USERS = [];
  } catch {
    USERS = [];
  }
}
function saveUsers() {
  fs.writeFileSync(usersPath, JSON.stringify([...new Set(USERS)], null, 2), "utf8");
  loadUsers();
}
bot.on("message", (msg) => {
  const userId = msg.from.id;
  loadUsers();
  if (!USERS.includes(userId)) {
    USERS.push(userId);
    saveUsers();
  }
});

// ================== PREMIUM DB ==================
const premiumPath = path.join(__dirname, "premium.js");
let PREMIUM = {};
function loadPremium() {
  if (fs.existsSync(premiumPath)) {
    delete require.cache[require.resolve("./premium")];
    PREMIUM = require("./premium");
  } else {
    PREMIUM = {};
    savePremium();
  }
}
function savePremium() {
  const content = `module.exports = ${JSON.stringify(PREMIUM, null, 2)};\n`;
  fs.writeFileSync(premiumPath, content, "utf8");
  loadPremium();
}
function isPremium(userId) {
  loadPremium();
  const data = PREMIUM[userId];
  if (!data) return false;
  if (Date.now() > data.expired) {
    delete PREMIUM[userId];
    savePremium();
    bot.sendMessage(userId, "⚠️ Akses Premium kamu sudah habis.");
    return false;
  }
  return true;
}
loadPremium();

// ================== BLACKLIST DB ==================
const blacklistPath = path.join(__dirname, "blacklist.json");
let BLACKLIST = [];

if (!fs.existsSync(blacklistPath)) {
  fs.writeFileSync(blacklistPath, JSON.stringify([], null, 2), "utf8");
}

function loadBlacklist() {
  try {
    BLACKLIST = JSON.parse(fs.readFileSync(blacklistPath));
    if (!Array.isArray(BLACKLIST)) BLACKLIST = [];
  } catch {
    BLACKLIST = [];
  }
}

function saveBlacklist() {
  fs.writeFileSync(blacklistPath, JSON.stringify([...new Set(BLACKLIST)], null, 2), "utf8");
  loadBlacklist();
}
loadBlacklist();

// ================== CHANNEL DB ==================
const channelsPath = path.join(__dirname, "channels.json");
let CHANNELS = [];

if (!fs.existsSync(channelsPath)) {
  fs.writeFileSync(channelsPath, JSON.stringify([], null, 2), "utf8");
}

function loadChannels() {
  try {
    CHANNELS = JSON.parse(fs.readFileSync(channelsPath));
    if (!Array.isArray(CHANNELS)) CHANNELS = [];
  } catch {
    CHANNELS = [];
  }
}

function saveChannels() {
  fs.writeFileSync(channelsPath, JSON.stringify([...new Set(CHANNELS)], null, 2), "utf8");
  loadChannels();
}
loadChannels();

const KEYS_DB = path.join(__dirname, "keys.json");

function loadKeys() {
  if (!fs.existsSync(KEYS_DB)) return [];
  try {
    return JSON.parse(fs.readFileSync(KEYS_DB, "utf8"));
  } catch {
    return [];
  }
}
function saveKeys(keys) {
  fs.writeFileSync(KEYS_DB, JSON.stringify(keys, null, 2));
}

// ================== AUTO SIMPAN / HAPUS CHANNEL ==================
bot.on("my_chat_member", async (update) => {
  try {
    const chat = update.chat;
    const newStatus = update.new_chat_member?.status;
    const oldStatus = update.old_chat_member?.status;

    // Jika bot ditambahkan ke channel
    if (chat.type === "channel" && newStatus === "administrator" && oldStatus === "left") {
      const channelId = String(chat.id);
      loadChannels();
      if (!CHANNELS.includes(channelId)) {
        CHANNELS.push(channelId);
        saveChannels();
        console.log(`✅ Channel baru disimpan: ${channelId}`);
      }
    }

    // Jika bot dikeluarkan dari channel
    if (chat.type === "channel" && ["left", "kicked"].includes(newStatus)) {
      const channelId = String(chat.id);
      loadChannels();
      if (CHANNELS.includes(channelId)) {
        CHANNELS = CHANNELS.filter(c => c !== channelId);
        saveChannels();
        console.log(`❌ Channel dihapus dari database: ${channelId}`);
      }
    }
  } catch (err) {
    console.error("Error my_chat_member channel:", err);
  }
});

// ================== DETEKSI BOT MASUK & KELUAR GROUP ==================
bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  // ✅ Simpan otomatis groupId jika pesan dari grup
  if (["group", "supergroup"].includes(msg.chat.type)) {
    loadGroups();
    if (!GROUPS.includes(String(chatId))) {
      GROUPS.push(String(chatId));
      saveGroups();
      console.log(`✅ Group baru terdeteksi & disimpan: ${chatId}`);
    }
  }

  // ✅ Simpan userId ke database USERS
  const userId = msg.from.id;
  loadUsers();
  if (!USERS.includes(userId)) {
    USERS.push(userId);
    saveUsers();
  }
});

bot.on("my_chat_member", async (update) => {
  try {
    const chat = update.chat;
    const newStatus = update.new_chat_member?.status;
    const oldStatus = update.old_chat_member?.status;
    const fromUser = update.from; // user yang menambahkan/mengeluarkan bot

    // ===== BOT DITAMBAHKAN KE GROUP =====
    if (["group", "supergroup"].includes(chat.type) && newStatus === "member" && oldStatus === "left") {
      const groupId = String(chat.id);
      const userId = fromUser.id;

      // Simpan groupId ke database GROUPS
      loadGroups();
      if (!GROUPS.includes(groupId)) {
        GROUPS.push(groupId);
        saveGroups();
      }

      // Simpan userId ke database USERS
      loadUsers();
      if (!USERS.includes(userId)) {
        USERS.push(userId);
        saveUsers();
      }

      // Tambahkan user ke Premium (2 hari)
      const expired = Date.now() + 2 * 24 * 60 * 60 * 1000;
      PREMIUM[userId] = { expired };
      savePremium();

      // Notifikasi admin utama
      for (const adminId of ADMIN_USERS) {
        bot.sendMessage(
          adminId,
          `📢 <b>Bot Baru Ditambahkan!</b>\n\n` +
          `👥 Grup: <b>${chat.title}</b> (ID: <code>${groupId}</code>)\n` +
          `👤 Ditambahkan oleh: <b>${fromUser.first_name}</b> (@${fromUser.username || "tidak ada"}) [ID: <code>${userId}</code>]\n\n` +
          `✅ User otomatis diberi akses Premium selama <b>2 hari</b>.`,
          { parse_mode: "HTML" }
        );
      }

      // Notifikasi ke user
      bot.sendMessage(
        userId,
        `🎉 <b>Selamat ${fromUser.first_name}!</b>\n\n` +
        `Kamu telah mendapatkan akses <b>Premium</b> selama <b>2 hari</b> 🚀\n\n` +
        `⏳ Setelah 2 hari, akses Premium akan otomatis dicabut.`,
        { parse_mode: "HTML" }
      ).catch(() => {
        console.log("⚠️ Gagal kirim pesan ke user, mungkin belum chat privat bot.");
      });
    }

    // ===== BOT DIKELUARKAN DARI GROUP =====
    if (["group", "supergroup"].includes(chat.type) && ["kicked", "left"].includes(newStatus)) {
      const groupId = String(chat.id);
      const userId = fromUser.id;

      // Hapus groupId dari database
      loadGroups();
      if (GROUPS.includes(groupId)) {
        GROUPS = GROUPS.filter((g) => g !== groupId);
        saveGroups();
      }

      // Hapus Premium user jika ada
      loadPremium();
      if (PREMIUM[userId]) {
        delete PREMIUM[userId];
        savePremium();
      }

      // Notifikasi admin utama
      for (const adminId of ADMIN_USERS) {
        bot.sendMessage(
          adminId,
          `🚨 <b>Bot Dikeluarkan!</b>\n\n` +
          `👥 Grup: <b>${chat.title || "Tidak diketahui"}</b> (ID: <code>${groupId}</code>)\n` +
          `👤 Dikeluarkan oleh: <b>${fromUser.first_name}</b> (@${fromUser.username || "tidak ada"}) [ID: <code>${userId}</code>]\n\n` +
          `❌ Group ID sudah dihapus dari database.\n❌ Premium user (jika ada) sudah dicabut.`,
          { parse_mode: "HTML" }
        );
      }
    }
  } catch (err) {
    console.error("Error my_chat_member:", err);
  }
});

// ========== FITUR REPLY BOT DENGAN AI (Gemini) ==================
// 🔑 API Key Gemini
const genAI = new GoogleGenerativeAI("AIzaSyAMa-tM6w7sW8_tKV9aZJ9LPePoGRaQRAQ");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Simpan ID Bot agar validasi reply bisa jalan
let BOT_ID = null;
bot.getMe().then(me => {
  BOT_ID = me.id;
  console.log("🤖 Bot ID:", BOT_ID);
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // ✅ Hanya admin utama
  if (!ADMIN_USERS.includes(userId)) return;

  // ✅ Harus reply ke pesan bot
  if (!msg.reply_to_message || msg.reply_to_message.from.id !== BOT_ID) return;

  // ✅ Pertanyaan harus berupa teks
  if (!msg.text) return;

  try {
    // 🔥 Instruksi: selalu bahasa Indonesia, jelas, tepat
    const prompt = `
Kamu adalah asisten AI yang selalu menjawab dengan bahasa Indonesia.
Jawabanmu wajib jelas, padat, dan tepat. Hindari bahasa asing.
Pertanyaan: ${msg.text}
`;

    const result = await model.generateContent(prompt);
    let answer = result.response.text().trim();

    // Tambahkan teks custom
    answer += "\n\n🤖 Saya adalah AI yang dikembangkan oleh Rann (Gemini API)";

    await bot.sendMessage(chatId, answer, {
      reply_to_message_id: msg.message_id,
    });

  } catch (err) {
    console.error("Gemini Error:", err);
    bot.sendMessage(chatId, "❌ Gagal mendapatkan jawaban dari Gemini.", {
      reply_to_message_id: msg.message_id,
    });
  }
});

const MENU_PHOTO = "https://l.top4top.io/p_3522owasj1.jpg";

// Helper: kirim menu pakai foto + blockquote (fallback ke teks)
async function showMenu(chatId, htmlCaption, inline_keyboard) {
  await bot.sendPhoto(chatId, MENU_PHOTO, {
    caption: htmlCaption,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard }
  }).catch(async () => {
    await bot.sendMessage(chatId, htmlCaption, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard }
    });
  });
}

// ========== START ==========
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from.username || msg.from.first_name;

  const usersCount  = (Array.isArray(USERS))  ? USERS.length  : 0;
  const groupsCount = (Array.isArray(GROUPS)) ? GROUPS.length : 0;

  // Frames hacker style + progress bar
  const frames = [
    "🔍 Checking System...\n[░░░░░░░░░░] 0%",
    "⚡ Bypassing Security...\n[▓░░░░░░░░░] 10%",
    "⚡ Bypassing Security...\n[▓▓░░░░░░░░] 20%",
    "🔐 Injecting Module...\n[▓▓▓░░░░░░░] 30%",
    "🔐 Injecting Module...\n[▓▓▓▓░░░░░░] 40%",
    "💻 Installing Dependencies...\n[▓▓▓▓▓░░░░░] 50%",
    "💻 Installing Dependencies...\n[▓▓▓▓▓▓░░░░] 60%",
    "📡 Connecting to Server...\n[▓▓▓▓▓▓▓░░░] 70%",
    "📂 Loading Database...\n[▓▓▓▓▓▓▓▓░░] 80%",
    "📂 Loading Database...\n[▓▓▓▓▓▓▓▓▓░] 90%",
    "✅ Success!\n[▓▓▓▓▓▓▓▓▓▓] 100%",
    "🔓 Access Granted!"
  ];

  let index = 0;
  const loadingMsg = await bot.sendMessage(chatId, frames[index]);

  const showNextFrame = async () => {
    index++;
    if (index < frames.length) {
      // efek typing
      bot.sendChatAction(chatId, "typing").catch(()=>{});

      await bot.editMessageText(frames[index], {
        chat_id: chatId,
        message_id: loadingMsg.message_id
      });

      // delay acak biar realistis (300–1200ms)
      const randomDelay = Math.floor(Math.random() * 900) + 300;
      setTimeout(showNextFrame, randomDelay);
    } else {
      // animasi selesai
      setTimeout(async () => {
        await bot.deleteMessage(chatId, loadingMsg.message_id).catch(()=>{});

        // pesan sambutan utama
        const text = `
<blockquote>
👋 Ola @${user}, Selamat Datang di <b>Bot Jaseb Telegram V2.0 By Rann Serbaguna</b>

👤 USER  : ${usersCount}
👥 GROUP : ${groupsCount}

Silakan pilih menu di bawah ini ⬇️
</blockquote>`.trim();

        await showMenu(chatId, text, [
          [
            { text: "📋 JASEB MENU", callback_data: "menu" },
            { text: "🛠 TOOLS MENU", callback_data: "tools" }
          ],
          [
            { text: "👑 OWNER MENU", callback_data: "owner" }
          ],
          [{ text: "ℹ️ INFORMATION", url: "https://t.me/aboutrann2" }]
        ]);
      }, 1000); // jeda sebentar biar efek Access Granted terasa
    }
  };

  // mulai animasi
  setTimeout(showNextFrame, 500);
});

// ========== CALLBACK ==========
bot.on("callback_query", async (cb) => {
  const chatId = cb.message.chat.id;
  const msgId  = cb.message.message_id;
  const data   = cb.data;

  // Hapus pesan lama (abaikan jika gagal)
  bot.deleteMessage(chatId, msgId).catch(()=>{});

  // 📋 JASEB MENU (fitur grup Telegram)
  if (data === "menu") {
    const text = `
<blockquote>
📋 <b>JASEB MENU (Fitur Grup Telegram)</b>

• /share (balas pesan) → Sebarkan pesan ke semua grup  
• /share2 (balas pesan) → Forward pesan ke semua grup  
• /autobc (balas pesan) → Broadcast otomatis tiap 5 menit  
• /stopbc → Hentikan Auto Broadcast  
• /sharech → Forwed Ke Chanel Telegram 
• /addgrupid (id grup) → Tambahkan ID grup manual  
• /listgroup → Lihat semua grup tersimpan  
• /delgrup (id grup) → Hapus ID grup dan bot keluar  
• /antilink on atau off → Aktifkan atau nonaktifkan proteksi tautan  
• /promote (balas user) → Jadikan user sebagai admin grup  
• /demote (balas user) → Turunkan user dari admin grup  
• /addbl → Tambahkan Daftar Blacklist 
• /deladdbl → Hapus Daftar Blacklist 
</blockquote>`.trim();

    return showMenu(chatId, text, [
      [
        { text: "🛠 TOOLS MENU", callback_data: "tools" },
        { text: "👑 OWNER MENU", callback_data: "owner" }
      ],
      [{ text: "⬅️ Back", callback_data: "back" }]
    ]);
  }

  // 🛠 TOOLS MENU (umum)
  if (data === "tools") {
    const text = `
<blockquote>
🛠 <b>TOOLS MENU</b>

• /cekid → Tampilkan ID kamu  
• /ping → Cek respon bot  
• /help → Bantuan umum  
• /totalfitur → Lihat jumlah semua fitur  
• /tiktok (tautan) → Unduh video TikTok tanpa watermark  
• /tourl → Ubah Foto/Video Jadi Link
• /copyweb (tautan) → Akan Mengcopy Html,CSS,dll 
• /getcode → Ambil Kode Fitur 
• /addcode → Tambahkan Fitur 
• /buatbuton → Membuat Text + Buton
• /fixcode → Fix Fitur Kode
• /fixcodeerror → Fix Kode Eror 
• /buatfitur → Buat Fitur Bot 
• /chtml → Membuat Kode Html
</blockquote>`.trim();

    return showMenu(chatId, text, [
      [
        { text: "📋 JASEB MENU", callback_data: "menu" },
        { text: "👑 OWNER MENU", callback_data: "owner" }
      ],
      [{ text: "⬅️ Back", callback_data: "back" }]
    ]);
  }

  // 👑 OWNER MENU (khusus admin utama; akses command-nya dibatasi di handler command)
  if (data === "owner") {
    const text = `
<blockquote>
👑 <b>OWNER MENU</b>

• /addprem (id) (hari) → Tambahkan Premium ke user  
• /delprem (id) → Cabut Premium user  
• /listprem → Lihat daftar user Premium  
• /hd (balas foto atau stiker) → Tingkatkan kualitas gambar atau stiker  
• /restart → Restart bot  
• /createweb (balas file .html) → Deploy website ke Vercel  
• /admin → Membuat Admin Panel
• /unli → Membuat Panel Unlimited 
• /pay → Menampilkan Detail Payment Admin
• /addkey → Menambahkan Pesan/Stiker
• /listkey → List Daftar Pesan/Stiker 
• /delkey → Hapus Pesan/Stiker 

CARA PAKEK BUG TELEGRAM NYA LIAT DI YOUTUBE 
</blockquote>`.trim();

    return showMenu(chatId, text, [
      [
        { text: "📋 JASEB MENU", callback_data: "menu" },
        { text: "🛠 TOOLS MENU", callback_data: "tools" }
      ],
      [{ text: "⬅️ Back", callback_data: "back" }]
    ]);
  }

  // ⬅️ BACK ke halaman awal
  if (data === "back") {
    const user = cb.from.username || cb.from.first_name;
    const usersCount  = (typeof USERS  !== "undefined" && Array.isArray(USERS))  ? USERS.length  : 0;
    const groupsCount = (typeof GROUPS !== "undefined" && Array.isArray(GROUPS)) ? GROUPS.length : 0;

    const text = `
<blockquote>
👋 Ola @${user}, Selamat Datang di <b>Bot Jaseb Telegram By Rann Serbaguna</b>

👤 USER  : ${usersCount}  
👥 GROUP : ${groupsCount}  

Silakan pilih menu di bawah ini ⬇️
</blockquote>`.trim();

    return showMenu(chatId, text, [
      [
        { text: "📋 JASEB MENU", callback_data: "menu" },
        { text: "🛠 TOOLS MENU", callback_data: "tools" }
      ],
      [
        { text: "👑 OWNER MENU", callback_data: "owner" }
      ],
      [{ text: "ℹ️ INFORMATION", url: "https://t.me/aboutrann2" }]
    ]);
  }
});

// ================== FITUR SHARE ==================
bot.onText(/^\/share$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId) && !isPremium(userId)) {
    return bot.sendMessage(chatId, "⚠️ Fitur ini hanya untuk Admin/Premium user.");
  }
  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, "⚠️ Reply ke pesan yang ingin disebarkan dengan /share");
  }

  const targetMessage = msg.reply_to_message;
  let success = 0, failed = 0;

  for (const group of GROUPS) {
  loadBlacklist();
  if (BLACKLIST.includes(Number(group))) continue; // skip jika grup blacklist

  try {
    await bot.copyMessage(group, chatId, targetMessage.message_id);
    success++;
  } catch {
    failed++;
  }
}

  bot.sendMessage(chatId, `📊 Share selesai!\n✅ Berhasil: ${success}\n❌ Gagal: ${failed}\nTotal Group: ${GROUPS.length}`);
});

// ================== FITUR SHARE2 ==================
bot.onText(/^\/share2$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, "⚠️ Reply pesan untuk /share2");
  }
  if (!ADMIN_USERS.includes(userId) && !isPremium(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya Admin/Premium yang bisa pakai.");
  }

  let forwarded = 0, failed = 0;

  for (const group of GROUPS) {
  loadBlacklist();
  if (BLACKLIST.includes(Number(group))) continue; // skip jika grup blacklist

  try {
    await bot.forwardMessage(group, chatId, msg.reply_to_message.message_id);
    forwarded++;
  } catch {
    failed++;
  }
}

  bot.sendMessage(chatId, `📊 Share2 selesai!\n✅ ${forwarded}\n❌ ${failed}\nTotal Group: ${GROUPS.length}`);
});

// ================== AUTO BROADCAST ==================
let autoBcInterval = null;
let autoBcRunning = false;

bot.onText(/^\/autobc$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Fitur ini hanya untuk Admin Utama.");
  }
  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, "⚠️ Reply pesan untuk /autobc");
  }
  if (autoBcRunning) {
    return bot.sendMessage(chatId, "⚠️ /autobc sudah berjalan. Stop dulu pakai /stopbc.");
  }

  const replyMessageId = msg.reply_to_message.message_id;
  const sourceChatId = chatId;
  autoBcRunning = true;

  const doBroadcast = async () => {
    let forwarded = 0, failed = 0;
    for (const groupId of GROUPS) {
      try {
        await bot.forwardMessage(groupId, sourceChatId, replyMessageId);
        forwarded++;
      } catch {
        failed++;
      }
    }
    await bot.sendMessage(chatId, `📊 AutoBC selesai!\n✅ ${forwarded}\n❌ ${failed}`);
  };

  await doBroadcast();
  autoBcInterval = setInterval(doBroadcast, 5 * 60 * 1000);

  bot.sendMessage(chatId, "✅ Auto Broadcast dimulai. Ulang setiap 5 menit.");
});

bot.onText(/^\/stopbc$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya admin utama.");
  }
  if (!autoBcRunning) {
    return bot.sendMessage(chatId, "⚠️ Tidak ada AutoBC berjalan.");
  }

  clearInterval(autoBcInterval);
  autoBcInterval = null;
  autoBcRunning = false;
  bot.sendMessage(chatId, "🛑 Auto Broadcast dihentikan.");
});

// ================== FITUR PREMIUM MANUAL ==================
bot.onText(/^\/addprem (\d+) (\d+)$/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya admin utama yang bisa pakai perintah ini.");
  }

  const targetId = match[1];
  const days = parseInt(match[2]);
  const expired = Date.now() + days * 24 * 60 * 60 * 1000;

  PREMIUM[targetId] = { expired };
  savePremium();

  bot.sendMessage(chatId, `✅ User ${targetId} ditambahkan ke Premium selama ${days} hari.`);
  bot.sendMessage(targetId, `🎉 Kamu telah mendapat akses Premium selama ${days} hari.`);
});

bot.onText(/^\/delprem (\d+)$/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya admin utama yang bisa pakai perintah ini.");
  }

  const targetId = match[1];

  if (PREMIUM[targetId]) {
    delete PREMIUM[targetId];
    savePremium();
    bot.sendMessage(chatId, `✅ User ${targetId} dihapus dari daftar Premium.`);
    bot.sendMessage(targetId, "⛔ Akses Premium kamu sudah dicabut.");
  } else {
    bot.sendMessage(chatId, "⚠️ User tidak ditemukan di daftar Premium.");
  }
});

bot.onText(/^\/listprem$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya admin utama yang bisa pakai perintah ini.");
  }

  loadPremium();
  const entries = Object.entries(PREMIUM);

  if (entries.length === 0) {
    return bot.sendMessage(chatId, "📭 Tidak ada user Premium.");
  }

  let text = "📋 *Daftar User Premium:*\n\n";
  for (const [id, data] of entries) {
    const sisaMs = data.expired - Date.now();
    const sisaHari = Math.max(0, Math.floor(sisaMs / (1000 * 60 * 60 * 24)));
    text += `🆔 ${id} | ⏳ ${sisaHari} hari tersisa\n`;
  }

  bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
});

// ================== FITUR TAMBAH GROUP MANUAL ==================
bot.onText(/^\/addgrupid (-?\d+)$/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya Admin Utama yang bisa pakai perintah ini.");
  }

  const targetGroupId = match[1];

  if (!GROUPS.includes(targetGroupId)) {
    GROUPS.push(targetGroupId);
    saveGroups();
    bot.sendMessage(chatId, `✅ ID Group ${targetGroupId} berhasil ditambahkan ke database groups.js`);
  } else {
    bot.sendMessage(chatId, `⚠️ ID Group ${targetGroupId} sudah ada di database groups.js`);
  }
});

// ================== FITUR LIST GROUP ==================
bot.onText(/^\/listgroup$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya Admin Utama yang bisa pakai perintah ini.");
  }

  loadGroups();
  if (GROUPS.length === 0) {
    return bot.sendMessage(chatId, "📭 Tidak ada group yang tersimpan di database.");
  }

  let text = "📋 *Daftar ID Group yang tersimpan:*\n\n";
  GROUPS.forEach((gid, i) => {
    text += `${i + 1}. ${gid}\n`;
  });

  bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
});


// ================== FITUR HAPUS GROUP ==================
bot.onText(/^\/delgrup (-?\d+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya Admin Utama yang bisa pakai perintah ini.");
  }

  const targetGroupId = match[1];

  if (GROUPS.includes(targetGroupId)) {
    GROUPS = GROUPS.filter((g) => g !== targetGroupId);
    saveGroups();

    try {
      await bot.leaveChat(targetGroupId);
      bot.sendMessage(chatId, `✅ ID Group ${targetGroupId} berhasil dihapus dari database dan bot sudah keluar dari grup tersebut.`);
    } catch (err) {
      bot.sendMessage(chatId, `⚠️ ID Group ${targetGroupId} dihapus dari database, tapi bot gagal keluar (mungkin bukan anggota grup).`);
    }
  } else {
    bot.sendMessage(chatId, `⚠️ ID Group ${targetGroupId} tidak ditemukan di database groups.js`);
  }
});

// ================== TOOLS COMMAND ==================

// /cekid → Menampilkan ID Telegram user
bot.onText(/^\/cekid$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  bot.sendMessage(chatId, `🆔 ID Telegram kamu: \`${userId}\``, { parse_mode: "Markdown" });
});

// /ping → Test respon bot
bot.onText(/^\/ping$/, (msg) => {
  const chatId = msg.chat.id;
  const start = Date.now();
  bot.sendMessage(chatId, "🏓 Pong!").then(() => {
    const latency = Date.now() - start;
    bot.sendMessage(chatId, `⏱ Respon: ${latency} ms`);
  });
});

// /help → Bantuan umum
bot.onText(/^\/help$/, (msg) => {
  const chatId = msg.chat.id;
  const helpText = `
📖 *BANTUAN UMUM*

🔹 /start - Mulai bot & lihat menu
🔹 /cekid - Lihat ID Telegram kamu
🔹 /ping - Cek respon bot
🔹 /help - Tampilkan bantuan umum
  `;
  bot.sendMessage(chatId, helpText, { parse_mode: "Markdown" });
});

// ================== FITUR TIKTOK ==================
bot.onText(/^\/tiktok (.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const url = match[1];

  if (!url || !url.includes("tiktok.com")) {
    return bot.sendMessage(
      chatId,
      `<blockquote>❌ Masukkan URL TikTok yang valid.\nContoh:\n/tiktok https://vt.tiktok.com/xxxx</blockquote>`,
      { parse_mode: "HTML" }
    );
  }

  await bot.sendMessage(chatId, `<blockquote>⏳ Mengambil video dari TikTok...</blockquote>`, {
    parse_mode: "HTML"
  });

  try {
    const { data } = await axios.get("https://restapi-v2.simplebot.my.id/download/tiktok", {
      params: { url }
    });

    const result = data?.result;
    if (!data.status || !result || !result.video_nowm) {
      return bot.sendMessage(
        chatId,
        `<blockquote>❌ Gagal mengambil video TikTok.</blockquote>`,
        { parse_mode: "HTML" }
      );
    }

    // Kirim video tanpa watermark
    await bot.sendVideo(chatId, result.video_nowm, {
      caption: `<blockquote>🎥 Video TikTok</blockquote>`,
      parse_mode: "HTML"
    });

    // Jika ada audio, kirim juga
    if (result.audio_url) {
      await bot.sendAudio(chatId, result.audio_url, {
        title: "Audio TikTok"
      });
      await bot.sendMessage(chatId, `<blockquote>🎵 Audio TikTok berhasil diunduh.</blockquote>`, {
        parse_mode: "HTML"
      });
    }
  } catch (err) {
    console.error("TikTok Error:", err.message);
    bot.sendMessage(chatId, `<blockquote>⚠️ Terjadi kesalahan saat mengunduh video TikTok.</blockquote>`, {
      parse_mode: "HTML"
    });
  }
});

// ================== FITUR ANTILINK ==================
const antilinkPath = path.join(__dirname, "antilink.json");
let ANTILINK = {};

if (!fs.existsSync(antilinkPath)) {
  fs.writeFileSync(antilinkPath, JSON.stringify({}, null, 2), "utf8");
}
function loadAntilink() {
  try {
    ANTILINK = JSON.parse(fs.readFileSync(antilinkPath));
  } catch {
    ANTILINK = {};
  }
}
function saveAntilink() {
  fs.writeFileSync(antilinkPath, JSON.stringify(ANTILINK, null, 2));
  loadAntilink();
}
loadAntilink();

// ✅ Command hanya untuk ADMIN UTAMA
bot.onText(/^\/antilink (.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, `<blockquote>❌ Fitur ini hanya bisa digunakan oleh Admin Utama.</blockquote>`, {
      parse_mode: "HTML"
    });
  }

  if (!["group", "supergroup"].includes(msg.chat.type)) {
    return bot.sendMessage(chatId, `<blockquote>❌ Fitur ini hanya untuk grup.</blockquote>`, { parse_mode: "HTML" });
  }

  const status = match[1].toLowerCase();
  if (status === "on") {
    ANTILINK[chatId] = true;
    saveAntilink();
    return bot.sendMessage(chatId, `<blockquote>✅ AntiLink aktif di grup ini.</blockquote>`, { parse_mode: "HTML" });
  } else if (status === "off") {
    delete ANTILINK[chatId];
    saveAntilink();
    return bot.sendMessage(chatId, `<blockquote>✅ AntiLink dimatikan di grup ini.</blockquote>`, { parse_mode: "HTML" });
  } else {
    return bot.sendMessage(chatId, `<blockquote>📌 Gunakan:\n/antilink on\n/antilink off</blockquote>`, {
      parse_mode: "HTML"
    });
  }
});

// Middleware hapus link
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || "";

  if (!["group", "supergroup"].includes(msg.chat.type)) return;

  loadAntilink();
  if (ANTILINK[chatId]) {
    const linkPattern = /(https?:\/\/|t\.me\/|telegram\.me\/|chat\.whatsapp\.com|wa\.me\/)/i;
    if (linkPattern.test(text)) {
      try {
        const admins = await bot.getChatAdministrators(chatId);
        const isAdmin = admins.some(admin => admin.user.id === msg.from.id);

        if (!isAdmin) {
          // ✅ hanya kirim pesan jika berhasil hapus
          await bot.deleteMessage(chatId, msg.message_id)
            .then(() => {
              bot.sendMessage(chatId, `<blockquote>⛔ Link dilarang di grup ini!</blockquote>`, { parse_mode: "HTML" });
            })
            .catch(() => {
              console.log("⚠️ Bot tidak punya izin hapus pesan di grup ini.");
            });
        }
      } catch (err) {
        console.error("AntiLink error:", err.message);
      }
    }
  }
});

// ================== FITUR PROMOTE & DEMOTE ==================
bot.onText(/^\/promote$/, async (msg) => {
  const chatId = msg.chat.id;
  const fromId = msg.from.id;

  if (!ADMIN_USERS.includes(fromId)) {
    return bot.sendMessage(chatId, `<blockquote>❌ Hanya Admin Utama yang bisa menggunakan perintah ini.</blockquote>`, { parse_mode: "HTML" });
  }

  if (msg.chat.type === "private") {
    return bot.sendMessage(chatId, `<blockquote>❌ Perintah ini hanya bisa digunakan di grup.</blockquote>`, { parse_mode: "HTML" });
  }

  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, `<blockquote>⚠️ Reply pesan user yang ingin dipromote.</blockquote>`, { parse_mode: "HTML" });
  }

  const target = msg.reply_to_message.from;

  try {
    await bot.promoteChatMember(chatId, target.id, {
      can_change_info: true,
      can_post_messages: true,
      can_edit_messages: true,
      can_delete_messages: true,
      can_invite_users: true,
      can_restrict_members: true,
      can_pin_messages: true,
      can_promote_members: false, // Bot tidak memberi izin promote
    });

    bot.sendMessage(chatId, `<blockquote>✅ User <b>${target.first_name}</b> sudah dipromote jadi admin.</blockquote>`, { parse_mode: "HTML" });
  } catch (err) {
    console.error("[PROMOTE ERROR]", err.message);
    bot.sendMessage(chatId, `<blockquote>❌ Gagal promote user. Pastikan bot admin dan punya izin cukup.</blockquote>`, { parse_mode: "HTML" });
  }
});

bot.onText(/^\/demote$/, async (msg) => {
  const chatId = msg.chat.id;
  const fromId = msg.from.id;

  if (!ADMIN_USERS.includes(fromId)) {
    return bot.sendMessage(chatId, `<blockquote>❌ Hanya Admin Utama yang bisa menggunakan perintah ini.</blockquote>`, { parse_mode: "HTML" });
  }

  if (msg.chat.type === "private") {
    return bot.sendMessage(chatId, `<blockquote>❌ Perintah ini hanya bisa digunakan di grup.</blockquote>`, { parse_mode: "HTML" });
  }

  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, `<blockquote>⚠️ Reply pesan user yang ingin didemote.</blockquote>`, { parse_mode: "HTML" });
  }

  const target = msg.reply_to_message.from;

  try {
    await bot.promoteChatMember(chatId, target.id, {
      can_change_info: false,
      can_post_messages: false,
      can_edit_messages: false,
      can_delete_messages: false,
      can_invite_users: false,
      can_restrict_members: false,
      can_pin_messages: false,
      can_promote_members: false,
    });

    bot.sendMessage(chatId, `<blockquote>✅ User <b>${target.first_name}</b> sudah didemote dari admin.</blockquote>`, { parse_mode: "HTML" });
  } catch (err) {
    console.error("[DEMOTE ERROR]", err.message);
    bot.sendMessage(chatId, `<blockquote>❌ Gagal demote user. Pastikan bot admin dan punya izin cukup.</blockquote>`, { parse_mode: "HTML" });
  }
});

// ================== FITUR HD (Upscale Gambar) ==================
bot.onText(/^\/hd$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Hanya Admin Utama
  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, `<blockquote>❌ Hanya Admin Utama yang bisa menggunakan perintah ini.</blockquote>`, { parse_mode: "HTML" });
  }

  try {
    const reply = msg.reply_to_message;
    if (!reply || (!reply.photo && !reply.document && !reply.sticker)) {
      return bot.sendMessage(chatId, `<blockquote>❌ Balas gambar/stiker yang mau di-HD-kan!</blockquote>`, { parse_mode: "HTML" });
    }

    let fileId;
    if (reply.photo) {
      fileId = reply.photo[reply.photo.length - 1].file_id;
    } else if (reply.document || reply.sticker) {
      fileId = (reply.document || reply.sticker).file_id;
    }

    // Ambil file link dari Telegram
    const file = await bot.getFile(fileId);
    const fileLink = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const buffer = await (await fetch(fileLink)).buffer();

    // Upload ke Catbox
    const uploadedUrl = await uploadCatbox(buffer).catch(() => null);
    if (!uploadedUrl) {
      return bot.sendMessage(chatId, `<blockquote>❌ Gagal upload gambar ke server.</blockquote>`, { parse_mode: "HTML" });
    }

    await bot.sendMessage(chatId, `<blockquote>🛠️ Meng-HD-kan gambar...</blockquote>`, { parse_mode: "HTML" });

    // Upscale (4x default)
    const resize = 4;
    const upscaleUrl = `https://api.fasturl.link/aiimage/upscale?imageUrl=${encodeURIComponent(uploadedUrl)}&resize=${resize}`;
    const imageRes = await axios.get(upscaleUrl, { responseType: "arraybuffer" });

    const finalBuffer = Buffer.from(imageRes.data);

    await bot.sendPhoto(chatId, finalBuffer, {
      caption: `<blockquote>✅ Gambar berhasil di-HD-kan (${resize}x)</blockquote>`,
      parse_mode: "HTML"
    });

  } catch (err) {
    console.error("Upscale Error:", err);
    bot.sendMessage(chatId, `<blockquote>❌ Gagal meng-HD-kan gambar.</blockquote>`, { parse_mode: "HTML" });
  }
});

// 🔧 Fungsi Upload ke Catbox
async function uploadCatbox(buffer) {
  const { ext, mime } = (await fileTypeFromBuffer(buffer)) || {
    ext: "jpg",
    mime: "image/jpeg",
  };

  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", buffer, {
    filename: `image.${ext}`,
    contentType: mime,
  });

  const res = await fetch("https://catbox.moe/user/api.php", {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error("❌ Upload ke Catbox gagal.");
  return await res.text();
}

// ================== FITUR TOTAL FITUR ==================
bot.onText(/^\/totalfitur$/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    // Baca file index.js
    const filePath = path.join(__dirname, "index.js");
    const content = fs.readFileSync(filePath, "utf8");

    // Cari semua command dengan pola /namacommand
    const commands = content.match(/\/[a-zA-Z0-9]+/g) || [];
    const uniqueCommands = [...new Set(commands)]; // hapus duplikat
    const total = uniqueCommands.length;

    await bot.sendMessage(
      chatId,
      `<blockquote>╭──〔 📦 Total Fitur 〕──\n├ Jumlah fitur: ${total}\n╰────────────────────╯</blockquote>`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("Gagal membaca index.js:", err);
    bot.sendMessage(
      chatId,
      `<blockquote>❌ Gagal membaca daftar fitur.</blockquote>`,
      { parse_mode: "HTML" }
    );
  }
});

// ================== FITUR RESTART BOT ==================
bot.onText(/^\/restart$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Hanya Admin Utama
  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, `<blockquote>❌ Hanya Admin Utama yang bisa merestart bot.</blockquote>`, { parse_mode: "HTML" });
  }

  await bot.sendMessage(chatId, `<blockquote>♻️ Restarting bot...</blockquote>`, { parse_mode: "HTML" });

  setTimeout(() => {
    const child = spawn(process.argv[0], process.argv.slice(1), {
      detached: true,
      stdio: "inherit",
    });
    child.unref();
    process.exit();
  }, 500);
});

// ================== FITUR DEPLOY WEBSITE (HTML ke Vercel) ==================

// /createweb <nama> → deploy file HTML ke vercel
bot.onText(/^\/(createweb|cweb) (.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Fitur ini hanya untuk Admin Utama.");
  }

  const webName = match[2].trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
  if (!webName || webName.length < 3) {
    return bot.sendMessage(chatId, "⚠️ Nama web minimal 3 karakter.\n\nGunakan: `/createweb namaweb`", { parse_mode: "Markdown" });
  }

  if (!msg.reply_to_message || !msg.reply_to_message.document) {
    return bot.sendMessage(chatId, "⚠️ Reply file `.html` yang berisi website kamu!");
  }

  const fileName = msg.reply_to_message.document.file_name || "";
  if (!fileName.endsWith(".html")) {
    return bot.sendMessage(chatId, "❌ File harus berupa `.html`");
  }

  try {
    // Unduh file HTML dari Telegram
    const file = await bot.getFile(msg.reply_to_message.document.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const res = await fetch(fileUrl);
    const buffer = await res.buffer();
    const htmlContent = buffer.toString("utf-8");

    // Buat project di Vercel
    const headers = {
      Authorization: `Bearer ${require("./config").vercelToken}`,
      "Content-Type": "application/json"
    };

    await fetch("https://api.vercel.com/v9/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: webName })
    }).catch(() => {});

    // Deploy ke vercel dengan file index.html
    const deploy = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: webName,
        project: webName,
        files: [
          {
            file: "index.html",
            data: Buffer.from(htmlContent).toString("base64"),
            encoding: "base64"
          }
        ],
        projectSettings: { framework: null }
      })
    });

    const json = await deploy.json();
    if (!json || !json.url) {
      console.log("Deploy error:", json);
      return bot.sendMessage(chatId, "❌ Gagal deploy ke Vercel:\n" + JSON.stringify(json));
    }

    bot.sendMessage(chatId, `✅ Website berhasil dibuat!\n🌐 https://${webName}.vercel.app`);
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "⚠️ Terjadi kesalahan saat membuat website.");
  }
});

// ================== LIST WEB ==================
bot.onText(/^\/listweb$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya Admin Utama.");
  }

  try {
    const headers = {
      Authorization: `Bearer ${require("./config").vercelToken}`,
    };

    const res = await fetch("https://api.vercel.com/v9/projects", { headers });
    const json = await res.json();

    if (!json.projects || json.projects.length === 0) {
      return bot.sendMessage(chatId, "📭 Tidak ada website di Vercel.");
    }

    let text = "📋 *Daftar Website di Vercel:*\n\n";
    json.projects.forEach((proj, i) => {
      text += `${i + 1}. 🌐 https://${proj.name}.vercel.app\n`;
    });

    bot.sendMessage(chatId, text, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("ListWeb Error:", err);
    bot.sendMessage(chatId, "⚠️ Gagal mengambil daftar website dari Vercel.");
  }
});

// ================== DELETE WEB ==================
bot.onText(/^\/delweb (\d+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya Admin Utama.");
  }

  try {
    const headers = {
      Authorization: `Bearer ${require("./config").vercelToken}`,
    };

    // Ambil project list dulu
    const res = await fetch("https://api.vercel.com/v9/projects", { headers });
    const json = await res.json();
    const projects = json.projects || [];

    const index = parseInt(match[1]) - 1;
    if (index < 0 || index >= projects.length) {
      return bot.sendMessage(chatId, "⚠️ Nomor tidak valid.");
    }

    const project = projects[index];

    // Hapus project dari Vercel
    const delRes = await fetch(`https://api.vercel.com/v9/projects/${project.id}`, {
      method: "DELETE",
      headers,
    });

    if (!delRes.ok) {
      return bot.sendMessage(chatId, "❌ Gagal menghapus project dari Vercel.");
    }

    bot.sendMessage(chatId, `✅ Website ${project.name}.vercel.app berhasil dihapus.`);
  } catch (err) {
    console.error("DelWeb Error:", err);
    bot.sendMessage(chatId, "⚠️ Terjadi kesalahan saat menghapus website.");
  }
});

// ================== FITUR BLACKLIST GROUP ==================

// /addbl → Tambahkan group ke blacklist
bot.onText(/^\/addbl$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Validasi hanya bisa di group
  if (!["group", "supergroup"].includes(msg.chat.type)) {
    return bot.sendMessage(chatId, `<blockquote>❌ Perintah ini hanya bisa digunakan di group.</blockquote>`, { parse_mode: "HTML" });
  }

  // Validasi hanya admin utama
  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, `<blockquote>❌ Hanya Admin Utama yang bisa menggunakan perintah ini.</blockquote>`, { parse_mode: "HTML" });
  }

  loadBlacklist();
  if (!BLACKLIST.includes(chatId)) {
    BLACKLIST.push(chatId);
    saveBlacklist();
    bot.sendMessage(chatId, `<blockquote>✅ Grup ini berhasil ditambahkan ke daftar blacklist.</blockquote>`, { parse_mode: "HTML" });
  } else {
    bot.sendMessage(chatId, `<blockquote>⚠️ Grup ini sudah ada di daftar blacklist.</blockquote>`, { parse_mode: "HTML" });
  }
});

// /deladdbl → Hapus group dari blacklist
bot.onText(/^\/deladdbl$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Validasi hanya bisa di group
  if (!["group", "supergroup"].includes(msg.chat.type)) {
    return bot.sendMessage(chatId, `<blockquote>❌ Perintah ini hanya bisa digunakan di group.</blockquote>`, { parse_mode: "HTML" });
  }

  // Validasi hanya admin utama
  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, `<blockquote>❌ Hanya Admin Utama yang bisa menggunakan perintah ini.</blockquote>`, { parse_mode: "HTML" });
  }

  loadBlacklist();
  if (BLACKLIST.includes(chatId)) {
    BLACKLIST = BLACKLIST.filter(id => id !== chatId);
    saveBlacklist();
    bot.sendMessage(chatId, `<blockquote>✅ Grup ini berhasil dihapus dari daftar blacklist.</blockquote>`, { parse_mode: "HTML" });
  } else {
    bot.sendMessage(chatId, `<blockquote>⚠️ Grup ini tidak ada di daftar blacklist.</blockquote>`, { parse_mode: "HTML" });
  }
});

// ================== FITUR BROADCAST KE USER ==================
// ================== FITUR BROADCAST KE USER ==================
bot.onText(/^\/broadcast$/, async (msg) => {
  const chatId = msg.chat.id;
  const fromId = msg.from.id;

  // Validasi hanya admin utama
  if (!ADMIN_USERS.includes(fromId)) {
    return bot.sendMessage(chatId, "❌ Hanya Admin Utama yang bisa menggunakan perintah ini.");
  }

  // Harus reply pesan
  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, "⚠️ Reply ke pesan yang ingin dibroadcast.");
  }

  loadUsers();
  if (USERS.length === 0) {
    return bot.sendMessage(chatId, "📭 Tidak ada user yang terdaftar di database.");
  }

  let success = 0, failed = 0;

  for (const userId of USERS) {
    try {
      await bot.forwardMessage(userId, chatId, msg.reply_to_message.message_id);
      success++;
    } catch {
      failed++;
    }
  }

  // Laporan hasil ke admin utama
  bot.sendMessage(chatId,
    `📢 <b>Broadcast selesai!</b>\n\n` +
    `👥 Total User: <b>${USERS.length}</b>\n` +
    `✅ Terkirim: <b>${success}</b>\n` +
    `❌ Gagal: <b>${failed}</b>`,
    { parse_mode: "HTML" }
  );
});

// ================== FITUR TOURl ==================
bot.onText(/^\/tourl$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // ✅ hanya admin utama
  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, `<blockquote>❌ Hanya Admin Utama yang bisa menggunakan perintah ini.</blockquote>`, { parse_mode: "HTML" });
  }

  // Harus reply
  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, `<blockquote>⚠️ Harus reply foto/video!</blockquote>`, { parse_mode: "HTML" });
  }

  try {
    const reply = msg.reply_to_message;
    let fileId, filename;

    if (reply.photo) {
      fileId = reply.photo[reply.photo.length - 1].file_id;
      filename = "file.jpg";
    } else if (reply.video) {
      fileId = reply.video.file_id;
      filename = "file.mp4";
    } else if (reply.document) {
      fileId = reply.document.file_id;
      filename = reply.document.file_name || "file.bin";
    } else {
      return bot.sendMessage(chatId, `<blockquote>❌ Harus reply foto atau video!</blockquote>`, { parse_mode: "HTML" });
    }

    // Ambil file dari Telegram
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const buffer = await (await fetch(fileUrl)).buffer();

    // Upload ke Catbox
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", buffer, { filename });

    const { data } = await axios.post("https://catbox.moe/user/api.php", form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
    });

    if (typeof data === "string" && data.startsWith("https://")) {
      await bot.sendMessage(chatId, `<blockquote>🔗 URL: ${data}</blockquote>`, {
        parse_mode: "HTML",
        reply_to_message_id: msg.message_id,
      });
    } else {
      throw new Error("Upload gagal, respons tidak valid dari Catbox.");
    }
  } catch (err) {
    console.error("Tourl Error:", err.message);
    bot.sendMessage(chatId, `<blockquote>❌ Gagal upload media.\nAlasan: ${err.message}</blockquote>`, {
      parse_mode: "HTML",
      reply_to_message_id: msg.message_id,
    });
  }
});

// ================== FITUR RESTART BOT ==================
bot.onText(/^\/restart$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Hanya Admin Utama
  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, `<blockquote>❌ Hanya Admin Utama yang bisa merestart bot.</blockquote>`, { parse_mode: "HTML" });
  }

  await bot.sendMessage(chatId, `<blockquote>♻️ Restarting bot...</blockquote>`, { parse_mode: "HTML" });

  setTimeout(() => {
    const child = spawn(process.argv[0], process.argv.slice(1), {
      detached: true,
      stdio: "inherit",
    });
    child.unref();
    process.exit();
  }, 500);
});

// ================== FITUR BUAT BUTTON ==================
let buttonSessions = {};

bot.onText(/^\/buatbuton$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya Admin Utama yang bisa menggunakan perintah ini.");
  }

  buttonSessions[userId] = { step: "await_text", messageId: null, chatId: null };
  bot.sendMessage(chatId, "📝 Silakan kirim *teks utama* yang ingin diposting:", { parse_mode: "Markdown" });
});

bot.on("message", async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  if (!buttonSessions[userId]) return;
  const session = buttonSessions[userId];

  // Step 1: simpan pesan asli
  if (session.step === "await_text" && msg.text && !msg.text.startsWith("/")) {
    session.messageId = msg.message_id; // simpan ID pesan asli
    session.chatId = chatId;
    session.step = "await_buttons";

    return bot.sendMessage(chatId,
      "⚙️ Sekarang atur tombol di bawah postingan.\n\n" +
      "Kirim dengan format:\n" +
      "• Tombol tunggal:\n`OWNER - t.me/RannTzyBack2`\n\n" +
      "• Beberapa tombol 1 baris:\n`Tombol1 - t.me/link1 && Tombol2 - https://link2`\n\n" +
      "• Beberapa baris:\n`Tombol1 - t.me/link1`\n`Tombol2 - t.me/link2`\n\n" +
      "• Tombol popup:\n`Info - popup: Halo`\n\n" +
      "• Tombol share:\n`Bagikan - share: Text yang dibagikan`\n\n",
      { parse_mode: "Markdown" }
    );
  }

  // Step 2: parsing tombol
  if (session.step === "await_buttons" && msg.text && !msg.text.startsWith("/")) {
    const buttonText = msg.text.trim();
    const rows = buttonText.split("\n");
    let inline_keyboard = [];

    try {
      for (let row of rows) {
        const parts = row.split("&&").map(p => p.trim());
        let rowButtons = [];

        for (let part of parts) {
          const [label, actionRaw] = part.split(" - ").map(s => s.trim());
          if (!label || !actionRaw) continue;

          let action = actionRaw;

          if (action.startsWith("http")) {
            rowButtons.push({ text: label, url: action });
          } else if (action.startsWith("t.me/") || action.startsWith("telegram.me/")) {
            rowButtons.push({ text: label, url: "https://" + action });
          } else if (action.startsWith("popup:") || action.startsWith("alert:")) {
            rowButtons.push({
              text: label,
              callback_data: "popup:" + action.replace(/^(popup:|alert:)/, "").trim(),
            });
          } else if (action.startsWith("share:")) {
            rowButtons.push({
              text: label,
              switch_inline_query: action.replace("share:", "").trim(),
            });
          }
        }

        if (rowButtons.length > 0) inline_keyboard.push(rowButtons);
      }

      // 🔥 Kirim ulang PESAN ASLI persis pakai copyMessage
      await bot.copyMessage(chatId, session.chatId, session.messageId, {
        reply_markup: { inline_keyboard }
      });

      delete buttonSessions[userId];
    } catch (err) {
      console.error("Error parsing buttons:", err);
      bot.sendMessage(chatId, "❌ Format tombol salah. Coba periksa lagi.");
    }
  }
});

// Handler tombol popup
bot.on("callback_query", async (cb) => {
  if (cb.data && cb.data.startsWith("popup:")) {
    await bot.answerCallbackQuery(cb.id, {
      text: cb.data.replace("popup:", "").trim(),
      show_alert: true
    });
  }
});

// ================== FITUR SHARE KE CHANNEL ==================
bot.onText(/^\/sharech$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Hanya admin utama
  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Fitur ini hanya untuk Admin Utama.");
  }

  // Harus reply ke pesan
  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, "⚠️ Reply pesan yang ingin dibagikan dengan /sharech");
  }

  loadChannels();
  if (CHANNELS.length === 0) {
    return bot.sendMessage(chatId, "📭 Tidak ada channel yang tersimpan di database.");
  }

  let success = 0, failed = 0;

  for (const channelId of CHANNELS) {
    try {
      // copyMessage supaya tampilannya persis seperti aslinya, bukan "forwarded"
      await bot.copyMessage(channelId, chatId, msg.reply_to_message.message_id);
      success++;
    } catch (err) {
      failed++;
      console.error(`Gagal kirim ke channel ${channelId}:`, err.message);
    }
  }

  bot.sendMessage(chatId,
    `📊 <b>Share ke Channel selesai!</b>\n\n` +
    `📡 Total Channel: <b>${CHANNELS.length}</b>\n` +
    `✅ Berhasil: <b>${success}</b>\n` +
    `❌ Gagal: <b>${failed}</b>`,
    { parse_mode: "HTML" }
  );
});

// Command /buatfitur
bot.onText(/^\/buatfitur(?:\s+([\s\S]+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id; // ambil ID user
  const text = match[1];

  // ✅ Cek hanya admin utama
  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Fitur ini hanya bisa digunakan oleh Admin Utama.");
  }

  if (!text) {
    return bot.sendMessage(
      chatId,
      "❌ Kasih prompt lengkap bre.\n\nContoh:\n`/buatfitur buatkan saya fitur bot /play yang bisa mencarikan video musik`",
      { parse_mode: "Markdown" }
    );
  }

  await bot.sendMessage(chatId, "🤖 Lagi gua bikin fiturnya bre, tunggu bentar ya...");

  try {
    const prompt = `
Kamu adalah AI pembuat fitur bot Telegram dengan node-telegram-bot-api.
User minta: ${text}

Aturan WAJIB:
1. Balas hanya dengan kode fitur (tanpa penjelasan).
2. Fitur Wajib Worx Dan Sesuai dengan yang di bilang 
3. Wajib Menggunakan Node-telegram-api 
4. Format WAJIB seperti ini (perhatikan penutup backtick di samping baris terakhir):

\`\`\`FITUR
bot.onText(/^\\/play (.+)/, async (msg, match) => {
   const query = match[1];
   // kode pencarian musik di sini
});\`\`\`
`;

    const result = await model.generateContent(prompt);
    let reply = result.response.text().trim();

    // Paksa format kalau AI lupa
    if (!reply.startsWith("```FITUR")) {
      reply = "```FITUR\n" + reply + "```";
    }

    // Potong jika kepanjangan
    if (reply.length > 4000) {
      reply = reply.slice(0, 3990) + "...```";
    }

    return bot.sendMessage(chatId, reply, { parse_mode: "Markdown" });

  } catch (err) {
    console.error("BuatFitur Error:", err);
    return bot.sendMessage(chatId, "❌ Terjadi error pas bikin fitur bre.");
  }
});

// ================== FITUR FIX CODE ERROR ==================
bot.onText(/^\/fixcodeerror(?:\s+([\s\S]+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const input = match[1]; // deskripsi error

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Fitur ini hanya untuk Admin Utama.");
  }

  // Harus reply ke pesan yang berisi kode
  const reply = msg.reply_to_message;
  if (!reply || (!reply.text && !reply.document)) {
    return bot.sendMessage(chatId, "❌ Lu harus reply ke pesan yang isinya kode JavaScript-nya bre.");
  }

  try {
    let code = "";
    if (reply.document) {
      const file = await bot.getFile(reply.document.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
      const res = await fetch(fileUrl);
      code = await res.text();
    } else {
      code = reply.text;
    }

    // Prompt ke Gemini
    const prompt = `
Lu Ai Gimini kode ini bre. Error-nya udah dikasih tau.

1. Fokus ke error: ${input || "Tidak dijelaskan"}
2. Jangan banyak bacot, kasih langsung kode yang udah dibenerin
3. Bungkus pake \`\`\`javascript biar bisa langsung disalin
4. kalo ada variabel undefined tambahin aja

Kode error-nya:

${code}

Langsung beresin bre, jangan nambahin omongan lain.
`;

    const result = await model.generateContent(prompt);
    let answer = result.response.text().trim();

    // Pastikan dibungkus triple backtick javascript
    if (!answer.includes("```")) {
      answer = "```javascript\n" + answer + "\n```";
    }

    if (answer.length > 4000) {
      answer = answer.slice(0, 3990) + "...```";
    }

    await bot.sendMessage(chatId, answer, { parse_mode: "Markdown" });

  } catch (e) {
    console.error("FixCodeError Error:", e);
    return bot.sendMessage(chatId, "❌ Ada error bre pas proses fix kode.");
  }
});

// ================== FITUR FIX CODE ==================
bot.onText(/^\/fixcode$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Fitur ini hanya untuk Admin Utama.");
  }

  const reply = msg.reply_to_message;
  if (!reply || (!reply.text && !reply.document)) {
    return bot.sendMessage(chatId, "❌ Balas pesan teks error atau file .js dulu bre.");
  }

  try {
    let code = "";

    // Ambil dari balasan teks
    if (reply.text) {
      code = reply.text;
    }

    // Atau ambil dari file .js
    else if (reply.document) {
      const doc = reply.document;
      if (
        doc.mime_type === "application/javascript" ||
        doc.file_name.endsWith(".js")
      ) {
        const file = await bot.getFile(doc.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
        const res = await fetch(fileUrl);
        code = await res.text();
      }
    }

    if (!code) {
      return bot.sendMessage(chatId, "❌ Tidak bisa ambil kode dari balasan.");
    }

    await bot.sendMessage(chatId, "🧠 Otw gua bantu benerin kodenya ya bre...");

    // Prompt ke Gemini
    const prompt = `
Lu adalah AI Gimini dalam memperbaiki semua kode pemrograman (JavaScript, Python, C++, dll).
Tugas lu:

1. Perbaiki kode yang error atau bermasalah tanpa penjelasan tambahan.
2. Langsung tulis ulang kodenya yang sudah diperbaiki.
3. Jangan kasih penjelasan, cukup kirim kodenya aja.
4. Kasih hasilnya pake format \`\`\`(bahasa)\`\`\` biar gampang disalin.

Ini kodenya bre:

${code}
`;

    const result = await model.generateContent(prompt);
    let answer = result.response.text().trim();

    // Pastikan dibungkus triple backtick javascript kalau AI lupa
    if (!answer.includes("```")) {
      answer = "```javascript\n" + answer + "\n```";
    }

    if (answer.length > 4000) {
      answer = answer.slice(0, 3990) + "...```";
    }

    await bot.sendMessage(chatId, answer, { parse_mode: "Markdown" });

  } catch (err) {
    console.error("FixCode Error:", err);
    bot.sendMessage(chatId, "❌ Terjadi error pas proses perbaikan kode.");
  }
});

// ================== FITUR BUAT HTML ==================
const tmpDir = path.join(__dirname, "tmp");
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

const htmlCommands = ["html", "buathtml", "createhtml", "chtml", "webgen"];

for (const cmd of htmlCommands) {
  bot.onText(new RegExp(`^\\/${cmd}(?:\\s+([\\s\\S]+))?`), async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = String(msg.from.id);
    const args = match[1];

    // Hanya owner
    if (!ADMIN_USERS.includes(Number(userId))) {
      return bot.sendMessage(chatId, "❌ Fitur ini cuma buat owner bot aja bre.");
    }

    if (!args) {
      return bot.sendMessage(chatId, `⚠️ Contoh: /${cmd} landing page AI`);
    }

    await bot.sendMessage(chatId, "⏳ Sedang membuat HTML...");

    try {
      // Prompt ke Gemini
      const prompt = `
Kamu adalah AI pembuat code website.
Tugasmu: buat file HTML lengkap (boleh ada CSS/JS inline).
Jangan tambahkan penjelasan, hanya kode murni.

Permintaan user: ${args}
`;

      const result = await model.generateContent(prompt);
      let rawCode = result.response.text().trim();

      // Bersihkan kalau ada ```html block
      rawCode = rawCode.replace(/```html\n?/gi, "").replace(/```$/gi, "").trim();

      // Simpan ke file sementara
      const fileName = `index-${Date.now()}.html`;
      const filePath = path.join(tmpDir, fileName);
      fs.writeFileSync(filePath, rawCode, "utf8");

      // Kirim file ke user
      await bot.sendDocument(chatId, filePath, {
        caption: `✅ File HTML berhasil dibuat!\n\nDengan Query: <b>${args}</b>`,
        parse_mode: "HTML",
      });

    } catch (err) {
      console.error("HTML Gen Error:", err);
      bot.sendMessage(chatId, "❌ Terjadi kesalahan saat membuat HTML.");
    }
  });
}

/// ================== FITUR GETCODE (SCAN FLEXIBLE) ==================
bot.onText(/^\/getcode (\/[a-zA-Z0-9_]+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const command = match[1]; // contoh: /share

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya Admin Utama yang bisa menggunakan fitur ini.");
  }

  try {
    const filePath = path.join(__dirname, "index.js");
    const content = fs.readFileSync(filePath, "utf8");

    // Pisahkan jadi baris
    const lines = content.split("\n");

    let start = -1;
    let end = -1;

    // Cari baris yang mengandung bot.onText dan command
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("bot.onText") && lines[i].includes(command)) {
        start = i;
        break;
      }
    }

    if (start === -1) {
      return bot.sendMessage(chatId, `❌ Fitur ${command} tidak ditemukan di index.js`);
    }

    // Cari penutup blok "});"
    for (let j = start; j < lines.length; j++) {
      if (lines[j].includes("});")) {
        end = j;
        break;
      }
    }

    if (end === -1) {
      return bot.sendMessage(chatId, `❌ Tidak bisa menemukan akhir blok fitur ${command}`);
    }

    // Ambil blok kode
    const codeBlock = lines.slice(start, end + 1).join("\n");

    // Format output
    const replyCode = "```FITUR\n" + codeBlock.trim() + "```";

    if (replyCode.length > 4000) {
      const tmpFile = path.join(__dirname, `getcode-${Date.now()}.js`);
      fs.writeFileSync(tmpFile, codeBlock, "utf8");
      await bot.sendDocument(chatId, tmpFile, {
        caption: `✅ Fitur ${command} berhasil diambil.`,
      });
      fs.unlinkSync(tmpFile);
    } else {
      await bot.sendMessage(chatId, replyCode, { parse_mode: "Markdown" });
    }
  } catch (err) {
    console.error("GetCode Error:", err);
    bot.sendMessage(chatId, "❌ Gagal mengambil kode fitur.");
  }
});

// ================== FITUR ADDCODE (NO FORMAT) ==================
bot.onText(/^\/addcode$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Hanya Admin Utama
  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya Admin Utama yang bisa menggunakan fitur ini.");
  }

  // Ambil teks dari reply (bisa text atau caption)
  const reply = msg.reply_to_message;
  const code = reply?.text || reply?.caption;

  if (!code) {
    return bot.sendMessage(chatId, "⚠️ Reply ke pesan yang berisi kode fitur bot!");
  }

  try {
    const filePath = path.join(__dirname, "index.js");
    let content = fs.readFileSync(filePath, "utf8");

    // Tambahkan di akhir file dengan 1 baris jarak
    if (!content.endsWith("\n")) content += "\n";
    content += "\n" + code.trim() + "\n";

    fs.writeFileSync(filePath, content, "utf8");

    await bot.sendMessage(chatId, "✅ Fitur berhasil ditambahkan ke index.js\n\n⚠️ Restart bot agar fitur aktif!");
  } catch (err) {
    console.error("AddCode Error:", err);
    bot.sendMessage(chatId, "❌ Gagal menambahkan fitur.");
  }
});

// ================== FITUR ADMIN PANEL PTRAYDATOL ==================
bot.onText(/^\/admin (.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // hanya admin utama
  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, '❌ Perintah hanya untuk Owner...', {
      reply_markup: {
        inline_keyboard: [[{ text: 'OWNER', url: 'https://t.me/RannTzyBack2' }]]
      }
    });
  }

  const args = match[1].split(',');
  if (args.length < 2) {
    return bot.sendMessage(chatId, '⚠️ Format salah!\nGunakan: /admin namapanel,idtele');
  }

  const panelName = args[0].trim();
  const telegramId = args[1].trim();
  const password = panelName + "117";

  // langsung define domain & API key di dalam fitur
  const domain = "https://mypublikserver.pterohost.my.id"; // ganti dengan domain panel kamu
  const apiKey = "ptla_OuGR5VULveYcHQwfQwEcN5vJ9hUEMWiRMnHpY23FGU6"; // ganti dengan API key Application

  try {
    const res = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        email: `${panelName}@gmail.com`,
        username: panelName,
        first_name: panelName,
        last_name: "Memb",
        language: "en",
        root_admin: true,
        password
      })
    });

    const data = await res.json();

    if (data.errors) {
      return bot.sendMessage(chatId, JSON.stringify(data.errors[0], null, 2));
    }

    const user = data.attributes;

    // kirim detail ke owner
    await bot.sendMessage(chatId, `
TYPE: user
➟ ID: ${user.id}
➟ USERNAME: ${user.username}
➟ EMAIL: ${user.email}
➟ NAME: ${user.first_name} ${user.last_name}
➟ LANGUAGE: ${user.language}
➟ ADMIN: ${user.root_admin}
➟ CREATED AT: ${user.created_at}
    `);

    // kirim data login ke user telegram
    await bot.sendMessage(telegramId, `
┏━⬣「 DATA ADMIN PANEL 」
┃➥  Login : ${domain}
┃➥  Username : ${user.username}
┃➥  Password : ${password} 
┗━━━━━━━━━━━━⬣
│ᴘᴇʀᴀᴛᴜʀᴀɴ :
│•ɴᴏ ᴅᴅᴏꜱ
│•ɴᴏ ꜱʜᴀʀᴇ/ꜱᴇʙᴀʀ ʟɪɴᴋ
│•ɴᴏ ᴋᴀꜱɪʜ ᴋᴇ ᴏʀɴɢ ꜰʀᴇᴇ
┗━━━━━━━━━━━━━━⬣
    `);

  } catch (error) {
    console.error("Admin Error:", error);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan dalam pembuatan admin.');
  }
});

// ================== FITUR UNLIMITED PANEL ==================
bot.onText(/^\/unli (.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // hanya admin utama
  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, '❌ Perintah hanya untuk Owner...', {
      reply_markup: {
        inline_keyboard: [[{ text: 'OWNER', url: 'https://t.me/RannTzyBack2' }]]
      }
    });
  }

  const args = match[1].split(',');
  if (args.length < 2) {
    return bot.sendMessage(chatId, '⚠️ Format salah!\nGunakan: /unli namapanel,idtele');
  }

  const username = args[0].trim();
  const targetId = args[1].trim();
  const name = `${username}unli`;
  const email = `${username}@gmail.com`;
  const password = `${username}001`;

  // resource unlimited
  const memo = '0';
  const cpu = '0';
  const disk = '0';

  // startup cmd default
  const spc = 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/${CMD_RUN}';

  // domain & api key
  const domain = "https://mypublikserver.pterohost.my.id"; 
  const apiKey = "ptla_OuGR5VULveYcHQwfQwEcN5vJ9hUEMWiRMnHpY23FGU6";

  // 🔧 tambahin definisi egg & location ID sesuai panel kamu
  const egg = 15; // ganti dengan ID Egg (misal: NodeJS egg)
  const loc = 1;  // ganti dengan ID Location di panel

  let user, server;

  try {
    // Buat user dulu
    const resUser = await fetch(`${domain}/api/application/users`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        email,
        username,
        first_name: username,
        last_name: username,
        language: 'en',
        password
      })
    });

    const dataUser = await resUser.json();
    if (dataUser.errors) {
      if (dataUser.errors[0].meta?.rule === 'unique') {
        return bot.sendMessage(chatId, '❌ Email sudah digunakan, silakan pakai nama lain.');
      } else {
        return bot.sendMessage(chatId, `❌ Gagal: ${JSON.stringify(dataUser.errors[0], null, 2)}`);
      }
    }

    user = dataUser.attributes;

    // Buat server unlimited
    const resServer = await fetch(`${domain}/api/application/servers`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        name,
        description: '',
        user: user.id,
        egg: egg, // sudah fix
        docker_image: 'ghcr.io/parkervcp/yolks:nodejs_18',
        startup: spc,
        environment: {
          INST: 'npm',
          USER_UPLOAD: '0',
          AUTO_UPDATE: '0',
          CMD_RUN: 'npm start'
        },
        limits: {
          memory: memo,
          swap: 0,
          disk: disk,
          io: 500,
          cpu: cpu
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 1
        },
        deploy: {
          locations: [loc], // sudah fix
          dedicated_ip: false,
          port_range: []
        }
      })
    });

    const dataServer = await resServer.json();
    if (dataServer.errors) {
      return bot.sendMessage(chatId, `❌ Gagal buat server: ${JSON.stringify(dataServer.errors[0], null, 2)}`);
    }

    server = dataServer.attributes;

  } catch (err) {
    return bot.sendMessage(chatId, `❌ Error: ${err.message}`);
  }

  if (user && server) {
    await bot.sendMessage(chatId, `
✅ Panel berhasil dibuat!

NAMA: ${username}
EMAIL: ${email}
ID: ${user.id}
MEMORY: ${server.limits.memory === 0 ? 'Unlimited' : server.limits.memory} MB
DISK: ${server.limits.disk === 0 ? 'Unlimited' : server.limits.disk} MB
CPU: ${server.limits.cpu === 0 ? 'Unlimited' : server.limits.cpu}%
    `);

    // kirim ke user target
    await bot.sendMessage(targetId, `
┏━⬣「 DATA PANEL 」
┃➥  Login : ${domain}
┃➥  Username : ${user.username}
┃➥  Password : ${password}
┗━━━━━━━━━━━━⬣
│ᴘᴇʀᴀᴛᴜʀᴀɴ :
│•ɴᴏ ᴅᴅᴏꜱ
│•ɴᴏ ꜱʜᴀʀᴇ/ꜱᴇʙᴀʀ ʟɪɴᴋ
│•ɴᴏ ᴋᴀꜱɪʜ ᴋᴇ ᴏʀɴɢ ꜰʀᴇᴇ
┗━━━━━━━━━━━━━━⬣
    `);

  } else {
    bot.sendMessage(chatId, '❌ Gagal membuat data panel. Silakan coba lagi.');
  }
});

// ============= FITUR PAYMENT =============
bot.onText(/^\/pay$/, async (msg) => {
  const chatId = msg.chat.id;

  bot.sendPhoto(chatId, "https://files.catbox.moe/zxee7w.jpg", { // ganti QRIS kamu
    caption: `💳 <b>DETAIL PAYMENT</b> 💳

<blockquote>
📌 QRIS SCAN DI ATAS

⚠️ NOTE : JANGAN LUPA MEMBAWA BUKTI TF AGAR SEGERA DIPROSES.
</blockquote>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "💠 DANA", callback_data: "pay_dana" },
          { text: "💠 GOPAY", callback_data: "pay_gopay" }
        ]
      ]
    }
  });
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;

  if (query.data === "pay_dana") {
    await bot.deleteMessage(chatId, msgId);

    bot.sendMessage(chatId, `💠 <b>DETAIL DANA</b> 💠

<blockquote>
📱 DANA : <code>085609287244</code>
👤 ATAS NAMA : I ANATU XXXX XXXXXX

👉 Klik nomor untuk copy manual
</blockquote>`, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Back", callback_data: "pay_back" }]
        ]
      }
    });
  }

  if (query.data === "pay_gopay") {
    await bot.deleteMessage(chatId, msgId);

    bot.sendMessage(chatId, `💠 <b>DETAIL GOPAY</b> 💠

<blockquote>
📱 GOPAY : <code>085129430016</code>
👤 ATAS NAMA : TZY RANN

👉 Klik nomor untuk copy manual
</blockquote>`, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Back", callback_data: "pay_back" }]
        ]
      }
    });
  }

  if (query.data === "pay_back") {
    await bot.deleteMessage(chatId, msgId);

    bot.sendPhoto(chatId, "https://files.catbox.moe/zxee7w.jpg", {
      caption: `💳 <b>DETAIL PAYMENT</b> 💳

<blockquote>
📌 QRIS SCAN DI ATAS

⚠️ NOTE : JANGAN LUPA MEMBAWA BUKTI TF AGAR SEGERA DIPROSES.
</blockquote>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "💠 DANA", callback_data: "pay_dana" },
            { text: "💠 GOPAY", callback_data: "pay_gopay" }
          ]
        ]
      }
    });
  }

  bot.answerCallbackQuery(query.id);
});

// ================== FITUR COPY WEBSITE (ADMIN SAJA) ==================
bot.onText(/^\/copyweb (.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Fitur ini hanya untuk Admin Utama.");
  }

  const targetUrl = (match[1] || "").trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    return bot.sendMessage(chatId, "⚠️ Contoh: /copyweb https://example.com");
  }

  await bot.sendMessage(chatId, "⏳ Sedang menyalin website...");

  const stamp = Date.now();
  const workDir = path.join(__dirname, `copyweb-${stamp}`);
  fs.mkdirSync(workDir, { recursive: true });

  // Beautify helper
  function tryBeautify(content, type = "html") {
    try {
      const beautify = require("js-beautify");
      if (type === "js") return beautify.js(content, { indent_size: 2 });
      if (type === "css") return beautify.css(content, { indent_size: 2 });
      return beautify.html(content, { indent_size: 2 });
    } catch {
      return content; // kalau gagal tetap raw
    }
  }

  try {
    const res = await axios.get(targetUrl, {
      timeout: 20000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const type = res.headers["content-type"] || "";
    let fileName = "index.html"; // default
    let content = res.data.toString();

    if (/text\/html/i.test(type)) {
      content = tryBeautify(content, "html");
      fileName = "index.html";
    } else if (/javascript/i.test(type)) {
      content = tryBeautify(content, "js");
      fileName = path.basename(new URL(targetUrl).pathname) || "script.js";
    } else if (/css/i.test(type)) {
      content = tryBeautify(content, "css");
      fileName = path.basename(new URL(targetUrl).pathname) || "style.css";
    } else {
      fileName = path.basename(new URL(targetUrl).pathname) || "file.txt";
    }

    // simpan file tunggal
    const filePath = path.join(workDir, fileName);
    fs.writeFileSync(filePath, content, "utf8");

    await bot.sendDocument(chatId, filePath, {
      caption: `✅ File berhasil disalin:\n🌐 ${targetUrl}\n📄 ${fileName}`,
      parse_mode: "HTML"
    });

    fs.rmSync(workDir, { recursive: true, force: true });

  } catch (err) {
    console.error("COPYWEB ERROR:", err);
    bot.sendMessage(chatId, "❌ Gagal menyalin website.");
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
});

bot.onText(/^\/addkey (\w+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const name = match[1];

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya Admin Utama.");
  }

  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, "⚠️ Reply text atau stiker dengan perintah /addkey <nama>");
  }

  const keys = loadKeys();
  if (keys.some(k => k.name === name)) {
    return bot.sendMessage(chatId, "⚠️ Nama fitur sudah ada. Gunakan nama lain.");
  }

  let entry;
  if (msg.reply_to_message.text) {
    entry = { name, type: "text", data: msg.reply_to_message.text };
  } else if (msg.reply_to_message.sticker) {
    entry = { name, type: "sticker", data: msg.reply_to_message.sticker.file_id };
  } else {
    return bot.sendMessage(chatId, "❌ Hanya bisa menyimpan text atau stiker.");
  }

  keys.push(entry);
  saveKeys(keys);

  bot.sendMessage(chatId, `✅ Key <b>${name}</b> berhasil ditambahkan.`, { parse_mode: "HTML" });
});

bot.onText(/^\/listkey$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya Admin Utama.");
  }

  const keys = loadKeys();
  if (keys.length === 0) {
    return bot.sendMessage(chatId, "📂 Tidak ada daftar key tersimpan.");
  }

  let text = "📂 Daftar key tersimpan:\n\n";
  keys.forEach((k) => {
    if (k.type === "text") {
      text += `• <b>${k.name}</b>\n<blockquote>${k.data}</blockquote>\n\n`;
    } else if (k.type === "sticker") {
      text += `• <b>${k.name}</b>\n<blockquote>Sticker</blockquote>\n\n`;
    }
  });

  bot.sendMessage(chatId, text, { parse_mode: "HTML" });
});

bot.onText(/^\/delkey (\w+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const name = match[1];

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya Admin Utama.");
  }

  let keys = loadKeys();
  const idx = keys.findIndex(k => k.name === name);
  if (idx === -1) {
    return bot.sendMessage(chatId, "⚠️ Nama fitur tidak ditemukan.");
  }

  const removed = keys.splice(idx, 1);
  saveKeys(keys);

  bot.sendMessage(chatId, `✅ Key <b>${removed[0].name}</b> berhasil dihapus.`, { parse_mode: "HTML" });
});

bot.onText(/^\/(\w+)\s+(\d+),(\d+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const feature = match[1];
  const targetId = match[2];
  const repeat = parseInt(match[3]);

  if (!ADMIN_USERS.includes(userId)) {
    return bot.sendMessage(chatId, "❌ Hanya Admin Utama.");
  }

  const keys = loadKeys();
  const key = keys.find(k => k.name === feature);
  if (!key) {
    return bot.sendMessage(chatId, `⚠️ Fitur <b>${feature}</b> tidak ditemukan.`, { parse_mode: "HTML" });
  }
  if (isNaN(repeat) || repeat < 1) {
    return bot.sendMessage(chatId, "⚠️ Jumlah tidak valid.");
  }

  let success = 0;
  let failed = 0;

  // Pesan progress awal
  let progressMsg = await bot.sendMessage(
    chatId,
    `🔄 Proses <b>${feature}</b> dimulai...\n[░░░░░░░░░░] 0%\nSUCCESS: 0\nFAILED: 0`,
    { parse_mode: "HTML" }
  );

  const startTime = Date.now();

  for (let i = 0; i < repeat; i++) {
    try {
      if (key.type === "text") {
        await bot.sendMessage(targetId, key.data);
      } else if (key.type === "sticker") {
        await bot.sendSticker(targetId, key.data);
      }
      success++;
    } catch (e) {
      failed++;
      console.error("SPAM ERROR:", e.message);
    }

    await new Promise(r => setTimeout(r, 500)); // delay biar aman

    // hitung progress
    const percent = Math.round(((i + 1) / repeat) * 100);
    const filled = Math.round(percent / 10);
    const bar = "▓".repeat(filled) + "░".repeat(10 - filled);

    const elapsed = (Date.now() - startTime) / 1000;
    const avgPerTask = elapsed / (i + 1);
    const remaining = Math.round(avgPerTask * (repeat - (i + 1)));

    // Update animasi progress + counter
    try {
      await bot.editMessageText(
        `🔄 Proses <b>${feature}</b>...\n[${bar}] ${percent}%\n✅ SUCCESS: ${success}\n❌ FAILED: ${failed}\nETA: ${remaining} detik`,
        {
          chat_id: progressMsg.chat.id,
          message_id: progressMsg.message_id,
          parse_mode: "HTML"
        }
      );
    } catch {}
  }

  // Hapus progress animasi
  try {
    await bot.deleteMessage(progressMsg.chat.id, progressMsg.message_id);
  } catch {}

  // Ganti dengan hasil akhir
  await bot.sendMessage(
    chatId,
    `✅ Proses <b>${feature}</b> selesai!\n\n📊 Hasil:\nSUCCESS: ${success}\nFAILED: ${failed}`,
    { parse_mode: "HTML" }
  );
});

// ========== AUTO RESTART JIKA CRASH ==========
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);

  setTimeout(() => {
    const child = spawn(process.argv[0], process.argv.slice(1), {
      detached: true,
      stdio: "inherit"
    });
    child.unref();
    process.exit(1);
  }, 1000);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection:", reason);

  setTimeout(() => {
    const child = spawn(process.argv[0], process.argv.slice(1), {
      detached: true,
      stdio: "inherit"
    });
    child.unref();
    process.exit(1);
  }, 1000);
});