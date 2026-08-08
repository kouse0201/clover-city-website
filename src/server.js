import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import path from 'node:path';
import { store, getSettings, setSettings } from './db.js';

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.set('view engine', 'ejs');
app.set('views', path.resolve('views'));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.resolve('public'), { maxAge: '1h' }));
app.use(rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: BASE_URL.startsWith('https://'), maxAge: 1000 * 60 * 60 * 12 }
}));
app.use(passport.initialize());
app.use(passport.session());

const parseIds = value => new Set(String(value || '').split(',').map(x => x.trim()).filter(Boolean));
const adminUsers = parseIds(process.env.ADMIN_USER_IDS);
const adminRoles = parseIds(process.env.ADMIN_ROLE_IDS);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL || `${BASE_URL}/auth/discord/callback`,
    scope: ['identify', 'guilds.members.read']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let roles = [];
      const guildId = process.env.DISCORD_GUILD_ID;
      if (guildId && adminRoles.size) {
        const r = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (r.ok) roles = (await r.json()).roles || [];
      }
      const isAdmin = adminUsers.has(profile.id) || roles.some(id => adminRoles.has(id));
      return done(null, { id: profile.id, username: profile.username, avatar: profile.avatar, isAdmin });
    } catch (e) { return done(e); }
  }));
}

function requireAdmin(req, res, next) {
  if (req.user?.isAdmin) return next();
  return res.status(403).render('forbidden', { settings: getSettings() });
}
function requestGuard(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const fetchSite = String(
    req.get('sec-fetch-site') || ''
  ).toLowerCase();

  if (fetchSite === 'cross-site') {
    return res.status(403).json({
      error: 'Cross-site request blocked'
    });
  }

  return next();
}

app.use(requestGuard);

app.get('/auth/discord', (req, res, next) => {
  if (!process.env.DISCORD_CLIENT_ID) return res.status(503).send('Discord OAuth is not configured.');
  passport.authenticate('discord')(req, res, next);
});
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/admin?login=failed' }), (req, res) => res.redirect('/admin'));
app.post('/auth/logout', (req, res) => req.logout(() => res.redirect('/')));

app.get('/', (req, res) => {
  const settings = getSettings();
  const isAdmin = !!req.user?.isAdmin;
  if (settings.site_enabled !== '1' && !isAdmin) return res.status(503).render('maintenance', { settings });
  const categories = store.categories(true);
  for (const c of categories) {
    c.subcategories = store.subcategories(c.id, true);
    for (const sub of c.subcategories) sub.rules = store.rules(sub.id, true);
  }
  res.render('index', { settings, categories, crimes: store.crimes(true), fines: store.fines(true), user: req.user || null });
});

app.get('/admin', (req, res) => {
  if (!req.user?.isAdmin) return res.render('admin-login', { settings: getSettings(), user: req.user || null });
  res.render('admin', {
    settings: getSettings(),
    categories: store.categories(),
    subcategories: store.subcategories(),
    rules: store.rules(),
    crimes: store.crimes(),
    fines: store.fines(),
    user: req.user
  });
});

app.post('/admin/settings', requireAdmin, (req, res) => {
  const allowed = ['site_name','site_title','site_enabled','maintenance_message','discord_url','primary_color','accent_color','background_color','panel_color','text_color','muted_color'];
  const values = {};
  for (const key of allowed) if (key in req.body) values[key] = req.body[key];
  values.site_enabled = req.body.site_enabled === '1' ? '1' : '0';
  setSettings(values);
  res.redirect('/admin#settings');
});

function integer(v, fallback = 0) { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? n : fallback; }
function bool(v) { return v === '1' || v === 1 || v === true || v === 'on' ? 1 : 0; }
function slugify(v) { return String(v || '').trim().toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff-]+/g,'-').replace(/^-+|-+$/g,'') || `category-${Date.now()}`; }

