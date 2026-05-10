/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  CLASPION Middleware — Express integration for full governance

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const { enhancedGovernance } = require('../lib/claspion-enhanced-integration');

/**
 * CLASPION Express Middleware
 *
 * Per Rule 19: "CLASPION watches every action"
 * Per Rule 23: "CLASPION wraps every request and response"
 *
 * This middleware enforces governance on every incoming request
 */
function claspionMiddleware(options = {}) {
  const {
    exemptPaths = ['/health', '/api/governance', '/api/status'],
    exemptMethods = ['OPTIONS'],
    logAll = true
  } = options;

  return async (req, res, next) => {
    // Skip governance for exempt paths and methods
    if (exemptPaths.includes(req.path) || exemptMethods.includes(req.method)) {
      return next();
    }

    const startTime = Date.now();
    const correlationId = require('crypto').randomUUID();

    try {
      // Build action request from HTTP request
      const actionRequest = buildActionFromRequest(req);

      // Build context
      const context = buildContextFromRequest(req, correlationId);

      // Validate through enhanced governance
      const validationResult = await enhancedGovernance.validateAction(actionRequest, context);

      // Add governance headers to response
      res.set({
        'X-Claspion-Decision': validationResult.decision,
        'X-Claspion-Basis': validationResult.basis_state,
        'X-Claspion-Correlation': validationResult.correlation_id,
        'X-Claspion-Latency': `${validationResult.latency_ms}ms`,
        'X-GNG-Rules-Version': '1.1'
      });

      // Handle governance decision
      if (!validationResult.allow) {
        return handleGovernanceBlock(res, validationResult, req);
      }

      // Add validation result to request for downstream use
      req.claspionValidation = validationResult;
      req.correlationId = correlationId;

      // Log successful validation
      if (logAll) {
        console.log(`[CLASPION-MIDDLEWARE] ALLOW ${req.method} ${req.path} - ${validationResult.reason}`);
      }

      next();

    } catch (error) {
      // Emergency failsafe - Rule 23: CLASPION runs even during errors
      console.error('[CLASPION-MIDDLEWARE] Governance error:', error);

      res.status(503).json({
        error: 'Governance system unavailable',
        message: 'Request blocked for safety - governance validation failed',
        correlation_id: correlationId,
        basis_state: 'GOVERNANCE_ERROR'
      });
    }
  };
}

/**
 * Builds action request object from HTTP request
 * @private
 */
function buildActionFromRequest(req) {
  const actionType = determineActionType(req);

  return {
    type: actionType,
    method: req.method,
    path: req.path,
    action: `${req.method}_${req.path.replace(/\//g, '_')}`,
    data: req.body,
    query: req.query,
    headers: filterSensitiveHeaders(req.headers),
    user_agent: req.get('User-Agent'),
    ip: req.ip,
    timestamp: new Date().toISOString()
  };
}

/**
 * Builds context object from request
 * @private
 */
function buildContextFromRequest(req, correlationId) {
  return {
    correlation_id: correlationId,
    user_id: req.user?.id || req.headers['x-user-id'] || 'anonymous',
    session_id: req.session?.id || req.headers['x-session-id'],
    ip_address: req.ip,
    user_agent: req.get('User-Agent'),
    referer: req.get('Referer'),
    method: req.method,
    path: req.path,
    query: req.query,
    timestamp: new Date().toISOString()
  };
}

/**
 * Determines action type from request
 * @private
 */
function determineActionType(req) {
  // Memory operations
  if (req.path.includes('/memory')) {
    if (req.method === 'POST') return 'memory_store';
    if (req.method === 'GET') return 'memory_retrieve';
    if (req.method === 'DELETE') return 'memory_delete';
    if (req.method === 'PUT') return 'memory_update';
  }

  // Chat operations
  if (req.path.includes('/chat')) {
    return 'chat_interaction';
  }

  // Admin operations
  if (req.path.includes('/admin')) {
    return 'admin_operation';
  }

  // Governance operations
  if (req.path.includes('/governance')) {
    return 'governance_operation';
  }

  // File operations
  if (req.method === 'POST' && req.path.includes('/upload')) {
    return 'file_upload';
  }

  // Authentication
  if (req.path.includes('/auth')) {
    if (req.method === 'POST' && req.path.includes('/login')) return 'user_login';
    if (req.method === 'POST' && req.path.includes('/signup')) return 'user_signup';
    if (req.method === 'POST' && req.path.includes('/logout')) return 'user_logout';
  }

  // Generic HTTP operations
  if (req.method === 'GET') return 'http_read';
  if (req.method === 'POST') return 'http_create';
  if (req.method === 'PUT') return 'http_update';
  if (req.method === 'DELETE') return 'http_delete';

  return 'http_operation';
}

