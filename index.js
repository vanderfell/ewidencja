// File: index.js
const express    = require('express');
const bodyParser = require('body-parser');
const sqlite3    = require('sqlite3').verbose();
const path       = require('path');

const app = express();
const db  = new sqlite3.Database(path.join(__dirname, 'data', 'ewidencja.db'));


app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ——— dynamiczne wczytywanie typów absencji tylko dla widoków HTML
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();

  db.all(
    'SELECT id, code, name, color FROM absence_types ORDER BY sort_order',
    [],
    (err, types) => {
      if (err) {
        console.error('Błąd ładowania absence_types:', err);
        return next();
      }
      res.locals.absenceTypes = types;
      res.locals.CODE_COLORS   = Object.fromEntries(types.map(t => [t.code, t.color]));
      next();
    }
  );
});



app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// --- inicjalizacja bazy ---

// --- tabela typów absencji ---
db.run(`
  CREATE TABLE IF NOT EXISTS absence_types (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    code   TEXT    UNIQUE NOT NULL,
    name   TEXT    NOT NULL,
    color  TEXT    NOT NULL
  );
`);

// dodaj kolumnę sort_order, jeśli jej jeszcze nie ma
db.run(`ALTER TABLE absence_types ADD COLUMN sort_order INTEGER;`, () => {
  // ustaw domyślny porządek wg id, jeśli sort_order puste
  db.run(`
    UPDATE absence_types
    SET sort_order = id
    WHERE sort_order IS NULL;
  `);
});


// — opcjonalnie: zasiej domyślne typy, jeśli tabela pusta
db.run(`
  INSERT OR IGNORE INTO absence_types (code,name,color) VALUES
    ('l4','Zwolnienie lekarskie','#FFC7CE'),
    ('w','Urlop wypoczynkowy','#FABF8F'),
    ('ok','Obecność okolicznościowa','#92CDDC'),
    ('nd','Nieobecność niezawiniona','#CCC0DA'),
    ('sw','Szkolenie wewnętrzne','#E26B0A'),
    ('op','Opieka','#F6A0F2'),
    ('bz','Bezpłatny urlop','#92D050');
`);

