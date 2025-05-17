// File: public/script.js
// ------------------------------------------------------------
//  Inicjalizacja UI dla sekcji „Umowy”
// ------------------------------------------------------------
function initContractUI(container) {
  const tbl = container.querySelector('#contracts-table');
  if (!tbl) return;                          // brak sekcji → koniec

  // empId z aktywnego linku w sidebarze
  const sidebar    = container.querySelector('.sidebar');
  const activeLink = sidebar && sidebar.querySelector('a.active');
  const empMatch   = activeLink?.href.match(/\/employees\/(\d+)\//);
  const empId      = empMatch ? +empMatch[1] : null;

  // — Zapis / usuwanie istniejącej umowy
  tbl.addEventListener('click', async e => {
    const tr = e.target.closest('tr');
    if (!tr) return;

    // ZAPIS
    if (e.target.matches('.c-save')) {
      const id = tr.dataset.id;
      const payload = {
        start_date : tr.querySelector('.c-start').value,
        end_date   : tr.querySelector('.c-end').value,
        daily_norm : tr.querySelector('.c-dnorm').value
      };
      const js = await (await fetch(`/api/contracts/${id}`, {
        method : 'PUT',
        headers: { 'Content-Type':'application/json' },
        body   : JSON.stringify(payload)
      })).json();
      alert(js.ok ? 'Umowa zaktualizowana' : 'Błąd: ' + js.message);
    }

    // USUNIĘCIE
    if (e.target.matches('.c-del')) {
      if (!confirm('Na pewno usunąć tę umowę?')) return;
      const id = tr.dataset.id;
      const js = await (await fetch(`/api/contracts/${id}`, { method:'DELETE' })).json();
      if (js.ok) tr.remove(); else alert('Błąd: ' + js.message);
    }
  });

  // — Dodawanie nowej umowy
  const addForm = container.querySelector('#add-contract-form');
  addForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      emp_id     : empId,
      start_date : addForm.start_date.value,
      end_date   : addForm.end_date.value,
      daily_norm : addForm.daily_norm.value
    };
    const js = await (await fetch('/api/contracts', {
      method : 'POST',
      headers: { 'Content-Type':'application/json' },
      body   : JSON.stringify(payload)
    })).json();
    if (js.ok) location.reload(); else alert('Błąd: ' + js.message);
  });

  // — Edycja w modal-popupie
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

/* ============================================================
 *  A P P
 * ========================================================== */
