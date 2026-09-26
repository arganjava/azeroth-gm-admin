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

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('acore-cms-token') || '');
  const [loginToken, setLoginToken] = useState('');
  const [loginError, setLoginError] = useState('');
  const [search, setSearch] = useState('');
  const [characters, setCharacters] = useState([]);
  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState([]);
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState([]);
  const [chosenItem, setChosenItem] = useState(null);
  const [itemCount, setItemCount] = useState(1);
  const [targetLevel, setTargetLevel] = useState('');
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
      return undefined;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const found = await request(`/api/admin/characters?q=${encodeURIComponent(search.trim())}`, token, { signal: controller.signal });
        setCharacters(found);
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      }
    }, 220);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [search, token]);

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
    setSelected(character);
    setItems(character.items || []);
    setTargetLevel(String(character.level));
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
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem('acore-cms-token');
    setToken('');
    setSelected(null);
    setCharacters([]);
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
        <div className="rail-heading"><span className="eyebrow">DIRECTORY</span><span className="result-count">{characters.length.toString().padStart(2, '0')}</span></div>
        <h2>Karakter</h2>
        <label className="search-box"><span>⌕</span><input aria-label="Cari karakter" placeholder="Cari nama karakter..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>↵</kbd></label>
        <p className="search-hint">Ketik minimal 2 karakter</p>
        <div className="character-list">
          {characters.map((character) => <button className={`character-row ${selected?.guid === character.guid ? 'active' : ''}`} key={character.guid} type="button" onClick={() => loadCharacter(character.guid).catch((reason) => setError(reason.message))}>
            <span className="character-avatar">{character.name.slice(0, 1).toUpperCase()}</span>
            <span className="character-copy"><strong>{character.name}</strong><small>{CLASSES[character.class] || `Class ${character.class}`} · Level {character.level}</small></span>
            <span className={`online-indicator ${character.online ? 'online' : ''}`} title={character.online ? 'Online' : 'Offline'} />
          </button>)}
          {search.length >= 2 && characters.length === 0 && <div className="empty-search">Tidak ada karakter ditemukan.</div>}
        </div>
        <div className="rail-footer"><span>CHARACTER DATABASE</span><span>01 / LIVE</span></div>
      </aside>

      <section className="main-panel">
        {!selected ? <div className="welcome-state"><div className="welcome-kicker"><span className="connection-dot" /> ADMINISTRATION / 01</div><h1>Semua urusan<br /><em>karakter, satu tempat.</em></h1><p>Pilih karakter dari directory untuk melihat equipment dan mengelola progres realm.</p><div className="welcome-rule"><span>AC</span><i /></div></div> : <>
          <div className="character-header">
            <div><div className="breadcrumb">DIRECTORY <span>/</span> CHARACTER PROFILE <span>/</span> {selected.guid}</div><div className="character-title"><span className="profile-avatar">{selected.name.slice(0, 1).toUpperCase()}</span><div><h1>{selected.name}</h1><p>{RACES[selected.race] || `Race ${selected.race}`} {CLASSES[selected.class] || `Class ${selected.class}`}</p></div></div></div>
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
              <div className="equipment-grid">
                {Object.entries(SLOT_NAMES).map(([slot, label]) => {
                  const item = equipped.get(Number(slot));
                  return <div className={`equipment-slot ${item ? `quality-${QUALITY[item.quality] || 'common'}` : ''}`} key={slot}>
                    <span className="slot-number">{slot.padStart(2, '0')}</span><span className="slot-name">{label}</span>
                    <strong title={item?.name || 'Slot kosong'}>{item?.name || '—'}</strong>
                    {item && <small>ITEM {item.entry} · ×{item.count}</small>}
                  </div>;
                })}
              </div>
            </section>

            <aside className="operations-column">
              <section className="operation-block level-block">
                <div className="operation-heading"><span className="operation-icon">↑</span><div><span className="eyebrow">PROGRESSION</span><h3>Atur level</h3></div></div>
                <p>Set level karakter melalui GM command. Perubahan dihitung dari level saat ini.</p>
                <form onSubmit={(event) => { event.preventDefault(); perform(() => request(`/api/admin/characters/${selected.guid}/level`, token, { method: 'POST', body: JSON.stringify({ level: Number(targetLevel) }) }), 'Level karakter berhasil diperbarui.'); }}>
                  <label className="field-label" htmlFor="target-level">LEVEL BARU</label>
                  <div className="inline-control"><input id="target-level" type="number" min="1" max="255" value={targetLevel} onChange={(event) => setTargetLevel(event.target.value)} required /><button className="primary-button" type="submit" disabled={busy || Number(targetLevel) === Number(selected.level)}>Terapkan <span>↗</span></button></div>
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
                  <div className="inline-control"><input id="item-count" type="number" min="1" max="1000" value={itemCount} onChange={(event) => setItemCount(event.target.value)} /><button className="primary-button" type="submit" disabled={busy || !chosenItem}>Tambahkan <span>↗</span></button></div>
                </form>
                <p className="operation-note">Item masuk ke bag karakter; equipment slot di atas hanya menampilkan perlengkapan yang sedang dipakai.</p>
              </section>

              <section className="operation-block money-block">
                <div className="operation-heading"><span className="operation-icon coin-icon">◉</span><div><span className="eyebrow">CURRENCY</span><h3>Atur uang</h3></div></div>
                <p>Saldo sekarang <strong>{formatMoney(selected.money)}</strong></p>
                <form onSubmit={(event) => {
                  event.preventDefault();
                  const amount = (Number(gold || 0) * 10000) + (Number(silver || 0) * 100) + Number(copper || 0);
                  if (!Number.isSafeInteger(amount) || amount < 1) return setError('Masukkan jumlah uang yang valid.');
                  const signedAmount = moneyDirection === 'add' ? amount : -amount;
                  perform(() => request(`/api/admin/characters/${selected.guid}/money`, token, { method: 'POST', body: JSON.stringify({ amountCopper: signedAmount }) }), 'Saldo karakter berhasil diperbarui.');
                }}>
                  <div className="money-inputs"><label><span>GOLD</span><input type="number" min="0" placeholder="0" value={gold} onChange={(event) => setGold(event.target.value)} /></label><label><span>SILVER</span><input type="number" min="0" placeholder="0" value={silver} onChange={(event) => setSilver(event.target.value)} /></label><label><span>COPPER</span><input type="number" min="0" placeholder="0" value={copper} onChange={(event) => setCopper(event.target.value)} /></label></div>
                  <div className="inline-control"><select aria-label="Aksi uang" value={moneyDirection} onChange={(event) => setMoneyDirection(event.target.value)}><option value="add">Tambah</option><option value="remove">Kurangi</option></select><button className="primary-button" type="submit" disabled={busy || selected.online}>Perbarui saldo <span>↗</span></button></div>
                </form>
                {selected.online && <p className="inline-warning">Karakter harus offline untuk mengubah saldo.</p>}
              </section>
            </aside>
          </div>
        </>}
        {(error || notice) && <div className={`toast ${error ? 'toast-error' : ''}`} role="status"><span>{error || notice}</span><button type="button" onClick={() => { setError(''); setNotice(''); }} aria-label="Tutup">×</button></div>}
      </section>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);