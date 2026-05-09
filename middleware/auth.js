/**
 * AUTHENTICATION MIDDLEWARE
 * Simple authentication for memory system
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Simple API key authentication
 */
function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required'
    });
  }

  next();
}

/**
 * Admin authentication (stricter)
 */
function requireAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'] || req.query.admin_key;

  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required'
    });
  }

  next();
}

/**
 * Supabase JWT authentication (when users exist)
 */
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        error: 'No token provided'
      });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: 'Invalid token'
      });
    }

    req.user = user;
    req.userId = user.id;
    next();

  } catch (error) {
    res.status(401).json({
      error: 'Authentication failed',
      message: error.message
    });
  }
}

/**
 * Create or get user (for development)
 */
async function getOrCreateUser(req, res, next) {
  try {
    let userId = req.userId || req.body.userId || req.query.userId;

    if (!userId) {
      // Create a default user for development
      const { data: existingUsers } = await supabase
        .from('auth.users')
        .select('id')
        .limit(1);

      if (existingUsers && existingUsers.length > 0) {
        userId = existingUsers[0].id;
      } else {
        // Create a test user
        const { data: newUser, error } = await supabase.auth.admin.createUser({
          email: 'chris@splendor.ai',
          password: 'temp123',
          email_confirm: true
        });

        if (error) {
          throw error;
        }

        userId = newUser.user.id;
      }
    }

    req.userId = userId;
    next();

  } catch (error) {
    // For development, continue with a default user ID
    req.userId = 'default-user-' + Date.now();
    next();
  }
}

/**
 * Rate limiting middleware
 */
const rateLimits = new Map();

function rateLimit(maxRequests = 100, windowMs = 60000) {
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const window = rateLimits.get(key) || { count: 0, start: now };

    // Reset window if expired
    if (now - window.start > windowMs) {
      window.count = 0;
      window.start = now;
    }

    window.count++;
    rateLimits.set(key, window);

    if (window.count > maxRequests) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Max ${maxRequests} per minute.`
      });
    }

    next();
  };
}

/**
 * Request logging
 */
function logRequests(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`
    );
  });

  next();
}

module.exports = {
  requireApiKey,
  requireAdmin,
  requireAuth,
  getOrCreateUser,
  rateLimit,
  logRequests
};