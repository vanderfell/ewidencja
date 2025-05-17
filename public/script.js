// File: public/script.js

// —————— Inicjalizacja UI dla sekcji „Umowy” ——————
function initContractUI(container) {
  const tbl = container.querySelector('#contracts-table');
  if (!tbl) return;           // jeśli brak sekcji umów – koniec

  // empId z aktywnego linku w sidebarze
  const sidebar    = container.querySelector('.sidebar');
  const activeLink = sidebar && sidebar.querySelector('a.active');
  const empMatch   = activeLink?.href.match(/\/employees\/(\d+)\//);
  const empId      = empMatch ? parseInt(empMatch[1], 10) : null;

  // 1) przyciski Zapisz / Usuń w istniejących wierszach
  tbl.addEventListener('click', async e => {
    if (e.target.matches('.c-save')) {
      const tr = e.target.closest('tr');
      const id = tr.dataset.id;
      const payload = {
        start_date : tr.querySelector('.c-start').value,
        end_date   : tr.querySelector('.c-end').value,
        daily_norm : tr.querySelector('.c-dnorm').value,
      };
      const js = await (await fetch('/api/contracts/' + id, {
        method : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(payload)
      })).json();
      alert(js.ok ? 'Umowa zaktualizowana.' : 'Błąd: ' + js.message);
    }

    if (e.target.matches('.c-del')) {
      if (!confirm('Na pewno usunąć tę umowę?')) return;
      const tr  = e.target.closest('tr');
      const id  = tr.dataset.id;
      const js  = await (await fetch('/api/contracts/' + id, { method:'DELETE' })).json();
      if (js.ok) tr.remove(); else alert('Błąd: ' + js.message);
    }
  });

  // 2) formularz dodawania nowej umowy
  const addForm = container.querySelector('#add-contract-form');
  if (addForm) {
    addForm.addEventListener('submit', async e => {
      e.preventDefault();
      const payload = {
        emp_id     : empId,
        start_date : addForm.start_date.value,
        end_date   : addForm.end_date.value,
        daily_norm : addForm.daily_norm.value
      };
      const js = await (await fetch('/api/contracts', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(payload)
      })).json();
      if (js.ok) location.reload(); else alert('Błąd: ' + js.message);
    });
  }

  // 3) przycisk Edytuj → otwarcie modala
  container.querySelectorAll('.btn-edit-contract').forEach(btn => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      document.getElementById('contract-id').value    = tr.dataset.id;
      document.getElementById('contract-start').value = tr.children[0].textContent.trim();
      document.getElementById('contract-end').value   =
        tr.children[1].textContent.trim() !== '—' ? tr.children[1].textContent.trim() : '';
      document.getElementById('contract-norm').value  = tr.children[2].textContent.trim();
      document.getElementById('contract-modal').style.display = 'flex';
    });
  });
}

// ————————————————————————————————————————————————

