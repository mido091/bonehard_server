/**
 * @file env.js
 * @description Centralized environment variable validation and parsing.
 *
 * This module validates all required env vars at startup.
 * If any required variable is missing or has an unsafe value,
 * the server throws immediately (fail-fast behavior) to prevent
 * silent misconfigurations in production.
 *
 * Exports:
 *  - `env`           — Validated, typed config object
 *  - `isProduction`  — Boolean shorthand for NODE_ENV === 'production'
 *  - `isDevelopment` — Boolean shorthand for NODE_ENV === 'development'
 */

import dotenv from 'dotenv';

// Load the .env file into process.env without noisy startup logs.
dotenv.config({ quiet: true });

/**
 * Reads a required environment variable. Throws if:
 *  - The variable is not set or is empty
 *  - Its trimmed length is less than `minLength` (for secrets like JWT_SECRET)
 *  - Its value is in the `disallow` list (for obvious placeholder values)
 *
 * @param {string}   name            - Environment variable name
 * @param {object}   [options]
 * @param {number}   [options.minLength=1] - Minimum acceptable length
 * @param {string[]} [options.disallow=[]] - Forbidden values (e.g. 'secret', 'changeme')
 * @returns {string} The raw string value
 * @throws {Error} If the variable is missing, too short, or disallowed
 */
const required = (name, { minLength = 1, disallow = [] } = {}) => {
  const value = process.env[name];
  if (!value || `${value}`.trim().length < minLength) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  if (disallow.includes(value)) {
    throw new Error(`Unsafe environment variable value detected for: ${name}`);
  }

  return value;
};

/**
 * Reads an optional environment variable.
 * Returns `fallback` if the variable is not set or is empty.
 *
 * @param {string} name     - Environment variable name
 * @param {string} fallback - Value to use if the variable is missing
 * @returns {string}
 */
const optional = (name, fallback = '') => {
  const value = process.env[name];
  if (value === undefined || value === null || `${value}`.trim() === '') {
    return fallback;
  }

  return `${value}`.trim();
};

/**
 * Reads the first available required environment variable from a list of aliases.
 * This keeps the app compatible with common DB naming conventions such as
 * DB_USER/DB_NAME and DB_USERNAME/DB_DATABASE.
 *
 * @param {string[]} names - Ordered list of accepted environment variable names
 * @param {object} [options] - Same validation options accepted by required()
 * @returns {string}
 */
const requiredOneOf = (names, options = {}) => {
  for (const name of names) {
    const value = process.env[name];
    if (value && `${value}`.trim() !== '') {
      return required(name, options);
    }
  }

  throw new Error(`Missing required environment variable. Accepted names: ${names.join(', ')}`);
};

/**
 * Parses the FRONTEND_URL environment variable into an array of normalized origins.
 * FRONTEND_URL can be a comma-separated list (e.g. "https://app.vercel.app,https://custom.com").
 * Falls back to localhost if not configured (safe for development).
 *
 * @returns {string[]} Array of normalized origin URLs (no trailing slashes)
 */
const parseFrontendOrigins = () => {
  const configured = process.env.FRONTEND_URL;
  if (!configured) {
    return ['http://localhost:5173', 'http://127.0.0.1:5173'];
  }

  return configured
    .split(',')
    .map((origin) => origin.trim())
    .map((origin) => origin.replace(/\/+$/, ''))  // Normalize trailing slashes
    .filter(Boolean);                               // Remove empty strings
};

/**
 * Validated application configuration.
 * All values are guaranteed to be present and safe at module load time.
 *
 * @type {object}
 * @property {string}   nodeEnv           - Current runtime environment ('development' | 'production')
 * @property {number}   port              - HTTP server port
 * @property {string}   jwtSecret         - Secret used to sign/verify JWT tokens (min 24 chars)
 * @property {string}   dbHost            - MySQL host
 * @property {string}   dbUser            - MySQL username
 * @property {string}   dbPassword        - MySQL password
 * @property {string}   dbName            - MySQL database name
 * @property {number}   dbPort            - MySQL port (default 3306)
 * @property {string}   cloudinaryName    - Cloudinary cloud name for image hosting
 * @property {string}   cloudinaryApiKey  - Cloudinary API key
 * @property {string}   cloudinaryApiSecret - Cloudinary API secret
 * @property {string[]} frontendOrigins   - Allowed CORS origins
 */
export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),

  // JWT secret must be at least 24 characters and must not be a placeholder
  jwtSecret: required('JWT_SECRET', {
    minLength: 24,
    disallow: ['secret', 'changeme', 'jwt_secret']
  }),

  // Database credentials (all required)
  dbHost: required('DB_HOST'),
  dbUser: requiredOneOf(['DB_USER', 'DB_USERNAME']),
  dbPassword: required('DB_PASSWORD'),
  dbName: requiredOneOf(['DB_NAME', 'DB_DATABASE']),
  dbPort: Number(process.env.DB_PORT || 3306),



  // Supabase Storage credentials
  supabaseUrl: optional('SUPABASE_URL', ''),
  supabaseSecretKey: optional('SUPABASE_SECRET_KEY', ''),

  // Cloudinary credentials. Legacy aliases are supported because older .env files used CLD_NAME/API_KEY/API_SECRET.
  cloudinaryName: optional('CLOUDINARY_CLOUD_NAME', optional('CLD_NAME', '')),
  cloudinaryApiKey: optional('CLOUDINARY_API_KEY', optional('API_KEY', '')),
  cloudinaryApiSecret: optional('CLOUDINARY_API_SECRET', optional('API_SECRET', '')),

  // SMTP settings for contact form notifications. EMAIL_USER/EMAIL_PASS remain supported for Gmail app passwords.
  smtpHost: optional('SMTP_HOST', optional('EMAIL_USER', '') ? 'smtp.gmail.com' : ''),
  smtpPort: Number(optional('SMTP_PORT', optional('EMAIL_USER', '') ? '465' : '587')),
  smtpUser: optional('SMTP_USER', optional('EMAIL_USER', '')),
  smtpPass: optional('SMTP_PASS', optional('EMAIL_PASS', '')).replace(/^"|"$/g, ''),
  mailFrom: optional('MAIL_FROM', optional('EMAIL_USER', '')),

  // Pusher credentials are required for private/presence channel auth.
  pusherAppId: required('PUSHER_APP_ID'),
  pusherKey: required('PUSHER_KEY'),
  pusherSecret: required('PUSHER_SECRET'),
  pusherCluster: required('PUSHER_CLUSTER'),

  // Parsed list of allowed frontend origins for CORS
  frontendOrigins: parseFrontendOrigins(),
};

/** Convenience boolean: true when running in production */
export const isProduction = env.nodeEnv === 'production';

/** Convenience boolean: true when running in development */
export const isDevelopment = env.nodeEnv === 'development';
