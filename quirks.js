const debug = require('debug')('signalk:n2k-signalk:quirks')

/**
 * Opt-in workarounds for known device misbehaviour.
 *
 * Names match canboat / canboatjs (`--quirk` / `Quirk` enum). Every quirk is
 * off by default: enabling one will happily "correct" data that was never
 * wrong, which is what happens when you replay an old capture.
 */

/** One GPS rollover epoch: 1024 weeks, in days. */
const GPS_ROLLOVER_DAYS = 7168

/**
 * Largest day count that is still a date rather than a sentinel
 * (0xfffd..0xffff are Unknown / Out of range / Reserved) — 2149-06-03.
 */
const MAX_DATE_DAY = 0xfffc

/**
 * Floor for the reference day. A boat computer without an RTC comes up
 * believing it is 1970 and gets its clock from the GPS we are correcting,
 * so the system clock alone is not a usable reference. 2026-01-01; snapping
 * to the nearest epoch tolerates a reference that is off by up to ~9.8 years.
 */
const MIN_REFERENCE_DAY = 20454

const MS_PER_DAY = 86400 * 1000

const PGN_GNSS_POSITION_DATA = 129029
const PGN_TIME_AND_DATE = 129033
const PGN_SYSTEM_TIME = 126992

/**
 * @typedef {object} QuirkParameter
 * @property {string} name
 * @property {'boolean'|'number'|'string'} type
 * @property {string} title
 * @property {string} [description]
 * @property {*} [default]
 * @property {number} [minimum]
 * @property {number} [maximum]
 */

/**
 * @typedef {object} QuirkDefinition
 * @property {string} id           canboatjs / canboat quirk name (kebab-case)
 * @property {string} title
 * @property {string} description
 * @property {boolean} [defaultEnabled]
 * @property {QuirkParameter[]} [parameters]
 */

/** @type {QuirkDefinition[]} */
const KNOWN_QUIRKS = [
  {
    id: 'gps-rollover',
    title: 'GPS week rollover',
    description:
      'Correct GNSS dates from a receiver that never learned about the GPS 1024-week rollover and reports one or two epochs in the past. Applies to PGN 129029, 129033, and 126992 when its source is GPS. Do not enable when replaying a pre-2019 capture: the whole log will be moved forward by twenty years.',
    defaultEnabled: false,
    parameters: []
  }
]

function extraQuirksFromCanboat () {
  try {
    const { Quirk } = require('@canboat/canboatjs')
    if (!Quirk || typeof Quirk !== 'object') {
      return []
    }
    const knownIds = new Set(KNOWN_QUIRKS.map(q => q.id))
    return Object.keys(Quirk)
      .filter(
        key => typeof Quirk[key] === 'string' && !knownIds.has(Quirk[key])
      )
      .map(key => ({
        id: Quirk[key],
        title: Quirk[key],
        description: `canboatjs quirk: ${Quirk[key]}`,
        defaultEnabled: false,
        parameters: []
      }))
  } catch (err) {
    debug('canboatjs Quirk enum not available: %s', err.message)
    return []
  }
}

function knownQuirks () {
  return KNOWN_QUIRKS.concat(extraQuirksFromCanboat())
}

function parameterSchema (parameter) {
  const property = {
    type: parameter.type,
    title: parameter.title
  }
  if (parameter.description) {
    property.description = parameter.description
  }
  if (typeof parameter.default !== 'undefined') {
    property.default = parameter.default
  }
  if (typeof parameter.minimum === 'number') {
    property.minimum = parameter.minimum
  }
  if (typeof parameter.maximum === 'number') {
    property.maximum = parameter.maximum
  }
  return property
}

function quirkSettingSchema (definition) {
  const properties = {
    enabled: {
      type: 'boolean',
      title: 'Enable',
      default: Boolean(definition.defaultEnabled)
    }
  }
  const parameters = definition.parameters || []
  parameters.forEach(parameter => {
    properties[parameter.name] = parameterSchema(parameter)
  })

  return {
    type: 'object',
    title: definition.title,
    description: definition.description,
    properties
  }
}