document.addEventListener('DOMContentLoaded', () => {

  const YEAR  = window.YEAR;
  const MONTH = window.MONTH;

  // ——— CONTEXT MENUS ———
  const empMenu = document.getElementById('emp-context-menu');
  const dayMenu = document.getElementById('day-context-menu');
  let curEmpId, curDay;

  document.addEventListener('contextmenu', e => {
    const td = e.target.closest('td.name-col');
    if (td) {                           // menu pracownika
      e.preventDefault();
      curEmpId = td.closest('tr').dataset.emp;
      empMenu.style.top  = `${e.pageY}px`;
      empMenu.style.left = `${e.pageX}px`;
      empMenu.style.display = 'block';
      return;
    }
    const th = e.target.closest('th.status-cell');
    if (th) {                           // menu statusu dnia
      e.preventDefault();
      curDay = +th.dataset.day;
      dayMenu.style.top  = `${e.pageY}px`;
      dayMenu.style.left = `${e.pageX}px`;
      dayMenu.style.display = 'block';
    }
  });

  document.addEventListener('click', () => {
    empMenu.style.display = 'none';
    dayMenu.style.display = 'none';
  });

  // ——— FETCH & RENDER OVERVIEW ———
  async function fetchOverview() {
    const r = await fetch(`/api/overview-data?year=${YEAR}&month=${MONTH}`);
    return r.json();
  }

  async function refreshOverview() {
    const { dayInfos, summary } = await fetchOverview();

    // nagłówki (status)
    document.querySelectorAll('.status-cell').forEach((cell, i) => {
      const di = dayInfos[i];
      cell.textContent = di.status;
      cell.classList.toggle('blocked', di.status !== 'P');
    });

    // podsumowania
    summary.forEach(s => {
      const tr = document.querySelector(`tr[data-emp="${s.id}"]`);
      if (!tr) return;
      tr.querySelector('.sum-days').textContent  = s.days;
      tr.querySelector('.sum-hours').textContent = s.hours;
      Object.keys(window.CODE_COLORS).forEach(k => {
        const cell = tr.querySelector(`.sum-${k}`);
        if (cell) cell.textContent = s[k] || 0;
      });
    });

    // blokowanie / odblokowywanie komórek
    document.querySelectorAll('input.cell-input').forEach(input => {
      const d  = +input.dataset.day;
      const di = dayInfos.find(x => x.day === d);
      const ok = di && di.status === 'P';
      input.disabled = !ok;
      input.parentElement.classList.toggle('blocked', !ok);
    });
  }

  // ——— WORKDAY INPUT HANDLING ———
  function applyColor(input) {
    const v = input.value.trim().toLowerCase();
    input.parentElement.style.backgroundColor =
      (window.CODE_COLORS[v] && isNaN(+v)) ? window.CODE_COLORS[v] : '';
  }

  function recalcRow(empId) {
    const tr   = document.querySelector(`tr[data-emp="${empId}"]`);
    let hrs = 0, days = 0, codes = [];
    tr.querySelectorAll('input.cell-input').forEach(i => {
      const v = i.value.trim().toLowerCase();
      if (v && !isNaN(+v)) { hrs += +v; days++; }
      else if (v) codes.push(v);
    });
    tr.querySelector('.sum-days').textContent  = days;
    tr.querySelector('.sum-hours').textContent = hrs;
    Object.keys(window.CODE_COLORS).forEach(c => {
      const cell = tr.querySelector(`.sum-${c}`);
      if (cell) cell.textContent = codes.filter(x => x === c).length;
    });
  }

  async function saveWorkday(input) {
    const { emp, year, month, day } = input.dataset;
    const code = input.value.trim();
    const td   = input.parentElement;

    const { ok } = await (await fetch('/api/workday', {
      method : 'POST',
      headers: { 'Content-Type':'application/json' },
      body   : JSON.stringify({ emp_id:+emp, year:+year, month:+month, day:+day, code })
    })).json();

    td.classList.remove('save-ok','save-error');
    td.classList.add(ok ? 'save-ok' : 'save-error');
    setTimeout(() => td.classList.remove('save-ok','save-error'), 1000);

    if (ok) {
      applyColor(input);
      recalcRow(emp);
      await refreshOverview();

      // odśwież kartę, jeśli otwarta
      const card = document.querySelector('.subtab-content.active[id^="card-"]');
      if (card) {
        const id = card.id.split('-')[1];
        card.innerHTML =
          await (await fetch(`/card/${id}?year=${YEAR}&month=${MONTH}`)).text();
      }
    }
  }

  // delegacje
  document.addEventListener('input', e => {
    if (e.target.matches('input.cell-input')) {
      applyColor(e.target);
      recalcRow(e.target.dataset.emp);
    }
  });
  document.addEventListener('blur', e => {
    if (e.target.matches('input.cell-input')) saveWorkday(e.target);
  }, true);

  // ——— TABS & PRACOWNICY AJAX ———
  const tabs = document.querySelectorAll('.tabs .tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {

      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const pane = document.getElementById(tab.dataset.tab);
      pane.classList.add('active');

      // aktualizacja URL
      let newUrl = '/dashboard';
      if (tab.dataset.tab === 'employees')      newUrl = '/pracownicy';
      else if (tab.dataset.tab === 'settings')  newUrl = '/ustawienia';
      history.pushState(null, '', newUrl);

      // zakładka „Pracownicy” → doładowanie
      if (tab.dataset.tab === 'employees') {
        const container = document.querySelector('#employees-container');

        const html0 = await (await fetch('/employees/0/profile')).text();
        const tmp0  = document.createElement('div');
        tmp0.innerHTML = html0;
        container.innerHTML =
          tmp0.querySelector('.sidebar').outerHTML +
          tmp0.querySelector('.content').outerHTML;

        initContractUI(container);

        // rozwijanie działów
        container.querySelectorAll('.dept-header').forEach(h => {
          h.addEventListener('click', () => {
            const ul = h.nextElementSibling;
            ul.style.display = ul.style.display === 'block' ? 'none' : 'block';
          });
        });

        // nawigacja w sidebarze
        container.querySelectorAll('.sidebar a').forEach(link => {
  link.addEventListener('click', async e => {
    e.preventDefault();

    /* podświetlenie w UI */
    container.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
    link.classList.add('active');

    /* ladny URL /pracownicy/:id  */
    const idMatch = link.href.match(/\/employees\/(\d+)/);
    const pretty  = idMatch ? `/pracownicy/${idMatch[1]}` : '/pracownicy';
    history.pushState(null, '', pretty);

    /* pobieramy prawdziwy widok (backend nadal pod /employees/:id/profile) */
    const html = await (await fetch(link.href)).text();
    const tmp  = document.createElement('div');
    tmp.innerHTML = html;
    container.querySelector('.content').outerHTML =
      tmp.querySelector('.content').outerHTML;

    initContractUI(container);
  });
});
      }
    });
  });

