const loginForm = document.getElementById('loginForm');
const adminRegisterForm = document.getElementById('adminRegisterForm');
const loanForm = document.getElementById('loanForm');
const bookRegisterForm = document.getElementById('bookRegisterForm');
const returnForm = document.getElementById('returnForm');
const bookSearchForm = document.getElementById('bookSearchForm');
const bookSearchInput = document.getElementById('bookSearchInput');
const messageBox = document.getElementById('message');
const recordsTableBody = document.querySelector('#recordsTable tbody');
const booksTableBody = document.querySelector('#booksTable tbody');
const refreshButton = document.getElementById('refreshButton');
const exportButton = document.getElementById('exportButton');
const scanButton = document.getElementById('scanButton');
const logoutButton = document.getElementById('logoutButton');
const bookNoInput = document.getElementById('bookNo');
const returnBookInput = document.getElementById('returnBookNo');
const loginPanel = document.getElementById('loginPanel');
const mainPanel = document.getElementById('mainPanel');
const listAllButton = document.getElementById('listAllButton');
const listAvailableButton = document.getElementById('listAvailableButton');
const listLoanedButton = document.getElementById('listLoanedButton');
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');

const AUTH_TOKEN_KEY = 'library_admin_token';
let authToken = localStorage.getItem(AUTH_TOKEN_KEY);
let currentBookFilter = 'all';
let currentBookSearch = '';

function showMessage(text, type = 'info') {
  messageBox.textContent = text;
  messageBox.style.color = type === 'error' ? '#ff9ea3' : '#a3ffd3';
}

function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = authToken;
  return headers;
}

function setLoggedIn(token) {
  authToken = token;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  loginPanel.classList.add('hidden');
  mainPanel.classList.remove('hidden');
  showMessage('Admin logged in. You can manage loans and returns now.');
  fetchRecords();
}

function logoutAdmin() {
  authToken = null;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  mainPanel.classList.add('hidden');
  loginPanel.classList.remove('hidden');
  showMessage('Admin session ended. Please login again.', 'info');
}

async function request(path, options = {}) {
  options.headers = { ...(options.headers || {}), ...getAuthHeaders() };
  const response = await fetch(path, options);
  if (response.status === 401) {
    logoutAdmin();
    throw new Error('Login required.');
  }
  return response;
}

