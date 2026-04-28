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
app.use('/api/chat', chatRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/consciousness-test', consciousnessTestRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'live',
    service: 'Splendor — The Remarkable AI',
    version: '0.1.0',
    timestamp: new Date().toISOString()
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

app.listen(PORT, () => {
  console.log(`Splendor — The Remarkable AI running on port ${PORT}`);
  console.log('Truth · Safety · We Got Your Back');
});