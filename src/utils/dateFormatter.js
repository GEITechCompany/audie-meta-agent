/**
 * Date formatter utility for the application
 * Provides consistent date formatting across the application
 */

/**
 * Format a date string into a human readable format
 * @param {string|Date} date - Date to format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted date string
 */
function getFormattedDate(date, options = {}) {
  try {
    if (!date) return '';
    
    // Create Date object if string is provided
    const dateObj = date instanceof Date ? date : new Date(date);
    
    // Default options
    const defaultOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    
    // Merge options
    const formatterOptions = { ...defaultOptions, ...options };
    
    return dateObj.toLocaleDateString('en-US', formatterOptions);
  } catch (error) {
    console.error(`Error formatting date: ${error.message}`);
    return '';
  }
}

/**
 * Format a date to YYYY-MM-DD format
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
function getISODate(date) {
  try {
    if (!date) return '';
    
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toISOString().split('T')[0];
  } catch (error) {
    console.error(`Error formatting ISO date: ${error.message}`);
    return '';
  }
}

/**
 * Get formatted time
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted time string
 */
function getFormattedTime(date) {
  try {
    if (!date) return '';
    
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error(`Error formatting time: ${error.message}`);
    return '';
  }
}

/**
 * Get relative time (e.g. "2 days ago", "in 3 hours")
 * @param {string|Date} date - Date to format
 * @returns {string} Relative time string
 */
function getRelativeTime(date) {
  try {
    if (!date) return '';
    
    const dateObj = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const diffTime = dateObj - now;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      // Same day
      const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
      
      if (diffHours === 0) {
        // Less than an hour
        const diffMinutes = Math.floor(diffTime / (1000 * 60));
        
        if (diffMinutes === 0) {
          return 'Just now';
        } else if (diffMinutes > 0) {
          return `In ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
        } else {
          return `${Math.abs(diffMinutes)} minute${Math.abs(diffMinutes) !== 1 ? 's' : ''} ago`;
        }
      } else if (diffHours > 0) {
        return `In ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
      } else {
        return `${Math.abs(diffHours)} hour${Math.abs(diffHours) !== 1 ? 's' : ''} ago`;
      }
    } else if (diffDays > 0) {
      return `In ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    } else {
      return `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago`;
    }
  } catch (error) {
    console.error(`Error formatting relative time: ${error.message}`);
    return '';
  }
}

module.exports = {
  getFormattedDate,
  getISODate,
  getFormattedTime,
  getRelativeTime
}; 