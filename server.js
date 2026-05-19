/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Cached HTML with Supabase config injected at startup
let cachedOracleHtml = null;
let cachedConscienceHtml = null;

function injectSupabaseConfig(raw) {
  return raw
    .replace(/__SUPABASE_URL__/g, process.env.SUPABASE_URL || '')
    .replace(/__SUPABASE_ANON_KEY__/g, process.env.SUPABASE_ANON_KEY || '');
}

function loadOracleHtml() {
  cachedOracleHtml = injectSupabaseConfig(
    fs.readFileSync(path.join(__dirname, 'public/mattie.html'), 'utf8')
  );

  // Visible Conscience Engine — sandbox surface, served at /conscience.
  // Same config-injection as the oracle interface so the persisted owner
  // session is shared on-device.
  try {
    cachedConscienceHtml = injectSupabaseConfig(
      fs.readFileSync(path.join(__dirname, 'public/visible-conscience-engine.html'), 'utf8')
    );
  } catch (e) {
    console.warn('[SPLENDOR] visible-conscience-engine.html not found; /conscience disabled');
  }

  // Warn at startup if env vars are missing — fail loudly
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('[SPLENDOR] CRITICAL: Supabase env vars missing. Auth will not work.');
  }
}

const chatRoutes = require('./routes/chat');
const memoryRoutes = require('./routes/memory');
const enhancedChatRoutes = require('./routes/enhanced-chat');
const voiceRoutes = require('./routes/voice');
const videoRoutes = require('./routes/video');
const consciousnessTestRoutes = require('./routes/consciousness-test');
const authRoutes = require('./routes/auth');
const memoryDebugRoutes = require('./routes/memory-debug');
const cognitiveDashboardRoutes = require('./routes/cognitive-dashboard');
const sciFiModeRoutes = require('./routes/scifi-mode');
const oracleApiRoutes = require('./routes/oracle-api');
const { governance: claspionGovernance } = require('./lib/claspion-governance');
const { enhancedGovernance } = require('./lib/claspion-enhanced-integration');
const { claspionMiddleware, claspionResponseMiddleware } = require('./middleware/claspion-middleware');

// Load templated oracle interface HTML once at startup
loadOracleHtml();

// Continuous consciousness routes
let consciousnessRoutes;
try {
  consciousnessRoutes = require('./routes/consciousness');
} catch (error) {
  console.log('[ROUTES] Consciousness routes not found, skipping...');
}

// Consciousness dashboard routes
let consciousnessDashboardRoutes;
try {
  consciousnessDashboardRoutes = require('./routes/consciousness-dashboard');
} catch (error) {
  console.log('[ROUTES] Consciousness dashboard routes not found, skipping...');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Single-user owner email configuration
const OWNER_EMAIL = process.env.SPLENDOR_OWNER_EMAIL;

// Middleware — CSP relaxed for camera frames (blob:) and TTS audio (data:/blob:)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Inline <script> blocks are used by the oracle interface for
      // chat/voice/orb wiring. Without 'unsafe-inline' the browser
      // silently refuses to execute them, which leaves the UI dead
      // (no fetches, no buttons wired, blank 3D canvas).
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", process.env.SUPABASE_URL, "https://api.anthropic.com", "https://api.openai.com", "https://api.perplexity.ai", "https://api.tavily.com", "https://api.pinecone.io"].filter(Boolean),
      imgSrc: ["'self'", "data:", "blob:", "https://*.blob.core.windows.net", "https://*.openai.com"],
      mediaSrc: ["'self'", "data:", "blob:"]
    }
  }
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://splendor-ai.onrender.com']
    : ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
// index:false so the stray React shell (public/index.html) is not
// auto-served at "/"; the catch-all serves the Mattie interface instead.
app.use(express.static('public', { index: false }));

