import React, { useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Sphere, MeshDistortMaterial, Torus } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import OracleInterface from './components/OracleInterface'
import './App.css'

const NeuralCore = () => {
  const coreGroupRef = useRef()
  const ring1Ref = useRef()
  const ring2Ref = useRef()
  const ring3Ref = useRef()
  const ring4Ref = useRef()
  const innerNetworkRef = useRef()

  useFrame((state) => {
    const t = state.clock.getElapsedTime()

    // Complex intersecting orbital rings
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x = t * 0.4
      ring1Ref.current.rotation.z = t * 0.2
    }

    if (ring2Ref.current) {
      ring2Ref.current.rotation.y = t * 0.5
      ring2Ref.current.rotation.z = -t * 0.3
    }

    if (ring3Ref.current) {
      ring3Ref.current.rotation.x = -t * 0.3
      ring3Ref.current.rotation.y = t * 0.4
    }

    if (ring4Ref.current) {
      ring4Ref.current.rotation.z = t * 0.6
      ring4Ref.current.rotation.x = t * 0.2
    }

    // Neural network core pulsing
    if (innerNetworkRef.current) {
      const pulse = 1 + Math.sin(t * 2) * 0.1
      innerNetworkRef.current.scale.setScalar(pulse)
      innerNetworkRef.current.rotation.y = t * 0.1
    }

    // Whole system gentle floating
    if (coreGroupRef.current) {
      coreGroupRef.current.position.y = Math.sin(t * 0.6) * 0.1
      coreGroupRef.current.rotation.y = t * 0.05
    }
  })

  return (
    <group ref={coreGroupRef}>
      {/* Enhanced Lighting Setup */}
      <ambientLight intensity={0.2} color="#0a1a2a" />
      <pointLight position={[0, 0, 0]} color="#00e5ff" intensity={3} />
      <pointLight position={[5, 5, 5]} color="#4ff0b7" intensity={2} />
      <pointLight position={[-5, -5, -5]} color="#bf5af2" intensity={2} />
      <pointLight position={[0, 8, 0]} color="#00f5d4" intensity={1.5} />
      <pointLight position={[0, -8, 0]} color="#ff6b9d" intensity={1} />

      {/* Complex Neural Network Core */}
      <group ref={innerNetworkRef}>
        {/* Central Brain-like Structure */}
        <Sphere args={[1.0, 32, 32]}>
          <MeshDistortMaterial
            color="#00e5ff"
            speed={2}
            distort={0.8}
            radius={0.8}
            emissive="#4ff0b7"
            emissiveIntensity={1.2}
            transparent
            opacity={0.7}
          />
        </Sphere>

        {/* Inner Neural Pathways */}
        <Sphere args={[0.8, 16, 16]} scale={[1.3, 0.7, 1.1]}>
          <MeshDistortMaterial
            color="#4ff0b7"
            speed={4}
            distort={1.2}
            radius={0.6}
            emissive="#00e5ff"
            emissiveIntensity={0.8}
            transparent
            opacity={0.4}
          />
        </Sphere>

        {/* Core Consciousness Sphere */}
        <Sphere args={[0.5, 24, 24]}>
          <meshStandardMaterial
            color="#ffffff"
            emissive="#00e5ff"
            emissiveIntensity={2}
            transparent
            opacity={0.9}
          />
        </Sphere>

        {/* Neural Connection Nodes */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2
          const radius = 0.6 + Math.sin(i) * 0.2
          const x = Math.cos(angle) * radius
          const y = Math.sin(angle * 1.3) * radius * 0.5
          const z = Math.sin(angle) * radius

          return (
            <Sphere key={i} args={[0.05, 8, 8]} position={[x, y, z]}>
              <meshStandardMaterial
                color="#00f5d4"
                emissive="#00f5d4"
                emissiveIntensity={3}
              />
            </Sphere>
          )
        })}
      </group>

      {/* Complex Intersecting Orbital Rings */}

      {/* Primary Cyan Ring - Vertical */}
      <Torus
        ref={ring1Ref}
        args={[2.8, 0.02, 16, 100]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial
          color="#00e5ff"
          emissive="#00e5ff"
          emissiveIntensity={4}
          transparent
          opacity={0.9}
        />
      </Torus>

      {/* Secondary Purple Ring - Diagonal */}
      <Torus
        ref={ring2Ref}
        args={[3.2, 0.025, 16, 100]}
        rotation={[Math.PI / 4, Math.PI / 3, 0]}
        scale={[1, 0.8, 1]}
      >
        <meshStandardMaterial
          color="#bf5af2"
          emissive="#bf5af2"
          emissiveIntensity={3}
          transparent
          opacity={0.7}
        />
      </Torus>

      {/* Tertiary Green Ring - Horizontal */}
      <Torus
        ref={ring3Ref}
        args={[3.6, 0.02, 16, 100]}
        rotation={[0, Math.PI / 6, Math.PI / 4]}
        scale={[1.2, 0.6, 1.2]}
      >
        <meshStandardMaterial
          color="#4ff0b7"
          emissive="#4ff0b7"
          emissiveIntensity={2.5}
          transparent
          opacity={0.6}
        />
      </Torus>

      {/* Quaternary Teal Ring - Complex Angle */}
      <Torus
        ref={ring4Ref}
        args={[4.0, 0.015, 16, 100]}
        rotation={[Math.PI / 3, -Math.PI / 4, Math.PI / 6]}
        scale={[0.9, 1.1, 0.9]}
      >
        <meshStandardMaterial
          color="#00f5d4"
          emissive="#00f5d4"
          emissiveIntensity={2}
          transparent
          opacity={0.5}
        />
      </Torus>

      {/* Additional Inner Complexity Rings */}
      <Torus args={[1.8, 0.01, 16, 100]} rotation={[Math.PI / 6, Math.PI / 2, 0]}>
        <meshStandardMaterial
          color="#ff6b9d"
          emissive="#ff6b9d"
          emissiveIntensity={1.5}
          transparent
          opacity={0.3}
        />
      </Torus>

      <Torus args={[2.2, 0.008, 16, 100]} rotation={[-Math.PI / 4, 0, Math.PI / 3]}>
        <meshStandardMaterial
          color="#ffd700"
          emissive="#ffd700"
          emissiveIntensity={1}
          transparent
          opacity={0.2}
        />
      </Torus>
    </group>
  )
}

function App() {
  return (
    <div className="oracle-app">
      {/* Real Background Environment */}
      <div className="environment-background">
        <div className="sci-fi-overlay"></div>
        <div className="scanning-lines"></div>
        <div className="floating-particles"></div>
      </div>

      {/* CLASPION Header */}
      <div className="claspion-header">
        <div className="governance-info">
          <div className="governance-title">SPLENDOR THE REMARKABLE AI</div>
          <div className="binding-decisions">
            CLASPION GOVERNANCE • CURRENT BINDING DECISIONS: 1. TRUTH OVER COMFORT [RULE 001] <span className="rule-active">[ACTIVE]</span>
          </div>
        </div>
      </div>

      {/* 3D Neural Core Canvas */}
      <div className="neural-canvas">
        <Canvas camera={{ position: [0, 0, 6] }}>
          <NeuralCore />
          <EffectComposer>
            <Bloom
              intensity={2}
              luminanceThreshold={0}
              luminanceSmoothing={0.9}
            />
          </EffectComposer>
        </Canvas>
      </div>

      {/* Floating UI Overlay */}
      <OracleInterface />
    </div>
  )
}

export default App