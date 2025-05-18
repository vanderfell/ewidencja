// File: public/script.js

function initContractUI(container) {
  const tbl = container.querySelector('#contracts-table');
  if (!tbl) return;
  const sidebar    = container.querySelector('.sidebar');
  const activeLink = sidebar && sidebar.querySelector('a.active');
  const empMatch   = activeLink?.href.match(/\/employees\/(\d+)\//);
  const empId      = empMatch ? +empMatch[1] : null;

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

document.addEventListener('DOMContentLoaded', () => {
  const YEAR  = window.YEAR;
  const MONTH = window.MONTH;

  const empMenu = document.getElementById('emp-context-menu');
  const dayMenu = document.getElementById('day-context-menu');
  let curEmpId, curDay;

  // ----- ZAKŁADKI I PAMIĘĆ ZAKŁADEK -----
  const MAIN_TABS = document.querySelectorAll('.tabs .tab');
  let lastTab = localStorage.getItem('ewp-tab')     || 'overview';
  let lastSub = localStorage.getItem('ewp-subtab')  || '';

  MAIN_TABS.forEach(tab => {
    tab.addEventListener('click', () => {
      MAIN_TABS.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
      lastTab = tab.dataset.tab;
      localStorage.setItem('ewp-tab', lastTab);
      localStorage.removeItem('ewp-subtab');
      const map = {
        overview  : '/dashboard',
        teachers  : '/nauczyciele',
        employees : '/pracownicy',
        settings  : '/ustawienia'
      };
      history.pushState(null, '', map[tab.dataset.tab] || '/');
    });
  });

  document.querySelectorAll('.subtabs .subtab').forEach(st => {
    st.addEventListener('click', async () => {
      activateSubtab(st);
      lastSub = st.dataset.subtab;
      localStorage.setItem('ewp-subtab', lastSub);
      if (st.dataset.subtab.startsWith('card-')) {
        const empId = st.dataset.subtab.split('-')[1];
        const container = document.getElementById(st.dataset.subtab);
        const resp = await fetch(`/card/${empId}?year=${YEAR}&month=${MONTH}`);
        container.innerHTML = await resp.text();
      }
      const map = {
        'kw-tab'           : '/dashboard/kw',
        'teach-absence'    : '/nauczyciele/nieobecnosci',
        'teach-repl'       : '/nauczyciele/zastepstwa',
        'settings-company' : '/ustawienia/danefirmy',
        'settings-add'     : '/ustawienia/dodajpracownika',
        'settings-list'    : '/ustawienia/lista',
        'settings-absence' : '/ustawienia/absencja'
      };
      if (map[st.dataset.subtab]) history.pushState(null, '', map[st.dataset.subtab]);
    });
  });

  function activateSubtab(st) {
    const box = st.closest('.tab-content');
    box.querySelectorAll('.subtab').forEach(x => x.classList.remove('active'));
    box.querySelectorAll('.subtab-content').forEach(x => x.classList.remove('active'));
    st.classList.add('active');
    document.getElementById(st.dataset.subtab).classList.add('active');
  }

  (function initialTabRender() {
    showMainTab(lastTab);
    if (lastSub) showSubtab(lastTab, lastSub);
  })();

  const datePickerForm = document.querySelector('form.date-picker');
  if (datePickerForm) {
    datePickerForm.setAttribute('action', window.location.pathname);
    datePickerForm.addEventListener('change', () => {
      sessionStorage.setItem('ewp-tab', lastTab);
      sessionStorage.setItem('ewp-subtab', lastSub);
    });
  }

  if (sessionStorage.getItem('ewp-tab')) {
    lastTab = sessionStorage.getItem('ewp-tab');
    lastSub = sessionStorage.getItem('ewp-subtab') || '';
    showMainTab(lastTab);
    if (lastSub) showSubtab(lastTab, lastSub);
    sessionStorage.removeItem('ewp-tab');
    sessionStorage.removeItem('ewp-subtab');
  }

  window.addEventListener('popstate', () => location.reload());

  function showMainTab(tabName) {
    const tab  = document.querySelector(`.tab[data-tab="${tabName}"]`);
    const pane = document.getElementById(tabName);
    if (!tab || !pane) return;
    MAIN_TABS.forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    pane.classList.add('active');
  }

  function showSubtab(parentTabId, subId) {
    const parent = document.getElementById(parentTabId);
    if (!parent) return;
    const st = parent.querySelector(`.subtab[data-subtab="${subId}"]`);
    if (st) activateSubtab(st);
  }

  // ------------- MENU KONTEKSTOWE (PRACOWNIK, DZIEŃ) -------------
  document.addEventListener('contextmenu', e => {
    const td = e.target.closest('td.name-col');
    const th = e.target.closest('th.status-cell, th.status-cell-na');
    if (td) {
      e.preventDefault();
      curEmpId = td.closest('tr').dataset.emp;
      Object.assign(empMenu.style, { top:`${e.pageY}px`, left:`${e.pageX}px`, display:'block' });
      return;
    }
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

  // ------------ KOLORY, SUMOWANIE, BLOKOWANIE KOLUMN ------------
  function applyColor(input) {
    const v = input.value.trim().toLowerCase();
    input.parentElement.style.backgroundColor =
      (window.CODE_COLORS[v] && isNaN(+v)) ? window.CODE_COLORS[v] : '';
  }

  function recalcRow(empId) {
    const tr   = document.querySelector(`tr[data-emp="${empId}"]`);
    if (!tr) return;
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

  function setColState(day, status, tableSelector) {
    document.querySelectorAll(`${tableSelector} tbody tr`).forEach(tr => {
      const tds = tr.querySelectorAll('td.calendar-cell');
      const td = tds[day-1];
      if (!td) return;
      const inp = td.querySelector('input');
      if (status === 'P') {
        td.classList.remove('blocked');
        td.style.backgroundColor = '';
        if (inp) {
          inp.disabled = false;
          inp.parentElement.classList.remove('blocked');
          applyColor(inp);
        }
      } else if (status) {
        td.classList.add('blocked');
        let col = window.CODE_COLORS[status.toLowerCase()] || '';
        td.style.backgroundColor = col;
        if (inp) {
          inp.disabled = true;
          inp.parentElement.classList.add('blocked');
        }
      }
      if (!status) {
        td.classList.remove('blocked');
        td.style.backgroundColor = '';
        if (inp) {
          inp.disabled = false;
          inp.parentElement.classList.remove('blocked');
          applyColor(inp);
        }
      }
    });
  }

  document.querySelectorAll('th.status-cell, th.status-cell-na').forEach(th => {
    th.addEventListener('click', async (e) => {
      curDay = +th.dataset.day;
      Object.assign(dayMenu.style, { top:`${e.pageY}px`, left:`${e.pageX}px`, display:'block' });
    });
  });

  dayMenu.addEventListener('click', async e => {
    const code = e.target.dataset.code;
    if (curDay == null) return;
    await fetch('/api/calendar-overrides', {
      method : code ? 'POST' : 'DELETE',
      headers: { 'Content-Type':'application/json' },
      body   : JSON.stringify({
        year:YEAR, month:MONTH, day:curDay,
        code, dept: currentDept()
      })
    });
    document.querySelectorAll(`th.status-cell[data-day="${curDay}"], th.status-cell-na[data-day="${curDay}"]`).forEach(th=>{
      th.textContent = code || '';
      th.classList.toggle('blocked', code && code !== 'P');
    });
    setColState(curDay, code, '#overview-table table');
    setColState(curDay, code, '#teach-absence table');
    setColState(curDay, code, '#teach-repl table');
    if (!code) {
      setColState(curDay, 'P', '#overview-table table');
      setColState(curDay, 'P', '#teach-absence table');
      setColState(curDay, 'P', '#teach-repl table');
    }
    dayMenu.style.display = 'none';
  });

  // ------------- INPUTY, ZAPIS, SUMOWANIE -------------
  document.addEventListener('input', e => {
    if (e.target.matches('input.cell-input, input.cell-input-na')) {
      applyColor(e.target);
      recalcRow(e.target.dataset.emp);
    }
  });
  document.addEventListener('blur', e => {
    if (e.target.matches('input.cell-input, input.cell-input-na'))
      saveWorkday(e.target);
  }, true);

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
    recalcRow(emp);
  }

  function currentDept() {
    const main = document.querySelector('.tabs .tab.active').dataset.tab;
    return main === 'teachers' ? 'Nauczyciel' : 'Obsługa';
  }

  // -------------- Employees > Sidebar show/hide --------------
  document.addEventListener('click', e => {
    const el = e.target.nodeType === 3 ? e.target.parentElement : e.target;
    const header = el && el.closest('.dept-header');
    if (!header) return;
    const list = header.nextElementSibling;
    if (!list || !list.classList.contains('dept-list')) return;
    list.style.display = list.style.display === 'block' ? 'none' : 'block';
  });

  // ---- SUMA GODZIN DLA ZASTĘPSTW NAUCZYCIELI (teach-repl) ----
  function recalcSubstituteRow(tr) {
    let sum = 0;
    tr.querySelectorAll('input.cell-input-na').forEach(input => {
      const val = input.value.trim();
      if (!isNaN(val) && val !== '') sum += parseFloat(val);
    });
    const sumTd = tr.querySelector('.sum-total');
    if (sumTd) sumTd.textContent = sum;
  }
  document.addEventListener('input', e => {
    if (e.target.matches('#teach-repl input.cell-input-na')) {
      const tr = e.target.closest('tr');
      if (tr) recalcSubstituteRow(tr);
    }
  });
  function recalcAllSubstituteRows() {
    document.querySelectorAll('#teach-repl tr[data-emp]').forEach(recalcSubstituteRow);
  }
  document.querySelectorAll('.subtab[data-subtab="teach-repl"]').forEach(st => {
    st.addEventListener('click', () => setTimeout(recalcAllSubstituteRows, 10));
  });
  if (document.getElementById('teach-repl')?.classList.contains('active')) {
    setTimeout(recalcAllSubstituteRows, 10);
  }

  // -------------- MODALE: Pracownik, Notatka, Kontrakt --------------
  const empModal = document.getElementById('emp-modal');
  const empForm  = document.getElementById('emp-edit-form');

  document.getElementById('ctx-delete').addEventListener('click', async () => {
    if (!confirm('Na pewno usunąć pracownika?')) { empMenu.style.display='none'; return; }
    const { ok } = await (await fetch(`/api/employees/${curEmpId}`, { method:'DELETE' })).json();
    empMenu.style.display = 'none';
    if (ok) location.reload();
  });

  // NOTE MODAL
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

  // EDIT (popup)
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

  // DEPARTMENT SELECT (inline)
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

  // PRINT CARDS
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

});