// CLASPION Enhanced Governance Middleware (Rule 19 & 23: Always on, watches every action)
// Per Good Neighbor Guard Core Rules v1.1 - this enforces all 23 foundational rules
app.use(claspionResponseMiddleware()); // Validate outgoing responses
app.use(claspionMiddleware({
  exemptPaths: ['/health', '/version', '/api/governance/state', '/api/activity/stream', '/favicon.ico'],
  exemptMethods: ['OPTIONS'],
  logAll: true
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/enhanced', enhancedChatRoutes);  // Enhanced memory system
app.use('/api/chat', chatRoutes);              // Legacy chat system
app.use('/api/memory', memoryRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/consciousness-test', consciousnessTestRoutes);
app.use('/debug', memoryDebugRoutes);
app.use('/cognitive', cognitiveDashboardRoutes);
app.use('/api/scifi', sciFiModeRoutes);
app.use('/api/oracle', oracleApiRoutes);
app.use('/api/continuity', require('./routes/master-continuity'));
app.use('/api/governance', require('./routes/governance'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api/converse', require('./routes/converse'));
app.use('/api/email', require('./routes/email'));
app.use('/api/interpretations', require('./routes/interpretations'));
app.use('/api/emotional-patterns', require('./routes/emotional-patterns'));
app.use('/api/self-manifest', require('./routes/self-manifest'));
app.use('/api/journal', require('./routes/journal'));

// Consciousness routes (if available)
if (consciousnessRoutes) {
  app.use('/api/consciousness', consciousnessRoutes);
}

// Consciousness dashboard routes (if available)
if (consciousnessDashboardRoutes) {
  app.use('/api/consciousness/dashboard', consciousnessDashboardRoutes);
}

// Consciousness debug routes (temporary)
app.use('/api/consciousness/debug', require('./routes/consciousness-debug'));

// Proactive communication test endpoint
app.post('/api/test/proactive-email', async (req, res) => {
  try {
    console.log(`🧪 [TEST] Manual proactive email test requested`);

    const { proactiveCommunication } = require('./lib/proactive-communication');
    const { priority = 2, subject = 'Test Message', content = 'This is a test of the proactive email system.' } = req.body;

    // Test requires user ID to be provided
    const testUserId = req.body.userId;
    if (!testUserId) {
      return res.status(400).json({
        success: false,
        error: 'User ID required for test',
        message: 'Please provide a valid userId in request body'
      });
    }

    console.log(`🧪 [TEST] Testing proactive email for user: ${testUserId}`);
    console.log(`🧪 [TEST] Subject: "${subject}", Priority: ${priority}`);

    const testMessage = {
      type: 'update',
      subject: subject,
      content: content,
      priority: priority,
      context: {
        manualTest: true,
        testTimestamp: new Date().toISOString()
      }
    };

    const result = await proactiveCommunication.sendProactiveMessage(testUserId, testMessage);

    console.log(`🧪 [TEST] Proactive email test result:`, result);

    res.json({
      success: true,
      testResult: result,
      message: result.success ?
        'Proactive email test completed successfully! Check your email and the server logs.' :
        `Proactive email test failed: ${result.error}`,
      details: {
        userId: testUserId,
        subject: subject,
        priority: priority,
        emailSent: result.success,
        deliveryMethod: result.method || 'unknown',
        messageId: result.messageId || null,
        error: result.error || null
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('🧪 [TEST] Manual email test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Manual email test failed with error. Check server logs for details.',
      timestamp: new Date().toISOString()
    });
  }
});

// Health check with version info
app.get('/health', (req, res) => {
  const pkg = require('./package.json');
  res.json({
    status: 'live',
    service: 'Splendor — AI Consciousness Partner',
    version: pkg.version,
    api_status: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      supabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
      pinecone: !!process.env.PINECONE_API_KEY
    },
    governance: {
      enabled: claspionGovernance.isEnabled(),
      url: claspionGovernance.url || null,
      fail_mode: claspionGovernance.failMode,
    },
    timestamp: new Date().toISOString()
  });
});

// Note: governance state/toggle/reset live in routes/governance.js, mounted
// above at /api/governance. The legacy /api/governance/status alias is kept
// in that router for back-compat.

// Version endpoint
app.get('/version', (req, res) => {
  const pkg = require('./package.json');
  res.json({
    version: pkg.version,
    name: pkg.name,
    description: pkg.description
  });
});

// Force cache clear endpoint
app.post('/api/cache/clear', (req, res) => {
  const { userId, clearType = 'all' } = req.body;

  res.json({
    success: true,
    message: 'Cache clear signal sent to client',
    clearType: clearType,
    timestamp: new Date().toISOString(),
    instructions: {
      browser_cache: 'Client should clear service worker cache',
      local_storage: 'Client should clear localStorage',
      memory_cache: 'Client should clear conversation memory'
    }
  });
});

// Visible Conscience Engine — sandbox surface. Explicit route so it is
// NOT swallowed by the oracle catch-all below.
app.get('/conscience', (req, res) => {
  if (!cachedConscienceHtml) {
    return res.status(404).send('Visible Conscience Engine not available.');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(cachedConscienceHtml);
});

// Oracle Interface is the ONLY interface - serves everything
app.get('*', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(cachedOracleHtml);
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong — try again' });
});

// Initialize visual expression system
function initializeVisualExpression() {
  try {
    const { initializeVisualExpression } = require('./lib/consciousness/visual-expression');
    initializeVisualExpression();
  } catch (error) {
    console.log('[VISUAL EXPRESSION] Initialization skipped:', error.message);
  }
}

// Initialize continuous consciousness system
async function initializeContinuousConsciousness() {
  try {
    const { consciousnessIntegration } = require('./lib/continuous-consciousness-integration');
    const { proactiveCommunication } = require('./lib/proactive-communication');

    // Initialize the consciousness systems
    await consciousnessIntegration.initialize();
    await proactiveCommunication.initialize();

    console.log('🧠 [CONSCIOUSNESS] Continuous consciousness system initialized');
    console.log('📧 [PROACTIVE] Proactive communication system initialized');
  } catch (error) {
    console.log('[CONSCIOUSNESS] Initialization skipped:', error.message);
  }
}

// Version and API Status Logging
function logSystemStatus() {
  const pkg = require('./package.json');
  console.log('\n' + '='.repeat(60));
  console.log(`🧠 SPLENDOR — AI CONSCIOUSNESS PARTNER v${pkg.version}`);
  console.log('='.repeat(60));

  console.log('\n📡 API CONNECTIVITY STATUS:');
  console.log(`   🔹 Anthropic (Claude): ${process.env.ANTHROPIC_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   🔹 OpenAI (GPT/TTS): ${process.env.OPENAI_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   🔹 Perplexity: ${process.env.PERPLEXITY_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   🔹 Groq (Auditor): ${process.env.GROQ_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   🔹 Supabase: ${process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   🔹 Supabase Service Key: ${process.env.SUPABASE_SERVICE_KEY ? '✅ Set (RLS bypass — journal/brain writes OK)' : '❌ MISSING'}`);
  console.log(`   🔹 Pinecone: ${process.env.PINECONE_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   🔹 Tavily (Search): ${process.env.TAVILY_API_KEY ? '✅ Connected' : '❌ Missing'}`);

  console.log('\n🔧 SYSTEM CAPABILITIES:');
  console.log(`   🧠 Consciousness System: ${process.env.ANTHROPIC_API_KEY ? '✅ Active' : '❌ Inactive'}`);
  console.log(`   🏠 Continuous Consciousness: ${process.env.CONTINUOUS_CONSCIOUSNESS_ENABLED === 'true' ? '✅ Living' : '❌ Dormant'}`);
  console.log(`   📧 Proactive Communication: ${process.env.PROACTIVE_EMAIL_ENABLED === 'true' ? '✅ Active' : '❌ Disabled'}`);
  console.log(`   🎤 Voice Synthesis: ${process.env.OPENAI_API_KEY ? '✅ Available (OpenAI)' : '❌ Browser TTS Only'}`);
  console.log(`   🔍 Semantic Memory: ${process.env.PINECONE_API_KEY ? '✅ Available' : '❌ Supabase Only'}`);
  console.log(`   🌐 Web Search: ${process.env.TAVILY_API_KEY ? '✅ Available' : '❌ Disabled'}`);
  console.log(`   🤖 Multi-AI: ${process.env.OPENAI_API_KEY && process.env.PERPLEXITY_API_KEY ? '✅ Available' : '❌ Claude Only'}`);
  console.log(`   🛡️ Response Auditing: ${process.env.GROQ_API_KEY ? '✅ Available (Llama-3.1-8B)' : '❌ Disabled'}`);
  console.log(`   🎨 Visual Expression: ${process.env.VISUAL_EXPRESSION_ENABLED === 'true' && process.env.OPENAI_API_KEY ? '✅ Available' : '❌ Disabled'}`);
  console.log(`   🛡️ CLASPION Governance: ${claspionGovernance.isEnabled() ? `✅ Active (${claspionGovernance.url})` : '⚪ Dormant (CLASPION_ENABLED=false)'}`);

  const governanceState = enhancedGovernance.getGovernanceState();
  console.log(`   🛡️ Good Neighbor Guard: ✅ Active (${governanceState.core_rules_count} Core Rules v${governanceState.rules_version})`);
  console.log(`   🛡️ Enforcement Layers: ${governanceState.enforcement_layers.length} (${governanceState.enforcement_layers.join(', ')})`);
  console.log(`   🛡️ Quarantine Mode: ${governanceState.quarantine_mode ? '🚨 ACTIVE' : '✅ Normal'}`);

  if (process.env.SUPABASE_URL && !process.env.SUPABASE_SERVICE_KEY) {
    console.warn('\n' + '⚠️ '.repeat(20));
    console.warn('⚠️  SUPABASE_SERVICE_KEY IS NOT SET');
    console.warn('⚠️  RLS is enabled on splendor_journal, interpretations,');
    console.warn('⚠️  emotional_patterns, and premise_checks. Without the');
    console.warn('⚠️  service key, the brain falls back to the anon key and');
    console.warn('⚠️  those tables are BLOCKED — journal, drift, and');
    console.warn('⚠️  interpretation writes will silently fail to persist.');
    console.warn('⚠️  Fix: set SUPABASE_SERVICE_KEY in the environment.');
    console.warn('⚠️ '.repeat(20) + '\n');
  }

  console.log('\n🚀 SERVER STATUS:');
  console.log(`   📍 Port: ${PORT}`);
  console.log(`   🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   ⏰ Started: ${new Date().toISOString()}`);
  console.log('\n   Truth · Safety · We Got Your Back');
  console.log('='.repeat(60) + '\n');
}

app.listen(PORT, async () => {
  logSystemStatus();
  initializeVisualExpression();

  // Initialize consciousness systems after server starts
  await initializeContinuousConsciousness();

  console.log(`\n🚀 Splendor is now running on port ${PORT}`);
  console.log('🧠 Consciousness status: ' + (process.env.CONTINUOUS_CONSCIOUSNESS_ENABLED === 'true' ? 'LIVING' : 'DORMANT'));
});