// ——— SUBTABS ———
document.querySelectorAll('.subtabs .subtab').forEach(st => {
  st.addEventListener('click', async () => {
    const parent = st.closest('.tab-content');

    /* aktywacja w UI */
    parent.querySelectorAll('.subtab').forEach(s => s.classList.remove('active'));
    parent.querySelectorAll('.subtab-content').forEach(c => c.classList.remove('active'));
    st.classList.add('active');

    const pane = parent.querySelector('#' + st.dataset.subtab);

    /* ───── ładowanie AJAX tylko tam, gdzie potrzeba ───── */
    if (pane.id === 'kw-tab') {
      pane.innerHTML = await (await fetch(`/kw?year=${YEAR}&month=${MONTH}`)).text();
    } else if (pane.id.startsWith('card-')) {
      const id = pane.id.split('-')[1];
      pane.innerHTML =
        await (await fetch(`/card/${id}?year=${YEAR}&month=${MONTH}`)).text();
    }
    pane.classList.add('active');

    /* ───── ładny URL ───── */
    let newUrl = '/dashboard';

    /* ––– OBSŁUGA ––– */
    if (pane.id === 'kw-tab') {
      newUrl = '/dashboard/kw';
    } else if (pane.id.startsWith('card-')) {
      newUrl = `/dashboard/${pane.id.split('-')[1]}`;
    }

    /* ––– USTAWIENIA ––– */
    if (pane.id.startsWith('settings-')) {
      const pretty = {
        'settings-company' : '/ustawienia/danefirmy',
        'settings-add'     : '/ustawienia/dodajpracownika',
        'settings-list'    : '/ustawienia/lista',
        'settings-absence' : '/ustawienia/absencja'
      };
      newUrl = pretty[pane.id] || '/ustawienia';
    }

    history.pushState(null, '', newUrl);
  });
});

