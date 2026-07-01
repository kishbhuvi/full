# College Library Management System

A fullstack library management web app for college use.

## Features

- Admin login and registration using username/password
- Register books with title, author, and book number
- Issue books to students with name, roll number, and department
- Return books by book number
- View loan history and book inventory
- Filter inventory by all books, available books, and loaned books
- Search books by title, author, or book number
- Export loan history to Excel

## Installation

```bash
cd c:\Users\KISHORE\Desktop\fullstack
npm install
```

## Run

```bash
npm start
```

Open `http://localhost:3000` in your browser.

## Admin setup

The app supports registering the first admin account directly from the login page.

To use the app:

1. Open the app in a browser.
2. On the admin portal page, choose Register.
3. Create an admin username and password.
4. Use those credentials to log in.

No additional setup is required for admin login.

## Project structure

- `server.js` - backend server, database logic, and admin auth
- `package.json` - dependencies and scripts
- `public/index.html` - frontend page structure
- `public/styles.css` - app styling
- `public/app.js` - frontend JavaScript for UI and API calls
- `library.db` - SQLite database file generated at runtime

## Notes

- Admin login stores a token in browser local storage
- Book registration and loan operations are protected behind admin auth
- To reset admin credentials, delete `library.db` and restart the app