app.post('/admin/category/save', requireAdmin, (req,res) => {
  const id = integer(req.body.id);
  const name = String(req.body.name||'').trim();
  if (!name) return res.status(400).send('name required');
  store.saveCategory(id, {
    name,
    slug: slugify(req.body.slug || name),
    icon: String(req.body.icon||'♣').slice(0,8),
    description: String(req.body.description||'').trim(),
    sort_order: integer(req.body.sort_order),
    is_public: bool(req.body.is_public)
  });
  res.redirect('/admin#categories');
});
app.post('/admin/category/delete', requireAdmin, (req,res) => { store.deleteCategory(integer(req.body.id)); res.redirect('/admin#categories'); });

app.post('/admin/subcategory/save', requireAdmin, (req,res) => {
  const id=integer(req.body.id), categoryId=integer(req.body.category_id), name=String(req.body.name||'').trim();
  if (!categoryId || !name) return res.status(400).send('category/name required');
  store.saveSubcategory(id, { category_id: categoryId, name, sort_order: integer(req.body.sort_order), is_public: bool(req.body.is_public) });
  res.redirect('/admin#rules');
});
app.post('/admin/subcategory/delete', requireAdmin, (req,res) => { store.deleteSubcategory(integer(req.body.id)); res.redirect('/admin#rules'); });

app.post('/admin/rule/save', requireAdmin, (req,res) => {
  const id=integer(req.body.id), subId=integer(req.body.subcategory_id), title=String(req.body.title||'').trim(), body=String(req.body.body||'').trim();
  const severity=['normal','important','warning','danger'].includes(req.body.severity)?req.body.severity:'normal';
  if(!subId || !title) return res.status(400).send('subcategory/title required');
  store.saveRule(id, { subcategory_id: subId, title, body, severity, badge: String(req.body.badge||'').trim().slice(0,32), sort_order: integer(req.body.sort_order), is_public: bool(req.body.is_public) });
  res.redirect('/admin#rules');
});
app.post('/admin/rule/delete', requireAdmin, (req,res) => { store.deleteRule(integer(req.body.id)); res.redirect('/admin#rules'); });

app.post('/admin/crime/save', requireAdmin, (req, res) => {
  const id = integer(req.body.id);
  const name = String(req.body.name || '').trim();

  if (!name) {
    return res.status(400).send('name required');
  }

  store.saveCrime(id, {
    name,
    classification: String(req.body.classification || '').trim(),
    criminal_players: String(req.body.criminal_players || '').trim(),
    criminal_helis: String(req.body.criminal_helis || '').trim(),
    hostage: String(req.body.hostage || '').trim(),
    police_players: String(req.body.police_players || '').trim(),
    police_helis: String(req.body.police_helis || '').trim(),
    police_riots: String(req.body.police_riots || '').trim(),
    notes: String(req.body.notes || '').trim(),
    sort_order: integer(req.body.sort_order),
    is_public: bool(req.body.is_public)
  });

  res.redirect('/admin#crimes');
});

app.post('/admin/crime/delete', requireAdmin, (req, res) => {
  store.deleteCrime(integer(req.body.id));
  res.redirect('/admin#crimes');
});
app.post('/admin/fine/save', requireAdmin, (req,res) => {
  const id=integer(req.body.id), name=String(req.body.name||'').trim(); if(!name) return res.status(400).send('name required');
  store.saveFine(id, { name, amount: integer(req.body.amount), jail_minutes: integer(req.body.jail_minutes), notes: String(req.body.notes||''), sort_order: integer(req.body.sort_order), is_public: bool(req.body.is_public) });
  res.redirect('/admin#fines');
});
app.post('/admin/fine/delete', requireAdmin, (req,res)=>{ store.deleteFine(integer(req.body.id)); res.redirect('/admin#fines'); });

app.use((req,res)=>res.status(404).send('404'));
app.listen(PORT, () => console.log(`CLOVER CITY Rules: ${BASE_URL}`));