db.run(`
  CREATE TABLE IF NOT EXISTS notes (
    emp_id INTEGER,
    year INTEGER,
    month INTEGER,
    note TEXT,
    PRIMARY KEY(emp_id,year,month)
  );
`);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT UNIQUE NOT NULL,
      position TEXT,
      payroll_number TEXT,
      work_time_fte REAL,
      daily_norm REAL,
      notes TEXT,
      department TEXT
    );
  `);
  
    // … po istniejącym CREATE TABLE IF NOT EXISTS employees …
  // --- tabela umów ---
  db.run(`
    CREATE TABLE IF NOT EXISTS contracts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      emp_id        INTEGER NOT NULL,
      start_date    TEXT    NOT NULL,
      end_date      TEXT,
      fte           REAL    NOT NULL,
      daily_norm    REAL    NOT NULL,
      FOREIGN KEY(emp_id) REFERENCES employees(id)
    );
  `);

  
  // dla istniejącej bazy: ignorujemy błąd jeśli już jest
  db.run(`ALTER TABLE employees ADD COLUMN department TEXT;`, () => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS workdays (
      emp_id INTEGER,
      year INTEGER,
      month INTEGER,
      day INTEGER,
      code TEXT,
      PRIMARY KEY(emp_id,year,month,day)
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS calendar_overrides (
      year INTEGER,
      month INTEGER,
      day INTEGER,
      code TEXT,
      PRIMARY KEY(year,month,day)
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  db.run(`
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('company_name','Nazwa firmy'),
      ('company_nip','0000000000');
  `);
});




// API KOLORKI
// pobranie wszystkich typów absencji
app.get('/api/absence-types', (req, res) => {
  db.all('SELECT * FROM absence_types ORDER BY sort_order', [], (err, rows) => {
    if (err) return res.status(500).json({ ok: false, message: err.message });
    res.json({ ok: true, types: rows });
  });
});

// dodanie nowego typu
app.post('/api/absence-types', (req, res) => {
  const { code, name, color } = req.body;
  db.run(
    'INSERT INTO absence_types(code,name,color) VALUES(?,?,?)',
    [code, name, color],
    function(err) {
      if (err) return res.status(400).json({ ok: false, message: err.message });
      res.json({ ok: true, id: this.lastID });
    }
  );
});


// zapis kolejności typów absencji (drag&drop)
app.put('/api/absence-types/order', (req, res) => {
  const arr = req.body.order;
  if (!Array.isArray(arr)) {
    return res.status(400).json({ ok:false, message:'Brak tablicy order' });
  }
  db.serialize(() => {
    const stmt = db.prepare('UPDATE absence_types SET sort_order = ? WHERE id = ?');
    arr.forEach((id, idx) => stmt.run(idx, id));
    stmt.finalize(err => {
      if (err) return res.status(500).json({ ok:false, message:err.message });
      res.json({ ok:true });
    });
  });
});

// edycja istniejącego
app.put('/api/absence-types/:id', (req, res) => {
  const { code, name, color } = req.body;
  db.run(
    'UPDATE absence_types SET code=?, name=?, color=? WHERE id=?',
    [code, name, color, req.params.id],
    err => {
      if (err) return res.status(400).json({ ok: false, message: err.message });
      res.json({ ok: true });
    }
  );
});

// usunięcie
app.delete('/api/absence-types/:id', (req, res) => {
  db.run(
    'DELETE FROM absence_types WHERE id=?',
    [req.params.id],
    err => {
      if (err) return res.status(400).json({ ok: false, message: err.message });
      res.json({ ok: true });
    }
  );
});


// — API for instant refresh in the client
app.get('/api/overview-data', (req, res) => {
  const year  = parseInt(req.query.year, 10) || new Date().getFullYear();
  const month = parseInt(req.query.month, 10) || (new Date().getMonth()+1);

  // 1) load calendar overrides
  db.all(
    'SELECT day, code FROM calendar_overrides WHERE year=? AND month=?',
    [year, month],
    (errO, overrides) => {
      if (errO) return res.json({ dayInfos: [], summary: [] });
      const overrideMap = new Map(overrides.map(o=>[o.day, o.code]));

      // build dayInfos
      const ndays = new Date(year, month, 0).getDate();
      const DOW_PL = ['nd','pn','wt','śr','cz','pt','sb'];
      const FIXED  = [[1,1],[1,6],[5,1],[5,3],[8,15],[11,1],[11,11],[12,25],[12,26]];
      const dayInfos = [];
      for (let d = 1; d <= ndays; d++) {
        const dt = new Date(year, month-1, d);
        const jsDow = dt.getDay();
        const kodDow = DOW_PL[jsDow];
        const isWeekend = jsDow === 0 || jsDow === 6;
        const isHoliday = FIXED.some(h=>h[0]===month && h[1]===d);
        let status = isHoliday ? 'Ś' : (isWeekend ? '-' : 'P');
        if (overrideMap.has(d)) status = overrideMap.get(d);
        dayInfos.push({ day: d, kodDow, status });
      }

      // 2) load workdays
      db.all(
        'SELECT emp_id, day, code FROM workdays WHERE year=? AND month=?',
        [year, month],
        (errW, wds) => {
          if (errW) return res.json({ dayInfos, summary: [] });

          // 3) load employees
          db.all('SELECT * FROM employees ORDER BY full_name', [], (errE, emps) => {
            if (errE) return res.json({ dayInfos, summary: [] });

            const codesList = ['w','l4','nd','bz','op','ok','sw'];
            const summary = emps.map(emp => {
              const codes = wds
                .filter(w=>w.emp_id===emp.id)
                .map(w=>w.code.toLowerCase());
              const hours = codes.reduce((s,c)=>s + (isNaN(+c)?0:+c), 0);
              const days  = codes.filter(c=>c!=='' && !isNaN(+c)).length;
              const counts = {};
              codesList.forEach(k=>counts[k]=codes.filter(c=>c===k).length);
              return { id: emp.id, days, hours, ...counts };
            });

            res.json({ dayInfos, summary });
          });
        }
      );
    }
  );
});

// GET / – główny widok

// na górze pliku, obok pozostałych API:
app.get('/api/notes', (req, res) => {
  const emp_id = parseInt(req.query.emp_id, 10);
  const year   = parseInt(req.query.year, 10);
  const month  = parseInt(req.query.month, 10);

  db.get(
    'SELECT note FROM notes WHERE emp_id=? AND year=? AND month=?',
    [emp_id, year, month],
    (err, row) => {
      if (err) return res.json({ note: '' });
      res.json({ note: row ? row.note : '' });
    }
  );
});



app.get('/', (req, res) => {
  const year  = parseInt(req.query.year,  10) || new Date().getFullYear();
  const month = parseInt(req.query.month, 10) || (new Date().getMonth()+1);

  db.all('SELECT * FROM employees ORDER BY full_name', [], (err, emps) => {
    if (err) return res.status(500).send(err.message);

    db.all(
      'SELECT emp_id, day, code FROM workdays WHERE year=? AND month=?',
      [year, month],
      (err2, wds) => {
        if (err2) return res.status(500).send(err2.message);

        db.all(
          'SELECT day, code FROM calendar_overrides WHERE year=? AND month=?',
          [year, month],
          (err3, ov) => {
            if (err3) return res.status(500).send(err3.message);

            db.all('SELECT key, value FROM settings', [], (err4, settingsRows) => {
              if (err4) return res.status(500).send(err4.message);

              const settings   = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
              const overrideMap = new Map(ov.map(o => [o.day, o.code]));

              // build dayInfos
              const ndays   = new Date(year, month, 0).getDate();
              const DOW_PL  = ['nd','pn','wt','śr','cz','pt','sb'];
              const FIXED   = [[1,1],[1,6],[5,1],[5,3],[8,15],[11,1],[11,11],[12,25],[12,26]];
              const dayInfos = [];
              for (let d = 1; d <= ndays; d++) {
                const dt        = new Date(year, month - 1, d);
                const jsDow     = dt.getDay();
                const kodDow    = DOW_PL[jsDow];
                const isWeekend = jsDow === 0 || jsDow === 6;
                const isHoliday = FIXED.some(h=>h[0]===month && h[1]===d);
                let status = isHoliday ? 'Ś' : (isWeekend ? '-' : 'P');
                if (overrideMap.has(d)) status = overrideMap.get(d);
                dayInfos.push({ day: d, kodDow, status });
              }

              // summary for render()
              const codesList = ['w','l4','nd','bz','op','ok','sw'];
              const summary = emps.map(emp => {
                const codes = wds.filter(w=>w.emp_id===emp.id).map(w=>w.code.toLowerCase());
                const hours = codes.reduce((s,c)=>s + (isNaN(+c)?0:+c), 0);
                const days  = codes.filter(c=>c!=='' && !isNaN(+c)).length;
                const counts = {};
                codesList.forEach(k=>counts[k]=codes.filter(c=>c===k).length);
                return {
                  id: emp.id,
                  name: emp.full_name,
                  days, hours,
                  position: emp.position,
                  payroll_number: emp.payroll_number,
                  daily_norm: emp.daily_norm,
                  department: emp.department,
                  ...counts
                };
              });

              const monthNames = [
                'styczeń','luty','marzec','kwiecień','maj','czerwiec',
                'lipiec','sierpień','wrzesień','październik','listopad','grudzień'
              ];
              const monthName = monthNames[month - 1];
              const normDays = dayInfos.filter(d=>d.status==='P').length;
              emps.forEach(emp => {
                emp.month_days  = normDays;
                emp.month_hours = normDays * emp.daily_norm;
              });

              res.render('index', {
              emps, wds, year, month,
              dayInfos, summary,
              settings, monthName
            });

            });
          }
        );
      }
    );
  });
});;

// AJAX: partial card dla pojedynczego pracownika
app.get('/card/:empId', (req, res) => {
  const empId = +req.params.empId;
  const year  = parseInt(req.query.year,  10) || new Date().getFullYear();
  const month = parseInt(req.query.month, 10) || (new Date().getMonth() + 1);

  db.get('SELECT * FROM employees WHERE id = ?', [empId], (err, emp) => {
    if (err || !emp) return res.status(404).send('Pracownik nie znaleziony');

    // pobieramy ustawienia
    db.all('SELECT key, value FROM settings', [], (err2, settingsRows) => {
      if (err2) return res.status(500).send(err2.message);
      const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));

      // dni pracy pracownika
      db.all(
        'SELECT emp_id, day, code FROM workdays WHERE year=? AND month=?',
        [year, month],
        (err3, wds) => {
          if (err3) return res.status(500).send(err3.message);

          // nadpisania kalendarza
          db.all(
            'SELECT day, code FROM calendar_overrides WHERE year=? AND month=?',
            [year, month],
            (err4, ov) => {
              if (err4) return res.status(500).send(err4.message);

              // build dayInfos
              const overrideMap = new Map(ov.map(o => [o.day, o.code]));
              const ndays       = new Date(year, month, 0).getDate();
              const DOW_PL      = ['nd','pn','wt','śr','cz','pt','sb'];
              const FIXED       = [[1,1],[1,6],[5,1],[5,3],[8,15],[11,1],[11,11],[12,25],[12,26]];
              const dayInfos    = [];

              for (let d = 1; d <= ndays; d++) {
                const dt        = new Date(year, month - 1, d);
                const jsDow     = dt.getDay();
                const kodDow    = DOW_PL[jsDow];
                const isWeekend = jsDow === 0 || jsDow === 6;
                const isHoliday = FIXED.some(h => h[0] === month && h[1] === d);
                let status      = isHoliday ? 'Ś' : (isWeekend ? '-' : 'P');
                if (overrideMap.has(d)) status = overrideMap.get(d);
                dayInfos.push({ day: d, kodDow, status });
              }

              // filtrowanie wpisów dla tego pracownika
              const empWds = wds.filter(w => w.emp_id === emp.id);

              // sumy faktyczne
              let allTotalHours = 0, allTotalDays = 0;
              empWds.forEach(w => {
                const num = +w.code;
                if (!isNaN(num)) allTotalHours += num;
                allTotalDays++;
              });

              // pobranie notatki
              db.get(
                'SELECT note FROM notes WHERE emp_id=? AND year=? AND month=?',
                [emp.id, year, month],
                (errN, rowN) => {
                  if (errN) return res.status(500).send(errN.message);
                  const note = rowN ? rowN.note : '';

                  // nazwa miesiąca
                  const monthNames = [
                    'styczeń','luty','marzec','kwiecień','maj','czerwiec',
                    'lipiec','sierpień','wrzesień','październik','listopad','grudzień'
                  ];
                  const monthName = monthNames[month - 1];

                  // i render
                  db.all(
    'SELECT * FROM contracts WHERE emp_id=? ORDER BY start_date DESC',
    [emp.id],
    (errC, contracts) => {
      if (errC) console.error('Błąd ładowania umów:', errC);
      // znajdź umowę obowiązującą w wybranym miesiącu
      const monthStart = `${year}-${String(month).padStart(2,'0')}-01`;
      const monthEnd   = `${year}-${String(month).padStart(2,'0')}-${dayInfos.length}`;
      const currentContract = (contracts||[]).find(c =>
        c.start_date <= monthEnd &&
        (!c.end_date || c.end_date >= monthStart)
      );
      // oblicz normatywną liczbę dni i godzin
      const normativeDays  = dayInfos.filter(d => d.status==='P').length;
      const normativeHours = normativeDays * (currentContract?.daily_norm || emp.daily_norm);

      res.render('card', {
        emp, settings, year, monthName,
        dayInfos, wds, empWds,
        allTotalHours, allTotalDays,
        note,
        contracts,
        currentContract,
        normativeDays,
        normativeHours
      });
    }
  );

                }
              );
            }
          );
        }
      );
    });
  });
});


// POST /settings – zapis ustawień
app.post('/settings', (req, res) => {
  const entries = Object.entries(req.body);
  db.serialize(() => {
    const stmt = db.prepare('REPLACE INTO settings (key,value) VALUES(?,?)');
    entries.forEach(([k, v]) => stmt.run(k, v));
    stmt.finalize(() => res.redirect('/'));
  });
});

// POST /employees – dodaj pracownika
app.post('/employees', (req, res) => {
  const {
    full_name, position, payroll_number, department,
    contract_start, contract_end, contract_daily_norm
  } = req.body;

  const daily = parseFloat(contract_daily_norm) || 8;
  const fte   = daily / 8;

  db.serialize(() => {
    // 1) dodaj pracownika
    db.run(
      `INSERT INTO employees
         (full_name,position,payroll_number,work_time_fte,daily_norm,notes,department)
       VALUES(?,?,?,?,?,?,?);`,
      [full_name, position, payroll_number, fte, daily, '', department],
      function(err) {
        if (err) return res.status(500).send(err.message);
        const empId = this.lastID;
        // 2) utwórz pierwszą umowę
        db.run(
          `INSERT INTO contracts
             (emp_id,start_date,end_date,fte,daily_norm)
           VALUES(?,?,?,?,?);`,
          [empId, contract_start, contract_end || null, fte, daily],
          err2 => {
            if (err2) console.error('Błąd tworzenia umowy:', err2);
            res.redirect(`/?year=${req.query.year||''}&month=${req.query.month||''}`);
          }
        );
      }
    );
  });
});


// POST /api/workday – zapis kodu pracownika
app.post('/api/workday', (req, res) => {
  const { emp_id, year, month, day, code } = req.body;
  const c = (code||'').trim().toLowerCase();
  if (c) {
    db.run(
      `INSERT INTO workdays(emp_id,year,month,day,code)
         VALUES(?,?,?,?,?)
       ON CONFLICT(emp_id,year,month,day) DO UPDATE SET code=excluded.code;`,
      [emp_id, year, month, day, c],
      err => res.json({ ok: !err })
    );
  } else {
    db.run(
      `DELETE FROM workdays WHERE emp_id=? AND year=? AND month=? AND day=?;`,
      [emp_id, year, month, day],
      err => res.json({ ok: !err })
    );
  }
});

// POST /api/calendar-overrides – ustawienie statusu dnia
app.post('/api/calendar-overrides', (req, res) => {
  const { year, month, day, code } = req.body;
  db.run(
    `INSERT INTO calendar_overrides(year,month,day,code)
       VALUES(?,?,?,?)
     ON CONFLICT(year,month,day) DO UPDATE SET code=excluded.code;`,
    [year, month, day, code],
    err => res.json({ ok: !err })
  );
});

// DELETE /api/calendar-overrides – usuń nadpisanie dnia
app.delete('/api/calendar-overrides', (req, res) => {
  const { year, month, day } = req.body;
  db.run(
    `DELETE FROM calendar_overrides WHERE year=? AND month=? AND day=?;`,
    [year, month, day],
    err => res.json({ ok: !err })
  );
});


app.delete('/api/notes', (req, res) => {
  const { emp_id, year, month } = req.body;
  db.run(
    'DELETE FROM notes WHERE emp_id=? AND year=? AND month=?',
    [emp_id, year, month],
    err => res.json({ ok: !err })
  );
});


// PUT /api/employees/:id – edycja pracownika (partial update)
app.put('/api/employees/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM employees WHERE id = ?', [id], (err, existing) => {
    if (err || !existing) return res.json({ ok: false });
    const full_name      = req.body.full_name      ?? existing.full_name;
    const position       = req.body.position       ?? existing.position;
    const payroll_number = req.body.payroll_number ?? existing.payroll_number;
    const daily_norm     = req.body.daily_norm     !== undefined
                             ? parseFloat(req.body.daily_norm)
                             : existing.daily_norm;
    const department     = req.body.department     ?? existing.department;
    const fte            = daily_norm / 8;
    db.run(
      `UPDATE employees
         SET full_name=?, position=?, payroll_number=?, work_time_fte=?, daily_norm=?, department=?
       WHERE id=?;`,
      [full_name, position, payroll_number, fte, daily_norm, department, id],
      err2 => res.json({ ok: !err2 })
    );
  });
});

// DELETE /api/employees/:id – usuń pracownika
app.delete('/api/employees/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM employees WHERE id=?;', [id], err => res.json({ ok: !err }));
});

// POST /api/notes – zapis/aktualizacja uwagi
app.post('/api/notes', (req, res) => {
  const { emp_id, year, month, note } = req.body;
  db.run(
    `INSERT INTO notes(emp_id,year,month,note)
       VALUES(?,?,?,?)
     ON CONFLICT(emp_id,year,month) DO UPDATE SET note=excluded.note;`,
    [emp_id, year, month, note],
    err => res.json({ ok: !err })
  );
});


// --- API Umowy ---
app.get('/api/contracts', (req, res) => {
  const empId = parseInt(req.query.emp_id,10);
  db.all(
    'SELECT * FROM contracts WHERE emp_id=? ORDER BY start_date DESC',
    [empId],
    (err, rows) => {
      if (err) return res.status(500).json({ ok:false, message:err.message });
      res.json({ ok:true, contracts: rows });
    }
  );
});

app.post('/api/contracts', (req, res) => {
  const { emp_id, start_date, end_date, daily_norm } = req.body;
  const daily = parseFloat(daily_norm);
  const fte   = daily / 8;
  db.run(
    `INSERT INTO contracts(emp_id,start_date,end_date,fte,daily_norm)
     VALUES(?,?,?,?,?)`,
    [emp_id, start_date, end_date||null, fte, daily],
    function(err) {
      if (err) return res.status(400).json({ ok:false, message:err.message });
      res.json({ ok:true, id:this.lastID });
    }
  );
});

app.put('/api/contracts/:id', (req, res) => {
  const id = parseInt(req.params.id,10);
  const { start_date, end_date, daily_norm } = req.body;
  const daily = parseFloat(daily_norm);
  const fte   = daily / 8;
  db.run(
    `UPDATE contracts
       SET start_date=?, end_date=?, fte=?, daily_norm=?
     WHERE id=?`,
    [start_date, end_date||null, fte, daily, id],
    err => {
      if (err) return res.status(400).json({ ok:false, message:err.message });
      res.json({ ok:true });
    }
  );
});

app.delete('/api/contracts/:id', (req, res) => {
  const id = parseInt(req.params.id,10);
  db.run(
    'DELETE FROM contracts WHERE id=?',
    [id],
    err => {
      if (err) return res.status(400).json({ ok:false, message:err.message });
      res.json({ ok:true });
    }
  );
});



// Zestawienie kwartalne – tylko Obsługa
app.get('/kw', (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  db.serialize(() => {
    db.all(
      'SELECT id, full_name, department FROM employees ORDER BY full_name',
      [],
      (err1, emps) => {
        if (err1) return res.status(500).send(err1.message);
        // wybieramy tylko Obsługę
        const supportEmps = emps.filter(e => e.department === 'Obsługa');
        db.all(
          'SELECT emp_id, month, code FROM workdays WHERE year=?',
          [year],
          (err2, wds) => {
            if (err2) return res.status(500).send(err2.message);
            res.render('kwartalne', { year, emps: supportEmps, wds });
          }
        );
      }
    );
  });
});


// GET /employees/:id/profile – menu + profil pracownika
app.get('/employees/:id/profile', (req, res) => {
  const selectedId = parseInt(req.params.id, 10);

  // 1) lista wszystkich pracowników
  db.all(
    'SELECT id, full_name, department FROM employees ORDER BY full_name',
    [],
    (err, employees) => {
      if (err) return res.status(500).send(err.message);

      // 2) agregacja absencji (dni nieobecności) po kodach
      db.all(
        `SELECT year, month,
                SUM(CASE WHEN LOWER(code)='l4' THEN 1 ELSE 0 END) AS l4,
                SUM(CASE WHEN LOWER(code)='w'  THEN 1 ELSE 0 END) AS w,
                SUM(CASE WHEN LOWER(code)='nd' THEN 1 ELSE 0 END) AS nd,
                SUM(CASE WHEN LOWER(code)='bz' THEN 1 ELSE 0 END) AS bz,
                SUM(CASE WHEN LOWER(code)='op' THEN 1 ELSE 0 END) AS op,
                SUM(CASE WHEN LOWER(code)='ok' THEN 1 ELSE 0 END) AS ok,
                SUM(CASE WHEN LOWER(code)='sw' THEN 1 ELSE 0 END) AS sw
         FROM workdays
         WHERE emp_id=?
         GROUP BY year,month
         ORDER BY year,month`,
        [selectedId],
        (err5, absSummary) => {
          if (err5) return res.status(500).send(err5.message);

          // 3) brak wybranego pracownika → pusty profil
          if (!selectedId) {
            return res.render('profile_menu', {
            employees,
            selectedId: null,
            emp: null,
            notes: [],
            summary: [],
            absSummary
          });

          }

          // 4) dane wybranego pracownika
          db.get(
            'SELECT * FROM employees WHERE id = ?',
            [selectedId],
            (err2, emp) => {
              if (err2 || !emp) return res.status(404).send('Pracownik nie znaleziony');

              // 5) notatki
              db.all(
                'SELECT year, month, note FROM notes WHERE emp_id=? ORDER BY year,month',
                [selectedId],
                (err3, notes) => {
                  if (err3) return res.status(500).send(err3.message);

                  // 6) podsumowanie miesięczne (godziny, dni pracy)
                  db.all(
                    `SELECT year, month,
                            SUM(CASE WHEN code GLOB '[0-9]*' THEN CAST(code AS INTEGER) ELSE 0 END) AS hours,
                            SUM(CASE WHEN code GLOB '[0-9]*' THEN 1 ELSE 0 END) AS days
                     FROM workdays
                     WHERE emp_id=?
                     GROUP BY year,month
                     ORDER BY year,month`,
                    [selectedId],
                    (err4, summary) => {
                      if (err4) return res.status(500).send(err4.message);

                      // 7) render widoku
                      // … po pobraniu summary i absSummary …
db.all(
  'SELECT * FROM contracts WHERE emp_id=? ORDER BY start_date DESC',
  [selectedId],
  (errC, contracts) => {
    if (errC) console.error('Błąd ładowania umów:', errC);
    res.render('profile_menu', {
      employees,
      selectedId,
      emp,
      notes,
      summary,
      absSummary,
      contracts: contracts || []
    });
  }
);


                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
});


app.listen(process.env.PORT || 3000, () => console.log('Server listening on port 3000'));