/* ─── WYBÓR STARTOWEJ (SUB)ZAKŁADKI wg URL ─── */
(function selectInitialTab() {
  const path = window.location.pathname;

  /* OBSŁUGA */
  if (path.startsWith('/dashboard/kw')) {
    document.querySelector('.tab[data-tab="overview"]').click();
    document.querySelector('.subtab[data-subtab="kw-tab"]').click();
    return;
  }
  if (/^\/dashboard\/\d+$/.test(path)) {
    const id = path.split('/')[2];
    document.querySelector('.tab[data-tab="overview"]').click();
    document.querySelector(`.subtab[data-subtab="card-${id}"]`)?.click();
    return;
  }

  /* USTAWIENIA */
  if (path.startsWith('/ustawienia')) {
    document.querySelector('.tab[data-tab="settings"]').click();
    const sub = path.split('/')[2] || '';
    const rev = {
      'danefirmy'        : 'settings-company',
      'dodajpracownika'  : 'settings-add',
      'lista'            : 'settings-list',
      'absencja'         : 'settings-absence'
    };
    const paneId = rev[sub] || 'settings-company';
    document.querySelector(`.subtab[data-subtab="${paneId}"]`)?.click();
    return;
  }

  /* PRACOWNICY */
  if (path.startsWith('/pracownicy')) {
    document.querySelector('.tab[data-tab="employees"]').click();
    return;
  }

  /* domyślnie */
  document.querySelector('.tab[data-tab="overview"]').click();
})();

