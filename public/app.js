/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// Global variables
let userId = null;
let isRecording = false;
let recognition = null;
let chatMessages, messageInput, sendButton, micButton, emptyState;

// Camera state
let cameraButton, cameraPreview, cameraPreviewWrap;
let cameraStream = null;
let cameraActive = false;
const captureCanvas = document.createElement('canvas');

// Voice playback state
let speakerButton;
let speakerActive = false;
let currentAudio = null;

// Helper functions
function getUserId() {
  let id = localStorage.getItem('splendor_user_id');
  if (!id) {
    id = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('splendor_user_id', id);
  }
  return id;
}

function getLastMessageDate() {
  const lastDate = localStorage.getItem('splendor_last_message');
  return lastDate ? new Date(lastDate) : null;
}

function setLastMessageDate() {
  localStorage.setItem('splendor_last_message', new Date().toISOString());
}

function isFirstMessageToday() {
  const now = new Date();
  const today = now.toDateString();
  const lastMessageToday = getLastMessageDate();

  if (!lastMessageToday) return true;

  const lastDateString = lastMessageToday.toDateString();
  return lastDateString !== today;
}

function adjustTextareaHeight() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

function hideEmptyState() {
  if (emptyState) {
    emptyState.style.display = 'none';
  }
}

function scrollToBottom() {
  setTimeout(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 100);
}

function appendMessage(sender, content) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message';

  const bubbleDiv = document.createElement('div');
  bubbleDiv.className = sender === 'splendor' ? 'splendor-message' : 'user-message';
  bubbleDiv.textContent = content;

  const timeDiv = document.createElement('div');
  timeDiv.className = 'message-time';
  timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  messageDiv.appendChild(bubbleDiv);
  messageDiv.appendChild(timeDiv);
  chatMessages.appendChild(messageDiv);

  scrollToBottom();
}

function showThinking() {
  const thinkingDiv = document.createElement('div');
  thinkingDiv.className = 'thinking-container';
  thinkingDiv.id = 'thinkingIndicator';

  const bubbleDiv = document.createElement('div');
  bubbleDiv.className = 'thinking';

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.className = 'thinking-dot';
    bubbleDiv.appendChild(dot);
  }

  thinkingDiv.appendChild(bubbleDiv);
  chatMessages.appendChild(thinkingDiv);

  scrollToBottom();
}

function hideThinking() {
  const thinking = document.getElementById('thinkingIndicator');
  if (thinking) {
    thinking.remove();
  }
}

async function fetchSplendorResponse(message, imageData = null) {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        userId: userId,
        imageData
      }),
    });

    const data = await response.json();

    if (data.error) {
      appendMessage('splendor', 'Something went wrong — try again in a moment.');
    } else {
      appendMessage('splendor', data.message);
      if (speakerActive) {
        playSpoken(data.message);
      }
    }
  } catch (error) {
    console.error('Chat error:', error);
    appendMessage('splendor', 'I\'m having trouble connecting right now — try again in a moment.');
  } finally {
    hideThinking();
    sendButton.disabled = false;
    messageInput.focus();
  }
}

function captureCameraFrame() {
  if (!cameraActive || !cameraStream || !cameraPreview) return null;
  try {
    const w = cameraPreview.videoWidth;
    const h = cameraPreview.videoHeight;
    if (!w || !h) return null;
    captureCanvas.width = w;
    captureCanvas.height = h;
    captureCanvas.getContext('2d').drawImage(cameraPreview, 0, 0, w, h);
    return captureCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  } catch (err) {
    console.error('captureCameraFrame error:', err);
    return null;
  }
}

function sendMessage() {
  const message = messageInput.value.trim();
  const imageData = captureCameraFrame();

  if (!message && !imageData) {
    console.log('No message or image to send');
    return;
  }

  console.log('Sending message:', message, imageData ? '(with image)' : '');

  appendMessage('user', message || (imageData ? '(image)' : ''));
  messageInput.value = '';
  adjustTextareaHeight();
  hideEmptyState();
  setLastMessageDate();

  showThinking();
  sendButton.disabled = true;

  fetchSplendorResponse(message, imageData);
}

async function toggleCamera() {
  if (!cameraButton || !cameraPreview || !cameraPreviewWrap) return;

  if (cameraActive) {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    cameraActive = false;
    cameraPreviewWrap.classList.remove('active');
    cameraButton.classList.remove('active');
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    appendMessage('splendor', 'This device does not expose a camera I can use.');
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    cameraPreview.srcObject = cameraStream;
    cameraActive = true;
    cameraPreviewWrap.classList.add('active');
    cameraButton.classList.add('active');
  } catch (err) {
    console.error('Camera error:', err);
    appendMessage('splendor', "I can't access the camera. Please check your browser permissions.");
    cameraActive = false;
  }
}

