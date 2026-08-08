import fs from 'node:fs';
import path from 'node:path';

const storageDir = path.resolve('storage');
const dataFile = path.join(storageDir, 'clover-rules.json');
fs.mkdirSync(storageDir, { recursive: true });

const defaults = {
  site_name: 'CLOVER CITY',
  site_title: 'CLOVER CITY RULES',
  site_enabled: '1',
  maintenance_message: '現在ルールサイトはメンテナンス中です。',
  discord_url: '',
  primary_color: '#8DFF2A',
  accent_color: '#49B80D',
  background_color: '#050705',
  panel_color: '#0B100A',
  text_color: '#F4F8F1',
  muted_color: '#98A492'
};

const seedCategories = [
  ['基本ルール','basic','サーバー全体の基本ルール'],
  ['犯罪ルール','crime-rules','犯罪RPに関するルール'],
  ['公務員ルール','public-service','警察・EMSなど公務員向けルール'],
  ['ギャングルール','gang','ギャング活動に関するルール'],
  ['イベントアタックルール','event-attack','イベントアタックに関するルール'],
  ['支援について','support','支援・特典等に関する案内']
];

function initialData() {
  const data = {
    settings: { ...defaults },
    categories: [],
    subcategories: [],
    rules: [],
    crimes: [],
    fines: [],
    counters: { categories: 0, subcategories: 0, rules: 0, crimes: 0, fines: 0 }
  };
  for (let i = 0; i < seedCategories.length; i++) {
    const [name, slug, description] = seedCategories[i];
    const categoryId = ++data.counters.categories;
    data.categories.push({ id: categoryId, name, slug, icon: '♣', description, sort_order: i * 10, is_public: 1 });
    const subId = ++data.counters.subcategories;
    data.subcategories.push({ id: subId, category_id: categoryId, name: '未分類', sort_order: 0, is_public: 1 });
  }
  return data;
}

function normalize(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  d.settings = { ...defaults, ...(d.settings || {}) };
  for (const key of ['categories','subcategories','rules','crimes','fines']) if (!Array.isArray(d[key])) d[key] = [];
  d.counters = d.counters || {};
  for (const key of ['categories','subcategories','rules','crimes','fines']) {
    const maxId = d[key].reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
    d.counters[key] = Math.max(Number(d.counters[key]) || 0, maxId);
  }
  return d;
}

let data;
try {
  data = normalize(JSON.parse(fs.readFileSync(dataFile, 'utf8')));
} catch {
  data = initialData();
}

function persist() {
  const tmp = `${dataFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, dataFile);
}
persist();

function sorted(list, fields = ['sort_order','id']) {
  return [...list].sort((a,b) => {
    for (const field of fields) {
      const av = Number(a[field]) || 0;
      const bv = Number(b[field]) || 0;
      if (av !== bv) return av - bv;
    }
    return 0;
  });
}

function nextId(key) {
  data.counters[key] = (Number(data.counters[key]) || 0) + 1;
  return data.counters[key];
}

export function getSettings() { return { ...data.settings }; }
export function setSettings(obj) {
  for (const [k,v] of Object.entries(obj)) data.settings[k] = String(v);
  persist();
}

export const store = {
  categories(publicOnly = false) {
    return sorted(data.categories.filter(x => !publicOnly || Number(x.is_public) === 1)).map(x => ({...x}));
  },
  subcategories(categoryId = null, publicOnly = false) {
    return sorted(data.subcategories.filter(x => (categoryId == null || Number(x.category_id) === Number(categoryId)) && (!publicOnly || Number(x.is_public) === 1))).map(x => ({...x}));
  },
  rules(subcategoryId = null, publicOnly = false) {
    return sorted(data.rules.filter(x => (subcategoryId == null || Number(x.subcategory_id) === Number(subcategoryId)) && (!publicOnly || Number(x.is_public) === 1))).map(x => ({...x}));
  },
  crimes(publicOnly = false) {
    return sorted(data.crimes.filter(x => !publicOnly || Number(x.is_public) === 1)).map(x => ({...x}));
  },
  fines(publicOnly = false) {
    return sorted(data.fines.filter(x => !publicOnly || Number(x.is_public) === 1)).map(x => ({...x}));
  },
  saveCategory(id, item) {
    if (id) {
      const row = data.categories.find(x => Number(x.id) === Number(id));
      if (!row) return false;
      Object.assign(row, item);
    } else data.categories.push({ id: nextId('categories'), ...item });
    persist(); return true;
  },
  deleteCategory(id) {
    const categoryId = Number(id);
    const subIds = new Set(data.subcategories.filter(x => Number(x.category_id) === categoryId).map(x => Number(x.id)));
    data.rules = data.rules.filter(x => !subIds.has(Number(x.subcategory_id)));
    data.subcategories = data.subcategories.filter(x => Number(x.category_id) !== categoryId);
    data.categories = data.categories.filter(x => Number(x.id) !== categoryId);
    persist();
  },
  saveSubcategory(id, item) {
    if (id) {
      const row = data.subcategories.find(x => Number(x.id) === Number(id));
      if (!row) return false;
      Object.assign(row, item);
    } else data.subcategories.push({ id: nextId('subcategories'), ...item });
    persist(); return true;
  },
  deleteSubcategory(id) {
    const subId = Number(id);
    data.rules = data.rules.filter(x => Number(x.subcategory_id) !== subId);
    data.subcategories = data.subcategories.filter(x => Number(x.id) !== subId);
    persist();
  },
  saveRule(id, item) {
    if (id) {
      const row = data.rules.find(x => Number(x.id) === Number(id));
      if (!row) return false;
      Object.assign(row, item, { updated_at: new Date().toISOString() });
    } else data.rules.push({ id: nextId('rules'), ...item, updated_at: new Date().toISOString() });
    persist(); return true;
  },
  deleteRule(id) { data.rules = data.rules.filter(x => Number(x.id) !== Number(id)); persist(); },
  saveCrime(id, item) {
    if (id) {
      const row = data.crimes.find(x => Number(x.id) === Number(id));
      if (!row) return false;
      Object.assign(row, item);
    } else data.crimes.push({ id: nextId('crimes'), ...item });
    persist(); return true;
  },
  deleteCrime(id) { data.crimes = data.crimes.filter(x => Number(x.id) !== Number(id)); persist(); },
  saveFine(id, item) {
    if (id) {
      const row = data.fines.find(x => Number(x.id) === Number(id));
      if (!row) return false;
      Object.assign(row, item);
    } else data.fines.push({ id: nextId('fines'), ...item });
    persist(); return true;
  },
  deleteFine(id) { data.fines = data.fines.filter(x => Number(x.id) !== Number(id)); persist(); }
};
