const { getDatabase } = require('../database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class RefreshToken {
  constructor(data = {}) {
    this.id = data.id || null;
    this.token = data.token || uuidv4(); // Generate new token if not provided
    this.user_id = data.user_id || null;
    this.expires_at = data.expires_at || null;
    this.revoked = data.revoked || false;
    this.created_at = data.created_at || new Date().toISOString();
  }

  // Save token to database
  async save() {
    const db = getDatabase();
    
    if (this.id) {
      // Update existing token
      return new Promise((resolve, reject) => {
        const query = `
          UPDATE refresh_tokens 
          SET token = ?, user_id = ?, expires_at = ?, revoked = ?
          WHERE id = ?
        `;
        
        db.run(
          query, 
          [
            this.token,
            this.user_id,
            this.expires_at,
            this.revoked ? 1 : 0,
            this.id
          ],
          function(err) {
            if (err) {
              logger.error(`Error updating refresh token: ${err.message}`);
              reject(err);
            } else {
              logger.info(`RefreshToken ${this.id} updated successfully`);
              resolve(new RefreshToken({ ...this }));
            }
          }
        );
      });
    } else {
      // Insert new token
      return new Promise((resolve, reject) => {
        const query = `
          INSERT INTO refresh_tokens 
          (token, user_id, expires_at, revoked)
          VALUES (?, ?, ?, ?)
        `;
        
        db.run(
          query,
          [
            this.token,
            this.user_id,
            this.expires_at,
            this.revoked ? 1 : 0
          ],
          function(err) {
            if (err) {
              logger.error(`Error creating refresh token: ${err.message}`);
              reject(err);
            } else {
              const tokenId = this.lastID;
              logger.info(`RefreshToken created with ID: ${tokenId}`);
              resolve(new RefreshToken({ ...this, id: tokenId }));
            }
          }
        );
      });
    }
  }

  // Find token by token value
  static async findByToken(token) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM refresh_tokens WHERE token = ?';
      
      db.get(query, [token], (err, row) => {
        if (err) {
          logger.error(`Error finding refresh token: ${err.message}`);
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(new RefreshToken({
            ...row,
            revoked: !!row.revoked // Convert to boolean
          }));
        }
      });
    });
  }

  // Find tokens by user ID
  static async findByUserId(userId) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM refresh_tokens WHERE user_id = ?';
      
      db.all(query, [userId], (err, rows) => {
        if (err) {
          logger.error(`Error finding tokens by user ID: ${err.message}`);
          reject(err);
        } else {
          const tokens = rows.map(row => new RefreshToken({
            ...row,
            revoked: !!row.revoked // Convert to boolean
          }));
          resolve(tokens);
        }
      });
    });
  }

  // Revoke token
  async revoke() {
    this.revoked = true;
    return this.save();
  }

  // Revoke all user tokens
  static async revokeAllUserTokens(userId) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?';
      
      db.run(query, [userId], function(err) {
        if (err) {
          logger.error(`Error revoking user tokens: ${err.message}`);
          reject(err);
        } else {
          logger.info(`Revoked ${this.changes} tokens for user ${userId}`);
          resolve({ revoked: this.changes });
        }
      });
    });
  }

  // Clean expired tokens
  static async cleanExpiredTokens() {
    const db = getDatabase();
    const now = new Date().toISOString();
    
    return new Promise((resolve, reject) => {
      const query = 'DELETE FROM refresh_tokens WHERE expires_at < ?';
      
      db.run(query, [now], function(err) {
        if (err) {
          logger.error(`Error cleaning expired tokens: ${err.message}`);
          reject(err);
        } else {
          logger.info(`Cleaned ${this.changes} expired tokens`);
          resolve({ cleaned: this.changes });
        }
      });
    });
  }

  // Check if token is expired
  isExpired() {
    if (this.expires_at) {
      const now = new Date();
      const expiryDate = new Date(this.expires_at);
      return now > expiryDate;
    }
    return true; // If no expiry date, consider it expired
  }

  // Check if token is valid (not revoked and not expired)
  isValid() {
    return !this.revoked && !this.isExpired();
  }
}

module.exports = RefreshToken; 