function toggleSpeaker() {
  speakerActive = !speakerActive;
  if (speakerButton) speakerButton.classList.toggle('active', speakerActive);
  if (!speakerActive && currentAudio) {
    try { currentAudio.pause(); } catch {}
    currentAudio = null;
  }
}

async function playSpoken(text) {
  try {
    const response = await fetch('/api/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    const data = await response.json();

    if (data.audio) {
      const audio = new Audio('data:audio/mpeg;base64,' + data.audio);
      currentAudio = audio;
      audio.play().catch(err => console.error('Audio playback failed:', err));
    } else if (data.fallback === 'browser_tts' && 'speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.0;
      utter.pitch = 1.0;
      window.speechSynthesis.speak(utter);
    }
  } catch (err) {
    console.error('Voice playback error:', err);
  }
}

function toggleVoiceInput() {
  console.log('Toggle voice input called');

  if (!recognition) {
    console.log('Voice recognition not supported');
    return;
  }

  if (isRecording) {
    recognition.stop();
    isRecording = false;
    micButton.classList.remove('listening');
    console.log('Stopped recording');
  } else {
    try {
      recognition.start();
      isRecording = true;
      micButton.classList.add('listening');
      console.log('Started recording');
    } catch (error) {
      console.error('Voice recognition start error:', error);
      isRecording = false;
      micButton.classList.remove('listening');
    }
  }
}

function initVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('');
      messageInput.value = transcript;
      adjustTextareaHeight();
    };

    recognition.onend = () => {
      isRecording = false;
      micButton.classList.remove('listening');
      // Auto-send if there's content
      if (messageInput.value.trim()) {
        setTimeout(() => sendMessage(), 500);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech error:', event.error);
      isRecording = false;
      micButton.classList.remove('listening');
    };

    console.log('Voice recognition initialized');
  } else {
    // Hide mic button if not supported
    micButton.style.display = 'none';
    console.log('Voice recognition not supported');
  }
}

async function checkMorningGreeting() {
  const now = new Date();
  const hour = now.getHours();

  // Check if it's morning (5am-10am) and first visit today
  if (hour >= 5 && hour <= 10 && isFirstMessageToday()) {
    try {
      const response = await fetch(`/api/chat/morning/${userId}`);
      const data = await response.json();

      if (data.message) {
        appendMessage('splendor', data.message);
        hideEmptyState();
      }
    } catch (error) {
      console.error('Morning greeting error:', error);
    }
  }
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing Splendor...');

  // Initialize global variables
  userId = getUserId();
  chatMessages = document.getElementById('chatMessages');
  messageInput = document.getElementById('messageInput');
  sendButton = document.getElementById('sendButton');
  micButton = document.getElementById('micButton');
  emptyState = document.getElementById('emptyState');
  cameraButton = document.getElementById('cameraButton');
  cameraPreview = document.getElementById('cameraPreview');
  cameraPreviewWrap = document.getElementById('cameraPreviewWrap');
  speakerButton = document.getElementById('speakerButton');

  console.log('Elements found:', {
    chatMessages: !!chatMessages,
    messageInput: !!messageInput,
    sendButton: !!sendButton,
    micButton: !!micButton,
    emptyState: !!emptyState,
    cameraButton: !!cameraButton,
    speakerButton: !!speakerButton
  });

  // Add event listeners
  if (sendButton) {
    sendButton.addEventListener('click', (e) => {
      console.log('Send button clicked');
      e.preventDefault();
      sendMessage();
    });
  }

  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        console.log('Enter key pressed');
        e.preventDefault();
        sendMessage();
      }
    });

    messageInput.addEventListener('input', () => {
      adjustTextareaHeight();
    });
  }

  if (micButton) {
    micButton.addEventListener('click', (e) => {
      console.log('Mic button clicked');
      e.preventDefault();
      toggleVoiceInput();
    });
  }

  if (cameraButton) {
    cameraButton.addEventListener('click', (e) => {
      e.preventDefault();
      toggleCamera();
    });
  }

  if (speakerButton) {
    speakerButton.addEventListener('click', (e) => {
      e.preventDefault();
      toggleSpeaker();
    });
  }

  // Trigger camera when user says "use your eyes"
  if (messageInput) {
    messageInput.addEventListener('input', () => {
      const v = messageInput.value.toLowerCase();
      if (!cameraActive && v.includes('use your eyes')) {
        toggleCamera();
      }
    });
  }

  // Initialize voice recognition
  initVoiceRecognition();

  // Check for morning greeting
  checkMorningGreeting();

  console.log('Splendor initialized successfully');
});

// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}