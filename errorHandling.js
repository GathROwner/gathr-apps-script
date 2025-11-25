// errorHandling.gs

/**
 * Enum for log levels
 * @enum {string}
 */
const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

/**
 * Logs a message with the specified log level.
 * @param {LogLevel} level - The log level of the message.
 * @param {string} message - The message to log.
 * @param {Object=} data - Optional data to include in the log.
 */
function logMessage(level, message, data = null) {
  const timestamp = new Date().toISOString();
  let logString = `${timestamp} [${level}] ${message}`;
  
  if (data) {
    logString += ` - ${JSON.stringify(data)}`;
  }
  
  console.log(logString);
  
  // Optionally, you can log to a spreadsheet or external logging service here
  // For example:
  // appendToLogSheet(timestamp, level, message, data);
}

/**
 * Handles an error by logging it and optionally performing additional actions.
 * @param {string} functionName - The name of the function where the error occurred.
 * @param {Error} error - The error object.
 */
function handleError(functionName, error) {
  logMessage(LogLevel.ERROR, `Error in ${functionName}: ${error.message}`, { stack: error.stack });
  
  // You can add more error handling logic here, such as:
  // - Sending email notifications for critical errors
  // - Updating a status sheet to indicate a failure
  // - Retrying the operation (with caution to avoid infinite loops)
}

/**
 * Wraps a function with error handling.
 * @param {Function} fn - The function to wrap.
 * @param {string} functionName - The name of the function (for logging purposes).
 * @return {Function} The wrapped function.
 */
function withErrorHandling(fn, functionName) {
  return function(...args) {
    try {
      return fn.apply(this, args);
    } catch (error) {
      handleError(functionName, error);
      throw error; // Re-throw the error after handling
    }
  };
}

/**
 * Retries a function multiple times before giving up.
 * @param {Function} fn - The function to retry.
 * @param {number} maxRetries - The maximum number of retry attempts.
 * @param {number} delay - The delay between retries in milliseconds.
 * @return {Function} The wrapped function with retry logic.
 */
function withRetry(fn, maxRetries = 3, delay = 1000) {
  return function(...args) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return fn.apply(this, args);
      } catch (error) {
        if (attempt === maxRetries) {
          throw error; // Rethrow the error if we've exhausted all retries
        }
        logMessage(LogLevel.WARN, `Attempt ${attempt} failed, retrying...`, { error: error.message });
        Utilities.sleep(delay * attempt); // Exponential backoff
      }
    }
  };
}

// Example usage:
// const safeFunction = withErrorHandling(someRiskyFunction, 'someRiskyFunction');
// const safeFunctionWithRetry = withRetry(withErrorHandling(someRiskyFunction, 'someRiskyFunction'));