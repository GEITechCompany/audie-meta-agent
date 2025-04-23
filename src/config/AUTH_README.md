# Authentication System Documentation

## Overview

The Audie Meta-Agent includes a secure JWT-based authentication system that protects API endpoints while maintaining the existing API structure and error handling patterns. This system provides:

- User authentication with JWT tokens
- Refresh token mechanism for extended sessions
- Role-based access control (admin and user roles)
- Secure password storage with bcrypt
- Rate limiting protection against brute force attacks
- Account locking after multiple failed login attempts

## Setup

1. Configure environment variables:
   ```
   # JWT Authentication
   JWT_SECRET=your-super-secure-jwt-secret-key
   ACCESS_TOKEN_EXPIRY=15m
   REFRESH_TOKEN_EXPIRY=7d
   
   # Admin User (used by setup:admin script)
   ADMIN_USERNAME=admin
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=Admin123!
   ADMIN_FIRST_NAME=Admin
   ADMIN_LAST_NAME=User
   ```
   
2. Create the initial admin user:
   ```
   npm run setup:admin
   ```

## Authentication Flow

1. **Registration**: Create a new user account
   - Endpoint: `POST /api/auth/register`
   - Request Body:
     ```json
     {
       "username": "username",
       "email": "user@example.com",
       "password": "password",
       "first_name": "First",
       "last_name": "Last"
     }
     ```
   - Response:
     ```json
     {
       "success": true,
       "message": "User registered successfully",
       "data": {
         "user": {
           "id": 1,
           "username": "username",
           "email": "user@example.com",
           "first_name": "First",
           "last_name": "Last",
           "role": "user"
         },
         "tokens": {
           "access": "jwt-access-token",
           "refresh": "refresh-token-uuid"
         }
       }
     }
     ```

2. **Login**: Authenticate and get tokens
   - Endpoint: `POST /api/auth/login`
   - Request Body:
     ```json
     {
       "username": "username",
       "password": "password"
     }
     ```
   - Response: Same as register response

3. **Using Access Token**: Include in request header
   ```
   Authorization: Bearer jwt-access-token
   ```

4. **Refresh Token**: Get new tokens when access token expires
   - Endpoint: `POST /api/auth/refresh-token`
   - Request Body:
     ```json
     {
       "refreshToken": "refresh-token-uuid"
     }
     ```
   - Response:
     ```json
     {
       "success": true,
       "message": "Token refreshed successfully",
       "data": {
         "tokens": {
           "access": "new-jwt-access-token",
           "refresh": "new-refresh-token-uuid"
         }
       }
     }
     ```

5. **Logout**: Invalidate the refresh token
   - Endpoint: `POST /api/auth/logout`
   - Request Body:
     ```json
     {
       "refreshToken": "refresh-token-uuid"
     }
     ```
   - Response:
     ```json
     {
       "success": true,
       "message": "Logged out successfully"
     }
     ```

## User Management

### Get Current User Profile
- Endpoint: `GET /api/auth/profile`
- Authentication: Required
- Response:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": 1,
        "username": "username",
        "email": "user@example.com",
        "first_name": "First",
        "last_name": "Last",
        "role": "user"
      }
    }
  }
  ```

### Get All Users (Admin Only)
- Endpoint: `GET /api/users`
- Authentication: Required with admin role
- Response:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 1,
        "username": "admin",
        "email": "admin@example.com",
        "first_name": "Admin",
        "last_name": "User",
        "role": "admin"
      },
      {
        "id": 2,
        "username": "user",
        "email": "user@example.com",
        "first_name": "Regular",
        "last_name": "User",
        "role": "user"
      }
    ]
  }
  ```

### Get User by ID (Admin Only)
- Endpoint: `GET /api/users/:id`
- Authentication: Required with admin role
- Response:
  ```json
  {
    "success": true,
    "data": {
      "id": 1,
      "username": "username",
      "email": "user@example.com",
      "first_name": "First",
      "last_name": "Last",
      "role": "user"
    }
  }
  ```

### Update User (Admin Only)
- Endpoint: `PUT /api/users/:id`
- Authentication: Required with admin role
- Request Body:
  ```json
  {
    "first_name": "Updated",
    "last_name": "Name",
    "role": "admin"
  }
  ```
- Response:
  ```json
  {
    "success": true,
    "message": "User updated successfully",
    "data": {
      "id": 1,
      "username": "username",
      "email": "user@example.com",
      "first_name": "Updated",
      "last_name": "Name",
      "role": "admin"
    }
  }
  ```

### Delete User (Admin Only)
- Endpoint: `DELETE /api/users/:id`
- Authentication: Required with admin role
- Response:
  ```json
  {
    "success": true,
    "message": "User deleted successfully"
  }
  ```

## Security Features

### Password Security
- Passwords are hashed using bcrypt with a cost factor of 12
- Password complexity requirements: 8+ characters

### Rate Limiting
- `authLimiter`: 10 requests per 15 minutes for authentication endpoints
- `apiLimiter`: 100 requests per 15 minutes for general API endpoints
- `criticalLimiter`: 5 requests per hour for highly sensitive operations

### Account Locking
- Accounts are locked for 30 minutes after 5 failed login attempts
- Admin users can reset locked accounts

### Token Management
- Access tokens expire after 15 minutes (configurable)
- Refresh tokens expire after 7 days (configurable)
- Expired tokens are automatically cleaned up by a daily scheduled job
- Refresh tokens are stored securely in the database with UUID values

## Architecture

The authentication system is composed of the following components:

1. **Models**:
   - `User`: User management with bcrypt password hashing
   - `RefreshToken`: Refresh token management with expiry handling

2. **Services**:
   - `AuthService`: JWT token generation, verification, and user authentication

3. **Middleware**:
   - `authMiddleware`: JWT authentication and role-based authorization
   - `rateLimitMiddleware`: Rate limiting against brute force attacks

4. **Controllers**:
   - `AuthController`: Handling user registration, login, token refresh, and logout

5. **Routes**:
   - `/api/auth/*`: Authentication endpoints
   - `/api/users/*`: User management endpoints (admin only) 