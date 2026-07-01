const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const xlsx = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'library.db');
const AUTH_SECRET = process.env.AUTH_SECRET || 'library-secret-2026';

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Failed to open database:', err);
    process.exit(1);
  }
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function columnExists(table, column) {
  const rows = await all(`PRAGMA table_info(${table})`);
  return rows.some((row) => row.name === column);
}

async function initDb() {
  await run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rollNo TEXT NOT NULL UNIQUE,
    dept TEXT NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT,
    bookNo TEXT NOT NULL UNIQUE,
    loanedToStudentId INTEGER,
    loanedAt TEXT,
    FOREIGN KEY (loanedToStudentId) REFERENCES students(id)
  )`);

  if (!(await columnExists('books', 'author'))) {
    await run('ALTER TABLE books ADD COLUMN author TEXT');
  }

  await run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    passwordSalt TEXT NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    studentId INTEGER NOT NULL,
    bookId INTEGER NOT NULL,
    action TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (studentId) REFERENCES students(id),
    FOREIGN KEY (bookId) REFERENCES books(id)
  )`);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return hash === expectedHash;
}

function createAuthToken(username) {
  const timestamp = Date.now().toString();
  const hmac = crypto.createHmac('sha256', AUTH_SECRET);
  hmac.update(`${username}:${timestamp}`);
  return `Bearer ${username}:${timestamp}:${hmac.digest('hex')}`;
}

function parseAuthToken(token) {
  if (!token || !token.startsWith('Bearer ')) {
    return null;
  }

  const payload = token.slice(7).split(':');
  if (payload.length !== 3) {
    return null;
  }

  const [username, timestamp, signature] = payload;
  if (!username || !timestamp || !signature) {
    return null;
  }

  const age = Date.now() - Number(timestamp);
  if (Number.isNaN(age) || age > 24 * 60 * 60 * 1000) {
    return null;
  }

  const hmac = crypto.createHmac('sha256', AUTH_SECRET);
  hmac.update(`${username}:${timestamp}`);
  if (hmac.digest('hex') !== signature) {
    return null;
  }

  return { username };
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const parsed = parseAuthToken(auth.trim());
  if (!parsed) {
    return res.status(401).json({ error: 'Unauthorized - valid token required.' });
  }
  next();
}

app.use('/api', (req, res, next) => {
  if (req.path === '/admin/login' || req.path === '/admin/register') return next();
  requireAdmin(req, res, next);
});

