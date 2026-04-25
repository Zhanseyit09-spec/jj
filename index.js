require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const TelegramBot = require('node-telegram-bot-api');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

// Database орнатуы
const db = new Database('jobs.db');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Кестелерін құру
db.exec(`
  CREATE TABLE IF NOT EXISTS vacancies (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    title            TEXT NOT NULL,
    company          TEXT NOT NULL,
    skills           TEXT NOT NULL,
    city             TEXT NOT NULL,
    district         TEXT,
    type             TEXT NOT NULL,
    experience       TEXT NOT NULL,
    employer_chat_id TEXT NOT NULL,
    salary           TEXT,
    phone            TEXT NOT NULL,
    requirements     TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS applications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vacancy_id  INTEGER,
    name        TEXT NOT NULL,
    skills      TEXT NOT NULL,
    phone       TEXT NOT NULL,
    chat_id     TEXT NOT NULL,
    city        TEXT,
    district    TEXT,
    experience  TEXT,
    jobtype     TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const userState = {};

const CITIES = {
  kz: { '1': 'Aktau_kz', '2': 'Zhanaozen_kz', '3': 'Any_kz' },
  ru: { '1': 'Aktau_ru', '2': 'Zhanaozen_ru', '3': 'Any_ru' },
  en: { '1': 'Aktau',    '2': 'Zhanaozen',    '3': 'Anywhere' },
};

const EXPERIENCE = {
  kz: { '1': 'Junior', '2': 'Middle', '3': 'Senior', '4': 'Any_kz' },
  ru: { '1': 'Junior', '2': 'Middle', '3': 'Senior', '4': 'Any_ru' },
  en: { '1': 'Junior', '2': 'Middle', '3': 'Senior', '4': 'Any'    },
};

const SCHEDULE = {
  kz: { '1': 'Tolyk_kun', '2': 'Zhartylai' },
  ru: { '1': 'Polnyi_den', '2': 'Chastichnaya' },
  en: { '1': 'Full time', '2': 'Part time' },
};

const ANY_EXP  = new Set(['Any_kz', 'Any_ru', 'Any']);
const ANY_CITY = new Set(['Any_kz', 'Any_ru', 'Anywhere']);

const CITY_LABEL = {
  kz: { '1': 'Ақтау',   '2': 'Жаңаөзен' },
  ru: { '1': 'Актау',   '2': 'Жанаозен' },
  en: { '1': 'Aktau',   '2': 'Zhanaozen' },
};

const SCHEDULE_LABEL = {
  kz: { '1': 'Толық күн', '2': 'Жартылай' },
  ru: { '1': 'Полный день', '2': 'Частичная занятость' },
  en: { '1': 'Full time',  '2': 'Part time' },
};

const M = {
  kz: {
    welcome:         '👋 Сәлем! Мангыстау Жұмыс Платформасына қош келдіңіз!',
    who:             'Сіз кімсіз?',
    seeker:          '🔍 Жұмыс іздеймін',
    employer:        '💼 Жұмысшы іздеймін',
    browse:          '📋 Б��рлық вакансияларды көру',
    cancel:          '❌ Болдырмау',
    cancelled:       '❌ Болдырылмады. /start басыңыз.',
    name:            '📝 Атыңызды жазыңыз:',
    skills:          '🛠 Дағдыларыңызды үтір арқылы жазыңыз:',
    phone:           '📞 Телефон нөміріңізді жазыңыз (+77001234567):',
    invalidPhone:    '⚠️ Телефон дұрыс емес. Қайта жазыңыз:',
    cityFilter:      '📍 Қай қалада жұмыс іздейсіз?\n1. Ақтау\n2. Жаңаөзен\n3. Барлығы',
    districtFilter:  '🏘 Шағын аудан (0 жазсаңыз маңызды емес болса):',
    scheduleFilter:  '🕔 Жұмыс түрі:\n1. Толық күн\n2. Жартылай\n3. Өзге\n\n0 - маңызды емес',
    scheduleCustom:  '✏️ Жұмыс кестесін жазыңыз:',
    expFilter:       '⭐ Тәжірибеңіз:\n1. Junior\n2. Middle\n3. Senior\n4. Барлығы',
    saved:           '✅ Өтінішіңіз сақталды!',
    matched:         '✅ Мүмкін вакансиялар:\n\n',
    noMatch:         '😔 Вакансия табылмады. Өтініш сақталды!',
    thinking:        '🤖 AI іздеп жатыр…',
    vtitle:          '📝 Вакансия атауын жазыңыз:',
    vcompany:        '🏢 Компания атауын жазыңыз:',
    vskills:         '🛠 Қандай дағдылар керек? (үтір арқылы)',
    vcity:           '📍 Қала:\n1. Ақтау\n2. Жаңаөзен\n3. Барлығы',
    vdistrict:       '🏘 Шағын аудан (0 жоқ болса):',
    vsalary:         '💰 Жалақы:',
    vschedule:       '🕔 Жұмыс түрі:\n1. Толық күн\n2. Жартылай\n3. Өзге',
    vscheduleCustom: '✏️ Жұмыс кестесін жазыңыз:',
    vexperience:     '⭐ Қандай тәжірибе керек?\n1. Junior\n2. Middle\n3. Senior\n4. Барлығы',
    vrequirements:   '📋 Талаптар (0 жоқ болса):',
    vposted:         '✅ Вакансия жарияланды!\n\n',
    allVacancies:    '📋 Барлық вакансиялар:\n\n',
    noVacancies:     '😔 Әзірше вакансия жоқ.',
    newVacSeeker:    '🔔 Жаңа вакансия!\n\n',
    candidates:      '👥 Сізге сай кандидаттар:\n\n',
    newApp:          '🔔 Жаңа өтініш!\n\n👤 {name}\n🛠 {skills}\n📞 {phone}\n⭐ {exp}',
    tooFast:         '⚠️ Тым жіі. Бірер секунд күтіңіз.',
    exp:             'Тәжірибе',
    req:             'Талаптар',
  },
  ru: {
    welcome:         '👋 Привет! Добро пожаловать на платформу труда Мангистау!',
    who:             'Кто вы?',
    seeker:          '🔍 Ищу работу',
    employer:        '💼 Ищу работника',
    browse:          '📋 Посмотреть все вакансии',
    cancel:          '❌ Отмена',
    cancelled:       '❌ Отменено. Нажмите /start.',
    name:            '📝 Напишите ваше имя:',
    skills:          '🛠 Напишите навыки через запятую:',
    phone:           '📞 Напишите номер телефона (+77001234567):',
    invalidPhone:    '⚠️ Неверный номер. Напишите снова:',
    cityFilter:      '📍 В каком городе?\n1. Актау\n2. Жанаозен\n3. Везде',
    districtFilter:  '🏘 Микрорайон (0 - неважно):',
    scheduleFilter:  '🕔 Тип работы:\n1. Полный день\n2. Частичная занятость\n3. Другое\n\n0 - неважно',
    scheduleCustom:  '✏️ Напишите свой график:',
    expFilter:       '⭐ Уровень опыта:\n1. Junior\n2. Middle\n3. Senior\n4. Все',
    saved:           '✅ Заявка сохранена!',
    matched:         '✅ Возможные вакансии:\n\n',
    noMatch:         '😔 Вакансий не найдено. Заявка сохранена!',
    thinking:        '🤖 AI ищет…',
    vtitle:          '📝 Название вакансии:',
    vcompany:        '🏢 Название компании:',
    vskills:         '🛠 Какие навыки нужны? (через запятую)',
    vcity:           '📍 Город:\n1. Актау\n2. Жанаозен\n3. Везде',
    vdistrict:       '🏘 Микрорайон (0 - нет):',
    vsalary:         '💰 Зарплата:',
    vschedule:       '🕔 Тип работы:\n1. Полный день\n2. Частичная занятость\n3. Другое',
    vscheduleCustom: '✏️ Напишите свой график:',
    vexperience:     '⭐ Какой опыт нужен?\n1. Junior\n2. Middle\n3. Senior\n4. Все',
    vrequirements:   '📋 Требования (0 - нет):',
    vposted:         '✅ Вакансия опубликована!\n\n',
    allVacancies:    '📋 Все вакансии:\n\n',
    noVacancies:     '😔 Вакансий пока нет.',
    newVacSeeker:    '🔔 Новая вакансия!\n\n',
    candidates:      '👥 Подходящие кандидаты:\n\n',
    newApp:          '🔔 Новая заявка!\n\n👤 {name}\n🛠 {skills}\n📞 {phone}\n⭐ {exp}',
    tooFast:         '⚠️ Слишком быстро. Подождите секунду.',
    exp:             'Опыт',
    req:             'Требования',
  },
  en: {
    welcome:         '👋 Hello! Welcome to Mangistau Job Platform!',
    who:             'Who are you?',
    seeker:          '🔍 Looking for a job',
    employer:        '💼 Looking for a worker',
    browse:          '📋 Browse all vacancies',
    cancel:          '❌ Cancel',
    cancelled:       '❌ Cancelled. Press /start.',
    name:            '📝 Write your name:',
    skills:          '🛠 Write your skills separated by commas:',
    phone:           '📞 Write your phone number (+77001234567):',
    invalidPhone:    '⚠️ Invalid phone. Write again:',
    cityFilter:      '📍 Which city?\n1. Aktau\n2. Zhanaozen\n3. Anywhere',
    districtFilter:  '🏘 District (0 if not important):',
    scheduleFilter:  '🕔 Job type:\n1. Full time\n2. Part time\n3. Other\n\n0 - not important',
    scheduleCustom:  '✏️ Write your preferred schedule:',
    expFilter:       '⭐ Experience level:\n1. Junior\n2. Middle\n3. Senior\n4. Any',
    saved:           '✅ Application saved!',
    matched:         '✅ Possible vacancies:\n\n',
    noMatch:         '😔 No vacancies found. Application saved!',
    thinking:        '🤖 AI is searching…',
    vtitle:          '📝 Write vacancy title:',
    vcompany:        '🏢 Write company name:',
    vskills:         '🛠 What skills are needed? (comma separated)',
    vcity:           '📍 City:\n1. Aktau\n2. Zhanaozen\n3. Anywhere',
    vdistrict:       '🏘 District (0 if none):',
    vsalary:         '💰 Salary:',
    vschedule:       '🕔 Job type:\n1. Full time\n2. Part time\n3. Other',
    vscheduleCustom: '✏️ Write your work schedule:',
    vexperience:     '⭐ Experience needed?\n1. Junior\n2. Middle\n3. Senior\n4. Any',
    vrequirements:   '📋 Requirements (0 if none):',
    vposted:         '✅ Vacancy published!\n\n',
    allVacancies:    '📋 All vacancies:\n\n',
    noVacancies:     '😔 No vacancies yet.',
    newVacSeeker:    '🔔 New vacancy!\n\n',
    candidates:      '👥 Matching candidates:\n\n',
    newApp:          '🔔 New application!\n\n👤 {name}\n🛠 {skills}\n📞 {phone}\n⭐ {exp}',
    tooFast:         '⚠️ Too fast. Please wait a second.',
    exp:             'Experience',
    req:             'Requirements',
  },
};

// Көмекші функциялар
function getLang(chatId) {
  return (userState[chatId] && userState[chatId].lang) || 'ru';
}

function isValidPhone(p) {
  const digits = p.replace(/[\s-()]/g, '');
  return /^(\+)?[0-9]{10,13}$/.test(digits);
}

function parseMap(map, text, lang) {
  if (map[lang] && map[lang][text] !== undefined) return map[lang][text];
  return text;
}

function cancelKb(m) {
  return { reply_markup: { keyboard: [[m.cancel]], resize_keyboard: true } };
}

function getCityLabel(lang, key) {
  return (CITY_LABEL[lang] && CITY_LABEL[lang][key]) || '';
}

function getScheduleLabel(lang, key) {
  return (SCHEDULE_LABEL[lang] && SCHEDULE_LABEL[lang][key]) || '';
}

function formatVacancy(v, i, lang) {
  const m = M[lang];
  let msg = i + '. ' + v.title + ' - ' + v.company + '\n';
  msg += v.city;
  if (v.district) msg += ', ' + v.district;
  msg += '\n';
  if (v.salary) msg += v.salary + '\n';
  msg += v.type + '\n';
  msg += m.exp + ': ' + v.experience + '\n';
  if (v.requirements) msg += m.req + ': ' + v.requirements + '\n';
  msg += v.phone + '\n\n';
  return msg;
}

function sendLong(bot, chatId, header, items) {
  let msg = header;
  for (let i = 0; i < items.length; i++) {
    if ((msg + items[i]).length > 3800) {
      bot.sendMessage(chatId, msg).catch((err) => console.error('Send error:', err));
      msg = items[i];
    } else {
      msg += items[i];
    }
  }
  if (msg.trim()) {
    bot.sendMessage(chatId, msg).catch((err) => console.error('Send error:', err));
  }
}

// Rate limiter
const rateLimiter = new Map();
function isRateLimited(chatId) {
  const now = Date.now();
  const last = rateLimiter.get(chatId) || 0;
  if (now - last < 1000) return true;
  rateLimiter.set(chatId, now);
  return false;
}

// Rate limiter тазалау
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [id, ts] of rateLimiter.entries()) {
    if (ts < cutoff) rateLimiter.delete(id);
  }
}, 600000);

// AI skill matching
async function skillsMatch(s1, s2) {
  if (!s1 || !s2) return false;
  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{
        role: 'user',
        content: `Do these skill sets match for a job? Answer only yes or no.\nSkills 1: "${s1}"\nSkills 2: "${s2}"`
      }],
      max_tokens: 5,
      temperature: 0,
    });
    return resp.choices[0].message.content.trim().toLowerCase().startsWith('yes');
  } catch (e) {
    console.error('OpenAI error:', e.message);
    // Fallback: жергілік сәйкестеу
    const a = s1.toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
    const b = s2.toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
    return a.some((x) => b.some((y) => x.includes(y) || y.includes(x)));
  }
}

// Вакансияларды сүзу
async function filterVacancies(vacancies, state) {
  const results = [];
  for (let i = 0; i < vacancies.length; i++) {
    const v = vacancies[i];
    const match = await skillsMatch(state.skills, v.skills);
    if (!match) continue;

    if (state.cityFilter && v.city) {
      if (!v.city.toLowerCase().includes(state.cityFilter.toLowerCase())) continue;
    }
    if (state.districtFilter && v.district) {
      if (!v.district.toLowerCase().includes(state.districtFilter.toLowerCase())) continue;
    }
    if (state.jobTypeFilter && v.type) {
      if (!v.type.toLowerCase().includes(state.jobTypeFilter.toLowerCase())) continue;
    }
    if (state.experienceFilter && v.experience) {
      if (!v.experience.toLowerCase().includes(state.experienceFilter.toLowerCase())) continue;
    }
    results.push(v);
  }

  // Жалақы бойынша сортқы
  results.sort((a, b) => {
    const getNum = (s) => parseInt((s || '').replace(/\D/g, '') || '0', 10);
    return getNum(b.salary) - getNum(a.salary);
  });
  return results;
}

// Telegram бот құру
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

function showLangMenu(chatId) {
  bot.sendMessage(chatId, 'Choose language / Тілді таңдаңыз / Выберите язык:', {
    reply_markup: {
      keyboard: [['🇰🇿 Қазақша'], ['🇷🇺 Русский'], ['🇬🇧 English']],
      resize_keyboard: true,
    },
  }).catch((err) => console.error('Send error:', err));
}

function showMainMenu(chatId, lang) {
  const m = M[lang];
  bot.sendMessage(chatId, m.welcome + '\n\n' + m.who, {
    reply_markup: { keyboard: [[m.seeker], [m.employer], [m.browse]], resize_keyboard: true },
  }).catch((err) => console.error('Send error:', err));
}

// /start команда
bot.onText(/\/start/, (msg) => {
  delete userState[msg.chat.id];
  showLangMenu(msg.chat.id);
});

// /cancel команда
bot.onText(/\/cancel/, (msg) => {
  const lang = getLang(msg.chat.id);
  delete userState[msg.chat.id];
  bot.sendMessage(msg.chat.id, M[lang].cancelled).catch((err) => console.error('Send error:', err));
});

// Барлық хабарламалар
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();

  if (!text || text.startsWith('/')) return;

  if (isRateLimited(chatId)) {
    bot.sendMessage(chatId, M[getLang(chatId)].tooFast).catch((err) => console.error('Send error:', err));
    return;
  }

  // Тіл таңдау
  if (text === '🇰🇿 Қазақша') { userState[chatId] = { lang: 'kz' }; showMainMenu(chatId, 'kz'); return; }
  if (text === '🇷🇺 Русский')  { userState[chatId] = { lang: 'ru' }; showMainMenu(chatId, 'ru'); return; }
  if (text === '🇬🇧 English')  { userState[chatId] = { lang: 'en' }; showMainMenu(chatId, 'en'); return; }

  const state = userState[chatId];
  if (!state || !state.lang) { showLangMenu(chatId); return; }

  const lang = state.lang;
  const m = M[lang];

  if (text === m.cancel) {
    delete userState[chatId];
    bot.sendMessage(chatId, m.cancelled).catch((err) => console.error('Send error:', err));
    return;
  }

  // Барлық вакансияларды браузерлеу
  if (text === m.browse) {
    const list = db.prepare('SELECT * FROM vacancies ORDER BY id DESC').all();
    if (!list.length) {
      bot.sendMessage(chatId, m.noVacancies).catch((err) => console.error('Send error:', err));
      return;
    }
    sendLong(bot, chatId, m.allVacancies, list.map((v, i) => formatVacancy(v, i + 1, lang)));
    return;
  }

  // Job seeker ағымы
  if (text === m.seeker) {
    userState[chatId] = { lang: lang, role: 'seeker', step: 'name' };
    bot.sendMessage(chatId, m.name, cancelKb(m)).catch((err) => console.error('Send error:', err));
    return;
  }

  // Employer ағымы
  if (text === m.employer) {
    userState[chatId] = { lang: lang, role: 'employer', step: 'title' };
    bot.sendMessage(chatId, m.vtitle, cancelKb(m)).catch((err) => console.error('Send error:', err));
    return;
  }

  if (state.role === 'seeker')   { await seekerFlow(chatId, text, state, m);   return; }
  if (state.role === 'employer') { await employerFlow(chatId, text, state, m); return; }
});

// Job Seeker ағымы
async function seekerFlow(chatId, text, state, m) {
  const lang = state.lang;

  if (state.step === 'name') {
    state.name = text;
    state.step = 'skills';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.skills, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'skills') {
    state.skills = text;
    state.step = 'cityFilter';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.cityFilter, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'cityFilter') {
    const cityCode = parseMap(CITIES, text, lang);
    state.cityFilter = ANY_CITY.has(cityCode) ? null : getCityLabel(lang, text);
    state.step = 'districtFilter';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.districtFilter, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'districtFilter') {
    state.districtFilter = text === '0' ? null : text;
    state.step = 'scheduleFilter';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.scheduleFilter, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'scheduleFilter') {
    if (text === '0') {
      state.jobTypeFilter = null;
    } else if (text === '3') {
      state.step = 'scheduleCustom';
      userState[chatId] = state;
      bot.sendMessage(chatId, m.scheduleCustom, cancelKb(m)).catch((err) => console.error('Send error:', err));
      return;
    } else if (text === '1' || text === '2') {
      state.jobTypeFilter = getScheduleLabel(lang, text);
    } else {
      state.jobTypeFilter = text;
    }
    state.step = 'expFilter';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.expFilter, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'scheduleCustom') {
    state.jobTypeFilter = text;
    state.step = 'expFilter';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.expFilter, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'expFilter') {
    const expCode = parseMap(EXPERIENCE, text, lang);
    state.experienceFilter = ANY_EXP.has(expCode) ? null : expCode;
    state.step = 'phone';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.phone, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'phone') {
    if (!isValidPhone(text)) {
      bot.sendMessage(chatId, m.invalidPhone, cancelKb(m)).catch((err) => console.error('Send error:', err));
      return;
    }
    state.phone = text;
    bot.sendMessage(chatId, m.thinking).catch((err) => console.error('Send error:', err));

    try {
      let vacancies = [];
      const list = db.prepare('SELECT * FROM vacancies ORDER BY id DESC').all();
      vacancies = await filterVacancies(list, state);

      db.prepare(
        'INSERT INTO applications (vacancy_id, name, skills, phone, chat_id, city, district, experience, jobtype) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        vacancies.length > 0 ? vacancies[0].id : 0,
        state.name, state.skills, state.phone, chatId.toString(),
        state.cityFilter || null, state.districtFilter || null,
        state.experienceFilter || null, state.jobTypeFilter || null
      );

      if (vacancies.length > 0) {
        sendLong(bot, chatId, m.matched, vacancies.map((v, i) => formatVacancy(v, i + 1, lang)));
        vacancies.forEach((v) => {
          if (v.employer_chat_id && v.employer_chat_id !== chatId.toString()) {
            const notify = m.newApp
              .replace('{name}', state.name)
              .replace('{skills}', state.skills)
              .replace('{phone}', state.phone)
              .replace('{exp}', state.experienceFilter || '-');
            bot.sendMessage(v.employer_chat_id, notify).catch((err) => console.error('Send error:', err));
          }
        });
      } else {
        bot.sendMessage(chatId, m.noMatch).catch((err) => console.error('Send error:', err));
      }
    } catch (e) {
      console.error('Seeker flow error:', e);
      bot.sendMessage(chatId, 'Error: ' + e.message).catch((err) => console.error('Send error:', err));
    }

    delete userState[chatId];
  }
}

// Employer ағымы
async function employerFlow(chatId, text, state, m) {
  const lang = state.lang;

  if (state.step === 'title') {
    state.title = text;
    state.step = 'company';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.vcompany, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'company') {
    state.company = text;
    state.step = 'skills';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.vskills, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'skills') {
    state.skills = text;
    state.step = 'city';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.vcity, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'city') {
    const cityCode = parseMap(CITIES, text, lang);
    state.city = ANY_CITY.has(cityCode) ? 'Aktau/Zhanaozen' : getCityLabel(lang, text) || text;
    state.step = 'district';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.vdistrict, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'district') {
    state.district = text === '0' ? null : text;
    state.step = 'salary';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.vsalary, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'salary') {
    state.salary = text;
    state.step = 'schedule';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.vschedule, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'schedule') {
    if (text === '3') {
      state.step = 'scheduleCustom';
      userState[chatId] = state;
      bot.sendMessage(chatId, m.vscheduleCustom, cancelKb(m)).catch((err) => console.error('Send error:', err));
      return;
    } else if (text === '1' || text === '2') {
      state.schedule = getScheduleLabel(lang, text);
    } else {
      state.schedule = text;
    }
    state.step = 'experience';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.vexperience, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'scheduleCustom') {
    state.schedule = text;
    state.step = 'experience';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.vexperience, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'experience') {
    state.experience = parseMap(EXPERIENCE, text, lang);
    if (ANY_EXP.has(state.experience)) state.experience = 'Any';
    state.step = 'requirements';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.vrequirements, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'requirements') {
    state.requirements = text === '0' ? null : text;
    state.step = 'phone';
    userState[chatId] = state;
    bot.sendMessage(chatId, m.phone, cancelKb(m)).catch((err) => console.error('Send error:', err));

  } else if (state.step === 'phone') {
    if (!isValidPhone(text)) {
      bot.sendMessage(chatId, m.invalidPhone, cancelKb(m)).catch((err) => console.error('Send error:', err));
      return;
    }
    state.phone = text;

    try {
      db.prepare(
        'INSERT INTO vacancies (title, company, skills, city, district, type, experience, employer_chat_id, salary, phone, requirements) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        state.title, state.company, state.skills,
        state.city, state.district || null,
        state.schedule, state.experience,
        chatId.toString(),
        state.salary, state.phone,
        state.requirements || null
      );

      const lastVac = db.prepare(
        'SELECT * FROM vacancies WHERE employer_chat_id = ? ORDER BY id DESC LIMIT 1'
      ).get(chatId.toString());

      sendLong(bot, chatId, m.vposted, [formatVacancy(lastVac, 1, lang)]);

      // Pending applications-ти ескер
      const pending = db.prepare('SELECT * FROM applications WHERE vacancy_id = 0').all();
      for (let i = 0; i < pending.length; i++) {
        const appl = pending[i];
        if (!appl.chat_id || appl.chat_id === chatId.toString()) continue;
        try {
          const match = await skillsMatch(appl.skills, state.skills);
          if (match) {
            bot.sendMessage(appl.chat_id, m.newVacSeeker + formatVacancy(lastVac, 1, lang)).catch((err) => console.error('Send error:', err));
          }
        } catch (e) {
          console.error('Notify seeker error:', e);
        }
      }

      // Барлық applications-ті сәйкестеу
      const allApps = db.prepare('SELECT * FROM applications').all();
      const matched = [];
      for (let i = 0; i < allApps.length; i++) {
        const appl = allApps[i];
        if (appl.chat_id === chatId.toString()) continue;
        try {
          const match = await skillsMatch(appl.skills, state.skills);
          if (match) matched.push(appl);
        } catch (e) {
          console.error('Match error:', e);
        }
      }

      if (matched.length > 0) {
        let msg = m.candidates;
        matched.forEach((appl, i) => {
          msg += (i + 1) + '. ' + appl.name + '\n' + appl.skills + '\n' + appl.phone + '\n\n';
        });
        bot.sendMessage(chatId, msg).catch((err) => console.error('Send error:', err));
      }
    } catch (e) {
      console.error('Employer flow error:', e);
      bot.sendMessage(chatId, 'Error: ' + e.message).catch((err) => console.error('Send error:', err));
    }

    delete userState[chatId];
  }
}

// REST API endpoints
app.get('/vacancies', (req, res) => {
  try {
    const vacancies = db.prepare('SELECT * FROM vacancies ORDER BY id DESC').all();
    res.json(vacancies);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/applications', (req, res) => {
  try {
    const applications = db.prepare('SELECT * FROM applications ORDER BY id DESC').all();
    res.json(applications);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Серверді іске қосу
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`📱 Bot is polling for messages...`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⚠️ Shutting down gracefully...');
  bot.stopPolling();
  process.exit(0);
});
