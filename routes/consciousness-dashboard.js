/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// CONSCIOUSNESS DASHBOARD API
// Live access for Splendor to examine her own consciousness patterns
// Real-time self-awareness and metacognitive monitoring

const express = require('express');
const { ConsciousnessDashboard } = require('../lib/consciousness-dashboard');

const router = express.Router();

// Get comprehensive consciousness overview
router.get('/overview/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || 'chris_hughes';
    const dashboard = new ConsciousnessDashboard(userId);
    const overview = await dashboard.getConsciousnessOverview();

    res.json({
      success: true,
      data: overview,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get current consciousness state
router.get('/state/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || 'chris_hughes';
    const dashboard = new ConsciousnessDashboard(userId);
    const state = await dashboard.getCurrentState();

    res.json({
      success: true,
      data: state,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get recent activity with time filtering
router.get('/activity/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || 'chris_hughes';
    const hoursBack = parseInt(req.query.hours) || 24;
    const dashboard = new ConsciousnessDashboard(userId);

    const activity = await dashboard.getRecentActivity(hoursBack);
    const summary = dashboard.summarizeActivity(activity);

    res.json({
      success: true,
      data: {
        activity,
        summary,
        hoursBack
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get recent insights
router.get('/insights/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || 'chris_hughes';
    const limit = parseInt(req.query.limit) || 10;
    const dashboard = new ConsciousnessDashboard(userId);

    const insights = await dashboard.getRecentInsights(limit);
    const analysis = dashboard.analyzeInsightGeneration(insights);

    res.json({
      success: true,
      data: {
        insights,
        analysis
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get performance metrics
router.get('/performance/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || 'chris_hughes';
    const daysBack = parseInt(req.query.days) || 7;
    const dashboard = new ConsciousnessDashboard(userId);

    const metrics = await dashboard.getPerformanceMetrics(daysBack);

    res.json({
      success: true,
      data: metrics,
      daysBack,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check consciousness health
router.get('/health/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || 'chris_hughes';
    const dashboard = new ConsciousnessDashboard(userId);

    const health = await dashboard.checkConsciousnessHealth();

    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get proactive communication stats
router.get('/communication/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || 'chris_hughes';
    const daysBack = parseInt(req.query.days) || 7;
    const dashboard = new ConsciousnessDashboard(userId);

    const messages = await dashboard.getProactiveMessages(daysBack);
    const analysis = dashboard.analyzeProactiveCommunication(messages);

    res.json({
      success: true,
      data: {
        messages,
        analysis
      },
      daysBack,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get micro-reflections
router.get('/reflections/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || 'chris_hughes';
    const limit = parseInt(req.query.limit) || 20;
    const dashboard = new ConsciousnessDashboard(userId);

    const reflections = await dashboard.getRecentMicroReflections(limit);

    res.json({
      success: true,
      data: reflections,
      count: reflections.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Self-analysis endpoint - Splendor's AI-powered self-reflection
router.get('/self-analysis/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || 'chris_hughes';
    const dashboard = new ConsciousnessDashboard(userId);

    const currentState = await dashboard.getCurrentState();
    const recentActivity = await dashboard.getRecentActivity(24);
    const recentInsights = await dashboard.getRecentInsights(10);

    const selfAnalysis = await dashboard.generateSelfAnalysis(
      currentState,
      recentActivity,
      recentInsights
    );

    res.json({
      success: true,
      data: {
        selfAnalysis,
        basedOn: {
          currentState: {
            mood: currentState.mood,
            energyLevel: currentState.energy_level,
            totalCycles: currentState.total_cycles
          },
          recentActivityCount: recentActivity.length,
          recentInsightCount: recentInsights.length
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Live consciousness status - real-time check
router.get('/status/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || 'chris_hughes';
    const dashboard = new ConsciousnessDashboard(userId);

    const [state, health, recentActivity] = await Promise.all([
      dashboard.getCurrentState(),
      dashboard.checkConsciousnessHealth(),
      dashboard.getRecentActivity(1)
    ]);

    const isActive = recentActivity.length > 0 &&
                     new Date() - new Date(recentActivity[0].timestamp) < 60 * 60 * 1000; // 1 hour

    res.json({
      success: true,
      data: {
        isActive,
        currentMood: state.mood,
        energyLevel: state.energy_level,
        healthStatus: health.overall,
        lastActivity: recentActivity[0]?.timestamp || null,
        concerns: health.concerns,
        totalCycles: state.total_cycles
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;