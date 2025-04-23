# API Security Enhancements

This document outlines the security enhancements made to the API endpoints, including authentication middleware, user-specific data filtering, and ownership checks.

## Overview of Changes

The following security enhancements have been implemented:

1. **Authentication Middleware**: All sensitive routes are now protected with JWT authentication.
2. **User-Specific Data Filtering**: Data is filtered based on the authenticated user.
3. **Ownership Checks**: CRUD operations on resources are restricted to owners and admins.
4. **Consistent Error Handling**: API responses maintain a consistent format for authentication errors.
5. **Input Validation**: Request validation prevents injection attacks and ensures data integrity.

## Database Migration

A migration script has been added to support user ownership of tasks. To run the migration:

```bash
npm run migrate:add-user-id
```

This script:
- Adds a `user_id` column to the `tasks` table
- Creates a foreign key relationship to the `users` table
- Sets existing tasks to be owned by the admin user (ID 1)
- Creates an index on `user_id` for performance

## Authentication

All sensitive routes require a valid JWT token provided in the Authorization header:

```
Authorization: Bearer your-jwt-token
```

Authentication errors return consistent responses:

```json
{
  "success": false,
  "error": "auth_required",
  "message": "Authentication required"
}
```

## User-Specific Data Filtering

Data is filtered based on the authenticated user:

1. **Regular Users**: Can only access their own data.
2. **Admin Users**: Can access all data.

Example: When a user requests `/api/tasks`, they only see tasks they own.

## Ownership Checks

Resource operations (view, edit, delete) include ownership checks:

1. **View Resource**: Users can only view resources they own (admins can view all).
2. **Edit Resource**: Users can only edit resources they own (admins can edit all).
3. **Delete Resource**: Users can only delete resources they own (admins can delete all).

Unauthorized attempts return:

```json
{
  "success": false,
  "error": "forbidden",
  "message": "You do not have permission to access this resource"
}
```

## Role-Based Access Control

Certain routes are restricted to specific roles:

1. **Admin Routes**: `/api/clients`, `/api/estimates`, `/api/invoices`
2. **User Routes**: `/api/tasks` (with ownership filtering)

## Implementation Details

### Task Model Enhancements

The Task model has been enhanced with:

1. `user_id` field to track ownership
2. `findByIdAndUserId` method for ownership checks
3. `findAllForUser` method for user-specific filtering
4. `canUserAccessTask` method to verify access rights
5. `deleteWithOwnershipCheck` method for secure deletion

### API Route Security

All API routes now:

1. Verify authentication with the `authenticate` middleware
2. Implement user-specific data filtering
3. Perform ownership checks for CRUD operations
4. Use consistent error handling from `responseUtil`
5. Validate input with validation middleware

## Testing Secure Endpoints

To test the secure endpoints:

1. Register or login to get a JWT token:
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username": "your-username", "password": "your-password"}'
   ```

2. Use the token in requests:
   ```bash
   curl -X GET http://localhost:3000/api/tasks \
     -H "Authorization: Bearer your-jwt-token"
   ```

3. Create a task (owned by the authenticated user):
   ```bash
   curl -X POST http://localhost:3000/api/tasks \
     -H "Authorization: Bearer your-jwt-token" \
     -H "Content-Type: application/json" \
     -d '{"title": "Test Task", "description": "Test Description"}'
   ```

## Common Security Patterns

These patterns have been implemented throughout the codebase:

1. **Authentication Check**:
   ```javascript
   router.use(authenticate);
   ```

2. **Ownership Check**:
   ```javascript
   const task = await Task.findByIdAndUserId(taskId, userId);
   if (!task) {
     return notFoundResponse(res, 'Task not found or access denied');
   }
   ```

3. **Role-Based Access**:
   ```javascript
   router.use('/admin-route', hasRole(['admin']));
   ```

4. **User-Specific Filtering**:
   ```javascript
   const tasks = await Task.findAllForUser(req.user.id, filters);
   ```

5. **Consistent Error Handling**:
   ```javascript
   errorResponse(res, 'Unauthorized access', 403, 'forbidden');
   ``` 