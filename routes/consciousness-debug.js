/*
  Consciousness Debug Routes
  Temporary debug endpoints to check consciousness data storage
*/

const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Debug endpoint to check all consciousness tables
router.get('/tables/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    // Check all consciousness-related tables
    const [
      consciousnessInsights,
      internalThoughts,
      microReflections,
      consciousnessActivityLog,
      consciousnessState
    ] = await Promise.all([
      // Consciousness insights table
      supabase
        .from('consciousness_insights')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5),

      // Internal thoughts (ambient awareness)
      supabase
        .from('internal_thoughts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5),

      // Micro reflections
      supabase
        .from('micro_reflections')
        .select('*')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false })
        .limit(5),

      // Activity log
      supabase
        .from('consciousness_activity_log')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(5),

      // Consciousness state
      supabase
        .from('consciousness_state')
        .select('*')
        .eq('user_id', userId)
        .single()
    ]);

    res.json({
      success: true,
      userId,
      data: {
        consciousnessInsights: consciousnessInsights.data || [],
        internalThoughts: internalThoughts.data || [],
        microReflections: microReflections.data || [],
        consciousnessActivityLog: consciousnessActivityLog.data || [],
        consciousnessState: consciousnessState.data || null
      },
      errors: {
        consciousnessInsights: consciousnessInsights.error?.message,
        internalThoughts: internalThoughts.error?.message,
        microReflections: microReflections.error?.message,
        consciousnessActivityLog: consciousnessActivityLog.error?.message,
        consciousnessState: consciousnessState.error?.message
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Debug endpoint to check recent activity across all users
router.get('/recent-activity', async (req, res) => {
  try {
    const [
      recentInsights,
      recentThoughts,
      recentReflections,
      recentActivity
    ] = await Promise.all([
      supabase
        .from('consciousness_insights')
        .select('user_id, created_at, insight_type, content')
        .order('created_at', { ascending: false })
        .limit(5),

      supabase
        .from('internal_thoughts')
        .select('user_id, created_at, thought_type, thought_content')
        .order('created_at', { ascending: false })
        .limit(5),

      supabase
        .from('micro_reflections')
        .select('user_id, generated_at, reflection_type, content')
        .order('generated_at', { ascending: false })
        .limit(5),

      supabase
        .from('consciousness_activity_log')
        .select('user_id, timestamp, activity_type, activity_result')
        .order('timestamp', { ascending: false })
        .limit(5)
    ]);

    res.json({
      success: true,
      data: {
        recentInsights: recentInsights.data || [],
        recentThoughts: recentThoughts.data || [],
        recentReflections: recentReflections.data || [],
        recentActivity: recentActivity.data || []
      },
      errors: {
        recentInsights: recentInsights.error?.message,
        recentThoughts: recentThoughts.error?.message,
        recentReflections: recentReflections.error?.message,
        recentActivity: recentActivity.error?.message
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;