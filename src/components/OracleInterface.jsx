import React, { useState, useRef, useEffect } from 'react'
import MemoryCard from './MemoryCard'
import CognitivePulse from './CognitivePulse'
import './OracleInterface.css'

const OracleInterface = () => {
  const [message, setMessage] = useState('')
  const [response, setResponse] = useState("Christopher, I remember the details of our memory rebuild plan because you told me on May 9, 2026, during our conversation about data integrity. Is the new architecture meeting your expectations for transparency and structured context?")
  const [isRecording, setIsRecording] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [pulseEvents, setPulseEvents] = useState([
    'micro_reflection in progress...',
    'pinecone_index_sync active...',
    'conflict_check passed...',
    'resolution scope: broad',
    'thought_cycle_tree:',
    '→ cycle_id 3',
    '→ parent_id 2',
    '→ parent_id 3'
  ])

  const fileInputRef = useRef(null)
  const cameraVideoRef = useRef(null)
  const recognitionRef = useRef(null)
  const mediaStreamRef = useRef(null)

  useEffect(() => {
    // Initialize voice recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = false
      recognitionRef.current.lang = 'en-US'

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        setMessage(transcript)
        addPulseEvent('voice_input_processed')
        setIsRecording(false)
      }

      recognitionRef.current.onerror = () => {
        setIsRecording(false)
      }

      recognitionRef.current.onend = () => {
        setIsRecording(false)
      }
    }

    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const addPulseEvent = (eventType) => {
    setPulseEvents(prev => [
      `${eventType.replace(/_/g, ' ')}...`,
      ...prev.slice(0, 19)
    ])
  }

  const handleSendMessage = async () => {
    if (!message.trim()) return

    const currentMessage = message
    setMessage('')
    addPulseEvent('message_processing')

    try {
      const response = await fetch('/api/enhanced/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: currentMessage,
          include_memory: true,
          include_consciousness: true
        }),
        credentials: 'same-origin'
      })

      if (response.ok) {
        const data = await response.json()
        setResponse(data.response)
        addPulseEvent('response_generated')

        if (voiceEnabled && data.response) {
          speak(data.response)
        }
      } else {
        throw new Error('Chat API error')
      }
    } catch (error) {
      console.error('Chat error:', error)
      setResponse('I apologize, but I encountered an error processing your message. Please try again.')
      addPulseEvent('chat_error_occurred')
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const toggleVoiceRecognition = () => {
    if (!recognitionRef.current) {
      alert('Voice recognition not supported in this browser')
      return
    }

    if (isRecording) {
      recognitionRef.current.stop()
      setIsRecording(false)
    } else {
      recognitionRef.current.start()
      setIsRecording(true)
      addPulseEvent('voice_recognition_active')
    }
  }

  const toggleVoiceOutput = () => {
    setVoiceEnabled(!voiceEnabled)
    addPulseEvent(voiceEnabled ? 'text_to_speech_disabled' : 'text_to_speech_enabled')
  }

  const speak = (text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.9
      utterance.pitch = 1.0
      utterance.volume = 0.8
      speechSynthesis.speak(utterance)
      addPulseEvent('speech_synthesis_active')
    }
  }

  const handleFileUpload = async (file) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    addPulseEvent('image_file_upload_processing')

    const formData = new FormData()
    formData.append('image', file)
    formData.append('message', `[Image uploaded via file upload]`)

    try {
      const response = await fetch('/api/enhanced/chat', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin'
      })

      if (response.ok) {
        const data = await response.json()
        setResponse(data.response)
        addPulseEvent('image_analysis_complete')
      } else {
        throw new Error('Upload failed')
      }
    } catch (error) {
      console.error('Upload error:', error)
      addPulseEvent('image_upload_failed')
    }
  }

  const toggleCamera = async () => {
    if (cameraActive) {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
        mediaStreamRef.current = null
      }
      setCameraActive(false)
      addPulseEvent('camera_stream_closed')
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' }
        })
        mediaStreamRef.current = stream
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream
        }
        setCameraActive(true)
        addPulseEvent('camera_stream_active')
      } catch (error) {
        console.error('Camera error:', error)
        alert('Camera access denied or unavailable')
      }
    }
  }

  const capturePhoto = () => {
    if (!cameraVideoRef.current || !mediaStreamRef.current) return

    const canvas = document.createElement('canvas')
    canvas.width = cameraVideoRef.current.videoWidth
    canvas.height = cameraVideoRef.current.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(cameraVideoRef.current, 0, 0)

    canvas.toBlob(blob => {
      handleFileUpload(blob)
    }, 'image/jpeg', 0.8)

    toggleCamera() // Close camera after capture
  }

  return (
    <>
      {/* Provenance Stream - Left */}
      <div className="provenance-panel">
        <div className="panel-header">
          <div className="panel-title">PROVENANCE STREAM</div>
          <div className="panel-subtitle">Memory Verification & Source Tracking</div>
        </div>
        <div className="memory-cards">
          <MemoryCard
            date="2026-05-09"
            type="USER_STATED"
            reference="image_8.png"
            warning="Caution on inferred glow for an inferred memory is common"
          />
          <MemoryCard
            date="2026-05-09"
            type="VERIFIED_FACT"
            reference="image_9.png"
            warning="Caution glow for caution warnify an inferred memory context"
          />
        </div>
      </div>

      {/* Cognitive Pulse - Right */}
      <div className="cognitive-panel">
        <div className="panel-header">
          <div className="panel-title">COGNITIVE PULSE</div>
          <div className="panel-subtitle">Live System Events</div>
        </div>
        <CognitivePulse events={pulseEvents} />
      </div>

      {/* Conversation Interface - Bottom */}
      <div className="conversation-console">
        <div className="response-display">
          {response}
        </div>

        <div className="input-system">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            className="message-input"
            placeholder=""
          />

          <div className="control-buttons">
            <button
              className={`control-btn mic-btn ${isRecording ? 'active' : ''}`}
              onClick={toggleVoiceRecognition}
              title="Voice input"
            >
              🎤
            </button>

            <button
              className="control-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Upload file"
            >
              📎
            </button>

            <button
              className={`control-btn ${cameraActive ? 'active' : ''}`}
              onClick={toggleCamera}
              title="Camera"
            >
              📷
            </button>

            <button
              className={`control-btn ${voiceEnabled ? 'active' : ''}`}
              onClick={toggleVoiceOutput}
              title="Text to speech"
            >
              🔊
            </button>
          </div>
        </div>
      </div>

      {/* Hidden Elements */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])}
        accept="image/*"
        style={{ display: 'none' }}
      />

      {/* Camera Preview */}
      {cameraActive && (
        <div className="camera-preview">
          <video
            ref={cameraVideoRef}
            autoPlay
            playsInline
            muted
            className="camera-video"
          />
          <div className="camera-controls">
            <button className="capture-btn" onClick={capturePhoto}>
              📸
            </button>
            <button className="close-camera-btn" onClick={toggleCamera}>
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default OracleInterface