async function loginAdmin(event) {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const username = formData.get('username').trim();
  const password = formData.get('password').trim();
  if (!username || !password) {
    showMessage('Username and password are required.', 'error');
    return;
  }

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Login failed.');
    setLoggedIn(result.token);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function registerAdmin(event) {
  event.preventDefault();
  const formData = new FormData(adminRegisterForm);
  const username = formData.get('username').trim();
  const password = formData.get('password').trim();
  if (!username || !password) {
    showMessage('Username and password are required.', 'error');
    return;
  }

  try {
    const response = await fetch('/api/admin/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Registration failed.');
    showMessage(result.message + ' Please login now.');
    adminRegisterForm.reset();
    showLoginForm();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function showLoginForm() {
  loginForm.classList.remove('hidden');
  adminRegisterForm.classList.add('hidden');
  loginTab.classList.add('active');
  registerTab.classList.remove('active');
}

function showRegisterForm() {
  loginForm.classList.add('hidden');
  adminRegisterForm.classList.remove('hidden');
  loginTab.classList.remove('active');
  registerTab.classList.add('active');
}

function formatDateString(timestamp) {
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '—';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  } catch {
    return '—';
  }
}

async function renderBooksTable(books) {
  booksTableBody.innerHTML = books.length
    ? books.map((book) => `
        <tr>
          <td>${book.title}</td>
          <td>${book.author || '—'}</td>
          <td>${book.bookNo}</td>
          <td>${book.loanedToStudentId ? 'Loaned' : 'Available'}</td>
          <td>${book.loanedAt ? formatDateString(book.loanedAt) : '—'}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="5" class="empty-state">No books found for this filter.</td></tr>';
}

async function fetchBooks(status = 'all', search = '') {
  try {
    const query = new URLSearchParams();
    query.set('status', status);
    if (search) query.set('search', search);

    const response = await request(`/api/books?${query.toString()}`);
    const books = await response.json();
    renderBooksTable(books);
  } catch (error) {
    booksTableBody.innerHTML = '<tr><td colspan="5" class="empty-state">Unable to load book inventory.</td></tr>';
    showMessage(error.message, 'error');
  }
}

async function fetchRecords() {
  try {
    const response = await request('/api/records');
    const records = await response.json();
    recordsTableBody.innerHTML = records.length
      ? records.map(record => `
          <tr>
            <td>${record.studentName}</td>
            <td>${record.rollNo}</td>
            <td>${record.dept}</td>
            <td>${record.bookName}</td>
            <td>${record.bookNo}</td>
            <td>${record.action}</td>
            <td>${formatDateString(record.timestamp)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="7" class="empty-state">No records found yet.</td></tr>';
  } catch (error) {
    recordsTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Unable to load records.</td></tr>';
    showMessage(error.message, 'error');
  }
}

async function submitLoan(event) {
  event.preventDefault();
  const formData = new FormData(loanForm);
  const payload = {
    studentName: formData.get('studentName').trim(),
    rollNo: formData.get('rollNo').trim(),
    dept: formData.get('dept').trim(),
    bookName: formData.get('bookName').trim(),
    bookNo: formData.get('bookNo').trim(),
  };

  try {
    const response = await request('/api/loan', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to issue book.');
    showMessage(result.message);
    loanForm.reset();
    fetchRecords();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function registerBook(event) {
  event.preventDefault();
  const formData = new FormData(bookRegisterForm);
  const payload = {
    title: formData.get('registerTitle').trim(),
    author: formData.get('registerAuthor').trim(),
    bookNo: formData.get('registerBookNo').trim(),
  };

  if (!payload.title || !payload.bookNo) {
    showMessage('Book title and number are required.', 'error');
    return;
  }

  try {
    const response = await request('/api/books', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to register book.');
    showMessage(result.message);
    registerForm.reset();
    fetchBooks(currentBookFilter, currentBookSearch);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function submitReturn(event) {
  event.preventDefault();
  const bookNo = returnBookInput.value.trim();
  if (!bookNo) {
    showMessage('Enter the book number to return.', 'error');
    return;
  }

  try {
    const response = await request('/api/return', {
      method: 'POST',
      body: JSON.stringify({ bookNo })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to return book.');
    showMessage(result.message);
    returnForm.reset();
    fetchRecords();
    fetchBooks(currentBookFilter, currentBookSearch);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function scanBookNumber() {
  showMessage('Scanning active: type or paste the scanned book number into Book Number.', 'info');
  bookNoInput.focus();
}

async function exportExcel() {
  try {
    const response = await request('/api/export');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'library-records.xlsx';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

loginForm.addEventListener('submit', loginAdmin);
adminRegisterForm.addEventListener('submit', registerAdmin);
loanForm.addEventListener('submit', submitLoan);
bookRegisterForm.addEventListener('submit', registerBook);
returnForm.addEventListener('submit', submitReturn);
loginTab.addEventListener('click', showLoginForm);
registerTab.addEventListener('click', showRegisterForm);
bookSearchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  currentBookSearch = bookSearchInput.value.trim();
  fetchBooks(currentBookFilter, currentBookSearch);
});
refreshButton.addEventListener('click', fetchRecords);
exportButton.addEventListener('click', exportExcel);
scanButton.addEventListener('click', scanBookNumber);
logoutButton.addEventListener('click', logoutAdmin);
listAllButton.addEventListener('click', () => {
  currentBookFilter = 'all';
  currentBookSearch = '';
  bookSearchInput.value = '';
  fetchBooks('all');
});
listAvailableButton.addEventListener('click', () => {
  currentBookFilter = 'available';
  fetchBooks('available', currentBookSearch);
});
listLoanedButton.addEventListener('click', () => {
  currentBookFilter = 'loaned';
  fetchBooks('loaned', currentBookSearch);
});

if (authToken) {
  setLoggedIn(authToken);
} else {
  mainPanel.classList.add('hidden');
}
