# Backend API - ERC-404 Lottery Project

This repository contains the backend API for the ERC-404 Lottery Project, providing RESTful endpoints for lottery management, entry handling, and automation services.

## 🚀 Features

- **Lottery Management**: Create, manage, and execute lottery rounds
- **Entry Handling**: Process and validate lottery entries
- **Automation Services**: Automated lottery execution and management
- **Database Integration**: PostgreSQL database with comprehensive schema
- **API Endpoints**: RESTful API for frontend integration
- **Testing Suite**: Comprehensive test coverage for all services

## 🛠️ Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Blockchain**: Ethereum/Base Sepolia integration
- **Testing**: Jest testing framework
- **Build Tool**: TypeScript compiler

## 📋 Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
- npm or yarn package manager

## 🔧 Installation

1. **Clone the repository**

   ```bash
   git clone <your-github-repo-url>
   cd backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory:

   ```env
   DATABASE_URL=postgresql://username:password@localhost:5432/lottery_db
   PORT=3001
   NODE_ENV=development
   ```

4. **Database Setup**

   ```bash
   # Run database migrations
   npm run migrate
   ```

5. **Start the server**
   ```bash
   npm run dev
   ```

## 🗄️ Database Schema

The project includes comprehensive database schemas for:

- Lottery rounds and configurations
- User entries and validation
- Winner management
- Application state tracking

## 🧪 Testing

Run the test suite:

```bash
npm test
```

Run all tests:

```bash
npm run test:all
```

## 📚 API Documentation

### Main Endpoints

- `/api/lottery` - Lottery management
- `/api/entries` - Entry handling
- `/api/winners` - Winner management
- `/api/automation` - Automation services

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is part of the ERC-404 Lottery Project.

## 🔗 Related Repositories

- Frontend: [Frontend Repository]
- Smart Contracts: [Smart Contracts Repository]
# backend
# cookie-backend
