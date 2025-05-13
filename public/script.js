// File: public/script.js

document.addEventListener('DOMContentLoaded', () => {
  const YEAR  = window.YEAR;
  const MONTH = window.MONTH;

  // ——— CONTEXT-MENU DELEGATION ———
  const empMenu = document.getElementById('emp-context-menu');
  const dayMenu = document.getElementById('day-context-menu');
  let curEmpId, curDay;

  document.addEventListener('contextmenu', e => {
    // Employee row
    const td = e.target.closest('td.name-col');
    if (td) {
      e.preventDefault();
      curEmpId = td.closest('tr').dataset.emp;
      empMenu.style.top     = `${e.pageY}px`;
      empMenu.style.left    = `${e.pageX}px`;
      empMenu.style.display = 'block';
      return;
    }
    // Day‐override header
    const th = e.target.closest('th.status-cell');
    if (th) {
      e.preventDefault();
      curDay = +th.dataset.day;
      dayMenu.style.top     = `${e.pageY}px`;
      dayMenu.style.left    = `${e.pageX}px`;
      dayMenu.style.display = 'block';
    }
  });

  // clicking anywhere else hides menus
  document.addEventListener('click', () => {
    empMenu.style.display = 'none';
    dayMenu.style.display = 'none';
  });

  // ——— FETCH & RENDER OVERVIEW ———
  async function fetchOverview() {
    const activeTab = document.querySelector('.tabs .tab.active').dataset.tab;
    const department = activeTab === 'overview' ? 'Obsługa'
                      : activeTab === 'teachers' ? 'Nauczyciel'
                      : '';
    const res = await fetch(
      `/api/overview-data?year=${YEAR}&month=${MONTH}&dept=${encodeURIComponent(department)}`
    );
    return res.json();
  }

  async function refreshOverview() {
    const { dayInfos, summary } = await fetchOverview();
    const container = document.querySelector('.tab-content.active');

    // Update header-status cells (guard przed undefined)
    container.querySelectorAll('.status-cell').forEach((cell, i) => {
      const di = dayInfos[i];
      if (!di) return;
      cell.textContent = di.status;
      cell.classList.toggle('blocked', di.status !== 'P');
    });

    // Update summary rows
    summary.forEach(s => {
      const tr = container.querySelector(`tr[data-emp="${s.id}"]`);
      if (!tr) return;
      tr.querySelector('.sum-days').textContent  = s.days;
      tr.querySelector('.sum-hours').textContent = s.hours;
      ['w','l4','nd','bz','op','ok','sw'].forEach(k => {
        tr.querySelector(`.sum-${k}`).textContent = s[k];
      });
    });

    // Enable/disable inputs per day status
    container.querySelectorAll('input.cell-input').forEach(input => {
      const d = parseInt(input.dataset.day,10);
      const di = dayInfos.find(x=>x.day===d);
      const ok = di && di.status==='P';
      input.disabled = !ok;
      input.parentElement.classList.toggle('blocked', !ok);
    });
  }

  // ——— WORKDAY INPUT HANDLING ———
  function applyColor(input) {
    const txt = input.value.trim().toLowerCase();
    input.parentElement.style.backgroundColor =
      (window.CODE_COLORS[txt] && isNaN(+txt))
        ? window.CODE_COLORS[txt]
        : '';
  }
  function recalcRow(empId) {
    const tr = document.querySelector(`tr[data-emp="${empId}"]`);
    let hrs=0, days=0, codes=[];
    tr.querySelectorAll('input.cell-input').forEach(i => {
      const v = i.value.trim().toLowerCase();
      if (v!=='' && !isNaN(+v)) { hrs+=+v; days++; }
      else if (v!=='') codes.push(v);
    });
    tr.querySelector('.sum-days').textContent  = days;
    tr.querySelector('.sum-hours').textContent = hrs;
    ['w','l4','nd','bz','op','ok','sw'].forEach(c => {
      tr.querySelector(`.sum-${c}`).textContent = codes.filter(x=>x===c).length;
    });
  }
  async function saveWorkday(input) {
    const { emp, year, month, day } = input.dataset;
    const code = input.value.trim();
    const td   = input.parentElement;
    const res = await fetch('/api/workday', {
      method: 'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ emp_id:+emp, year:+year, month:+month, day:+day, code })
    });
    const { ok } = await res.json();
    td.classList.remove('save-ok','save-error');
    td.classList.add(ok?'save-ok':'save-error');
    setTimeout(()=>td.classList.remove('save-ok','save-error'),1000);
    if (ok) {
      applyColor(input);
      recalcRow(emp);
      await refreshOverview();
      // odśwież karta jeśli otwarta
      const card = document.querySelector('.subtab-content.active[id^="card-"]');
      if (card) {
        const id = card.id.split('-')[1];
        card.innerHTML = await (await fetch(`/card/${id}?year=${YEAR}&month=${MONTH}`)).text();
      }
    }
  }
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
      // 1) aktywna zakładka
      tabs.forEach(t => t.classList.toggle('active', t===tab));
      document.querySelectorAll('.tab-content').forEach(tc =>
        tc.classList.toggle('active', tc.id===tab.dataset.tab)
      );

      // 2a) przy Obsłudze reset subtabów
      if (tab.dataset.tab==='overview') {
        const ov = document.getElementById('overview');
        ov.querySelectorAll('.subtab, .subtab-content').forEach(el=>el.classList.remove('active'));
        ov.querySelector('.subtab[data-subtab="overview-table"]').classList.add('active');
        ov.querySelector('#overview-table').classList.add('active');
      }

      // 2b) Pracownicy → AJAX load
      if (tab.dataset.tab==='employees') {
        const res  = await fetch('/employees/0/profile');
        const html = await res.text();
        const tmp  = document.createElement('div');
        tmp.innerHTML = html;
        const container = document.getElementById('employees-container');
        container.innerHTML =
          tmp.querySelector('.sidebar').outerHTML +
          tmp.querySelector('.content').outerHTML;
        // rozwijanie działów
        container.querySelectorAll('.dept-header').forEach(h => {
          h.addEventListener('click', () => {
            const ul = h.nextElementSibling;
            ul.style.display = ul.style.display==='block'?'none':'block';
          });
        });
        // AJAX‐owa nawigacja
        container.querySelectorAll('.sidebar a').forEach(link=>{
          link.addEventListener('click', async e=>{
            e.preventDefault();
            container.querySelectorAll('.sidebar a').forEach(a=>a.classList.remove('active'));
            link.classList.add('active');
            const txt = await (await fetch(link.href)).text();
            const tmp2= document.createElement('div');
            tmp2.innerHTML = txt;
            container.querySelector('.content').outerHTML = tmp2.querySelector('.content').outerHTML;
          });
        });
      }

      // 3) Obsługa lub Nauczyciele → odświeżamy kalendarz
      if (['overview','teachers'].includes(tab.dataset.tab)) {
        await refreshOverview();
      }
    });
  });
  // kliknij Obsługa na start
  document.querySelector('.tab[data-tab="overview"]').click();

  // ——— SUBTABS inside Obsługa ———
  document.querySelectorAll('.subtabs .subtab').forEach(st => {
  st.addEventListener('click', async () => {
    const parent = st.closest('.tab-content');
    parent.querySelectorAll('.subtab, .subtab-content').forEach(el=>el.classList.remove('active'));
    st.classList.add('active');
    const pane = parent.querySelector('#'+st.dataset.subtab);
    if (pane.id==='kw-tab') {
      pane.innerHTML = await (await fetch(`/kw?year=${YEAR}&month=${MONTH}`)).text();
    } else if (pane.id.startsWith('card-')) {
      const id = pane.id.split('-')[1];
      pane.innerHTML = await (await fetch(`/card/${id}?year=${YEAR}&month=${MONTH}`)).text();
    }
    pane.classList.add('active');
  });
});

    // ——— DAY OVERRIDE ———
  dayMenu.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();

    // złap najbliższe <li data-code="…">
    const li = e.target.closest('li[data-code]');
    if (!li) return;

    const code = li.dataset.code;
    const activeTab = document.querySelector('.tabs .tab.active').dataset.tab;
    const department = activeTab === 'overview' ? 'Obsługa'
                      : activeTab === 'teachers' ? 'Nauczyciel'
                      : '';

    const method = code ? 'POST' : 'DELETE';
    const res = await fetch('/api/calendar-overrides', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: YEAR,
        month: MONTH,
        day: curDay,
        code,
        department
      })
    });
    const { ok } = await res.json();
    if (!ok) {
      alert('Nie udało się zapisać nadpisania dnia.');
    }

    dayMenu.style.display = 'none';
    await refreshOverview();
  });



  // ——— EDIT / DELETE EMPLOYEE ———
  const empModal = document.getElementById('emp-modal');
  const empForm  = document.getElementById('emp-edit-form');

  // DELETE
  document.getElementById('ctx-delete').addEventListener('click', async () => {
    if (!confirm('Na pewno usunąć pracownika?')) {
      empMenu.style.display = 'none';
      return;
    }
    const res = await fetch(`/api/employees/${curEmpId}`, { method:'DELETE' });
    const { ok } = await res.json();
    empMenu.style.display = 'none';
    if (ok) {
      // pełne odświeżenie
      location.reload();
    }
  });
  
 // ——— NOTE MODAL ———
