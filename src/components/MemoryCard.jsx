import React from 'react'
import './MemoryCard.css'

const MemoryCard = ({ date, type, reference, warning }) => {
  return (
    <div className="memory-card">
      <div className="card-header">
        <span>Memory Cards</span>
        <span>#{reference}</span>
      </div>
      <div className="card-content">
        Provenance {date}
      </div>
      <div className="card-metadata">
        Source: Conversation {date}<br />
        Type: {type}<br />
        Type: VERIFIED_FACT
      </div>
      {warning && (
        <div className="warning-flag">
          ⚠ Warning: {warning}
        </div>
      )}
    </div>
  )
}

export default MemoryCard