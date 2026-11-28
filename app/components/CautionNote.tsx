import React from 'react'
import { cautionText, type Caution } from '@/lib/positional/caution'

/** A small amber line under a stock's name when it has a split or bonus caution. */
export default function CautionNote({ caution }: { caution: Caution | undefined }) {
  if (!caution) return null
  return (
    <div style={{ color: '#fbbf24', fontSize: '0.8em', fontWeight: 400, whiteSpace: 'normal', maxWidth: 320, marginTop: 2 }}>
      Caution: {cautionText(caution)}
    </div>
  )
}