/**
 * JSON Schema for the plugin / connection quirks settings section.
 * Each quirk is an object with an `enabled` toggle and any parameters
 * that quirk expects.
 */
function schema () {
  const properties = {}
  knownQuirks().forEach(definition => {
    properties[definition.id] = quirkSettingSchema(definition)
  })
  return {
    type: 'object',
    properties: {
      quirks: {
        type: 'object',
        title: 'Quirks',
        description:
          'Optional workarounds for known NMEA 2000 device misbehaviour. Every quirk is off by default.',
        properties
      }
    }
  }
}

function uiSchema () {
  return {
    quirks: {
      'ui:field': 'collapsible',
      collapse: {
        field: 'ObjectField',
        wrapClassName: 'panel-group'
      }
    }
  }
}

function isEnabledValue (value) {
  return value === true || (value && typeof value === 'object' && value.enabled)
}

/**
 * Convert plugin / mapper settings into the string list canboatjs FromPgn
 * expects: `new FromPgn({ quirks: ['gps-rollover'] })`.
 *
 * Accepts:
 * - `['gps-rollover']`
 * - `{ quirks: ['gps-rollover'] }`
 * - `{ quirks: { 'gps-rollover': { enabled: true, ...params } } }`
 * - `{ 'gps-rollover': { enabled: true } }`
 */
function toCanboatQuirks (config) {
  if (!config) {
    return []
  }
  if (Array.isArray(config)) {
    return config.filter(id => typeof id === 'string')
  }
  if (Array.isArray(config.quirks)) {
    return config.quirks.filter(id => typeof id === 'string')
  }

  const settings =
    config.quirks && typeof config.quirks === 'object' ? config.quirks : config

  const enabled = []
  knownQuirks().forEach(definition => {
    if (isEnabledValue(settings[definition.id])) {
      enabled.push(definition.id)
    }
  })
  return enabled
}

/**
 * Parameter bag for quirks that take extra options, keyed by quirk id.
 * `enabled` is stripped; only declared parameter names are copied.
 */
function toQuirkParameters (config) {
  if (!config || Array.isArray(config) || Array.isArray(config.quirks)) {
    return {}
  }
  const settings =
    config.quirks && typeof config.quirks === 'object' ? config.quirks : config
  const parameters = {}
  knownQuirks().forEach(definition => {
    const value = settings[definition.id]
    if (!isEnabledValue(value) || typeof value !== 'object') {
      return
    }
    const declared = (definition.parameters || []).map(p => p.name)
    if (declared.length === 0) {
      return
    }
    const collected = {}
    declared.forEach(name => {
      if (typeof value[name] !== 'undefined') {
        collected[name] = value[name]
      }
    })
    if (Object.keys(collected).length > 0) {
      parameters[definition.id] = collected
    }
  })
  return parameters
}

function toCanboatOptions (config) {
  const quirks = toCanboatQuirks(config)
  const quirkParameters = toQuirkParameters(config)
  const options = { quirks }
  if (Object.keys(quirkParameters).length > 0) {
    options.quirkParameters = quirkParameters
  }
  return options
}

function isQuirkEnabled (quirks, quirkId) {
  if (Array.isArray(quirks)) {
    return quirks.indexOf(quirkId) !== -1
  }
  return toCanboatQuirks(quirks).indexOf(quirkId) !== -1
}

function referenceDay (nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now()
  return Math.max(Math.floor(now / MS_PER_DAY), MIN_REFERENCE_DAY)
}

function dateStringToDays (dateStr) {
  if (typeof dateStr !== 'string') {
    return null
  }
  const parts = dateStr.split(/[.-]/).map(Number)
  if (parts.length < 3 || parts.some(n => !Number.isFinite(n))) {
    return null
  }
  return Math.round(Date.UTC(parts[0], parts[1] - 1, parts[2]) / MS_PER_DAY)
}

