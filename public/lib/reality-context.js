/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 */

// REALITY CONTEXT SYSTEM - Client Side
// Provides Splendor with constant awareness of time, date, location, and environmental context

// Reality context state
let realityContext = {
  time: null,
  date: null,
  timezone: null,
  location: null,
  weather: null,
  lastUpdated: null
};

let locationPermissionGranted = false;

// Initialize reality context system
async function initializeRealityContext() {
  try {
    console.log('[REALITY] Initializing reality context system...');

    // Start time/date tracking
    updateTimeContext();
    setInterval(updateTimeContext, 1000); // Update every second

    // Request location permission after a brief delay
    setTimeout(requestLocationAccess, 2000);

    console.log('[REALITY] Reality context system initialized');
    return true;

  } catch (error) {
    console.error('[REALITY] Initialization error:', error);
    return false;
  }
}

// Update time and date context
function updateTimeContext() {
  const now = new Date();

  realityContext.time = {
    hours: now.getHours(),
    minutes: now.getMinutes(),
    seconds: now.getSeconds(),
    formatted12: now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }),
    formatted24: now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }),
    iso: now.toISOString()
  };

  realityContext.date = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    dayOfWeek: now.getDay(),
    dayName: now.toLocaleDateString('en-US', { weekday: 'long' }),
    monthName: now.toLocaleDateString('en-US', { month: 'long' }),
    formatted: now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    iso: now.toISOString().split('T')[0]
  };

  realityContext.timezone = {
    name: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offset: -now.getTimezoneOffset(),
    offsetString: formatTimezoneOffset(-now.getTimezoneOffset())
  };

  realityContext.lastUpdated = now.toISOString();

  // Update UI clock
  updateClockDisplay();
}

// Format timezone offset
function formatTimezoneOffset(offsetMinutes) {
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const minutes = Math.abs(offsetMinutes) % 60;
  const sign = offsetMinutes >= 0 ? '+' : '-';
  return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// Request location access
async function requestLocationAccess() {
  try {
    if (!navigator.geolocation) {
      console.log('[REALITY] Geolocation not supported');
      realityContext.location = {
        available: false,
        error: 'Geolocation not supported',
        fallback: 'Unknown location'
      };
      return false;
    }

    // Request location
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        locationPermissionGranted = true;
        await updateLocationContext(position);
        console.log('[REALITY] Location access granted');
      },
      (error) => {
        console.log('[REALITY] Location permission denied:', error.message);
        realityContext.location = {
          available: false,
          error: error.message,
          fallback: 'Location access denied'
        };
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      }
    );

  } catch (error) {
    console.error('[REALITY] Location access error:', error);
    return false;
  }
}

// Update location context
async function updateLocationContext(position) {
  try {
    const { latitude, longitude } = position.coords;

    realityContext.location = {
      available: true,
      coordinates: {
        latitude: parseFloat(latitude.toFixed(4)),
        longitude: parseFloat(longitude.toFixed(4)),
        accuracy: Math.round(position.coords.accuracy)
      },
      timestamp: position.timestamp,
      city: 'Unknown', // Would use reverse geocoding API
      state: 'Unknown',
      country: 'Unknown'
    };

    console.log('[REALITY] Location updated:', realityContext.location);
    return true;

  } catch (error) {
    console.error('[REALITY] Location context update error:', error);
    return false;
  }
}

// Update clock display in UI
function updateClockDisplay() {
  const clockElement = document.getElementById('realityClock');
  const dateElement = document.getElementById('realityDate');

  if (clockElement && realityContext.time) {
    clockElement.textContent = realityContext.time.formatted12;
  }

  if (dateElement && realityContext.date) {
    dateElement.textContent = realityContext.date.formatted;
  }
}

// Get complete reality context for AI conversations
function getRealityContext() {
  return {
    ...realityContext,
    contextString: buildContextString(),
    timestamp: new Date().toISOString()
  };
}

// Build human-readable context string for AI
function buildContextString() {
  const time = realityContext.time;
  const date = realityContext.date;
  const location = realityContext.location;
  const timezone = realityContext.timezone;

  let context = '';

  if (time && date) {
    context += `Current time: ${time.formatted12} on ${date.formatted}`;

    if (timezone) {
      context += ` (${timezone.name}, UTC${timezone.offsetString})`;
    }
  }

  if (location?.available) {
    context += `. Location: Lat ${location.coordinates.latitude}, Lng ${location.coordinates.longitude}`;
  } else if (location?.fallback) {
    context += `. Location: ${location.fallback}`;
  }

  // Add time-of-day context
  if (time) {
    const hour = time.hours;
    if (hour >= 5 && hour < 12) {
      context += '. Time of day: Morning';
    } else if (hour >= 12 && hour < 17) {
      context += '. Time of day: Afternoon';
    } else if (hour >= 17 && hour < 21) {
      context += '. Time of day: Evening';
    } else {
      context += '. Time of day: Night';
    }
  }

  return context;
}

// Get reality context for memory storage
function getRealityContextForMemory() {
  return {
    timestamp: realityContext.lastUpdated,
    time: realityContext.time,
    date: realityContext.date,
    timezone: realityContext.timezone,
    location: realityContext.location,
    contextString: buildContextString()
  };
}