app.post('/api/admin/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const existing = await all('SELECT id FROM admins');
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Admin already exists. Please login.' });
    }

    const { salt, hash } = hashPassword(password);
    await run('INSERT INTO admins (username, passwordHash, passwordSalt) VALUES (?, ?, ?)', [username.trim(), hash, salt]);
    res.json({ success: true, message: 'Admin registered successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const admins = await all('SELECT * FROM admins WHERE username = ?', [username.trim()]);
    if (!admins.length) {
      return res.status(401).json({ error: 'Invalid login credentials.' });
    }

    const admin = admins[0];
    if (!verifyPassword(password, admin.passwordSalt, admin.passwordHash)) {
      return res.status(401).json({ error: 'Invalid login credentials.' });
    }

    const token = createAuthToken(admin.username);
    res.json({ token, message: 'Admin login successful.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/books', async (req, res) => {
  try {
    const status = (req.query.status || 'all').toLowerCase();
    const search = (req.query.search || '').trim();
    const conditions = [];
    const params = [];

    if (status === 'available') {
      conditions.push('loanedToStudentId IS NULL');
    } else if (status === 'loaned') {
      conditions.push('loanedToStudentId IS NOT NULL');
    }

    if (search) {
      conditions.push('(title LIKE ? OR author LIKE ? OR bookNo LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const books = await all(`
      SELECT id, title, author, bookNo, loanedToStudentId, loanedAt
      FROM books
      ${where}
      ORDER BY title COLLATE NOCASE ASC
    `, params);
    res.json(books);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/books', async (req, res) => {
  const { title, author, bookNo } = req.body;
  if (!title || !bookNo) {
    return res.status(400).json({ error: 'Title and book number are required.' });
  }

  try {
    await run(
      'INSERT INTO books (title, author, bookNo) VALUES (?, ?, ?)',
      [title.trim(), author ? author.trim() : '', bookNo.trim()]
    );
    res.json({ success: true, message: 'Book registered successfully.' });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'A book with this number already exists.' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/records', async (req, res) => {
  try {
    const records = await all(`
      SELECT
        loans.id AS loanId,
        students.name AS studentName,
        students.rollNo,
        students.dept,
        books.title AS bookName,
        books.bookNo,
        books.loanedAt,
        loans.action,
        loans.timestamp
      FROM loans
      JOIN students ON loans.studentId = students.id
      JOIN books ON loans.bookId = books.id
      ORDER BY loans.timestamp DESC
    `);
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/loan', async (req, res) => {
  const { studentName, rollNo, dept, bookName, bookNo } = req.body;
  if (!studentName || !rollNo || !dept || !bookName || !bookNo) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    let student = await all('SELECT * FROM students WHERE rollNo = ?', [rollNo]);
    if (!student.length) {
      const createdStudent = await run(
        'INSERT INTO students (name, rollNo, dept) VALUES (?, ?, ?)',
        [studentName.trim(), rollNo.trim(), dept.trim()]
      );
      student = [{ id: createdStudent.lastID, name: studentName.trim(), rollNo: rollNo.trim(), dept: dept.trim() }];
    }

    const studentId = student[0].id;

    let books = await all('SELECT * FROM books WHERE bookNo = ?', [bookNo.trim()]);
    if (!books.length) {
      const createdBook = await run(
        'INSERT INTO books (title, bookNo, loanedToStudentId, loanedAt) VALUES (?, ?, ?, ?)',
        [bookName.trim(), bookNo.trim(), studentId, new Date().toISOString()]
      );
      books = [{ id: createdBook.lastID, title: bookName.trim(), bookNo: bookNo.trim(), loanedToStudentId: studentId }];
    } else {
      const book = books[0];
      if (book.loanedToStudentId) {
        return res.status(400).json({ error: 'This book is already loaned. Return it before issuing again.' });
      }
      await run('UPDATE books SET loanedToStudentId = ?, loanedAt = ? WHERE id = ?', [studentId, new Date().toISOString(), book.id]);
    }

    const bookId = books[0].id;
    await run(
      'INSERT INTO loans (studentId, bookId, action, timestamp) VALUES (?, ?, ?, ?)',
      [studentId, bookId, 'Loaned', new Date().toISOString()]
    );

    res.json({ success: true, message: 'Book issued successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/return', async (req, res) => {
  const { bookNo } = req.body;
  if (!bookNo) {
    return res.status(400).json({ error: 'Book number is required to return.' });
  }

  try {
    const books = await all('SELECT * FROM books WHERE bookNo = ?', [bookNo.trim()]);
    if (!books.length) {
      return res.status(404).json({ error: 'Book number not found.' });
    }

    const book = books[0];
    if (!book.loanedToStudentId) {
      return res.status(400).json({ error: 'Book is not currently loaned.' });
    }

    const studentId = book.loanedToStudentId;
    await run('UPDATE books SET loanedToStudentId = NULL, loanedAt = NULL WHERE id = ?', [book.id]);
    await run(
      'INSERT INTO loans (studentId, bookId, action, timestamp) VALUES (?, ?, ?, ?)',
      [studentId, book.id, 'Returned', new Date().toISOString()]
    );

    res.json({ success: true, message: 'Book returned successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/export', async (req, res) => {
  try {
    const records = await all(`
      SELECT
        students.name AS studentName,
        students.rollNo,
        students.dept,
        books.title AS bookName,
        books.bookNo,
        books.loanedAt,
        loans.action,
        loans.timestamp
      FROM loans
      JOIN students ON loans.studentId = students.id
      JOIN books ON loans.bookId = books.id
      ORDER BY loans.timestamp DESC
    `);

    const worksheet = xlsx.utils.json_to_sheet(records.map((record) => ({
      Student: record.studentName,
      RollNo: record.rollNo,
      Department: record.dept,
      Book: record.bookName,
      BookNumber: record.bookNo,
      Action: record.action,
      RecordedAt: record.timestamp
    })));
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'LibraryRecords');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="library-records.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Library management server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });
