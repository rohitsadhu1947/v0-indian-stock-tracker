'use client'

import React from 'react'
import { ErrorBoundary } from './ErrorBoundary'

interface Props {
  tabName: string
  children: React.ReactNode
}

export function TabErrorBoundary({ tabName, children }: Props) {
  return (
    <ErrorBoundary
      fallback={
        <div style={{
          padding: '40px 24px',
          textAlign: 'center',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          margin: '20px 0',
        }}>
          <div style={{ fontSize: '2em', marginBottom: '12px' }}>⚠️</div>
          <strong style={{ color: '#ef4444', fontSize: '1.1em' }}>
            {tabName} failed to load
          </strong>
          <p style={{ marginTop: '8px', opacity: 0.7, fontSize: '0.9em' }}>
            This tab encountered an error. Other tabs are unaffected.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '16px',
              padding: '8px 20px',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '6px',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Reload Page
          </button>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}
