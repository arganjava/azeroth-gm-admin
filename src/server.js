require('dotenv').config();

const { timingSafeEqual } = require('node:crypto');
const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mysql = require('mysql2/promise');
const { makeRegistrationData } = require('./srp6');
const { executeSoapCommand } = require('./soap');

const app = express();
const port = Number(process.env.PORT || 3000);
function makePool(database) {
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    charset: 'utf8mb4'
  });
}

const pool = makePool(process.env.DB_NAME || 'acore_auth');
const charactersPool = makePool(process.env.DB_CHARACTERS_NAME || 'acore_characters');
const worldPool = makePool(process.env.DB_WORLD_NAME || 'acore_world');

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '32kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }));

function validateAccountInput(body) {
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';

  if (!/^[A-Za-z0-9]{3,32}$/.test(username)) {
    return 'username harus 3-32 karakter alfanumerik';
  }
  if (password.length < 3 || password.length > 32) {
    return 'password harus 3-32 karakter';
  }
  if (email && (email.length > 255 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
    return 'email tidak valid';
  }
  return null;
}

app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/realms', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, address, port, icon, flag, timezone, population, gamebuild FROM realmlist ORDER BY id'
    );
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
});

app.post('/api/accounts', async (req, res, next) => {
  const validationError = validateAccountInput(req.body || {});
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const username = req.body.username.trim().toUpperCase();
  const password = req.body.password.toUpperCase();
  const email = (req.body.email || '').trim().toUpperCase();
  const { salt, verifier } = makeRegistrationData(username, password);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      'INSERT INTO account (username, salt, verifier, expansion, reg_mail, email, joindate) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [username, salt, verifier, 2, email, email]
    );
    await connection.execute(
      'INSERT INTO realmcharacters (realmid, acctid, numchars) SELECT id, ?, 0 FROM realmlist',
      [result.insertId]
    );
    await connection.commit();
    return res.status(201).json({ data: { id: result.insertId, username, email } });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'username sudah digunakan' });
    }
    return next(error);
  } finally {
    connection.release();
  }
});

const cmsLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 });

function matchesAdminToken(suppliedToken) {
  const configuredToken = process.env.CMS_ADMIN_TOKEN || '';
  const suppliedBuffer = Buffer.from(suppliedToken);
  const configuredBuffer = Buffer.from(configuredToken);
  return configuredBuffer.length >= 32 && suppliedBuffer.length === configuredBuffer.length && timingSafeEqual(suppliedBuffer, configuredBuffer);
}

app.post('/api/admin/session', cmsLoginLimiter, (req, res) => {
  const suppliedToken = typeof req.body?.token === 'string' ? req.body.token : '';

  if (!process.env.CMS_ADMIN_TOKEN || process.env.CMS_ADMIN_TOKEN.length < 32) {
    return res.status(503).json({ error: 'CMS_ADMIN_TOKEN harus dikonfigurasi dengan minimal 32 karakter' });
  }
  if (!matchesAdminToken(suppliedToken)) {
    return res.status(401).json({ error: 'token admin tidak valid' });
  }
  return res.json({ data: { authenticated: true } });
});

function requireCmsAdmin(req, res, next) {
  const authorization = req.get('authorization') || '';
  const suppliedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!process.env.CMS_ADMIN_TOKEN || process.env.CMS_ADMIN_TOKEN.length < 32) {
    return res.status(503).json({ error: 'CMS_ADMIN_TOKEN harus dikonfigurasi dengan minimal 32 karakter' });
  }
  if (!matchesAdminToken(suppliedToken)) {
    return res.status(401).json({ error: 'autentikasi admin diperlukan' });
  }
  return next();
}

app.use('/api/admin', requireCmsAdmin);

function parseGuid(value) {
  const guid = Number(value);
  return Number.isSafeInteger(guid) && guid > 0 ? guid : null;
}

async function findCharacter(guid) {
  const [rows] = await charactersPool.execute(
    'SELECT guid, name, race, class, gender, level, xp, money, online, totalKills, chosenTitle, at_login FROM characters WHERE guid = ?',
    [guid]
  );
  return rows[0] || null;
}

function parseSearchQuery(value, maximumLength = 80) {
  const query = typeof value === 'string' ? value.trim() : '';
  return query.length >= 2 && query.length <= maximumLength ? query : null;
}

function parseBanInput(body) {
  const durationHours = Number(body?.durationHours ?? 0);
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 255) : '';
  if (!Number.isInteger(durationHours) || durationHours < 0 || durationHours > 87600 || !reason) return null;
  const bandate = Math.floor(Date.now() / 1000);
  return { bandate, unbandate: durationHours ? bandate + durationHours * 3600 : bandate, reason };
}