document.addEventListener('DOMContentLoaded', () => {

  const YEAR  = window.YEAR;
  const MONTH = window.MONTH;

  /* ------------------------
   *  Context-menu
   * ---------------------- */
  const empMenu = document.getElementById('emp-context-menu');
  const dayMenu = document.getElementById('day-context-menu');
  let curEmpId, curDay;

  document.addEventListener('contextmenu', e => {
    const td = e.target.closest('td.name-col');
    const th = e.target.closest('th.status-cell, th.status-cell-na');

    // menu pracownika
    if (td) {
      e.preventDefault();
      curEmpId = td.closest('tr').dataset.emp;
      Object.assign(empMenu.style, { top:`${e.pageY}px`, left:`${e.pageX}px`, display:'block' });
      return;
    }
    // menu dnia
    if (th) {
      e.preventDefault();
      curDay = +th.dataset.day;
      Object.assign(dayMenu.style, { top:`${e.pageY}px`, left:`${e.pageX}px`, display:'block' });
    }
  });
  document.addEventListener('click', () => {
    empMenu.style.display = 'none';
    dayMenu.style.display = 'none';
  });

  /* ------------------------
   *  Pobieranie danych (Obsługa / Nauczyciele)
   * ---------------------- */
  async function fetchOverview(dept = 'Obsługa') {
    const r = await fetch(
      `/api/overview-data?year=${YEAR}&month=${MONTH}&dept=${encodeURIComponent(dept)}`
    );
    return r.json();
  }

  async function refreshOverview() {
    const { dayInfos, summary } = await fetchOverview('Obsługa');

    // status (nagłówek)
    document.querySelectorAll('.status-cell').forEach((cell, i) => {
      const di = dayInfos[i];
      cell.textContent = di.status;
      cell.classList.toggle('blocked', di.status !== 'P');
    });

    // podsumowania wierszy
    summary.forEach(s => {
      const tr = document.querySelector(`tr[data-emp="${s.id}"]`);
      if (!tr) return;
      tr.querySelector('.sum-days').textContent  = s.days;
      tr.querySelector('.sum-hours').textContent = s.hours;
      Object.keys(window.CODE_COLORS).forEach(k => {
        const c = tr.querySelector(`.sum-${k}`);
        if (c) c.textContent = s[k] || 0;
      });
    });

    // blokowanie pól edycyjnych
    document.querySelectorAll('input.cell-input').forEach(inp => {
      const di = dayInfos.find(x => x.day === +inp.dataset.day);
      const ok = di && di.status === 'P';
      inp.disabled = !ok;
      inp.parentElement.classList.toggle('blocked', !ok);
    });
  }

  async function refreshTeachers() {
    const { dayInfos, summary } = await fetchOverview('Nauczyciel');

    document.querySelectorAll('.status-cell-na').forEach((cell,i)=>{
      const di = dayInfos[i];
      cell.textContent = di.status;
      cell.classList.toggle('blocked', di.status!=='P');
    });

    summary.forEach(s=>{
      const tr = document.querySelector(`tr[data-emp="${s.id}"]`);
      if (!tr) return;
      tr.querySelector('.sum-days-na' ).textContent = s.days;
      tr.querySelector('.sum-hours-na').textContent = s.hours;
      Object.keys(window.CODE_COLORS).forEach(k=>{
        const c = tr.querySelector(`.sum-${k}-na`);
        if (c) c.textContent = s[k]||0;
      });
    });

    document.querySelectorAll('input.cell-input-na').forEach(inp=>{
      const di = dayInfos.find(x => x.day === +inp.dataset.day);
      const ok = di && di.status === 'P';
      inp.disabled = !ok;
      inp.parentElement.classList.toggle('blocked',!ok);
    });
  }

  /* ------------------------
   *  Przeliczenia / kolorowanie
   * ---------------------- */
  function applyColor(input) {
    const v = input.value.trim().toLowerCase();
    input.parentElement.style.backgroundColor =
      (window.CODE_COLORS[v] && isNaN(+v)) ? window.CODE_COLORS[v] : '';
  }

  function recalcRow(empId) {
    const tr   = document.querySelector(`tr[data-emp="${empId}"]`);
    let hrs = 0, days = 0, codes = [];
    tr.querySelectorAll('input.cell-input, input.cell-input-na').forEach(i => {
      const v = i.value.trim().toLowerCase();
      if (v && !isNaN(+v)) { hrs += +v; days++; }
      else if (v) codes.push(v);
    });
    tr.querySelectorAll('.sum-days, .sum-days-na').forEach(td => td.textContent = days);
    tr.querySelectorAll('.sum-hours, .sum-hours-na').forEach(td => td.textContent = hrs);
    Object.keys(window.CODE_COLORS).forEach(c => {
      tr.querySelectorAll(`.sum-${c}, .sum-${c}-na`).forEach(cell=>{
        cell.textContent = codes.filter(x => x === c).length;
      });
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

    td.classList.toggle('save-ok',    ok);
    td.classList.toggle('save-error', !ok);
    setTimeout(()=>td.classList.remove('save-ok','save-error'), 1000);

    if (!ok) return;

    applyColor(input);
    recalcRow(emp);
    await refreshOverview();
    await refreshTeachers();

    // odśwież aktywną kartę, jeśli otwarta
    const card = document.querySelector('.subtab-content.active[id^="card-"]');
    if (card) {
      const id = card.id.split('-')[1];
      card.innerHTML =
        await (await fetch(`/card/${id}?year=${YEAR}&month=${MONTH}`)).text();
    }
  }

  /* ------------------------
   *  Delegacja dla komórek
   * ---------------------- */
  document.addEventListener('input', e =>{
    if (e.target.matches('input.cell-input, input.cell-input-na')) {
      applyColor(e.target);
      recalcRow(e.target.dataset.emp);
    }
  });
  document.addEventListener('blur', e =>{
    if (e.target.matches('input.cell-input, input.cell-input-na'))
      saveWorkday(e.target);
  }, true);

  /* ------------------------
   *  Tabs + Sub-tabs + Historia
   * ---------------------- */
  const MAIN_TABS = document.querySelectorAll('.tabs .tab');
  MAIN_TABS.forEach(tab=>{
    tab.addEventListener('click',()=>{
      MAIN_TABS.forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');

      const map = {
        overview  : '/dashboard',
        teachers  : '/nauczyciele',
        employees : '/pracownicy',
        settings  : '/ustawienia'
      };
      history.pushState(null,'',map[tab.dataset.tab]||'/');
    });
  });

  function activateSubtab(st) {
    const box = st.closest('.tab-content');
    box.querySelectorAll('.subtab').forEach(x=>x.classList.remove('active'));
    box.querySelectorAll('.subtab-content').forEach(x=>x.classList.remove('active'));
    st.classList.add('active');
    document.getElementById(st.dataset.subtab).classList.add('active');
  }

  document.querySelectorAll('.subtabs .subtab').forEach(st=>{
    st.addEventListener('click', async ()=>{
      activateSubtab(st);

      /* dynamiczny content */
      if (st.dataset.subtab === 'kw-tab') {
        document.getElementById('kw-tab').innerHTML =
          await (await fetch(`/kw?year=${YEAR}&month=${MONTH}`)).text();
      }
      if (st.dataset.subtab.startsWith('card-')) {
        const id = st.dataset.subtab.split('-')[1];
        document.getElementById(st.dataset.subtab).innerHTML =
          await (await fetch(`/card/${id}?year=${YEAR}&month=${MONTH}`)).text();
      }

      /* URL dla sub-zakładek */
      const map = {
        'kw-tab'           : '/dashboard/kw',
        'teach-absence'    : '/nauczyciele/nieobecnosci',
        'teach-repl'       : '/nauczyciele/zastepstwa',
        'settings-company' : '/ustawienia/danefirmy',
        'settings-add'     : '/ustawienia/dodajpracownika',
        'settings-list'    : '/ustawienia/lista',
        'settings-absence' : '/ustawienia/absencja'
      };
      if (map[st.dataset.subtab]) history.pushState(null,'',map[st.dataset.subtab]);
    });
  });

  /* ------------------------
   *  Day-override (z działem)
   * ---------------------- */
  function currentDept() {
    const main = document.querySelector('.tabs .tab.active').dataset.tab;
    return main === 'teachers' ? 'Nauczyciel' : 'Obsługa';
  }

  dayMenu.addEventListener('click', async e => {
    const code = e.target.dataset.code;
    await fetch('/api/calendar-overrides', {
      method : code ? 'POST' : 'DELETE',
      headers: { 'Content-Type':'application/json' },
      body   : JSON.stringify({
        year:YEAR, month:MONTH, day:curDay,
        code, dept: currentDept()
      })
    });
    await refreshOverview();
    await refreshTeachers();
  });

  /* ------------------------
   *  (…dalsza część pliku: modal pracownika, notatki, druk,
   *  zmiana działu itd. – nie zmieniano) 
   * ---------------------- */

  /* ------------------------
   *  INIT – pierwsze renderowanie
   * ---------------------- */

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
  
  
    /* ------------------------
   *  INITIALIZE  (pierwszy render + ustawienie zakładki z URL)
   * ---------------------- */

  /* helper: przełącza główną zakładkę bez wywoływania .click()  */
  function showMainTab(tabName) {
    const tab  = document.querySelector(`.tab[data-tab="${tabName}"]`);
    const pane = document.getElementById(tabName);
    if (!tab || !pane) return;
    MAIN_TABS.forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    pane.classList.add('active');
  }

  /* helper: przełącza pod-zakładkę wewnątrz podanego panelu */
  function showSubtab(parentTabId, subId) {
    const parent = document.getElementById(parentTabId);
    if (!parent) return;
    const st = parent.querySelector(`.subtab[data-subtab="${subId}"]`);
    if (st) activateSubtab(st);        // korzystamy z istniejącej funkcji
  }

  async function initialRender() {
    await refreshOverview();   // pobranie danych
    await refreshTeachers();

    const path = window.location.pathname;

    /* ——— PRACOWNICY ——— */
    if (path.startsWith('/pracownicy')) {
      showMainTab('employees');
      return;
    }

    /* ——— NAUCZYCIELE ——— */
    if (path.startsWith('/nauczyciele')) {
      showMainTab('teachers');
      if (path.includes('/nieobecnosci')) showSubtab('teachers', 'teach-absence');
      else if (path.includes('/zastepstwa')) showSubtab('teachers', 'teach-repl');
      return;
    }

    /* ——— USTAWIENIA ——— */
    if (path.startsWith('/ustawienia')) {
      showMainTab('settings');
      const code = (path.split('/')[2] || '');
      const map  = {
        danefirmy        : 'settings-company',
        dodajpracownika  : 'settings-add',
        lista            : 'settings-list',
        absencja         : 'settings-absence'
      };
      showSubtab('settings', map[code] || 'settings-company');
      return;
    }

    /* ——— OBSŁUGA / KWARTALNE ——— */
    if (path.startsWith('/dashboard/kw')) {
      showMainTab('overview');
      showSubtab('overview', 'kw-tab');
      return;
    }

    /* ——— OBSŁUGA / KARTA PRACOWNIKA ——— */
    if (/^\/dashboard\/\d+/.test(path)) {
      const id = path.split('/')[2];
      showMainTab('overview');
      showSubtab('overview', `card-${id}`);
      return;
    }

    /* ——— domyślnie → Obsługa / Ewidencja ——— */
    showMainTab('overview');
  }

  /* BACK / FORWARD – odświeżamy całą stronę, żeby logika powyżej zadziałała */
  window.addEventListener('popstate', () => location.reload());

  
/* ------------------------------------------------------------
 *  Employees > Sidebar – show / hide listy pracowników działu
 * ---------------------------------------------------------- */
document.addEventListener('click', e => {
  /* jeśli kliknięto w text-node → bierzemy rodzica-element */
  const el = e.target.nodeType === 3   /* Node.TEXT_NODE */
               ? e.target.parentElement
               : e.target;

  const header = el && el.closest('.dept-header');
  if (!header) return;                           // klik nie w nagłówek

  const list = header.nextElementSibling;        // <ul class="dept-list">
  if (!list || !list.classList.contains('dept-list')) return;

  list.style.display = list.style.display === 'block' ? 'none' : 'block';
});


  
  
  /* start! */
  initialRender();
});

