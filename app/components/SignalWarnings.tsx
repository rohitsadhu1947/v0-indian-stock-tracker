'use client'

import { getRiskBadgeColor } from '@/lib/signal-enhancer'

interface SignalWarning {
  type: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  message: string
  emoji: string
}

interface SignalSuggestion {
  type: string
  suggestion: string
  emoji: string
}

interface SignalWarningsProps {
  warnings: SignalWarning[]
  suggestions: SignalSuggestion[]
  riskLevel: string
  positionSizeMultiplier: number
  compact?: boolean
}

export function SignalWarnings({ 
  warnings, 
  suggestions, 
  riskLevel, 
  positionSizeMultiplier,
  compact = false 
}: SignalWarningsProps) {
  if (warnings.length === 0 && suggestions.length === 0) {
    return (
      <div className="text-xs text-green-600 flex items-center gap-1">
        ✅ No warnings
      </div>
    )
  }
  
  if (compact) {
    // Compact mode - just show badges
    return (
      <div className="flex flex-wrap gap-1">
        {/* Risk badge */}
        <span className={`text-xs px-1.5 py-0.5 rounded ${getRiskBadgeColor(riskLevel)}`}>
          {riskLevel === 'LOW' ? '🟢' : riskLevel === 'MEDIUM' ? '🟡' : riskLevel === 'HIGH' ? '🟠' : '🔴'} {riskLevel}
        </span>
        
        {/* Warning count */}
        {warnings.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700">
            ⚠️ {warnings.length}
          </span>
        )}
        
        {/* Position size if adjusted */}
        {positionSizeMultiplier !== 1.0 && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            positionSizeMultiplier < 1 ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'
          }`}>
            📊 {Math.round(positionSizeMultiplier * 100)}%
          </span>
        )}
      </div>
    )
  }
  
  // Full mode - show all details
  return (
    <div className="space-y-2 text-sm">
      {/* Risk Level Header */}
      <div className="flex items-center justify-between">
        <span className={`px-2 py-1 rounded text-xs font-medium ${getRiskBadgeColor(riskLevel)}`}>
          Risk: {riskLevel}
        </span>
        {positionSizeMultiplier !== 1.0 && (
          <span className={`text-xs ${positionSizeMultiplier < 1 ? 'text-yellow-600' : 'text-green-600'}`}>
            Suggested size: {Math.round(positionSizeMultiplier * 100)}% of normal
          </span>
        )}
      </div>
      
      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-500">Warnings:</div>
          {warnings.map((warning, i) => (
            <div 
              key={i}
              className={`text-xs p-2 rounded flex items-start gap-2 ${
                warning.severity === 'HIGH' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : warning.severity === 'MEDIUM'
                  ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                  : 'bg-gray-50 text-gray-600 border border-gray-200'
              }`}
            >
              <span>{warning.emoji}</span>
              <span>{warning.message}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-500">Suggestions:</div>
          {suggestions.map((suggestion, i) => (
            <div 
              key={i}
              className="text-xs p-2 rounded bg-blue-50 text-blue-700 border border-blue-200 flex items-start gap-2"
            >
              <span>{suggestion.emoji}</span>
              <span>{suggestion.suggestion}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Summary component for overall signal health
 */
export function SignalsSummary({ 
  totalWarnings,
  totalSuggestions,
  highRiskCount,
  totalSignals
}: {
  totalWarnings: number
  totalSuggestions: number
  highRiskCount: number
  totalSignals: number
}) {
  return (
    <div className="flex items-center gap-4 text-sm bg-gray-50 p-3 rounded-lg">
      <div className="flex items-center gap-1">
        <span className="text-gray-500">Signals:</span>
        <span className="font-medium">{totalSignals}</span>
      </div>
      
      {highRiskCount > 0 && (
        <div className="flex items-center gap-1 text-orange-600">
          <span>⚠️ High Risk:</span>
          <span className="font-medium">{highRiskCount}</span>
        </div>
      )}
      
      {totalWarnings > 0 && (
        <div className="flex items-center gap-1 text-yellow-600">
          <span>Warnings:</span>
          <span className="font-medium">{totalWarnings}</span>
        </div>
      )}
      
      {totalSuggestions > 0 && (
        <div className="flex items-center gap-1 text-blue-600">
          <span>💡 Tips:</span>
          <span className="font-medium">{totalSuggestions}</span>
        </div>
      )}
      
      {totalWarnings === 0 && highRiskCount === 0 && (
        <div className="flex items-center gap-1 text-green-600">
          <span>✅ All clear</span>
        </div>
      )}
    </div>
  )
}