const noteModal  = document.getElementById('note-modal');
const noteArea   = document.getElementById('note-text');
const btnCancel  = document.getElementById('note-cancel');
const btnSave    = document.getElementById('note-save');
const btnDelete  = document.getElementById('note-delete');


// ——— PROFILE from context menu ———
document.getElementById('ctx-profile').addEventListener('click', async () => {
  empMenu.style.display = 'none';
  // 1) przełącz zakładkę
  document.querySelector('.tabs .tab[data-tab="employees"]').click();
  // 2) poczekaj chwilę (możesz też przenieść tę logikę do promise po załadowaniu tab-employees)
  await new Promise(r => setTimeout(r, 50));
  // 3) zasymuluj kliknięcie aktualnie wybranego linku w sidebarze,
  //    żeby zaciągnął profil (jeśli już jest tam lista)
  const link = document.querySelector(
    `#employees-container .sidebar a[href="/employees/${curEmpId}/profile"]`
  );
  if (link) link.click();
});

// ——— NOTE from context menu ———
// zakładamy, że masz zdefiniowane wcześniej:
//   const noteModal = document.getElementById('note-modal');
//   const noteArea  = document.getElementById('note-text');
//   const btnCancel = document.getElementById('note-cancel');
//   const btnSave   = document.getElementById('note-save');
//   const btnDelete = document.getElementById('note-delete');

