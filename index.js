require('dotenv').config();
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const yts = require('yt-search');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, downloadMediaMessage } = require('@whiskeysockets/baileys');

const C = {
  NAME: "𝐕𝚰𝐊𝚰𝚴𝐆 𝐌𝐃 𝐏𝐑𝚯 𝐕𝟏.𝟎",
  VERSION: "𝐕𝚰𝐊𝚰𝚴𝐆 𝐌𝐃 𝐏𝐑𝚯 𝐕𝟏.𝟎",
  OWNERS: ["254745850429", "254735339611", "254119885802"],
  WH_ID: "0029Vb8xKqiDeON4xrQ0x71K",
  PREFIX: ".",
  TG_CHANNEL: "https://t.me/vikingnexus",
  TG_CHANNEL_ID: "@vikingnexus",
  TOKEN: process.env.TELEGRAM_TOKEN
};

function load(file, fallback) {
  try { if (!fs.existsSync(file)) { fs.writeFileSync(file, JSON.stringify(fallback, null, 2)); return fallback; } return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function save(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

const DIR = __dirname;
const FILES = {
  settings: path.join(DIR, "settings.json"),
  antiDel: path.join(DIR, "antiDel.json"),
  bans: path.join(DIR, "bans.json"),
  antibug: path.join(DIR, "antibug.json"),
  games: path.join(DIR, "games.json"),
  leaderboard: path.join(DIR, "leaderboard.json")
};

const settings = load(FILES.settings, {});
const antiDelStore = load(FILES.antiDel, {});
const banStore = load(FILES.bans, { banned: [] });
const antibugStore = load(FILES.antibug, { enabled: {} });
const gameState = load(FILES.games, {});
const leaderboard = load(FILES.leaderboard, {});

function clean(n) { return String(n || "").replace(/[^0-9]/g, ""); }
function isOwner(n) { return C.OWNERS.some(o => clean(o) === clean(n)); }
function jidNum(j) { return clean(String(j || "").split("@")[0]); }
function isGroup(j) { return String(j || "").endsWith("@g.us"); }
function getSet(g) {
  if (!settings[g]) {
    settings[g] = { antilink: false, antistatusmention: false, welcome: true, goodbye: true, autostatus: true, antidelete: true, antiviewonce: true, autoreact: true, autobio: false, antispam: false, antitag: false, mute: false };
    save(FILES.settings, settings);
  }
  return settings[g];
}
function getText(m) { return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || ""; }
function isBugText(t) { if (!t) return false; if (t.length > 4000) return true; const bad = t.match(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g); if (bad && bad.length > 20) return true; return false; }
async function isGroupAdmin(jid, senderId) { try { const meta = await sock.groupMetadata(jid); const p = meta.participants.find(x => x.id === senderId); return !!p?.admin; } catch { return false; } }
function addPoints(jid, userId, points) {
  const key = jid + "_" + clean(userId);
  if (!leaderboard[key]) leaderboard[key] = { id: userId, points: 0, wins: 0 };
  leaderboard[key].points += points;
  leaderboard[key].wins += 1;
  save(FILES.leaderboard, leaderboard);
}
let sock;
const TRIVIA = [
  { q: "What is the capital of Kenya?", a: "nairobi" },
  { q: "Who founded VIKING MARADONA MD?", a: "maradona" },
  { q: "How many players in football team?", a: "11" },
  { q: "What is 5+5*2?", a: "15" },
  { q: "Which planet is called red planet?", a: "mars" }
];
const FOOTBALL_Q = [
  { q: "Who won World Cup 2022?", a: "argentina" },
  { q: "GOAT? Messi or Ronaldo?", a: "messi" },
  { q: "How many Ballon d'Or does Messi have?", a: "8" },
  { q: "Which club is called The Gunners?", a: "arsenal" }
];
const RIDDLES = [
  { q: "I speak without a mouth. What am I?", a: "echo" },
  { q: "What has keys but no locks?", a: "keyboard" },
  { q: "The more you take, the more you leave behind. What?", a: "footsteps" }
];
const SCRAMBLE = ["viking", "maradona", "premium", "whatsapp", "telegram", "battle", "football"];
const TOD_TRUTH = ["What is your biggest secret?", "Who is your crush?", "Have you ever lied to your best friend?"];
const TOD_DARE = ["Send voice note singing", "Change DP for 1 hour", "Text your crush 'I miss you'"];
const CARDS = ["A♠️", "K♥️", "Q♦️", "J♣️", "10♠️", "9♥️", "8♦️"];

async function getPairingCode(phoneNumber) {
  const num = clean(phoneNumber);
  const authFolder = path.join(DIR, 'auth_' + num);
  if (!fs.existsSync(authFolder)) fs.mkdirSync(authFolder, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const { version } = await fetchLatestBaileysVersion();
  const tempSock = makeWASocket({ version, auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) }, logger: pino({ level: 'silent' }), browser: [C.NAME, 'Chrome', '1.0'] });
  tempSock.ev.on('creds.update', saveCreds);
  try { await new Promise(r => setTimeout(r, 2000)); const code = await tempSock.requestPairingCode(num); setTimeout(() => { try { tempSock.end(); } catch {} }, 90000); return { code, num }; } catch (e) { try { tempSock.end(); } catch {} return { error: e.message }; }
}

async function startWA() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(DIR, 'auth'));
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({ version, auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) }, logger: pino({ level: 'silent' }), browser: [C.NAME, 'Chrome', '1.0'], markOnlineOnConnect: true, syncFullHistory: false, getMessage: async (k) => antiDelStore[k.id] });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (u) => {
    if (u.connection === 'open') { console.log(`✅ ${C.NAME} CONNECTED`); try { await sock.newsletterFollow(C.WH_ID); } catch {} }
    if (u.connection === 'close' && u.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) setTimeout(startWA, 3000);
  });
  sock.ev.on('group-participants.update', async (u) => {
    try {
      const gs = getSet(u.id);
      if (u.action === 'add' && gs.welcome) await sock.sendMessage(u.id, { text: `👋 Welcome @${jidNum(u.participants[0])}\n⚔️ ${C.NAME}`, mentions: u.participants });
      if (u.action === 'remove' && gs.goodbye) await sock.sendMessage(u.id, { text: `👋 Goodbye @${jidNum(u.participants[0])}`, mentions: u.participants });
    } catch {}
  });
  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0]; if (!msg || !msg.message) return;
      if (msg.message) { antiDelStore[msg.key.id] = msg; save(FILES.antiDel, antiDelStore); }
      if (msg.key.fromMe) return;
      const jid = msg.key.remoteJid;
      const senderId = msg.key.participant || jid;
      const senderNum = jidNum(senderId);
      if (banStore.banned.includes(senderNum) && !isOwner(senderNum)) return;
      const gs = getSet(isGroup(jid) ? jid : 'global');
      const textRaw = getText(msg.message).trim();
      if (gs.autoreact) { try { await sock.sendMessage(jid, { react: { text: "⚔️", key: msg.key } }); } catch {} }
      if (isGroup(jid) && gs.antilink && !isOwner(senderNum)) {
        const admin = await isGroupAdmin(jid, senderId);
        if (!admin && /https?:\/\/chat\.whatsapp\.com\/|https?:\/\/t\.me\//.test(textRaw)) { try { await sock.sendMessage(jid, { delete: msg.key }); } catch {} return; }
      }
      if (isGroup(jid) && antibugStore.enabled[jid] && !isOwner(senderNum)) {
        if (isBugText(textRaw)) { try { await sock.sendMessage(jid, { delete: msg.key }); await sock.groupParticipantsUpdate(jid, [senderId], "remove"); } catch {} return; }
      }
      if (!textRaw.startsWith(C.PREFIX)) {
        const g = gameState[jid];
        if (g) {
          const ans = textRaw.toLowerCase().trim();
          if (['trivia','football','riddle','scramble','guess'].includes(g.type)) {
            if (ans === g.answer || ans.includes(g.answer)) {
              delete gameState[jid]; save(FILES.games, gameState);
              addPoints(jid, senderId, 10);
              await sock.sendMessage(jid, { text: `✅ *CORRECT!* @${senderNum} wins 10 points!\nAnswer: ${g.answer}\n⚔️ ${C.NAME}`, mentions: [senderId] });
              return;
            }
          }
          if (g.type === 'reaction' && ans === '⚔️') {
            const time = Date.now() - g.start;
            delete gameState[jid]; save(FILES.games, gameState);
            addPoints(jid, senderId, 15);
            await sock.sendMessage(jid, { text: `🏁 *FASTEST!* @${senderNum} reacted in ${time}ms and wins 15 points! ⚔️`, mentions: [senderId] });
            return;
          }
        }
        return;
      }
      const args = textRaw.slice(C.PREFIX.length).trim().split(/\s+/);
      const cmd = args.shift().toLowerCase();
      const reply = async (t, o = {}) => await sock.sendMessage(jid, { text: t, ...o }, { quoted: msg });
      const isOwn = isOwner(senderNum);

      // ===== DOWNLOADER & AI SECTION =====
      if (cmd === 'play' || cmd === 'song') {
        if (!args[0]) { await reply(`🎵 Use: .play <song name>\nEx: .play jeje diamond`); return; }
        try {
          const q = args.join(" ");
          await reply(`🔍 Searching: ${q}...`);
          const search = await yts(q);
          const video = search.videos[0];
          if (!video) { await reply("❌ Not found"); return; }
          await sock.sendMessage(jid, { image: { url: video.thumbnail }, caption: `🎵 *${video.title}*\n⏱️ ${video.timestamp} | 👁️ ${video.views}\n👤 ${video.author.name}\n🔗 ${video.url}\n\n📥 .ytmp3 ${video.url}\n📥 .ytmp4 ${video.url}\n⚔️ ${C.NAME}` }, { quoted: msg });
        } catch (e) { await reply(`❌ Error: ${e.message}`); }
        return;
      }
      if (cmd === 'ytmp3') {
        if (!args[0]) { await reply(`🎵 Use: .ytmp3 <youtube link>`); return; }
        await reply(`⏳ YTMP3 downloading: ${args[0]}\n⚔️ ${C.NAME}\n(Connect API for direct audio)`);
        return;
      }
      if (cmd === 'ytmp4' || cmd === 'ytvideo') {
        if (!args[0]) { await reply(`🎬 Use: .ytmp4 <youtube link>`); return; }
        await reply(`⏳ YTMP4 downloading: ${args[0]}\n⚔️ ${C.NAME}`);
        return;
      }
      if (cmd === 'tiktok' || cmd === 'tt' || cmd === 'tiktokdl') {
        if (!args[0]) { await reply(`Use: .tiktok <tiktok link>`); return; }
        try {
          await reply(`⏳ Downloading TikTok...\n⚔️ ${C.NAME}`);
          const url = args[0];
          const res = await axios.get(`https://api.tiklydown.eu.org/api?url=${url}`).catch(()=>null);
          if (res?.data?.video?.noWatermark) {
            await sock.sendMessage(jid, { video: { url: res.data.video.noWatermark }, caption: `✅ TikTok No Watermark\n⚔️ ${C.NAME}` }, { quoted: msg });
          } else {
            await reply(`✅ Link received. API limit. Try again later.\n${url}`);
          }
        } catch { await reply(`❌ TikTok error`); }
        return;
      }
      if (cmd === 'fb' || cmd === 'facebook' || cmd === 'fbdl') {
        if (!args[0]) { await reply(`Use: .fb <facebook link>`); return; }
        await reply(`⏳ FB downloading: ${args[0]}\n⚔️ ${C.NAME}`);
        return;
      }
      if (cmd === 'ig' || cmd === 'insta' || cmd === 'instagram') {
        if (!args[0]) { await reply(`Use: .ig <instagram link>`); return; }
        await reply(`⏳ IG downloading: ${args[0]}\n⚔️ ${C.NAME}`);
        return;
      }
      if (cmd === 'ai' || cmd === 'gpt' || cmd === 'chatgpt' || cmd === 'ask') {
        if (!args[0]) { await reply(`🤖 Use: .ai <question>\nEx: .ai who is messi`); return; }
        try {
          const prompt = args.join(" ");
          await reply(`🤖 Thinking...`);
          const res = await axios.get(`https://vihangayt.me/tools/chatgpt?q=${encodeURIComponent(prompt)}`).catch(()=>null);
          const answer = res?.data?.data || res?.data?.message || `🤖 *${C.NAME} AI*\n\nYou asked: ${prompt}\n\nI am VIKING MD PRO AI — BORN TO RULE ⚔️\nAnswer: This is a premium AI feature. Connect your API for full answer.`;
          await reply(`🤖 *AI ANSWER*\n\n${answer}\n\n⚔️ ${C.NAME}`);
        } catch { await reply(`🤖 AI error`); }
        return;
      }
      if (cmd === 'imagine' || cmd === 'dalle') {
        if (!args[0]) { await reply(`🎨 Use: .imagine <prompt>`); return; }
        await reply(`🎨 *AI IMAGE*\nPrompt: ${args.join(" ")}\n\nConnect image API key\n⚔️ ${C.NAME}`);
        return;
      }
      // ===== END DOWNLOADER & AI =====

      if (cmd === 'menu') {
        await reply(`⚔️ *${C.NAME}* ⚔️\n\n*🎮 GAMES:*\n⚔️ .battle @ / .duel @\n🧠 .trivia\n🎯 .guess\n🔤 .scramble\n❓ .riddle\n🎲 .dice\n🪙 .flip / .coinflip\n🃏 .card\n🏆 .leaderboard\n⚽ .football / .fquiz\n🏁 .reaction / .speed\n🌚 .tod / .truth / .dare\n\n*📥 DOWNLOADERS:*\n🎵 .play <song>\n🎵 .ytmp3 <link>\n🎬 .ytmp4 <link>\n📱 .tiktok <link>\n📘 .fb <link>\n📸 .ig <link>\n\n*🤖 AI:*\n🤖 .ai <q> / .gpt\n🎨 .imagine <prompt>\n\n*🛡️ SECURITY:*\n.antilink .antibug .antidelete\n.antiviewonce .antistatusmention\n\n*👑 OWNER:*\n.obban .obunban .ban .banlist .antibugall\n\n*👥 GROUP:*\n.tagall .kick .add .promote .link .close .open\n\n*👥 EVERYONE:*\n.menu .ping .alive .owner .getpp .vv .sticker\n\n⚔️ *${C.NAME} — BORN TO RULE*`);
        return;
      }
      if (cmd === 'battle' || cmd === 'duel') {
        const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!target) { await reply("Use: .battle @user"); return; }
        const p1 = Math.floor(Math.random() * 100) + 1;
        const p2 = Math.floor(Math.random() * 100) + 1;
        const win = p1 > p2 ? senderId : target;
        addPoints(jid, win, 10);
        await sock.sendMessage(jid, { text: `⚔️ *BATTLE RESULT* ⚔️\n\n@${senderNum}: ${p1} power\n@${jidNum(target)}: ${p2} power\n\n🏆 Winner: @${jidNum(win)} (+10 pts)`, mentions: [senderId, target] });
        return;
      }
      if (cmd === 'trivia' || cmd === 'quiz') {
        const q = TRIVIA[Math.floor(Math.random() * TRIVIA.length)];
        gameState[jid] = { type: 'trivia', answer: q.a.toLowerCase() }; save(FILES.games, gameState);
        await reply(`🧠 *TRIVIA QUIZ*\n\n${q.q}\n\nReply with answer!`);
        return;
      }
      if (cmd === 'football' || cmd === 'fquiz') {
        const q = FOOTBALL_Q[Math.floor(Math.random() * FOOTBALL_Q.length)];
        gameState[jid] = { type: 'football', answer: q.a.toLowerCase() }; save(FILES.games, gameState);
        await reply(`⚽ *FOOTBALL QUIZ*\n\n${q.q}`);
        return;
      }
      if (cmd === 'riddle') {
        const q = RIDDLES[Math.floor(Math.random() * RIDDLES.length)];
        gameState[jid] = { type: 'riddle', answer: q.a.toLowerCase() }; save(FILES.games, gameState);
        await reply(`❓ *RIDDLE*\n\n${q.q}`);
        return;
      }
      if (cmd === 'scramble' || cmd === 'word') {
        const word = SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)];
        const scrambled = word.split('').sort(() => 0.5 - Math.random()).join('');
        gameState[jid] = { type: 'scramble', answer: word.toLowerCase() }; save(FILES.games, gameState);
        await reply(`🔤 *WORD SCRAMBLE*\n\nUnscramble: *${scrambled.toUpperCase()}*`);
        return;
      }
      if (cmd === 'guess' || cmd === 'gtn') {
        const num = Math.floor(Math.random() * 100) + 1;
        gameState[jid] = { type: 'guess', answer: String(num) }; save(FILES.games, gameState);
        await reply(`🎯 *GUESS THE NUMBER*\n1-100 — Reply guess!`);
        return;
      }
      if (cmd === 'dice') {
        const d = Math.floor(Math.random() * 6) + 1;
        addPoints(jid, senderId, d);
        await reply(`🎲 *DICE:* You rolled *${d}* +${d} pts @${senderNum}`, { mentions: [senderId] });
        return;
      }
      if (cmd === 'flip' || cmd === 'coinflip' || cmd === 'coin') {
        const side = Math.random() > 0.5 ? "HEADS" : "TAILS";
        const choice = args[0]?.toUpperCase();
        if (!choice) { await reply(`🪙 Use: .flip heads/tails`); return; }
        const win = choice === side;
        if (win) addPoints(jid, senderId, 10);
        await reply(`🪙 *COIN:* ${side}\nYou chose: ${choice}\n${win ? "✅ YOU WIN +10 pts!" : "❌ YOU LOSE!"}`);
        return;
      }
      if (cmd === 'card' || cmd === 'cards') {
        const c1 = CARDS[Math.floor(Math.random() * CARDS.length)];
        const c2 = CARDS[Math.floor(Math.random() * CARDS.length)];
        const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || senderId;
        await sock.sendMessage(jid, { text: `🃏 *CARD CHALLENGE*\n\n@${senderNum}: ${c1}\n@${jidNum(target)}: ${c2}`, mentions: [senderId, target] });
        return;
      }
      if (cmd === 'reaction' || cmd === 'speed' || cmd === 'react') {
        gameState[jid] = { type: 'reaction', start: Date.now() }; save(FILES.games, gameState);
        await reply(`🏁 *REACTION CHALLENGE*\nType ⚔️ as FAST as you can!`);
        return;
      }
      if (cmd === 'tod' || cmd === 'truthordare' || cmd === 'dare' || cmd === 'truth') {
        if (cmd === 'truth' || args[0] === 'truth') {
          const q = TOD_TRUTH[Math.floor(Math.random() * TOD_TRUTH.length)];
          await reply(`🌚 *TRUTH:* ${q}`);
        } else if (cmd === 'dare' || args[0] === 'dare') {
          const q = TOD_DARE[Math.floor(Math.random() * TOD_DARE.length)];
          await reply(`🌚 *DARE:* ${q}`);
        } else {
          await reply(`🌚 *TRUE OR DARE*\n.truth - Get truth\n.dare - Get dare`);
        }
        return;
      }
      if (cmd === 'leaderboard' || cmd === 'lb' || cmd === 'top') {
        let list = Object.entries(leaderboard).filter(([k,v]) => k.startsWith(jid + "_")).sort((a,b) => b[1].points - a[1].points).slice(0,10);
        if (list.length === 0) { await reply("🏆 No leaderboard yet. Play games!"); return; }
        let t = `🏆 *LEADERBOARD - ${C.NAME}*\n\n`;
        list.forEach(([k,v],i) => { t += `${i+1}. @${jidNum(v.id)} - ${v.points} pts\n`; });
        await sock.sendMessage(jid, { text: t, mentions: list.map(([k,v]) => v.id) });
        return;
      }
      const groupAdminOnly = ['tagall','hidetag','kick','add','promote','demote','link','gclink','revoke','close','open','setname','setdesc','mute','unmute','antilink','antistatusmention','antispam','welcome','goodbye','antidelete','autoreact','autostatus','antiviewonce'];
      if (groupAdminOnly.includes(cmd)) {
        if (!isGroup(jid)) { await reply("Group only"); return; }
        const admin = await isGroupAdmin(jid, senderId);
        if (!admin && !isOwn) { await reply("🔒 GROUP ADMIN ONLY"); return; }
        if (['antilink','antistatusmention','antispam','welcome','goodbye','antidelete','autoreact','autostatus','antiviewonce'].includes(cmd)) {
          const v = args[0]; if (!['on','off','status'].includes(v)) { await reply(`Use .${cmd} on/off/status`); return; }
          if (v === 'status') { await reply(`${cmd}: ${getSet(jid)[cmd] ? "ON ✅" : "OFF ❌"}`); return; }
          const on = v === 'on'; settings[jid] = { ...getSet(jid), [cmd]: on }; save(FILES.settings, settings); await reply(`✅ ${cmd} ${on ? "ON ✅" : "OFF ❌"}`); return;
        }
      }
      if (cmd === 'tagall') { try { const meta = await sock.groupMetadata(jid); await sock.sendMessage(jid, { text: `📢 TAGALL (${meta.participants.length})`, mentions: meta.participants.map(p => p.id) }); } catch {} return; }
      if (cmd === 'hidetag') { const ht = args.join(" ") || "📢 VIKING"; try { const meta = await sock.groupMetadata(jid); await sock.sendMessage(jid, { text: ht, mentions: meta.participants.map(p => p.id) }); } catch {} return; }
      if (cmd === 'kick') { const m = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; if (!m) { await reply("Use .kick @user"); return; } try { await sock.groupParticipantsUpdate(jid, [m], "remove"); await reply("✅ Kicked"); } catch { await reply("❌ Bot not admin"); } return; }
      if (cmd === 'add') { let num = clean(args[0]); if (!num) { await reply("Use .add 2547..."); return; } try { await sock.groupParticipantsUpdate(jid, [num + "@s.w
