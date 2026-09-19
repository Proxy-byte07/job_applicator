# Job Application Tracker — Backend API

A RESTful backend API built with **Node.js**, **Express**, and **MongoDB** (Atlas) that helps job seekers track their job applications through a structured status workflow.

---

## Features

- **Full CRUD** — Create, Read, Update, Delete job applications
- **Status Workflow** — Enforced transitions: Applied → Interview → Offer → Accepted/Rejected
- **Input Validation** — Request-level (express-validator) + schema-level (Mongoose)
- **API Key Authentication** — All `/api/*` routes require `x-api-key` header
- **Filtering & Search** — Filter by status, search by company/job title (case-insensitive)
- **Sorting & Pagination** — Sort by any field, paginate results
- **Dashboard Statistics** — Aggregated counts per status
- **Consistent Response Format** — Every response follows a `{ success, message, data }` envelope
- **Global Error Handling** — Mongoose errors mapped to clean HTTP responses

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MongoDB Atlas (cloud) |
| ODM | Mongoose |
| Validation | express-validator |
| Auth | API Key (x-api-key header) |

---

## Project Structure

```
backend/
├── server.js                              # Entry point
├── package.json
├── .env.example                           # Environment variable template
├── .gitignore
├── README.md
└── src/
    ├── config/
    │   └── db.js                          # MongoDB connection
    ├── models/
    │   └── Application.js                 # Mongoose schema & model
    ├── controllers/
    │   └── applicationController.js       # Business logic & request handlers
    ├── middlewares/
    │   ├── authMiddleware.js              # API key authentication
    │   └── errorHandler.js                # Global error handler
    ├── routes/
    │   └── applicationRoutes.js           # Express router
    └── validators/
        └── applicationValidator.js        # express-validator rules
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **MongoDB Atlas** account ([free tier](https://www.mongodb.com/cloud/atlas/register))

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```
PORT=5000
MONGO_URI=mongodb+srv://youruser:yourpassword@cluster0.xxxxx.mongodb.net/job-tracker?retryWrites=true&w=majority
API_KEY=my-secret-key-123
NODE_ENV=development
```

### 3. Run

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

Server will start on `http://localhost:5000`.

---

## API Endpoints

> **All `/api/*` routes require the `x-api-key` header.**

### Health Check

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/` | No | API health check |

### Applications

| Method | Endpoint | Description | Success Code |
|---|---|---|---|
| `POST` | `/api/applications` | Create a new application | `201` |
| `GET` | `/api/applications` | List all (with filters & pagination) | `200` |
| `GET` | `/api/applications/stats` | Dashboard statistics | `200` |
| `GET` | `/api/applications/:id` | Get one by ID | `200` |
| `PUT` | `/api/applications/:id` | Update an application | `200` |
| `DELETE` | `/api/applications/:id` | Delete an application | `200` |

---

## Request & Response Examples

### Create Application

**Request:**
```
POST /api/applications
Headers: x-api-key: my-secret-key-123
Content-Type: application/json
```
```json
{
  "company": "Google",
  "jobTitle": "Backend Developer",
  "location": "Bangalore, India",
  "notes": "Referred by a friend"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Application created successfully",
  "data": {
    "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "company": "Google",
    "jobTitle": "Backend Developer",
    "location": "Bangalore, India",
    "status": "Applied",
    "notes": "Referred by a friend",
    "appliedDate": "2026-09-19T16:30:00.000Z",
    "createdAt": "2026-09-19T16:30:00.000Z",
    "updatedAt": "2026-09-19T16:30:00.000Z"
  }
}
```

### List with Filters & Pagination

```
GET /api/applications?status=Interview&company=Google&sort=-appliedDate&page=1&limit=5
Headers: x-api-key: my-secret-key-123
```

**Response (200):**
```json
{
  "success": true,
  "count": 2,
  "pagination": {
    "page": 1,
    "limit": 5,
    "totalPages": 1,
    "totalCount": 2
  },
  "data": [ ... ]
}
```

### Update Status (with transition enforcement)

```
PUT /api/applications/64f1a2b3c4d5e6f7a8b9c0d1
Headers: x-api-key: my-secret-key-123
Content-Type: application/json
```
```json
{
  "status": "Interview"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Application updated successfully",
  "data": { ... }
}
```

**Invalid transition (400):**
```json
{
  "success": false,
  "message": "Invalid status transition: cannot move from \"Rejected\" to \"Interview\"",
  "allowedTransitions": "This is a terminal status — no further transitions allowed."
}
```

### Get Statistics

```
GET /api/applications/stats
Headers: x-api-key: my-secret-key-123
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total": 12,
    "statusSummary": {
      "Applied": 4,
      "Interview": 3,
      "Offer": 2,
      "Rejected": 2,
      "Accepted": 1
    },
    "mostRecentApplication": { ... }
  }
}
```

---

## Status Workflow

Applications follow a strict status transition path:

```
Applied  ──→  Interview  ──→  Offer  ──→  Accepted
   │              │              │
   └──→ Rejected  └──→ Rejected  └──→ Rejected
```

- **Applied** → Interview, Rejected
- **Interview** → Offer, Rejected
- **Offer** → Accepted, Rejected
- **Rejected** → *(terminal — no transitions)*
- **Accepted** → *(terminal — no transitions)*

---

## Error Handling

All errors return a consistent JSON envelope:

| Scenario | Status Code | Example Message |
|---|---|---|
| Missing required field | `400` | `Validation failed` (with field-level errors) |
| Invalid ObjectId | `400` | `Invalid _id: abc123` |
| Invalid status transition | `400` | `Cannot move from "Rejected" to "Interview"` |
| Missing API key | `401` | `Unauthorized — API key is missing` |
| Invalid API key | `401` | `Unauthorized — invalid API key` |
| Resource not found | `404` | `Application not found` |
| Route not found | `404` | `Route not found: GET /api/unknown` |
| Duplicate application | `409` | `Duplicate entry — a record with this company, jobTitle already exists` |
| Server error | `500` | `Internal Server Error` |

---

## Validation

Input is validated at two levels:

1. **Request level** — `express-validator` checks field presence, types, lengths, and enum values *before* the controller runs.
2. **Schema level** — Mongoose enforces constraints (required, minlength, maxlength, enum) as a safety net during `.save()`.

---

## How Data Flows Through the System

```
Client Request
      │
      ▼
  [CORS + JSON Parser]          ← Global middleware
      │
      ▼
  [API Key Auth]                 ← authMiddleware.js
      │
      ▼
  [Express Router]               ← applicationRoutes.js
      │
      ▼
  [Validation Middleware]        ← applicationValidator.js
      │
      ▼
  [Controller / Business Logic]  ← applicationController.js
      │
      ▼
  [Mongoose Model ↔ MongoDB]    ← Application.js ↔ Atlas
      │
      ▼
  [JSON Response]                ← Consistent { success, message, data }
      │
      ▼
  [Error Handler]                ← errorHandler.js (if any error occurred)
```

---

## License

ISC