document.getElementById('ctx-note').addEventListener('click', async () => {
  empMenu.style.display = 'none';
  let existing = '';
  try {
    const resp = await fetch(
      `/api/notes?emp_id=${curEmpId}&year=${YEAR}&month=${MONTH}`
    );
    const data = await resp.json();
    existing = data.note || '';
  } catch (err) {
    existing = '';
  }
  noteArea.value = existing;
  noteModal.style.display = 'flex';
});

// anuluj notatkę
btnCancel.addEventListener('click', () => {
  noteModal.style.display = 'none';
});

// usuń notatkę
btnDelete.addEventListener('click', async () => {
  if (!confirm('Na pewno usunąć notatkę?')) return;
  const resp = await fetch('/api/notes', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emp_id: +curEmpId,
      year:   YEAR,
      month:  MONTH
    })
  });
  const { ok } = await resp.json();
  alert(ok ? 'Notatka usunięta.' : 'Błąd usuwania.');
  noteModal.style.display = 'none';
});

// zapisz notatkę
btnSave.addEventListener('click', async () => {
  const note = noteArea.value.trim();
  const resp = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emp_id: +curEmpId,
      year:   YEAR,
      month:  MONTH,
      note
    })
  });
  const { ok } = await resp.json();
  alert(ok ? 'Notatka zapisana.' : 'Błąd zapisu.');
  noteModal.style.display = 'none';
});



// anuluj
btnCancel.addEventListener('click', () => {
  noteModal.style.display = 'none';
});

// usuń (wywołuje DELETE)
btnDelete.addEventListener('click', async () => {
  if (!confirm('Na pewno usunąć notatkę?')) return;
  try {
    const resp = await fetch('/api/notes', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        emp_id: +curEmpId,
        year:   YEAR,
        month:  MONTH
      })
    });
    const { ok } = await resp.json();
    alert(ok ? 'Notatka usunięta.' : 'Błąd usuwania.');
  } catch {
    alert('Błąd usuwania notatki.');
  } finally {
    noteModal.style.display = 'none';
  }
});

// zapisz (POST)
btnSave.addEventListener('click', async () => {
  const text = noteArea.value.trim();
  try {
    const resp = await fetch('/api/notes', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        emp_id: +curEmpId,
        year:   YEAR,
        month:  MONTH,
        note:   text
      })
    });
    const { ok } = await resp.json();
    alert(ok ? 'Notatka zapisana.' : 'Błąd zapisu.');
  } catch {
    alert('Błąd zapisu notatki.');
  } finally {
    noteModal.style.display = 'none';
  }
});

// kliknięcie poza modalem – też zamknij
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
    empMenu.style.display   = 'none';
    empModal.style.display  = 'flex';
  });

  document.getElementById('modal-cancel').addEventListener('click', () => {
    empModal.style.display = 'none';
  });
  // SUBMIT EDIT
  empForm.addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      full_name:      empForm.full_name.value.trim(),
      position:       empForm.position.value.trim(),
      payroll_number: empForm.payroll_number.value.trim(),
      daily_norm:     parseFloat(empForm.daily_norm.value),
      department:     empForm.department.value
    };
    const res = await fetch(`/api/employees/${curEmpId}`, {
      method:'PUT',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(data)
    });
    const { ok } = await res.json();
    empModal.style.display = 'none';
    if (ok) {
      location.reload();
    }
  });


  // ——— PRINT CARDS ———
  document.getElementById('print-cards')?.addEventListener('click', async () => {
    let html = `<html><head><title>Karty pracowników</title><style>
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
    html += `</body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  });


  // ——— DEPARTMENT‐SELECT ———
  document.querySelectorAll('select.department-select').forEach(select => {
    select.addEventListener('change', async () => {
      const id   = select.dataset.empId;
      const dept = select.value;
      const res  = await fetch(`/api/employees/${id}`, {
        method:'PUT',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ department: dept })
      });
      const { ok } = await res.json();
      if (ok) {
        // odśwież, by pracownik wędrował między listami
        location.reload();
      }
    });
  });


  // ——— INITIALIZE ———
  refreshOverview();
});
