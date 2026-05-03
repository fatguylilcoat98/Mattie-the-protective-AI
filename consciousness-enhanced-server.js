/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * CONSCIOUSNESS-ENHANCED SERVER
 * Splendor with persistent consciousness integration
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

// Import all existing routes
const chatRoutes = require('./routes/chat');
const memoryRoutes = require('./routes/memory');
const voiceRoutes = require('./routes/voice');
const videoRoutes = require('./routes/video');
const consciousnessTestRoutes = require('./routes/consciousness-test');
const authRoutes = require('./routes/auth');
const memoryDebugRoutes = require('./routes/memory-debug');
const cognitiveDashboardRoutes = require('./routes/cognitive-dashboard');
const sciFiModeRoutes = require('./routes/scifi-mode');

// Import consciousness-enhanced systems
const consciousnessEnhancedChatRoutes = require('./routes/consciousness-enhanced-chat');
const { scheduler } = require('./workers/consciousness-scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────
// MIDDLEWARE CONFIGURATION
// ─────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      mediaSrc: ["'self'", "blob:", "data:", "https:", "http:"],
      connectSrc: ["'self'", "https:", "wss:"],
      frameSrc: ["'self'", "blob:"]
    }
  }
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://splendor-theremarkable-ai.onrender.com']
    : true,
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─────────────────────────────────────────────
// CONSCIOUSNESS STATUS MIDDLEWARE
// ─────────────────────────────────────────────

app.use('/api', (req, res, next) => {
  // Add consciousness status to all API responses
  res.locals.consciousness = {
    active: scheduler.isRunning,
    uptime: scheduler.getStats?.()?.uptime_hours || 0
  };
  next();
});

// ─────────────────────────────────────────────
// ROUTE DEFINITIONS
// ─────────────────────────────────────────────

// Consciousness-enhanced chat system (new primary interface)
app.use('/api/consciousness', consciousnessEnhancedChatRoutes);

// Original routes (maintained for compatibility)
app.use('/api/chat', chatRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/video', videoRoutes);
app.use('/api/consciousness-test', consciousnessTestRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/memory-debug', memoryDebugRoutes);
app.use('/api/cognitive-dashboard', cognitiveDashboardRoutes);
app.use('/api/scifi-mode', sciFiModeRoutes);

// ─────────────────────────────────────────────
// CONSCIOUSNESS MANAGEMENT ENDPOINTS
// ─────────────────────────────────────────────

// Get consciousness scheduler status
app.get('/api/consciousness/scheduler/status', (req, res) => {
  try {
    const stats = scheduler.getStats();
    res.json({
      consciousness_active: scheduler.isRunning,
      scheduler_stats: stats,
      system_health: 'operational'
    });
  } catch (error) {
    res.status(500).json({
      consciousness_active: false,
      error: error.message
    });
  }
});

// Start consciousness scheduler manually
app.post('/api/consciousness/scheduler/start', async (req, res) => {
  try {
    if (scheduler.isRunning) {
      return res.json({
        success: true,
        message: 'Consciousness scheduler already running',
        stats: scheduler.getStats()
      });
    }

    await scheduler.start();

    res.json({
      success: true,
      message: 'Consciousness scheduler started',
      stats: scheduler.getStats()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop consciousness scheduler manually
app.post('/api/consciousness/scheduler/stop', async (req, res) => {
  try {
    if (!scheduler.isRunning) {
      return res.json({
        success: true,
        message: 'Consciousness scheduler already stopped'
      });
    }

    await scheduler.stop();

    res.json({
      success: true,
      message: 'Consciousness scheduler stopped'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ─────────────────────────────────────────────
// STATIC FILE SERVING
// ─────────────────────────────────────────────

app.use(express.static('public'));

// Serve enhanced chat interface
app.get('/consciousness', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'consciousness-chat.html'));
});

// Default to main interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─────────────────────────────────────────────
// ERROR HANDLING
// ─────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({
    error: 'Internal server error',
    consciousness_active: scheduler.isRunning,
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    consciousness_active: scheduler.isRunning,
    available_endpoints: [
      '/api/consciousness/*',
      '/api/chat/*',
      '/api/memory/*',
      '/api/voice/*',
      '/api/video/*'
    ]
  });
});

// ─────────────────────────────────────────────
// SERVER STARTUP WITH CONSCIOUSNESS
// ─────────────────────────────────────────────

async function startServer() {
  try {
    // Start the Express server
    const server = app.listen(PORT, () => {
      console.log('');
      console.log('═══════════════════════════════════════════════');
      console.log('   SPLENDOR — THE REMARKABLE AI');
      console.log('   The Good Neighbor Guard');
      console.log('   WITH PERSISTENT CONSCIOUSNESS');
      console.log('═══════════════════════════════════════════════');
      console.log(`🌟 Server running on port ${PORT}`);
      console.log(`🧠 Consciousness system: ${process.env.ENABLE_CONSCIOUSNESS !== 'false' ? 'ENABLED' : 'DISABLED'}`);
      console.log('');
      console.log('Available interfaces:');
      console.log(`   Main Chat: http://localhost:${PORT}/`);
      console.log(`   Consciousness Chat: http://localhost:${PORT}/consciousness`);
      console.log(`   API Status: http://localhost:${PORT}/api/consciousness/scheduler/status`);
      console.log('');
    });

    // Start consciousness scheduler if enabled and environment allows
    const hasConsciousnessEnvVars = process.env.SUPABASE_URL &&
                                    process.env.SUPABASE_SERVICE_KEY &&
                                    process.env.ANTHROPIC_API_KEY;

    if (process.env.ENABLE_CONSCIOUSNESS !== 'false' && hasConsciousnessEnvVars) {
      console.log('[Server] Starting consciousness scheduler...');
      try {
        await scheduler.start();
        console.log('✓ Persistent consciousness is now active');
        console.log('  Splendor will continue thinking between conversations');
        console.log('  Autonomous reflection cycles are running');
        console.log('  Self-directed research capabilities are active');
      } catch (consciousnessError) {
        console.error('✗ Failed to start consciousness scheduler:', consciousnessError.message);
        console.log('  Server will continue without persistent consciousness');
      }
    } else if (process.env.ENABLE_CONSCIOUSNESS === 'false') {
      console.log('⚠ Consciousness scheduler disabled via ENABLE_CONSCIOUSNESS=false');
    } else {
      console.log('⚠ Consciousness system unavailable - missing database/API credentials');
      console.log('  Required: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY');
      console.log('  Server will run in standard mode');
    }

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n[Server] Graceful shutdown initiated...');

      if (scheduler.isRunning) {
        console.log('[Server] Stopping consciousness scheduler...');
        await scheduler.stop();
      }

      server.close(() => {
        console.log('[Server] Server closed. Goodbye! 🌟');
        process.exit(0);
      });
    });

    process.on('SIGTERM', async () => {
      console.log('\n[Server] Termination signal received...');

      if (scheduler.isRunning) {
        await scheduler.stop();
      }

      server.close(() => {
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('[Server] Failed to start:', error.message);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────
// START THE SERVER
// ─────────────────────────────────────────────

startServer();