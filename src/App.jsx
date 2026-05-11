import React, { useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Sphere, MeshDistortMaterial, Torus } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import OracleInterface from './components/OracleInterface'
import './App.css'

const NeuralCore = () => {
  const torusRef1 = useRef()
  const torusRef2 = useRef()
  const torusRef3 = useRef()
  const orbRef = useRef()

  useFrame((state) => {
    const t = state.clock.getElapsedTime()

    // Elliptical atomic orbits with varying speeds
    if (torusRef1.current) {
      torusRef1.current.rotation.x = t * 0.3
      torusRef1.current.rotation.y = t * 0.2
      torusRef1.current.rotation.z = t * 0.1
    }

    if (torusRef2.current) {
      torusRef2.current.rotation.x = t * 0.2
      torusRef2.current.rotation.y = -t * 0.3
      torusRef2.current.rotation.z = t * 0.25
    }

    if (torusRef3.current) {
      torusRef3.current.rotation.x = -t * 0.15
      torusRef3.current.rotation.y = t * 0.4
      torusRef3.current.rotation.z = -t * 0.1
    }

    // Orb floating animation
    if (orbRef.current) {
      orbRef.current.position.y = Math.sin(t * 0.8) * 0.1
      orbRef.current.rotation.y = t * 0.1
    }
  })

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} color="#4ff0b7" intensity={2} />
      <pointLight position={[-10, -10, -10]} color="#bf5af2" intensity={1} />

      {/* Central Neural Orb */}
      <Sphere ref={orbRef} args={[1.2, 64, 64]} scale={1.3}>
        <MeshDistortMaterial
          color="#00e5ff"
          speed={3}
          distort={0.6}
          radius={1}
          emissive="#4ff0b7"
          emissiveIntensity={0.8}
          transparent
          opacity={0.9}
        />
      </Sphere>

      {/* Elliptical Atomic Orbits */}
      <Torus
        ref={torusRef1}
        args={[2.5, 0.03, 16, 100]}
        scale={[1.6, 0.7, 1]}
        rotation={[Math.PI / 3, 0, 0]}
      >
        <meshStandardMaterial
          color="#00e5ff"
          emissive="#00e5ff"
          emissiveIntensity={3}
          transparent
          opacity={0.8}
        />
      </Torus>

      <Torus
        ref={torusRef2}
        args={[3.2, 0.02, 16, 100]}
        scale={[1.4, 0.8, 1]}
        rotation={[Math.PI / 6, Math.PI / 4, 0]}
      >
        <meshStandardMaterial
          color="#bf5af2"
          emissive="#bf5af2"
          emissiveIntensity={2}
          transparent
          opacity={0.6}
        />
      </Torus>

      <Torus
        ref={torusRef3}
        args={[4.0, 0.025, 16, 100]}
        scale={[1.8, 0.6, 1]}
        rotation={[-Math.PI / 4, 0, Math.PI / 6]}
      >
        <meshStandardMaterial
          color="#00f5d4"
          emissive="#00f5d4"
          emissiveIntensity={1.5}
          transparent
          opacity={0.4}
        />
      </Torus>
    </>
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