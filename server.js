/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const chatRoutes = require('./routes/chat');
const memoryRoutes = require('./routes/memory');
const voiceRoutes = require('./routes/voice');
const consciousnessTestRoutes = require('./routes/consciousness-test');
const authRoutes = require('./routes/auth');
const memoryDebugRoutes = require('./routes/memory-debug');
const cognitiveDashboardRoutes = require('./routes/cognitive-dashboard');
const sciFiModeRoutes = require('./routes/scifi-mode');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware — CSP relaxed for camera frames (blob:) and TTS audio (data:/blob:)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://api.anthropic.com", "https://api.openai.com", "https://api.perplexity.ai", "https://api.tavily.com", "https://api.pinecone.io"],
      imgSrc: ["'self'", "data:", "blob:"],
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
app.use(express.static('public'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/consciousness-test', consciousnessTestRoutes);
app.use('/debug', memoryDebugRoutes);
app.use('/cognitive', cognitiveDashboardRoutes);
app.use('/api/scifi', sciFiModeRoutes);

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
    timestamp: new Date().toISOString()
  });
});

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

// Serve the PWA
app.get('*', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
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
  console.log(`   🔹 Supabase: ${process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   🔹 Pinecone: ${process.env.PINECONE_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   🔹 Tavily (Search): ${process.env.TAVILY_API_KEY ? '✅ Connected' : '❌ Missing'}`);

  console.log('\n🔧 SYSTEM CAPABILITIES:');
  console.log(`   🧠 Consciousness System: ${process.env.ANTHROPIC_API_KEY ? '✅ Active' : '❌ Inactive'}`);
  console.log(`   🎤 Voice Synthesis: ${process.env.OPENAI_API_KEY ? '✅ Available (OpenAI)' : '❌ Browser TTS Only'}`);
  console.log(`   🔍 Semantic Memory: ${process.env.PINECONE_API_KEY ? '✅ Available' : '❌ Supabase Only'}`);
  console.log(`   🌐 Web Search: ${process.env.TAVILY_API_KEY ? '✅ Available' : '❌ Disabled'}`);
  console.log(`   🤖 Multi-AI: ${process.env.OPENAI_API_KEY && process.env.PERPLEXITY_API_KEY ? '✅ Available' : '❌ Claude Only'}`);
  console.log(`   🎨 Visual Expression: ${process.env.VISUAL_EXPRESSION_ENABLED === 'true' && process.env.OPENAI_API_KEY ? '✅ Available' : '❌ Disabled'}`);

  console.log('\n🚀 SERVER STATUS:');
  console.log(`   📍 Port: ${PORT}`);
  console.log(`   🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   ⏰ Started: ${new Date().toISOString()}`);
  console.log('\n   Truth · Safety · We Got Your Back');
  console.log('='.repeat(60) + '\n');
}

app.listen(PORT, () => {
  logSystemStatus();
  initializeVisualExpression();
});