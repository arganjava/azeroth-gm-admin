import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const SLOT_NAMES = {
  0: 'HEAD', 1: 'NECK', 2: 'SHOULDERS', 3: 'SHIRT', 4: 'CHEST', 5: 'WAIST',
  6: 'LEGS', 7: 'FEET', 8: 'WRISTS', 9: 'HANDS', 10: 'FINGER1', 11: 'FINGER2',
  12: 'TRINKET1', 13: 'TRINKET2', 14: 'BACK', 15: 'MAINHAND', 16: 'OFFHAND',
  17: 'RANGED/RELIC', 18: 'TABARD'
};

const RACES = { 1: 'Human', 2: 'Orc', 3: 'Dwarf', 4: 'Night Elf', 5: 'Undead', 6: 'Tauren', 7: 'Gnome', 8: 'Troll', 10: 'Blood Elf', 11: 'Draenei' };
const CLASSES = { 1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue', 5: 'Priest', 6: 'Death Knight', 7: 'Shaman', 8: 'Mage', 9: 'Warlock', 11: 'Druid' };
const QUALITY = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'artifact', 'heirloom'];
const QUALITY_NAMES = ['Poor', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Artifact', 'Heirloom'];
const CLASS_ATTRIBUTE_GUIDE = {
  1: 'Strength · Stamina · Agility · melee ratings', 2: 'Strength · Intellect · Stamina · spell/melee power',
  3: 'Agility · Stamina · attack power · ranged ratings', 4: 'Agility · Stamina · attack power · melee ratings',
  5: 'Intellect · Spirit · Stamina · spell power', 6: 'Strength · Stamina · attack power · melee ratings',
  7: 'Intellect · Agility · Stamina · spell/melee power', 8: 'Intellect · Spirit · Stamina · spell power',
  9: 'Intellect · Spirit · Stamina · spell power', 11: 'Agility · Intellect · Stamina · spell/melee power'
};
const TELEPORT_MAPS = [{ id: 0, name: 'Eastern Kingdoms' }, { id: 1, name: 'Kalimdor' }, { id: 530, name: 'Outland' }, { id: 571, name: 'Northrend' }];
const TELEPORT_LOCATIONS = [
  { id: 'stormwind', name: 'Stormwind City', mapId: 0, x: -8833.38, y: 628.62, z: 94 },
  { id: 'ironforge', name: 'Ironforge', mapId: 0, x: -4981.25, y: -881.54, z: 501.66 },
  { id: 'orgrimmar', name: 'Orgrimmar', mapId: 1, x: 1633.33, y: -4440.68, z: 15.8 },
  { id: 'darnassus', name: 'Darnassus', mapId: 1, x: 9945, y: 2493, z: 1315.8 },
  { id: 'shattrath', name: 'Shattrath City', mapId: 530, x: -1838.16, y: 5301.79, z: -12.42 },
  { id: 'dalaran', name: 'Dalaran', mapId: 571, x: 5804.15, y: 624.77, z: 647.77 }
];

function qualityKey(quality) {
  return QUALITY[Number(quality)] || 'common';
}

function formatItemStats(stats = []) {
  return stats.map((stat) => `${stat.name} ${stat.value > 0 ? '+' : ''}${stat.value}`).join(' · ');
}

async function request(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Permintaan gagal');
  return body.data;
}

function formatMoney(copper) {
  const value = Number(copper) || 0;
  const gold = Math.floor(value / 10000);
  const silver = Math.floor((value % 10000) / 100);
  const coins = value % 100;
  return `${gold.toLocaleString('id-ID')}g ${silver}s ${coins}c`;
}

function CharacterTable({ characters, onSelect }) {
  if (!characters.length) return <p className="operation-note">Tidak ada karakter terdaftar.</p>;
  return <div className="roster-table-wrap"><table className="roster-table"><thead><tr><th>CHARACTER</th><th>CLASS</th><th>LEVEL</th><th>WALLET</th><th>STATUS</th><th /></tr></thead><tbody>{characters.map((character) => <tr key={character.guid}>
    <td><strong>{character.name}</strong><small>GUID {character.guid}</small></td><td>{CLASSES[character.class] || `Class ${character.class}`}</td><td>{character.level}</td><td>{formatMoney(character.money)}</td><td><span className={`online-indicator ${character.online ? 'online' : ''}`} /> {character.online ? 'Online' : 'Offline'}</td><td><button className="text-button" type="button" onClick={() => onSelect(character.guid)}>Detail ↗</button></td>
  </tr>)}</tbody></table></div>;
}

function BanControls({ reason, setReason, duration, setDuration, compact = false }) {
  return <div className={`ban-controls ${compact ? 'compact' : ''}`}>
    {!compact && <span className="field-label">PENGATURAN BAN</span>}
    <label><span>ALASAN</span><input maxLength="255" value={reason} onChange={(event) => setReason(event.target.value)} required /></label>
    <label><span>DURASI (JAM, 0 = PERMANEN)</span><input type="number" min="0" max="87600" value={duration} onChange={(event) => setDuration(event.target.value)} required /></label>
  </div>;
}

function EquipmentSlot({ slot, label, item, character, token, busy, onSave, onError }) {
  const [query, setQuery] = useState('');
  const [choices, setChoices] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadChoices(searchTerm = '') {
    setLoading(true);
    try {
      const params = new URLSearchParams({ slot });
      if (searchTerm) params.set('q', searchTerm);
      setChoices(await request(`/api/admin/characters/${character.guid}/equipment-items?${params}`, token));
      if (!searchTerm) setLoaded(true);
    } catch (requestError) {
      onError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const searchTerm = query.trim();
    if (searchTerm.length < 2) {
      if (searchTerm) setChoices([]);
      return undefined;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ slot, q: searchTerm });
        setChoices(await request(`/api/admin/characters/${character.guid}/equipment-items?${params}`, token, { signal: controller.signal }));
      } catch (requestError) {
        if (requestError.name !== 'AbortError') onError(requestError.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, slot, character.guid, token, onError]);

  return <div className={`equipment-slot ${item ? `quality-${QUALITY[item.quality] || 'common'}` : ''}`}>
    <span className="slot-number">{slot.padStart(2, '0')}</span><span className="slot-name">{label}</span>
    <strong title={item?.name || 'Slot kosong'}>{item?.name || '—'}</strong>
    {item && <div className="equipment-item-meta"><span className={`equipment-tier quality-${qualityKey(item.quality)}`}><i />{QUALITY_NAMES[Number(item.quality)] || 'Common'}</span><small>ITEM {item.entry} · ×{item.count}</small></div>}
    {item?.stats?.length > 0 && <small className="equipment-stats">{formatItemStats(item.stats)}</small>}
    <div className="equipment-editor">
      <input aria-label={`Cari item untuk ${label}`} placeholder="Cari item atau ID..." value={query} disabled={busy} onChange={(event) => setQuery(event.target.value)} />
      <select aria-label={`Pilih equipment ${label}`} value={item?.entry || ''} disabled={busy} onFocus={() => { if (!loaded && !query) loadChoices(); }} onChange={(event) => onSave(Number(slot), Number(event.target.value))}>
        <option value="" disabled>{loading ? 'Memuat item...' : 'Pilih item...'}</option>
        <option value="0">Kosongkan slot</option>
        {item && <option value={item.entry}>{item.name} · sedang dipakai</option>}
        {choices.filter((choice) => Number(choice.entry) !== Number(item?.entry)).map((choice) => <option key={choice.entry} value={choice.entry}>{QUALITY_NAMES[Number(choice.quality)] || 'Common'} · {choice.name} · lvl {choice.requiredLevel}{choice.stats.length ? ` · ${formatItemStats(choice.stats)}` : ''} · #${choice.entry}</option>)}
      </select>
    </div>
  </div>;
}

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('acore-cms-token') || '');
  const [loginToken, setLoginToken] = useState('');
  const [loginError, setLoginError] = useState('');
  const [directoryMode, setDirectoryMode] = useState('characters');
  const [search, setSearch] = useState('');
  const [characters, setCharacters] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [guilds, setGuilds] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedGuild, setSelectedGuild] = useState(null);
  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [moneyLogs, setMoneyLogs] = useState([]);
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState([]);
  const [chosenItem, setChosenItem] = useState(null);
  const [itemCount, setItemCount] = useState(1);
  const [targetLevel, setTargetLevel] = useState('');
  const [targetTitle, setTargetTitle] = useState('');
  const [banReason, setBanReason] = useState('Administrative action');
  const [banDuration, setBanDuration] = useState('0');
  const [professions, setProfessions] = useState([]);
  const [professionSkillId, setProfessionSkillId] = useState('');
  const [professionValue, setProfessionValue] = useState('');
  const [reputations, setReputations] = useState([]);
  const [reputationFactionId, setReputationFactionId] = useState('');
  const [reputationStanding, setReputationStanding] = useState('');
  const [teleportMapId, setTeleportMapId] = useState('0');
  const [teleportLocation, setTeleportLocation] = useState('stormwind');
  const [teleportCoordinates, setTeleportCoordinates] = useState({ x: '-8833.38', y: '628.62', z: '94', orientation: '0' });
  const [moneyDirection, setMoneyDirection] = useState('add');
  const [gold, setGold] = useState('');
  const [silver, setSilver] = useState('');
  const [copper, setCopper] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (search.trim().length < 2 || !token) {
      setCharacters([]);
      setAccounts([]);
      setGuilds([]);
      return undefined;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const result = await request(`/api/admin/${directoryMode}?q=${encodeURIComponent(search.trim())}`, token, { signal: controller.signal });
        if (directoryMode === 'characters') setCharacters(result);
        if (directoryMode === 'accounts') setAccounts(result);
        if (directoryMode === 'guilds') setGuilds(result);
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      }
    }, 220);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [search, token, directoryMode]);

  useEffect(() => {
    if (itemSearch.trim().length < 2 || !token) {
      setItemResults([]);
      return undefined;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setItemResults(await request(`/api/admin/items?q=${encodeURIComponent(itemSearch.trim())}`, token, { signal: controller.signal }));
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      }
    }, 220);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [itemSearch, token]);

  async function loadCharacter(guid) {
    const character = await request(`/api/admin/characters/${guid}`, token);
    const [logs, characterProfessions, characterReputations] = await Promise.all([
      request(`/api/admin/characters/${guid}/money-logs`, token),
      request(`/api/admin/characters/${guid}/professions`, token),
      request(`/api/admin/characters/${guid}/reputations`, token)
    ]);
    setSelected(character);
    setItems(character.items || []);
    setInventory(character.inventory || []);
    setTargetLevel(String(character.level));
    setTargetTitle(String(character.chosenTitle || 0));
    setMoneyLogs(logs);
    setProfessions(characterProfessions);
    setProfessionSkillId(characterProfessions[0] ? String(characterProfessions[0].skill) : '');
    setProfessionValue(characterProfessions[0] ? String(characterProfessions[0].value) : '');
    setReputations(characterReputations);
    setReputationFactionId(characterReputations[0] ? String(characterReputations[0].factionId) : '');
    setReputationStanding(characterReputations[0] ? String(characterReputations[0].standing) : '');
  }

  async function loadAccount(id) {
    setSelectedAccount(await request(`/api/admin/accounts/${id}`, token));
    setSelectedGuild(null);
    setSelected(null);
  }

  async function loadGuild(id) {
    setSelectedGuild(await request(`/api/admin/guilds/${id}`, token));
    setSelectedAccount(null);
    setSelected(null);
  }

  function changeDirectory(mode) {
    setDirectoryMode(mode);
    setSearch('');
    setCharacters([]);
    setAccounts([]);
    setGuilds([]);
    setSelected(null);
    setSelectedAccount(null);
    setSelectedGuild(null);
    setError('');
  }

  async function login(event) {
    event.preventDefault();
    setLoginError('');
    try {
      await request('/api/admin/session', '', { method: 'POST', body: JSON.stringify({ token: loginToken }) });
      sessionStorage.setItem('acore-cms-token', loginToken);
      setToken(loginToken);
    } catch (requestError) {
      setLoginError(requestError.message);
    }
  }

  async function perform(action, successMessage) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(successMessage);
      if (selected) await loadCharacter(selected.guid);
      else if (selectedAccount) await loadAccount(selectedAccount.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function saveEquipment(slot, itemId) {
    const slotName = SLOT_NAMES[slot];
    const confirmOnlineLogout = Number(selected.online) !== 0;
    if (confirmOnlineLogout && !window.confirm(`${selected.name} sedang online. Simpan equipment akan force logout karakter; lanjutkan?`)) return;
    perform(
      () => request(`/api/admin/characters/${selected.guid}/equipment`, token, { method: 'POST', body: JSON.stringify({ slot, itemId, confirmOnlineLogout }) }),
      itemId ? `${slotName} berhasil diperbarui.` : `${slotName} berhasil dikosongkan.`
    );
  }

  function chooseTeleportMap(mapId) {
    setTeleportMapId(String(mapId));
    const location = TELEPORT_LOCATIONS.find((entry) => entry.mapId === Number(mapId));
    if (!location) {
      setTeleportLocation('custom');
      return;
    }
    setTeleportLocation(location.id);
    setTeleportCoordinates({ x: String(location.x), y: String(location.y), z: String(location.z), orientation: '0' });
  }

  function chooseTeleportLocation(locationId) {
    setTeleportLocation(locationId);
    const location = TELEPORT_LOCATIONS.find((entry) => entry.id === locationId);
    if (location) setTeleportCoordinates({ x: String(location.x), y: String(location.y), z: String(location.z), orientation: '0' });
  }

  function logout() {
    sessionStorage.removeItem('acore-cms-token');
    setToken('');
    setSelected(null);
    setCharacters([]);
    setAccounts([]);
    setGuilds([]);
  }

  if (!token) {
    return <main className="login-page">
      <div className="login-art" aria-hidden="true"><span className="rune rune-one">A</span><span className="rune rune-two">✳</span><span className="login-stamp">REALM<br />OPERATIONS</span></div>
      <form className="login-form" onSubmit={login}>
        <span className="eyebrow">AZEROTHCORE / CONTROL DESK</span>
        <h1>Masuk ke<br /><em>realm console.</em></h1>
        <label htmlFor="admin-token">Admin access token</label>
        <input id="admin-token" type="password" autoComplete="current-password" value={loginToken} onChange={(event) => setLoginToken(event.target.value)} required />
        {loginError && <p className="form-error">{loginError}</p>}
        <button className="primary-button login-button" type="submit">Buka control desk <span>↗</span></button>
        <p className="login-foot">Token diverifikasi oleh REST API; kredensial SOAP tidak pernah dikirim ke browser.</p>
      </form>
    </main>;
  }

  const equipped = new Map(items.map((item) => [Number(item.slot), item]));

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top"><span className="brand-mark">A</span><span>AZEROTH<span className="brand-light"> / ADMIN</span></span></a>
      <div className="topbar-meta"><span className="connection-dot" /> REALM DATABASE <span className="topbar-divider">/</span> CHARACTER OPERATIONS</div>
      <button className="logout-button" type="button" onClick={logout} title="Keluar">Keluar <span>↗</span></button>
    </header>

    <main className="workspace" id="top">
      <aside className="search-rail">
        <div className="rail-heading"><span className="eyebrow">DIRECTORY</span><span className="result-count">{(directoryMode === 'characters' ? characters.length : directoryMode === 'accounts' ? accounts.length : guilds.length).toString().padStart(2, '0')}</span></div>
        <nav className="directory-tabs" aria-label="Menu utama">
          <button className={directoryMode === 'accounts' ? 'active' : ''} type="button" onClick={() => changeDirectory('accounts')}>Akun</button>
          <button className={directoryMode === 'guilds' ? 'active' : ''} type="button" onClick={() => changeDirectory('guilds')}>Guild</button>
          <button className={directoryMode === 'characters' ? 'active' : ''} type="button" onClick={() => changeDirectory('characters')}>Karakter</button>
        </nav>
        <h2>{directoryMode === 'characters' ? 'Karakter' : directoryMode === 'accounts' ? 'Akun' : 'Guild'}</h2>
        <label className="search-box"><span>⌕</span><input aria-label={`Cari ${directoryMode}`} placeholder={directoryMode === 'characters' ? 'Cari nama karakter...' : directoryMode === 'accounts' ? 'Cari username / ID...' : 'Cari nama / ID guild...'} value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>↵</kbd></label>
        <p className="search-hint">Ketik minimal 2 karakter</p>
        <div className="character-list">
          {directoryMode === 'characters' && characters.map((character) => <button className={`character-row ${selected?.guid === character.guid ? 'active' : ''}`} key={character.guid} type="button" onClick={() => loadCharacter(character.guid).catch((reason) => setError(reason.message))}>
            <span className="character-avatar">{character.name.slice(0, 1).toUpperCase()}</span><span className="character-copy"><strong>{character.name}</strong><small>{CLASSES[character.class] || `Class ${character.class}`} · Level {character.level}</small></span><span className={`online-indicator ${character.online ? 'online' : ''}`} title={character.online ? 'Online' : 'Offline'} />
          </button>)}
          {directoryMode === 'accounts' && accounts.map((account) => <button className={`character-row ${selectedAccount?.id === account.id ? 'active' : ''}`} key={account.id} type="button" onClick={() => loadAccount(account.id).catch((reason) => setError(reason.message))}>
            <span className="character-avatar">{account.username.slice(0, 1)}</span><span className="character-copy"><strong>{account.username}</strong><small>ID {account.id} · {account.characterCount} karakter</small></span>
          </button>)}
          {directoryMode === 'guilds' && guilds.map((guild) => <button className={`character-row ${selectedGuild?.guildid === guild.guildid ? 'active' : ''}`} key={guild.guildid} type="button" onClick={() => loadGuild(guild.guildid).catch((reason) => setError(reason.message))}>
            <span className="character-avatar">{guild.name.slice(0, 1)}</span><span className="character-copy"><strong>{guild.name}</strong><small>{guild.memberCount} anggota · {formatMoney(guild.totalMoney)}</small></span>
          </button>)}
          {search.length >= 2 && (directoryMode === 'characters' ? characters : directoryMode === 'accounts' ? accounts : guilds).length === 0 && <div className="empty-search">Tidak ada hasil ditemukan.</div>}
        </div>
        <div className="rail-footer"><span>{directoryMode.toUpperCase()} DATABASE</span><span>01 / LIVE</span></div>
      </aside>

      <section className="main-panel">
        {!selected && selectedAccount ? <div className="directory-detail">
          <div className="breadcrumb">DIRECTORY <span>/</span> ACCOUNT PROFILE <span>/</span> {selectedAccount.id}</div>
          <div className="detail-heading"><div><span className="eyebrow">ACCOUNT</span><h1>{selectedAccount.username}</h1><p>Account ID {selectedAccount.id} · GM level {selectedAccount.gmlevel}</p></div><div className="detail-actions"><button className="secondary-button" type="button" disabled={busy || !selectedAccount.characters.some((character) => character.online)} onClick={() => perform(() => request(`/api/admin/accounts/${selectedAccount.id}/logout`, token, { method: 'POST' }), 'Sesi online akun dihentikan.')}>Force logout</button><button className="danger-button" type="button" disabled={busy} onClick={() => { if (!banReason.trim()) return setError('Masukkan alasan ban.'); if (window.confirm(`Ban akun ${selectedAccount.username}?`)) perform(() => request(`/api/admin/accounts/${selectedAccount.id}/ban`, token, { method: 'POST', body: JSON.stringify({ durationHours: Number(banDuration), reason: banReason }) }), 'Akun berhasil di-ban.'); }}>Ban akun</button></div></div>
          <div className="detail-stats"><div><span>CHARACTERS</span><strong>{selectedAccount.characters.length}</strong></div><div><span>EXPANSION</span><strong>{selectedAccount.expansion}</strong></div><div><span>LAST LOGIN</span><strong>{selectedAccount.last_login ? new Date(selectedAccount.last_login).toLocaleString('id-ID') : '—'}</strong></div></div>
          <section className="member-section"><div className="section-heading"><div><span className="eyebrow">ACCOUNT ROSTER</span><h2>Semua karakter</h2></div><span className="section-index">{selectedAccount.characters.length.toString().padStart(2, '0')}</span></div><CharacterTable characters={selectedAccount.characters} onSelect={(guid) => loadCharacter(guid).catch((reason) => setError(reason.message))} /></section>
          <BanControls reason={banReason} setReason={setBanReason} duration={banDuration} setDuration={setBanDuration} />
        </div> : !selected && selectedGuild ? <div className="directory-detail">
          <div className="breadcrumb">DIRECTORY <span>/</span> GUILD PROFILE <span>/</span> {selectedGuild.guildid}</div>
          <div className="detail-heading"><div><span className="eyebrow">GUILD</span><h1>{selectedGuild.name}</h1><p>Guild ID {selectedGuild.guildid} · Leader GUID {selectedGuild.leaderguid}</p></div></div>
          <div className="detail-stats"><div><span>MEMBERS</span><strong>{selectedGuild.memberCount}</strong></div><div><span>TOTAL MEMBER GOLD</span><strong>{formatMoney(selectedGuild.totalMoney)}</strong></div></div>
          <section className="member-section"><div className="section-heading"><div><span className="eyebrow">GUILD ROSTER</span><h2>Anggota</h2></div><span className="section-index">{selectedGuild.members.length.toString().padStart(2, '0')}</span></div><CharacterTable characters={selectedGuild.members} onSelect={(guid) => loadCharacter(guid).catch((reason) => setError(reason.message))} /></section>
        </div> : !selected ? <div className="welcome-state"><div className="welcome-kicker"><span className="connection-dot" /> ADMINISTRATION / {directoryMode.toUpperCase()}</div><h1>{directoryMode === 'accounts' ? <>Akun dan roster<br /><em>siap dikelola.</em></> : directoryMode === 'guilds' ? <>Guild dan anggota<br /><em>terhubung.</em></> : <>Semua urusan<br /><em>karakter, satu tempat.</em></>}</h1><p>{directoryMode === 'accounts' ? 'Cari akun untuk melihat seluruh karakter dan mengelola aksesnya.' : directoryMode === 'guilds' ? 'Cari guild untuk meninjau jumlah anggota, total gold, dan detail tiap karakter.' : 'Pilih karakter dari directory untuk melihat equipment dan mengelola progres realm.'}</p><div className="welcome-rule"><span>AC</span><i /></div></div> : <>
          <div className="character-header">
            <div><div className="breadcrumb"><button type="button" className="breadcrumb-back" onClick={() => setSelected(null)}>‹ DIRECTORY</button><span>/</span> CHARACTER PROFILE <span>/</span> {selected.guid}</div><div className="character-title"><span className="profile-avatar">{selected.name.slice(0, 1).toUpperCase()}</span><div><h1>{selected.name}</h1><p>{RACES[selected.race] || `Race ${selected.race}`} {CLASSES[selected.class] || `Class ${selected.class}`}</p></div></div></div>
            <span className={`status-pill ${selected.online ? 'is-online' : ''}`}><i />{selected.online ? 'ONLINE' : 'OFFLINE'}</span>
          </div>

          <div className="stat-strip">
            <div className="stat-cell"><span>LEVEL</span><strong>{selected.level}<small> / 80</small></strong></div>
            <div className="stat-cell"><span>WALLET</span><strong className="wallet-number">{formatMoney(selected.money)}</strong></div>
            <div className="stat-cell"><span>GUID</span><strong>#{selected.guid}</strong></div>
            <div className="stat-cell"><span>EQUIPPED</span><strong>{items.length}<small> / 19 slots</small></strong></div>
          </div>

          <div className="content-grid">
            <section className="equipment-section">
              <div className="section-heading"><div><span className="eyebrow">CHARACTER LOADOUT</span><h2>Equipment</h2></div><span className="section-index">01 — 19</span></div>
              <p className="equipment-class-guide"><span>STAT PRIORITAS {CLASSES[selected.class]?.toUpperCase() || 'CLASS'}</span>{CLASS_ATTRIBUTE_GUIDE[selected.class] || 'Mengikuti atribut yang tersedia pada item.'}</p>
              <div className="equipment-tier-legend" aria-label="Tier equipment"><span><i className="quality-common" />Common</span><span><i className="quality-uncommon" />Uncommon</span><span><i className="quality-rare" />Rare</span><span><i className="quality-epic" />Epic</span><span><i className="quality-legendary" />Legendary</span></div>
              {selected.online && <p className="operation-note equipment-note">Menyimpan equipment akan force logout karakter.</p>}
              <div className="equipment-grid">
                {Object.entries(SLOT_NAMES).map(([slot, label]) => {
                  const item = equipped.get(Number(slot));
                  return <EquipmentSlot key={slot} slot={slot} label={label} item={item} character={selected} token={token} busy={busy} onSave={saveEquipment} onError={setError} />;
                })}
              </div>
              <section className="inventory-section"><div className="section-heading"><div><span className="eyebrow">INVENTORY</span><h2>Isi tas</h2></div><span className="section-index">{inventory.length.toString().padStart(2, '0')} ITEM</span></div>{inventory.length ? <div className="inventory-list">{inventory.map((item) => <div className="inventory-row" key={`${item.bag}-${item.slot}-${item.entry}`}><span className={`item-quality-dot quality-${QUALITY[item.quality] || 'common'}`} /><span><strong>{item.name || `Item ${item.entry}`}</strong><small>BAG {item.bag} · SLOT {item.slot} · #{item.entry}</small></span><b>×{item.count}</b></div>)}</div> : <p className="operation-note">Tidak ada item di tas.</p>}</section>
            </section>

            <aside className="operations-column">
              <section className="operation-block level-block">
                <div className="operation-heading"><span className="operation-icon">↑</span><div><span className="eyebrow">PROGRESSION</span><h3>Atur level</h3></div></div>
                <p>Set level karakter melalui GM command. Perubahan dihitung dari level saat ini.</p>
                <div className="progression-metrics"><span>XP <strong>{Number(selected.xp || 0).toLocaleString('id-ID')}</strong></span><span>ACHIEVEMENTS <strong>{selected.achievementCount || 0}</strong></span><span>TOTAL KILLS <strong>{Number(selected.totalKills || 0).toLocaleString('id-ID')}</strong></span></div>
                <form onSubmit={(event) => { event.preventDefault(); perform(() => request(`/api/admin/characters/${selected.guid}/level`, token, { method: 'POST', body: JSON.stringify({ level: Number(targetLevel) }) }), 'Level karakter berhasil diperbarui.'); }}>
                  <label className="field-label" htmlFor="target-level">LEVEL BARU</label>
                  <div className="inline-control"><input id="target-level" type="number" min="1" max="255" value={targetLevel} onChange={(event) => setTargetLevel(event.target.value)} required /><button className="primary-button" type="submit" disabled={busy || Number(targetLevel) === Number(selected.level)}>Terapkan <span>↗</span></button></div>
                </form>
              </section>

              <section className="operation-block">
                <div className="operation-heading"><span className="operation-icon">⌁</span><div><span className="eyebrow">PROFESSIONS</span><h3>Atur profesi</h3></div></div>
                {professions.length ? <form onSubmit={(event) => {
                  event.preventDefault();
                  const profession = professions.find((entry) => Number(entry.skill) === Number(professionSkillId));
                  perform(() => request(`/api/admin/characters/${selected.guid}/professions`, token, { method: 'POST', body: JSON.stringify({ skillId: Number(professionSkillId), value: Number(professionValue) }) }), `${profession?.name || 'Skill'} berhasil diperbarui.`);
                }}>
                  <label className="field-label" htmlFor="profession-skill">PROFESI KARAKTER</label>
                  <select id="profession-skill" value={professionSkillId} disabled={busy} onChange={(event) => {
                    const skill = professions.find((entry) => Number(entry.skill) === Number(event.target.value));
                    setProfessionSkillId(event.target.value);
                    setProfessionValue(String(skill?.value || ''));
                  }}>{professions.map((profession) => <option key={profession.skill} value={profession.skill}>{profession.name} · {profession.value}/{profession.max}</option>)}</select>
                  <label className="field-label" htmlFor="profession-value">SKILL BARU (1-450)</label>
                  <div className="inline-control"><input id="profession-value" type="number" min="1" max="450" value={professionValue} onChange={(event) => setProfessionValue(event.target.value)} required /><button className="primary-button" type="submit" disabled={busy || !professionSkillId}>Terapkan <span>↗</span></button></div>
                  {selected.online && <p className="operation-note">Profesi hanya dapat diubah saat karakter offline.</p>}
                </form> : <p className="operation-note">Karakter belum memiliki profesi yang dapat diubah.</p>}
              </section>

              <section className="operation-block">
                <div className="operation-heading"><span className="operation-icon">◎</span><div><span className="eyebrow">REPUTATION</span><h3>Atur reputasi</h3></div></div>
                <form onSubmit={(event) => {
                  event.preventDefault();
                  const reputation = reputations.find((entry) => Number(entry.factionId) === Number(reputationFactionId));
                  perform(() => request(`/api/admin/characters/${selected.guid}/reputations`, token, { method: 'POST', body: JSON.stringify({ factionId: Number(reputationFactionId), standing: Number(reputationStanding) }) }), `Reputasi ${reputation?.factionName || ''} berhasil diperbarui.`);
                }}>
                  <label className="field-label" htmlFor="reputation-faction-select">FACTION TERSIMPAN</label>
                  <select id="reputation-faction-select" value={reputationFactionId} disabled={busy} onChange={(event) => {
                    const faction = reputations.find((entry) => Number(entry.factionId) === Number(event.target.value));
                    setReputationFactionId(event.target.value);
                    if (faction) setReputationStanding(String(faction.standing));
                  }}><option value="">Pilih dari reputasi karakter...</option>{reputations.map((reputation) => <option key={reputation.factionId} value={reputation.factionId}>{reputation.factionName} · {reputation.standing}</option>)}</select>
                  <label className="field-label" htmlFor="reputation-faction-id">FACTION ID</label>
                  <input id="reputation-faction-id" type="number" min="1" max="4294967295" value={reputationFactionId} onChange={(event) => setReputationFactionId(event.target.value)} required />
                  <label className="field-label" htmlFor="reputation-standing">STANDING (-42000 SAMPAI 42999)</label>
                  <div className="inline-control"><input id="reputation-standing" type="number" min="-42000" max="42999" value={reputationStanding} onChange={(event) => setReputationStanding(event.target.value)} required /><button className="primary-button" type="submit" disabled={busy || !reputationFactionId}>Terapkan <span>↗</span></button></div>
                  {selected.online && <p className="operation-note">Reputasi hanya dapat diubah saat karakter offline.</p>}
                </form>
              </section>

              <section className="operation-block">
                <div className="operation-heading"><span className="operation-icon">⌖</span><div><span className="eyebrow">WORLD POSITION</span><h3>Teleportasi</h3></div></div>
                <form onSubmit={(event) => {
                  event.preventDefault();
                  perform(() => request(`/api/admin/characters/${selected.guid}/teleport`, token, { method: 'POST', body: JSON.stringify({ mapId: Number(teleportMapId), ...Object.fromEntries(Object.entries(teleportCoordinates).map(([key, value]) => [key, Number(value)])) }) }), selected.online ? `${selected.name} dikeluarkan; posisi baru berlaku saat login kembali.` : `Posisi ${selected.name} disimpan dan berlaku saat login berikutnya.`);
                }}>
                  <label className="field-label" htmlFor="teleport-map">BENUA / MAP</label>
                  <select id="teleport-map" value={teleportMapId} disabled={busy} onChange={(event) => chooseTeleportMap(event.target.value)}>{TELEPORT_MAPS.map((map) => <option key={map.id} value={map.id}>{map.name} · map {map.id}</option>)}</select>
                  <label className="field-label" htmlFor="teleport-location">TITIK / ZONA</label>
                  <select id="teleport-location" value={teleportLocation} disabled={busy} onChange={(event) => chooseTeleportLocation(event.target.value)}>
                    <option value="custom">Koordinat manual</option>
                    {TELEPORT_LOCATIONS.filter((location) => location.mapId === Number(teleportMapId)).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select>
                  <div className="teleport-coordinates">
                    {['x', 'y', 'z'].map((coordinate) => <label key={coordinate} htmlFor={`teleport-${coordinate}`}><span>{coordinate.toUpperCase()}</span><input id={`teleport-${coordinate}`} type="number" step="any" value={teleportCoordinates[coordinate]} onChange={(event) => setTeleportCoordinates({ ...teleportCoordinates, [coordinate]: event.target.value })} required /></label>)}
                  </div>
                  <label className="field-label" htmlFor="teleport-orientation">ORIENTASI</label>
                  <div className="inline-control"><input id="teleport-orientation" type="number" min="0" max="6.284" step="any" value={teleportCoordinates.orientation} onChange={(event) => setTeleportCoordinates({ ...teleportCoordinates, orientation: event.target.value })} /><button className="primary-button" type="submit" disabled={busy}>Terapkan teleport <span>↗</span></button></div>
                  <p className="operation-note">Karakter online akan di-force logout; posisi baru digunakan saat login kembali.</p>
                </form>
              </section>

              <section className="operation-block item-block">
                <div className="operation-heading"><span className="operation-icon">✳</span><div><span className="eyebrow">INVENTORY</span><h3>Kirim item</h3></div></div>
                <label className="field-label" htmlFor="item-search">CARI ITEM</label>
                <div className="item-search-wrap"><input id="item-search" placeholder="Nama atau item ID..." value={itemSearch} onChange={(event) => { setItemSearch(event.target.value); setChosenItem(null); }} />
                  {itemResults.length > 0 && <div className="item-results">{itemResults.map((item) => <button key={item.entry} type="button" onClick={() => { setChosenItem(item); setItemSearch(item.name); setItemResults([]); }}><span className={`item-quality-dot quality-${QUALITY[item.quality] || 'common'}`} /><span>{item.name}<small>ITEM {item.entry}</small></span></button>)}</div>}
                </div>
                {chosenItem && <div className="chosen-item"><span className={`item-quality-dot quality-${QUALITY[chosenItem.quality] || 'common'}`} />{chosenItem.name}<span>#{chosenItem.entry}</span></div>}
                <form onSubmit={(event) => { event.preventDefault(); if (!chosenItem) return setError('Pilih item dari hasil pencarian.'); perform(() => request(`/api/admin/characters/${selected.guid}/items`, token, { method: 'POST', body: JSON.stringify({ itemId: chosenItem.entry, count: Number(itemCount) }) }), `${chosenItem.name} dikirim ke inventory.`); }}>
                  <label className="field-label" htmlFor="item-count">JUMLAH</label>
                  <div className="inline-control"><input id="item-count" type="number" min="1" max="1000" value={itemCount} onChange={(event) => setItemCount(event.target.value)} /><button className="primary-button" type="submit" disabled={busy || !chosenItem}>Tambahkan <span>↗</span></button><button className="secondary-button" type="button" disabled={busy || !chosenItem || selected.online} onClick={() => perform(() => request(`/api/admin/characters/${selected.guid}/items/remove`, token, { method: 'POST', body: JSON.stringify({ itemId: chosenItem.entry, count: Number(itemCount) }) }), `${chosenItem.name} dikurangi dari inventory.`)}>Kurangi</button></div>
                </form>
                <p className="operation-note">Item masuk ke bag karakter; equipment slot di atas hanya menampilkan perlengkapan yang sedang dipakai.</p>
              </section>

              <section className="operation-block money-block">
                <div className="operation-heading"><span className="operation-icon coin-icon">◉</span><div><span className="eyebrow">CURRENCY</span><h3>Atur uang</h3></div></div>
                <p>Saldo sekarang <strong>{formatMoney(selected.money)}</strong>{selected.online && <span> · penambahan dikirim via mail</span>}</p>
                <form onSubmit={(event) => {
                  event.preventDefault();
                  const amount = (Number(gold || 0) * 10000) + (Number(silver || 0) * 100) + Number(copper || 0);
                  if (!Number.isSafeInteger(amount) || amount < 1) return setError('Masukkan jumlah uang yang valid.');
                  const signedAmount = selected.online || moneyDirection === 'add' ? amount : -amount;
                  perform(() => request(`/api/admin/characters/${selected.guid}/money`, token, { method: 'POST', body: JSON.stringify({ amountCopper: signedAmount }) }), selected.online ? 'Uang dikirim melalui mail karakter.' : 'Saldo karakter berhasil diperbarui.');
                }}>
                  <div className="money-inputs"><label><span>GOLD</span><input type="number" min="0" placeholder="0" value={gold} onChange={(event) => setGold(event.target.value)} /></label><label><span>SILVER</span><input type="number" min="0" placeholder="0" value={silver} onChange={(event) => setSilver(event.target.value)} /></label><label><span>COPPER</span><input type="number" min="0" placeholder="0" value={copper} onChange={(event) => setCopper(event.target.value)} /></label></div>
                  <div className="inline-control">{!selected.online && <select aria-label="Aksi uang" value={moneyDirection} onChange={(event) => setMoneyDirection(event.target.value)}><option value="add">Tambah</option><option value="remove">Kurangi</option></select>}<button className="primary-button" type="submit" disabled={busy}>{selected.online ? 'Kirim via mail' : 'Perbarui saldo'} <span>↗</span></button></div>
                </form>
                {selected.online && <p className="operation-note">Pengurangan saldo hanya tersedia saat karakter offline.</p>}
              </section>
              <section className="operation-block character-actions-block">
                <div className="operation-heading"><span className="operation-icon">⚑</span><div><span className="eyebrow">ACCOUNT ACTIONS</span><h3>Kelola karakter</h3></div></div>
                <div className="action-stack"><button className="secondary-button" type="button" disabled={busy || !selected.online} onClick={() => perform(() => request(`/api/admin/characters/${selected.guid}/logout`, token, { method: 'POST' }), 'Karakter berhasil di-force logout.')}>Force logout</button><button className="secondary-button" type="button" disabled={busy} onClick={() => perform(() => request(`/api/admin/characters/${selected.guid}/rename-flag`, token, { method: 'POST' }), 'Rename diwajibkan saat karakter login berikutnya.')}>Flag rename</button><form onSubmit={(event) => { event.preventDefault(); perform(() => request(`/api/admin/characters/${selected.guid}/title`, token, { method: 'POST', body: JSON.stringify({ titleId: Number(targetTitle) }) }), 'Title karakter diperbarui.'); }}><label className="field-label" htmlFor="target-title">CHOSEN TITLE ID</label><div className="inline-control"><input id="target-title" type="number" min="0" max="65535" value={targetTitle} onChange={(event) => setTargetTitle(event.target.value)} /><button className="secondary-button" type="submit" disabled={busy}>Set title</button></div></form><form onSubmit={(event) => { event.preventDefault(); if (!window.confirm(`Ban karakter ${selected.name}?`)) return; perform(() => request(`/api/admin/characters/${selected.guid}/ban`, token, { method: 'POST', body: JSON.stringify({ durationHours: Number(banDuration), reason: banReason }) }), 'Karakter berhasil di-ban.'); }}><BanControls reason={banReason} setReason={setBanReason} duration={banDuration} setDuration={setBanDuration} compact /><button className="danger-button" type="submit" disabled={busy}>Ban karakter</button></form></div>
              </section>
              <section className="operation-block money-log-block"><div className="section-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h3>Money logs</h3></div><button className="text-button" type="button" onClick={() => request(`/api/admin/characters/${selected.guid}/money-logs`, token).then(setMoneyLogs).catch((reason) => setError(reason.message))}>Refresh</button></div>{moneyLogs.length ? <div className="money-log-list">{moneyLogs.map((log) => <div className="money-log-row" key={log.id}><span>{new Date(log.createdAt).toLocaleString('id-ID')}<small>{log.delivery === 'mail' ? 'MAIL' : 'DATABASE'}</small></span><strong className={Number(log.amountCopper) < 0 ? 'negative' : ''}>{Number(log.amountCopper) > 0 ? '+' : ''}{formatMoney(log.amountCopper)}</strong></div>)}</div> : <p className="operation-note">Belum ada perubahan saldo yang tercatat oleh control desk.</p>}</section>
            </aside>
          </div>
        </>}
        {(error || notice) && <div className={`toast ${error ? 'toast-error' : ''}`} role="status"><span>{error || notice}</span><button type="button" onClick={() => { setError(''); setNotice(''); }} aria-label="Tutup">×</button></div>}
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);