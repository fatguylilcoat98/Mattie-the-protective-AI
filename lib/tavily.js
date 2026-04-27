/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const { TavilyClient } = require('tavily');

if (!process.env.TAVILY_API_KEY) {
  console.warn('TAVILY_API_KEY not found - web search will be disabled');
}

const client = process.env.TAVILY_API_KEY ? new TavilyClient({ apiKey: process.env.TAVILY_API_KEY }) : null;

async function search(query) {
  try {
    if (!client) {
      throw new Error('Tavily not configured');
    }

    const response = await client.search(query, {
      searchDepth: 'basic',
      maxResults: 5,
      includeAnswer: true,
      includeDomains: [], // Allow all domains
      excludeDomains: ['reddit.com', 'quora.com'], // Exclude low-quality sources
      includeRawContent: false
    });

    return {
      answer: response.answer || 'No direct answer found.',
      sources: response.results?.map(r => ({
        title: r.title || 'Untitled',
        url: r.url,
        content: (r.content || '').substring(0, 300) // Limit content length
      })) || [],
      query: query
    };
  } catch (error) {
    console.error('Tavily search error:', error);
    throw new Error('Web search temporarily unavailable');
  }
}

// Determine if a query needs web search
function needsWebSearch(query) {
  const searchIndicators = [
    // Time-sensitive queries
    /\b(current|latest|recent|today|yesterday|this week|this month|2024|2025|2026)\b/i,
    // Price queries
    /\b(price|cost|how much|expensive|cheap)\b/i,
    // News/events
    /\b(news|happened|event|update|announcement)\b/i,
    // Stock market
    /\b(stock|shares|market|trading|nasdaq|dow)\b/i,
    // Weather
    /\b(weather|temperature|forecast|rain|snow)\b/i,
    // Sports
    /\b(game|score|season|playoffs|championship)\b/i,
    // Technology releases
    /\b(released|launched|announced|version|update)\b/i,
    // Real-time data
    /\b(status|down|outage|working)\b/i
  ];

  return searchIndicators.some(pattern => pattern.test(query));
}

module.exports = {
  search,
  needsWebSearch,
  isTavilyConfigured: () => !!client
};