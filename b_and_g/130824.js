// Not all values can be mapped to the current SignalK schema

module.exports = [
  /*
  {
    source: 'Course',
    node: 'navigation.'
  },
  {
    source: 'DR Bearing',
    node: 'navigation.'
  },
  {
    source: 'DR Distance',
    node: 'navigation.'
  },
  */
  {
    source: 'Heading on opposite Tack (True)',
    node: 'performance.tackTrue'
  },
  {
    source: 'Leeway Angle',
    node: 'navigation.leewayAngle'
  },
  {
    source: 'Optimum Wind Angle',
    node: 'performance.beatAngle'
  },
  {
    source: 'Polar boat speed',
    node: 'performance.polarSpeed'
  },
  {
    source: 'Target TWA',
    node: 'performance.targetAngle'
  },
  {
    source: 'Trip time',
    node: 'navigation.trip.lastReset'
  },
  /*
  {
    source: 'VMG performance',
    node: ''
  },
  */
  {
    source: 'Velocity Made Good',
    node: 'performance.velocityMadeGood'
  },
  {
    source: 'Wind Angle to mast',
    node: 'navigation.log'
  },
  {
    source: 'Polar performance',
    node: 'performance.polarSpeedRatio'
  },
  /*
  {
    source: 'Opposite tack COG',
    node: 'navigation.'
  },
  */
  {
    source: 'Opposite tack target heading',
    node: 'performance.tackTrue'
  },
  /*
  {
    source: 'Average True Wind Direction',
    node: 'navigation.log'
  },
  {
    source: 'Wind Phase',
    node: 'navigation.log'
  },
  {
    source: 'Wind Lift',
    node: 'navigation.log'
  }
  */
]