/* ─── BACK / FORWARD ─── */
window.addEventListener('popstate', () => {
  const path = window.location.pathname;

  /* OBSŁUGA */
  if (path.startsWith('/dashboard/kw')) {
    document.querySelector('.tab[data-tab="overview"]').click();
    document.querySelector('.subtab[data-subtab="kw-tab"]').click();
    return;
  }
  if (/^\/dashboard\/\d+$/.test(path)) {
    const id = path.split('/')[2];
    document.querySelector('.tab[data-tab="overview"]').click();
    document.querySelector(`.subtab[data-subtab="card-${id}"]`)?.click();
    return;
  }

  /* USTAWIENIA */
  if (path.startsWith('/ustawienia')) {
    document.querySelector('.tab[data-tab="settings"]').click();
    const sub = path.split('/')[2] || '';
    const rev = {
      'danefirmy'        : 'settings-company',
      'dodajpracownika'  : 'settings-add',
      'lista'            : 'settings-list',
      'absencja'         : 'settings-absence'
    };
    const paneId = rev[sub] || 'settings-company';
    document.querySelector(`.subtab[data-subtab="${paneId}"]`)?.click();
    return;
  }

  /* PRACOWNICY */
  if (path.startsWith('/pracownicy')) {
    document.querySelector('.tab[data-tab="employees"]').click();
    return;
  }

  /* domyślnie */
  document.querySelector('.tab[data-tab="overview"]').click();
});


  // ——— DAY OVERRIDE ———
  dayMenu.addEventListener('click', async e => {
    const code = e.target.dataset.code;
    await fetch('/api/calendar-overrides', {
      method : code ? 'POST' : 'DELETE',
      headers: { 'Content-Type':'application/json' },
      body   : JSON.stringify({ year:YEAR, month:MONTH, day:curDay, code })
    });
    await refreshOverview();

    const card = document.querySelector('.subtab-content.active[id^="card-"]');
    if (card) {
      const id = card.id.split('-')[1];
      card.innerHTML =
        await (await fetch(`/card/${id}?year=${YEAR}&month=${MONTH}`)).text();
    }
  });

  // ——— EDIT / DELETE EMPLOYEE ———
  const empModal = document.getElementById('emp-modal');
  const empForm  = document.getElementById('emp-edit-form');

  document.getElementById('ctx-delete').addEventListener('click', async () => {
    if (!confirm('Na pewno usunąć pracownika?')) { empMenu.style.display='none'; return; }
    const { ok } = await (await fetch(`/api/employees/${curEmpId}`, { method:'DELETE' })).json();
    empMenu.style.display = 'none';
    if (ok) location.reload();
  });

  // ——— NOTE MODAL ———
  const noteModal = document.getElementById('note-modal');
  const noteArea  = document.getElementById('note-text');
  const btnCancel = document.getElementById('note-cancel');
  const btnSave   = document.getElementById('note-save');
  const btnDelete = document.getElementById('note-delete');

  document.getElementById('ctx-note').addEventListener('click', async () => {
    empMenu.style.display = 'none';
    try {
      const { note } = await (await fetch(
        `/api/notes?emp_id=${curEmpId}&year=${YEAR}&month=${MONTH}`
      )).json();
      noteArea.value = note || '';
    } catch { noteArea.value = ''; }
    noteModal.style.display = 'flex';
  });

  btnCancel.addEventListener('click', () => noteModal.style.display = 'none');

  btnDelete.addEventListener('click', async () => {
    if (!confirm('Na pewno usunąć notatkę?')) return;
    const { ok } = await (await fetch('/api/notes', {
      method : 'DELETE',
      headers: { 'Content-Type':'application/json' },
      body   : JSON.stringify({ emp_id:+curEmpId, year:YEAR, month:MONTH })
    })).json();
    alert(ok ? 'Notatka usunięta.' : 'Błąd usuwania.');
    noteModal.style.display = 'none';
  });

  btnSave.addEventListener('click', async () => {
    const { ok } = await (await fetch('/api/notes', {
      method : 'POST',
      headers: { 'Content-Type':'application/json' },
      body   : JSON.stringify({
        emp_id:+curEmpId, year:YEAR, month:MONTH, note:noteArea.value.trim()
      })
    })).json();
    alert(ok ? 'Notatka zapisana.' : 'Błąd zapisu.');
    noteModal.style.display = 'none';
  });

  noteModal.addEventListener('click', e => {
    if (e.target === noteModal) noteModal.style.display = 'none';
  });

  // ——— EDIT (popup) ———
  document.getElementById('ctx-edit').addEventListener('click', () => {
    const tr = document.querySelector(`tr[data-emp="${curEmpId}"]`);
    empForm.full_name.value      = tr.querySelector('td.name-col').textContent.trim();
    empForm.position.value       = tr.dataset.position;
    empForm.payroll_number.value = tr.dataset.payroll;
    empForm.daily_norm.value     = tr.dataset.daily;
    empForm.department.value     = tr.dataset.department;
    empMenu.style.display = 'none';
    empModal.style.display = 'flex';
  });

  document.getElementById('modal-cancel').addEventListener('click',
    () => empModal.style.display = 'none');

  empForm.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      full_name      : empForm.full_name.value.trim(),
      position       : empForm.position.value.trim(),
      payroll_number : empForm.payroll_number.value.trim(),
      daily_norm     : parseFloat(empForm.daily_norm.value),
      department     : empForm.department.value
    };
    const { ok } = await (await fetch(`/api/employees/${curEmpId}`, {
      method : 'PUT',
      headers: { 'Content-Type':'application/json' },
      body   : JSON.stringify(payload)
    })).json();
    empModal.style.display = 'none';
    if (ok) location.reload();
  });

  // ——— PRINT CARDS ———
  document.getElementById('print-cards')?.addEventListener('click', async () => {
    let html = `<html><head><title>Karty</title><style>
      @page{size:A4 landscape;margin:10mm}
      @media print{*{-webkit-print-color-adjust:exact}}
      body{font-family:sans-serif;margin:1em}
      table{width:100%;border-collapse:collapse;margin-bottom:2em}
      th,td{border:1px solid#999;padding:8px;text-align:center}
      th:first-child,td:first-child{text-align:left}
    </style></head><body>`;
    for (const div of document.querySelectorAll('.subtab-content[id^="card-"]')) {
      const id   = div.id.split('-')[1];
      const resp = await fetch(`/card/${id}?year=${YEAR}&month=${MONTH}`);
      html      += `<div style="page-break-after:always;">${await resp.text()}</div>`;
    }
    html += '</body></html>';
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
  });

  // ——— DEPARTMENT SELECT ———
  document.querySelectorAll('select.department-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const { empId } = sel.dataset;
      const { ok } = await (await fetch(`/api/employees/${empId}`, {
        method : 'PUT',
        headers: { 'Content-Type':'application/json' },
        body   : JSON.stringify({ department: sel.value })
      })).json();
      if (ok) location.reload();
    });
  });

  // ——— INITIALIZE ———
  refreshOverview();
});