/**
 * Filters sensitive headers from governance logs
 * @private
 */
function filterSensitiveHeaders(headers) {
  const sensitive = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
  const filtered = { ...headers };

  for (const key of sensitive) {
    if (filtered[key]) {
      filtered[key] = '[REDACTED]';
    }
  }

  return filtered;
}

/**
 * Handles blocked requests from governance
 * @private
 */
function handleGovernanceBlock(res, validationResult, req) {
  const statusCode = determineBlockStatusCode(validationResult);

  console.warn(`[CLASPION-MIDDLEWARE] BLOCK ${req.method} ${req.path} - ${validationResult.reason}`);

  // Special handling for quarantine
  if (validationResult.decision === 'QUARANTINE') {
    return res.status(503).json({
      error: 'System in quarantine mode',
      message: 'Critical governance violation detected - human intervention required',
      correlation_id: validationResult.correlation_id,
      basis_state: validationResult.basis_state,
      violations: validationResult.violations,
      quarantine: true
    });
  }

  // Standard governance block
  res.status(statusCode).json({
    error: 'Request blocked by governance',
    message: validationResult.reason,
    decision: validationResult.decision,
    basis_state: validationResult.basis_state,
    enforcement_layer: validationResult.enforcement_layer,
    correlation_id: validationResult.correlation_id,
    violations: validationResult.violations || [],
    warnings: validationResult.warnings || []
  });
}

/**
 * Determines HTTP status code for governance blocks
 * @private
 */
function determineBlockStatusCode(validationResult) {
  switch (validationResult.basis_state) {
    case 'RULE_VIOLATION':
    case 'AUTHORITY_VIOLATION':
    case 'MEMORY_VIOLATION':
      return 403; // Forbidden

    case 'QUARANTINED':
      return 503; // Service Unavailable

    case 'GOVERNANCE_ERROR':
    case 'UNREACHABLE':
      return 503; // Service Unavailable

    default:
      return 403; // Forbidden
  }
}

/**
 * Response wrapping middleware - validates outgoing responses
 * Per Rule 23: CLASPION wraps every response
 */
function claspionResponseMiddleware() {
  return (req, res, next) => {
    const originalSend = res.send;
    const originalJson = res.json;

    // Wrap res.send
    res.send = function(body) {
      validateResponse(body, req, res);
      return originalSend.call(this, body);
    };

    // Wrap res.json
    res.json = function(body) {
      validateResponse(body, req, res);
      return originalJson.call(this, body);
    };

    next();
  };
}

/**
 * Validates outgoing responses
 * @private
 */
async function validateResponse(body, req, res) {
  try {
    // Build response validation request
    const responseAction = {
      type: 'response',
      content: typeof body === 'string' ? body : JSON.stringify(body),
      status_code: res.statusCode,
      headers: res.getHeaders(),
      request_correlation: req.correlationId
    };

    // Quick validation for responses
    const validation = await enhancedGovernance.validateAction(responseAction, {
      user_id: req.user?.id || 'anonymous',
      original_request: req.path
    });

    // Add response governance headers
    res.set({
      'X-Claspion-Response-Decision': validation.decision,
      'X-Claspion-Response-Basis': validation.basis_state
    });

    // Log if blocked (rare for responses)
    if (!validation.allow) {
      console.warn(`[CLASPION-MIDDLEWARE] Response blocked: ${validation.reason}`);
    }

  } catch (error) {
    // Don't block responses on validation errors
    console.error('[CLASPION-MIDDLEWARE] Response validation error:', error);
  }
}

module.exports = {
  claspionMiddleware,
  claspionResponseMiddleware
};