async function getAccountCharacters(accountIds) {
  if (!accountIds.length) return [];
  const placeholders = accountIds.map(() => '?').join(',');
  const [rows] = await charactersPool.execute(
    `SELECT guid, account AS accountId, name, race, class, level, money, online FROM characters WHERE account IN (${placeholders}) ORDER BY name`,
    accountIds
  );
  return rows;
}

app.get('/api/admin/accounts', async (req, res, next) => {
  const query = parseSearchQuery(req.query.q, 32);
  if (!query) return res.status(400).json({ error: 'kata pencarian harus 2-32 karakter' });
  try {
    const numericQuery = /^\d+$/.test(query);
    const [accounts] = await pool.execute(
      `SELECT id, username, expansion, joindate, last_login FROM account WHERE username LIKE ?${numericQuery ? ' OR id = ?' : ''} ORDER BY username LIMIT 30`,
      numericQuery ? [`%${query}%`, Number(query)] : [`%${query}%`]
    );
    const characters = await getAccountCharacters(accounts.map((account) => account.id));
    const charactersByAccount = new Map(accounts.map((account) => [Number(account.id), []]));
    for (const character of characters) charactersByAccount.get(Number(character.accountId)).push(character);
    return res.json({ data: accounts.map((account) => ({ ...account, characters: charactersByAccount.get(Number(account.id)), characterCount: charactersByAccount.get(Number(account.id)).length })) });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/accounts/:id', async (req, res, next) => {
  const accountId = parseGuid(req.params.id);
  if (!accountId) return res.status(400).json({ error: 'account id tidak valid' });
  try {
    const [accounts] = await pool.execute(
      'SELECT id, username, expansion, joindate, last_login FROM account WHERE id = ?',
      [accountId]
    );
    if (!accounts.length) return res.status(404).json({ error: 'akun tidak ditemukan' });
    const characters = await getAccountCharacters([accountId]);
    return res.json({ data: { ...accounts[0], characters } });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/guilds', async (req, res, next) => {
  const query = parseSearchQuery(req.query.q, 80);
  if (!query) return res.status(400).json({ error: 'kata pencarian harus 2-80 karakter' });
  try {
    const numericQuery = /^\d+$/.test(query);
    const [rows] = await charactersPool.execute(
      `SELECT g.guildid, g.name, g.leaderguid, COUNT(gm.guid) AS memberCount, COALESCE(SUM(c.money), 0) AS totalMoney
       FROM guild g LEFT JOIN guild_member gm ON gm.guildid = g.guildid
       LEFT JOIN characters c ON c.guid = gm.guid
       WHERE g.name LIKE ?${numericQuery ? ' OR g.guildid = ?' : ''}
       GROUP BY g.guildid, g.name, g.leaderguid ORDER BY g.name LIMIT 30`,
      numericQuery ? [`%${query}%`, Number(query)] : [`%${query}%`]
    );
    return res.json({ data: rows });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/guilds/:id', async (req, res, next) => {
  const guildId = parseGuid(req.params.id);
  if (!guildId) return res.status(400).json({ error: 'guild id tidak valid' });
  try {
    const [guilds] = await charactersPool.execute(
      `SELECT g.guildid, g.name, g.leaderguid, COUNT(gm.guid) AS memberCount, COALESCE(SUM(c.money), 0) AS totalMoney
       FROM guild g LEFT JOIN guild_member gm ON gm.guildid = g.guildid
       LEFT JOIN characters c ON c.guid = gm.guid WHERE g.guildid = ?
       GROUP BY g.guildid, g.name, g.leaderguid`,
      [guildId]
    );
    if (!guilds.length) return res.status(404).json({ error: 'guild tidak ditemukan' });
    const [members] = await charactersPool.execute(
      `SELECT c.guid, c.name, c.race, c.class, c.level, c.money, c.online, gm.rank
       FROM guild_member gm JOIN characters c ON c.guid = gm.guid WHERE gm.guildid = ? ORDER BY c.name`,
      [guildId]
    );
    return res.json({ data: { ...guilds[0], members } });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/characters', async (req, res, next) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (query.length < 2 || query.length > 24) {
    return res.status(400).json({ error: 'kata pencarian harus 2-24 karakter' });
  }

  try {
    const [rows] = await charactersPool.execute(
      'SELECT guid, name, race, class, gender, level, money, online FROM characters WHERE name LIKE ? ORDER BY name LIMIT 30',
      [`%${query}%`]
    );
    return res.json({ data: rows });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/characters/:guid', async (req, res, next) => {
  const guid = parseGuid(req.params.guid);
  if (!guid) return res.status(400).json({ error: 'guid karakter tidak valid' });

  try {
    const character = await findCharacter(guid);
    if (!character) return res.status(404).json({ error: 'karakter tidak ditemukan' });

    const [items] = await charactersPool.execute(
      `SELECT ci.bag, ci.slot, ii.itemEntry AS entry, it.name, it.Quality AS quality, ii.count
       FROM character_inventory ci
       JOIN item_instance ii ON ii.guid = ci.item
      LEFT JOIN acore_world.item_template it ON it.entry = ii.itemEntry
       WHERE ci.guid = ? AND ci.bag = 0 AND ci.slot BETWEEN 0 AND 18
       ORDER BY ci.slot`,
      [guid]
    );
    const [inventory] = await charactersPool.execute(
      `SELECT ci.bag, ci.slot, ii.itemEntry AS entry, it.name, it.Quality AS quality, ii.count
       FROM character_inventory ci JOIN item_instance ii ON ii.guid = ci.item
       LEFT JOIN acore_world.item_template it ON it.entry = ii.itemEntry
       WHERE ci.guid = ? AND NOT (ci.bag = 0 AND ci.slot BETWEEN 0 AND 18)
       ORDER BY ci.bag, ci.slot`,
      [guid]
    );
    const [achievementRows] = await charactersPool.execute(
      'SELECT COUNT(*) AS achievementCount FROM character_achievement WHERE guid = ?',
      [guid]
    );
    return res.json({ data: { ...character, items, inventory, achievementCount: achievementRows[0].achievementCount } });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/items', async (req, res, next) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (query.length < 2 || query.length > 80) {
    return res.status(400).json({ error: 'kata pencarian harus 2-80 karakter' });
  }

  try {
    const numericQuery = /^\d+$/.test(query);
    const [rows] = await worldPool.execute(
      `SELECT entry, name, Quality AS quality, InventoryType AS inventoryType, stackable AS maxStackSize
       FROM item_template
       WHERE name LIKE ?${numericQuery ? ' OR entry = ?' : ''}
       ORDER BY name LIMIT 50`,
      numericQuery ? [`%${query}%`, Number(query)] : [`%${query}%`]
    );
    return res.json({ data: rows });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/characters/:guid/level', async (req, res, next) => {
  const guid = parseGuid(req.params.guid);
  const targetLevel = Number(req.body?.level);
  if (!guid || !Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > 255) {
    return res.status(400).json({ error: 'guid atau level tidak valid (level 1-255)' });
  }

  try {
    const character = await findCharacter(guid);
    if (!character) return res.status(404).json({ error: 'karakter tidak ditemukan' });
    const delta = targetLevel - character.level;
    if (delta === 0) return res.json({ data: { character, message: 'level karakter sudah sesuai' } });

    const result = await executeSoapCommand(`levelup ${character.name} ${delta}`);
    return res.json({ data: { command: `levelup ${character.name} ${delta}`, result } });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/characters/:guid/items', async (req, res, next) => {
  const guid = parseGuid(req.params.guid);
  const itemId = Number(req.body?.itemId);
  const count = Number(req.body?.count);
  if (!guid || !Number.isInteger(itemId) || itemId < 1 || !Number.isInteger(count) || count < 1 || count > 1000) {
    return res.status(400).json({ error: 'itemId atau jumlah tidak valid (jumlah 1-1000)' });
  }

  try {
    const character = await findCharacter(guid);
    if (!character) return res.status(404).json({ error: 'karakter tidak ditemukan' });
    const [items] = await worldPool.execute(
      'SELECT entry, name FROM item_template WHERE entry = ?',
      [itemId]
    );
    if (!items.length) return res.status(404).json({ error: 'item tidak ditemukan' });

    const result = await executeSoapCommand(`additem ${character.name} ${itemId} ${count}`);
    return res.json({ data: { item: items[0], character: character.name, count, result } });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/characters/:guid/items/remove', async (req, res, next) => {
  const guid = parseGuid(req.params.guid);
  const itemId = Number(req.body?.itemId);
  const count = Number(req.body?.count);
  if (!guid || !Number.isInteger(itemId) || itemId < 1 || !Number.isInteger(count) || count < 1 || count > 1000) {
    return res.status(400).json({ error: 'itemId atau jumlah tidak valid (jumlah 1-1000)' });
  }

  const connection = await charactersPool.getConnection();
  try {
    await connection.beginTransaction();
    const [characters] = await connection.execute('SELECT name, online FROM characters WHERE guid = ? FOR UPDATE', [guid]);
    if (!characters.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'karakter tidak ditemukan' });
    }
    if (characters[0].online) {
      await connection.rollback();
      return res.status(409).json({ error: 'inventory hanya bisa dikurangi saat karakter offline' });
    }
    const [stacks] = await connection.execute(
      `SELECT ci.item, ii.count FROM character_inventory ci JOIN item_instance ii ON ii.guid = ci.item
       WHERE ci.guid = ? AND ii.itemEntry = ? AND NOT (ci.bag = 0 AND ci.slot BETWEEN 0 AND 18)
       AND NOT EXISTS (SELECT 1 FROM character_inventory contents WHERE contents.bag = ii.guid)
       ORDER BY ci.bag, ci.slot FOR UPDATE`,
      [guid, itemId]
    );
    const available = stacks.reduce((total, stack) => total + Number(stack.count), 0);
    if (available < count) {
      await connection.rollback();
      return res.status(409).json({ error: `jumlah item di inventory tidak cukup (tersedia ${available})` });
    }
    let remaining = count;
    for (const stack of stacks) {
      if (!remaining) break;
      const removed = Math.min(remaining, Number(stack.count));
      if (removed === Number(stack.count)) {
        await connection.execute('DELETE FROM character_inventory WHERE guid = ? AND item = ?', [guid, stack.item]);
        await connection.execute('DELETE FROM item_instance WHERE guid = ?', [stack.item]);
      } else {
        await connection.execute('UPDATE item_instance SET count = count - ? WHERE guid = ?', [removed, stack.item]);
      }
      remaining -= removed;
    }
    await connection.commit();
    return res.json({ data: { character: characters[0].name, itemId, removed: count } });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

app.post('/api/admin/characters/:guid/money', async (req, res, next) => {
  const guid = parseGuid(req.params.guid);
  const amount = Number(req.body?.amountCopper);
  if (!guid || !Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 4294967295) {
    return res.status(400).json({ error: 'perubahan uang tidak valid (gunakan copper, maksimal 4294967295)' });
  }

  try {
    const character = await findCharacter(guid);
    if (!character) return res.status(404).json({ error: 'karakter tidak ditemukan' });
    if (character.online) {
      if (amount < 0) {
        return res.status(409).json({ error: 'uang hanya bisa ditambahkan saat karakter online; pengurangan saldo perlu karakter offline' });
      }
      const result = await executeSoapCommand(`send money ${character.name} "Azeroth Admin" "Money transfer via CMS" ${amount}`);
      await charactersPool.execute(
        'INSERT INTO cms_money_logs (character_guid, amount_copper, previous_money, new_money, delivery) VALUES (?, ?, NULL, NULL, ?)',
        [guid, amount, 'mail']
      );
      return res.json({ data: { character: character.name, amountCopper: amount, delivery: 'mail', result } });
    }
  } catch (error) {
    return next(error);
  }

  const connection = await charactersPool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT guid, name, money, online FROM characters WHERE guid = ? FOR UPDATE',
      [guid]
    );
    const character = rows[0];
    if (!character) {
      await connection.rollback();
      return res.status(404).json({ error: 'karakter tidak ditemukan' });
    }
    if (character.online) {
      await connection.rollback();
      return res.status(409).json({ error: 'karakter sedang online; perubahan uang hanya diizinkan saat offline' });
    }

    const updatedMoney = Number(character.money) + amount;
    if (updatedMoney < 0 || updatedMoney > 4294967295) {
      await connection.rollback();
      return res.status(400).json({ error: 'saldo akhir harus berada dalam rentang 0-4294967295 copper' });
    }
    await connection.execute('UPDATE characters SET money = ? WHERE guid = ?', [updatedMoney, guid]);
    await connection.execute(
      'INSERT INTO cms_money_logs (character_guid, amount_copper, previous_money, new_money, delivery) VALUES (?, ?, ?, ?, ?)',
      [guid, amount, Number(character.money), updatedMoney, 'database']
    );
    await connection.commit();
    return res.json({ data: { character: character.name, previousMoney: Number(character.money), money: updatedMoney } });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/admin/characters/:guid/money-logs', async (req, res, next) => {
  const guid = parseGuid(req.params.guid);
  if (!guid) return res.status(400).json({ error: 'guid karakter tidak valid' });
  try {
    const [rows] = await charactersPool.execute(
      'SELECT log_id AS id, amount_copper AS amountCopper, previous_money AS previousMoney, new_money AS newMoney, delivery, created_at AS createdAt FROM cms_money_logs WHERE character_guid = ? ORDER BY log_id DESC LIMIT 100',
      [guid]
    );
    return res.json({ data: rows });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/characters/:guid/logout', async (req, res, next) => {
  const guid = parseGuid(req.params.guid);
  if (!guid) return res.status(400).json({ error: 'guid karakter tidak valid' });
  try {
    const character = await findCharacter(guid);
    if (!character) return res.status(404).json({ error: 'karakter tidak ditemukan' });
    if (!character.online) return res.status(409).json({ error: 'karakter sedang offline' });
    const result = await executeSoapCommand(`kick ${character.name}`);
    return res.json({ data: { character: character.name, result } });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/characters/:guid/ban', async (req, res, next) => {
  const guid = parseGuid(req.params.guid);
  const ban = parseBanInput(req.body);
  if (!guid || !ban) return res.status(400).json({ error: 'guid, durasi, atau alasan ban tidak valid' });
  try {
    const character = await findCharacter(guid);
    if (!character) return res.status(404).json({ error: 'karakter tidak ditemukan' });
    await charactersPool.execute(
      'INSERT INTO character_banned (guid, bandate, unbandate, bannedby, banreason, active) VALUES (?, ?, ?, ?, ?, 1)',
      [guid, ban.bandate, ban.unbandate, 'Azeroth Admin', ban.reason]
    );
    return res.json({ data: { character: character.name, permanent: ban.bandate === ban.unbandate } });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/characters/:guid/rename-flag', async (req, res, next) => {
  const guid = parseGuid(req.params.guid);
  if (!guid) return res.status(400).json({ error: 'guid karakter tidak valid' });
  try {
    const character = await findCharacter(guid);
    if (!character) return res.status(404).json({ error: 'karakter tidak ditemukan' });
    await charactersPool.execute('UPDATE characters SET at_login = at_login | 1 WHERE guid = ?', [guid]);
    return res.json({ data: { guid, renameRequired: true } });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/characters/:guid/title', async (req, res, next) => {
  const guid = parseGuid(req.params.guid);
  const titleId = Number(req.body?.titleId);
  if (!guid || !Number.isInteger(titleId) || titleId < 0 || titleId > 65535) {
    return res.status(400).json({ error: 'guid atau title id tidak valid' });
  }
  try {
    const character = await findCharacter(guid);
    if (!character) return res.status(404).json({ error: 'karakter tidak ditemukan' });
    await charactersPool.execute('UPDATE characters SET chosenTitle = ? WHERE guid = ?', [titleId, guid]);
    return res.json({ data: { guid, titleId } });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/accounts/:id/logout', async (req, res, next) => {
  const accountId = parseGuid(req.params.id);
  if (!accountId) return res.status(400).json({ error: 'account id tidak valid' });
  try {
    const characters = await getAccountCharacters([accountId]);
    const onlineCharacters = characters.filter((character) => character.online);
    const results = await Promise.all(onlineCharacters.map((character) => executeSoapCommand(`kick ${character.name}`)));
    return res.json({ data: { kicked: onlineCharacters.length, results } });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/accounts/:id/ban', async (req, res, next) => {
  const accountId = parseGuid(req.params.id);
  const ban = parseBanInput(req.body);
  if (!accountId || !ban) return res.status(400).json({ error: 'account id, durasi, atau alasan ban tidak valid' });
  try {
    const [accounts] = await pool.execute('SELECT id FROM account WHERE id = ?', [accountId]);
    if (!accounts.length) return res.status(404).json({ error: 'akun tidak ditemukan' });
    await pool.execute(
      'INSERT INTO account_banned (id, bandate, unbandate, bannedby, banreason, active) VALUES (?, ?, ?, ?, ?, 1)',
      [accountId, ban.bandate, ban.unbandate, 'Azeroth Admin', ban.reason]
    );
    return res.json({ data: { accountId, permanent: ban.bandate === ban.unbandate } });
  } catch (error) {
    return next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  res.status(statusCode).json({ error: statusCode === 500 ? 'internal server error' : error.message });
});

async function start() {
  await charactersPool.query(`CREATE TABLE IF NOT EXISTS cms_money_logs (
    log_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    character_guid INT UNSIGNED NOT NULL,
    amount_copper BIGINT NOT NULL,
    previous_money BIGINT UNSIGNED NULL,
    new_money BIGINT UNSIGNED NULL,
    delivery VARCHAR(16) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cms_money_logs_character (character_guid, log_id)
  ) ENGINE=InnoDB`);
  await Promise.all([pool.query('SELECT 1'), charactersPool.query('SELECT 1'), worldPool.query('SELECT 1')]);
  app.listen(port, () => console.log(`AzerothCore REST API listening on port ${port}`));
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Unable to start API:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, pool, charactersPool, worldPool };