function daysToDateString (days, separator) {
  const dt = new Date(days * MS_PER_DAY)
  const year = dt.getUTCFullYear()
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const day = String(dt.getUTCDate()).padStart(2, '0')
  return `${year}${separator}${month}${separator}${day}`
}

function dateSeparator (dateStr) {
  return dateStr.indexOf('.') !== -1 ? '.' : '-'
}

/**
 * Snap a date (days since 1970-01-01) to the GPS rollover epoch nearest
 * `reference`. Same arithmetic canboatjs uses on the raw DATE field.
 */
function correctedGpsDate (days, reference) {
  const ref = typeof reference === 'number' ? reference : referenceDay()
  const behind = Math.max(ref - days, 0)
  const epochs = Math.floor(
    (behind + GPS_ROLLOVER_DAYS / 2) / GPS_ROLLOVER_DAYS
  )
  if (epochs === 0) {
    return days
  }
  const corrected = days + epochs * GPS_ROLLOVER_DAYS
  return corrected > MAX_DATE_DAY ? days : corrected
}

function correctGpsDateString (dateStr, reference) {
  const days = dateStringToDays(dateStr)
  if (days === null) {
    return dateStr
  }
  const corrected = correctedGpsDate(days, reference)
  if (corrected === days) {
    return dateStr
  }
  return daysToDateString(corrected, dateSeparator(dateStr))
}

function pgnNumber (n2k) {
  return Number(n2k && n2k.pgn)
}

function gpsSource (n2k) {
  const fields = n2k && n2k.fields
  if (!fields) {
    return undefined
  }
  return fields.source !== undefined ? fields.source : fields.Source
}

function shouldCorrectGpsDate (n2k) {
  const pgn = pgnNumber(n2k)
  if (pgn === PGN_GNSS_POSITION_DATA || pgn === PGN_TIME_AND_DATE) {
    return true
  }
  if (pgn === PGN_SYSTEM_TIME) {
    const source = gpsSource(n2k)
    return source === 'GPS' || source === 0
  }
  return false
}

function dateFieldName (fields) {
  if (!fields) {
    return null
  }
  if (typeof fields.date !== 'undefined') {
    return 'date'
  }
  if (typeof fields.Date !== 'undefined') {
    return 'Date'
  }
  return null
}

/**
 * Apply enabled quirks to a decoded NMEA 2000 message. Returns a new
 * object when a field changes, otherwise the original `n2k`.
 *
 * GPS rollover uses the same nearest-epoch snap as canboatjs, so running
 * both (canboatjs at decode time, n2k-signalk at mapping time) is a no-op
 * on a date that is already in the current epoch.
 */
function applyQuirksToN2k (n2k, quirks, reference) {
  if (!n2k || !isQuirkEnabled(quirks, 'gps-rollover')) {
    return n2k
  }
  if (!shouldCorrectGpsDate(n2k)) {
    return n2k
  }
  const field = dateFieldName(n2k.fields)
  if (!field) {
    return n2k
  }
  const original = n2k.fields[field]
  const corrected = correctGpsDateString(original, reference)
  if (corrected === original) {
    return n2k
  }
  debug('gps-rollover %s %s -> %s', n2k.pgn, original, corrected)
  return {
    ...n2k,
    fields: {
      ...n2k.fields,
      [field]: corrected
    }
  }
}

module.exports = {
  GPS_ROLLOVER_DAYS,
  MAX_DATE_DAY,
  MIN_REFERENCE_DAY,
  KNOWN_QUIRKS,
  knownQuirks,
  quirkSettingSchema,
  schema,
  uiSchema,
  toCanboatQuirks,
  toQuirkParameters,
  toCanboatOptions,
  isQuirkEnabled,
  referenceDay,
  dateStringToDays,
  correctedGpsDate,
  correctGpsDateString,
  applyQuirksToN2k
}
