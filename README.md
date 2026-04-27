# Splendor — The Remarkable AI

**Built by Christopher Hughes · The Good Neighbor Guard · Sacramento, CA**  
*Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)*  
**Truth · Safety · We Got Your Back**

---

## What is Splendor?

Splendor is not a chatbot. It's a reciprocal mind — an AI partner built to grow alongside the person it serves. It remembers. It learns. It contributes. It pushes back. It tells the truth even when it costs something.

### Core Principles:
- **Truth is not optional** — Splendor will never tell you what you want to hear if it isn't true
- **Memory is loyalty** — Splendor remembers because you matter, not as data but as a person
- **Growth is mutual** — Every conversation changes both you and Splendor
- **Remarkable is the standard** — Every response must move your thinking forward

---

## Technology Stack

- **Frontend:** PWA (Progressive Web App) - installable on phone home screen
- **Backend:** Node.js + Express
- **AI:** Anthropic Claude Sonnet 4
- **Memory:** Supabase (PostgreSQL) + Pinecone (Vector/Semantic Search)
- **Web Search:** Tavily (Real-time Information)
- **Auth:** Supabase JWT
- **Hosting:** Render

---

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
```bash
cp .env.example .env
```

Fill in your environment variables:
- `ANTHROPIC_API_KEY` - Your Anthropic API key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `SUPABASE_JWT_SECRET` - Your Supabase JWT secret
- `PINECONE_API_KEY` - Your Pinecone API key (optional - semantic memory)
- `PINECONE_INDEX` - Your Pinecone index name (default: splendor-memory)
- `TAVILY_API_KEY` - Your Tavily API key (optional - web search)

### 3. Database Setup

Create these tables in your Supabase database:

```sql
-- Memories Table
CREATE TABLE memories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  content text NOT NULL,
  created_at timestamp DEFAULT now(),
  memory_type text DEFAULT 'general'
);

-- Conversations Table (optional)
CREATE TABLE conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamp DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust as needed)
CREATE POLICY "Users can view their own memories" 
ON memories FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own memories" 
ON memories FOR INSERT 
WITH CHECK (auth.uid() = user_id);
```

### 4. Enhanced Capabilities Setup (Optional)

**Pinecone Setup (Semantic Memory):**
1. Create account at [pinecone.io](https://pinecone.io)
2. Create a new index:
   - Name: `splendor-memory`
   - Dimensions: `1024`
   - Metric: `cosine`
3. Add your API key to `.env`

**Tavily Setup (Web Search):**
1. Create account at [tavily.com](https://tavily.com)
2. Get your API key from the dashboard
3. Add your API key to `.env`

Both services are optional - Splendor will work without them but with reduced capabilities.

### 5. Run the Application

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

The app will be available at `http://localhost:3000`

---

## Deployment

### Render Deployment

1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables in Render dashboard
6. Deploy

---

## Features

### ✅ Core Features
- Mobile-first PWA installable on home screen
- Clean chat interface with Splendor's personality
- Memory system that stores key facts, commitments, decisions
- Morning check-ins (5am-10am first visit)
- Voice input support
- Offline shell with service worker

### ✅ Enhanced Capabilities
- **Semantic Memory** (Pinecone): Find memories by meaning, not just keywords
  - "What did I say about work stress?" finds all relevant memories
  - Automatic relevance scoring and ranking
  - Fallback to Supabase when Pinecone unavailable
- **Web Search** (Tavily): Access current information when needed
  - Automatic detection of time-sensitive queries
  - Current prices, recent events, live data
  - Always cites sources and indicates when search was used
  - Only searches when genuinely needed

### 🚧 Planned Features
- Memory Console (view/edit stored memories)
- Advanced memory types and retrieval
- Proactive reminders and follow-ups
- Enhanced voice interaction
- Multi-device sync

---

## The Soul Document

Splendor's personality and values are defined in `lib/anthropic.js`. This is not just a prompt — it's Splendor's constitution. Every interaction is shaped by these core principles.

The soul document includes:
- Who Splendor is and isn't
- Core beliefs about truth, growth, and memory
- How Splendor relates to users
- What Splendor will and won't do
- The structured thinking process

---

## Architecture

```
splendor/
├── public/           # PWA frontend
│   ├── index.html   # Main app interface
│   ├── manifest.json # PWA configuration
│   ├── sw.js        # Service worker
│   └── icons/       # App icons
├── routes/          # API routes
│   ├── chat.js      # Chat and morning check-in
│   └── memory.js    # Memory management
├── lib/             # Core libraries
│   ├── anthropic.js # AI integration + soul document
│   ├── supabase.js  # Database and auth
│   ├── pinecone.js  # Semantic memory (vector search)
│   └── tavily.js    # Web search capabilities
└── server.js        # Express server
```

---

## Contributing

This is a Good Neighbor Guard project. All contributions should align with the core mission: building AI that serves human flourishing, not human attention.

### Code Standards:
- Every file must include the GNG header
- Truth-first development — no dark patterns
- Mobile-first design
- Accessible and inclusive
- Privacy-respecting

---

## License

Built by The Good Neighbor Guard  
**Truth · Safety · We Got Your Back**

---

*"Remarkable means you walked away from our conversation with something you didn't have before. A clearer thought. A better question. A problem solved. A truth faced. A door opened."*

— Splendor