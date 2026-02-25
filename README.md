# 🚀 Backend MikroORM MongoDB (NestJS)

Backend API built with **NestJS + MikroORM + MongoDB + JWT Authentication**.

This project provides a clean and scalable architecture suitable for production-ready backend systems.

---

## 🧱 Tech Stack

- ⚡ NestJS
- 🗄 MikroORM
- 🍃 MongoDB
- 🔐 JWT Authentication
- 📦 Yarn
- 🐳 Docker (MongoDB)
- ☁️ Cloud Upload (ready)

---

## 📁 Project Structure

```
src
 ├── common
 │    ├── base
 │    │     ├── base.entity.ts
 │    │     └── base.repository.ts
 │    ├── filters
 │    │     └── http-exception.filter.ts
 │    └── pagination
 │          └── pagination.dto.ts
 │
 ├── config
 │    └── mikro-orm.config.ts
 │
 ├── modules
 │    ├── auth
 │    ├── users
 │    └── upload
 │
 ├── app.module.ts
 └── main.ts
```

---

## ⚙️ Requirements

- Node.js >= 18
- Yarn
- MongoDB

---

## 🔧 Installation

Clone project:

```bash
git clone https://github.com/fega-kt/backend-mikroorm.git
cd backend-mikroorm
```

Install dependencies:

```bash
yarn install
```

---

## 🔐 Environment Setup

Create `.env` file:

```bash
cp .env.example .env
```

Example:

```
PORT=3000
MONGO_URI=mongodb://localhost:27017/nestdb
JWT_SECRET=secret
```

---

## 🐳 Run MongoDB with Docker

```bash
docker run -d -p 27017:27017 mongo
```

---

## ▶️ Run Application

Development mode:

```bash
yarn start:dev
```

Application running at:

```
http://localhost:3000
```

---

## 🔑 Authentication API

### Register

```
POST /auth/register
```

Body:

```json
{
  "email": "test@gmail.com",
  "password": "123456"
}
```

---

### Login

```
POST /auth/login
```

Response:

```json
{
  "accessToken": "JWT_TOKEN"
}
```

---

## 🧩 Features

✅ JWT Authentication
✅ Modular Architecture
✅ Base Repository Pattern
✅ Pagination Support
✅ Global Exception Filter
✅ MongoDB ORM (MikroORM)

---

## 📦 Future Improvements

- Refresh Token
- Role Permission (RBAC)
- Cloudflare R2 Upload
- Logger System
- API Documentation (Swagger)

---

## 👨‍💻 Author

Fega KT

---

## 📄 License

MIT
